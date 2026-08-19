//go:build windows || darwin

// This file implements the local TOTP/HOTP authenticator backend under
// /api/v1/uh/totp/*.
//
// The design prototype this replaces computed TOTP codes in the BROWSER,
// with WebCrypto, from a secret held in localStorage. That is exactly the
// part this file exists to remove: a pairing secret is a credential, and a
// credential does not belong in localStorage, in an export, or in a log --
// it belongs in the operating system's own credential vault. Every secret
// this file touches goes straight to store.SecretStore (Windows Credential
// Manager / macOS keychain -- see app/store/secrets.go) under
// "totp/<accountId>", which lands as "MaterialOllama/totp/<accountId>" in
// the underlying store (see secrets_windows.go's credentialTarget and
// secrets_darwin.go's matching service name). The secret is never written
// to this file's own metadata JSON, never logged, and never echoed back in
// an HTTP response -- except the one explicit, documented exception at
// totpPairingURI, which IS a secret reveal by design (that's how a QR code
// hands a pairing secret to an authenticator app) and is the one-time
// pairing reveal the shared refusal contract carves out.
//
// Codes are computed entirely server-side: RFC 6238 TOTP layered over RFC
// 4226 HOTP, in hotpCode/totpCodeAt below, supporting HMAC-SHA1/SHA256/
// SHA512 and 6-8 digits at an arbitrary period, defaulting to SHA1/6/30
// because that is what the world actually issues. The implementation is
// checked directly against every published test vector in RFC 6238
// Appendix B (see totp_test.go) rather than assumed correct: an
// authenticator that is subtly wrong produces codes that are silently
// rejected everywhere, with no error anywhere to explain why.
package ui

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/sha512"
	"encoding/base32"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"hash"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/ollama/ollama/app/store"
)

// --- RFC 4226 HOTP / RFC 6238 TOTP core -------------------------------------

const (
	totpDefaultAlgorithm = "SHA1"
	totpDefaultDigits    = 6
	totpDefaultPeriod    = 30

	totpMinDigits = 6
	totpMaxDigits = 8

	totpMinPeriod = 1
	totpMaxPeriod = 300

	totpMaxNameLen = 120
	// totpSecretBytes is RFC 4226's recommended HOTP key length (160 bits).
	totpSecretBytes  = 20
	totpAccountLimit = 200

	totpIssuer = "Material Ollama"
)

// totpHashNew resolves an algorithm name (case-insensitively; "" means the
// default) to the hash constructor HOTP's HMAC step needs. Only the three
// algorithms real provisioning URIs and authenticator apps actually use are
// supported -- an unrecognized value is rejected rather than silently
// falling back to SHA1, since that fallback is exactly the kind of
// "confidently wrong" mismatch this file exists to avoid.
func totpHashNew(algorithm string) (func() hash.Hash, error) {
	switch strings.ToUpper(strings.TrimSpace(algorithm)) {
	case "", totpDefaultAlgorithm:
		return sha1.New, nil
	case "SHA256":
		return sha256.New, nil
	case "SHA512":
		return sha512.New, nil
	default:
		return nil, fmt.Errorf("unsupported TOTP algorithm %q (supported: SHA1, SHA256, SHA512)", algorithm)
	}
}

// hotpCode implements RFC 4226 HOTP: HOTP(K, C) = Truncate(HMAC-H(K, C)) mod
// 10^digits, using the standard dynamic-truncation algorithm from RFC 4226
// sections 5.3-5.4.
func hotpCode(secret []byte, counter uint64, digits int, algorithm string) (string, error) {
	newHash, err := totpHashNew(algorithm)
	if err != nil {
		return "", err
	}
	if digits < totpMinDigits || digits > totpMaxDigits {
		return "", fmt.Errorf("digits must be between %d and %d", totpMinDigits, totpMaxDigits)
	}
	if len(secret) == 0 {
		return "", errors.New("secret must not be empty")
	}

	var counterBytes [8]byte
	binary.BigEndian.PutUint64(counterBytes[:], counter)

	mac := hmac.New(newHash, secret)
	mac.Write(counterBytes[:])
	sum := mac.Sum(nil)

	// Dynamic truncation (RFC 4226 section 5.3): take the low nibble of the
	// last byte as an offset into the HMAC output, then read four bytes
	// from there as a 31-bit big-endian integer (the top bit of the first
	// byte is masked off to keep the result positive across languages
	// whose native integer type is signed).
	offset := sum[len(sum)-1] & 0x0f
	truncated := (uint32(sum[offset]&0x7f) << 24) |
		(uint32(sum[offset+1]) << 16) |
		(uint32(sum[offset+2]) << 8) |
		uint32(sum[offset+3])

	mod := uint32(1)
	for range digits {
		mod *= 10
	}
	return fmt.Sprintf("%0*d", digits, truncated%mod), nil
}

// totpCodeAt implements RFC 6238 TOTP: HOTP(K, floor((T - T0)/X)) with T0=0
// and X=period seconds.
func totpCodeAt(secret []byte, at time.Time, period, digits int, algorithm string) (string, error) {
	if period < totpMinPeriod || period > totpMaxPeriod {
		return "", fmt.Errorf("period must be between %d and %d seconds", totpMinPeriod, totpMaxPeriod)
	}
	counter := uint64(at.Unix() / int64(period))
	return hotpCode(secret, counter, digits, algorithm)
}

// normalizeTOTPParams applies the SHA1/6/30 defaults for any zero-valued
// field, then validates the result. It never silently clamps an
// out-of-range explicit value -- an invalid digits/period/algorithm is
// rejected outright, since a silently "corrected" account would compute
// codes the caller never asked for and never sees the correction.
func normalizeTOTPParams(algorithm string, digits, period int) (string, int, int, error) {
	algorithm = strings.ToUpper(strings.TrimSpace(algorithm))
	if algorithm == "" {
		algorithm = totpDefaultAlgorithm
	}
	if _, err := totpHashNew(algorithm); err != nil {
		return "", 0, 0, err
	}

	if digits == 0 {
		digits = totpDefaultDigits
	}
	if digits < totpMinDigits || digits > totpMaxDigits {
		return "", 0, 0, fmt.Errorf("digits must be between %d and %d", totpMinDigits, totpMaxDigits)
	}

	if period == 0 {
		period = totpDefaultPeriod
	}
	if period < totpMinPeriod || period > totpMaxPeriod {
		return "", 0, 0, fmt.Errorf("period must be between %d and %d seconds", totpMinPeriod, totpMaxPeriod)
	}

	return algorithm, digits, period, nil
}

// --- Base32 secrets ----------------------------------------------------------

var totpBase32 = base32.StdEncoding.WithPadding(base32.NoPadding)

// decodeBase32Secret accepts a pairing secret exactly as authenticator apps
// and provisioning URIs write it: uppercase RFC 4648 base32, commonly
// grouped with spaces or dashes by whatever produced it, and sometimes '='
// padded. It normalizes all of that before decoding, so a secret pasted
// with the grouping a QR generator or another app added still works.
func decodeBase32Secret(raw string) ([]byte, error) {
	cleaned := strings.Map(func(r rune) rune {
		switch r {
		case ' ', '-', '\t', '\n', '\r':
			return -1
		default:
			return r
		}
	}, strings.ToUpper(strings.TrimSpace(raw)))
	cleaned = strings.TrimRight(cleaned, "=")
	if cleaned == "" {
		return nil, errors.New("secret must not be empty")
	}

	decoded, err := totpBase32.DecodeString(cleaned)
	if err != nil {
		return nil, fmt.Errorf("secret is not valid base32: %w", err)
	}
	if len(decoded) == 0 {
		return nil, errors.New("decoded secret must not be empty")
	}
	return decoded, nil
}

func encodeBase32Secret(raw []byte) string {
	return totpBase32.EncodeToString(raw)
}

// generateTOTPSecret returns a fresh, cryptographically random pairing
// secret at RFC 4226's recommended HOTP key length (160 bits / 20 bytes).
func generateTOTPSecret() ([]byte, error) {
	secret := make([]byte, totpSecretBytes)
	if _, err := rand.Read(secret); err != nil {
		return nil, fmt.Errorf("generate secret: %w", err)
	}
	return secret, nil
}

// otpauthURI builds the standard `otpauth://totp/` provisioning URI (the
// "Key Uri Format" every authenticator app and QR generator follows) for
// name and secret. This is the one place in this file that puts a raw
// secret value into a returned response -- see totpPairingURI's comment for
// why that is the documented, deliberate exception.
func otpauthURI(name string, secret []byte, algorithm string, digits, period int) string {
	label := otpauthLabel(totpIssuer, name)
	q := url.Values{}
	q.Set("secret", encodeBase32Secret(secret))
	q.Set("issuer", totpIssuer)
	q.Set("algorithm", strings.ToUpper(algorithm))
	q.Set("digits", strconv.Itoa(digits))
	q.Set("period", strconv.Itoa(period))
	return fmt.Sprintf("otpauth://totp/%s?%s", label, q.Encode())
}

// otpauthLabel percent-encodes issuer and name independently, then joins
// them with a literal ':' -- the Key Uri Format keeps that separator
// literal ("otpauth://totp/Issuer:name?..."), so each component is escaped
// on its own rather than escaping the whole "issuer:name" string, which
// would also escape the separator.
func otpauthLabel(issuer, name string) string {
	return escapeOTPComponent(issuer) + ":" + escapeOTPComponent(name)
}

func escapeOTPComponent(s string) string {
	// url.QueryEscape encodes a space as '+'; a URI path component needs
	// '%20' instead, so the one substitution below is applied afterward.
	return strings.ReplaceAll(url.QueryEscape(s), "+", "%20")
}

// --- Account metadata storage -------------------------------------------------
//
// Only non-secret account metadata is ever persisted here. The pairing
// secret itself lives exclusively in store.SecretStore (see this file's
// header comment); this JSON file never contains one.

// totpAccount is the persisted, non-secret record for one paired account.
type totpAccount struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Algorithm string    `json:"algorithm"`
	Digits    int       `json:"digits"`
	Period    int       `json:"period"`
	CreatedAt time.Time `json:"createdAt"`
}

// totpAccountResponse is what every account-listing endpoint actually
// returns to a client. SecretSet is derived live from SecretStore.Has at
// response time, never persisted -- the vault is the source of truth for
// whether a secret exists, not this metadata file.
type totpAccountResponse struct {
	totpAccount
	SecretSet bool `json:"secretSet"`
}

type totpAccountsFile struct {
	Version  int           `json:"version"`
	Accounts []totpAccount `json:"accounts,omitempty"`
}

type totpManager struct {
	mu       sync.Mutex
	accounts []totpAccount
	loaded   bool
	path     string
}

// totpManagerSingleton returns the process-wide TOTP account-metadata
// manager. It is a package-level singleton rather than a Server field
// because this lane is restricted to touching Server's own definition in
// ui.go for route registration only -- see uh.go's schoolUnlockLimiter for
// the identical precedent and its rationale. As with that limiter, this
// desktop app only ever runs one Server per process, so a package-level
// singleton is exactly as scoped as a Server field would have been.
var (
	totpMgrOnce sync.Once
	totpMgrInst *totpManager
)

func totpManagerSingleton() *totpManager {
	totpMgrOnce.Do(func() {
		totpMgrInst = &totpManager{path: totpAccountsPath()}
	})
	return totpMgrInst
}

func totpAccountsPath() string {
	if runtime.GOOS == "windows" {
		return filepath.Join(os.Getenv("LOCALAPPDATA"), "Ollama", "totp-accounts.json")
	}
	return filepath.Join(os.Getenv("HOME"), "Library", "Application Support", "Ollama", "totp-accounts.json")
}

// totpSecretID returns the SecretStore id an account's pairing secret is
// stored under. Prefixed with "totp/" so it lands as
// "MaterialOllama/totp/<accountId>" in the underlying vault (Windows
// Credential Manager target name / macOS keychain service name).
func totpSecretID(accountID string) string {
	return "totp/" + accountID
}

func (m *totpManager) loadLocked() {
	if m.loaded {
		return
	}
	m.loaded = true
	data, err := os.ReadFile(m.path)
	if err != nil {
		return
	}
	var file totpAccountsFile
	if json.Unmarshal(data, &file) != nil || file.Version != 1 {
		return
	}
	m.accounts = file.Accounts
}

// persistLocked writes the current account list atomically: a temp file in
// the same directory, then an atomic rename over the real path, so a reader
// never observes a half-written file (matches the pattern already used by
// codexManager.persistLocked in codex.go).
func (m *totpManager) persistLocked() error {
	if err := os.MkdirAll(filepath.Dir(m.path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(totpAccountsFile{Version: 1, Accounts: m.accounts}, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(m.path), ".totp-accounts-*.json")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpName, m.path)
}

func (m *totpManager) list() []totpAccount {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.loadLocked()
	out := make([]totpAccount, len(m.accounts))
	copy(out, m.accounts)
	return out
}

func (m *totpManager) find(id string) (totpAccount, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.loadLocked()
	for _, a := range m.accounts {
		if a.ID == id {
			return a, true
		}
	}
	return totpAccount{}, false
}

// create appends account and persists the result. On a persist failure the
// in-memory list is rolled back so a subsequent list() cannot report an
// account that was never actually saved to disk.
func (m *totpManager) create(account totpAccount) (totpAccount, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.loadLocked()

	if len(m.accounts) >= totpAccountLimit {
		return totpAccount{}, fmt.Errorf("at most %d TOTP accounts are supported", totpAccountLimit)
	}

	m.accounts = append(m.accounts, account)
	if err := m.persistLocked(); err != nil {
		m.accounts = m.accounts[:len(m.accounts)-1]
		return totpAccount{}, fmt.Errorf("save account: %w", err)
	}
	return account, nil
}

// delete removes the metadata record for id and persists the result. It
// does NOT touch the vault -- callers are responsible for also deleting the
// SecretStore entry (see totpDeleteAccount).
func (m *totpManager) delete(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.loadLocked()

	idx := -1
	for i, a := range m.accounts {
		if a.ID == id {
			idx = i
			break
		}
	}
	if idx == -1 {
		return fmt.Errorf("TOTP account %q was not found", id)
	}

	removed := m.accounts[idx]
	m.accounts = slices.Delete(m.accounts, idx, idx+1)
	if err := m.persistLocked(); err != nil {
		m.accounts = slices.Insert(m.accounts, idx, removed)
		return fmt.Errorf("save accounts after delete: %w", err)
	}
	return nil
}

// --- Clock skew: best-effort, cached, never blocking --------------------------
//
// A TOTP code is only correct if this machine's clock agrees with whatever
// is verifying the code, to within roughly one period. A skewed clock
// produces confidently wrong digits with no error anywhere to explain why
// -- so GET /codes always reports the current system time, and separately,
// best-effort, whether that time could be checked against an outside
// reference.
//
// The check is one HTTPS HEAD request to OllamaDotCom -- the same origin
// this app already talks to elsewhere (see ollamaProxy in ui.go) -- reading
// back the response's standard `Date` header. This is the same technique
// systems without a dedicated NTP client have long used to estimate skew.
// It is:
//   - cheap: one HEAD request, no body, a small response-header read;
//   - bounded: a short client timeout, so it can never hang a caller;
//   - cached: refreshed at most once every totpSkewCheckInterval, and the
//     refresh runs in the background -- GET /codes always returns
//     immediately from cache and never performs network I/O itself;
//   - fail-open: offline, or the request is blocked, it just reports
//     "unavailable" with an explanation. Codes are computed and returned
//     either way; the skew check can never break the primary feature.
const (
	totpSkewCheckInterval = 10 * time.Minute
	totpSkewCheckTimeout  = 4 * time.Second
	// totpSkewWarnThreshold is the point past which a disagreement between
	// the local clock and the reference Date header is treated as "likely
	// to break codes" rather than ordinary request-latency jitter.
	totpSkewWarnThreshold = 5 * time.Second
)

// totpClockSkew is the shape GET /codes always includes so the UI can warn
// the user, even in the "not checked yet" and "could not check" cases:
//   - Available=false, CheckedAt zero: no check has completed yet (one has
//     been started in the background; a later request will see its
//     result). The UI should treat this the same as "unknown."
//   - Available=false, CheckedAt set, Reason set: the check ran but could
//     not reach a reference clock (offline, blocked, or a malformed
//     response). The UI should surface Reason as a soft, dismissible
//     notice -- not an error -- since codes still work.
//   - Available=true: SkewSeconds is signed (positive means this machine's
//     clock reads ahead of the reference). Likely and Warning are only set
//     once the disagreement exceeds totpSkewWarnThreshold.
type totpClockSkew struct {
	Available   bool      `json:"available"`
	CheckedAt   time.Time `json:"checkedAt,omitempty"`
	SkewSeconds float64   `json:"skewSeconds,omitempty"`
	Likely      bool      `json:"likely,omitempty"`
	Warning     string    `json:"warning,omitempty"`
	Reason      string    `json:"reason,omitempty"`
}

var (
	totpSkewMu       sync.Mutex
	totpSkewLast     totpClockSkew
	totpSkewChecking bool
)

// currentClockSkew returns the most recently cached skew estimate,
// triggering a background refresh (never more than one at a time, never
// more often than totpSkewCheckInterval) when the cache is stale or empty.
// It never performs network I/O itself, so it never adds latency to
// GET /codes.
func currentClockSkew() totpClockSkew {
	totpSkewMu.Lock()
	stale := time.Since(totpSkewLast.CheckedAt) > totpSkewCheckInterval
	shouldStart := stale && !totpSkewChecking
	if shouldStart {
		totpSkewChecking = true
	}
	current := totpSkewLast
	totpSkewMu.Unlock()

	if shouldStart {
		go refreshClockSkew()
	}

	if current.CheckedAt.IsZero() {
		current.Reason = "not yet checked; a background check has been started and will be reflected on a later request"
	}
	return current
}

func refreshClockSkew() {
	result := probeClockSkew()

	totpSkewMu.Lock()
	totpSkewLast = result
	totpSkewChecking = false
	totpSkewMu.Unlock()
}

func probeClockSkew() totpClockSkew {
	client := userAgentHTTPClient(totpSkewCheckTimeout)

	req, err := http.NewRequest(http.MethodHead, OllamaDotCom, nil)
	if err != nil {
		return totpClockSkew{Available: false, CheckedAt: time.Now(), Reason: "could not build the clock-check request"}
	}

	sent := time.Now()
	resp, err := client.Do(req)
	if err != nil {
		return totpClockSkew{
			Available: false,
			CheckedAt: time.Now(),
			Reason:    "no reference clock reachable (offline, or the request was blocked); TOTP codes still work, but if they are consistently rejected, check this computer's date, time, and timezone settings",
		}
	}
	defer resp.Body.Close()
	received := time.Now()

	remoteTime, err := http.ParseTime(resp.Header.Get("Date"))
	if err != nil {
		return totpClockSkew{
			Available: false,
			CheckedAt: time.Now(),
			Reason:    "reference server did not return a usable Date header",
		}
	}

	// The Date header only has one-second resolution, and the round trip
	// itself takes time neither endpoint accounts for. Using the local
	// send/receive midpoint as "now" halves the one-way network latency
	// out of the estimate, rather than attributing the whole round trip to
	// skew.
	midpoint := sent.Add(received.Sub(sent) / 2)
	skew := midpoint.Sub(remoteTime).Seconds()

	result := totpClockSkew{Available: true, CheckedAt: time.Now(), SkewSeconds: skew}
	if skew > totpSkewWarnThreshold.Seconds() || skew < -totpSkewWarnThreshold.Seconds() {
		result.Likely = true
		result.Warning = fmt.Sprintf("this computer's clock looks about %.0fs off from a reference server; TOTP codes may be rejected until the system date, time, and timezone are corrected", skew)
	}
	return result
}

// --- HTTP handlers -------------------------------------------------------------

// totpListAccounts handles GET /api/v1/uh/totp/accounts. The response never
// contains a secret -- only names, ids, algorithm/digits/period, and
// whether a secret is currently stored for each account.
func (s *Server) totpListAccounts(w http.ResponseWriter, r *http.Request) error {
	accounts := totpManagerSingleton().list()
	vault := store.NewSecretStore()

	out := make([]totpAccountResponse, 0, len(accounts))
	for _, a := range accounts {
		set, err := vault.Has(totpSecretID(a.ID))
		if err != nil {
			return fmt.Errorf("check stored secret for %s: %w", a.ID, err)
		}
		out = append(out, totpAccountResponse{totpAccount: a, SecretSet: set})
	}

	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(map[string]any{"accounts": out})
}

type totpCreateRequest struct {
	Name      string `json:"name"`
	Secret    string `json:"secret"`
	Algorithm string `json:"algorithm,omitempty"`
	Digits    int    `json:"digits,omitempty"`
	Period    int    `json:"period,omitempty"`
}

// totpCreateAccount handles POST /api/v1/uh/totp/accounts. The secret goes
// straight to the vault and is never included in the response.
func (s *Server) totpCreateAccount(w http.ResponseWriter, r *http.Request) error {
	var req totpCreateRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 64*1024)).Decode(&req); err != nil {
		return fmt.Errorf("invalid account request body: %w", err)
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		return errors.New("name is required")
	}
	if len(name) > totpMaxNameLen {
		return fmt.Errorf("name must be at most %d characters", totpMaxNameLen)
	}

	algorithm, digits, period, err := normalizeTOTPParams(req.Algorithm, req.Digits, req.Period)
	if err != nil {
		return err
	}

	secret, err := decodeBase32Secret(req.Secret)
	if err != nil {
		return err
	}

	id, err := uuid.NewV7()
	if err != nil {
		return fmt.Errorf("generate account id: %w", err)
	}

	account := totpAccount{
		ID:        id.String(),
		Name:      name,
		Algorithm: algorithm,
		Digits:    digits,
		Period:    period,
		CreatedAt: time.Now(),
	}

	// The secret goes to the vault FIRST, under the id just generated. If
	// persisting the metadata record then fails, the orphaned vault entry
	// is rolled back below rather than left behind as a secret with no
	// account pointing at it.
	if err := store.NewSecretStore().Set(totpSecretID(account.ID), secret); err != nil {
		return fmt.Errorf("store secret: %w", err)
	}

	saved, err := totpManagerSingleton().create(account)
	if err != nil {
		if delErr := store.NewSecretStore().Delete(totpSecretID(account.ID)); delErr != nil {
			s.log().Warn("failed to roll back orphaned TOTP secret after a failed account save", "account", account.ID, "error", delErr)
		}
		return err
	}

	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(totpAccountResponse{totpAccount: saved, SecretSet: true})
}

type totpDeleteRequest struct {
	Confirm string `json:"confirm"`
}

// totpDeleteAccount handles DELETE /api/v1/uh/totp/accounts/{id}. Removal
// requires {"confirm":"REMOVE"} in the request body -- this is checked
// here, server-side, regardless of whatever confirmation gate the caller's
// own UI already ran; a client-side-only confirmation is not a
// confirmation this endpoint can trust.
func (s *Server) totpDeleteAccount(w http.ResponseWriter, r *http.Request) error {
	id := r.PathValue("id")
	if id == "" {
		return errors.New("account id is required")
	}

	var req totpDeleteRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 4*1024)).Decode(&req); err != nil {
		return fmt.Errorf("invalid delete request body: %w", err)
	}
	if req.Confirm != "REMOVE" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		return json.NewEncoder(w).Encode(map[string]string{"error": `removing an account requires {"confirm":"REMOVE"} in the request body`})
	}

	if _, ok := totpManagerSingleton().find(id); !ok {
		return fmt.Errorf("TOTP account %q was not found", id)
	}

	if err := totpManagerSingleton().delete(id); err != nil {
		return err
	}
	if err := store.NewSecretStore().Delete(totpSecretID(id)); err != nil {
		return fmt.Errorf("account removed, but deleting its stored secret failed: %w", err)
	}

	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(map[string]string{"id": id, "state": "removed"})
}

type totpCodeEntry struct {
	ID               string `json:"id"`
	Name             string `json:"name"`
	Code             string `json:"code,omitempty"`
	Algorithm        string `json:"algorithm"`
	Digits           int    `json:"digits"`
	Period           int    `json:"period"`
	SecondsRemaining int    `json:"secondsRemaining"`
	// SecretMissing is true only in the (abnormal) case where an account's
	// metadata record survived without its vault entry -- reported plainly
	// rather than silently omitting the account, so a user isn't left
	// wondering why one vanished.
	SecretMissing bool `json:"secretMissing,omitempty"`
}

type totpCodesResponse struct {
	Codes []totpCodeEntry `json:"codes"`
	// SystemTimeUTC is always populated, independent of whether the
	// best-effort ClockSkew check below could run: a client that wants to
	// compare against its own trusted clock always has something to
	// compare against.
	SystemTimeUTC time.Time      `json:"systemTimeUtc"`
	ClockSkew     totpClockSkew  `json:"clockSkew"`
}

// totpCodes handles GET /api/v1/uh/totp/codes: the current code and
// seconds-remaining for every paired account, plus the current system time
// and a best-effort clock-skew estimate (see the "Clock skew" section
// above) so the UI can warn when codes are likely to be rejected.
func (s *Server) totpCodes(w http.ResponseWriter, r *http.Request) error {
	accounts := totpManagerSingleton().list()
	vault := store.NewSecretStore()
	now := time.Now()

	codes := make([]totpCodeEntry, 0, len(accounts))
	for _, a := range accounts {
		secret, ok, err := vault.Get(totpSecretID(a.ID))
		if err != nil {
			return fmt.Errorf("read stored secret for %s: %w", a.ID, err)
		}
		if !ok {
			codes = append(codes, totpCodeEntry{
				ID: a.ID, Name: a.Name, Algorithm: a.Algorithm, Digits: a.Digits, Period: a.Period,
				SecretMissing: true,
			})
			continue
		}

		code, err := totpCodeAt(secret, now, a.Period, a.Digits, a.Algorithm)
		if err != nil {
			return fmt.Errorf("compute code for %s: %w", a.ID, err)
		}

		elapsedInPeriod := now.Unix() % int64(a.Period)
		codes = append(codes, totpCodeEntry{
			ID: a.ID, Name: a.Name, Code: code, Algorithm: a.Algorithm, Digits: a.Digits, Period: a.Period,
			SecondsRemaining: int(int64(a.Period) - elapsedInPeriod),
		})
	}

	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(totpCodesResponse{
		Codes:         codes,
		SystemTimeUTC: now.UTC(),
		ClockSkew:     currentClockSkew(),
	})
}

type totpPairingRequest struct {
	ID        string `json:"id,omitempty"`
	Name      string `json:"name,omitempty"`
	Algorithm string `json:"algorithm,omitempty"`
	Digits    int    `json:"digits,omitempty"`
	Period    int    `json:"period,omitempty"`
}

type totpPairingResponse struct {
	URI string `json:"uri"`
	// Secret is the same value already embedded in URI's `secret=` query
	// parameter, surfaced as its own field so a UI can show it as the
	// manual-entry fallback beside the QR without having to parse the URI.
	// This is the documented one-time pairing reveal (see this file's
	// header comment); no other response in this file ever contains one.
	Secret    string `json:"secret"`
	Name      string `json:"name"`
	Algorithm string `json:"algorithm"`
	Digits    int    `json:"digits"`
	Period    int    `json:"period"`
}

// totpPairingURI handles POST /api/v1/uh/totp/pairing-uri, generating an
// otpauth://totp/ URI for QR display. It never persists anything -- the
// caller separately calls POST /accounts (with the same secret returned
// here) to actually store it in the vault.
//
// Two request shapes:
//   - {id}: re-pairing. Builds the URI for an account whose secret is
//     ALREADY in the vault (e.g. to show the QR again for a second
//     device). Errors if the account or its secret cannot be found.
//   - {name, algorithm?, digits?, period?} with no id: new pairing.
//     Generates a fresh, cryptographically random secret and returns its
//     URI. Nothing about this new secret is retained in server memory once
//     the response is written -- it exists only for the duration of this
//     one request.
func (s *Server) totpPairingURI(w http.ResponseWriter, r *http.Request) error {
	var req totpPairingRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 8*1024)).Decode(&req); err != nil {
		return fmt.Errorf("invalid pairing request body: %w", err)
	}

	if req.ID != "" {
		account, ok := totpManagerSingleton().find(req.ID)
		if !ok {
			return fmt.Errorf("TOTP account %q was not found", req.ID)
		}
		secret, ok, err := store.NewSecretStore().Get(totpSecretID(account.ID))
		if err != nil {
			return fmt.Errorf("read stored secret: %w", err)
		}
		if !ok {
			return fmt.Errorf("TOTP account %q has no stored secret to pair from", req.ID)
		}

		w.Header().Set("Content-Type", "application/json")
		return json.NewEncoder(w).Encode(totpPairingResponse{
			URI:       otpauthURI(account.Name, secret, account.Algorithm, account.Digits, account.Period),
			Secret:    encodeBase32Secret(secret),
			Name:      account.Name,
			Algorithm: account.Algorithm,
			Digits:    account.Digits,
			Period:    account.Period,
		})
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		return errors.New("name is required")
	}
	if len(name) > totpMaxNameLen {
		return fmt.Errorf("name must be at most %d characters", totpMaxNameLen)
	}

	algorithm, digits, period, err := normalizeTOTPParams(req.Algorithm, req.Digits, req.Period)
	if err != nil {
		return err
	}

	secret, err := generateTOTPSecret()
	if err != nil {
		return err
	}

	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(totpPairingResponse{
		URI:       otpauthURI(name, secret, algorithm, digits, period),
		Secret:    encodeBase32Secret(secret),
		Name:      name,
		Algorithm: algorithm,
		Digits:    digits,
		Period:    period,
	})
}
