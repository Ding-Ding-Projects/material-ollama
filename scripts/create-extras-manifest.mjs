#!/usr/bin/env node
/** Create the member-level manifest placed inside the versioned extras ZIP. */

import { createHash } from 'node:crypto'
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function option(args, name, fallback = null) {
  const index = args.indexOf(name)
  return index < 0 ? fallback : args[index + 1]
}

function normalise(value) {
  return value.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+/g, '/')
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
  return result.sort((a, b) => normalise(path.relative(root, a)).localeCompare(normalise(path.relative(root, b))))
}

export const EXTRAS_ARCHITECTURES = Object.freeze(['arm64', 'universal', 'x64'])
export const EXTRAS_BACKENDS = Object.freeze(['cpu', 'cuda', 'mlx', 'rocm'])
export const EXTRAS_ROLES = Object.freeze([
  'dependency-audit',
  'desktop-executable',
  'evidence',
  'installer-helper',
  'integrity-manifest',
  'line-count',
  'portable-archive',
  'release-metadata',
])

export function classify(memberPath) {
  const lower = memberPath.toLowerCase()
  const architecture = lower.includes('arm64') ? 'arm64' : lower.includes('amd64') || lower.includes('x64') ? 'x64' : 'universal'
  const backend = lower.includes('rocm') || lower.includes('hip') ? 'rocm' : lower.includes('mlx') ? 'mlx' : lower.includes('cuda') || lower.includes('nvidia') ? 'cuda' : 'cpu'
  const role = lower.endsWith('.zip') ? 'portable-archive'
    : lower.endsWith('.exe') ? 'desktop-executable'
      : lower.includes('dependency-audit') ? 'dependency-audit'
        : lower === 'install.ps1' ? 'installer-helper'
          : lower === 'sha256sums.txt' ? 'integrity-manifest'
            : lower.startsWith('line-count.') ? 'line-count'
              : lower === 'release-metadata.json' ? 'release-metadata'
                : 'evidence'
  return { architecture, backend, role }
}

export async function createExtrasManifest({ root, tag, sourceCommit, output = path.join(root, 'extras-manifest.json') }) {
  if (!/^v[^/\\]+$/.test(tag)) throw new Error(`Invalid release tag: ${tag}`)
  if (!/^[0-9a-f]{40}$/i.test(sourceCommit)) throw new Error(`Invalid source commit: ${sourceCommit}`)
  const members = []
  for (const absolute of await filesUnder(root)) {
    const memberPath = normalise(path.relative(root, absolute))
    if (memberPath === 'extras-manifest.json') continue
    const bytes = await readFile(absolute)
    const record = classify(memberPath)
    members.push({
      architecture: record.architecture,
      backend: record.backend,
      role: record.role,
      path: memberPath,
      bytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    })
  }
  if (members.length === 0) throw new Error('Extras manifest cannot be empty')
  const manifest = { schemaVersion: 1, releaseTag: tag, sourceCommit: sourceCommit.toLowerCase(), members }
  await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return manifest
}

async function main() {
  const args = process.argv.slice(2)
  const root = option(args, '--root')
  const tag = option(args, '--tag')
  const sourceCommit = option(args, '--commit')
  if (!root || !tag || !sourceCommit) throw new Error('Usage: create-extras-manifest.mjs --root <dir> --tag <tag> --commit <sha> [--output <path>]')
  const output = option(args, '--output', path.join(root, 'extras-manifest.json'))
  const manifest = await createExtrasManifest({ root: path.resolve(root), tag, sourceCommit, output: path.resolve(output) })
  process.stdout.write(`Wrote extras manifest with ${manifest.members.length} member(s): ${output}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`extras manifest failed: ${error.message}`)
    process.exitCode = 1
  })
}
