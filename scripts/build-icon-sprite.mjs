#!/usr/bin/env node
// Builds app/ui/app/src/assets/icons.svg -- a local SVG <symbol> sprite for the
// Material Symbols (Outlined) icons this app actually uses.
//
// Why a sprite and not the icon font: the design prototype markup uses ligature
// spans (`<span class="material-symbols-outlined">rocket_launch</span>`), and a
// ligature icon font fails in a specific ugly way -- if the font ever fails to
// load, or a name is misspelled, or a subset build drops a glyph, the browser
// renders the literal word "rocket_launch" as body text instead of an icon.
// A missing <symbol> in a sprite instead renders nothing (an empty box), which
// this script refuses to ship silently -- see the fail-loud check below. And
// the variable Material Symbols face is ~3.5 MB for ~3600 icons; this app uses
// well under a hundred, so a sprite of exactly those is a much smaller and much
// safer asset.
//
// Where the wanted-icon list comes from:
//   1. Every `<Icon name="...">` usage found by scanning app/ui/app/src/**.
//      This is the durable, self-updating source once real consumers exist.
//   2. DESIGN_ICON_NAMES below -- every material-symbols-outlined glyph name
//      used by the Claude Design prototype this UI is being built from
//      (Material Ollama.dc.html). That file lives in an ephemeral per-session
//      scratchpad directory outside this repository, so it cannot be scanned
//      at build time on another machine or in CI; the names were captured by
//      hand from it during this pass instead, so the sprite is useful to the
//      very first consumers before any <Icon> usage exists in source yet.
// The two lists are unioned and de-duplicated, so once real usages land the
// hand-captured seed becomes redundant (harmless) rather than load-bearing.
//
// One name in the prototype, `phonelink_lock` (authenticator / 2FA rows), has
// no matching glyph in @material-symbols/svg-400 -- verified by directory
// listing, not assumed. It is not a typo to "fix" by renaming; Material
// Symbols simply never shipped that exact name. `phone_locked` is the nearest
// visual equivalent (a phone silhouette with a lock badge) and is substituted
// here deliberately, not silently -- see PROTOTYPE_ICON_SUBSTITUTIONS.
//
// Icons needing the filled (FILL 1) variant -- the active nav-rail item, the
// forced-fill dim sum glyph, and the forced-fill app-logo glyph options -- get
// a second `ms-<name>-fill` symbol generated from the matching `<name>-fill.svg`
// source file. Everything else ships outline-only.

import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const appDir = path.join(repoRoot, 'app', 'ui', 'app')
const srcDir = path.join(appDir, 'src')
const outlinedDir = path.join(appDir, 'node_modules', '@material-symbols', 'svg-400', 'outlined')
const outFile = path.join(srcDir, 'assets', 'icons.svg')
const iconComponentFile = path.join(srcDir, 'components', 'md3', 'Icon.tsx')

// --- 1. Icon names hand-captured from the Claude Design prototype (see the
//        header comment above for why this can't be scanned automatically). ---
const DESIGN_ICON_NAMES = [
  'arrow_drop_down', 'arrow_range', 'arrow_upward', 'bakery_dining', 'bolt', 'bookmark',
  'bookmark_added', 'brightness_auto', 'build', 'cancel', 'chat_bubble', 'check', 'check_circle',
  'close', 'cloud', 'code', 'confirmation_number', 'construction', 'dark_mode', 'delete',
  'delete_sweep', 'deployed_code', 'dictionary', 'download', 'download_2', 'download_done', 'edit',
  'edit_square', 'error', 'flight', 'folder', 'forum', 'functions', 'home_repair_service', 'keep',
  'language', 'light_mode', 'lightbulb', 'lock', 'lock_open', 'memory', 'menu_book', 'mood',
  'monitor_heart', 'neurology', 'notifications', 'open_in_new', 'palette', 'pause', 'pets',
  'phone_locked', 'play_arrow', 'raven', 'record_voice_over', 'regular_expression', 'restart_alt',
  'robot_2', 'rocket_launch', 'sailing', 'schedule', 'search', 'send', 'settings', 'smart_toy',
  'spa', 'stop', 'storefront', 'sync', 'sync_alt', 'system_update_alt', 'tab_close', 'terminal',
  'warning', 'wifi',
]

// Names the prototype used that do not exist verbatim in @material-symbols/svg-400,
// mapped to the deliberately-chosen substitute already present in DESIGN_ICON_NAMES.
// Recorded so the substitution shows up in a grep for the original name too.
const PROTOTYPE_ICON_SUBSTITUTIONS = {
  phonelink_lock: 'phone_locked', // authenticator / "paired to phone" glyph; no exact match shipped
}

// Icons that need the FILL 1 (filled) variant in addition to the outline:
//   - the nine nav-rail destinations (ms-<name> is outline when inactive, the
//     active item switches to ms-<name>-fill)
//   - the dim sum surprise glyph and the four app-logo picker glyphs, both of
//     which the prototype renders with a hard-coded `font-variation-settings:
//     'FILL' 1` regardless of state
const FILL_ICON_NAMES = [
  'forum', 'rocket_launch', 'storefront', 'terminal', 'construction', 'home_repair_service',
  'menu_book', 'monitor_heart', 'settings',
  'bakery_dining',
  'raven', 'pets', 'neurology', 'spa',
]

// --- 2. Scan real source for `<Icon name="..." />` usages. -----------------
function scanSourceForIconNames(dir) {
  const found = new Set()
  // Two forms, because only one of them was ever scanned and that was not the
  // one most call sites use.
  //
  //   <Icon name="check" />                     <- direct, was matched
  //   <Button icon="check">  <Chip icon="x">    <- the prop form, was NOT
  //
  // Measured before this changed: 55 distinct names reach the sprite through
  // the prop form and none of them were being scanned. They shipped only
  // because DESIGN_ICON_NAMES happened to seed them by hand -- so the header
  // note calling that seed "redundant (harmless) rather than load-bearing"
  // had it backwards, and any new prop-form icon would have rendered as an
  // empty box with nothing failing.
  const patterns = [
    /<Icon\b[^>]*\bname\s*=\s*["']([a-zA-Z0-9_]+)["']/g,
    /\b(?:icon|trailingIcon)\s*=\s*["']([a-z0-9_]+)["']/g,
    /\b(?:icon|trailingIcon)\s*:\s*["']([a-z0-9_]+)["']/g,
  ]
  // A braced expression -- icon={busy ? "check" : "close"} -- carries real literals
  // that none of the patterns above can reach, because the value is not the
  // whole attribute. Pull every quoted name out of the braces. A false
  // positive here is safe: an unknown name fails this build loudly rather
  // than shipping a symbol nobody asked for.
  const bracedIcon = /(?:\b(?:icon|trailingIcon)|<Icon\b[^>]*?\bname)\s*=\s*\{([^}]*)}/g
  const quoted = /["']([a-z0-9_]+)["']/g
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const full = path.join(d, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (/\.(tsx?|jsx?)$/.test(entry.name) && full !== iconComponentFile) {
        const text = readFileSync(full, 'utf8')
        for (const pattern of patterns) {
          for (const m of text.matchAll(pattern)) found.add(m[1])
        }
        for (const braced of text.matchAll(bracedIcon)) {
          for (const m of braced[1].matchAll(quoted)) found.add(m[1])
        }
      }
    }
  }
  if (existsSync(dir)) walk(dir)
  return found
}

const sourceUsages = scanSourceForIconNames(srcDir)
const wanted = new Set([...DESIGN_ICON_NAMES, ...sourceUsages])

// --- 3. Resolve every wanted name (and every FILL_ICON_NAMES entry) against
//        the real installed package, collecting every miss before failing. --
function svgPathFor(name) {
  return path.join(outlinedDir, `${name}.svg`)
}
function fillSvgPathFor(name) {
  return path.join(outlinedDir, `${name}-fill.svg`)
}

if (!existsSync(outlinedDir)) {
  console.error(`build-icon-sprite: @material-symbols/svg-400 is not installed at ${outlinedDir}`)
  console.error('build-icon-sprite: run `npm install` in app/ui/app first')
  process.exit(2)
}

const missingBase = []
for (const name of wanted) {
  if (!existsSync(svgPathFor(name))) missingBase.push(name)
}
const missingFill = []
for (const name of FILL_ICON_NAMES) {
  if (!wanted.has(name)) {
    console.error(`build-icon-sprite: FILL_ICON_NAMES lists "${name}" which is not in the wanted set`)
    process.exit(2)
  }
  if (!existsSync(fillSvgPathFor(name))) missingFill.push(name)
}

if (missingBase.length > 0 || missingFill.length > 0) {
  console.error('build-icon-sprite: refusing to build a sprite with missing symbols.')
  console.error('build-icon-sprite: a missing symbol renders an empty box at runtime -- exactly')
  console.error('build-icon-sprite: the ligature-font failure this sprite exists to avoid.')
  if (missingBase.length > 0) {
    console.error(`build-icon-sprite: no outlined SVG for: ${missingBase.sort().join(', ')}`)
    console.error(`build-icon-sprite: looked under ${outlinedDir}`)
    console.error('build-icon-sprite: if this is a real Material Symbols name that was renamed or')
    console.error('build-icon-sprite: does not exist, add a substitution to PROTOTYPE_ICON_SUBSTITUTIONS')
    console.error('build-icon-sprite: and use the substitute name in DESIGN_ICON_NAMES / <Icon name>.')
  }
  if (missingFill.length > 0) {
    console.error(`build-icon-sprite: no *-fill SVG for: ${missingFill.sort().join(', ')}`)
  }
  process.exit(1)
}

// --- 4. Extract each glyph's viewBox + inner markup and assemble the sprite.
const VIEWBOX_RE = /viewBox="([^"]+)"/
const OPEN_TAG_RE = /<svg\b[^>]*>/
const CLOSE_TAG_RE = /<\/svg>\s*$/

function extractSymbol(svgFile, symbolId) {
  const raw = readFileSync(svgFile, 'utf8').trim()
  const viewBoxMatch = raw.match(VIEWBOX_RE)
  if (!viewBoxMatch) {
    throw new Error(`build-icon-sprite: ${svgFile} has no viewBox attribute`)
  }
  const openMatch = raw.match(OPEN_TAG_RE)
  if (!openMatch) {
    throw new Error(`build-icon-sprite: ${svgFile} has no opening <svg> tag`)
  }
  const inner = raw.slice(openMatch.index + openMatch[0].length).replace(CLOSE_TAG_RE, '').trim()
  return `<symbol id="${symbolId}" viewBox="${viewBoxMatch[1]}">${inner}</symbol>`
}

const sortedNames = [...wanted].sort()
const symbols = []
for (const name of sortedNames) {
  symbols.push(extractSymbol(svgPathFor(name), `ms-${name}`))
}
for (const name of [...FILL_ICON_NAMES].sort()) {
  symbols.push(extractSymbol(fillSvgPathFor(name), `ms-${name}-fill`))
}

const spriteHeader =
  '<!--\n' +
  '  Generated by scripts/build-icon-sprite.mjs -- do not edit by hand.\n' +
  '  Source: @material-symbols/svg-400 (outlined), Apache-2.0.\n' +
  '  Licence text: src/assets/fonts/LICENSE-material-symbols.txt\n' +
  '-->\n'

const sprite =
  spriteHeader +
  '<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">\n  ' +
  symbols.join('\n  ') +
  '\n</svg>\n'

writeFileSync(outFile, sprite, 'utf8')
console.log(`build-icon-sprite: wrote ${sortedNames.length} outline + ${FILL_ICON_NAMES.length} fill symbols to ${path.relative(repoRoot, outFile)}`)

// --- 5. Keep the SymbolName union type in Icon.tsx in sync with the sprite. -
if (existsSync(iconComponentFile)) {
  const iconSource = readFileSync(iconComponentFile, 'utf8')
  const startMarker = '// AUTO-GENERATED ICON_NAMES START -- see scripts/build-icon-sprite.mjs'
  const endMarker = '// AUTO-GENERATED ICON_NAMES END'
  const startIdx = iconSource.indexOf(startMarker)
  const endIdx = iconSource.indexOf(endMarker)
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    console.error(`build-icon-sprite: ${path.relative(repoRoot, iconComponentFile)} is missing the`)
    console.error(`build-icon-sprite: "${startMarker}" / "${endMarker}" markers -- cannot sync SymbolName.`)
    process.exit(2)
  }
  const listBody = sortedNames.map((n) => `  '${n}',`).join('\n')
  const replacement =
    `${startMarker}\nexport const ICON_NAMES = [\n${listBody}\n] as const\n${endMarker}`
  const before = iconSource.slice(0, startIdx)
  const after = iconSource.slice(endIdx + endMarker.length)
  writeFileSync(iconComponentFile, before + replacement + after, 'utf8')
  console.log(`build-icon-sprite: synced SymbolName list (${sortedNames.length} names) in ${path.relative(repoRoot, iconComponentFile)}`)
}
