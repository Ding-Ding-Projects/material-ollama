// Small, dependency-free formatting helper local to the Toolbox screen --
// mirrors format.HumanBytes2 in format/bytes.go byte-for-byte (same
// thresholds, same "%.1f XiB" shape), matching screens/models/format.ts's
// formatBytes2 rather than inventing a second convention for the same
// unit the server already uses in its own size-limit error text.

const KIBIBYTE = 1024
const MEBIBYTE = KIBIBYTE * 1024
const GIBIBYTE = MEBIBYTE * 1024

export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return "--"
  if (bytes >= GIBIBYTE) return `${(bytes / GIBIBYTE).toFixed(1)} GiB`
  if (bytes >= MEBIBYTE) return `${(bytes / MEBIBYTE).toFixed(1)} MiB`
  if (bytes >= KIBIBYTE) return `${(bytes / KIBIBYTE).toFixed(1)} KiB`
  return `${Math.round(bytes)} B`
}
