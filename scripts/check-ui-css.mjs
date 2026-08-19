#!/usr/bin/env node
// Verifies the *emitted* desktop-UI stylesheet, not the build config.
//
// Why this exists: the colour system is authored in oklch and generated at
// runtime. A PostCSS downlevel pass can rewrite or delete that syntax at build
// time, and the damage is invisible from vite.config.ts and from index.css --
// both read perfectly while the shipped stylesheet has no oklch in it at all.
// The only thing that reveals it is reading the built file.
//
// Run against a build you believe is broken and watch it go red before you
// trust it. A check that has only ever been seen passing is indistinguishable
// from one that globs an empty directory or has an inverted predicate.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const assetsDir = path.join(repoRoot, 'app', 'ui', 'app', 'dist', 'assets')

if (!existsSync(assetsDir)) {
  console.error(`check-ui-css: no built assets at ${assetsDir}`)
  console.error('check-ui-css: run the UI build first (npm run build in app/ui/app)')
  process.exit(2)
}

const cssFiles = readdirSync(assetsDir).filter((f) => f.endsWith('.css'))
if (cssFiles.length === 0) {
  console.error(`check-ui-css: no .css emitted into ${assetsDir}`)
  process.exit(2)
}

const css = cssFiles
  .map((f) => readFileSync(path.join(assetsDir, f), 'utf8'))
  .join('\n')

// Built as [needle, ...] rather than inline regex literals so that nothing in
// this file depends on a backslash surviving a shell round-trip.
const SPECIFICITY_POLYFILL = ':not(#' + String.fromCharCode(92) + '#)'
const FROZEN_PALETTE = new RegExp('--color-[a-z0-9-]+:\\s*rgb\\(')

const checks = [
  {
    name: 'oklch preserved',
    ok: () => css.includes('oklch('),
    why: 'colour tokens were downleveled to rgb; a postcss colour feature is replacing rather than preserving',
  },
  {
    name: 'cascade layers preserved',
    ok: () => css.includes('@layer'),
    why: '@layer was polyfilled away; layer order is now emulated with specificity',
  },
  {
    name: 'no specificity polyfill',
    ok: () => !css.includes(SPECIFICITY_POLYFILL),
    why: 'cascade-layers polyfill is active; hand-written CSS will silently lose to Tailwind preflight',
  },
  {
    name: 'no build-time palette snapshots',
    ok: () => !FROZEN_PALETTE.test(css),
    why: 'the theme palette was frozen to rgb at build time by postcss-custom-properties',
  },
]

console.log(`check-ui-css: reading ${cssFiles.length} file(s) from ${path.relative(repoRoot, assetsDir)}`)
for (const f of cssFiles) console.log(`  - ${f}`)

let failed = 0
for (const c of checks) {
  const pass = c.ok()
  if (!pass) failed++
  console.log(`${pass ? 'ok  ' : 'FAIL'}  ${c.name}${pass ? '' : ' -- ' + c.why}`)
}

if (failed > 0) {
  console.error(`\ncheck-ui-css: ${failed} of ${checks.length} checks failed`)
  process.exit(1)
}
console.log(`\ncheck-ui-css: all ${checks.length} checks passed`)
