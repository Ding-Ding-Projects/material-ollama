#!/usr/bin/env node
// scripts/test/browser-extension-download-capture.test.mjs
//
// The browser-extension-download-capture contract row is genuinely
// not-applicable to the desktop-app surface: this repository ships no
// browser extension of any kind (no manifest_version, no
// chrome.runtime/browser.runtime usage, no extension packaging step),
// so there is no Start-download dialog, Downloading dialog, or capture
// handoff to build. See docs/features/uh-completeness/articles/
// browser-extension-download-capture.md for the recorded not-applicable
// reason.
//
// This guard exists so that claim stays checkable rather than asserted:
// it fails the moment a browser-extension manifest or a
// chrome.runtime/browser.runtime reference actually appears in the
// repository, at which point the not-applicable claim would be false and
// the real contract (Start download / Downloading / completion dialogs)
// would need to be implemented instead of documented as out of scope.
//
// Run with: node --test scripts/test/browser-extension-download-capture.test.mjs

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import assert from 'node:assert/strict'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

function listTrackedFiles(patterns) {
  const out = execFileSync('git', ['ls-files', '--', ...patterns], { cwd: REPO_ROOT, encoding: 'utf8' })
  return out.split(/\r?\n/).filter(Boolean)
}

test('no committed file is named or shaped like a browser-extension manifest', () => {
  // A real extension's manifest is always named exactly manifest.json at
  // the extension root and declares "manifest_version". Scan every
  // tracked manifest.json in the repository (there may legitimately be
  // none, or there may be unrelated ones -- e.g. a VS Code extension
  // manifest uses a different shape entirely) and confirm none of them
  // declare a browser-extension manifest_version field.
  const manifestFiles = listTrackedFiles(['**/manifest.json'])
  const offenders = []
  for (const relPath of manifestFiles) {
    const abs = path.join(REPO_ROOT, relPath)
    let parsed
    try {
      parsed = JSON.parse(readFileSync(abs, 'utf8'))
    } catch {
      continue
    }
    if (typeof parsed === 'object' && parsed !== null && 'manifest_version' in parsed) {
      offenders.push(relPath)
    }
  }
  assert.deepEqual(offenders, [])
})

test('no committed source file references the WebExtension chrome.runtime/browser.runtime API', () => {
  const sourceFiles = listTrackedFiles(['*.ts', '*.tsx', '*.js', '**/*.ts', '**/*.tsx', '**/*.js'])
  const offenders = []
  for (const relPath of sourceFiles) {
    // node_modules is never tracked by git, but keep this defensive in
    // case the glob is ever widened.
    if (relPath.includes('node_modules/')) continue
    const abs = path.join(REPO_ROOT, relPath)
    let text
    try {
      text = readFileSync(abs, 'utf8')
    } catch {
      continue
    }
    if (/\b(?:chrome|browser)\.runtime\b/.test(text)) {
      offenders.push(relPath)
    }
  }
  assert.deepEqual(offenders, [])
})
