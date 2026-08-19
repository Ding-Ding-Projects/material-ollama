#!/usr/bin/env node
// scripts/test/cheap-transfer.test.mjs
//
// Guards the cheap-transfer contract: this repository routes large
// artifacts and build dependencies through its own scoped, cache-aware
// tooling (the build scripts, the release workflow's own asset handling)
// rather than through standard Git LFS. Standard Git LFS is never an
// allowed fallback for this project -- see
// docs/features/uh-completeness/articles/cheap-transfer.md for the full
// policy and its rationale.
//
// This does NOT check whether the `git-lfs` binary happens to be
// installed on the machine running the test (a machine can have it
// installed for unrelated reasons, and a global `filter.lfs.process`
// registration in the user's own machine-wide Git config is normal and
// harmless). What it checks is this REPOSITORY's own committed
// `.gitattributes` file(s): none of them may declare `filter=lfs` for
// any path, because that is the one thing that would actually turn this
// repository's own large files into LFS pointers.
//
// Run with: node --test scripts/test/cheap-transfer.test.mjs

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import assert from 'node:assert/strict'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

function listTrackedGitattributesFiles() {
  // git ls-files, not a filesystem walk: this must reflect what is
  // actually COMMITTED (an untracked scratch .gitattributes some other
  // process left on disk is not part of the repository's real policy),
  // and must find every .gitattributes anywhere in the tree, not only
  // the root one.
  const out = execFileSync('git', ['ls-files', '--', '*.gitattributes', '.gitattributes'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
  return out.split(/\r?\n/).filter(Boolean)
}

test('no committed .gitattributes file declares filter=lfs for any path', () => {
  const files = listTrackedGitattributesFiles()
  assert.ok(files.length > 0, 'expected to find at least the root .gitattributes')

  const offenders = []
  for (const relPath of files) {
    const text = readFileSync(path.join(REPO_ROOT, relPath), 'utf8')
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (trimmed.startsWith('#') || trimmed === '') continue
      if (/\bfilter=lfs\b/.test(trimmed)) {
        offenders.push(`${relPath}: ${trimmed}`)
      }
    }
  }
  assert.deepEqual(offenders, [])
})

test('no committed .gitattributes file references an lfs merge/diff driver either', () => {
  // filter=lfs is the one that actually converts a file to a pointer, but
  // `merge=lfs` / `diff=lfs` are the other two attributes Git LFS's own
  // `git lfs track` command writes alongside it -- catching all three
  // closes the same door a partially-hand-edited .gitattributes could
  // otherwise leave open.
  const files = listTrackedGitattributesFiles()
  const offenders = []
  for (const relPath of files) {
    const text = readFileSync(path.join(REPO_ROOT, relPath), 'utf8')
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (trimmed.startsWith('#') || trimmed === '') continue
      if (/\b(?:merge|diff)=lfs\b/.test(trimmed)) {
        offenders.push(`${relPath}: ${trimmed}`)
      }
    }
  }
  assert.deepEqual(offenders, [])
})
