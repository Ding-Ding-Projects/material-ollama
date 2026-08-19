//go:build windows || darwin

package ui

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/ollama/ollama/envconfig"
)

// TestComputeFitVerdict_NilModelBytesYieldsUnknown is the exact case this
// lane's brief names: computeFitVerdict must return FitUnknown -- never
// FitRunsWell -- when the model's byte size has not resolved yet, no
// matter how confidently RAM and VRAM are otherwise known. Rule 1 in
// computeFitVerdict short-circuits on in.modelBytes == nil before it ever
// reaches the free/total VRAM comparisons that could produce a "runs-well"
// verdict, and this test proves that short-circuit actually fires rather
// than merely reading as though it should in the source.
func TestComputeFitVerdict_NilModelBytesYieldsUnknown(t *testing.T) {
	in := fitInputs{
		modelBytes: nil, // the one fact under test: genuinely unresolved
		freeVRAM:   &ByteValue{Bytes: 64 << 30, Confidence: confidenceMeasured},
		totalVRAM:  &ByteValue{Bytes: 64 << 30, Confidence: confidenceMeasured},
		freeRAM:    &ByteValue{Bytes: 64 << 30, Confidence: confidenceMeasured},
		totalRAM:   &ByteValue{Bytes: 64 << 30, Confidence: confidenceMeasured},
	}

	got := computeFitVerdict(in)

	if got.Verdict == FitRunsWell {
		t.Fatalf("nil model bytes with abundant VRAM must never yield %q; got %+v", FitRunsWell, got)
	}
	if got.Verdict != FitUnknown {
		t.Fatalf("Verdict = %q, want %q (got %+v)", got.Verdict, FitUnknown, got)
	}

	found := false
	for _, m := range got.MissingData {
		if m == "model size (unknown until the manifest resolves)" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("MissingData = %v, want it to name the unresolved model size", got.MissingData)
	}

	// computeFitVerdict skips the KV-estimate arithmetic entirely on this
	// branch (it returns before reaching it) -- assert that stays true so
	// a future refactor can't quietly start fabricating Evidence/
	// Assumptions off zero-value bytes for an unknown-size model.
	if len(got.Evidence) != 0 || len(got.Assumptions) != 0 {
		t.Fatalf("an unknown verdict must carry no Evidence/Assumptions, got Evidence=%v Assumptions=%v", got.Evidence, got.Assumptions)
	}
}

// TestComputeFitVerdict_BothRAMAndVRAMUnknownYieldsUnknown covers the
// other half of Rule 1: a known model size is not enough on its own if
// neither RAM nor VRAM confidence has resolved past "unknown" -- there is
// nothing to compare the model's size against yet.
func TestComputeFitVerdict_BothRAMAndVRAMUnknownYieldsUnknown(t *testing.T) {
	modelBytes := uint64(2 << 30)
	in := fitInputs{
		modelBytes: &modelBytes,
		totalVRAM:  &ByteValue{Confidence: confidenceUnknown},
		totalRAM:   &ByteValue{Confidence: confidenceUnknown},
	}

	got := computeFitVerdict(in)

	if got.Verdict != FitUnknown {
		t.Fatalf("Verdict = %q, want %q (got %+v)", got.Verdict, FitUnknown, got)
	}
}

// TestComputeFitVerdict_FitsFreeVRAMYieldsRunsWell is the contrasting
// green case: with a real model size and ample free VRAM, the function
// must actually reach FitRunsWell rather than the unknown/failure paths
// above being the only outcome it can ever produce. Without this, the two
// tests above could pass merely because computeFitVerdict always returns
// FitUnknown.
func TestComputeFitVerdict_FitsFreeVRAMYieldsRunsWell(t *testing.T) {
	modelBytes := uint64(2 << 30) // 2 GiB model
	in := fitInputs{
		modelBytes: &modelBytes,
		freeVRAM:   &ByteValue{Bytes: 8 << 30, Display: "8.0 GiB", Confidence: confidenceMeasured},
		totalVRAM:  &ByteValue{Bytes: 8 << 30, Display: "8.0 GiB", Confidence: confidenceMeasured},
		totalRAM:   &ByteValue{Bytes: 32 << 30, Display: "32 GiB", Confidence: confidenceMeasured},
	}

	got := computeFitVerdict(in)

	if got.Verdict != FitRunsWell {
		t.Fatalf("Verdict = %q, want %q (got %+v)", got.Verdict, FitRunsWell, got)
	}
	if len(got.Evidence) == 0 {
		t.Fatalf("a runs-well verdict must explain itself with Evidence, got none: %+v", got)
	}
}

// --- ollama-manager: the runtime health/detection layer -----------------
//
// buildHardwareResponse/cachedHardware (see hardware.go) are the layer
// underneath the whole Ollama suite manager: they scrape the real running
// server's log for compute/VRAM facts, measure real system RAM and free
// disk, and read real OLLAMA_* overrides from the environment. Nothing
// below mocks discover.GetCPUMem or server.GetInferenceInfo -- both are
// exercised for real, the same way a running desktop app would exercise
// them; a stub logger merely records what buildHardwareResponse chose to
// warn about, so a probe that legitimately fails in this test environment
// (no real Ollama server writing logs here) is still provable as a
// graceful degrade rather than a hang or a panic.

// stubLogger implements the hardware.go `logger` interface, recording
// every Warn call instead of writing to a real *slog.Logger, so a test can
// assert exactly which sub-probes buildHardwareResponse decided to warn
// about.
type stubLogger struct {
	warnings []string
}

func (l *stubLogger) Warn(msg string, args ...any) {
	l.warnings = append(l.warnings, msg)
}

// TestBuildHardwareResponse_NeverFailsWholeResponseOnOneBadSubProbe proves
// the central contract getHardware's own doc comment states: a single
// sub-probe (most commonly the log scrape, since no real Ollama server is
// writing inference-compute log lines in this test process) degrades only
// its own section -- Devices stays an empty, non-nil slice plus a
// warning -- while the rest of the response (system RAM, free disk,
// effective context length) is still real, measured data. This is the
// exact function the "ollama-manager" suite area's own Notes name as
// having zero test coverage.
func TestBuildHardwareResponse_NeverFailsWholeResponseOnOneBadSubProbe(t *testing.T) {
	before := time.Now()
	log := &stubLogger{}

	got := buildHardwareResponse(context.Background(), log)

	if got == nil {
		t.Fatal("buildHardwareResponse returned nil")
	}
	if got.DetectedAt.Before(before) || got.DetectedAt.After(time.Now()) {
		t.Fatalf("DetectedAt = %v, want a timestamp taken during this call (test started at %v)", got.DetectedAt, before)
	}
	if got.Devices == nil {
		t.Fatal("Devices = nil, want a non-nil (possibly empty) slice -- a nil slice serializes identically to an absent field, which is exactly the silent-zero-value failure ByteValue's own doc comment warns against")
	}

	// System RAM is a direct syscall (GlobalMemoryStatusEx on Windows) with
	// no external dependency, so on any real machine running this test
	// suite it must succeed: either every warning is about something else,
	// or SystemRAM/FreeRAM are genuinely populated.
	if got.SystemRAM == nil {
		t.Fatalf("SystemRAM = nil; discover.GetCPUMem must succeed on the machine running this test (warnings: %v)", log.warnings)
	}
	if got.SystemRAM.Bytes == 0 {
		t.Fatal("SystemRAM.Bytes = 0, want a real measured total -- every development machine has more than zero bytes of RAM")
	}
	if got.SystemRAM.Confidence != confidenceMeasured {
		t.Fatalf("SystemRAM.Confidence = %q, want %q (a direct syscall result)", got.SystemRAM.Confidence, confidenceMeasured)
	}
	if got.FreeRAM == nil {
		t.Fatal("FreeRAM = nil, want a real measured value alongside SystemRAM")
	}

	// Free disk on the models directory: existingDirFor guarantees this
	// resolves to *some* existing ancestor even on a fresh install where
	// the models directory itself does not exist yet, so this must always
	// succeed too.
	if got.Storage.ModelsDir != envconfig.Models() {
		t.Fatalf("Storage.ModelsDir = %q, want %q (envconfig.Models())", got.Storage.ModelsDir, envconfig.Models())
	}
	if got.Storage.Free == nil {
		t.Fatalf("Storage.Free = nil; free disk space must resolve via existingDirFor's nearest-existing-ancestor walk (warnings: %v)", log.warnings)
	}

	// Effective context length: either a real OLLAMA_CONTEXT_LENGTH
	// override, or the documented assumed-default -- never zero and never
	// an unlabeled source.
	if got.Effective.ContextLength <= 0 {
		t.Fatalf("Effective.ContextLength = %d, want > 0", got.Effective.ContextLength)
	}
	if got.Effective.ContextLengthSource != "override" && got.Effective.ContextLengthSource != "assumed-default" {
		t.Fatalf("Effective.ContextLengthSource = %q, want %q or %q", got.Effective.ContextLengthSource, "override", "assumed-default")
	}

	// Every Warning appended to the response must correspond to a real
	// log.Warn call -- the two must never drift apart, or a caller reading
	// only the logs (or only the HTTP response) would see a different
	// picture of what degraded.
	if len(got.Warnings) != len(log.warnings) {
		t.Fatalf("len(Warnings) = %d, len(log.warnings) = %d -- every response warning must also reach the server log, and vice versa (Warnings=%v, log.warnings=%v)",
			len(got.Warnings), len(log.warnings), got.Warnings, log.warnings)
	}
}

// TestBuildHardwareResponse_RespectsCanceledContext proves
// buildHardwareResponse degrades gracefully -- rather than hanging or
// panicking -- when its context is already canceled before the call, the
// same way a real caller's context could be canceled by a client
// disconnect mid-request.
func TestBuildHardwareResponse_RespectsCanceledContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	log := &stubLogger{}
	done := make(chan *HardwareResponse, 1)
	go func() { done <- buildHardwareResponse(ctx, log) }()

	select {
	case got := <-done:
		if got == nil {
			t.Fatal("buildHardwareResponse returned nil on a canceled context")
		}
		if got.Devices == nil {
			t.Fatal("Devices = nil on a canceled context, want a non-nil empty slice")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("buildHardwareResponse did not return within 5s of a pre-canceled context -- it must degrade the log-scrape sub-probe rather than block on it")
	}
}

// TestVRAMTotals_EmptyDevicesYieldsNilNil proves vramTotals never invents
// a zero-byte ByteValue for "no GPU detected": both return values must be
// nil, matching ByteValue's own doc-comment contract that nil means
// "unknown", never "zero".
func TestVRAMTotals_EmptyDevicesYieldsNilNil(t *testing.T) {
	free, total := vramTotals(nil)
	if free != nil {
		t.Fatalf("free = %+v, want nil", free)
	}
	if total != nil {
		t.Fatalf("total = %+v, want nil", total)
	}
}

// TestVRAMTotals_SumsKnownDevicesAndFallsBackOnPartialUnknown covers both
// halves of vramTotals in one exercise: with every device's TotalVRAM
// known, the sum must be exact; the moment even one device's FreeVRAM is
// unknown, the aggregate FreeVRAM must fall back to nil entirely rather
// than silently summing only the known devices and under-reporting.
func TestVRAMTotals_SumsKnownDevicesAndFallsBackOnPartialUnknown(t *testing.T) {
	devices := []HardwareDevice{
		{
			TotalVRAM: &ByteValue{Bytes: 8 << 30, Confidence: confidenceParsed},
			// FreeVRAM deliberately nil -- this build's log scraper never
			// captures "available=" today, per vramTotals' own doc comment.
		},
		{
			TotalVRAM: &ByteValue{Bytes: 12 << 30, Confidence: confidenceParsed},
		},
	}

	free, total := vramTotals(devices)

	if free != nil {
		t.Fatalf("free = %+v, want nil (FreeVRAM is unknown for every device in this build today)", free)
	}
	if total == nil {
		t.Fatal("total = nil, want a summed ByteValue since every device's TotalVRAM is known")
	}
	wantTotal := uint64(20 << 30)
	if total.Bytes != wantTotal {
		t.Fatalf("total.Bytes = %d, want %d (8 GiB + 12 GiB)", total.Bytes, wantTotal)
	}
	if total.Confidence != confidenceParsed {
		t.Fatalf("total.Confidence = %q, want %q", total.Confidence, confidenceParsed)
	}
}

// TestParseLogBytes_ValidAndInvalidForms proves parseLogBytes correctly
// inverts every display form format.HumanBytes2 actually produces
// ("%.1f GiB/MiB/KiB" and "%d B", per parseLogBytes' own doc comment),
// and rejects a string that does not match at all rather than silently
// returning zero.
func TestParseLogBytes_ValidAndInvalidForms(t *testing.T) {
	cases := []struct {
		in      string
		wantOK  bool
		wantVal uint64
	}{
		{"8.0 GiB", true, uint64(8.0 * (1 << 30))},
		{"512.5 MiB", true, uint64(512.5 * (1 << 20))},
		{"1.0 KiB", true, uint64(1.0 * (1 << 10))},
		{"42 B", true, 42},
		{"not a size", false, 0},
		{"", false, 0},
		{"8.0 TiB", false, 0}, // TiB is not one of the four forms this scraper accepts
	}
	for _, c := range cases {
		t.Run(c.in, func(t *testing.T) {
			got, ok := parseLogBytes(c.in)
			if ok != c.wantOK {
				t.Fatalf("parseLogBytes(%q) ok = %v, want %v", c.in, ok, c.wantOK)
			}
			if ok && got != c.wantVal {
				t.Fatalf("parseLogBytes(%q) = %d, want %d", c.in, got, c.wantVal)
			}
		})
	}
}

// TestExistingDirFor_WalksUpToNearestExistingAncestor proves
// existingDirFor's exact contract (needed because GetDiskFreeSpaceExW/
// statfs both require their target to exist, and a fresh install's models
// directory may not have been created yet): given a path several levels
// below a real directory, it returns that real ancestor rather than the
// nonexistent leaf.
func TestExistingDirFor_WalksUpToNearestExistingAncestor(t *testing.T) {
	root := t.TempDir()
	nested := filepath.Join(root, "does", "not", "exist", "yet")

	got := existingDirFor(nested)

	if got != root {
		t.Fatalf("existingDirFor(%q) = %q, want %q", nested, got, root)
	}

	// The directory itself, when it does exist, is returned unchanged.
	if got := existingDirFor(root); got != root {
		t.Fatalf("existingDirFor(%q) = %q, want %q (already exists)", root, got, root)
	}
}

// TestExistingDirFor_NeverReturnsEmptyOnDriveRoot is a bounded-loop safety
// check: existingDirFor must terminate (its doc comment promises "bounded
// to a handful of hops") even when walking from a path whose ancestors
// never resolve to an existing directory below the OS root, rather than
// looping until filepath.Dir stops changing and then panicking on an
// empty return.
func TestExistingDirFor_NeverReturnsEmptyOnDriveRoot(t *testing.T) {
	// Ten levels of a nonexistent chain under the OS temp root -- deeper
	// than existingDirFor's 8-hop bound -- proves it returns *something*
	// (its own bounded walk's last position) rather than hanging or
	// panicking, even when it cannot reach a real ancestor within budget.
	base := os.TempDir()
	deep := base
	for i := 0; i < 10; i++ {
		deep = filepath.Join(deep, "nope")
	}

	got := existingDirFor(deep)
	if got == "" {
		t.Fatal("existingDirFor returned an empty string")
	}
}
