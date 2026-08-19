//go:build windows || darwin

package ui

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/ollama/ollama/api"
	"github.com/ollama/ollama/envconfig"
	"github.com/ollama/ollama/format"
	"github.com/ollama/ollama/manifest"
)

// Model pull/delete/queue management is deliberately its own set of
// /api/v1/* routes rather than additions to the existing Ollama reverse
// proxy allow-list in ui.go. Three independently sufficient reasons:
//
//  1. The proxy has no per-route policy, so allow-listing DELETE
//     /api/delete would hand the renderer unmediated model deletion with
//     no server-side confirmation gate.
//  2. A pull must outlive the HTTP request that started it. A proxied
//     stream dies the moment the renderer navigates away or reloads; a
//     server-owned background job does not.
//  3. The queue (ordering, concurrency, pause/resume/cancel state) has to
//     be owned by the server, not reconstructed by whichever browser tab
//     happens to be open.

// PullState is the lifecycle of one queued pull.
type PullState string

const (
	PullQueued      PullState = "queued"
	PullDownloading PullState = "downloading"
	PullPaused      PullState = "paused"
	PullCompleted   PullState = "completed"
	PullFailed      PullState = "failed"
	PullCanceled    PullState = "canceled"
)

// PullQueueItem is the persisted, JSON-serialized shape of one pull job.
// Fit is deliberately NOT a field here: unlike an installed model (whose
// size is always known), a queued item's size is only known once its
// manifest resolves, and computing a verdict on every persisted/broadcast
// snapshot would mean an extra local ListRunning round-trip on every
// progress tick. See attachFitVerdicts, called only for the on-demand GET
// and the SSE connect snapshot, for where a queue item does get one.
type PullQueueItem struct {
	ID             string    `json:"id"`
	Model          string    `json:"model"`
	State          PullState `json:"state"`
	Status         string    `json:"status,omitempty"` // last raw status string from api.ProgressResponse
	TotalBytes     int64     `json:"totalBytes,omitempty"`
	CompletedBytes int64     `json:"completedBytes,omitempty"`
	Error          string    `json:"error,omitempty"`
	Message        string    `json:"message,omitempty"` // human-readable state explanation, e.g. the pause/cancel copy below
	CreatedAt      time.Time `json:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt"`
}

// PullQueueItemWithFit is what the on-demand GET and the SSE connect
// snapshot actually serve: the queue item plus a fit verdict once its size
// is known. Kept as a wrapper rather than a field on PullQueueItem itself
// so the frequent progress-only broadcasts (see modelsProgressThrottle)
// never pay for a verdict nobody asked for on that tick.
type PullQueueItemWithFit struct {
	PullQueueItem
	Fit *FitVerdict `json:"fit,omitempty"`
}

// pullJob is the runtime wrapper around a PullQueueItem. Every field on it
// -- including the embedded item -- is only ever touched while holding
// modelsManager.mu; there is deliberately no separate per-job mutex, to
// keep the locking discipline for this whole file to "one lock, always".
type pullJob struct {
	item PullQueueItem

	cancel context.CancelFunc

	// seenDigests, requiredByDigest and completedByDigest are runtime-only
	// (never persisted): they track the current/most-recent run's progress
	// stream so the storage preflight and delete-on-cancel cleanup can work
	// from real reported sizes, per digest.
	seenDigests       map[string]struct{}
	requiredByDigest  map[string]int64
	completedByDigest map[string]int64
	preflightDone     bool

	pauseRequested  bool
	cancelRequested bool
	deleteOnCancel  bool

	lastPublishedAt time.Time
}

type modelsQueueFile struct {
	Version int             `json:"version"`
	Items   []PullQueueItem `json:"items"`
}

// modelsManager owns the whole pull queue: persistence, dispatch, and the
// SSE fan-out. It is a package-level singleton (see (*Server).modelsManager
// below) rather than a field on Server, because this lane's allowed edits
// to ui.go are limited to route registration inside Handler() -- adding a
// field to the Server struct is out of scope for this file.
type modelsManager struct {
	mu    sync.Mutex
	jobs  map[string]*pullJob
	order []string // job IDs, oldest first

	path   string
	loaded bool

	subscribers map[chan modelsQueueEvent]struct{}

	activeCount int
	// runningRepoKeys serializes pulls whose model name shares a repo (the
	// part before ':'). Ollama's blobDownloadManager (server/download.go)
	// is keyed by digest with a refcount; two different tags of the same
	// repo very often share layers (base weights, template, license), and
	// pausing one job cancels its context out from under a shared
	// in-flight blob download. We can't cheaply know the *actual* shared
	// digests without resolving both manifests first, so this is a
	// deliberately conservative proxy: same repo, one at a time.
	runningRepoKeys map[string]struct{}
}

const (
	modelsMaxConcurrency   = 2
	modelsProgressThrottle = 250 * time.Millisecond
	modelsMinFreeDiskFloor = 512 * 1024 * 1024 // refuse to even queue below this; see pullEnqueue
)

var (
	modelsManagerOnce sync.Once
	modelsManagerInst *modelsManager
)

// modelsManager lazily builds the package-level singleton and makes sure
// its persisted queue has been loaded. s is only used for logging.
func (s *Server) modelsManager() *modelsManager {
	modelsManagerOnce.Do(func() {
		modelsManagerInst = &modelsManager{
			jobs:            make(map[string]*pullJob),
			subscribers:     make(map[chan modelsQueueEvent]struct{}),
			runningRepoKeys: make(map[string]struct{}),
			path:            modelsQueuePath(),
		}
	})
	m := modelsManagerInst
	m.mu.Lock()
	m.loadLocked()
	m.mu.Unlock()
	return m
}

func modelsQueuePath() string {
	if runtime.GOOS == "windows" {
		return filepath.Join(os.Getenv("LOCALAPPDATA"), "Ollama", "model-pull-queue.json")
	}
	return filepath.Join(os.Getenv("HOME"), "Library", "Application Support", "Ollama", "model-pull-queue.json")
}

func (m *modelsManager) loadLocked() {
	if m.loaded {
		return
	}
	m.loaded = true

	data, err := os.ReadFile(m.path)
	if err != nil {
		return
	}
	var file modelsQueueFile
	if json.Unmarshal(data, &file) != nil || file.Version != 1 {
		return
	}
	for _, item := range file.Items {
		// The process that was running this job is gone; "downloading" is
		// a lie at startup. Reset it to queued so the dispatcher picks it
		// back up (Ollama's own resumable-partial-file support means this
		// really does continue rather than restart).
		if item.State == PullDownloading {
			item.State = PullQueued
			item.Message = "Resumed after restart."
		}
		job := &pullJob{item: item}
		m.jobs[item.ID] = job
		m.order = append(m.order, item.ID)
	}
}

func (m *modelsManager) persistLocked() error {
	if err := os.MkdirAll(filepath.Dir(m.path), 0o755); err != nil {
		return err
	}
	file := modelsQueueFile{Version: 1, Items: m.itemsLocked()}
	data, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(m.path), ".model-pull-queue-*.json")
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

func (m *modelsManager) itemsLocked() []PullQueueItem {
	items := make([]PullQueueItem, 0, len(m.order))
	for _, id := range m.order {
		if job, ok := m.jobs[id]; ok {
			items = append(items, job.item)
		}
	}
	return items
}

// --- SSE fan-out --------------------------------------------------------

type modelsQueueEvent struct {
	Name string `json:"-"`
	Data any    `json:"-"`
}

func (m *modelsManager) publish(ev modelsQueueEvent) {
	m.mu.Lock()
	subs := make([]chan modelsQueueEvent, 0, len(m.subscribers))
	for ch := range m.subscribers {
		subs = append(subs, ch)
	}
	m.mu.Unlock()
	for _, ch := range subs {
		select {
		case ch <- ev:
		default:
			// A slow subscriber must never block the whole queue; it just
			// misses an intermediate update and catches up on the next one
			// (every published "queue" event is a full snapshot, so this
			// is always eventually consistent, never a partial diff loss).
		}
	}
}

func (m *modelsManager) subscribe() (chan modelsQueueEvent, func()) {
	ch := make(chan modelsQueueEvent, 32)
	m.mu.Lock()
	m.subscribers[ch] = struct{}{}
	m.mu.Unlock()
	return ch, func() {
		m.mu.Lock()
		delete(m.subscribers, ch)
		m.mu.Unlock()
	}
}

// --- dispatch ------------------------------------------------------------

// repoKey returns the part of a model reference before ':', used only to
// serialize potentially-blob-sharing pulls against each other (see
// modelsManager.runningRepoKeys).
func repoKey(modelName string) string {
	if i := strings.IndexByte(modelName, ':'); i >= 0 {
		return modelName[:i]
	}
	return modelName
}

// tryDispatchLocked starts as many queued jobs as modelsMaxConcurrency and
// runningRepoKeys allow. Must be called with m.mu held; it returns with
// m.mu still held.
func (m *modelsManager) tryDispatchLocked(s *Server) {
	for _, id := range m.order {
		if m.activeCount >= modelsMaxConcurrency {
			return
		}
		job, ok := m.jobs[id]
		if !ok || job.item.State != PullQueued {
			continue
		}
		key := repoKey(job.item.Model)
		if _, busy := m.runningRepoKeys[key]; busy {
			continue
		}

		m.activeCount++
		m.runningRepoKeys[key] = struct{}{}
		job.item.State = PullDownloading
		job.item.Message = ""
		job.item.UpdatedAt = time.Now()

		go m.runJob(s, id, key)
	}
}

// runJob drives one pull to completion, pause, cancel, or failure. It is
// started as its own goroutine by tryDispatchLocked and must not be called
// with m.mu held.
func (m *modelsManager) runJob(s *Server, id, key string) {
	m.mu.Lock()
	job, ok := m.jobs[id]
	if !ok {
		m.mu.Unlock()
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	job.cancel = cancel
	job.seenDigests = map[string]struct{}{}
	job.requiredByDigest = map[string]int64{}
	job.completedByDigest = map[string]int64{}
	job.preflightDone = false
	job.pauseRequested = false
	job.cancelRequested = false
	modelName := job.item.Model
	m.mu.Unlock()

	client := s.inferenceClient()
	modelsDir := envconfig.Models()

	pullErr := client.Pull(ctx, &api.PullRequest{Model: modelName}, func(resp api.ProgressResponse) error {
		m.mu.Lock()
		job, ok := m.jobs[id]
		if !ok {
			m.mu.Unlock()
			return errors.New("pull job no longer tracked")
		}

		job.item.Status = resp.Status
		if resp.Digest != "" {
			job.seenDigests[resp.Digest] = struct{}{}
			job.requiredByDigest[resp.Digest] = resp.Total
			job.completedByDigest[resp.Digest] = resp.Completed
		}

		var totalRequired, totalCompleted int64
		for _, v := range job.requiredByDigest {
			totalRequired += v
		}
		for _, v := range job.completedByDigest {
			totalCompleted += v
		}
		job.item.TotalBytes = totalRequired
		job.item.CompletedBytes = totalCompleted
		job.item.UpdatedAt = time.Now()

		// Storage preflight: the moment we learn ANY real size (typically
		// on the very first progress event, right after the manifest
		// resolves and well before any of a large blob's bytes have
		// transferred), compare the outstanding bytes we now know we need
		// against free disk space. This fires early -- not "a silent
		// failure three minutes in" -- because Ollama's server reports
		// "pulling manifest" then per-digest Total/Completed almost
		// immediately (server/images.go); it is not a guess and it is not
		// a fixed pre-admission size check, because the real size genuinely
		// isn't knowable before the pull starts (there is no manifest-only
		// API on api.Client to ask first).
		needPreflight := !job.preflightDone && totalRequired > 0
		if needPreflight {
			job.preflightDone = true
		}

		shouldPublish := needPreflight
		if !shouldPublish && time.Since(job.lastPublishedAt) >= modelsProgressThrottle {
			shouldPublish = true
		}
		if shouldPublish {
			job.lastPublishedAt = time.Now()
		}
		snapshot := m.itemsLocked()
		m.mu.Unlock()

		if needPreflight {
			needed := totalRequired - totalCompleted
			if needed > 0 {
				if free, ferr := freeDiskBytes(existingDirFor(modelsDir)); ferr == nil && uint64(needed) > free {
					return fmt.Errorf("needs %s; %s free on %s", format.HumanBytes2(uint64(totalRequired)), format.HumanBytes2(free), modelsDir)
				}
			}
		}

		if shouldPublish {
			m.publish(modelsQueueEvent{Name: "queue", Data: snapshot})
		}
		return nil
	})

	m.mu.Lock()
	job, ok = m.jobs[id]
	if ok {
		switch {
		case pullErr == nil:
			job.item.State = PullCompleted
			job.item.Status = "success"
			job.item.Error = ""
			job.item.Message = "Pull complete."
		case job.cancelRequested:
			job.item.State = PullCanceled
			job.item.Error = ""
			if job.deleteOnCancel {
				job.item.Message = "Canceled and partial data deleted."
			} else {
				job.item.Message = fmt.Sprintf("Canceled — %s kept on disk for a future resume. Up to one part (~64 MB) may be re-fetched.", format.HumanBytes2(uint64(job.item.CompletedBytes)))
			}
		case job.pauseRequested:
			job.item.State = PullPaused
			job.item.Error = ""
			job.item.Message = fmt.Sprintf("Paused — %s kept on disk. Resuming continues from here. Up to one part (~64 MB) may be re-fetched.", format.HumanBytes2(uint64(job.item.CompletedBytes)))
		default:
			job.item.State = PullFailed
			job.item.Error = pullErr.Error()
			job.item.Message = "Pull failed."
		}
		job.item.UpdatedAt = time.Now()
		job.cancel = nil

		deleteDigests := job.deleteOnCancel && job.item.State == PullCanceled
		var digestsToDelete map[string]struct{}
		if deleteDigests {
			digestsToDelete = job.seenDigests
		}

		m.activeCount--
		delete(m.runningRepoKeys, key)
		m.persistLocked()
		m.tryDispatchLocked(s)
		snapshot := m.itemsLocked()
		m.mu.Unlock()

		if deleteDigests {
			deletePartialFiles(digestsToDelete)
		}
		m.publish(modelsQueueEvent{Name: "queue", Data: snapshot})
		return
	}
	m.activeCount--
	delete(m.runningRepoKeys, key)
	m.tryDispatchLocked(s)
	m.mu.Unlock()
}

// deletePartialFiles removes the "-partial-*" files Ollama's blob
// downloader leaves on disk for a resumable download (server/download.go),
// for every digest a job actually saw progress for. Scoped to exactly the
// digests this job touched -- never a blind sweep of the blobs directory.
func deletePartialFiles(digests map[string]struct{}) {
	for digest := range digests {
		blobPath, err := manifest.BlobsPath(digest)
		if err != nil {
			continue
		}
		matches, err := filepath.Glob(blobPath + "-partial-*")
		if err != nil {
			continue
		}
		for _, match := range matches {
			os.Remove(match)
		}
	}
}

// --- HTTP handlers ---------------------------------------------------

// InstalledModel wraps an installed model with a fit verdict so the
// frontend never has to do its own arithmetic about whether it will run.
type InstalledModel struct {
	api.ListModelResponse
	Fit FitVerdict `json:"fit"`
}

func (s *Server) modelsInstalled(w http.ResponseWriter, r *http.Request) error {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	client := s.inferenceClient()
	listResp, err := client.List(ctx)
	if err != nil {
		return fmt.Errorf("list installed models: %w", err)
	}

	hw := s.cachedHardware(ctx)
	freeVRAM, totalVRAM := vramTotals(hw.Devices)

	var resident []string
	if running, rerr := client.ListRunning(ctx); rerr == nil {
		for _, p := range running.Models {
			resident = append(resident, p.Name)
		}
	}

	items := make([]InstalledModel, len(listResp.Models))
	for i, mdl := range listResp.Models {
		size := uint64(mdl.Size)
		items[i] = InstalledModel{
			ListModelResponse: mdl,
			Fit: computeFitVerdict(fitInputs{
				modelBytes:          &size,
				freeVRAM:            freeVRAM,
				totalVRAM:           totalVRAM,
				freeRAM:             hw.FreeRAM,
				totalRAM:            hw.SystemRAM,
				residentModels:      resident,
				contextLength:       hw.Effective.ContextLength,
				contextLengthSource: hw.Effective.ContextLengthSource,
			}),
		}
	}

	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(map[string]any{"models": items})
}

func (s *Server) modelsRunning(w http.ResponseWriter, r *http.Request) error {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	resp, err := s.inferenceClient().ListRunning(ctx)
	if err != nil {
		return fmt.Errorf("list running models: %w", err)
	}
	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(resp)
}

type pullEnqueueRequest struct {
	Model string `json:"model"`
}

func (s *Server) pullEnqueue(w http.ResponseWriter, r *http.Request) error {
	if r.Method != http.MethodPost {
		return errors.New("method not allowed")
	}
	var req pullEnqueueRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 8*1024)).Decode(&req); err != nil {
		return fmt.Errorf("invalid pull request: %w", err)
	}
	req.Model = strings.TrimSpace(req.Model)
	if req.Model == "" {
		return errors.New("model is required")
	}

	modelsDir := envconfig.Models()
	// A cheap sanity floor before even admitting the job: refuse outright
	// when the volume is already essentially full. This is NOT the real
	// storage preflight -- that happens in runJob's progress callback the
	// moment the model's actual size is known -- this only rejects the
	// obviously-hopeless case immediately rather than queuing it to fail
	// on its first byte.
	if free, err := freeDiskBytes(existingDirFor(modelsDir)); err == nil && free < modelsMinFreeDiskFloor {
		return fmt.Errorf("needs at least %s free; only %s free on %s", format.HumanBytes2(modelsMinFreeDiskFloor), format.HumanBytes2(free), modelsDir)
	}

	id := uuid.NewString()
	now := time.Now()
	item := PullQueueItem{
		ID:        id,
		Model:     req.Model,
		State:     PullQueued,
		Message:   "Queued.",
		CreatedAt: now,
		UpdatedAt: now,
	}

	m := s.modelsManager()
	m.mu.Lock()
	m.jobs[id] = &pullJob{item: item}
	m.order = append(m.order, id)
	m.persistLocked()
	m.tryDispatchLocked(s)
	snapshot := m.itemsLocked()
	current := m.jobs[id].item
	m.mu.Unlock()

	m.publish(modelsQueueEvent{Name: "queue", Data: snapshot})

	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(current)
}

func (s *Server) pullQueueList(w http.ResponseWriter, r *http.Request) error {
	m := s.modelsManager()
	m.mu.Lock()
	items := m.itemsLocked()
	m.mu.Unlock()

	withFit := s.attachFitVerdicts(r.Context(), items)

	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(map[string]any{"items": withFit})
}

// attachFitVerdicts computes a fit verdict for every item whose size is
// already known (TotalBytes > 0), against the current cached hardware
// snapshot. Deliberately never called while modelsManager.mu is held: it
// does a local ListRunning round-trip, and cachedHardware can occasionally
// take up to hardwareTotalBudget on a cold cache, neither of which should
// block queue mutations (pause/resume/cancel/dispatch).
func (s *Server) attachFitVerdicts(ctx context.Context, items []PullQueueItem) []PullQueueItemWithFit {
	hw := s.cachedHardware(ctx)
	freeVRAM, totalVRAM := vramTotals(hw.Devices)

	var resident []string
	if running, err := s.inferenceClient().ListRunning(ctx); err == nil {
		for _, p := range running.Models {
			resident = append(resident, p.Name)
		}
	}

	out := make([]PullQueueItemWithFit, len(items))
	for i, item := range items {
		out[i] = PullQueueItemWithFit{PullQueueItem: item}
		if item.TotalBytes <= 0 {
			continue
		}
		size := uint64(item.TotalBytes)
		verdict := computeFitVerdict(fitInputs{
			modelBytes:          &size,
			freeVRAM:            freeVRAM,
			totalVRAM:           totalVRAM,
			freeRAM:             hw.FreeRAM,
			totalRAM:            hw.SystemRAM,
			residentModels:      resident,
			contextLength:       hw.Effective.ContextLength,
			contextLengthSource: hw.Effective.ContextLengthSource,
		})
		out[i].Fit = &verdict
	}
	return out
}

func (s *Server) pullEvents(w http.ResponseWriter, r *http.Request) error {
	m := s.modelsManager()
	m.mu.Lock()
	snapshot := m.itemsLocked()
	m.mu.Unlock()
	snapshotWithFit := s.attachFitVerdicts(r.Context(), snapshot)

	ch, unsubscribe := m.subscribe()
	defer unsubscribe()

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	flusher, ok := w.(http.Flusher)
	if !ok {
		return errors.New("streaming is not supported")
	}

	write := func(name string, data any) {
		payload, _ := json.Marshal(data)
		fmt.Fprintf(w, "event: %s\ndata: %s\n\n", name, payload)
		flusher.Flush()
	}

	// Whole-queue snapshot on connect, then whole-queue snapshots on every
	// subsequent change (never a partial diff -- see the comment on
	// modelsManager.publish about why that keeps a dropped/slow-subscriber
	// event harmless).
	write("snapshot", snapshotWithFit)

	for {
		select {
		case ev, ok := <-ch:
			if !ok {
				return nil
			}
			write(ev.Name, ev.Data)
		case <-r.Context().Done():
			return nil
		}
	}
}

func (s *Server) pullPause(w http.ResponseWriter, r *http.Request) error {
	if r.Method != http.MethodPost {
		return errors.New("method not allowed")
	}
	id := r.PathValue("id")
	m := s.modelsManager()

	m.mu.Lock()
	job, ok := m.jobs[id]
	if !ok {
		m.mu.Unlock()
		return fmt.Errorf("pull job %q not found", id)
	}
	if job.item.State != PullDownloading {
		state := job.item.State
		m.mu.Unlock()
		return fmt.Errorf("cannot pause a job in state %q", state)
	}
	job.pauseRequested = true
	cancel := job.cancel
	m.mu.Unlock()

	// Pausing IS cancellation of the in-flight request context, honestly:
	// Ollama's pull API has no pause verb. What makes this a real pause
	// rather than a fake one is that the partial blob files
	// (<name>-partial-*) are left on disk and the next Pull() call for the
	// same model resumes from their recorded offsets
	// (server/download.go:Prepare) -- see the copy in runJob's PullPaused
	// branch, which says exactly that rather than overclaiming.
	if cancel != nil {
		cancel()
	}
	return json.NewEncoder(w).Encode(map[string]string{"state": "pause_requested"})
}

func (s *Server) pullResume(w http.ResponseWriter, r *http.Request) error {
	if r.Method != http.MethodPost {
		return errors.New("method not allowed")
	}
	id := r.PathValue("id")
	m := s.modelsManager()

	m.mu.Lock()
	job, ok := m.jobs[id]
	if !ok {
		m.mu.Unlock()
		return fmt.Errorf("pull job %q not found", id)
	}
	switch job.item.State {
	case PullPaused, PullFailed, PullCanceled:
	default:
		state := job.item.State
		m.mu.Unlock()
		return fmt.Errorf("cannot resume a job in state %q", state)
	}
	job.item.State = PullQueued
	job.item.Error = ""
	job.item.Message = "Queued to resume."
	job.item.UpdatedAt = time.Now()
	m.persistLocked()
	m.tryDispatchLocked(s)
	snapshot := m.itemsLocked()
	m.mu.Unlock()

	m.publish(modelsQueueEvent{Name: "queue", Data: snapshot})
	return json.NewEncoder(w).Encode(map[string]string{"state": "queued"})
}

type pullCancelRequest struct {
	// DeleteData chooses between the two-option cancel copy required by
	// the brief: keep the partial data on disk for a future resume
	// (default, false), or actually delete the "-partial-*" files now.
	DeleteData bool `json:"deleteData"`
}

func (s *Server) pullCancel(w http.ResponseWriter, r *http.Request) error {
	if r.Method != http.MethodPost {
		return errors.New("method not allowed")
	}
	id := r.PathValue("id")
	var req pullCancelRequest
	if r.ContentLength != 0 {
		_ = json.NewDecoder(io.LimitReader(r.Body, 4*1024)).Decode(&req)
	}

	m := s.modelsManager()
	m.mu.Lock()
	job, ok := m.jobs[id]
	if !ok {
		m.mu.Unlock()
		return fmt.Errorf("pull job %q not found", id)
	}

	switch job.item.State {
	case PullDownloading:
		job.cancelRequested = true
		job.deleteOnCancel = req.DeleteData
		cancel := job.cancel
		m.mu.Unlock()
		if cancel != nil {
			cancel()
		}
		return json.NewEncoder(w).Encode(map[string]string{"state": "cancel_requested"})

	case PullCompleted, PullCanceled:
		state := job.item.State
		m.mu.Unlock()
		return fmt.Errorf("job is already %q", state)

	default: // queued or paused: no goroutine is running, finalize inline.
		job.item.State = PullCanceled
		job.item.Error = ""
		seen := job.seenDigests
		if req.DeleteData {
			job.item.Message = "Canceled and partial data deleted."
		} else {
			job.item.Message = fmt.Sprintf("Canceled — %s kept on disk for a future resume.", format.HumanBytes2(uint64(job.item.CompletedBytes)))
		}
		job.item.UpdatedAt = time.Now()
		m.persistLocked()
		snapshot := m.itemsLocked()
		m.mu.Unlock()

		if req.DeleteData && seen != nil {
			deletePartialFiles(seen)
		}
		m.publish(modelsQueueEvent{Name: "queue", Data: snapshot})
		return json.NewEncoder(w).Encode(map[string]string{"state": "canceled"})
	}
}

type modelDeleteRequest struct {
	Name    string `json:"name"`
	Confirm string `json:"confirm"`
}

// modelsDelete is POST /api/v1/models/delete. The confirmation phrase is
// re-checked here, server-side -- a client-only confirmation dialog is
// decoration, not a control. This IS the control.
func (s *Server) modelsDelete(w http.ResponseWriter, r *http.Request) error {
	if r.Method != http.MethodPost {
		return errors.New("method not allowed")
	}
	var req modelDeleteRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 8*1024)).Decode(&req); err != nil {
		return fmt.Errorf("invalid delete request: %w", err)
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		return errors.New("name is required")
	}
	if req.Confirm != "REMOVE" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		return json.NewEncoder(w).Encode(map[string]string{"error": `confirm must be exactly "REMOVE"`})
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	if err := s.inferenceClient().Delete(ctx, &api.DeleteRequest{Model: req.Name}); err != nil {
		return fmt.Errorf("delete model: %w", err)
	}

	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(map[string]string{"deleted": req.Name})
}
