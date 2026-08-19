// External-editor integration: "open an exported file or folder in VS Code,
// detecting a real install and saying so honestly when none is found."
//
// This app's native webview host already exposes a small `window.webview`
// bridge (see src/types/webview.d.ts) for file pickers, and a real VS Code
// launch integration lives server-side (cmd/launch/vscode.go, wired through
// /api/v1/launch/*) -- but that integration is deliberately `Hidden: true`
// (see cmd/launch/registry.go) because its job is configuring VS Code's
// Copilot model picker, not opening an arbitrary exported file. Neither
// existing surface can honestly open "this exact file I just exported" —
// and this lane's allowed paths don't include the webview bridge or the Go
// backend, so this file cannot invent a working implementation of that out
// of nothing.
//
// What it CAN honestly do, and does:
//   - declare the narrow contract a future bridge lane would implement
//     (`window.materialOllamaExternalEditor`), so wiring it up later is a
//     pure addition with zero changes here;
//   - detect that contract at runtime and use it for real when present;
//   - when it is absent, say so plainly and offer the one thing that IS
//     always available without a bridge: copying the path to the
//     clipboard, so the user can open it themselves.
//
// Nothing here pretends to open VS Code when it can't. That's the whole
// point of the "detecting a real install and saying so honestly" half of
// the contract -- a button that silently no-ops on click is worse than one
// that isn't offered at all.

/** The contract a native bridge would need to satisfy for this module to
 * actually launch VS Code. Declared here (not in types/webview.d.ts, which
 * is outside this lane's allowed paths) as an additive, independent global
 * -- wiring a real implementation up later touches nothing in this file. */
export interface ExternalEditorBridge {
  detectVsCode?: () => Promise<{ installed: boolean; path?: string }>
  openPathInVsCode?: (path: string, kind: "file" | "folder") => Promise<void>
}

declare global {
  interface Window {
    materialOllamaExternalEditor?: ExternalEditorBridge
  }
}

export type ExternalEditorAvailability =
  | { readonly state: "installed"; readonly path?: string }
  | { readonly state: "not-installed" }
  /** No bridge is wired up in this build at all -- distinct from
   * "not-installed" because it says something different: VS Code might
   * well be on this machine, this app just has no way to ask yet. */
  | { readonly state: "bridge-unavailable" }

function getBridge(): ExternalEditorBridge | undefined {
  return typeof window === "undefined" ? undefined : window.materialOllamaExternalEditor
}

/** Real detection when a bridge is wired up; an honest, distinct
 * "bridge-unavailable" result (never a silent "not installed") otherwise. */
export async function detectExternalEditor(): Promise<ExternalEditorAvailability> {
  const bridge = getBridge()
  if (!bridge?.detectVsCode) return { state: "bridge-unavailable" }
  try {
    const result = await bridge.detectVsCode()
    return result.installed ? { state: "installed", path: result.path } : { state: "not-installed" }
  } catch {
    // A bridge that exists but throws is still honestly "we don't know" —
    // never silently reported as "not installed", which would be a claim
    // this module has no evidence for.
    return { state: "bridge-unavailable" }
  }
}

export interface OpenInEditorTarget {
  readonly path: string
  readonly kind: "file" | "folder"
}

export type OpenInEditorOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "bridge-unavailable" | "not-installed" | "launch-failed"; readonly detail?: string }

/**
 * Opens `target` in VS Code for real when the bridge is wired up and VS
 * Code is detected; otherwise returns an honest failure reason instead of
 * silently doing nothing. Callers (see ExportDialog.tsx) are expected to
 * offer `copyPathToClipboard()` below as the always-available fallback
 * action whenever this doesn't succeed.
 */
export async function openInExternalEditor(target: OpenInEditorTarget): Promise<OpenInEditorOutcome> {
  const bridge = getBridge()
  if (!bridge?.openPathInVsCode) return { ok: false, reason: "bridge-unavailable" }

  const availability = await detectExternalEditor()
  if (availability.state === "not-installed") return { ok: false, reason: "not-installed" }
  if (availability.state === "bridge-unavailable") return { ok: false, reason: "bridge-unavailable" }

  try {
    await bridge.openPathInVsCode(target.path, target.kind)
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: "launch-failed", detail: error instanceof Error ? error.message : String(error) }
  }
}

/** The fallback that's always real regardless of bridge availability: put
 * the exact path on the clipboard so the user can open it themselves.
 * Returns false (rather than throwing) when the Clipboard API itself isn't
 * available -- e.g. an insecure context in a test environment -- so a
 * caller can fall back to selecting the text instead. */
export async function copyPathToClipboard(path: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return false
  try {
    await navigator.clipboard.writeText(path)
    return true
  } catch {
    return false
  }
}
