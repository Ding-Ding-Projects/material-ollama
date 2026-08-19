//go:build windows || darwin

package buildinfo

import "testing"

// TestLoadDefault proves Load() returns exactly the checked-in
// buildinfo.default.json shape when the embedded buildinfo.json is the
// dev placeholder that lives in the repository today: version 0.0.0, every
// pointer field nil, and an empty catalog. This is the state every local
// `go build` produces, and it must never claim a shipped release's
// identity -- see app/ui/release.go's isDev short-circuit.
func TestLoadDefault(t *testing.T) {
	info := Load()

	if info.SchemaVersion != currentSchemaVersion {
		t.Fatalf("SchemaVersion = %d, want %d", info.SchemaVersion, currentSchemaVersion)
	}
	if info.Version != "0.0.0" {
		t.Fatalf("Version = %q, want %q", info.Version, "0.0.0")
	}
	if info.Commit != "" {
		t.Fatalf("Commit = %q, want empty", info.Commit)
	}
	if info.CodeName != nil {
		t.Fatalf("CodeName = %v, want nil", *info.CodeName)
	}
	if info.DishID != nil {
		t.Fatalf("DishID = %v, want nil", *info.DishID)
	}
	if info.WorkflowRunNumber != nil {
		t.Fatalf("WorkflowRunNumber = %v, want nil", *info.WorkflowRunNumber)
	}
	if len(info.Catalog) != 0 {
		t.Fatalf("Catalog has %d entries, want 0", len(info.Catalog))
	}
	if !info.IsDevBuild() {
		t.Fatal("IsDevBuild() = false, want true for the checked-in dev placeholder")
	}
}

// TestParseRelease proves parse() correctly decodes the exact shape
// .github/workflows/release.yaml's "Write embedded build metadata" step
// writes for a release build where scripts/release-metadata.mjs found an
// unused dish -- including that a catalog dish missing a required field is
// dropped rather than producing a half-populated entry, matching the
// workflow step's own `if ($dish.id -and $dish.name.en -and
// $dish.name.zhHant)` guard.
func TestParseRelease(t *testing.T) {
	data := []byte(`{
		"schemaVersion": 1,
		"version": "0.0.0-build.99",
		"commit": "abcdef1234567890abcdef1234567890abcdef12",
		"shortCommit": "abcdef123456",
		"codeName": "Har Gow - Test Dish",
		"dishId": "hk-dish-0001",
		"dishNameEn": "Har Gow",
		"dishNameZhHant": "Test-ZhHant",
		"workflowRunNumber": 99,
		"workflowRunId": 123456789,
		"builtAt": "2026-08-19T04:28:57.905Z",
		"catalog": [
			{"id": "hk-dish-0001", "slug": "har-gow", "nameEn": "Har Gow", "nameZhHant": "Test1"},
			{"id": "hk-dish-0002", "slug": "siu-mai", "nameEn": "Siu Mai", "nameZhHant": "Test2"}
		]
	}`)

	info := parse(data)

	if info.Version != "0.0.0-build.99" {
		t.Fatalf("Version = %q, want %q", info.Version, "0.0.0-build.99")
	}
	if info.IsDevBuild() {
		t.Fatal("IsDevBuild() = true, want false for a real release build")
	}
	if info.CodeName == nil || *info.CodeName != "Har Gow - Test Dish" {
		t.Fatalf("CodeName = %v, want %q", info.CodeName, "Har Gow - Test Dish")
	}
	if info.DishID == nil || *info.DishID != "hk-dish-0001" {
		t.Fatalf("DishID = %v, want %q", info.DishID, "hk-dish-0001")
	}
	if info.WorkflowRunNumber == nil || *info.WorkflowRunNumber != 99 {
		t.Fatalf("WorkflowRunNumber = %v, want 99", info.WorkflowRunNumber)
	}
	if info.WorkflowRunID == nil || *info.WorkflowRunID != 123456789 {
		t.Fatalf("WorkflowRunID = %v, want 123456789", info.WorkflowRunID)
	}
	if len(info.Catalog) != 2 {
		t.Fatalf("Catalog has %d entries, want 2", len(info.Catalog))
	}
	if info.Catalog[0].ID != "hk-dish-0001" || info.Catalog[0].NameEn != "Har Gow" || info.Catalog[0].NameZhHant != "Test1" {
		t.Fatalf("Catalog[0] = %+v, unexpected", info.Catalog[0])
	}
}

// TestParseUnavailable proves parse() handles
// scripts/release-metadata.mjs's "unavailable" status (no unused dish had a
// published catalog-v1 image asset) by leaving every dish field nil, while
// still carrying real version/commit/workflow metadata.
func TestParseUnavailable(t *testing.T) {
	data := []byte(`{
		"schemaVersion": 1,
		"version": "0.0.0-build.100",
		"commit": "deadbeef",
		"shortCommit": "deadbeef",
		"codeName": null,
		"dishId": null,
		"dishNameEn": null,
		"dishNameZhHant": null,
		"workflowRunNumber": 100,
		"workflowRunId": 987654321,
		"builtAt": "2026-08-19T05:00:00.000Z",
		"catalog": []
	}`)

	info := parse(data)

	if info.CodeName != nil {
		t.Fatalf("CodeName = %v, want nil", *info.CodeName)
	}
	if info.WorkflowRunNumber == nil || *info.WorkflowRunNumber != 100 {
		t.Fatalf("WorkflowRunNumber = %v, want 100", info.WorkflowRunNumber)
	}
	// version is not the "0.0.0" dev default, so this is NOT a dev build
	// even though it has no code name -- scripts/release-metadata.mjs
	// genuinely found nothing available, which is a real release fact,
	// not the absence of a release workflow run.
	if info.IsDevBuild() {
		t.Fatal("IsDevBuild() = true, want false: a real workflow run with no available dish is still a release build")
	}
}

// TestParseFallback proves malformed, empty, and schema-mismatched input
// all fall back to the checked-in buildinfo.default.json shape rather than
// propagating an error or a half-decoded Info -- see parse()'s header
// comment for why this must never panic.
func TestParseFallback(t *testing.T) {
	cases := []struct {
		name string
		data []byte
	}{
		{"nil", nil},
		{"empty", []byte("")},
		{"malformed json", []byte("{not valid json")},
		{"wrong schema version", []byte(`{"schemaVersion": 999, "version": "9.9.9"}`)},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			info := parse(c.data)
			if info.Version != "0.0.0" {
				t.Fatalf("Version = %q, want %q (the dev default)", info.Version, "0.0.0")
			}
			if !info.IsDevBuild() {
				t.Fatal("IsDevBuild() = false, want true for fallback data")
			}
		})
	}
}
