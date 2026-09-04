//go:build windows || darwin

package ui

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/ollama/ollama/app/version"
)

// TestReleaseInfo_DevBuildReports0_0_0WithNoCodeName is the exact contract
// this lane's brief names: a local `go build` (this test binary itself)
// never went through .github/workflows/release.yaml, so version.Version
// is left at its "0.0.0" zero value (see app/version/version.go) and
// GET /api/v1/release must report that honestly -- IsDevBuild true, and
// every dish/workflow field left nil -- rather than let a stale or
// hand-edited buildinfo.json leak a fabricated release identity into a
// binary that never shipped.
func TestReleaseInfo_DevBuildReports0_0_0WithNoCodeName(t *testing.T) {
	if version.Version != "0.0.0" {
		t.Skipf("version.Version = %q, want the dev default %q -- this test only proves the dev-build branch and does not apply to a binary built with -X ldflags", version.Version, "0.0.0")
	}

	s := &Server{}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/release", nil)
	rec := httptest.NewRecorder()

	if err := s.releaseInfo(rec, req); err != nil {
		t.Fatalf("releaseInfo: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	var got ReleaseInfo
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode response: %v (body: %s)", err, rec.Body.String())
	}

	if !got.IsDevBuild {
		t.Fatalf("IsDevBuild = false, want true for version %q", got.Version)
	}
	if got.Version != "0.0.0" {
		t.Fatalf("Version = %q, want %q", got.Version, "0.0.0")
	}
	if got.CodeName != nil {
		t.Fatalf("CodeName = %q, want nil for a development build -- a dev binary must never claim a shipped release's dish name", *got.CodeName)
	}
	if got.DishID != nil {
		t.Fatalf("DishID = %q, want nil for a development build", *got.DishID)
	}
	if got.DishNameEn != nil {
		t.Fatalf("DishNameEn = %q, want nil for a development build", *got.DishNameEn)
	}
	if got.DishNameZhHant != nil {
		t.Fatalf("DishNameZhHant = %q, want nil for a development build", *got.DishNameZhHant)
	}
	if got.WorkflowRunNumber != nil {
		t.Fatalf("WorkflowRunNumber = %v, want nil for a development build", *got.WorkflowRunNumber)
	}
	if got.WorkflowRunID != nil {
		t.Fatalf("WorkflowRunID = %v, want nil for a development build", *got.WorkflowRunID)
	}
	if got.BuiltAt != nil {
		t.Fatalf("BuiltAt = %q, want nil for a development build", *got.BuiltAt)
	}

	// The permanent no-signing policy and the honest "asset manifest is
	// not embedded" reason must be reported regardless of dev/release
	// status -- these are never gated on IsDevBuild.
	if !got.Unsigned {
		t.Fatal("Unsigned = false, want true under this project's permanent no-signing policy")
	}
	if got.UnsignedEvidence == "" {
		t.Fatal("UnsignedEvidence is empty; the unsigned claim must always name the CI assertion that backs it")
	}
	if got.AssetManifest.Available {
		t.Fatal("AssetManifest.Available = true, want false -- the manifest is never embedded in the binary")
	}
	if got.AssetManifest.Reason == "" {
		t.Fatal("AssetManifest.Reason is empty")
	}
	if got.SchemaVersion != 1 {
		t.Fatalf("SchemaVersion = %d, want 1", got.SchemaVersion)
	}
}

// TestReleaseInfo_NonDevVersionFlipsIsDevBuild proves the isDev branch in
// releaseInfo genuinely reads version.Version at request time -- not a
// value baked in at package init -- by temporarily overriding the package
// var to a real-looking release version and confirming IsDevBuild flips
// to false. version.Version is restored via t.Cleanup so this cannot leak
// into any other test in the package.
func TestReleaseInfo_NonDevVersionFlipsIsDevBuild(t *testing.T) {
	original := version.Version
	version.Version = "0.5.2"
	t.Cleanup(func() { version.Version = original })

	s := &Server{}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/release", nil)
	rec := httptest.NewRecorder()

	if err := s.releaseInfo(rec, req); err != nil {
		t.Fatalf("releaseInfo: %v", err)
	}

	var got ReleaseInfo
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if got.IsDevBuild {
		t.Fatalf("IsDevBuild = true, want false for version %q", got.Version)
	}
	if got.Version != "0.5.2" {
		t.Fatalf("Version = %q, want %q", got.Version, "0.5.2")
	}
}

// TestShortCommit proves shortCommit's exact truncation contract: exactly
// 12 characters of a longer SHA, and the whole string verbatim (including
// empty) when it is already 12 characters or shorter -- the "empty for a
// local dev build" case release.go's own doc comment names.
func TestShortCommit(t *testing.T) {
	cases := []struct {
		name   string
		commit string
		want   string
	}{
		{"empty (dev build)", "", ""},
		{"exactly 12", "abcdef123456", "abcdef123456"},
		{"shorter than 12", "abc123", "abc123"},
		{"full 40-char SHA truncates to 12", "abcdef1234567890abcdef1234567890abcdef12", "abcdef123456"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := shortCommit(c.commit); got != c.want {
				t.Fatalf("shortCommit(%q) = %q, want %q", c.commit, got, c.want)
			}
		})
	}
}

// TestReleaseInfo_BothBranchesRunUnderAnyBuild drives releaseInfo's dev and
// release branches by setting version.Version directly, restoring it after.
//
// The sibling dev-build test skips itself when the binary was built with
// -X ldflags, which is correct for what it asserts but leaves the release
// branch with no coverage at all on exactly the builds that ship. A test that
// never runs where it matters is not coverage; it is a green tick.
func TestReleaseInfo_BothBranchesRunUnderAnyBuild(t *testing.T) {
	original := version.Version
	t.Cleanup(func() { version.Version = original })

	for _, tc := range []struct {
		name    string
		version string
		wantDev bool
	}{
		{"unbuilt default", "0.0.0", true},
		{"empty version", "", true},
		{"released build", "0.12.7", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			version.Version = tc.version

			s := &Server{}
			req := httptest.NewRequest(http.MethodGet, "/api/v1/release", nil)
			rec := httptest.NewRecorder()
			if err := s.releaseInfo(rec, req); err != nil {
				t.Fatalf("releaseInfo: %v", err)
			}
			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
			}

			var got ReleaseInfo
			if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
				t.Fatalf("decode response: %v (body: %s)", err, rec.Body.String())
			}
			if got.IsDevBuild != tc.wantDev {
				t.Fatalf("IsDevBuild = %v for version %q, want %v", got.IsDevBuild, tc.version, tc.wantDev)
			}
			if got.Version != tc.version {
				t.Fatalf("Version = %q, want %q reported verbatim", got.Version, tc.version)
			}
		})
	}
}
