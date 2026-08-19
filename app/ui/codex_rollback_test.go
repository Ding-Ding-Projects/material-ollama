//go:build windows || darwin

package ui

import (
	"context"
	"path/filepath"
	"testing"
	"time"
)

// --- configuration-rollback: codex.go's snapshot-before-mutation, ---------
// --- automatic-rollback-on-failure contract for the Codex harness ---------
//
// codexManager.start() captures the profile it is about to run as
// session.snapshot BEFORE the run begins (see codex.go's start()), and
// codexManager.run() calls restoreProfile(session.snapshot) when the Codex
// process exits non-zero (or otherwise fails) AND the caller asked for
// rollbackOnFailure. These tests drive run() directly (bypassing start()'s
// goroutine and the HTTP layer) against a real subprocess -- a real cmd.exe
// invocation that genuinely exits non-zero -- and a real on-disk profile
// history file, proving the profile that ends up persisted is the
// PRE-RUN snapshot rather than whatever was live when the run failed.

func newTestCodexManager(t *testing.T) *codexManager {
	t.Helper()
	dir := t.TempDir()
	return &codexManager{
		sessions: make(map[string]*codexSessionRuntime),
		path:     filepath.Join(dir, "codex-harness.json"),
		loaded:   true, // profiles are set directly below; skip disk load
	}
}

func newFailingCodexSession(id string, snapshot CodexProfile) (*codexSessionRuntime, context.Context, context.CancelFunc) {
	session := &codexSessionRuntime{
		codexSession: codexSession{
			ID:            id,
			ProfileID:     snapshot.ID,
			ProfileName:   snapshot.Name,
			State:         "queued",
			RollbackState: "available",
			StartedAt:     time.Now(),
		},
		done:        make(chan struct{}),
		subscribers: make(map[chan codexEvent]struct{}),
		snapshot:    snapshot,
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	session.cancel = cancel
	return session, ctx, cancel
}

// TestCodexManagerRun_RollbackOnFailureRestoresProfileSnapshot proves the
// real end-to-end contract: a profile that was mutated in memory (and on
// disk) AFTER its pre-run snapshot was captured is reverted back to that
// exact snapshot, on disk, once a real subprocess run genuinely fails and
// the caller opted into rollbackOnFailure. Mutating the live profile before
// the run -- rather than leaving it identical to the snapshot -- is what
// makes this a real proof rather than a coincidence: if restoreProfile were
// never called, the assertion below would fail.
func TestCodexManagerRun_RollbackOnFailureRestoresProfileSnapshot(t *testing.T) {
	manager := newTestCodexManager(t)
	dir := t.TempDir()

	original := CodexProfile{
		ID:               "codex-p1",
		Name:             "Original profile name",
		Executable:       "cmd.exe",
		WorkingDirectory: dir,
		TimeoutSeconds:   5,
	}
	manager.profiles = []CodexProfile{original}
	if err := manager.persistLocked(); err != nil {
		t.Fatalf("persistLocked (initial): %v", err)
	}

	// Simulate the profile being edited elsewhere while this run's snapshot
	// (captured below as `original`) is already in flight.
	manager.mu.Lock()
	manager.profiles[0].Name = "Mutated while the run was in flight"
	manager.mu.Unlock()
	if err := manager.persistLocked(); err != nil {
		t.Fatalf("persistLocked (mutated): %v", err)
	}

	session, ctx, cancel := newFailingCodexSession("codex-s1", original)
	defer cancel()

	runProfile := original
	runProfile.Executable = "cmd.exe"
	runProfile.WorkingDirectory = dir

	// A real subprocess that genuinely exits non-zero -- exit code 3 -- so
	// run() takes the *exec.ExitError branch that fires the rollback.
	manager.run(ctx, session, runProfile, []string{"/c", "exit", "3"}, true /* rollbackOnFailure */)

	if session.State != "failed" {
		t.Fatalf("expected session state 'failed' after a non-zero exit, got %q", session.State)
	}
	if session.ExitCode == nil || *session.ExitCode != 3 {
		t.Fatalf("expected exit code 3, got %v", session.ExitCode)
	}

	manager.mu.Lock()
	gotName := manager.profiles[0].Name
	manager.mu.Unlock()
	if gotName != original.Name {
		t.Fatalf("expected in-memory profile name restored to %q after rollback, got %q", original.Name, gotName)
	}

	// The whole point of a snapshot-and-restore contract is that it
	// survives past the in-memory struct -- prove the restore actually
	// landed on disk by loading it back through a fresh manager instance.
	reloaded := &codexManager{path: manager.path}
	reloaded.loadLocked()
	if len(reloaded.profiles) != 1 {
		t.Fatalf("expected exactly one persisted profile after rollback, got %d", len(reloaded.profiles))
	}
	if reloaded.profiles[0].Name != original.Name {
		t.Fatalf("expected the persisted profile to be rolled back to %q, got %q", original.Name, reloaded.profiles[0].Name)
	}
}

// TestCodexManagerRun_FailureWithoutRollbackFlagLeavesProfileMutated proves
// restoreProfile is conditional on rollbackOnFailure rather than an
// unconditional side effect of every failed run -- without this contrast,
// the test above could pass even if run() rolled back on every failure
// regardless of what the caller asked for.
func TestCodexManagerRun_FailureWithoutRollbackFlagLeavesProfileMutated(t *testing.T) {
	manager := newTestCodexManager(t)
	dir := t.TempDir()

	original := CodexProfile{
		ID:               "codex-p2",
		Name:             "Original profile name",
		Executable:       "cmd.exe",
		WorkingDirectory: dir,
		TimeoutSeconds:   5,
	}
	manager.profiles = []CodexProfile{original}
	if err := manager.persistLocked(); err != nil {
		t.Fatalf("persistLocked (initial): %v", err)
	}

	manager.mu.Lock()
	manager.profiles[0].Name = "Mutated while the run was in flight"
	manager.mu.Unlock()
	if err := manager.persistLocked(); err != nil {
		t.Fatalf("persistLocked (mutated): %v", err)
	}

	session, ctx, cancel := newFailingCodexSession("codex-s2", original)
	defer cancel()

	runProfile := original
	runProfile.Executable = "cmd.exe"
	runProfile.WorkingDirectory = dir

	manager.run(ctx, session, runProfile, []string{"/c", "exit", "3"}, false /* rollbackOnFailure */)

	if session.State != "failed" {
		t.Fatalf("expected session state 'failed' after a non-zero exit, got %q", session.State)
	}

	manager.mu.Lock()
	gotName := manager.profiles[0].Name
	manager.mu.Unlock()
	if gotName != "Mutated while the run was in flight" {
		t.Fatalf("expected the mutated profile name to survive an opted-out rollback, got %q", gotName)
	}
}

// TestCodexManagerRestoreProfile_UnknownProfileIDIsANoOp proves
// restoreProfile does not panic or corrupt the profile list when the
// session's snapshot names a profile ID that is no longer present (for
// example, the profile was deleted while its run was still in flight).
func TestCodexManagerRestoreProfile_UnknownProfileIDIsANoOp(t *testing.T) {
	manager := newTestCodexManager(t)
	kept := CodexProfile{ID: "codex-kept", Name: "Kept profile"}
	manager.profiles = []CodexProfile{kept}
	if err := manager.persistLocked(); err != nil {
		t.Fatalf("persistLocked: %v", err)
	}

	manager.restoreProfile(CodexProfile{ID: "codex-deleted-elsewhere", Name: "Ghost snapshot"})

	manager.mu.Lock()
	defer manager.mu.Unlock()
	if len(manager.profiles) != 1 || manager.profiles[0].Name != kept.Name {
		t.Fatalf("expected the unrelated profile list to be untouched, got %+v", manager.profiles)
	}
}
