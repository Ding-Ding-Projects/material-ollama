// Small, dependency-free formatting helpers local to the Models screen.
//
// formatBytes2 deliberately mirrors format.HumanBytes2 in format/bytes.go
// byte-for-byte (same thresholds, same "%.1f Xi B" shape) because several
// fields the server sends are raw byte counts rather than a pre-formatted
// ByteValue (InstalledModel.size, PullQueueItem.totalBytes/completedBytes) —
// this keeps every size on the screen reading in the same units the server
// already uses elsewhere, instead of inventing a second convention (e.g.
// decimal GB) that would make two numbers that are actually equal look
// different.

const KIBIBYTE = 1024
const MEBIBYTE = KIBIBYTE * 1024
const GIBIBYTE = MEBIBYTE * 1024

export function formatBytes2(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B"
  if (bytes >= GIBIBYTE) return `${(bytes / GIBIBYTE).toFixed(1)} GiB`
  if (bytes >= MEBIBYTE) return `${(bytes / MEBIBYTE).toFixed(1)} MiB`
  if (bytes >= KIBIBYTE) return `${(bytes / KIBIBYTE).toFixed(1)} KiB`
  return `${Math.round(bytes)} B`
}

/** Percent complete for a pull, or `undefined` when the total isn't known
 * yet (the manifest hasn't resolved) — callers must render that as an
 * indeterminate progress bar, never as 0%. */
export function pullPercent(completedBytes?: number, totalBytes?: number): number | undefined {
  if (!totalBytes || totalBytes <= 0) return undefined
  const completed = completedBytes ?? 0
  return Math.min(100, Math.max(0, (completed / totalBytes) * 100))
}

/** A short, still-unambiguous digest prefix for display — the full value
 * remains available via `title`. */
export function shortDigest(digest: string): string {
  const bare = digest.includes(":") ? digest.split(":").slice(-1)[0] : digest
  return bare.slice(0, 12)
}

export function formatTimestamp(iso: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return iso
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed)
}
