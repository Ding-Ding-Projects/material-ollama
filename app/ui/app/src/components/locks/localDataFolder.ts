// Names the exact local data folder the toy lock's recovery path deletes,
// matching what this app's own Go backend already uses for every one of
// its local JSON stores (see e.g. app/ui/totp.go's totpAccountsPath,
// app/store/store.go's dbPath/settingsPath): `%LOCALAPPDATA%\Ollama` on
// Windows, `~/Library/Application Support/Ollama` on macOS. This lane has
// no route to ask the Go backend for that path directly (out of this
// lane's allowed paths), so it is reproduced here rather than guessed --
// the exact same literal segments the backend hard-codes, not an
// independently invented convention that could drift from the real one.
//
// The shared "Locked tabs and locked appearance" contract requires every
// lock surface to name the exact folder, both where the lock is created
// and in the unlock prompt -- this is the one function every locks/
// component calls to do that honestly, so the wording can't drift between
// call sites.

function isWindowsPlatform(): boolean {
  if (typeof navigator === "undefined") return true // default to the active delivery platform
  const platform = (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform
  if (platform) return platform.toLowerCase().includes("win")
  return navigator.platform?.toLowerCase().includes("win") ?? navigator.userAgent.toLowerCase().includes("windows")
}

/** e.g. "%LOCALAPPDATA%\Ollama" on Windows, "~/Library/Application
 * Support/Ollama" on macOS. Rendered as a `fact()` value (a literal path,
 * never translated prose) everywhere it appears. */
export function localDataFolderPath(): string {
  return isWindowsPlatform() ? "%LOCALAPPDATA%\\Ollama" : "~/Library/Application Support/Ollama"
}
