/**
 * Wire types for the Status screen's two real backends: GET /api/v1/release
 * (app/ui/release.go's ReleaseInfo) and GET/POST /api/v1/history (its
 * historyEventsResponse / store.AppEvent). Kept as their own hand-written
 * types rather than reusing @/gotypes -- release.go and store.go are Go
 * files this lane's allowed paths don't cover, and a lane that can't touch
 * the source of truth shouldn't be generating types from it either, so
 * these are copied field-for-field from the server response shapes
 * instead. If the backend shape ever changes, this file is the one place
 * that needs updating to match it.
 */

/** One dish snapshotted from the public dim-sum catalog at build time.
 * Mirrors app/ui/release.go's releaseCatalogDish. Carries no image bytes
 * -- see AGENTS.md's "Public dim-sum photo source" section. */
export interface ReleaseCatalogDish {
  id: string
  slug?: string
  nameEn: string
  nameZhHant: string
}

export interface ReleaseAssetManifest {
  available: boolean
  reason?: string
}

/** The body served by GET /api/v1/release. Every field is real build-time
 * or run-time metadata embedded into the binary -- see
 * app/ui/buildinfo/buildinfo.go. Nothing here is ever fetched live. */
export interface ReleaseInfo {
  schemaVersion: number
  version: string
  commit: string
  shortCommit: string

  /** True whenever `version` is the unbuilt "0.0.0" default -- this binary
   * never went through .github/workflows/release.yaml. */
  isDevBuild: boolean

  /** Nil for a development build, or for a release build where
   * scripts/release-metadata.mjs could not find an unused dish. Never a
   * guessed, reused, or placeholder name. */
  codeName: string | null
  dishId: string | null
  dishNameEn: string | null
  dishNameZhHant: string | null

  workflowRunNumber: number | null
  workflowRunId: number | null
  builtAt: string | null

  /** Build-time snapshot of the public dim-sum catalog's dish list.
   * Always present (possibly empty for a development build). */
  catalog: ReleaseCatalogDish[]

  assetManifest: ReleaseAssetManifest

  /** Always true under this project's permanent no-signing policy. */
  unsigned: boolean
  /** The exact CI assertion backing the "unsigned by policy" claim -- see
   * .github/workflows/release.yaml's "Verify unsigned Windows package"
   * step. */
  unsignedEvidence: string
}

/** One row of app/store/store.go's app_events table -- the append-only
 * local version-history event GET /api/v1/history returns. */
export interface AppEvent {
  id: number
  /** ISO-8601, as encoding/json renders a Go time.Time. */
  at: string
  kind: string
  summary: string
}

export interface HistoryEventsResponse {
  events: AppEvent[]
}
