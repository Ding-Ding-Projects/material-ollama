//go:build windows || darwin

// This file implements the dedicated UI-preferences and School-mode-PIN
// endpoints under /api/v1/uh/*.
//
// It exists specifically to dodge a real trap in the existing
// GET/POST /api/v1/settings pair (see settings() and getSettings() in
// ui.go): src/hooks/useSettings.ts PATCHes the ENTIRE settings object via
// `new Settings({...old, ...updates})`, and settings() decodes that whole
// object and saves it verbatim. If a nested field the frontend doesn't yet
// know about is ever absent from that spread, it marshals as omitted/null,
// Go unmarshals the zero value for it, and the resulting save would
// silently reset that field on the very next unrelated settings change.
// Routing UI preferences through their own PATCH endpoint -- which loads the
// current preferences and decodes the request body directly on top of them,
// so any field genuinely absent from the patch keeps its existing value --
// makes that failure mode structurally impossible for preferences,
// regardless of what the general settings endpoint does or doesn't know
// about yet.
package ui

import (
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"sync"
	"time"

	"github.com/ollama/ollama/app/store"
)

// --- Preferences: GET / PATCH ----------------------------------------------

type uhPreferencesResponse struct {
	Preferences store.UIPreferences `json:"preferences"`
}

// uhGetPreferences returns the current UI preferences.
func (s *Server) uhGetPreferences(w http.ResponseWriter, r *http.Request) error {
	settings, err := s.Store.Settings()
	if err != nil {
		return fmt.Errorf("failed to load settings: %w", err)
	}

	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(uhPreferencesResponse{Preferences: settings.UIPreferences})
}

var hexColorPattern = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

// allowedAppearanceOverrideTokens is the set of CSS custom-property tokens
// the desktop app's own stylesheet actually reads. It exists because
// AppearancePrefs.Overrides round-trips directly into rendered CSS, so an
// unvalidated key could otherwise be used to smuggle an arbitrary CSS
// property name (and, chained with a crafted value, worse) through the
// settings API. Keep this in sync with the frontend's real token list; a
// token not on this list is silently dropped, never rejecting the whole
// PATCH over it -- see sanitizeUIPreferences.
var allowedAppearanceOverrideTokens = map[string]struct{}{
	"--md-sys-color-primary":         {},
	"--md-sys-color-on-primary":      {},
	"--md-sys-color-secondary":       {},
	"--md-sys-color-on-secondary":    {},
	"--md-sys-color-surface":         {},
	"--md-sys-color-on-surface":      {},
	"--md-sys-color-background":      {},
	"--md-sys-color-on-background":   {},
	"--md-sys-shape-corner-small":    {},
	"--md-sys-shape-corner-medium":   {},
	"--md-sys-shape-corner-large":    {},
	"--md-sys-typescale-body-font":   {},
	"--md-sys-motion-duration-short": {},
}

var legalLangModes = map[string]struct{}{
	"en":   {},
	"yue":  {},
	"both": {},
}

func clampInt(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

// sanitizeUIPreferences clamps and validates every field a client can
// influence through the PATCH endpoint. It never rejects the whole request
// over one bad field: an out-of-range number is clamped, an illegal enum
// falls back to a safe default, and a disallowed appearance override is
// dropped -- mirroring the fail-safe fallback this codebase already uses
// for LastHomeView in database.go's setSettings.
func sanitizeUIPreferences(p *store.UIPreferences) {
	p.FunnyEn = clampInt(p.FunnyEn, 0, 4)
	p.FunnyYue = clampInt(p.FunnyYue, 0, 4)

	if _, ok := legalLangModes[p.LangMode]; !ok {
		p.LangMode = "en"
	}

	p.Appearance.Radius = clampInt(p.Appearance.Radius, 4, 28)

	if p.Appearance.Seed != "" && !hexColorPattern.MatchString(p.Appearance.Seed) {
		p.Appearance.Seed = ""
	}

	if len(p.Appearance.Overrides) > 0 {
		filtered := make(map[string]string, len(p.Appearance.Overrides))
		for token, value := range p.Appearance.Overrides {
			if _, ok := allowedAppearanceOverrideTokens[token]; ok {
				filtered[token] = value
			}
		}
		p.Appearance.Overrides = filtered
	}

	if p.Hardware == nil {
		p.Hardware = map[string]store.HardwareOverrides{}
	}
}

// uhPatchPreferences accepts a PARTIAL UIPreferences document and performs a
// server-side read-modify-write: load the current preferences, decode the
// request body directly on top of them (any field the client omits keeps
// its previously-saved value; slices and objects present in the body
// replace their prior value, as is normal JSON-merge-patch semantics),
// validate/clamp what changed, and save the merged result.
func (s *Server) uhPatchPreferences(w http.ResponseWriter, r *http.Request) error {
	settings, err := s.Store.Settings()
	if err != nil {
		return fmt.Errorf("failed to load settings: %w", err)
	}

	prefs := settings.UIPreferences
	if err := json.NewDecoder(r.Body).Decode(&prefs); err != nil {
		return fmt.Errorf("invalid preferences patch body: %w", err)
	}

	sanitizeUIPreferences(&prefs)
	settings.UIPreferences = prefs

	if err := s.Store.SetSettings(settings); err != nil {
		return fmt.Errorf("failed to save preferences: %w", err)
	}

	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(uhPreferencesResponse{Preferences: prefs})
}

// --- School PIN: set / unlock / clear --------------------------------------

// schoolPinSecretID is the SecretStore id the School-mode PIN digest is
// stored under. This is a single-profile desktop app (one School-mode PIN
// per install), so a fixed constant is sufficient -- it is never derived
// from client input.
const schoolPinSecretID = "school-pin"

type uhSetPINRequest struct {
	PIN string `json:"pin"`
}

type uhUnlockRequest struct {
	PIN string `json:"pin"`
}

type uhUnlockResponse struct {
	Unlocked bool `json:"unlocked"`
}

type uhPinStatusResponse struct {
	PinSet bool `json:"pinSet"`
}

// uhSetSchoolPIN hashes and stores a new School-mode PIN, then records
// School.PinSet = true in the persisted preferences. The PIN itself is
// never persisted anywhere and never appears in this handler's response.
func (s *Server) uhSetSchoolPIN(w http.ResponseWriter, r *http.Request) error {
	var req uhSetPINRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		return fmt.Errorf("invalid pin request body: %w", err)
	}

	if len(req.PIN) < 4 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		return json.NewEncoder(w).Encode(map[string]string{"error": "pin must be at least 4 characters"})
	}

	digest, err := store.HashPIN(req.PIN)
	if err != nil {
		return fmt.Errorf("failed to hash pin: %w", err)
	}

	if err := store.NewSecretStore().Set(schoolPinSecretID, digest); err != nil {
		return fmt.Errorf("failed to store pin: %w", err)
	}

	settings, err := s.Store.Settings()
	if err != nil {
		return fmt.Errorf("failed to load settings: %w", err)
	}
	settings.UIPreferences.School.PinSet = true
	if err := s.Store.SetSettings(settings); err != nil {
		return fmt.Errorf("failed to persist pin state: %w", err)
	}

	schoolUnlockLimiter.reset()

	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(uhPinStatusResponse{PinSet: true})
}

// uhClearSchoolPIN removes the stored PIN digest and records
// School.PinSet = false.
func (s *Server) uhClearSchoolPIN(w http.ResponseWriter, r *http.Request) error {
	if err := store.NewSecretStore().Delete(schoolPinSecretID); err != nil {
		return fmt.Errorf("failed to delete pin: %w", err)
	}

	settings, err := s.Store.Settings()
	if err != nil {
		return fmt.Errorf("failed to load settings: %w", err)
	}
	settings.UIPreferences.School.PinSet = false
	if err := s.Store.SetSettings(settings); err != nil {
		return fmt.Errorf("failed to persist pin state: %w", err)
	}

	schoolUnlockLimiter.reset()

	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(uhPinStatusResponse{PinSet: false})
}

// uhUnlockSchool verifies a submitted PIN against the stored digest,
// entirely in Go, server-side -- the PIN never round-trips to the renderer
// beyond this one request body, and the stored digest never leaves this
// handler. Verification is rate-limited by schoolUnlockLimiter.
func (s *Server) uhUnlockSchool(w http.ResponseWriter, r *http.Request) error {
	if locked, remaining := schoolUnlockLimiter.locked(); locked {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Retry-After", fmt.Sprintf("%.0f", remaining.Seconds()))
		w.WriteHeader(http.StatusTooManyRequests)
		return json.NewEncoder(w).Encode(map[string]string{
			"error": fmt.Sprintf("too many attempts, try again in %s", remaining.Round(time.Second)),
		})
	}

	var req uhUnlockRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		return fmt.Errorf("invalid unlock request body: %w", err)
	}

	stored, ok, err := store.NewSecretStore().Get(schoolPinSecretID)
	if err != nil {
		return fmt.Errorf("failed to read stored pin: %w", err)
	}

	if !ok || !store.VerifyPIN(req.PIN, stored) {
		schoolUnlockLimiter.recordFailure()
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		return json.NewEncoder(w).Encode(uhUnlockResponse{Unlocked: false})
	}

	schoolUnlockLimiter.reset()

	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(uhUnlockResponse{Unlocked: true})
}

// --- School unlock rate limiting --------------------------------------------

const (
	schoolUnlockMaxAttempts    = 5
	schoolUnlockInitialBackoff = 30 * time.Second
	schoolUnlockMaxBackoff     = 5 * time.Minute
)

// unlockLimiter is a simple in-process, mutex-protected rate limiter for the
// school-unlock endpoint. It is deliberately a package-level singleton
// rather than a Server field: this lane is restricted to touching Server's
// definition in ui.go only for route registration (see this file's own
// route-registration note in ui.go), and this desktop app only ever runs
// one Server per process, so a package-level limiter is exactly as scoped
// as a Server field would have been.
type unlockLimiter struct {
	mu          sync.Mutex
	failures    int
	lockedUntil time.Time
	nextBackoff time.Duration
}

var schoolUnlockLimiter unlockLimiter

// locked reports whether the limiter currently rejects new attempts, and if
// so, how much longer that lockout has left.
func (l *unlockLimiter) locked() (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()
	remaining := time.Until(l.lockedUntil)
	if remaining <= 0 {
		return false, 0
	}
	return true, remaining
}

// recordFailure counts one more failed attempt. Once schoolUnlockMaxAttempts
// consecutive failures have been recorded, each further failure locks out
// new attempts for an exponentially growing backoff -- 30s, 60s, 120s, 240s,
// capped at 5 minutes -- rather than one fixed delay, so a script retrying
// in a tight loop keeps losing ground instead of settling into a steady
// 30-seconds-per-guess rhythm.
func (l *unlockLimiter) recordFailure() {
	l.mu.Lock()
	defer l.mu.Unlock()

	l.failures++
	if l.failures < schoolUnlockMaxAttempts {
		return
	}

	if l.nextBackoff == 0 {
		l.nextBackoff = schoolUnlockInitialBackoff
	} else {
		l.nextBackoff *= 2
		if l.nextBackoff > schoolUnlockMaxBackoff {
			l.nextBackoff = schoolUnlockMaxBackoff
		}
	}
	l.lockedUntil = time.Now().Add(l.nextBackoff)
}

// reset clears the failure count and any active lockout -- called after a
// successful unlock, and after the PIN itself is changed or cleared.
func (l *unlockLimiter) reset() {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.failures = 0
	l.nextBackoff = 0
	l.lockedUntil = time.Time{}
}
