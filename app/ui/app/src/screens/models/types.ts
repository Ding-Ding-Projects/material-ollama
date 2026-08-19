// TypeScript mirrors of the Go JSON shapes served by the real, already-
// registered routes in app/ui/hardware.go and app/ui/models.go. Field names
// and optionality follow the Go struct tags exactly (see those files) —
// this is a transcription, not a redesign, so the frontend never drifts
// from what the server actually sends.

/** One of "measured" | "parsed" | "assumed" | "unknown" — see hardware.go.
 * A nil ByteValue (optional in every shape below) means "unknown", never
 * zero. Every renderer in this screen must treat `undefined` as "unknown"
 * and never coerce it to 0. */
export type Confidence = "measured" | "parsed" | "assumed" | "unknown"

export interface ByteValue {
  bytes: number
  display: string
  source: string
  confidence: Confidence
}

export interface HardwareDevice {
  id: string
  name: string
  library: string
  variant: string
  compute: string
  driver: string
  totalVram?: ByteValue
  freeVram?: ByteValue
}

export interface HardwareStorage {
  modelsDir: string
  free?: ByteValue
}

export interface HardwareOverrides {
  models?: string
  cudaVisibleDevices?: string
  hipVisibleDevices?: string
  rocrVisibleDevices?: string
  vkVisibleDevices?: string
  gpuOverheadBytes?: number
  contextLength?: number
}

export interface HardwareEffective {
  modelsDir: string
  contextLength: number
  /** "override" | "assumed-default" — see hardware.go's
   * defaultContextLengthAssumption comment for exactly what "assumed"
   * means and why it can't be more precise without duplicating scheduler
   * logic server-side. */
  contextLengthSource: "override" | "assumed-default"
}

export interface HardwareResponse {
  detectedAt: string
  systemRam?: ByteValue
  freeRam?: ByteValue
  /** Empty means "not detected yet", never "no GPU" — see hardware.go's
   * comment on HardwareDevice and the brief's honesty requirement for this
   * screen. Never render an empty array as "no GPU found". */
  devices: HardwareDevice[]
  storage: HardwareStorage
  overrides: HardwareOverrides
  effective: HardwareEffective
  warnings?: string[]
}

export type FitVerdictKind = "runs-well" | "runs-with-limits" | "unlikely" | "unknown"

export interface FitVerdict {
  verdict: FitVerdictKind
  evidence?: string[]
  assumptions?: string[]
  missingData?: string[]
}

export interface ModelDetails {
  parent_model: string
  format: string
  family: string
  families: string[]
  parameter_size: string
  quantization_level: string
  context_length?: number
  embedding_length?: number
}

/** GET /api/v1/models/installed — api.ListModelResponse embedded (flattened,
 * per Go's tagless-embed JSON rules) plus a computed Fit. */
export interface InstalledModel {
  name: string
  model: string
  remote_model?: string
  remote_host?: string
  modified_at: string
  size: number
  digest: string
  details: ModelDetails
  capabilities?: string[]
  fit: FitVerdict
}

/** GET /api/v1/models/running — api.ProcessModelResponse. */
export interface RunningModel {
  name: string
  model: string
  size: number
  digest: string
  details: ModelDetails
  expires_at: string
  size_vram: number
  context_length: number
}

export type PullState =
  | "queued"
  | "downloading"
  | "paused"
  | "completed"
  | "failed"
  | "canceled"

export interface PullQueueItem {
  id: string
  model: string
  state: PullState
  status?: string
  totalBytes?: number
  completedBytes?: number
  error?: string
  message?: string
  createdAt: string
  updatedAt: string
}

/** What the SSE "snapshot" event and the on-demand GET carry. The SSE
 * "queue" event (every subsequent update) carries bare PullQueueItem[] with
 * no `fit` — see models.go's attachFitVerdicts comment for why. The store
 * hook is responsible for carrying a previously-seen fit forward across
 * fit-less "queue" events; it must never compute one itself. */
export interface PullQueueItemWithFit extends PullQueueItem {
  fit?: FitVerdict
}
