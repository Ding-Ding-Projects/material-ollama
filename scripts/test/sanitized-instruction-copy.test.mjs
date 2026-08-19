#!/usr/bin/env node
// scripts/test/sanitized-instruction-copy.test.mjs
//
// Guards the sanitized-instruction-copy contract: README.md and AGENTS.md
// carry a sanitized mirror of the shared agent operating instructions --
// present, real content -- with none of the private, machine- or
// account-specific detail those instructions explicitly forbid from ever
// reaching a public repository (absolute paths outside the repo, OS
// usernames or home directories, machine/host names, private-network IP
// addresses, SSH targets, or tokens/credentials).
//
// Run with: node --test scripts/test/sanitized-instruction-copy.test.mjs

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import assert from 'node:assert/strict'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const README_PATH = path.join(REPO_ROOT, 'README.md')
const AGENTS_PATH = path.join(REPO_ROOT, 'AGENTS.md')

/** Every pattern below is a real leak this exact class of document has
 * produced before: a Windows user-profile path, a private-network IP
 * literal, an SSH-style user@host target, and a handful of common token
 * prefixes. Each has a name so a failure says WHICH kind of leak was
 * found, not just that something matched. */
const LEAK_PATTERNS = [
  { name: 'windows-user-profile-path', re: /[A-Za-z]:[\\/]Users[\\/][^\\/\s"'`)]+[\\/]/ },
  { name: 'unix-home-directory-path', re: /\/home\/[^/\s"'`)]+\// },
  { name: 'private-ipv4-10', re: /\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/ },
  { name: 'private-ipv4-172', re: /\b172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}\b/ },
  { name: 'private-ipv4-192-168', re: /\b192\.168\.\d{1,3}\.\d{1,3}\b/ },
  { name: 'ssh-user-at-host-target', re: /\b[a-z][a-z0-9_-]*@(?:\d{1,3}\.){3}\d{1,3}\b/i },
  { name: 'github-oauth-token', re: /\bgh[oprsu]_[A-Za-z0-9]{20,}\b/ },
  { name: 'openai-style-secret-key', re: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { name: 'aws-access-key-id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'generic-bearer-token-literal', re: /\bBearer\s+[A-Za-z0-9._-]{24,}\b/ },
]

/** Substrings observed as real leaks from this exact machine/account, so
 * a regression regenerating the mirror from an un-sanitized source would
 * be caught even if it slightly reshapes the surrounding text. */
const KNOWN_LEAK_SUBSTRINGS = ['cntow', 'baycheen48@gmail.com', 'docker@192.168']

function scan(text, fileLabel) {
  const offenders = []
  for (const { name, re } of LEAK_PATTERNS) {
    const m = text.match(re)
    if (m) offenders.push(`${fileLabel}: pattern '${name}' matched '${m[0]}'`)
  }
  for (const needle of KNOWN_LEAK_SUBSTRINGS) {
    if (text.includes(needle)) offenders.push(`${fileLabel}: contains known-private substring '${needle}'`)
  }
  return offenders
}

test('README.md contains no private path, IP, SSH target, token, or known-account leak', () => {
  const text = readFileSync(README_PATH, 'utf8')
  assert.deepEqual(scan(text, 'README.md'), [])
})

test('AGENTS.md contains no private path, IP, SSH target, token, or known-account leak', () => {
  const text = readFileSync(AGENTS_PATH, 'utf8')
  assert.deepEqual(scan(text, 'AGENTS.md'), [])
})

test('AGENTS.md carries a real, substantial sanitized mirror of the shared agent operating instructions', () => {
  const text = readFileSync(AGENTS_PATH, 'utf8')
  // Not just present -- long enough, and covering topics that only a
  // real mirror (rather than a one-line pointer) would cover. A
  // one-sentence "see the shared instructions" is not a copy.
  assert.ok(text.length > 4000, `AGENTS.md is only ${text.length} bytes -- too short to be a real mirror`)
  for (const mustMention of [
    /code signing/i,
    /autonomous|do not stop|keep going/i,
    /destructive/i,
    /secrets?/i,
    /push/i,
  ]) {
    assert.match(text, mustMention)
  }
})

test('README.md carries a real (if shorter) sanitized summary of the same shared instructions', () => {
  const text = readFileSync(README_PATH, 'utf8')
  assert.match(text, /agent/i)
  assert.ok(text.length > 400, 'README.md has no substantial content at all')
})
