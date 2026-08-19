//go:build windows || darwin

package ui

import (
	"context"
	"testing"
	"time"
)

// --- ollama-manager: cachedHardware's 60s TTL caching contract -----------
//
// hardware_test.go's own Notes call this out as the one deliberately
// untested half of cachedHardware: buildHardwareResponse itself (the real
// syscalls/log-scrape) is exercised directly there, but nothing proves the
// TTL gate in cachedHardware actually short-circuits a fresh cache or
// actually rebuilds a stale one. Both matter for real: getHardware and
// models.go's attachFitVerdicts share this cache specifically so listing
// installed/queued models doesn't trigger its own log scrape on every
// request (see cachedHardware's own doc comment) -- a TTL check that
// silently always rebuilds defeats that, and one that never expires serves
// permanently stale hardware facts after a GPU is plugged in or removed.
//
// hardwareCacheResp/hardwareCacheAt/hardwareCacheMu are package-level vars
// (see hardware.go), so this test saves and restores their real state
// around itself rather than assuming it owns them exclusively -- the same
// discipline as the package-level modelsManager singleton override in
// models_pause_resume_cancel_test.go.
func TestCachedHardware_ReturnsSameSnapshotWithinTTLThenRebuildsAfterExpiry(t *testing.T) {
	hardwareCacheMu.Lock()
	origResp, origAt := hardwareCacheResp, hardwareCacheAt
	hardwareCacheMu.Unlock()
	t.Cleanup(func() {
		hardwareCacheMu.Lock()
		hardwareCacheResp, hardwareCacheAt = origResp, origAt
		hardwareCacheMu.Unlock()
	})

	s := &Server{}
	ctx := context.Background()

	// Prime the cache with a synthetic, recognizable response and a
	// just-now timestamp -- well inside hardwareCacheTTL.
	fake := &HardwareResponse{Warnings: []string{"synthetic fixture for TestCachedHardware"}}
	hardwareCacheMu.Lock()
	hardwareCacheResp = fake
	hardwareCacheAt = time.Now()
	hardwareCacheMu.Unlock()

	got := s.cachedHardware(ctx)
	if got != fake {
		t.Fatal("expected cachedHardware to return the exact cached pointer while within TTL, got a rebuilt response instead")
	}

	// Age the cache past its TTL and prove the next call rebuilds -- a
	// real call into buildHardwareResponse (already exercised directly in
	// hardware_test.go), so this proves the TTL gate actually routes to it
	// rather than serving the stale snapshot forever.
	hardwareCacheMu.Lock()
	hardwareCacheAt = time.Now().Add(-hardwareCacheTTL - time.Second)
	hardwareCacheMu.Unlock()

	rebuilt := s.cachedHardware(ctx)
	if rebuilt == fake {
		t.Fatal("expected cachedHardware to rebuild once the cached snapshot is older than hardwareCacheTTL, got the stale synthetic pointer back")
	}
	if rebuilt == nil {
		t.Fatal("expected a real rebuilt HardwareResponse, got nil")
	}

	hardwareCacheMu.Lock()
	newAt := hardwareCacheAt
	newResp := hardwareCacheResp
	hardwareCacheMu.Unlock()
	if newResp != rebuilt {
		t.Fatal("expected the rebuilt response to also become the new cached pointer")
	}
	if time.Since(newAt) > 5*time.Second {
		t.Fatalf("expected hardwareCacheAt to be refreshed to roughly now after a rebuild, got %v ago", time.Since(newAt))
	}
}
