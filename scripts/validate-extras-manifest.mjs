#!/usr/bin/env node
/** Validate an extracted extras ZIP against its member-level manifest. */

import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { EXTRAS_ARCHITECTURES, EXTRAS_BACKENDS, EXTRAS_ROLES } from './create-extras-manifest.mjs'

function option(args, name, fallback = null) {
  const index = args.indexOf(name)
  return index < 0 ? fallback : args[index + 1]
}

function normalise(member) {
  return member.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+/g, '/')
}

function assertSafeMember(member) {
  if (!member || member.startsWith('/') || /^[A-Za-z]:\//.test(member) || member.split('/').includes('..')) {
    throw new Error(`Unsafe extras member path: ${member}`)
  }
}

async function filesUnder(root) {
  const result = []
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) await visit(absolute)
      else if (entry.isFile()) result.push(absolute)
    }
  }
  await visit(root)
  return result
}

export async function validateExtrasManifest({ root, tag, sourceCommit, manifestPath = path.join(root, 'extras-manifest.json') }) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('Extras manifest must be a JSON object.')
  for (const field of ['schemaVersion', 'releaseTag', 'sourceCommit', 'members']) {
    if (!Object.prototype.hasOwnProperty.call(manifest, field)) throw new Error(`Missing extras manifest field: ${field}`)
  }
  if (manifest.schemaVersion !== 1 || manifest.releaseTag !== tag || manifest.sourceCommit !== sourceCommit.toLowerCase()) {
    throw new Error('Extras manifest releaseTag/sourceCommit does not match the published release.')
  }
  if (!/^v[^/\\]+$/.test(manifest.releaseTag) || !/^[0-9a-f]{40}$/i.test(manifest.sourceCommit)) {
    throw new Error('Extras manifest has malformed release metadata.')
  }
  if (!Array.isArray(manifest.members) || manifest.members.length === 0) throw new Error('Extras manifest has no members.')
  const expected = new Map()
  for (const member of manifest.members) {
    if (!member || typeof member !== 'object' || Array.isArray(member)) throw new Error('Malformed extras manifest member object.')
    for (const field of ['architecture', 'backend', 'role', 'path', 'bytes', 'sha256']) {
      if (!Object.prototype.hasOwnProperty.call(member, field)) throw new Error(`Missing extras manifest member field: ${field}`)
    }
    if (!EXTRAS_ARCHITECTURES.includes(member.architecture)) throw new Error(`Malformed extras manifest architecture: ${member.architecture}`)
    if (!EXTRAS_BACKENDS.includes(member.backend)) throw new Error(`Malformed extras manifest backend: ${member.backend}`)
    if (!EXTRAS_ROLES.includes(member.role)) throw new Error(`Malformed extras manifest role: ${member.role}`)
    if (typeof member.path !== 'string' || typeof member.sha256 !== 'string') throw new Error(`Malformed extras manifest member types: ${member.path}`)
    assertSafeMember(member.path)
    if (!/^[0-9a-f]{64}$/i.test(member.sha256) || !Number.isSafeInteger(member.bytes) || member.bytes < 0) {
      throw new Error(`Malformed extras manifest member: ${member.path}`)
    }
    const key = normalise(member.path).toLowerCase()
    if (expected.has(key)) throw new Error(`Duplicate extras manifest member: ${member.path}`)
    expected.set(key, { ...member, path: normalise(member.path) })
  }
  if (expected.has('extras-manifest.json')) throw new Error('Extras manifest must exclude its own member hash.')

  const actual = new Map()
  for (const absolute of await filesUnder(root)) {
    const memberPath = normalise(path.relative(root, absolute))
    if (memberPath === 'extras-manifest.json') continue
    const bytes = await readFile(absolute)
    actual.set(memberPath.toLowerCase(), {
      path: memberPath,
      bytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    })
  }
  for (const [key, member] of expected) {
    if (!actual.has(key)) throw new Error(`Missing extras member: ${member.path}`)
    const found = actual.get(key)
    if (found.bytes !== member.bytes) throw new Error(`Extras member length mismatch: ${member.path}`)
    if (found.sha256 !== member.sha256.toLowerCase()) throw new Error(`Extras member SHA-256 mismatch: ${member.path}`)
  }
  for (const [key, found] of actual) {
    if (!expected.has(key)) throw new Error(`Unexpected extras member: ${found.path}`)
  }
  return { releaseTag: manifest.releaseTag, sourceCommit: manifest.sourceCommit, members: expected.size }
}

async function main() {
  const args = process.argv.slice(2)
  const root = option(args, '--root')
  const tag = option(args, '--tag')
  const sourceCommit = option(args, '--commit')
  if (!root || !tag || !sourceCommit) throw new Error('Usage: validate-extras-manifest.mjs --root <dir> --tag <tag> --commit <sha> [--manifest <path>]')
  const result = await validateExtrasManifest({ root: path.resolve(root), tag, sourceCommit, manifestPath: path.resolve(option(args, '--manifest', path.join(root, 'extras-manifest.json'))) })
  process.stdout.write(`Extras manifest verified: ${result.members} member(s), ${result.releaseTag}, ${result.sourceCommit}.\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`extras manifest validation failed: ${error.message}`)
    process.exitCode = 1
  })
}
