//go:build windows || darwin

package ui

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// --- pull-queue: repoKey, and modelsManager's real persistence/recovery -
//
// The "pull-queue" suite area's own Notes say the real implementation
// exists (models.go's pull endpoint, PullQueueCard.tsx) but "nothing to
// cite" -- no *_test.go exercises it at all. This covers the synchronous,
// side-effect-free half of that implementation for real: repoKey's
// same-repo grouping, and modelsManager.loadLocked/persistLocked's real
// file round trip and its startup "downloading is a lie" recovery, the
// same contract convertManager.loadLocked has for the conversion queue.
// Dispatch itself (tryDispatchLocked -> runJob) is deliberately NOT
// exercised here: runJob talks to a real local Ollama API client, and
// driving it in a unit test would mean either a real running server (not
// available in this environment) or reaching past this lane's bounded
// scope into mocking the Ollama client -- see this file's own inventory
// row update for the honest "partial" accounting.

// TestRepoKey proves repoKey's exact contract: everything before the
// first ':' groups two tags of the same repo together (Ollama's
// blobDownloadManager is digest-keyed with a refcount, and two tags of
// one repo very often share layers -- see repoKey's own doc comment on
// runningRepoKeys), while a bare tagless reference is its own repo key
// unchanged.
func TestRepoKey(t *testing.T) {
	cases := []struct {
		model string
		want  string
	}{
		{"llama3:8b", "llama3"},
		{"llama3:70b", "llama3"},
		{"library/llama3:latest", "library/llama3"},
		{"mistral", "mistral"}, // no ':' at all
		{"", ""},
	}
	for _, c := range cases {
		t.Run(c.model, func(t *testing.T) {
			if got := repoKey(c.model); got != c.want {
				t.Fatalf("repoKey(%q) = %q, want %q", c.model, got, c.want)
			}
		})
	}
}

func newTestModelsManager(path string) *modelsManager {
	return &modelsManager{
		jobs:            make(map[string]*pullJob),
		subscribers:     make(map[chan modelsQueueEvent]struct{}),
		runningRepoKeys: make(map[string]struct{}),
		path:            path,
	}
}

func writeModelsQueueFile(t *testing.T, path string, items ...PullQueueItem) {
	t.Helper()
	file := modelsQueueFile{Version: 1, Items: items}
	data, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		t.Fatalf("marshal fixture queue file: %v", err)
	}
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatalf("write fixture queue file: %v", err)
	}
}

// TestModelsManagerLoadLocked_DownloadingResetToQueuedOnRecovery mirrors
// convertManager's identical contract (see
// convert_queue_recovery_test.go): the process that was actively
// downloading a model is gone by the time the app restarts, so
// "downloading" is a lie at startup -- loadLocked must reset it to
// "queued" with the documented recovery message, per its own comment
// that Ollama's resumable-partial-file support means this really does
// continue the download rather than restart it from zero.
func TestModelsManagerLoadLocked_DownloadingResetToQueuedOnRecovery(t *testing.T) {
	dir := t.TempDir()
	queuePath := filepath.Join(dir, "model-pull-queue.json")
	createdAt := time.Now().Add(-time.Hour)

	writeModelsQueueFile(t, queuePath, PullQueueItem{
		ID:             "pull-1",
		Model:          "llama3:8b",
		State:          PullDownloading,
		TotalBytes:     4 << 30,
		CompletedBytes: 1 << 30,
		CreatedAt:      createdAt,
		UpdatedAt:      createdAt,
	})

	m := newTestModelsManager(queuePath)
	m.mu.Lock()
	m.loadLocked()
	m.mu.Unlock()

	job, ok := m.jobs["pull-1"]
	if !ok {
		t.Fatal("pull-1 was not loaded")
	}
	if job.item.State != PullQueued {
		t.Fatalf("State = %q, want %q", job.item.State, PullQueued)
	}
	if job.item.Message != "Resumed after restart." {
		t.Fatalf("Message = %q, want %q", job.item.Message, "Resumed after restart.")
	}
	// Recovery resets state/message only -- the progress already made
	// toward the download must survive so a resumed pull genuinely
	// continues rather than silently forgetting what was already fetched.
	if job.item.CompletedBytes != 1<<30 {
		t.Fatalf("CompletedBytes = %d, want the pre-restart progress (%d) preserved", job.item.CompletedBytes, int64(1<<30))
	}
	if job.item.Model != "llama3:8b" {
		t.Fatalf("Model = %q, want %q", job.item.Model, "llama3:8b")
	}
}

// TestModelsManagerLoadLocked_TerminalStatesUntouched proves the recovery
// branch fires only for PullDownloading, leaving queued/completed/failed/
// canceled/paused items exactly as persisted.
func TestModelsManagerLoadLocked_TerminalStatesUntouched(t *testing.T) {
	dir := t.TempDir()
	queuePath := filepath.Join(dir, "model-pull-queue.json")
	stamp := time.Date(2026, 3, 4, 5, 6, 7, 0, time.UTC)

	writeModelsQueueFile(t, queuePath,
		PullQueueItem{ID: "p-queued", Model: "a:1", State: PullQueued, CreatedAt: stamp, UpdatedAt: stamp},
		PullQueueItem{ID: "p-completed", Model: "b:1", State: PullCompleted, CreatedAt: stamp, UpdatedAt: stamp},
		PullQueueItem{ID: "p-failed", Model: "c:1", State: PullFailed, Error: "network", CreatedAt: stamp, UpdatedAt: stamp},
		PullQueueItem{ID: "p-canceled", Model: "d:1", State: PullCanceled, CreatedAt: stamp, UpdatedAt: stamp},
		PullQueueItem{ID: "p-paused", Model: "e:1", State: PullPaused, CreatedAt: stamp, UpdatedAt: stamp},
	)

	m := newTestModelsManager(queuePath)
	m.mu.Lock()
	m.loadLocked()
	m.mu.Unlock()

	want := map[string]PullState{
		"p-queued":    PullQueued,
		"p-completed": PullCompleted,
		"p-failed":    PullFailed,
		"p-canceled":  PullCanceled,
		"p-paused":    PullPaused,
	}
	for id, wantState := range want {
		job, ok := m.jobs[id]
		if !ok {
			t.Fatalf("%s was not loaded", id)
		}
		if job.item.State != wantState {
			t.Fatalf("%s: State = %q, want %q (unchanged)", id, job.item.State, wantState)
		}
		if !job.item.UpdatedAt.Equal(stamp) {
			t.Fatalf("%s: UpdatedAt = %v, want untouched %v", id, job.item.UpdatedAt, stamp)
		}
	}
}

// TestModelsManagerPersistLocked_RoundTripsThroughFreshManager proves the
// real file-based recovery path an app restart actually takes: items
// saved by one manager instance are recovered, in order, by a fresh
// instance reading the same path.
func TestModelsManagerPersistLocked_RoundTripsThroughFreshManager(t *testing.T) {
	dir := t.TempDir()
	queuePath := filepath.Join(dir, "model-pull-queue.json")

	writer := newTestModelsManager(queuePath)
	writer.mu.Lock()
	writer.loaded = true
	now := time.Now()
	writer.jobs["p-a"] = &pullJob{item: PullQueueItem{ID: "p-a", Model: "llama3:8b", State: PullCompleted, CreatedAt: now, UpdatedAt: now}}
	writer.order = append(writer.order, "p-a")
	writer.jobs["p-b"] = &pullJob{item: PullQueueItem{ID: "p-b", Model: "mistral:7b", State: PullQueued, CreatedAt: now, UpdatedAt: now}}
	writer.order = append(writer.order, "p-b")
	if err := writer.persistLocked(); err != nil {
		t.Fatalf("persistLocked: %v", err)
	}
	writer.mu.Unlock()

	reader := newTestModelsManager(queuePath)
	reader.mu.Lock()
	reader.loadLocked()
	reader.mu.Unlock()

	if len(reader.order) != 2 || reader.order[0] != "p-a" || reader.order[1] != "p-b" {
		t.Fatalf("order = %v, want [p-a p-b] (persisted order preserved)", reader.order)
	}
	if job, ok := reader.jobs["p-a"]; !ok || job.item.Model != "llama3:8b" || job.item.State != PullCompleted {
		t.Fatalf("p-a recovered = %+v, ok=%v, want Model=llama3:8b State=completed", job, ok)
	}
	if job, ok := reader.jobs["p-b"]; !ok || job.item.Model != "mistral:7b" || job.item.State != PullQueued {
		t.Fatalf("p-b recovered = %+v, ok=%v, want Model=mistral:7b State=queued", job, ok)
	}
}

// TestModelsManagerItemsLocked_FollowsOrderNotMapIteration proves
// itemsLocked returns items in m.order (insertion order), not Go's
// randomized map iteration order -- the SSE snapshot and the on-demand GET
// both depend on this for a stable, predictable queue listing.
func TestModelsManagerItemsLocked_FollowsOrderNotMapIteration(t *testing.T) {
	m := newTestModelsManager(filepath.Join(t.TempDir(), "unused.json"))
	m.loaded = true
	now := time.Now()
	for _, id := range []string{"z-last", "a-first", "m-middle"} {
		m.jobs[id] = &pullJob{item: PullQueueItem{ID: id, CreatedAt: now, UpdatedAt: now}}
	}
	m.order = []string{"z-last", "a-first", "m-middle"}

	items := m.itemsLocked()
	if len(items) != 3 {
		t.Fatalf("len(items) = %d, want 3", len(items))
	}
	wantOrder := []string{"z-last", "a-first", "m-middle"}
	for i, want := range wantOrder {
		if items[i].ID != want {
			t.Fatalf("items[%d].ID = %q, want %q (itemsLocked must follow m.order)", i, items[i].ID, want)
		}
	}
}
