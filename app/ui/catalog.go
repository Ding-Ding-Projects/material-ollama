//go:build windows || darwin

package ui

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"

	"golang.org/x/net/html"

	"github.com/ollama/ollama/format"
	"github.com/ollama/ollama/manifest"
	"github.com/ollama/ollama/types/model"
)

// This file is the model catalog: the "super duper extensive" model store
// the Models screen needs, as opposed to the six curated entries served by
// GET /api/experimental/model-recommendations (server/model_recommendations.go)
// -- that endpoint is a recommendations feed, not a catalog, and cannot be
// turned into one.
//
// The honest starting point, established by actually probing the live
// endpoints rather than assuming a spec:
//
//   - There is no documented, fully enumerable public Ollama catalog API.
//     GET https://registry.ollama.ai/v2/_catalog and the per-repository
//     GET .../tags/list route are both part of the Docker Distribution v2
//     spec, and this code DOES try them first, every refresh -- but as
//     verified live against registry.ollama.ai, neither is implemented:
//     both answer with Go's bare default-mux "404 page not found" (plain
//     text, no registry-shaped {"errors":[...]} body), which is a
//     different thing from a real "that repository doesn't exist" 404 (see
//     isUnimplementedRouteBody). So this falls back, every refresh, to
//     scraping the plain HTML pages at https://ollama.com/library and
//     https://ollama.com/library/<name>/tags -- undocumented, unversioned
//     markup, not an API -- and says so explicitly in the completeness
//     verdict whenever that's the path that actually supplied the data.
//     If ollama.com ever turns the API on, this code picks it up
//     automatically and reports "complete" from a real API instead.
//
//   - GET /v2/<repo>/manifests/<tag> IS implemented and requires no
//     authentication for public library models (verified: registry.ollama.ai
//     answers 200 with a real manifest body, no token challenge, no
//     Authorization header needed). Its Config.Size plus the sum of
//     Layers[].Size is the model's exact installed size -- this is what
//     server/images.go's own pull path relies on, and it's the number
//     hardware fit needs.
//
//   - Family, parameter count, quantization and format live in the config
//     blob (one more GET, to whatever blob URL the manifest's Config.Digest
//     names). None of that -- least of all "capabilities" -- is EVER parsed
//     out of a model or tag name; see fetchVariantDetail's comment for
//     exactly what capability signal is available here and how weak it is.
//
// Fetching a manifest (for exact size) and a config blob (for family/
// parameter count/quantization) for every tag of every repository during a
// single bulk refresh would mean several thousand extra HTTP requests --
// the real catalog has on the order of hundreds of repositories times
// dozens of tags each -- which is exactly the unbounded fan-out a refresh
// is required to avoid. So the bulk refresh (runRefresh) only enumerates
// NAMES and TAGS -- cheap, on the order of one HTTP request per repository
// -- and the per-tag manifest+config-blob fetch happens lazily, on demand,
// through GET /api/v1/models/variant, cached from then on in the same
// state file. Until a variant has been resolved that way, its size,
// family, parameter count and quantization are all zero/empty and the UI
// should show them as Unknown, exactly as it already does for family/
// parameter count/quantization per the brief for this lane.
//
// State is a package-level singleton (see getCatalogManager), not a field
// on *Server: this lane's allowed edit to ui.go is route registration
// inside Handler() only, so the Server struct itself is not ours to
// extend. Same pattern as app/ui/docker.go's dockerManager.

const (
	// Per-request timeouts. Every network call in this file derives its
	// context from a parent (either the refresh's own overall deadline, or
	// the inbound request's context) via context.WithTimeout, never a bare
	// client-level Timeout, so a slow response can never hold a refresh
	// hostage past the overall deadline below.
	catalogRegistryRequestTimeout = 10 * time.Second
	catalogIndexRequestTimeout    = 20 * time.Second
	catalogTagsRequestTimeout     = 10 * time.Second
	catalogVariantRequestTimeout  = 10 * time.Second

	// catalogRefreshOverallDeadline bounds an entire bulk refresh (names +
	// every repository's tags). At the measured request rate (roughly a few
	// hundred repositories, ~8-way concurrency, sub-second responses) a real
	// refresh finishes in well under a minute; this deadline exists so a
	// broken or hostile host -- an index that never stops paginating, or a
	// registry that stalls every connection -- cannot make a refresh spin
	// forever. Once it fires, in-flight requests are cancelled (their
	// contexts derive from the same deadline) and whatever was enumerated
	// so far is persisted as a partial snapshot rather than discarded.
	catalogRefreshOverallDeadline = 6 * time.Minute

	catalogTagFetchConcurrency = 8

	// Defensive caps. The real library is on the order of a few hundred
	// repositories with dozens of tags each; these are orders of magnitude
	// above that, so they only ever bite a broken or hostile response.
	catalogMaxRepositories       = 4000
	catalogMaxIndexPages         = 25
	catalogMaxIndexResponseBytes = 8 * 1024 * 1024
	catalogMaxTagsResponseBytes  = 4 * 1024 * 1024
	catalogMaxManifestBytes      = 1024 * 1024
	catalogMaxBlobBytes          = 1024 * 1024
	catalogMaxSampleFailures     = 25
	catalogMaxCachedVariants     = 2000

	catalogIndexURL       = "https://ollama.com/library"
	catalogTagsURLFormat  = "https://ollama.com/library/%s/tags"
	catalogHTMLLinkPrefix = "/library/"

	// manifestMediaTypeProjector is the layer media type Ollama's own
	// server writes for a CLIP/vision projector (verified against the
	// llava and minicpm-v manifests). It is not exported as a constant
	// anywhere this lane is allowed to import from, so it's restated here.
	manifestMediaTypeProjector = "application/vnd.ollama.image.projector"
)

// Source-chain purposes: what each CatalogSource entry in a snapshot or a
// variant detail actually was.
const (
	catalogSourceCatalogAPIProbe = "repository-catalog-api"      // GET /v2/_catalog
	catalogSourceNamesIndex      = "repository-names-html-index" // GET ollama.com/library
	catalogSourceTagsAPIProbe    = "repository-tags-api-probe"   // GET /v2/<repo>/tags/list, tried once
	catalogSourceTagsAPIPages    = "repository-tags-api"         // aggregate, when the probe succeeded
	catalogSourceTagsHTMLPages   = "repository-tags-html-pages"  // aggregate, HTML fallback
	catalogSourceManifest        = "registry-manifest"           // GET /v2/<repo>/manifests/<tag>
	catalogSourceConfigBlob      = "registry-config-blob"        // GET /v2/<repo>/blobs/<digest>
)

// Completeness verdicts. See CatalogSnapshot.Verdict.
const (
	CatalogVerdictComplete    = "complete"
	CatalogVerdictPartial     = "partial"
	CatalogVerdictUnavailable = "unavailable"
)

// CatalogSource records one distinct fetch (or, for the per-repository tag
// pages, one aggregated batch of fetches) this service performed while
// building a snapshot: what it was for, the URL and method, the HTTP
// status actually returned, how many requests ("pages") it took, and any
// response-identity headers the host chose to send back. This -- not a
// bare boolean -- is the evidence a completeness verdict is built from, so
// a caller can tell "the catalog is complete" apart from "the catalog is
// whatever survived a failed fetch".
type CatalogSource struct {
	Purpose        string              `json:"purpose"`
	URL            string              `json:"url,omitempty"`
	Method         string              `json:"method,omitempty"`
	HTTPStatus     int                 `json:"httpStatus,omitempty"`
	PageCount      int                 `json:"pageCount,omitempty"`
	Attempted      int                 `json:"attempted,omitempty"` // aggregate sources only
	Succeeded      int                 `json:"succeeded,omitempty"`
	Failed         int                 `json:"failed,omitempty"`
	ETag           string              `json:"etag,omitempty"`
	LastModified   string              `json:"lastModified,omitempty"`
	Error          string              `json:"error,omitempty"`
	Note           string              `json:"note,omitempty"`
	CheckedAt      time.Time           `json:"checkedAt"`
	SampleFailures []catalogTagFailure `json:"sampleFailures,omitempty"` // aggregate sources only
}

// catalogTagFailure is one entry in a CatalogSource's capped sample of
// per-repository tag-page failures -- kept small deliberately so a bad run
// against a few hundred repositories doesn't balloon the persisted state
// file with hundreds of near-identical error strings.
type catalogTagFailure struct {
	Name   string `json:"name"`
	URL    string `json:"url,omitempty"`
	Status int    `json:"httpStatus,omitempty"`
	Error  string `json:"error,omitempty"`
}

// CatalogVariant is one pullable "<repo>:<tag>" reference discovered during
// a bulk refresh. It deliberately carries no size, family, parameter count
// or quantization -- see this file's header comment for why those are
// fetched lazily, per-variant, through GET /api/v1/models/variant instead.
type CatalogVariant struct {
	Tag      string `json:"tag"`
	FullName string `json:"fullName"` // "<repo>:<tag>", exactly what /api/v1/models/pull accepts
}

// CatalogModel is one repository (model family): its name, the library
// page it was discovered from, and every tag discovered for it.
// TagsFetched/TagsError record whether THIS repository's own tag list
// resolved -- a single repository's HTML fetch failing does not fail the
// whole refresh, but it does mean that repository's Variants is empty and
// its entry is not part of a "complete" verdict.
type CatalogModel struct {
	Name        string           `json:"name"`
	SourceURL   string           `json:"sourceUrl"`
	Variants    []CatalogVariant `json:"variants"`
	TagsFetched bool             `json:"tagsFetched"`
	TagsError   string           `json:"tagsError,omitempty"`
}

// CatalogSnapshot is one completed (or deadline-truncated) bulk refresh:
// the enumerated models, and the completeness record the brief for this
// lane requires -- not just data, but honest evidence about how the data
// was obtained and how much of it could actually be obtained.
type CatalogSnapshot struct {
	FetchedAt           time.Time       `json:"fetchedAt"`
	Models              []CatalogModel  `json:"models"`
	NamesEnumerated     int             `json:"namesEnumerated"`
	TagsEnumerated      int             `json:"tagsEnumerated"`
	FailureCount        int             `json:"failureCount"`
	Sources             []CatalogSource `json:"sources"`
	Verdict             string          `json:"verdict"` // complete | partial | unavailable
	Reason              string          `json:"reason"`
	DurationMS          int64           `json:"durationMs"`
	TruncatedByDeadline bool            `json:"truncatedByDeadline,omitempty"`
	TruncatedByCap      bool            `json:"truncatedByCap,omitempty"`
}

// CatalogVariantDetail is the lazily-fetched, per-tag detail: exact size
// (from the manifest) plus family/parameter count/quantization/format
// (from the config blob the manifest points at). See fetchVariantDetail
// for exactly what "Capabilities" does and does not mean here.
type CatalogVariantDetail struct {
	Name             string          `json:"name"`
	Tag              string          `json:"tag"`
	FullName         string          `json:"fullName"`
	ManifestDigest   string          `json:"manifestDigest,omitempty"`
	ConfigSizeBytes  int64           `json:"configSizeBytes,omitempty"`
	TotalSizeBytes   int64           `json:"totalSizeBytes,omitempty"`
	TotalSizeDisplay string          `json:"totalSizeDisplay,omitempty"`
	LayerCount       int             `json:"layerCount,omitempty"`
	Format           string          `json:"format,omitempty"`
	Family           string          `json:"family,omitempty"`
	Families         []string        `json:"families,omitempty"`
	ParameterSize    string          `json:"parameterSize,omitempty"`
	Quantization     string          `json:"quantization,omitempty"`
	Capabilities     []string        `json:"capabilities,omitempty"`
	CapabilitiesNote string          `json:"capabilitiesNote,omitempty"`
	FetchedAt        time.Time       `json:"fetchedAt"`
	Sources          []CatalogSource `json:"sources,omitempty"`
	Complete         bool            `json:"complete"`
	Error            string          `json:"error,omitempty"`
}

// registryCatalogResponse is the Docker Distribution v2 _catalog response
// shape (https://distribution.github.io/distribution/spec/api/#listing-repositories).
type registryCatalogResponse struct {
	Repositories []string `json:"repositories"`
}

// registryTagsListResponse is the Docker Distribution v2 tags/list
// response shape.
type registryTagsListResponse struct {
	Name string   `json:"name"`
	Tags []string `json:"tags"`
}

// registryConfig is the subset of an Ollama image config blob this lane
// reads. Verified live against several config blobs (llama3, bge-m3,
// llava, llama3.2): these fields are consistently present; there is no
// "capabilities" field anywhere in it.
type registryConfig struct {
	ModelFormat   string   `json:"model_format,omitempty"`
	ModelFamily   string   `json:"model_family,omitempty"`
	ModelFamilies []string `json:"model_families,omitempty"`
	ModelType     string   `json:"model_type,omitempty"`
	FileType      string   `json:"file_type,omitempty"`
}

// catalogStateFile is the on-disk shape persisted to catalogStatePath(),
// atomically (temp file + rename), matching the pattern app/ui/codex.go
// and app/ui/docker.go already use.
type catalogStateFile struct {
	Version  int                             `json:"version"`
	Snapshot *CatalogSnapshot                `json:"snapshot,omitempty"`
	Variants map[string]CatalogVariantDetail `json:"variants,omitempty"`
}

// catalogManager holds every piece of state this lane keeps: the last
// completed refresh, the lazily-resolved per-variant cache, and whether a
// refresh is currently running. A package-level singleton -- see this
// file's header comment for why.
type catalogManager struct {
	mu     sync.Mutex
	path   string
	loaded bool

	snapshot *CatalogSnapshot
	variants map[string]CatalogVariantDetail

	refreshing       bool
	refreshStartedAt time.Time

	client *http.Client
}

var (
	catalogManagerOnce sync.Once
	catalogManagerInst *catalogManager
)

// getCatalogManager returns the process-wide singleton.
func getCatalogManager() *catalogManager {
	catalogManagerOnce.Do(func() {
		catalogManagerInst = &catalogManager{
			path:     catalogStatePath(),
			variants: make(map[string]CatalogVariantDetail),
			// No client-level Timeout: every request this file makes
			// carries its own context.WithTimeout, which is what actually
			// bounds it. See the timeout constants above.
			client: userAgentHTTPClient(0),
		}
	})
	return catalogManagerInst
}

func catalogStatePath() string {
	if runtime.GOOS == "windows" {
		return filepath.Join(os.Getenv("LOCALAPPDATA"), "Ollama", "model-catalog.json")
	}
	return filepath.Join(os.Getenv("HOME"), "Library", "Application Support", "Ollama", "model-catalog.json")
}

func (m *catalogManager) loadLocked() {
	if m.loaded {
		return
	}
	m.loaded = true
	data, err := os.ReadFile(m.path)
	if err != nil {
		return
	}
	var file catalogStateFile
	if json.Unmarshal(data, &file) != nil || file.Version != 1 {
		return
	}
	m.snapshot = file.Snapshot
	if file.Variants != nil {
		m.variants = file.Variants
	}
}

func (m *catalogManager) persistLocked() error {
	if err := os.MkdirAll(filepath.Dir(m.path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(catalogStateFile{Version: 1, Snapshot: m.snapshot, Variants: m.variants}, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(m.path), ".model-catalog-*.json")
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

// cacheVariantLocked stores a resolved variant detail, evicting the single
// oldest entry first if the cache is at its bound. Called with m.mu held.
func (m *catalogManager) cacheVariantLocked(key string, detail CatalogVariantDetail) {
	if m.variants == nil {
		m.variants = make(map[string]CatalogVariantDetail)
	}
	if _, exists := m.variants[key]; !exists && len(m.variants) >= catalogMaxCachedVariants {
		var oldestKey string
		var oldestAt time.Time
		for k, v := range m.variants {
			if oldestKey == "" || v.FetchedAt.Before(oldestAt) {
				oldestKey, oldestAt = k, v.FetchedAt
			}
		}
		if oldestKey != "" {
			delete(m.variants, oldestKey)
		}
	}
	m.variants[key] = detail
}

func catalogVariantKey(repo, tag string) string {
	return strings.ToLower(repo) + ":" + strings.ToLower(tag)
}

// startRefresh begins a bounded background refresh unless one is already
// running, in which case it's a no-op: POST /api/v1/models/catalog/refresh
// always reports current status either way, so a second call while a
// refresh is in flight just observes progress rather than starting a
// second one.
func (m *catalogManager) startRefresh() {
	m.mu.Lock()
	if m.refreshing {
		m.mu.Unlock()
		return
	}
	m.loadLocked()
	m.refreshing = true
	m.refreshStartedAt = time.Now()
	client := m.client
	m.mu.Unlock()

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), catalogRefreshOverallDeadline)
		defer cancel()
		snapshot := runCatalogRefresh(ctx, client)

		m.mu.Lock()
		m.refreshing = false
		m.snapshot = snapshot
		_ = m.persistLocked() // best-effort; the in-memory snapshot is still served either way
		m.mu.Unlock()
	}()
}

// getOrFetchVariant returns a cached, fully-resolved variant detail if one
// exists (and forceRefresh wasn't requested), otherwise fetches and caches
// a fresh one. A failed fetch is never cached, so the next request retries
// it rather than being stuck serving a persisted error forever.
func (m *catalogManager) getOrFetchVariant(ctx context.Context, repo, tag string, forceRefresh bool) CatalogVariantDetail {
	key := catalogVariantKey(repo, tag)

	if !forceRefresh {
		m.mu.Lock()
		m.loadLocked()
		cached, ok := m.variants[key]
		m.mu.Unlock()
		if ok && cached.Complete {
			return cached
		}
	}

	m.mu.Lock()
	client := m.client
	m.mu.Unlock()

	detail := fetchVariantDetail(ctx, client, repo, tag)

	m.mu.Lock()
	m.loadLocked()
	if detail.Complete {
		m.cacheVariantLocked(key, detail)
		_ = m.persistLocked()
	}
	m.mu.Unlock()

	return detail
}

// runCatalogRefresh performs one bounded bulk refresh: repository names,
// then every repository's tags, then rolls the result up into a
// completeness verdict. ctx carries the overall deadline (see
// catalogRefreshOverallDeadline); every network call inside derives a
// shorter per-request timeout from it, so once ctx expires, in-flight
// requests are cancelled and dispatch of new ones stops.
func runCatalogRefresh(ctx context.Context, client *http.Client) *CatalogSnapshot {
	start := time.Now()
	snapshot := &CatalogSnapshot{FetchedAt: start}

	// --- Phase 1: repository names --------------------------------------
	names, apiSource, apiOK := fetchRepositoryCatalogAPI(ctx, client)
	snapshot.Sources = append(snapshot.Sources, apiSource)
	if !apiOK {
		htmlNames, htmlSource := fetchRepositoryNamesFromIndex(ctx, client)
		snapshot.Sources = append(snapshot.Sources, htmlSource)
		names = htmlNames
		if htmlSource.Error != "" {
			snapshot.Verdict = CatalogVerdictUnavailable
			snapshot.Reason = fmt.Sprintf(
				"could not enumerate repository names from either the registry catalog API (%s) or the ollama.com HTML library index (%s)",
				orNone(apiSource.Error), htmlSource.Error,
			)
			snapshot.DurationMS = time.Since(start).Milliseconds()
			return snapshot
		}
	}

	truncatedByCap := false
	if len(names) > catalogMaxRepositories {
		names = names[:catalogMaxRepositories]
		truncatedByCap = true
	}
	snapshot.TruncatedByCap = truncatedByCap
	snapshot.NamesEnumerated = len(names)

	models := make([]CatalogModel, len(names))
	for i, n := range names {
		models[i] = CatalogModel{Name: n, SourceURL: catalogIndexURL + "/" + n}
	}
	if len(names) == 0 {
		snapshot.Verdict = CatalogVerdictComplete
		snapshot.Reason = "the repository name source answered successfully but listed zero repositories"
		snapshot.DurationMS = time.Since(start).Milliseconds()
		return snapshot
	}

	// --- Phase 2: tags per repository, bounded concurrency ---------------
	// Probe the spec-defined tags/list route once, against the first
	// repository. If it isn't implemented there, re-confirming that same
	// negative result on every other repository buys nothing, so the rest
	// of the loop goes straight to the HTML fallback.
	probeTags, tagsProbeSource, tagsAPISupported := fetchTagsFromAPI(ctx, client, names[0])
	if tagsAPISupported {
		tagsProbeSource.Note = "spec-defined tags/list route answered for this repository; trying it for every other repository too, with an HTML fallback for any one it fails on"
	} else {
		tagsProbeSource.Note = "route not usable for this repository; every repository's tags in this refresh come from the HTML tags page instead"
	}
	snapshot.Sources = append(snapshot.Sources, tagsProbeSource)

	type tagResult struct {
		index int
		tags  []string
		src   CatalogSource
	}

	results := make(chan tagResult, len(names))
	sem := make(chan struct{}, catalogTagFetchConcurrency)
	var wg sync.WaitGroup
	dispatched := 0
	truncatedByDeadline := false

dispatchLoop:
	for i, repo := range names {
		if i == 0 && tagsAPISupported {
			// Reuse the probe result instead of fetching index 0 twice.
			dispatched++
			results <- tagResult{index: 0, tags: probeTags, src: CatalogSource{Purpose: catalogSourceTagsAPIProbe, HTTPStatus: tagsProbeSource.HTTPStatus}}
			continue
		}

		select {
		case sem <- struct{}{}:
		case <-ctx.Done():
			truncatedByDeadline = true
			break dispatchLoop
		}

		dispatched++
		wg.Add(1)
		go func(i int, repo string) {
			defer wg.Done()
			defer func() { <-sem }()

			var tags []string
			var src CatalogSource
			if tagsAPISupported {
				apiTags, apiSrc, ok := fetchTagsFromAPI(ctx, client, repo)
				if ok {
					tags, src = apiTags, apiSrc
				} else {
					tags, src = fetchTagsFromHTML(ctx, client, repo)
				}
			} else {
				tags, src = fetchTagsFromHTML(ctx, client, repo)
			}
			results <- tagResult{index: i, tags: tags, src: src}
		}(i, repo)
	}

	go func() {
		wg.Wait()
		close(results)
	}()

	var attempted, succeeded, failed int
	var sampleFailures []catalogTagFailure
	tagsEnumerated := 0
	for res := range results {
		attempted++
		if res.src.Error == "" {
			succeeded++
			models[res.index].Variants = make([]CatalogVariant, len(res.tags))
			for j, tag := range res.tags {
				models[res.index].Variants[j] = CatalogVariant{Tag: tag, FullName: names[res.index] + ":" + tag}
			}
			models[res.index].TagsFetched = true
			tagsEnumerated += len(res.tags)
		} else {
			failed++
			models[res.index].TagsError = res.src.Error
			if len(sampleFailures) < catalogMaxSampleFailures {
				sampleFailures = append(sampleFailures, catalogTagFailure{
					Name: names[res.index], URL: res.src.URL, Status: res.src.HTTPStatus, Error: res.src.Error,
				})
			}
		}
	}
	if dispatched < len(names) {
		truncatedByDeadline = true
	}

	aggregate := CatalogSource{
		Purpose:        catalogSourceTagsHTMLPages,
		Method:         http.MethodGet,
		URL:            catalogTagsURLFormat,
		Attempted:      attempted,
		Succeeded:      succeeded,
		Failed:         failed,
		CheckedAt:      time.Now(),
		Note:           "one GET per repository; aggregated into this single source-chain entry rather than one entry per repository",
		SampleFailures: sampleFailures,
	}
	if tagsAPISupported {
		aggregate.Purpose = catalogSourceTagsAPIPages
	}
	snapshot.Sources = append(snapshot.Sources, aggregate)

	snapshot.Models = models
	snapshot.TagsEnumerated = tagsEnumerated
	snapshot.FailureCount = failed
	snapshot.TruncatedByDeadline = truncatedByDeadline
	snapshot.DurationMS = time.Since(start).Milliseconds()

	switch {
	case truncatedByDeadline:
		snapshot.Verdict = CatalogVerdictPartial
		snapshot.Reason = fmt.Sprintf("refresh deadline (%s) was reached before every repository's tags could be fetched: %d/%d attempted", catalogRefreshOverallDeadline, attempted, len(names))
	case failed > 0:
		snapshot.Verdict = CatalogVerdictPartial
		snapshot.Reason = fmt.Sprintf("%d of %d repositories' tag pages failed to fetch; their entries carry tagsError and no variants", failed, len(names))
	case truncatedByCap:
		snapshot.Verdict = CatalogVerdictPartial
		snapshot.Reason = fmt.Sprintf("the repository name source listed more than the defensive cap of %d repositories; only the first %d were fetched", catalogMaxRepositories, catalogMaxRepositories)
	case !apiOK:
		snapshot.Verdict = CatalogVerdictComplete
		snapshot.Reason = "names and tags were both derived from ollama.com's HTML pages (the registry does not implement the catalog or tags/list API for anonymous callers, verified this refresh); every repository and every tag page it linked to was fetched successfully"
	case !tagsAPISupported:
		snapshot.Verdict = CatalogVerdictComplete
		snapshot.Reason = "repository names came from the registry catalog API; tags came from ollama.com's HTML tags pages (the tags/list API is not implemented for this repository, verified this refresh); every repository's tag page was fetched successfully"
	default:
		snapshot.Verdict = CatalogVerdictComplete
		snapshot.Reason = "names and tags were both enumerated from the registry's own catalog and tags/list API"
	}

	return snapshot
}

func orNone(s string) string {
	if s == "" {
		return "no usable data"
	}
	return s
}

// fetchRepositoryCatalogAPI tries the spec-defined GET /v2/_catalog route,
// following Link: rel="next" pagination up to catalogMaxIndexPages. Most
// hosted registries (including, as verified live by this call every
// refresh, registry.ollama.ai) gate or simply do not implement this route
// for anonymous callers -- see isUnimplementedRouteBody -- so ok is false
// far more often than true. When it IS true, the result is a genuinely
// complete, API-sourced enumeration.
func fetchRepositoryCatalogAPI(ctx context.Context, client *http.Client) (names []string, source CatalogSource, ok bool) {
	source = CatalogSource{Purpose: catalogSourceCatalogAPIProbe, Method: http.MethodGet, CheckedAt: time.Now()}

	base := model.DefaultName().BaseURL()
	reqURL := base.JoinPath("v2", "_catalog")
	reqURL.RawQuery = url.Values{"n": {"1000"}}.Encode()

	seen := make(map[string]struct{})
	pages := 0
	nextURL := reqURL.String()
	for nextURL != "" && pages < catalogMaxIndexPages {
		pages++
		body, status, header, err := doGET(ctx, client, nextURL, catalogRegistryRequestTimeout, "application/json", catalogMaxIndexResponseBytes)
		if pages == 1 {
			source.URL = nextURL
			source.HTTPStatus = status
			if header != nil {
				source.ETag = header.Get("ETag")
				source.LastModified = header.Get("Last-Modified")
			}
		}
		if err != nil {
			source.Error = err.Error()
			return nil, source, false
		}
		if status != http.StatusOK {
			if isUnimplementedRouteBody(status, body) {
				source.Note = "route is not implemented by this registry host (default not-found handler body, not a registry-shaped error)"
			} else {
				source.Error = fmt.Sprintf("status %d: %s", status, truncateForError(body))
			}
			return nil, source, false
		}

		var payload registryCatalogResponse
		if err := json.Unmarshal(body, &payload); err != nil {
			source.Error = fmt.Sprintf("decode: %v", err)
			return nil, source, false
		}
		for _, repo := range payload.Repositories {
			if _, dup := seen[repo]; dup {
				continue
			}
			seen[repo] = struct{}{}
			names = append(names, repo)
		}

		nextURL = ""
		if header != nil {
			if link := parseNextLink(header.Get("Link")); link != "" {
				nextURL = resolveRegistryLink(base, link)
			}
		}
	}
	source.PageCount = pages
	if len(names) == 0 {
		source.Error = "route answered 200 OK but listed zero repositories"
		return nil, source, false
	}
	return names, source, true
}

// fetchRepositoryNamesFromIndex scrapes the plain HTML library index at
// ollama.com/library for every "/library/<name>" link. As established by
// fetchRepositoryCatalogAPI's own live probe, this is NOT an API: it's
// undocumented, unversioned page markup, and the completeness verdict says
// so explicitly whenever this path is the one that actually supplied the
// names.
func fetchRepositoryNamesFromIndex(ctx context.Context, client *http.Client) ([]string, CatalogSource) {
	source := CatalogSource{Purpose: catalogSourceNamesIndex, Method: http.MethodGet, URL: catalogIndexURL, CheckedAt: time.Now(), PageCount: 1}

	body, status, header, err := doGET(ctx, client, catalogIndexURL, catalogIndexRequestTimeout, "text/html", catalogMaxIndexResponseBytes)
	source.HTTPStatus = status
	if header != nil {
		source.ETag = header.Get("ETag")
		source.LastModified = header.Get("Last-Modified")
	}
	if err != nil {
		source.Error = err.Error()
		return nil, source
	}
	if status != http.StatusOK {
		source.Error = fmt.Sprintf("status %d: %s", status, truncateForError(body))
		return nil, source
	}

	links, err := extractLibraryLinks(bytes.NewReader(body))
	if err != nil {
		source.Error = fmt.Sprintf("parse html: %v", err)
		return nil, source
	}

	seen := make(map[string]struct{})
	var names []string
	for _, link := range links {
		// A colon means this is a "<name>:<tag>" reference (this page
		// links a few of those too), and a slash would mean a namespaced
		// name -- verified live that the current index has neither, but
		// this stays defensive against either appearing later.
		if link == "" || strings.ContainsAny(link, ":/") {
			continue
		}
		if _, dup := seen[link]; dup {
			continue
		}
		seen[link] = struct{}{}
		names = append(names, link)
	}
	source.Note = fmt.Sprintf("derived from an HTML index, not a registry API (%d anchors examined, %d unique bare repository names)", len(links), len(names))
	if len(names) == 0 {
		source.Error = "index page returned 200 OK but no repository links were found"
	}
	return names, source
}

// fetchTagsFromAPI tries the spec-defined GET /v2/<repo>/tags/list route
// for one repository, following Link: rel="next" pagination up to
// catalogMaxIndexPages. This IS the documented per-repository tag-listing
// endpoint -- but as verified live (see runCatalogRefresh's one-time probe
// against the first enumerated repository), registry.ollama.ai does not
// implement it.
func fetchTagsFromAPI(ctx context.Context, client *http.Client, repo string) (tags []string, source CatalogSource, ok bool) {
	source = CatalogSource{Purpose: catalogSourceTagsAPIProbe, Method: http.MethodGet, CheckedAt: time.Now()}

	n := model.ParseName(repo)
	if !n.IsValid() {
		source.Error = fmt.Sprintf("%q is not a valid repository name", repo)
		return nil, source, false
	}
	base := n.BaseURL()
	reqURL := base.JoinPath("v2", n.DisplayNamespaceModel(), "tags", "list")
	reqURL.RawQuery = url.Values{"n": {"100"}}.Encode()

	seen := make(map[string]struct{})
	pages := 0
	nextURL := reqURL.String()
	for nextURL != "" && pages < catalogMaxIndexPages {
		pages++
		body, status, header, err := doGET(ctx, client, nextURL, catalogRegistryRequestTimeout, "application/json", catalogMaxIndexResponseBytes)
		if pages == 1 {
			source.URL = nextURL
			source.HTTPStatus = status
			if header != nil {
				source.ETag = header.Get("ETag")
				source.LastModified = header.Get("Last-Modified")
			}
		}
		if err != nil {
			source.Error = err.Error()
			return nil, source, false
		}
		if status != http.StatusOK {
			if isUnimplementedRouteBody(status, body) {
				source.Note = "route is not implemented by this registry host for this repository"
			} else {
				source.Error = fmt.Sprintf("status %d: %s", status, truncateForError(body))
			}
			return nil, source, false
		}

		var payload registryTagsListResponse
		if err := json.Unmarshal(body, &payload); err != nil {
			source.Error = fmt.Sprintf("decode: %v", err)
			return nil, source, false
		}
		for _, tag := range payload.Tags {
			if _, dup := seen[tag]; dup {
				continue
			}
			seen[tag] = struct{}{}
			tags = append(tags, tag)
		}

		nextURL = ""
		if header != nil {
			if link := parseNextLink(header.Get("Link")); link != "" {
				nextURL = resolveRegistryLink(base, link)
			}
		}
	}
	source.PageCount = pages
	if len(tags) == 0 {
		source.Error = "route answered 200 OK but listed zero tags"
		return nil, source, false
	}
	return tags, source, true
}

// fetchTagsFromHTML scrapes one repository's plain HTML tags page at
// ollama.com/library/<name>/tags for every "/library/<name>:<tag>" link.
// Same honesty caveat as fetchRepositoryNamesFromIndex: this is markup,
// not an API.
func fetchTagsFromHTML(ctx context.Context, client *http.Client, repo string) ([]string, CatalogSource) {
	pageURL := fmt.Sprintf(catalogTagsURLFormat, url.PathEscape(repo))
	source := CatalogSource{Purpose: catalogSourceTagsHTMLPages, Method: http.MethodGet, URL: pageURL, CheckedAt: time.Now(), PageCount: 1}

	body, status, _, err := doGET(ctx, client, pageURL, catalogTagsRequestTimeout, "text/html", catalogMaxTagsResponseBytes)
	source.HTTPStatus = status
	if err != nil {
		source.Error = err.Error()
		return nil, source
	}
	if status != http.StatusOK {
		source.Error = fmt.Sprintf("status %d: %s", status, truncateForError(body))
		return nil, source
	}

	links, err := extractLibraryLinks(bytes.NewReader(body))
	if err != nil {
		source.Error = fmt.Sprintf("parse html: %v", err)
		return nil, source
	}

	prefix := repo + ":"
	seen := make(map[string]struct{})
	var tags []string
	for _, link := range links {
		tag, ok := strings.CutPrefix(link, prefix)
		if !ok || tag == "" {
			continue
		}
		if _, dup := seen[tag]; dup {
			continue
		}
		seen[tag] = struct{}{}
		tags = append(tags, tag)
	}
	source.Note = "derived from an HTML index, not a registry API"
	if len(tags) == 0 {
		source.Error = "tags page returned 200 OK but no tag links were found"
	}
	return tags, source
}

// extractLibraryLinks tokenizes HTML looking for <a href="/library/...">
// and returns everything after the "/library/" prefix, URL-decoded. It
// never inspects text content, class names or any other attribute -- the
// href is the only thing this site promises means anything -- and
// deliberately uses the streaming Tokenizer rather than a full DOM parse
// (html.Parse), since only anchor tags are ever needed and a tokenizer
// bounds memory on an ~800KB page.
func extractLibraryLinks(r io.Reader) ([]string, error) {
	z := html.NewTokenizer(r)
	var links []string
	for {
		tt := z.Next()
		switch tt {
		case html.ErrorToken:
			if err := z.Err(); err != nil && !errors.Is(err, io.EOF) {
				return links, err
			}
			return links, nil
		case html.StartTagToken, html.SelfClosingTagToken:
			tok := z.Token()
			if tok.Data != "a" {
				continue
			}
			for _, attr := range tok.Attr {
				if attr.Key != "href" {
					continue
				}
				rest, ok := strings.CutPrefix(attr.Val, catalogHTMLLinkPrefix)
				if !ok {
					continue
				}
				if decoded, derr := url.PathUnescape(rest); derr == nil {
					links = append(links, decoded)
				} else {
					links = append(links, rest)
				}
			}
		}
	}
}

// isUnimplementedRouteBody reports whether a 404 response is Go's own
// default "no route registered for this pattern" body -- as opposed to a
// registry-shaped {"errors":[...]} 404, which means the route exists and
// the specific repository/tag genuinely doesn't. Verified live:
// registry.ollama.ai returns the literal plain-text "404 page not found"
// for /v2/_catalog and every /v2/<repo>/tags/list, and a real JSON
// MANIFEST_UNKNOWN body for an actually-missing tag.
func isUnimplementedRouteBody(status int, body []byte) bool {
	return status == http.StatusNotFound && strings.TrimSpace(string(body)) == "404 page not found"
}

var catalogLinkNextRE = regexp.MustCompile(`<([^>]+)>\s*;\s*rel="?next"?`)

// parseNextLink extracts the "next" URL from an RFC 8288 Link header, if
// present. Neither registry.ollama.ai endpoint this file calls has ever
// been observed to send one (both are unimplemented), so in practice this
// always returns "" today -- it exists so pagination is handled correctly
// the moment either endpoint starts working.
func parseNextLink(header string) string {
	if header == "" {
		return ""
	}
	m := catalogLinkNextRE.FindStringSubmatch(header)
	if len(m) != 2 {
		return ""
	}
	return m[1]
}

func resolveRegistryLink(base *url.URL, link string) string {
	u, err := url.Parse(link)
	if err != nil {
		return ""
	}
	return base.ResolveReference(u).String()
}

func truncateForError(body []byte) string {
	s := strings.TrimSpace(string(body))
	const limit = 512
	if len(s) > limit {
		s = s[:limit] + "…"
	}
	return s
}

// doGET performs one bounded GET: explicit timeout, explicit Accept and
// User-Agent headers, and a hard cap on how much of the response body is
// ever read into memory. Every network call this file makes -- registry
// API, registry manifest/blob, and the ollama.com HTML pages alike --
// goes through this one function.
func doGET(ctx context.Context, client *http.Client, rawURL string, timeout time.Duration, accept string, maxBytes int64) (body []byte, status int, header http.Header, err error) {
	reqCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, 0, nil, err
	}
	if accept != "" {
		req.Header.Set("Accept", accept)
	}
	req.Header.Set("User-Agent", userAgent())

	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, nil, err
	}
	defer resp.Body.Close()

	body, err = io.ReadAll(io.LimitReader(resp.Body, maxBytes))
	if err != nil {
		return nil, resp.StatusCode, resp.Header, err
	}
	return body, resp.StatusCode, resp.Header, nil
}

// fetchManifest fetches one tag's registry manifest and returns the raw
// bytes alongside the decoded manifest.Manifest (raw bytes are needed to
// compute a content digest -- see fetchVariantDetail -- since this
// registry host does not send a Docker-Content-Digest response header).
func fetchManifest(ctx context.Context, client *http.Client, n model.Name) (CatalogSource, []byte, manifest.Manifest, error) {
	reqURL := n.BaseURL().JoinPath("v2", n.DisplayNamespaceModel(), "manifests", n.Tag)
	source := CatalogSource{Purpose: catalogSourceManifest, Method: http.MethodGet, URL: reqURL.String(), CheckedAt: time.Now()}

	body, status, header, err := doGET(ctx, client, reqURL.String(), catalogVariantRequestTimeout, "application/vnd.docker.distribution.manifest.v2+json", catalogMaxManifestBytes)
	source.HTTPStatus = status
	if header != nil {
		source.ETag = header.Get("ETag")
		source.LastModified = header.Get("Last-Modified")
	}
	if err != nil {
		source.Error = err.Error()
		return source, nil, manifest.Manifest{}, err
	}
	if status != http.StatusOK {
		err := fmt.Errorf("status %d: %s", status, truncateForError(body))
		source.Error = err.Error()
		return source, nil, manifest.Manifest{}, err
	}

	var m manifest.Manifest
	if err := json.Unmarshal(body, &m); err != nil {
		source.Error = fmt.Sprintf("decode: %v", err)
		return source, nil, manifest.Manifest{}, err
	}
	return source, body, m, nil
}

// fetchConfigBlob fetches the config layer a manifest's Config.Digest
// points at. The registry answers with a 307 redirect to a signed CDN URL
// for this (verified live); Go's http.Client follows that automatically.
func fetchConfigBlob(ctx context.Context, client *http.Client, n model.Name, digest string) (CatalogSource, registryConfig, error) {
	reqURL := n.BaseURL().JoinPath("v2", n.DisplayNamespaceModel(), "blobs", digest)
	source := CatalogSource{Purpose: catalogSourceConfigBlob, Method: http.MethodGet, URL: reqURL.String(), CheckedAt: time.Now()}

	body, status, header, err := doGET(ctx, client, reqURL.String(), catalogVariantRequestTimeout, "", catalogMaxBlobBytes)
	source.HTTPStatus = status
	if header != nil {
		source.ETag = header.Get("ETag")
		source.LastModified = header.Get("Last-Modified")
	}
	if err != nil {
		source.Error = err.Error()
		return source, registryConfig{}, err
	}
	if status != http.StatusOK {
		err := fmt.Errorf("status %d: %s", status, truncateForError(body))
		source.Error = err.Error()
		return source, registryConfig{}, err
	}

	var cfg registryConfig
	if err := json.Unmarshal(body, &cfg); err != nil {
		source.Error = fmt.Sprintf("decode: %v", err)
		return source, registryConfig{}, err
	}
	return source, cfg, nil
}

// fetchVariantDetail resolves exact size, family, parameter count,
// quantization and format for one "<repo>:<tag>" reference: one manifest
// fetch (size, layer count, config digest), then one config-blob fetch
// (family/parameter count/quantization/format).
//
// Capabilities is deliberately minimal and says so via CapabilitiesNote:
// the registry config blob has no "capabilities" field at all (verified
// live against several config blobs), so the only capability this code can
// honestly assert is "vision", and only when a CLIP/projector layer is
// directly observable in the manifest or config -- never inferred from the
// model or tag name. This is NOT the same set the real Ollama server
// reports for an installed model (which additionally inspects the chat
// template and GGUF metadata this registry never exposes), and callers
// must not treat it as exhaustive.
func fetchVariantDetail(ctx context.Context, client *http.Client, repo, tag string) CatalogVariantDetail {
	fullName := repo + ":" + tag
	detail := CatalogVariantDetail{Name: repo, Tag: tag, FullName: fullName, FetchedAt: time.Now()}

	n := model.ParseName(fullName)
	if !n.IsValid() {
		detail.Error = fmt.Sprintf("%q is not a valid model reference", fullName)
		return detail
	}

	manifestSource, rawManifest, m, err := fetchManifest(ctx, client, n)
	detail.Sources = append(detail.Sources, manifestSource)
	if err != nil {
		detail.Error = err.Error()
		return detail
	}

	sum := sha256.Sum256(rawManifest)
	detail.ManifestDigest = fmt.Sprintf("sha256:%x", sum)
	detail.LayerCount = len(m.Layers)
	detail.TotalSizeBytes = m.Size()
	detail.TotalSizeDisplay = format.HumanBytes2(uint64(detail.TotalSizeBytes))
	detail.ConfigSizeBytes = m.Config.Size

	hasProjectorLayer := false
	for _, layer := range m.Layers {
		if layer.MediaType == manifestMediaTypeProjector {
			hasProjectorLayer = true
			break
		}
	}

	if m.Config.Digest == "" {
		detail.Error = "manifest carries no config layer digest; cannot fetch model configuration"
		return detail
	}

	configSource, cfg, err := fetchConfigBlob(ctx, client, n, m.Config.Digest)
	detail.Sources = append(detail.Sources, configSource)
	if err != nil {
		detail.Error = err.Error()
		return detail
	}

	detail.Format = cfg.ModelFormat
	detail.Family = cfg.ModelFamily
	detail.Families = cfg.ModelFamilies
	detail.ParameterSize = cfg.ModelType
	detail.Quantization = cfg.FileType

	hasClipFamily := false
	for _, f := range cfg.ModelFamilies {
		if strings.EqualFold(f, "clip") {
			hasClipFamily = true
			break
		}
	}
	if hasClipFamily || hasProjectorLayer {
		detail.Capabilities = append(detail.Capabilities, "vision")
	}
	detail.CapabilitiesNote = "derived only from directly observable evidence (a CLIP/projector layer) -- the registry does not publish a capabilities field, this list is not exhaustive, and it is not the same set the running Ollama server reports for an installed model"

	detail.Complete = true
	return detail
}

// --- HTTP handlers -------------------------------------------------------

func (s *Server) modelCatalogGet(w http.ResponseWriter, r *http.Request) error {
	manager := getCatalogManager()
	manager.mu.Lock()
	manager.loadLocked()
	snapshot := manager.snapshot
	refreshing := manager.refreshing
	startedAt := manager.refreshStartedAt
	manager.mu.Unlock()

	response := map[string]any{"refreshing": refreshing}
	if refreshing {
		response["refreshStartedAt"] = startedAt
	}
	if snapshot == nil {
		response["catalog"] = nil
		response["verdict"] = CatalogVerdictUnavailable
		response["reason"] = "no catalog has been fetched yet; POST /api/v1/models/catalog/refresh to fetch one"
	} else {
		response["catalog"] = snapshot
		response["ageSeconds"] = time.Since(snapshot.FetchedAt).Seconds()
	}

	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(response)
}

func (s *Server) modelCatalogStatus(w http.ResponseWriter, r *http.Request) error {
	manager := getCatalogManager()
	manager.mu.Lock()
	manager.loadLocked()
	snapshot := manager.snapshot
	refreshing := manager.refreshing
	startedAt := manager.refreshStartedAt
	cachedVariants := len(manager.variants)
	manager.mu.Unlock()

	response := map[string]any{
		"refreshing":     refreshing,
		"cachedVariants": cachedVariants,
	}
	if refreshing {
		response["refreshStartedAt"] = startedAt
	}
	if snapshot == nil {
		response["verdict"] = CatalogVerdictUnavailable
		response["reason"] = "no catalog has been fetched yet"
	} else {
		response["fetchedAt"] = snapshot.FetchedAt
		response["ageSeconds"] = time.Since(snapshot.FetchedAt).Seconds()
		response["namesEnumerated"] = snapshot.NamesEnumerated
		response["tagsEnumerated"] = snapshot.TagsEnumerated
		response["failureCount"] = snapshot.FailureCount
		response["verdict"] = snapshot.Verdict
		response["reason"] = snapshot.Reason
		response["sources"] = snapshot.Sources
		response["durationMs"] = snapshot.DurationMS
		response["truncatedByDeadline"] = snapshot.TruncatedByDeadline
		response["truncatedByCap"] = snapshot.TruncatedByCap
	}

	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(response)
}

func (s *Server) modelCatalogRefresh(w http.ResponseWriter, r *http.Request) error {
	if r.Method != http.MethodPost {
		return errors.New("method not allowed")
	}

	manager := getCatalogManager()
	manager.startRefresh()

	manager.mu.Lock()
	refreshing := manager.refreshing
	startedAt := manager.refreshStartedAt
	manager.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(map[string]any{"refreshing": refreshing, "refreshStartedAt": startedAt})
}

func (s *Server) modelVariantGet(w http.ResponseWriter, r *http.Request) error {
	name := strings.TrimSpace(r.URL.Query().Get("name"))
	tag := strings.TrimSpace(r.URL.Query().Get("tag"))
	if name == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		return json.NewEncoder(w).Encode(map[string]string{"error": "name is required"})
	}
	if tag == "" {
		tag = "latest"
	}
	forceRefresh := r.URL.Query().Get("refresh") == "true"

	manager := getCatalogManager()
	ctx, cancel := context.WithTimeout(r.Context(), catalogVariantRequestTimeout*3)
	defer cancel()
	detail := manager.getOrFetchVariant(ctx, name, tag, forceRefresh)

	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(detail)
}
