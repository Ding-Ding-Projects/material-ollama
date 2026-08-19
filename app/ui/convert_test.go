//go:build windows || darwin

package ui

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// TestValidateOutput_RejectsCorruptStructuredResult exercises the exact
// contract validateOutput exists for: a conversion job that produced a
// broken file must be reported failed by re-decoding the file fresh from
// disk, never trusted just because the write step returned no error. This
// writes truncated/invalid JSON directly (bypassing the real converter, as
// a corrupt-on-disk result would look regardless of how it got that way)
// and asserts validateOutput refuses it.
func TestValidateOutput_RejectsCorruptStructuredResult(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "output.json")
	// Deliberately truncated: an open brace and one field, no closing
	// brace -- exactly the shape a conversion killed mid-write would
	// leave behind.
	if err := os.WriteFile(path, []byte(`{"family":"llama"`), 0o600); err != nil {
		t.Fatalf("write fixture: %v", err)
	}

	err := validateOutput("json", path)
	if err == nil {
		t.Fatalf("validateOutput accepted a truncated JSON file as valid output")
	}
	if !strings.Contains(err.Error(), "failed to re-decode as json") {
		t.Fatalf("error = %q, want it to name the re-decode failure", err.Error())
	}
}

// TestValidateOutput_AcceptsWellFormedStructuredResult is the contrasting
// green case: a genuinely valid JSON file must pass, so the rejection
// above is proven to be about the corruption and not merely
// validateOutput refusing every "json" file it is ever given.
func TestValidateOutput_AcceptsWellFormedStructuredResult(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "output.json")
	if err := os.WriteFile(path, []byte(`{"family":"llama","parameters":"8B"}`), 0o600); err != nil {
		t.Fatalf("write fixture: %v", err)
	}

	if err := validateOutput("json", path); err != nil {
		t.Fatalf("validateOutput rejected well-formed JSON: %v", err)
	}
}

// TestValidateOutput_RejectsCorruptImageResult covers the images branch of
// the same switch: bytes that are simply not a PNG (a corrupt or
// truncated encode) must fail re-decoding rather than being handed to the
// user as though the conversion succeeded.
func TestValidateOutput_RejectsCorruptImageResult(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "output.png")
	// The real PNG signature followed by garbage: enough to look
	// plausible at a glance, nowhere near a decodable image.
	garbage := append([]byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}, []byte("not a real png chunk stream")...)
	if err := os.WriteFile(path, garbage, 0o600); err != nil {
		t.Fatalf("write fixture: %v", err)
	}

	err := validateOutput("png", path)
	if err == nil {
		t.Fatalf("validateOutput accepted a corrupt PNG as valid output")
	}
}

// TestConvertManager_RefusesPathThePickerNeverIssued is the security gate
// this lane's brief names directly: pathIsPicked must say no for any path
// that RegisterPickedPaths was never called with, even once some other,
// unrelated path genuinely has been registered -- proving the gate checks
// the specific path asked about rather than merely "has anything ever been
// picked this session".
func TestConvertManager_RefusesPathThePickerNeverIssued(t *testing.T) {
	m := &convertManager{pickedPaths: make(map[string]time.Time)}

	dir := t.TempDir()
	registered := filepath.Join(dir, "picked-by-dialog.pdf")
	neverIssued := filepath.Join(dir, "guessed-by-renderer.pdf")

	// Before anything is registered, every path is refused -- fail-closed
	// is the default, not an edge case.
	if m.pathIsPicked(registered) {
		t.Fatalf("pathIsPicked(%q) = true before any RegisterPickedPaths call", registered)
	}

	m.registerPickedPaths([]string{registered})

	if !m.pathIsPicked(registered) {
		t.Fatalf("pathIsPicked(%q) = false after it was registered by the picker", registered)
	}
	// The actual case under test: a path the picker never issued stays
	// refused even though the manager now holds a live entry for a
	// sibling path in the very same directory.
	if m.pathIsPicked(neverIssued) {
		t.Fatalf("pathIsPicked(%q) = true, but this path was never registered by the picker", neverIssued)
	}
}

// TestConvertManager_ExpiredPickedPathIsRefusedAndPruned proves the other
// half of the gate: registration is not forever. Once pickedPathTTL has
// passed, pathIsPicked must refuse the path again and remove the stale
// entry rather than let it accumulate unbounded across a long session.
func TestConvertManager_ExpiredPickedPathIsRefusedAndPruned(t *testing.T) {
	m := &convertManager{pickedPaths: make(map[string]time.Time)}

	dir := t.TempDir()
	path := filepath.Join(dir, "old-selection.pdf")
	abs, err := filepath.Abs(path)
	if err != nil {
		t.Fatalf("filepath.Abs: %v", err)
	}
	// Simulate a registration whose TTL already elapsed, rather than
	// sleeping pickedPathTTL (10 minutes) in a test.
	m.pickedPaths[abs] = time.Now().Add(-time.Minute)

	if m.pathIsPicked(path) {
		t.Fatalf("pathIsPicked(%q) = true for an entry past its TTL", path)
	}
	if _, stillPresent := m.pickedPaths[abs]; stillPresent {
		t.Fatalf("expired entry for %q was not pruned from pickedPaths", abs)
	}
}
