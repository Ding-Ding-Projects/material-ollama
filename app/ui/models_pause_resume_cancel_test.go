//go:build windows || darwin

package ui

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

// --- pull-queue: pullPause/pullResume/pullCancel's real state-guard ------
// --- rejections, driven through the real HTTP handler methods ------------
//
// models_test.go's own header explains why tryDispatchLocked/runJob stay
// untested here: they talk to a real local Ollama API client, and driving
// them would need either a real running server or mocking that client,
// both out of this lane's bounded scope. Every case below deliberately
// stays on this side of that line: each is a job state the guard rejects
// BEFORE the handler ever touches job.cancel, persists anything, or
// dispatches -- so no subprocess, no network call, and no background
// goroutine is ever started. The one state-mutating case
// (TestPullResume_TransitionsAPausedJobBackToQueuedWithoutDispatching)
// fills every dispatch slot with synthetic already-downloading jobs first,
// so modelsMaxConcurrency alone blocks tryDispatchLocked from ever
// reaching a real dispatch.
//
// modelsManager() is a package-level singleton bound to the REAL user's
// %LOCALAPPDATA%\Ollama\model-pull-queue.json (see modelsQueuePath) --
// these tests must never touch that real file. Because this test file is
// in the same package as models.go, it injects a manager pointed at a
// t.TempDir() path directly into the package-level singleton var before
// modelsManager() is ever called in this test binary (confirmed by grep:
// no other test in this package calls s.modelsManager() or references
// modelsManagerInst/modelsManagerOnce), rather than reaching for any
// production-code change to make the manager injectable.
func injectTestModelsManagerSingleton(t *testing.T) *modelsManager {
	t.Helper()
	m := newTestModelsManager(filepath.Join(t.TempDir(), "model-pull-queue.json"))
	m.loaded = true // guarantees no disk read ever happens, belt and suspenders
	modelsManagerInst = m
	modelsManagerOnce.Do(func() {}) // no-op if Once already fired elsewhere; harmless either way
	return m
}

func TestPullPause_RejectsJobNotCurrentlyDownloading(t *testing.T) {
	m := injectTestModelsManagerSingleton(t)
	id := "job-queued"
	m.jobs[id] = &pullJob{item: PullQueueItem{ID: id, Model: "llama3.2", State: PullQueued}}
	m.order = []string{id}

	s := &Server{}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/models/pull/"+id+"/pause", nil)
	req.SetPathValue("id", id)
	rec := httptest.NewRecorder()

	err := s.pullPause(rec, req)
	if err == nil {
		t.Fatal("expected pullPause to reject a job that is not downloading, got nil error")
	}
	wantMsg := `cannot pause a job in state "queued"`
	if err.Error() != wantMsg {
		t.Fatalf("error = %q, want %q", err.Error(), wantMsg)
	}

	// The guard must return before ever setting pauseRequested.
	if m.jobs[id].pauseRequested {
		t.Fatal("expected pauseRequested to remain false when the guard rejects the request")
	}
}

func TestPullResume_RejectsJobThatIsActivelyDownloading(t *testing.T) {
	m := injectTestModelsManagerSingleton(t)
	id := "job-downloading"
	m.jobs[id] = &pullJob{item: PullQueueItem{ID: id, Model: "llama3.2", State: PullDownloading}}
	m.order = []string{id}

	s := &Server{}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/models/pull/"+id+"/resume", nil)
	req.SetPathValue("id", id)
	rec := httptest.NewRecorder()

	err := s.pullResume(rec, req)
	if err == nil {
		t.Fatal("expected pullResume to reject a job that is already downloading, got nil error")
	}
	wantMsg := `cannot resume a job in state "downloading"`
	if err.Error() != wantMsg {
		t.Fatalf("error = %q, want %q", err.Error(), wantMsg)
	}
	if m.jobs[id].item.State != PullDownloading {
		t.Fatalf("expected state to remain unchanged at %q, got %q", PullDownloading, m.jobs[id].item.State)
	}
}

func TestPullCancel_RejectsAlreadyCompletedJob(t *testing.T) {
	m := injectTestModelsManagerSingleton(t)
	id := "job-completed"
	m.jobs[id] = &pullJob{item: PullQueueItem{ID: id, Model: "llama3.2", State: PullCompleted}}
	m.order = []string{id}

	s := &Server{}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/models/pull/"+id+"/cancel", nil)
	req.SetPathValue("id", id)
	rec := httptest.NewRecorder()

	err := s.pullCancel(rec, req)
	if err == nil {
		t.Fatal("expected pullCancel to reject an already-completed job, got nil error")
	}
	wantMsg := `job is already "completed"`
	if err.Error() != wantMsg {
		t.Fatalf("error = %q, want %q", err.Error(), wantMsg)
	}
}

// TestPullResume_TransitionsAPausedJobBackToQueuedWithoutDispatching proves
// the one state-mutating success path that is still safe to exercise here:
// resuming a paused job flips it to PullQueued, clears its prior error, and
// persists that change to disk, all before tryDispatchLocked runs.
// tryDispatchLocked WILL be invoked for real (pullResume always calls it),
// so every dispatch slot is pre-filled with a synthetic already-downloading
// job of a different repo -- modelsMaxConcurrency alone then makes
// tryDispatchLocked return at the top of its loop before it ever looks at
// job states, runningRepoKeys, or spawns a goroutine.
func TestPullResume_TransitionsAPausedJobBackToQueuedWithoutDispatching(t *testing.T) {
	m := injectTestModelsManagerSingleton(t)

	for i := 0; i < modelsMaxConcurrency; i++ {
		busyID := "busy-job"
		if i == 1 {
			busyID = "busy-job-2"
		}
		m.jobs[busyID] = &pullJob{item: PullQueueItem{ID: busyID, Model: "other-model", State: PullDownloading}}
		m.order = append(m.order, busyID)
	}
	m.activeCount = modelsMaxConcurrency

	id := "job-paused"
	m.jobs[id] = &pullJob{item: PullQueueItem{ID: id, Model: "llama3.2", State: PullPaused, Error: "connection reset"}}
	m.order = append(m.order, id)

	s := &Server{}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/models/pull/"+id+"/resume", nil)
	req.SetPathValue("id", id)
	rec := httptest.NewRecorder()

	if err := s.pullResume(rec, req); err != nil {
		t.Fatalf("pullResume: unexpected error: %v", err)
	}

	m.mu.Lock()
	got := m.jobs[id].item
	m.mu.Unlock()
	if got.State != PullQueued {
		t.Fatalf("expected state %q, got %q", PullQueued, got.State)
	}
	if got.Error != "" {
		t.Fatalf("expected Error cleared, got %q", got.Error)
	}
	if got.Message != "Queued to resume." {
		t.Fatalf("expected Message %q, got %q", "Queued to resume.", got.Message)
	}

	// Prove the resume was actually persisted, not just held in memory.
	reloaded := newTestModelsManager(m.path)
	reloaded.mu.Lock()
	reloaded.loadLocked()
	reloadedState := reloaded.jobs[id].item.State
	reloaded.mu.Unlock()
	if reloadedState != PullQueued {
		t.Fatalf("expected persisted state %q, got %q", PullQueued, reloadedState)
	}
}
