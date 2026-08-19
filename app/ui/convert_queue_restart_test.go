//go:build windows || darwin

package ui

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// --- queue-recovery: convertManager.loadLocked's startup recovery -------
//
// This is exactly the untested implementation the "queue-recovery" suite
// area's own Notes name: a job left "running" when the desktop process
// exited is a lie at startup (nothing is actually running it anymore), so
// loadLocked must reset it to queued, remove its orphaned temp output
// file, and clear TempOutputPath -- the resumable-at-job-granularity
// contract ConvertJob.TempOutputPath's own doc comment describes. Every
// test here writes a real queue file to a real temp directory and
// constructs a fresh, real convertManager against it (never the package
// singleton, so tests cannot see or disturb each other's state), then
// calls loadLocked directly.

func writeConvertQueueFile(t *testing.T, path string, jobs ...ConvertJob) {
	t.Helper()
	file := convertQueueFile{Version: 1, Jobs: jobs}
	data, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		t.Fatalf("marshal fixture queue file: %v", err)
	}
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatalf("write fixture queue file: %v", err)
	}
}

func newTestConvertManager(path string) *convertManager {
	return &convertManager{
		jobs:        make(map[string]*convertJobRuntime),
		subscribers: make(map[chan convertQueueEvent]struct{}),
		pickedPaths: make(map[string]time.Time),
		path:        path,
	}
}

// TestConvertManagerLoadLocked_OrphanedRunningJobResetToQueuedAndTempFileRemoved
// is the exact scenario this project's own Notes describe as not yet
// done: a job persisted as "running" (the process that ran it is gone),
// with a real leftover temp file on disk, must come back "queued" with
// TempOutputPath cleared and the orphaned temp file actually removed --
// never left to linger next to whatever the eventual real output becomes.
func TestConvertManagerLoadLocked_OrphanedRunningJobResetToQueuedAndTempFileRemoved(t *testing.T) {
	dir := t.TempDir()
	queuePath := filepath.Join(dir, "convert-queue.json")
	tempOutputPath := filepath.Join(dir, ".convert-output-orphan.tmp")

	if err := os.WriteFile(tempOutputPath, []byte("half-written conversion output"), 0o600); err != nil {
		t.Fatalf("write orphan temp fixture: %v", err)
	}

	createdAt := time.Now().Add(-time.Hour)
	writeConvertQueueFile(t, queuePath, ConvertJob{
		ID:             "job-orphaned",
		InputPath:      filepath.Join(dir, "input.docx"),
		InputFilename:  "input.docx",
		SourceFormat:   "docx",
		TargetFormat:   "pdf",
		State:          ConvertRunning,
		TempOutputPath: tempOutputPath,
		CreatedAt:      createdAt,
		UpdatedAt:      createdAt,
	})

	m := newTestConvertManager(queuePath)
	m.mu.Lock()
	m.loadLocked()
	m.mu.Unlock()

	runtime, ok := m.jobs["job-orphaned"]
	if !ok {
		t.Fatal("job-orphaned was not loaded into m.jobs at all")
	}
	job := runtime.job

	if job.State != ConvertQueued {
		t.Fatalf("State = %q, want %q -- a job left running by a process that no longer exists must be resumed as queued", job.State, ConvertQueued)
	}
	if job.TempOutputPath != "" {
		t.Fatalf("TempOutputPath = %q, want empty after recovery", job.TempOutputPath)
	}
	if job.Message != "Resumed after restart." {
		t.Fatalf("Message = %q, want %q", job.Message, "Resumed after restart.")
	}
	if !job.UpdatedAt.After(createdAt) {
		t.Fatalf("UpdatedAt = %v, want it advanced past the original CreatedAt (%v) to reflect the recovery", job.UpdatedAt, createdAt)
	}
	// Every other field the job carried survives untouched -- recovery
	// resets state, not identity.
	if job.SourceFormat != "docx" || job.TargetFormat != "pdf" || job.InputFilename != "input.docx" {
		t.Fatalf("recovery must not disturb unrelated fields, got %+v", job)
	}

	if _, err := os.Stat(tempOutputPath); !os.IsNotExist(err) {
		t.Fatalf("orphaned temp output file %q still exists after recovery (stat err = %v), want it removed", tempOutputPath, err)
	}
}

// TestConvertManagerLoadLocked_NonRunningJobsUntouched is the contrasting
// case: a job that was queued, completed, failed, or canceled when the
// process last persisted the queue must come back exactly as it was --
// loadLocked's recovery branch must fire only for ConvertRunning, never
// silently rewrite every job's Message/UpdatedAt on every single startup.
func TestConvertManagerLoadLocked_NonRunningJobsUntouched(t *testing.T) {
	dir := t.TempDir()
	queuePath := filepath.Join(dir, "convert-queue.json")
	stamp := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)

	writeConvertQueueFile(t, queuePath,
		ConvertJob{ID: "job-queued", State: ConvertQueued, Message: "waiting its turn", CreatedAt: stamp, UpdatedAt: stamp},
		ConvertJob{ID: "job-completed", State: ConvertCompleted, OutputPath: filepath.Join(dir, "out.pdf"), CreatedAt: stamp, UpdatedAt: stamp},
		ConvertJob{ID: "job-failed", State: ConvertFailed, Error: "boom", CreatedAt: stamp, UpdatedAt: stamp},
		ConvertJob{ID: "job-canceled", State: ConvertCanceled, CreatedAt: stamp, UpdatedAt: stamp},
	)

	m := newTestConvertManager(queuePath)
	m.mu.Lock()
	m.loadLocked()
	m.mu.Unlock()

	for id, wantState := range map[string]ConvertJobState{
		"job-queued":    ConvertQueued,
		"job-completed": ConvertCompleted,
		"job-failed":    ConvertFailed,
		"job-canceled":  ConvertCanceled,
	} {
		runtime, ok := m.jobs[id]
		if !ok {
			t.Fatalf("%s was not loaded", id)
		}
		if runtime.job.State != wantState {
			t.Fatalf("%s: State = %q, want %q (unchanged)", id, runtime.job.State, wantState)
		}
		if !runtime.job.UpdatedAt.Equal(stamp) {
			t.Fatalf("%s: UpdatedAt = %v, want untouched original %v -- recovery must only rewrite jobs that were genuinely running", id, runtime.job.UpdatedAt, stamp)
		}
	}
	if m.jobs["job-queued"].job.Message != "waiting its turn" {
		t.Fatalf("job-queued Message = %q, want its original message preserved", m.jobs["job-queued"].job.Message)
	}
}

// TestConvertManagerLoadLocked_RunningJobWithNoTempFileIsStillRecovered
// covers the case where TempOutputPath was already empty (e.g. the crash
// happened before any temp file was even created): recovery must still
// flip the job back to queued, and os.Remove("") must never be called or
// panic.
func TestConvertManagerLoadLocked_RunningJobWithNoTempFileIsStillRecovered(t *testing.T) {
	dir := t.TempDir()
	queuePath := filepath.Join(dir, "convert-queue.json")

	writeConvertQueueFile(t, queuePath, ConvertJob{
		ID:             "job-no-temp-yet",
		State:          ConvertRunning,
		TempOutputPath: "",
		CreatedAt:      time.Now(),
		UpdatedAt:      time.Now(),
	})

	m := newTestConvertManager(queuePath)
	m.mu.Lock()
	m.loadLocked()
	m.mu.Unlock()

	runtime, ok := m.jobs["job-no-temp-yet"]
	if !ok {
		t.Fatal("job-no-temp-yet was not loaded")
	}
	if runtime.job.State != ConvertQueued {
		t.Fatalf("State = %q, want %q", runtime.job.State, ConvertQueued)
	}
	if runtime.job.TempOutputPath != "" {
		t.Fatalf("TempOutputPath = %q, want empty", runtime.job.TempOutputPath)
	}
}

// TestConvertManagerLoadLocked_IsIdempotentPerInstance proves the m.loaded
// guard actually gates re-entry: calling loadLocked a second time on the
// same manager instance must not re-read the file (and, critically, must
// not re-append the same job IDs into m.order, which would otherwise
// double-list every job in the on-disk queue and in the UI).
func TestConvertManagerLoadLocked_IsIdempotentPerInstance(t *testing.T) {
	dir := t.TempDir()
	queuePath := filepath.Join(dir, "convert-queue.json")
	writeConvertQueueFile(t, queuePath, ConvertJob{ID: "job-1", State: ConvertQueued, CreatedAt: time.Now(), UpdatedAt: time.Now()})

	m := newTestConvertManager(queuePath)
	m.mu.Lock()
	m.loadLocked()
	m.loadLocked()
	m.mu.Unlock()

	if len(m.order) != 1 {
		t.Fatalf("m.order = %v, want exactly one entry after two loadLocked calls on the same instance", m.order)
	}
	if len(m.jobs) != 1 {
		t.Fatalf("len(m.jobs) = %d, want 1", len(m.jobs))
	}
}

// TestConvertManagerPersistLocked_RoundTripsThroughFreshManager proves
// persistLocked + a fresh manager's loadLocked genuinely round-trip real
// job state through the real filesystem (not just through memory), the
// same real path a desktop app restart takes: jobs saved by one process
// instance are recovered by the next.
func TestConvertManagerPersistLocked_RoundTripsThroughFreshManager(t *testing.T) {
	dir := t.TempDir()
	queuePath := filepath.Join(dir, "convert-queue.json")

	writer := newTestConvertManager(queuePath)
	writer.mu.Lock()
	writer.loaded = true // skip loadLocked's file read -- nothing on disk yet
	now := time.Now()
	writer.jobs["job-a"] = &convertJobRuntime{job: ConvertJob{
		ID: "job-a", InputFilename: "a.csv", SourceFormat: "csv", TargetFormat: "json",
		State: ConvertCompleted, OutputPath: filepath.Join(dir, "a.json"), CreatedAt: now, UpdatedAt: now,
	}}
	writer.order = append(writer.order, "job-a")
	if err := writer.persistLocked(); err != nil {
		t.Fatalf("persistLocked: %v", err)
	}
	writer.mu.Unlock()

	if _, err := os.Stat(queuePath); err != nil {
		t.Fatalf("queue file was not written to disk: %v", err)
	}

	reader := newTestConvertManager(queuePath)
	reader.mu.Lock()
	reader.loadLocked()
	reader.mu.Unlock()

	runtime, ok := reader.jobs["job-a"]
	if !ok {
		t.Fatal("job-a was not recovered by a fresh manager instance reading the same path")
	}
	if runtime.job.SourceFormat != "csv" || runtime.job.TargetFormat != "json" || runtime.job.State != ConvertCompleted {
		t.Fatalf("recovered job = %+v, want the exact fields persisted", runtime.job)
	}
}
