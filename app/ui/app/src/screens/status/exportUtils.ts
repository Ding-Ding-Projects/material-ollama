/**
 * Triggers a real browser download of `data` as a UTF-8 JSON file --
 * `Blob` + `URL.createObjectURL` + a synthetic `<a download>` click, the
 * same mechanism every other "export" button in a web app uses. This runs
 * inside the actual product (a real webview-hosted local server app), not
 * a sandboxed preview surface, so a triggered download is a genuine,
 * working action.
 */
export function downloadJson(filename: string, data: unknown): void {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: "application/json;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  try {
    const link = document.createElement("a")
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  } finally {
    // Revoke on a timeout rather than immediately -- some browsers/
    // webviews start the download asynchronously and revoking the object
    // URL before that read completes would turn a working export into a
    // silently empty file.
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
  }
}

/** ISO-8601 timestamp for "exportedAt" fields, factored out so every
 * export call site (and its test) agrees on the exact format. */
export function exportTimestamp(): string {
  return new Date().toISOString()
}
