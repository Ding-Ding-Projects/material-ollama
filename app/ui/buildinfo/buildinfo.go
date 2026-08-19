//go:build windows || darwin

// Package buildinfo exposes the release metadata the desktop app's Status
// screen needs to tell the truth -- offline. debug.ReadBuildInfo's VCS
// stamping is not guaranteed to survive this project's -trimpath build (see
// scripts/build_windows.ps1's buildApp), so the version and commit alone
// aren't enough; the dim-sum release code name, the workflow run that built
// this binary, and a build-time snapshot of the public dim-sum catalog all
// have to travel with the binary itself rather than being fetched at
// runtime.
//
// buildinfo.json is checked into the repository with the same "nothing has
// run yet" shape as buildinfo.default.json below, so a local `go build`
// always embeds something valid. .github/workflows/release.yaml's "Write
// embedded build metadata" step overwrites buildinfo.json with the real,
// resolved release metadata immediately after scripts/release-metadata.mjs
// runs (and before the Windows binaries are built), so a release binary
// embeds its own real identity. buildinfo.default.json is never rewritten:
// it is the fallback Load() reaches for if buildinfo.json is ever missing,
// empty, or fails to parse as the expected schema, so a corrupted embed can
// never crash the server or -- worse -- silently fabricate a release
// identity that was never verified.
package buildinfo

import (
	_ "embed"
	"encoding/json"
	"sync"
)

//go:embed buildinfo.json
var embeddedJSON []byte

//go:embed buildinfo.default.json
var defaultJSON []byte

// currentSchemaVersion is the only schemaVersion Load() will accept from
// buildinfo.json. A future incompatible change to the shape below must bump
// this, so an old binary embedding an old buildinfo.json (or a newer
// workflow writing a shape this binary doesn't understand yet) falls back
// to the safe default rather than misreading fields.
const currentSchemaVersion = 1

// DishName is the bilingual name of one dim-sum catalog dish, exactly as
// published by the public dim-sum-photos catalog's name.en/name.zhHant
// fields.
type DishName struct {
	En     string `json:"en"`
	ZhHant string `json:"zhHant"`
}

// CatalogDish is one dish snapshotted from the public dim-sum catalog at
// build time, so the Status screen's release catalog is real and works
// offline. It deliberately carries no image bytes: this project links to
// the public catalog's own asset and never vendors or mirrors dim-sum
// photos into a consumer repository (see AGENTS.md's "Public dim-sum photo
// source" section).
type CatalogDish struct {
	ID         string `json:"id"`
	Slug       string `json:"slug,omitempty"`
	NameEn     string `json:"nameEn"`
	NameZhHant string `json:"nameZhHant"`
}

// Info is the release metadata embedded into the binary at build time. It
// mirrors the JSON shape .github/workflows/release.yaml's "Write embedded
// build metadata" step writes to buildinfo.json (and the "nothing has run
// yet" shape checked in at buildinfo.default.json). Every *string/*int64
// field is nil, never a fabricated placeholder, for a development build or
// for a release build where scripts/release-metadata.mjs could not find an
// unused dish.
type Info struct {
	SchemaVersion int    `json:"schemaVersion"`
	Version       string `json:"version"`
	Commit        string `json:"commit"`
	ShortCommit   string `json:"shortCommit"`

	CodeName       *string `json:"codeName"`
	DishID         *string `json:"dishId"`
	DishNameEn     *string `json:"dishNameEn"`
	DishNameZhHant *string `json:"dishNameZhHant"`

	WorkflowRunNumber *int64  `json:"workflowRunNumber"`
	WorkflowRunID     *int64  `json:"workflowRunId"`
	BuiltAt           *string `json:"builtAt"`

	// Catalog is a snapshot of the public dim-sum catalog's dish list at
	// build time. Empty for a development build (buildinfo.default.json
	// never claims a catalog it never fetched).
	Catalog []CatalogDish `json:"catalog"`
}

// IsDevBuild reports whether this Info describes a build that never went
// through .github/workflows/release.yaml: no workflow run number was
// recorded, so it must never have been assigned -- and must never claim --
// a real release's dim-sum code name.
func (i Info) IsDevBuild() bool {
	return i.WorkflowRunNumber == nil || i.Version == "" || i.Version == "0.0.0"
}

var (
	once   sync.Once
	loaded Info
)

// Load returns the release metadata embedded into this binary at build
// time, parsed exactly once. It never returns an error and never panics:
// an empty, missing, or malformed buildinfo.json falls back to the
// checked-in buildinfo.default.json "nothing has run yet" shape, and if
// even that somehow fails to parse, Load reports an honest empty
// development build rather than bringing the server down over a metadata
// file.
func Load() Info {
	once.Do(func() {
		loaded = parse(embeddedJSON)
	})
	return loaded
}

func parse(data []byte) Info {
	var info Info
	if len(data) > 0 {
		if err := json.Unmarshal(data, &info); err == nil && info.SchemaVersion == currentSchemaVersion {
			return info
		}
	}

	var fallback Info
	if err := json.Unmarshal(defaultJSON, &fallback); err == nil && fallback.SchemaVersion == currentSchemaVersion {
		return fallback
	}

	// buildinfo.default.json itself failed to parse. This can only happen
	// if the checked-in file was corrupted -- report an honest empty dev
	// build rather than a zero-value Info with SchemaVersion 0, which
	// callers would otherwise have to special-case.
	return Info{SchemaVersion: currentSchemaVersion, Version: "0.0.0"}
}
