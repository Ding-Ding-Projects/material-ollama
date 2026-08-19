//go:build windows || darwin

package ui

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/ollama/ollama/app/server"
	"github.com/ollama/ollama/discover"
	"github.com/ollama/ollama/envconfig"
	"github.com/ollama/ollama/format"
)

// ByteValue reports a byte quantity next to how confidently it was obtained.
// "unknown" must never be silently coerced to a zero value: a zero-VRAM
// device would read as "no GPU" when the truth is "not known yet", which is
// exactly the failure this type exists to prevent. Callers (fit-verdict
// logic below, and the frontend) must check Confidence before trusting
// Bytes, and must treat a nil *ByteValue as "unknown" rather than zero.
type ByteValue struct {
	Bytes   uint64 `json:"bytes"`
	Display string `json:"display"`
	Source  string `json:"source"`
	// Confidence is one of "measured" | "parsed" | "assumed" | "unknown".
	Confidence string `json:"confidence"`
}

const (
	confidenceMeasured = "measured"
	confidenceParsed   = "parsed"
	confidenceAssumed  = "assumed"
	confidenceUnknown  = "unknown"
)

func measuredBytes(b uint64, source string) *ByteValue {
	return &ByteValue{Bytes: b, Display: format.HumanBytes2(b), Source: source, Confidence: confidenceMeasured}
}

// HardwareDevice is one compute device discovered by scraping the running
// ollama server's log (see server.GetInferenceInfo). TotalVRAM/FreeVRAM are
// nullable: a device the log line didn't carry a parseable "total=" for
// reports nil rather than a fabricated zero.
type HardwareDevice struct {
	ID        string     `json:"id"`
	Name      string     `json:"name"`
	Library   string     `json:"library"`
	Variant   string     `json:"variant"`
	Compute   string     `json:"compute"`
	Driver    string     `json:"driver"`
	TotalVRAM *ByteValue `json:"totalVram,omitempty"`
	FreeVRAM  *ByteValue `json:"freeVram,omitempty"`
}

// HardwareStorage reports free space on the volume backing the models
// directory, which is what a pull's storage preflight (see models.go)
// actually needs.
type HardwareStorage struct {
	ModelsDir string     `json:"modelsDir"`
	Free      *ByteValue `json:"free,omitempty"`
}

// HardwareOverrides lists only the environment variables that were actually
// set by the user and influence hardware detection/scheduling. An unset
// variable is omitted rather than reported as its zero value, so the UI can
// tell "explicitly disabled" from "never configured".
type HardwareOverrides struct {
	Models             string `json:"models,omitempty"`
	CudaVisibleDevices string `json:"cudaVisibleDevices,omitempty"`
	HipVisibleDevices  string `json:"hipVisibleDevices,omitempty"`
	RocrVisibleDevices string `json:"rocrVisibleDevices,omitempty"`
	VkVisibleDevices   string `json:"vkVisibleDevices,omitempty"`
	GPUOverheadBytes   uint64 `json:"gpuOverheadBytes,omitempty"`
	ContextLength      uint   `json:"contextLength,omitempty"`
}

// HardwareEffective reports the resolved values actually in force after
// overrides are applied, so the UI never has to re-derive them.
type HardwareEffective struct {
	ModelsDir           string `json:"modelsDir"`
	ContextLength       int    `json:"contextLength"`
	ContextLengthSource string `json:"contextLengthSource"` // "override" | "assumed-default"
}

// HardwareResponse is the payload for GET /api/v1/hardware. It is
// deliberately its own endpoint rather than an extension of the existing
// GET /api/v1/inference-compute (see getInferenceCompute in ui.go): that
// endpoint wraps server.GetInferenceInfo, a log scraper that blocks in a
// polling loop, and its only caller already wraps it in a 500ms timeout for
// exactly that reason. Extending it would tie system RAM and free-disk
// reporting (which are fast, syscall-backed, and should never be starved)
// to the log scrape's own latency and failure modes.
type HardwareResponse struct {
	DetectedAt time.Time         `json:"detectedAt"`
	SystemRAM  *ByteValue        `json:"systemRam,omitempty"`
	FreeRAM    *ByteValue        `json:"freeRam,omitempty"`
	Devices    []HardwareDevice  `json:"devices"`
	Storage    HardwareStorage   `json:"storage"`
	Overrides  HardwareOverrides `json:"overrides"`
	Effective  HardwareEffective `json:"effective"`
	Warnings   []string          `json:"warnings,omitempty"`
}

const (
	hardwareTotalBudget     = 2 * time.Second
	hardwareLogScrapeBudget = 750 * time.Millisecond
	hardwareCacheTTL        = 60 * time.Second
)

var (
	hardwareCacheMu   sync.Mutex
	hardwareCacheAt   time.Time
	hardwareCacheResp *HardwareResponse
)

// getHardware serves GET /api/v1/hardware. It never fails the whole response
// because one sub-probe (most commonly the log scrape) timed out; a failed
// sub-probe instead degrades that one section and appends a warning.
func (s *Server) getHardware(w http.ResponseWriter, r *http.Request) error {
	resp := s.cachedHardware(r.Context())
	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(resp)
}

// cachedHardware returns the 60s-cached hardware snapshot, refreshing it
// synchronously (bounded by hardwareTotalBudget) when the cache is empty or
// stale. Shared by getHardware and by models.go's fit-verdict computation so
// listing installed/queued models doesn't trigger its own log scrape on
// every request.
func (s *Server) cachedHardware(ctx context.Context) *HardwareResponse {
	hardwareCacheMu.Lock()
	if hardwareCacheResp != nil && time.Since(hardwareCacheAt) < hardwareCacheTTL {
		resp := hardwareCacheResp
		hardwareCacheMu.Unlock()
		return resp
	}
	hardwareCacheMu.Unlock()

	budgetCtx, cancel := context.WithTimeout(ctx, hardwareTotalBudget)
	defer cancel()
	resp := buildHardwareResponse(budgetCtx, s.log())

	hardwareCacheMu.Lock()
	hardwareCacheResp = resp
	hardwareCacheAt = time.Now()
	hardwareCacheMu.Unlock()

	return resp
}

// vramTotals sums VRAM across every detected device. Free VRAM per device
// is never populated today (see the comment on HardwareDevice.FreeVRAM):
// server.GetInferenceInfo's log scraper only captures a "total=" field, not
// "available=", and this file deliberately does not extend that scraper.
// So freeVRAM here is always nil in practice, and fit verdicts fall back to
// comparing against total VRAM (runs-with-limits) rather than free VRAM
// (runs-well) until the scraper is extended to capture "available=" too.
func vramTotals(devices []HardwareDevice) (freeVRAM, totalVRAM *ByteValue) {
	if len(devices) == 0 {
		return nil, nil
	}
	var freeSum, totalSum uint64
	knownFree, knownTotal := true, true
	for _, d := range devices {
		if d.FreeVRAM != nil {
			freeSum += d.FreeVRAM.Bytes
		} else {
			knownFree = false
		}
		if d.TotalVRAM != nil {
			totalSum += d.TotalVRAM.Bytes
		} else {
			knownTotal = false
		}
	}
	if knownFree {
		freeVRAM = &ByteValue{Bytes: freeSum, Display: format.HumanBytes2(freeSum), Source: "sum of detected devices", Confidence: confidenceParsed}
	}
	if knownTotal {
		totalVRAM = &ByteValue{Bytes: totalSum, Display: format.HumanBytes2(totalSum), Source: "sum of detected devices", Confidence: confidenceParsed}
	}
	return freeVRAM, totalVRAM
}

func buildHardwareResponse(ctx context.Context, log logger) *HardwareResponse {
	resp := &HardwareResponse{
		DetectedAt: time.Now(),
		Devices:    []HardwareDevice{},
		Overrides:  HardwareOverrides{},
	}

	// System RAM: a direct syscall (GlobalMemoryStatusEx on Windows,
	// host_statistics64 via cgo on darwin), so this is genuinely "measured".
	if mem, err := discover.GetCPUMem(); err != nil {
		warn := fmt.Sprintf("system RAM: %s", err.Error())
		resp.Warnings = append(resp.Warnings, warn)
		log.Warn("hardware: "+warn, "error", err)
	} else {
		resp.SystemRAM = measuredBytes(mem.TotalMemory, "GlobalMemoryStatusEx/host_statistics64")
		resp.FreeRAM = measuredBytes(mem.FreeMemory, "GlobalMemoryStatusEx/host_statistics64")
	}

	// GPU devices + VRAM: scraped from the running server's log. This is
	// the one probe that can legitimately be slow (server just started, log
	// hasn't rotated in yet), so it gets its own sub-budget and a timeout
	// here degrades Devices to empty-plus-warning rather than failing the
	// whole response.
	logCtx, logCancel := context.WithTimeout(ctx, hardwareLogScrapeBudget)
	info, err := server.GetInferenceInfo(logCtx)
	logCancel()
	if err != nil {
		warn := "no compute devices detected yet (server log not scraped in time); this is expected right after the server starts or the log rotates"
		resp.Warnings = append(resp.Warnings, warn)
		log.Warn("hardware: "+warn, "error", err)
	} else {
		for _, ic := range info.Computes {
			dev := HardwareDevice{
				ID:      ic.Name,
				Name:    ic.Name,
				Library: ic.Library,
				Variant: ic.Variant,
				Compute: ic.Compute,
				Driver:  ic.Driver,
			}
			if b, ok := parseLogBytes(ic.VRAM); ok {
				dev.TotalVRAM = &ByteValue{Bytes: b, Display: ic.VRAM, Source: "server log (inference compute)", Confidence: confidenceParsed}
			}
			resp.Devices = append(resp.Devices, dev)
		}
	}

	// Free disk on the models directory.
	modelsDir := envconfig.Models()
	resp.Storage.ModelsDir = modelsDir
	if free, err := freeDiskBytes(existingDirFor(modelsDir)); err != nil {
		warn := fmt.Sprintf("free disk space: %s", err.Error())
		resp.Warnings = append(resp.Warnings, warn)
		log.Warn("hardware: "+warn, "error", err, "modelsDir", modelsDir)
	} else {
		resp.Storage.Free = measuredBytes(free, "GetDiskFreeSpaceExW/statfs")
	}

	// Overrides actually set by the user (an unset var is omitted, never
	// reported as its zero value).
	resp.Overrides.Models = envconfig.Var("OLLAMA_MODELS")
	resp.Overrides.CudaVisibleDevices = envconfig.CudaVisibleDevices()
	resp.Overrides.HipVisibleDevices = envconfig.HipVisibleDevices()
	resp.Overrides.RocrVisibleDevices = envconfig.RocrVisibleDevices()
	resp.Overrides.VkVisibleDevices = envconfig.VkVisibleDevices()
	resp.Overrides.GPUOverheadBytes = envconfig.GpuOverhead()
	resp.Overrides.ContextLength = envconfig.ContextLength()

	resp.Effective.ModelsDir = modelsDir
	if cl := envconfig.ContextLength(); cl > 0 {
		resp.Effective.ContextLength = int(cl)
		resp.Effective.ContextLengthSource = "override"
	} else {
		resp.Effective.ContextLength = defaultContextLengthAssumption
		resp.Effective.ContextLengthSource = "assumed-default"
	}

	return resp
}

// logger is the minimal surface of *slog.Logger this file needs, so tests
// (none in this bounded pass, but kept honest for the next one) can pass a
// stub.
type logger interface {
	Warn(msg string, args ...any)
}

// existingDirFor walks up from path until it finds a directory that exists,
// bounded to a handful of hops. GetDiskFreeSpaceExW/statfs both require the
// target to exist, and on a fresh install the models directory may not have
// been created yet.
func existingDirFor(path string) string {
	dir := path
	for range 8 {
		if info, err := os.Stat(dir); err == nil && info.IsDir() {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return dir
}

// logBytesRE matches the exact display forms produced by format.HumanBytes2
// (format/bytes.go), which is what the "inference compute" log line uses
// for its total= field (discover/types.go): "%.1f GiB", "%.1f MiB",
// "%.1f KiB", or "%d B".
var logBytesRE = regexp.MustCompile(`^([0-9]+(?:\.[0-9]+)?)\s*(GiB|MiB|KiB|B)$`)

// parseLogBytes inverts format.HumanBytes2. It is a best-effort parse of a
// display string scraped from a log line, never a measurement, which is why
// the resulting ByteValue.Confidence is always "parsed", never "measured".
func parseLogBytes(s string) (uint64, bool) {
	m := logBytesRE.FindStringSubmatch(s)
	if m == nil {
		return 0, false
	}
	value, err := strconv.ParseFloat(m[1], 64)
	if err != nil {
		return 0, false
	}
	var multiplier float64
	switch m[2] {
	case "GiB":
		multiplier = float64(format.GibiByte)
	case "MiB":
		multiplier = float64(format.MebiByte)
	case "KiB":
		multiplier = float64(format.KibiByte)
	case "B":
		multiplier = 1
	default:
		return 0, false
	}
	return uint64(value * multiplier), true
}

// defaultContextLengthAssumption is used only when OLLAMA_CONTEXT_LENGTH is
// unset (0), in which case the real server picks a VRAM-tiered default
// (4k/32k/256k) that this handler has no cheap way to reproduce without
// duplicating scheduler logic. It is always listed as an assumption
// alongside the fit verdict that used it (see models.go), never presented
// as a measured fact.
const defaultContextLengthAssumption = 4096

// --- Fit verdicts -----------------------------------------------------
//
// A FitVerdict is computed entirely in Go, from real evidence, and is
// attached to model list/queue entries so the frontend never has to do its
// own arithmetic (or its own guessing) about whether a model will run.

const (
	FitRunsWell       = "runs-well"
	FitRunsWithLimits = "runs-with-limits"
	FitUnlikely       = "unlikely"
	FitUnknown        = "unknown"
)

// FitVerdict is the outcome of comparing a model's known size against the
// hardware snapshot, plus the evidence and assumptions that produced it.
type FitVerdict struct {
	Verdict     string   `json:"verdict"` // one of Fit* above
	Evidence    []string `json:"evidence,omitempty"`
	Assumptions []string `json:"assumptions,omitempty"`
	MissingData []string `json:"missingData,omitempty"`
}

// kvBytesPerContextToken is a deliberately coarse, model-agnostic ceiling
// used only to estimate KV cache overhead. It is NOT derived from the
// model's name, parameter count, or quantization — none of those are
// parsed from anything the pull queue or install list gives us — and it is
// always surfaced in FitVerdict.Assumptions with the exact number used, so
// nobody mistakes it for a measurement.
const kvBytesPerContextToken uint64 = 128 * 1024 // 128 KiB/token, F16-ish upper bound

// fitInputs is every piece of real evidence computeFitVerdict is allowed to
// look at. Deliberately excludes anything derived from a model's name.
type fitInputs struct {
	modelBytes          *uint64
	freeVRAM, totalVRAM *ByteValue
	freeRAM, totalRAM   *ByteValue
	residentModels      []string
	contextLength       int
	contextLengthSource string
}

// computeFitVerdict applies the rules in order: unknown short-circuits when
// there isn't enough evidence to say anything; runs-well when the model
// plus its estimated KV cache fits in currently-free VRAM; runs-with-limits
// when it fits total VRAM (would need to evict resident models) or total
// RAM (CPU offload); unlikely otherwise.
func computeFitVerdict(in fitInputs) FitVerdict {
	var missing []string
	if in.modelBytes == nil {
		missing = append(missing, "model size (unknown until the manifest resolves)")
	}
	ramKnown := in.totalRAM != nil && in.totalRAM.Confidence != confidenceUnknown
	vramKnown := in.totalVRAM != nil && in.totalVRAM.Confidence != confidenceUnknown
	if !ramKnown {
		missing = append(missing, "system RAM")
	}
	if !vramKnown {
		missing = append(missing, "GPU VRAM (no compute device detected yet)")
	}

	// Rule 1: model bytes unknown, or both RAM and VRAM unknown -> unknown.
	// Never coerce missing data to zero and call that a verdict.
	if in.modelBytes == nil || (!ramKnown && !vramKnown) {
		return FitVerdict{Verdict: FitUnknown, MissingData: missing}
	}

	contextLength := in.contextLength
	if contextLength <= 0 {
		contextLength = defaultContextLengthAssumption
	}
	kvEstimate := kvBytesPerContextToken * uint64(contextLength)
	assumptions := []string{
		fmt.Sprintf("KV cache estimate: %d tokens x %s/token = %s (generic per-token ceiling, not derived from model architecture)",
			contextLength, format.HumanBytes2(kvBytesPerContextToken), format.HumanBytes2(kvEstimate)),
	}
	if in.contextLengthSource == "assumed-default" {
		assumptions = append(assumptions, fmt.Sprintf("context length assumed at %d tokens (OLLAMA_CONTEXT_LENGTH is unset; the real server may pick a different VRAM-tiered default)", contextLength))
	}

	required := *in.modelBytes + kvEstimate

	// Rule 2: fits in currently-free VRAM -> runs-well.
	if vramKnown && in.freeVRAM != nil && required <= in.freeVRAM.Bytes {
		return FitVerdict{
			Verdict: FitRunsWell,
			Evidence: []string{
				fmt.Sprintf("needs %s (model %s + estimated KV %s); %s free VRAM available", format.HumanBytes2(required), format.HumanBytes2(*in.modelBytes), format.HumanBytes2(kvEstimate), in.freeVRAM.Display),
			},
			Assumptions: assumptions,
		}
	}

	// Rule 3: fits total VRAM but not free VRAM -> runs-with-limits, would
	// need to evict currently-resident models.
	if vramKnown && in.totalVRAM != nil && required <= in.totalVRAM.Bytes {
		evidence := []string{
			fmt.Sprintf("needs %s; %s total VRAM but only %s free", format.HumanBytes2(required), in.totalVRAM.Display, freeVRAMDisplay(in.freeVRAM)),
		}
		if len(in.residentModels) > 0 {
			evidence = append(evidence, fmt.Sprintf("currently-resident models holding VRAM: %s", strings.Join(in.residentModels, ", ")))
		}
		return FitVerdict{Verdict: FitRunsWithLimits, Evidence: evidence, Assumptions: assumptions}
	}

	// Rule 4: fits total system RAM -> runs-with-limits via CPU offload.
	if ramKnown && in.totalRAM != nil && required <= in.totalRAM.Bytes {
		return FitVerdict{
			Verdict:     FitRunsWithLimits,
			Evidence:    []string{fmt.Sprintf("needs %s; does not fit VRAM but fits %s total system RAM", format.HumanBytes2(required), in.totalRAM.Display)},
			Assumptions: append(assumptions, "CPU offload — expect substantially slower generation"),
		}
	}

	// Rule 5: otherwise.
	evidence := []string{fmt.Sprintf("needs %s; exceeds available VRAM and system RAM", format.HumanBytes2(required))}
	if ramKnown && in.totalRAM != nil {
		evidence = append(evidence, fmt.Sprintf("%s total system RAM", in.totalRAM.Display))
	}
	return FitVerdict{Verdict: FitUnlikely, Evidence: evidence, Assumptions: assumptions}
}

func freeVRAMDisplay(v *ByteValue) string {
	if v == nil {
		return "an unknown amount of"
	}
	return v.Display
}
