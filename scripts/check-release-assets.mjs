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
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'

export const INSTALLER_NAMES = ['MaterialOllama-arm64-Setup.exe', 'MaterialOllama-x64-Setup.exe']

export function assertReleaseTag(tag) {
  if (typeof tag !== 'string' || !/^v[^/\\]+$/.test(tag)) {
    throw new Error(`Invalid release tag: ${tag}`)
  }
  return tag
}

/**
 * The release carries one Squirrel bootstrapper per supported architecture.
 * Portable archives, dependency audits, checksums and the line-count table
 * stay reachable as workflow run artifacts.
 */
export function assertReleaseAssetNames(names, tag) {
  assertReleaseTag(tag)
  const actual = [...names]
  const duplicateNames = actual.filter((name, index) => actual.indexOf(name) !== index)
  if (duplicateNames.length > 0) throw new Error(`Release contains duplicate asset names: ${[...new Set(duplicateNames)].join(', ')}`)
  const setupNames = actual.filter(name => /^MaterialOllama-(x64|arm64)-Setup\.exe$/i.test(name))
  const releaseNames = actual.filter(name => /^MaterialOllama-(x64|arm64)-RELEASES$/i.test(name))
  const feedNames = actual.filter(name => name === 'material-ollama-update.json')
  const packageNames = actual.filter(name => /^MaterialOllama(?:X64|Arm64)-\d+\.\d+\.\d+-(?:full|delta)\.nupkg$/.test(name))
  if (setupNames.length !== 2 || !setupNames.includes(INSTALLER_NAMES[0]) || !setupNames.includes(INSTALLER_NAMES[1])) {
    throw new Error(`Release must contain exactly one x64 and one arm64 Squirrel setup asset; found ${setupNames.join(', ')}`)
  }
  if (releaseNames.length !== 2 || !releaseNames.includes('MaterialOllama-x64-RELEASES') || !releaseNames.includes('MaterialOllama-arm64-RELEASES')) {
    throw new Error('Release must contain one collision-free Squirrel RELEASES asset per architecture')
  }
  if (feedNames.length !== 1) {
    throw new Error('Release must contain one bounded update manifest')
  }
  if (packageNames.length < 2) throw new Error('Release must contain at least one full Squirrel package per architecture')
  for (const architecture of ['x64', 'arm64']) {
    const id = architecture === 'x64' ? 'MaterialOllamaX64' : 'MaterialOllamaArm64'
    const archPackages = packageNames.filter(name => name.startsWith(`${id}-`))
    if (archPackages.filter(name => /-full\.nupkg$/.test(name)).length !== 1) throw new Error(`Release must contain exactly one current ${architecture} full Squirrel package`)
    if (archPackages.filter(name => /-delta\.nupkg$/.test(name)).length > 1) throw new Error(`Release contains multiple ${architecture} delta packages`)
    if (archPackages.some(name => /-delta\.nupkg$/i.test(name)) && !archPackages.some(name => /-full\.nupkg$/i.test(name))) throw new Error(`Release has a ${architecture} delta without a full package`)
  }
  if (actual.length !== setupNames.length + releaseNames.length + feedNames.length + packageNames.length) {
    const known = new Set([...setupNames, ...releaseNames, ...feedNames, ...packageNames])
    throw new Error(`Unexpected release asset: ${actual.find(name => !known.has(name))}`)
  }
  for (const name of actual) {
    if (name.includes('__')) throw new Error(`Release asset contains a flattened path marker: ${name}`)
    if (/--[0-9a-f]{12}(?:\.nupkg|\.exe)?$/i.test(name)) {
      throw new Error(`Release asset contains a path hash suffix: ${name}`)
    }
  }
  return true
}

export async function assertUpdateDirectory(directory, expectedCommit) {
  const manifestPath = path.join(directory, 'material-ollama-update.json')
  if ((await stat(manifestPath)).size > 65536) throw new Error('Update manifest exceeds 64 KiB')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  if (manifest.schemaVersion !== 1 || !/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(manifest.version)) throw new Error('Invalid update manifest version')
  if (!/^[0-9a-f]{40}$/.test(manifest.sourceCommit) || (expectedCommit && manifest.sourceCommit !== expectedCommit)) throw new Error('Update source commit mismatch')
  if (Object.keys(manifest.architectures ?? {}).sort().join(',') !== 'arm64,x64') throw new Error('Update architectures must be exactly x64 and arm64')
  const names = ['material-ollama-update.json']
  async function verify(record, expectedName) {
    if (!record || record.name !== expectedName || path.basename(record.name) !== record.name || !Number.isSafeInteger(record.size) || record.size <= 0 || !/^[0-9a-f]{64}$/.test(record.sha256)) throw new Error('Invalid update asset metadata')
    const file = path.join(directory, record.name)
    const sha256 = createHash('sha256')
    const sha1 = createHash('sha1')
    let size = 0
    for await (const chunk of createReadStream(file)) { size += chunk.length; sha256.update(chunk); sha1.update(chunk) }
    if (size !== record.size || sha256.digest('hex') !== record.sha256) throw new Error('Update asset bytes mismatch')
    names.push(record.name)
    return { sha1: sha1.digest('hex'), file, size }
  }
  for (const architecture of ['x64', 'arm64']) {
    const value = manifest.architectures[architecture]
    const id = architecture === 'x64' ? 'MaterialOllamaX64' : 'MaterialOllamaArm64'
    if (value.packageId !== id || !Array.isArray(value.packages) || value.packages.length < 1 || value.packages.length > 2) throw new Error('Invalid update package inventory')
    await verify(value.setup, `MaterialOllama-${architecture}-Setup.exe`)
    const releases = await verify(value.releases, `MaterialOllama-${architecture}-RELEASES`)
    const rows = []
    const kinds = new Set()
    for (const pkg of value.packages) {
      if (!['full', 'delta'].includes(pkg.kind) || kinds.has(pkg.kind) || !/^[0-9a-f]{40}$/.test(pkg.sha1)) throw new Error('Invalid update package kind or SHA-1')
      kinds.add(pkg.kind)
      const checked = await verify(pkg, `${id}-${manifest.version}-${pkg.kind}.nupkg`)
      if (checked.sha1 !== pkg.sha1) throw new Error('Update package SHA-1 mismatch')
      rows.push(`${pkg.sha1} ${pkg.name} ${pkg.size}`)
    }
    if (!kinds.has('full')) throw new Error('Current full package is required')
    if (releases.size > 65536 || (await readFile(releases.file, 'utf8')).trim().split(/\r?\n/).sort().join('\n') !== rows.sort().join('\n')) throw new Error('RELEASES does not match update manifest packages')
  }
  assertReleaseAssetNames(names, 'v' + manifest.version)
  const actual = (await readdir(directory)).sort()
  if (actual.join('\n') !== names.sort().join('\n')) throw new Error('Unlisted release files')
  return manifest
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
  if (args[0] === '--squirrel-dir') {
    await assertUpdateDirectory(path.resolve(args[1]), args[2])
    process.stdout.write('Squirrel update manifest and asset bytes verified.\n')
    return
  }
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
