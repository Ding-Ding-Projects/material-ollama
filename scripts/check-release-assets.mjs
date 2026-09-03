#!/usr/bin/env node
/**
 * Release asset contract checks.
 *
 * This intentionally has no third-party packages: the release runner already
 * has Node and 7-Zip, while the coverage check only needs ZIP central-directory
 * metadata (not extraction). It verifies that every file in a windows-* payload
 * is covered by the matching ollama-<platform>*.zip archive(s).
 */

import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const INSTALLER_NAME = 'OllamaSetup.exe'

export function assertReleaseTag(tag) {
  if (typeof tag !== 'string' || !/^v[^/\\]+$/.test(tag)) {
    throw new Error(`Invalid release tag: ${tag}`)
  }
  return tag
}

/**
 * One release, one download. The installer is a self-contained universal
 * bundle -- desktop app, server and CLI for both architectures, the llama.cpp
 * runners, and the WebView2 runtime -- so nothing else belongs on the release
 * page. Portable archives, dependency audits, checksums and the line-count
 * table stay reachable as workflow run artifacts.
 */
export function assertReleaseAssetNames(names, tag) {
  assertReleaseTag(tag)
  const expected = new Set([INSTALLER_NAME])
  const actual = [...names]
  const duplicateNames = actual.filter((name, index) => actual.indexOf(name) !== index)
  if (duplicateNames.length > 0) throw new Error(`Release contains duplicate asset names: ${[...new Set(duplicateNames)].join(', ')}`)
  if (actual.length !== expected.size) {
    throw new Error(`Release must contain exactly one asset (${[...expected].join(', ')}); found ${actual.length}.`)
  }
  for (const name of actual) {
    if (!expected.has(name)) throw new Error(`Unexpected release asset: ${name}`)
    if (name.includes('__')) throw new Error(`Release asset contains a flattened path marker: ${name}`)
    if (/--[0-9a-f]{12}$/i.test(name.replace(/\.zip$/i, ''))) {
      throw new Error(`Release asset contains a path hash suffix: ${name}`)
    }
  }
  return true
}

function normaliseMemberName(name) {
  const normalised = name.replaceAll('\\', '/').replace(/^\.\//, '')
  return normalised.replace(/\/+/g, '/').replace(/^\//, '')
}

function readUInt32LE(buffer, offset) {
  if (offset + 4 > buffer.length) throw new Error('Truncated ZIP metadata')
  return buffer.readUInt32LE(offset)
}

/** Read central-directory member names and uncompressed lengths from a ZIP. */
export function readZipCentralDirectory(buffer, source = '<zip>') {
  const minimumEocd = 22
  const start = Math.max(0, buffer.length - 65557)
  let eocd = -1
  for (let i = buffer.length - minimumEocd; i >= start; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error(`Not a ZIP archive: ${source}`)
  const entryCount = buffer.readUInt16LE(eocd + 10)
  const centralSize = readUInt32LE(buffer, eocd + 12)
  const centralOffset = readUInt32LE(buffer, eocd + 16)
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new Error(`ZIP64 archives are not supported by the release coverage checker: ${source}`)
  }
  if (centralOffset + centralSize > buffer.length) throw new Error(`Truncated ZIP central directory: ${source}`)

  const entries = []
  let cursor = centralOffset
  for (let i = 0; i < entryCount; i += 1) {
    if (readUInt32LE(buffer, cursor) !== 0x02014b50) throw new Error(`Invalid ZIP central entry ${i} in ${source}`)
    const flags = buffer.readUInt16LE(cursor + 8)
    const uncompressedSize = readUInt32LE(buffer, cursor + 24)
    const nameLength = buffer.readUInt16LE(cursor + 28)
    const extraLength = buffer.readUInt16LE(cursor + 30)
    const commentLength = buffer.readUInt16LE(cursor + 32)
    const externalAttributes = readUInt32LE(buffer, cursor + 38)
    const nameStart = cursor + 46
    const nameEnd = nameStart + nameLength
    if (nameEnd + extraLength + commentLength > buffer.length) throw new Error(`Truncated ZIP entry ${i} in ${source}`)
    const encoding = flags & 0x800 ? 'utf8' : 'latin1'
    const rawName = buffer.subarray(nameStart, nameEnd).toString(encoding)
    const name = normaliseMemberName(rawName)
    const directory = name.endsWith('/') || (externalAttributes & 0x10) !== 0
    if (!directory && name) entries.push({ name, bytes: uncompressedSize, source })
    cursor = nameEnd + extraLength + commentLength
  }
  return entries
}

async function listFiles(root) {
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

/**
 * Assert coverage for every file below each dist/windows-* directory.
 * The first platform directory component is removed before comparison.
 */
export async function assertNestedArchiveCoverage(distRoot) {
  const entries = await readdir(distRoot, { withFileTypes: true })
  const platformDirs = entries.filter((entry) => entry.isDirectory() && /^windows-[^/\\]+$/i.test(entry.name))
  if (platformDirs.length === 0) throw new Error(`No dist/windows-* payload directories found under ${distRoot}`)

  const expectedByPlatform = new Map()
  for (const platformDir of platformDirs) {
    const platform = platformDir.name
    const archives = entries
      .filter((entry) => entry.isFile() && new RegExp(`^ollama-${platform}.*\\.zip$`, 'i').test(entry.name))
      .map((entry) => path.join(distRoot, entry.name))
    if (archives.length === 0) throw new Error(`No matching archive found for ${platform}: expected ollama-${platform}*.zip`)
    const archiveMembers = new Map()
    for (const archive of archives) {
      const archiveEntries = readZipCentralDirectory(await readFile(archive), archive)
      for (const member of archiveEntries) {
        const key = normaliseMemberName(member.name).toLowerCase()
        if (archiveMembers.has(key) && archiveMembers.get(key).bytes !== member.bytes) {
          throw new Error(`Conflicting duplicate archive entry for ${platform}: ${member.name} has lengths ${archiveMembers.get(key).bytes} and ${member.bytes}`)
        }
        archiveMembers.set(key, member)
      }
    }
    expectedByPlatform.set(platform.toLowerCase(), archiveMembers)
  }

  let covered = 0
  for (const platformDir of platformDirs) {
    const platform = platformDir.name.toLowerCase()
    const root = path.join(distRoot, platformDir.name)
    for (const absolute of await listFiles(root)) {
      const relative = normaliseMemberName(path.relative(root, absolute))
      const key = relative.toLowerCase()
      const archiveMembers = expectedByPlatform.get(platform)
      // Map.has() is intentional: a zero-byte payload is still a covered file.
      if (!archiveMembers.has(key)) throw new Error(`Uncovered payload file ${platformDir.name}/${relative}: no matching archive member`)
      const archiveMember = archiveMembers.get(key)
      const fileBytes = (await stat(absolute)).size
      if (fileBytes !== archiveMember.bytes) {
        throw new Error(`Length mismatch for ${platformDir.name}/${relative}: payload=${fileBytes}, archive=${archiveMember.bytes}`)
      }
      covered += 1
    }
  }
  return { platforms: platformDirs.map((entry) => entry.name), coveredFiles: covered }
}

async function main() {
  const args = process.argv.slice(2)
  const distIndex = args.indexOf('--dist')
  const namesIndex = args.indexOf('--asset-names')
  const hasAssetNames = namesIndex >= 0
  const hasExplicitDist = distIndex >= 0
  if (namesIndex >= 0) {
    const tagIndex = args.indexOf('--tag')
    const tag = tagIndex >= 0 ? args[tagIndex + 1] : null
    const names = []
    for (let index = namesIndex + 1; index < args.length && !args[index].startsWith('--'); index += 1) names.push(args[index])
    if (!tag || names.length === 0) throw new Error('Usage: check-release-assets.mjs --tag <tag> --asset-names <installer> [--dist <dir>]')
    assertReleaseAssetNames(names, tag)
    process.stdout.write('Release asset names verified.\n')
  }
  // --asset-names is intentionally a names-only mode. Coverage is run when
  // --dist is explicit, or with no mode at all for the local default dist/.
  if (hasExplicitDist || !hasAssetNames) {
    const distRoot = hasExplicitDist ? args[distIndex + 1] : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')
    if (hasExplicitDist && (!distRoot || distRoot.startsWith('--'))) throw new Error('Usage: check-release-assets.mjs --dist <dir>')
    const report = await assertNestedArchiveCoverage(path.resolve(distRoot))
    process.stdout.write(`Release archive coverage verified: ${report.coveredFiles} payload file(s) across ${report.platforms.join(', ')}.\n`)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`release asset check failed: ${error.message}`)
    process.exitCode = 1
  })
}
