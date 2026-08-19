//go:build windows || darwin

package store

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/json"
	"fmt"

	"golang.org/x/crypto/argon2"
)

// SecretStore persists small secrets -- PIN digests, endpoint API tokens --
// in the operating system's own credential store. Nothing it stores ever
// round-trips through SQLite (see database.go's settings table), a JSON
// settings export, or a log line: Settings and UIPreferences only ever carry
// a *Set boolean recording whether a secret exists (see SchoolPrefs.PinSet
// and Endpoint.TokenSet in store.go), never the secret itself.
//
// Implementations live in secrets_windows.go (Windows Credential Manager)
// and secrets_darwin.go (macOS keychain via the `security` CLI). Construct
// one with NewSecretStore.
type SecretStore interface {
	// Set stores value under id, replacing any existing value for that id.
	Set(id string, value []byte) error

	// Get retrieves the value stored under id. ok is false, with a nil
	// error, when nothing is currently stored under id -- that is an
	// expected, non-error outcome, not a failure.
	Get(id string) (value []byte, ok bool, err error)

	// Delete removes the value stored under id, if any. Deleting an id that
	// was never set is not an error.
	Delete(id string) error

	// Has reports whether a value is currently stored under id, without
	// retrieving it.
	Has(id string) (bool, error)
}

// Argon2id parameters for hashing a School-mode PIN. These intentionally sit
// below the RFC 9106 "protect a real encryption key" recommendations: a
// School-mode PIN is an explicitly-documented toy/UX lock, never a security
// boundary (see the shared School-mode contract), so the goal here is
// "meaningfully slower than a bare unsalted comparison," not "resist a
// dedicated attacker who already has the stored digest."
const (
	pinArgon2Time    = 1
	pinArgon2Memory  = 19 * 1024 // KiB (~19 MiB)
	pinArgon2Threads = 1
	pinArgon2KeyLen  = 32
	pinArgon2SaltLen = 16
)

// pinDigest is the exact shape persisted to SecretStore for a School-mode
// PIN. The PIN itself is NEVER a field here -- only its argon2id hash, the
// salt used to compute it, and the algorithm parameters used at creation
// time, so a later change to the pinArgon2* constants above can never
// silently break verification of a PIN that was hashed under the old
// parameters.
type pinDigest struct {
	Salt    []byte `json:"salt"`
	Hash    []byte `json:"hash"`
	Time    uint32 `json:"time"`
	Memory  uint32 `json:"memory"`
	Threads uint8  `json:"threads"`
}

// HashPIN computes a new argon2id digest for pin and returns the exact bytes
// to pass to SecretStore.Set. The returned bytes never contain pin itself,
// and pin is never logged, echoed, or returned to any caller.
func HashPIN(pin string) ([]byte, error) {
	salt := make([]byte, pinArgon2SaltLen)
	if _, err := rand.Read(salt); err != nil {
		return nil, fmt.Errorf("generate pin salt: %w", err)
	}

	hash := argon2.IDKey([]byte(pin), salt, pinArgon2Time, pinArgon2Memory, pinArgon2Threads, pinArgon2KeyLen)

	digest := pinDigest{
		Salt:    salt,
		Hash:    hash,
		Time:    pinArgon2Time,
		Memory:  pinArgon2Memory,
		Threads: pinArgon2Threads,
	}

	encoded, err := json.Marshal(digest)
	if err != nil {
		return nil, fmt.Errorf("encode pin digest: %w", err)
	}
	return encoded, nil
}

// VerifyPIN reports whether pin matches the digest previously produced by
// HashPIN and stored via SecretStore.Set. Comparison is constant-time. A
// malformed or unreadable stored digest reports false rather than an error:
// it can only mean the vault entry was corrupted or tampered with outside
// this app, and the correct user-facing response is "wrong PIN," not an
// internal error that might hint at why verification failed.
func VerifyPIN(pin string, stored []byte) bool {
	var digest pinDigest
	if err := json.Unmarshal(stored, &digest); err != nil {
		return false
	}
	if len(digest.Salt) == 0 || len(digest.Hash) == 0 {
		return false
	}

	computed := argon2.IDKey([]byte(pin), digest.Salt, digest.Time, digest.Memory, digest.Threads, uint32(len(digest.Hash)))
	return subtle.ConstantTimeCompare(computed, digest.Hash) == 1
}
