#!/usr/bin/env node
//
// write-build-stamp.mjs
//
// Writes app/ui/app/dist/build-stamp.json -- a small, unauthenticated fact
// sheet that lets scripts/capture/preflight.mjs (and anyone else) tell
// whether a *running* app instance's embedded UI actually matches the
// source tree at HEAD, or is a stale build serving yesterday's interface
// with today's commit SHA printed underneath it.
//
// Run this AFTER `npm run build` (so app/ui/app/dist exists) and BEFORE the
// Go build (so `//go:embed app/dist` in app/ui/app.go picks the stamp up
// and ships it inside the binary). Because app/ui/app.go's mux.Handle("GET
// /", s.appHandler()) sits outside the ui.Server auth wrapper, the stamp
// ends up served over plain HTTP at /build-stamp.json with no cookie
// required -- see app/ui/app.go and app/ui/ui.go's handle() closure.
//
// uiSourceHash is a sha256 over the sorted list of tracked files under the
// UI source scope, each contributing `path\0sha256(content)\0` (content
// read from the working tree, not the index, so uncommitted edits are
// reflected). This is deliberately independent of `dirty`: uiSourceHash
// answers "what is actually on disk right now", `dirty` answers "does that
// disk state match a real commit", and a stale build is caught by
// comparing BOTH the stamp's uiSourceHash and its commit against what the
// checking script recomputes at the moment it asks.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const defaultRepoRoot = path.resolve(scriptDir, '..')

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const index = args.indexOf(name)
  return index === -1 ? fallback : args[index + 1]
}

const repoRoot = path.resolve(option('--repo-root', defaultRepoRoot))
const outputPath = path.resolve(repoRoot, option('--output', 'app/ui/app/dist/build-stamp.json'))
const versionOverride = option('--version', null)
const commitOverride = option('--commit', null)

// The exact set of tracked paths that feed `npm run build`'s output
// (`tsc -b && vite build`, see app/ui/app/package.json). Deliberately
// excludes dev/test-only config (eslint.config.js, vitest.*, the
// storybook tsconfig) that cannot change what ships in dist/ -- including
// them would only manufacture false staleness signals, never hide a real
// one, but keeping the scope exact keeps the hash meaningful.
export const UI_SOURCE_SCOPE = [
  'app/ui/app/src',
  'app/ui/app/public',
  'app/ui/app/codegen',
  'app/ui/app/index.html',
  'app/ui/app/package.json',
  'app/ui/app/package-lock.json',
  'app/ui/app/vite.config.ts',
  'app/ui/app/tsconfig.json',
  'app/ui/app/tsconfig.app.json',
  'app/ui/app/tsconfig.node.json',
  'app/ui/app/tailwind.config.js',
]

function git(argv) {
  return execFileSync('git', argv, { cwd: repoRoot, encoding: 'utf8' })
}

function listTrackedFiles(scope) {
  // -z / split('\0') survives the CRLF checkout and any filename weirdness;
  // a plain newline split would silently misparse on this repo (see the
  // shared CRLF warnings this codebase keeps re-learning the hard way).
  const out = git(['ls-files', '-z', '--', ...scope])
  return out.split('\0').filter(Boolean).sort()
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function computeUiSourceHash(files) {
  const hash = createHash('sha256')
  for (const relPath of files) {
    const abs = path.join(repoRoot, relPath)
    // A file `git ls-files` lists can still be missing from the working
    // tree (deleted-but-unstaged). Feed a fixed sentinel rather than
    // throwing, so the hash still changes (proving staleness) instead of
    // this script crashing mid-build.
    const contentHash = existsSync(abs) ? sha256(readFileSync(abs)) : 'MISSING'
    hash.update(relPath.replace(/\\/g, '/'))
    hash.update('\0')
    hash.update(contentHash)
    hash.update('\0')
  }
  return hash.digest('hex')
}

function isDirty(scope) {
  const out = git(['status', '--porcelain', '--', ...scope])
  return out.trim().length > 0
}

function detectVersion() {
  if (versionOverride) return versionOverride
  try {
    const src = readFileSync(path.join(repoRoot, 'app/version/version.go'), 'utf8')
    const m = src.match(/var Version string = "([^"]*)"/)
    if (m) return m[1]
  } catch {
    // fall through to the same default version.go ships
  }
  return '0.0.0'
}

function main() {
  const commit = commitOverride ?? git(['rev-parse', 'HEAD']).trim()
  const files = listTrackedFiles(UI_SOURCE_SCOPE)
  const uiSourceHash = computeUiSourceHash(files)
  const dirty = isDirty(UI_SOURCE_SCOPE)
  const version = detectVersion()

  const stamp = {
    schemaVersion: 1,
    commit,
    dirty,
    uiSourceHash,
    builtAt: new Date().toISOString(),
    version,
  }

  mkdirSync(path.dirname(outputPath), { recursive: true })
  const serialized = `${JSON.stringify(stamp, null, 2)}\n`
  writeFileSync(outputPath, serialized, 'utf8')
  process.stdout.write(serialized)

  if (dirty) {
    console.warn(
      `write-build-stamp: ${files.length} UI source files are tracked, and the tree is DIRTY for that scope -- ` +
        'this build does not correspond to a clean commit and scripts/capture/preflight.mjs will refuse it.',
    )
  }
}

// Only run when invoked directly (`node write-build-stamp.mjs`) -- other
// scripts (scripts/capture/preflight.mjs) import this module solely for
// UI_SOURCE_SCOPE, and must not trigger a second, unwanted stamp write
// with default (possibly wrong) paths as a side effect of that import.
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  main()
}
