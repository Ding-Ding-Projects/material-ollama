//go:build windows || darwin

package ui

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/ollama/ollama/app/store"
	"github.com/ollama/ollama/app/ui/buildinfo"
	"github.com/ollama/ollama/app/version"
)

// assetManifestUnavailableReason explains, honestly, why /api/v1/release
// never reports an asset count. .github/workflows/release.yaml runs
// scripts/release-metadata.mjs and writes app/ui/buildinfo/buildinfo.json
// BEFORE the Windows binaries are built (~line 127-140); the asset
// manifest (SHA256SUMS.txt, asset-upload-manifest.json) is only computed
// AFTER packaging finishes (~line 255-287), so there is no truthful asset
// count available to embed into the binary. Printing zero, or a stale
// count copied from a previous release, would be exactly the fabricated
// success this project's completion rules forbid.
const assetManifestUnavailableReason = "the asset manifest is produced after packaging completes and is not embedded in the binary; it is not available offline"

// unsignedEvidence is the concrete, checkable claim behind the "unsigned by
// policy" line the Status screen shows: this is not an oversight, it is
// asserted by CI. See .github/workflows/release.yaml's "Verify unsigned
// Windows package" step, which throws the whole job if
// Get-AuthenticodeSignature -LiteralPath 'dist\OllamaSetup.exe' reports any
// Status other than 'NotSigned'.
const unsignedEvidence = `.github/workflows/release.yaml "Verify unsigned Windows package" step: throws unless (Get-AuthenticodeSignature 'dist\OllamaSetup.exe').Status -eq 'NotSigned'`

// releaseCatalogDish mirrors buildinfo.CatalogDish for the wire response.
// Kept as its own type (rather than reusing buildinfo.CatalogDish
// directly) so the embed package's internal shape can change without
// silently changing the public HTTP contract.
type releaseCatalogDish struct {
	ID         string `json:"id"`
	Slug       string `json:"slug,omitempty"`
	NameEn     string `json:"nameEn"`
	NameZhHant string `json:"nameZhHant"`
}

type releaseAssetManifest struct {
	Available bool   `json:"available"`
	Reason    string `json:"reason,omitempty"`
}

// ReleaseInfo is the body served by GET /api/v1/release. Every field is
// real build-time or run-time metadata; nothing here is invented,
// simulated, or copied from a different build. See app/ui/buildinfo for
// how CodeName/DishID/... and Catalog are embedded, and
// app/version.Version/app/version.Commit for how Version/Commit reach the
// binary.
type ReleaseInfo struct {
	SchemaVersion int    `json:"schemaVersion"`
	Version       string `json:"version"`
	Commit        string `json:"commit"`
	ShortCommit   string `json:"shortCommit"`

	// IsDevBuild is true whenever Version is the unbuilt "0.0.0" default,
	// i.e. this binary never went through .github/workflows/release.yaml.
	// The Status screen must render "Development build -- no release code
	// name" whenever this is true, rather than showing a real release's
	// dish -- see the CodeName/DishID nil-out below.
	IsDevBuild bool `json:"isDevBuild"`

	// CodeName, DishID, DishNameEn and DishNameZhHant are nil for a
	// development build (forced nil below, regardless of what a stale
	// embedded buildinfo.json might otherwise contain) or for a release
	// build where scripts/release-metadata.mjs could not find an unused
	// dish. They are never a guessed, reused, or placeholder name.
	CodeName       *string `json:"codeName"`
	DishID         *string `json:"dishId"`
	DishNameEn     *string `json:"dishNameEn"`
	DishNameZhHant *string `json:"dishNameZhHant"`

	// WorkflowRunNumber, WorkflowRunID and BuiltAt are nil for a
	// development build: no release workflow run ever produced it.
	WorkflowRunNumber *int64  `json:"workflowRunNumber"`
	WorkflowRunID     *int64  `json:"workflowRunId"`
	BuiltAt           *string `json:"builtAt"`

	// Catalog is the build-time snapshot of the public dim-sum catalog's
	// dish list, so the Status screen's release catalog works offline.
	// Always present (possibly empty for a development build); never
	// fetched at request time.
	Catalog []releaseCatalogDish `json:"catalog"`

	// AssetManifest is always Available: false -- see
	// assetManifestUnavailableReason above for exactly why.
	AssetManifest releaseAssetManifest `json:"assetManifest"`

	// Unsigned is always true under this project's permanent no-signing
	// policy; UnsignedEvidence names the CI assertion that backs it.
	Unsigned         bool   `json:"unsigned"`
	UnsignedEvidence string `json:"unsignedEvidence"`
}

// releaseInfo serves GET /api/v1/release. It reports the release metadata
// embedded into this exact binary at build time -- never a value fetched
// live, since the whole point of embedding is that the Status screen stays
// truthful with no network connection at all.
func (s *Server) releaseInfo(w http.ResponseWriter, r *http.Request) error {
	info := buildinfo.Load()

	isDev := version.Version == "" || version.Version == "0.0.0"

	catalog := make([]releaseCatalogDish, 0, len(info.Catalog))
	for _, dish := range info.Catalog {
		catalog = append(catalog, releaseCatalogDish{
			ID:         dish.ID,
			Slug:       dish.Slug,
			NameEn:     dish.NameEn,
			NameZhHant: dish.NameZhHant,
		})
	}

	resp := ReleaseInfo{
		SchemaVersion: 1,
		Version:       version.Version,
		Commit:        version.Commit,
		ShortCommit:   shortCommit(version.Commit),
		IsDevBuild:    isDev,
		Catalog:       catalog,
		AssetManifest: releaseAssetManifest{
			Available: false,
			Reason:    assetManifestUnavailableReason,
		},
		Unsigned:         true,
		UnsignedEvidence: unsignedEvidence,
	}

	// A development build must never claim a shipped release's dim-sum
	// identity, even if a stale or hand-edited buildinfo.json happens to
	// be sitting in the tree -- this is the one check that keeps the
	// Status screen from lying about what binary is actually running.
	if !isDev {
		resp.CodeName = info.CodeName
		resp.DishID = info.DishID
		resp.DishNameEn = info.DishNameEn
		resp.DishNameZhHant = info.DishNameZhHant
		resp.WorkflowRunNumber = info.WorkflowRunNumber
		resp.WorkflowRunID = info.WorkflowRunID
		resp.BuiltAt = info.BuiltAt
	}

	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(resp)
}

// shortCommit returns the first 12 characters of a full commit SHA, or the
// whole string when it's already shorter (e.g. empty, for a dev build).
func shortCommit(commit string) string {
	if len(commit) <= 12 {
		return commit
	}
	return commit[:12]
}

// historyEventsResponse is the body served by GET /api/v1/history.
type historyEventsResponse struct {
	Events []store.AppEvent `json:"events"`
}

// historyAppendRequest is the body accepted by POST /api/v1/history.
type historyAppendRequest struct {
	Kind    string `json:"kind"`
	Summary string `json:"summary"`
}

// listHistory serves GET /api/v1/history: the Status screen's append-only
// local version history (the app_events table, schema v18). Newest first,
// bounded by store.appEventsListLimit -- see app/store/store.go.
func (s *Server) listHistory(w http.ResponseWriter, r *http.Request) error {
	events, err := s.Store.AppEvents()
	if err != nil {
		return fmt.Errorf("failed to load app events: %w", err)
	}

	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(historyEventsResponse{Events: events})
}

// appendHistory serves POST /api/v1/history: records one new append-only
// local version-history event and returns it with its assigned ID and
// server-assigned timestamp.
func (s *Server) appendHistory(w http.ResponseWriter, r *http.Request) error {
	var req historyAppendRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		return fmt.Errorf("invalid request body: %w", err)
	}

	event, err := s.Store.AppendAppEvent(req.Kind, req.Summary)
	if err != nil {
		return fmt.Errorf("failed to append app event: %w", err)
	}

	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(event)
}
