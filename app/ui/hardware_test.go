//go:build windows || darwin

package ui

import "testing"

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
