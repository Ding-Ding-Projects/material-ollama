import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

// Repo-relative: app/ui/app/src -- this file's own directory, two levels
// up from src/test/.
const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

// This guard's own path, so the recursive walk below can exclude it from
// itself -- otherwise the forbidden-pattern literals a few lines down
// would make this file fail its own scan.
const SELF_PATH = fileURLToPath(import.meta.url)

const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".css", ".html"])

/** Every real source file under src/, excluding this guard's own file and
 * any *.test.* / *.dom.test.* file (a test fixture legitimately quoting a
 * forbidden string as an example of what NOT to do is not a violation --
 * see bundled-runtime-dependencies.md for the one deliberate fixture that
 * needs exactly this exclusion). */
function walkSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const abs = path.join(dir, entry)
    const st = statSync(abs)
    if (st.isDirectory()) {
      walkSourceFiles(abs, out)
      continue
    }
    if (abs === SELF_PATH) continue
    if (/\.test\.[a-z]+$/i.test(entry)) continue
    if (SCAN_EXTENSIONS.has(path.extname(entry))) out.push(abs)
  }
  return out
}

// The exact hosts the bundled-runtime-dependencies contract forbids: any
// reference means an asset (a font, a script, a stylesheet) would be
// fetched from the network at runtime instead of shipping inside the
// installer. Matched as a plain substring against every source file's
// raw text -- deliberately broader than "inside a url()" or "inside an
// import", because a reference to one of these hosts is a problem
// wherever it appears (a comment pointing a maintainer at a CDN import
// they're expected to add is exactly as wrong as the import itself).
const FORBIDDEN_HOST_SUBSTRINGS = [
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "cdn.jsdelivr.net",
  "unpkg.com",
  "cdnjs.cloudflare.com",
  "jsdelivr.net",
]

describe("bundled-runtime-dependencies guard", () => {
  it("references no remote font, script, or stylesheet CDN host anywhere under src/", () => {
    const files = walkSourceFiles(SRC_ROOT)
    expect(files.length).toBeGreaterThan(50) // sanity: the walk actually found real source

    const offenders: string[] = []
    for (const file of files) {
      const text = readFileSync(file, "utf8")
      for (const host of FORBIDDEN_HOST_SUBSTRINGS) {
        if (text.includes(host)) {
          offenders.push(`${path.relative(SRC_ROOT, file)}: references '${host}'`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it("ships every UI font locally under src/assets/fonts (no @font-face pointing off-disk)", () => {
    const fontsDir = path.join(SRC_ROOT, "assets", "fonts")
    const fontFiles = readdirSync(fontsDir).filter((f) => /\.(woff2?|ttf|otf)$/i.test(f))
    expect(fontFiles.length).toBeGreaterThan(0)

    // Every @font-face src: url(...) reference in the stylesheet tree must
    // resolve to a relative/bundled path (starting with "./", "../", or a
    // bare filename resolved by the bundler) -- never an absolute
    // "http(s)://" URL, which is the actual network-fetch failure mode
    // this contract exists to prevent.
    const files = walkSourceFiles(SRC_ROOT).filter((f) => f.endsWith(".css"))
    const httpFontRefs: string[] = []
    for (const file of files) {
      const text = readFileSync(file, "utf8")
      const fontFaceBlocks = text.match(/@font-face\s*\{[^}]*\}/g) ?? []
      for (const block of fontFaceBlocks) {
        const urlMatches = block.matchAll(/url\(([^)]+)\)/g)
        for (const m of urlMatches) {
          const ref = m[1].replace(/^["']|["']$/g, "")
          if (/^https?:\/\//i.test(ref)) {
            httpFontRefs.push(`${path.relative(SRC_ROOT, file)}: @font-face url(${ref})`)
          }
        }
      }
    }
    expect(httpFontRefs).toEqual([])
  })
})

describe("landing-page-boundary guard", () => {
  it("never loads the landing site (or any other remote URL) into an iframe/webview as a substitute runtime", () => {
    // Not "no <iframe> anywhere" -- ExportPreview.tsx legitimately renders
    // exported HTML through a fully sandboxed `srcDoc` iframe (local
    // content, sandbox="", no network fetch at all), and
    // Message.stories.tsx quotes a `src="https://example.com"` iframe as
    // a fixture PROVING the app's own markdown renderer strips it rather
    // than executing it. Neither is the failure this contract forbids.
    // What IS forbidden: an <iframe>/<webview> whose `src` attribute
    // (not `srcDoc`) points at an http(s):// URL from real application
    // source (excluding *.stories.* fixtures, which exist specifically to
    // prove such content gets sanitized, not to ship it).
    const files = walkSourceFiles(SRC_ROOT)
      .filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))
      .filter((f) => !/\.stories\.[a-z]+$/i.test(f))
    const offenders: string[] = []
    for (const file of files) {
      const text = readFileSync(file, "utf8")
      const frameTags = text.match(/<(?:iframe|webview)\b[^>]*>/gi) ?? []
      for (const tag of frameTags) {
        const srcMatch = tag.match(/\bsrc\s*=\s*(["'{])/i)
        if (srcMatch) {
          offenders.push(`${path.relative(SRC_ROOT, file)}: ${tag}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it("routes the site's homepage link out via a real anchor (target=_blank), never a same-window navigation", () => {
    // Guards the general shape rather than one file: anywhere the
    // project's own homepage URL is referenced as an href, it must sit on
    // a real <a> with target="_blank" so it opens in the OS browser
    // rather than replacing this window's own content.
    const files = walkSourceFiles(SRC_ROOT).filter((f) => f.endsWith(".tsx"))
    let foundHomepageLink = false
    const offenders: string[] = []
    for (const file of files) {
      const text = readFileSync(file, "utf8")
      if (!text.includes("PROJECT_HOMEPAGE_URL") && !text.includes("halowbak123.chatgpt.site")) continue
      // Find every <a ...> tag in the file and check the ones that use
      // the homepage URL/constant carry target="_blank".
      const anchorTags = text.match(/<a\b[^>]*>/g) ?? []
      for (const tag of anchorTags) {
        if (!tag.includes("PROJECT_HOMEPAGE_URL") && !tag.includes("halowbak123.chatgpt.site")) continue
        foundHomepageLink = true
        if (!/target=["']_blank["']/.test(tag)) {
          offenders.push(`${path.relative(SRC_ROOT, file)}: ${tag}`)
        }
      }
    }
    expect(foundHomepageLink).toBe(true)
    expect(offenders).toEqual([])
  })
})
