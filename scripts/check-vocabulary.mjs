#!/usr/bin/env node
// scripts/check-vocabulary.mjs
//
// See docs/features/uh-completeness/articles/vocabulary-hash-lock.md for
// the full contract this implements.
//
// This repository never commits the private vocabulary text, and never
// commits a pinned hash of it either -- a pinned digest goes stale the
// moment a term is added and then it is just a number somebody bumps to
// turn a red gate green. Instead:
//
//   1. Locate a private vocabulary source file that lives OUTSIDE this
//      repository (never checked in here, never inside this working
//      tree at all).
//   2. Extract its vocabulary section (bounded by a recognizable start
//      heading and the next top-level heading after it) and hash that
//      exact section's bytes at run time.
//   3. Compare against a lock file sitting BESIDE that private source
//      file -- also outside this repository -- and never committed here.
//
// Adding a term to the private source therefore fails every build until
// someone who actually has the private source re-runs this script with
// --lock, deliberately re-pinning the new hash. That's the point: the
// gate is on POSSESSION AND CURRENCY of the private dictionary, not on
// its content ever touching this public repository.
//
// Fails OPEN for an outsider: no candidate private source found at all
// (the common case for anyone who clones this public repository without
// the private source) prints why and exits 0 -- refusing a stranger a
// build of a public repository would be absurd.
//
// Fails CLOSED for staleness: a private source IS present but its lock
// file is missing or its hash does not match exits 1 -- that is the one
// state that means something is actually wrong (the dictionary changed,
// or was never locked, since the checkout that's building right now was
// set up).
//
// What this CANNOT prove: that the vocabulary was ever actually SPOKEN
// in any conversation, by any agent. This script only checks that a
// private dictionary file exists, is readable, and matches a hash
// somebody deliberately pinned -- it has no way to observe what an agent
// actually wrote in chat. Claiming otherwise would make this exactly the
// decorative gate the shared instructions forbid elsewhere. Speaking the
// vocabulary stays a per-reply discipline checked by the agent itself,
// not by this script.
//
// Usage:
//   node scripts/check-vocabulary.mjs              # check (default; used by build.bat and the pre-push hook)
//   node scripts/check-vocabulary.mjs --lock        # (re)write the lock file beside the located private source
//   node scripts/check-vocabulary.mjs --self-test   # exercises every branch against real temp files, never the operator's real private source

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

// The heading that opens the private vocabulary section, and the pattern
// for "the next top-level heading", which closes it. Both are matched
// against a candidate file's raw text; a file containing the start
// heading but never a following "## " heading is treated as running to
// end-of-file.
const SECTION_START_RE = /^##\s+Vocabulary and locations\s*$/m
const NEXT_H2_RE = /^##\s+\S/m

const LOCK_SUFFIX = '.vocab-lock.json'
const LOCK_SCHEMA_VERSION = 1

/** Extract the vocabulary section from a candidate file's raw text, or
 * null if this file does not contain the start heading at all (i.e. it
 * is not a vocabulary source, not merely an out-of-date one). */
function extractVocabularySection(text) {
  const normalized = text.replace(/\r\n/g, '\n')
  const startMatch = normalized.match(SECTION_START_RE)
  if (!startMatch) return null
  const startIndex = startMatch.index
  const afterStart = normalized.slice(startIndex + startMatch[0].length)
  const nextHeadingMatch = afterStart.match(NEXT_H2_RE)
  const sectionBody = nextHeadingMatch ? afterStart.slice(0, nextHeadingMatch.index) : afterStart
  // Keep the start heading line itself in the hashed section, so a
  // rename of the heading text is also a change this gate notices.
  return `${startMatch[0]}\n${sectionBody}`.trimEnd()
}

function hashSection(sectionText) {
  return crypto.createHash('sha256').update(sectionText, 'utf8').digest('hex')
}

/** Default candidate roots to search for a private vocabulary source, in
 * order. Every one of these lives OUTSIDE this repository by
 * construction (they're all derived from the user's home directory, not
 * from anything under this checkout) -- resolved dynamically rather than
 * hard-coded to one username or drive, per this project's own rule
 * against baking a specific machine into committed source. */
function defaultCandidateFiles() {
  const home = os.homedir()
  const candidateDirs = [
    path.join(home, '.claude', 'rules'),
    path.join(home, '.codex', 'rules'),
    path.join(home, 'Documents', 'GitHub', 'agent-global-memory', 'memory'),
  ]
  const files = []
  for (const dir of candidateDirs) {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue
    for (const entry of readdirSync(dir)) {
      if (entry.toLowerCase().endsWith('.md')) files.push(path.join(dir, entry))
    }
  }
  // An explicit override always takes priority (used by --self-test and
  // by an operator whose private source lives somewhere this default
  // search would not find).
  if (process.env.AGENT_VOCAB_SOURCE) {
    files.unshift(process.env.AGENT_VOCAB_SOURCE)
  }
  return files
}

/** Search candidateFiles in order for the first one whose text contains
 * the vocabulary section. Returns { file, section } or null if none of
 * the candidates are a vocabulary source at all (including candidates
 * that don't exist on disk). */
function locatePrivateSource(candidateFiles, { readFileText = (p) => readFileSync(p, 'utf8') } = {}) {
  for (const file of candidateFiles) {
    if (!existsSync(file) || !statSync(file).isFile()) continue
    let text
    try {
      text = readFileText(file)
    } catch {
      continue
    }
    const section = extractVocabularySection(text)
    if (section !== null) return { file, section }
  }
  return null
}

function lockPathFor(sourceFile) {
  return `${sourceFile}${LOCK_SUFFIX}`
}

function readLock(lockPath) {
  if (!existsSync(lockPath)) return null
  try {
    return JSON.parse(readFileSync(lockPath, 'utf8'))
  } catch (err) {
    return { parseError: err.message }
  }
}

function writeLock(lockPath, hash, sourceFile) {
  const payload = {
    schemaVersion: LOCK_SCHEMA_VERSION,
    algorithm: 'sha256',
    hash,
    // The lock file records where it came from for a human's benefit; it
    // still never contains the vocabulary text itself.
    sourceFile,
    lockedAt: new Date().toISOString(),
  }
  writeFileSync(lockPath, `${JSON.stringify(payload, null, 2)}\n`)
  return payload
}

/** Core decision, independent of process.exit/console so --self-test can
 * assert on the returned shape directly. */
function evaluate(candidateFiles, { mode = 'check' } = {}) {
  const located = locatePrivateSource(candidateFiles)

  if (!located) {
    return {
      outcome: 'skip-no-source',
      ok: true,
      message:
        'No private vocabulary source found at any candidate location -- skipping the vocabulary hash lock ' +
        'check. This is expected for anyone building this public repository without access to the private ' +
        'source, and is not a failure.',
    }
  }

  const hash = hashSection(located.section)
  const lockPath = lockPathFor(located.file)

  if (mode === 'lock') {
    const payload = writeLock(lockPath, hash, located.file)
    return {
      outcome: 'locked',
      ok: true,
      message: `Locked ${located.file} at sha256:${hash} -- wrote ${lockPath}`,
      lockPath,
      payload,
    }
  }

  const lock = readLock(lockPath)
  if (lock === null) {
    return {
      outcome: 'fail-missing-lock',
      ok: false,
      message:
        `Private vocabulary source found at ${located.file}, but no lock file exists at ${lockPath}. ` +
        'A private source must be locked before it can pass this gate -- run ' +
        '`node scripts/check-vocabulary.mjs --lock` once you have reviewed the current dictionary.',
    }
  }
  if (lock.parseError) {
    return {
      outcome: 'fail-invalid-lock',
      ok: false,
      message: `Lock file at ${lockPath} is not valid JSON: ${lock.parseError}. Re-run --lock to regenerate it.`,
    }
  }
  if (lock.hash !== hash) {
    return {
      outcome: 'fail-hash-mismatch',
      ok: false,
      message:
        `The private vocabulary dictionary at ${located.file} has changed since it was last locked ` +
        `(locked sha256:${lock.hash ?? '<missing>'}, current sha256:${hash}). This is expected the moment a ` +
        'term is added or edited -- review the change, then re-run `node scripts/check-vocabulary.mjs --lock` ' +
        'to pin the new hash.',
    }
  }
  return {
    outcome: 'pass',
    ok: true,
    message: `Private vocabulary source at ${located.file} matches its locked sha256:${hash}.`,
  }
}

// ---------------------------------------------------------------------------
// --self-test: exercises every branch above against real temporary files,
// never the operator's actual private source (AGENT_VOCAB_SOURCE and the
// default candidate dirs are both bypassed by passing an explicit
// candidate list straight to evaluate()).
// ---------------------------------------------------------------------------

function selfTest() {
  const scratchDir = mkdtempSync(path.join(os.tmpdir(), 'check-vocabulary-self-test-'))
  const results = []
  function check(name, fn) {
    try {
      fn()
      results.push({ name, ok: true })
    } catch (err) {
      results.push({ name, ok: false, error: err.message })
    }
  }

  const sourceFile = path.join(scratchDir, 'fake-private-source.md')
  const missingFile = path.join(scratchDir, 'does-not-exist.md')

  const SECTION_TEXT =
    '## Vocabulary and locations\n\n- "example" means "sample" in this fixture.\n\n## Some other section\n\nunrelated body text\n'

  check('no candidate exists at all -> skip-no-source, ok=true', () => {
    const result = evaluate([missingFile])
    if (result.outcome !== 'skip-no-source' || result.ok !== true) {
      throw new Error(`expected skip-no-source/ok=true, got ${JSON.stringify(result)}`)
    }
  })

  check('a candidate file exists but has no vocabulary heading -> skip-no-source', () => {
    const noVocabFile = path.join(scratchDir, 'no-vocab.md')
    writeFileSync(noVocabFile, '# Unrelated document\n\njust some other content\n')
    const result = evaluate([noVocabFile])
    if (result.outcome !== 'skip-no-source') {
      throw new Error(`expected skip-no-source, got ${JSON.stringify(result)}`)
    }
    rmSync(noVocabFile)
  })

  check('source present, no lock file -> fail-missing-lock, ok=false', () => {
    writeFileSync(sourceFile, SECTION_TEXT)
    const lockPath = lockPathFor(sourceFile)
    if (existsSync(lockPath)) rmSync(lockPath)
    const result = evaluate([sourceFile])
    if (result.outcome !== 'fail-missing-lock' || result.ok !== false) {
      throw new Error(`expected fail-missing-lock/ok=false, got ${JSON.stringify(result)}`)
    }
  })

  check('--lock writes a lock file whose hash matches the section', () => {
    const result = evaluate([sourceFile], { mode: 'lock' })
    if (result.outcome !== 'locked' || result.ok !== true) {
      throw new Error(`expected locked/ok=true, got ${JSON.stringify(result)}`)
    }
    const lockPath = lockPathFor(sourceFile)
    if (!existsSync(lockPath)) throw new Error('lock file was not written')
    const lockJson = JSON.parse(readFileSync(lockPath, 'utf8'))
    if (lockJson.hash !== hashSection(extractVocabularySection(SECTION_TEXT))) {
      throw new Error('locked hash does not match the section that was actually hashed')
    }
  })

  check('after --lock, a plain check passes (fail-closed does NOT fire on an unchanged source)', () => {
    const result = evaluate([sourceFile])
    if (result.outcome !== 'pass' || result.ok !== true) {
      throw new Error(`expected pass/ok=true, got ${JSON.stringify(result)}`)
    }
  })

  check('editing the vocabulary section after locking -> fail-hash-mismatch, ok=false (fails CLOSED)', () => {
    // The added term must land INSIDE the vocabulary section (before the
    // "## Some other section" boundary) -- appending after it would be
    // exactly the "edit outside the section" case the next check below
    // already covers, and would prove nothing about this one.
    const edited = SECTION_TEXT.replace(
      '## Some other section',
      '- "one more term" added after locking\n\n## Some other section',
    )
    writeFileSync(sourceFile, edited)
    const result = evaluate([sourceFile])
    if (result.outcome !== 'fail-hash-mismatch' || result.ok !== false) {
      throw new Error(`expected fail-hash-mismatch/ok=false, got ${JSON.stringify(result)}`)
    }
    // restore for subsequent checks
    writeFileSync(sourceFile, SECTION_TEXT)
  })

  check('editing content OUTSIDE the vocabulary section does not change the hash', () => {
    // Re-lock against the canonical section text first.
    evaluate([sourceFile], { mode: 'lock' })
    const withUnrelatedEdit = `# Some unrelated preamble that changed\n\n${SECTION_TEXT}`
    writeFileSync(sourceFile, withUnrelatedEdit)
    const result = evaluate([sourceFile])
    if (result.outcome !== 'pass') {
      throw new Error(`expected pass (unrelated edit should not affect the section hash), got ${JSON.stringify(result)}`)
    }
    writeFileSync(sourceFile, SECTION_TEXT)
    evaluate([sourceFile], { mode: 'lock' })
  })

  check('a corrupt lock file (invalid JSON) -> fail-invalid-lock, ok=false', () => {
    const lockPath = lockPathFor(sourceFile)
    const goodLock = readFileSync(lockPath, 'utf8')
    writeFileSync(lockPath, '{ this is not valid json')
    const result = evaluate([sourceFile])
    if (result.outcome !== 'fail-invalid-lock' || result.ok !== false) {
      throw new Error(`expected fail-invalid-lock/ok=false, got ${JSON.stringify(result)}`)
    }
    writeFileSync(lockPath, goodLock)
  })

  check('first matching candidate wins when multiple candidate files are given', () => {
    const secondSourceFile = path.join(scratchDir, 'second-source.md')
    writeFileSync(secondSourceFile, SECTION_TEXT.replace('example', 'should-not-be-read'))
    const result = evaluate([sourceFile, secondSourceFile])
    if (result.outcome !== 'pass') {
      throw new Error(`expected the already-locked first candidate to pass, got ${JSON.stringify(result)}`)
    }
    rmSync(secondSourceFile)
  })

  check('the section extractor stops at the NEXT heading, not end-of-file', () => {
    const withTrailingJunk = `${SECTION_TEXT}\nsomething that must not be hashed\n## Yet another section\nmore junk\n`
    const extracted = extractVocabularySection(withTrailingJunk)
    if (extracted.includes('must not be hashed')) {
      throw new Error('section extraction leaked content past the next H2 heading')
    }
  })

  rmSync(scratchDir, { recursive: true, force: true })

  const failed = results.filter((r) => !r.ok)
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}: ${r.name}${r.ok ? '' : ` -- ${r.error}`}`)
  }
  if (failed.length > 0) {
    console.log(`\n${failed.length}/${results.length} self-test checks failed.`)
    process.exit(1)
  }
  console.log(`\nPASS: all ${results.length} self-test checks passed.`)
}

// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2)
  if (args.includes('--self-test')) {
    selfTest()
    return
  }
  const mode = args.includes('--lock') ? 'lock' : 'check'
  const result = evaluate(defaultCandidateFiles(), { mode })
  console.log(result.message)
  process.exit(result.ok ? 0 : 1)
}

main()
