import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { assertNestedArchiveCoverage, assertReleaseAssetNames } from '../check-release-assets.mjs'
import { createExtrasManifest } from '../create-extras-manifest.mjs'
import { validateExtrasManifest } from '../validate-extras-manifest.mjs'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

// Small stored ZIP writer for contract fixtures. It deliberately uses the same
// central-directory fields the release checker reads; no archive package is needed.
function crc32Bytes(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function u16(value) { const b = Buffer.alloc(2); b.writeUInt16LE(value); return b }
function u32(value) { const b = Buffer.alloc(4); b.writeUInt32LE(value); return b }

function storedZip(entries) {
  const local = []
  const central = []
  let offset = 0
  for (const [name, content] of entries) {
    const nameBytes = Buffer.from(name, 'utf8')
    const data = Buffer.from(content)
    const crc = crc32Bytes(data)
    const header = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0x800), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), nameBytes,
    ])
    local.push(header, data)
    central.push(Buffer.concat([
      u32(0x02014b50), u16(20), u16(20), u16(0x800), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nameBytes,
    ]))
    offset += header.length + data.length
  }
  const centralBytes = Buffer.concat(central)
  const localBytes = Buffer.concat(local)
  return Buffer.concat([localBytes, centralBytes, Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(centralBytes.length), u32(localBytes.length), u16(0)])])
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'material-ollama-release-'))
  await mkdir(path.join(root, 'windows-amd64', 'lib'), { recursive: true })
  await writeFile(path.join(root, 'windows-amd64', 'ollama.exe'), Buffer.from('cli'))
  await writeFile(path.join(root, 'windows-amd64', 'lib', 'empty.bin'), Buffer.alloc(0))
  await writeFile(path.join(root, 'ollama-windows-amd64.zip'), storedZip([
    ['ollama.exe', 'cli'],
    ['lib/empty.bin', Buffer.alloc(0)],
  ]))
  return root
}

test('release publishes exactly the installer and versioned extras ZIP', () => {
  assert.doesNotThrow(() => assertReleaseAssetNames(['OllamaSetup.exe', 'material-ollama-extras-v0.0.0-build.19.zip'], 'v0.0.0-build.19'))
  assert.throws(() => assertReleaseAssetNames(['OllamaSetup.exe', 'install.ps1'], 'v0.0.0-build.19'), /Unexpected release asset/)
  assert.throws(() => assertReleaseAssetNames(['OllamaSetup.exe', 'material-ollama-extras-v0.0.0-build.19.zip', 'third.zip'], 'v0.0.0-build.19'), /exactly two/)
  assert.throws(() => assertReleaseAssetNames(['OllamaSetup.exe', 'nested__file--0123456789ab.zip'], 'v0.0.0-build.19'), /Unexpected|flattened|hash/)
  assert.throws(() => assertReleaseAssetNames(['OllamaSetup.exe', 'OllamaSetup.exe'], 'v0.0.0-build.19'), /duplicate/i)
})

test('asset-name CLI mode does not require a dist directory, while explicit coverage still does', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'material-ollama-cli-modes-'))
  try {
    const checker = path.join(REPO_ROOT, 'scripts', 'check-release-assets.mjs')
    const namesOnly = spawnSync(process.execPath, [checker, '--tag', 'v0.0.0-build.19', '--asset-names', 'OllamaSetup.exe', 'material-ollama-extras-v0.0.0-build.19.zip'], { cwd: root, encoding: 'utf8' })
    assert.equal(namesOnly.status, 0, namesOnly.stderr)
    const bothModes = await fixture()
    const both = spawnSync(process.execPath, [checker, '--tag', 'v0.0.0-build.19', '--asset-names', 'OllamaSetup.exe', 'material-ollama-extras-v0.0.0-build.19.zip', '--dist', bothModes], { cwd: REPO_ROOT, encoding: 'utf8' })
    assert.equal(both.status, 0, both.stderr)
    assert.match(both.stdout, /Release asset names verified/)
    assert.match(both.stdout, /Release archive coverage verified/)
    await rm(bothModes, { recursive: true, force: true })
    const coverage = spawnSync(process.execPath, [checker, '--dist', path.join(root, 'missing-dist')], { cwd: REPO_ROOT, encoding: 'utf8' })
    assert.notEqual(coverage.status, 0)
    assert.match(`${coverage.stdout}${coverage.stderr}`, /dist|payload|No such/i)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('coverage keeps zero-byte payloads covered via explicit map membership', async () => {
  const root = await fixture()
  try {
    const report = await assertNestedArchiveCoverage(root)
    assert.equal(report.coveredFiles, 2)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('coverage turns red for missing, length-mismatched, and conflicting entries', async () => {
  const root = await fixture()
  try {
    await writeFile(path.join(root, 'windows-amd64', 'missing.bin'), Buffer.from('missing'))
    await assert.rejects(assertNestedArchiveCoverage(root), /Uncovered payload file/)
    await rm(path.join(root, 'windows-amd64', 'missing.bin'))
    await writeFile(path.join(root, 'windows-amd64', 'ollama.exe'), Buffer.from('different-length'))
    await assert.rejects(assertNestedArchiveCoverage(root), /Length mismatch/)
    await writeFile(path.join(root, 'windows-amd64', 'ollama.exe'), Buffer.from('cli'))
    await writeFile(path.join(root, 'ollama-windows-amd64-rocm.zip'), storedZip([['ollama.exe', 'longer']]))
    await assert.rejects(assertNestedArchiveCoverage(root), /Conflicting duplicate archive entry/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('extras manifest records every payload member without self-hashing', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'material-ollama-extras-'))
  try {
    await writeFile(path.join(root, 'ollama-windows-amd64.zip'), Buffer.from('archive'))
    await writeFile(path.join(root, 'install.ps1'), Buffer.from('helper'))
    const manifest = await createExtrasManifest({ root, tag: 'v0.0.0-build.19', sourceCommit: 'a'.repeat(40) })
    assert.equal(manifest.members.length, 2)
    assert.equal(manifest.members.some((member) => member.path === 'extras-manifest.json'), false)
    const bytes = JSON.parse(await readFile(path.join(root, 'extras-manifest.json'), 'utf8'))
    assert.equal(bytes.releaseTag, 'v0.0.0-build.19')
    assert.equal(bytes.members[0].sha256.length, 64)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('extras manifest validation catches missing fields, invalid values, missing, unexpected, length, hash, duplicate, and self entries', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'material-ollama-extras-validate-'))
  try {
    await writeFile(path.join(root, 'ollama-windows-amd64.zip'), Buffer.from('archive'))
    await writeFile(path.join(root, 'install.ps1'), Buffer.from('helper'))
    await createExtrasManifest({ root, tag: 'v0.0.0-build.19', sourceCommit: 'b'.repeat(40) })
    await assert.doesNotReject(validateExtrasManifest({ root, tag: 'v0.0.0-build.19', sourceCommit: 'b'.repeat(40) }))

    const manifestPath = path.join(root, 'extras-manifest.json')
    const original = JSON.parse(await readFile(manifestPath, 'utf8'))
    for (const field of ['architecture', 'backend', 'role', 'path', 'bytes', 'sha256']) {
      const changed = JSON.parse(JSON.stringify(original))
      delete changed.members[0][field]
      await writeFile(manifestPath, `${JSON.stringify(changed)}\n`)
      await assert.rejects(validateExtrasManifest({ root, tag: 'v0.0.0-build.19', sourceCommit: 'b'.repeat(40) }), new RegExp(`Missing extras manifest member field: ${field}`))
    }
    for (const [field, value] of [['architecture', 'mips'], ['backend', 'unknown'], ['role', 'not-a-role']]) {
      const changed = JSON.parse(JSON.stringify(original))
      changed.members[0][field] = value
      await writeFile(manifestPath, `${JSON.stringify(changed)}\n`)
      await assert.rejects(validateExtrasManifest({ root, tag: 'v0.0.0-build.19', sourceCommit: 'b'.repeat(40) }), new RegExp(`Malformed extras manifest ${field}`))
    }
    for (const field of ['schemaVersion', 'releaseTag', 'sourceCommit', 'members']) {
      const changed = JSON.parse(JSON.stringify(original))
      delete changed[field]
      await writeFile(manifestPath, `${JSON.stringify(changed)}\n`)
      await assert.rejects(validateExtrasManifest({ root, tag: 'v0.0.0-build.19', sourceCommit: 'b'.repeat(40) }), new RegExp(`Missing extras manifest field: ${field}`))
    }
    const mutations = [
      ['missing', async () => { await rm(path.join(root, 'install.ps1')); }],
      ['unexpected', async () => { await writeFile(path.join(root, 'unexpected.txt'), Buffer.from('extra')); }],
      ['length', async () => { await writeFile(path.join(root, 'install.ps1'), Buffer.from('longer-than-helper')); }],
      ['hash', async () => { await writeFile(path.join(root, 'install.ps1'), Buffer.from('helper')); const changed = JSON.parse(JSON.stringify(original)); changed.members.find((member) => member.path === 'install.ps1').sha256 = '0'.repeat(64); await writeFile(manifestPath, `${JSON.stringify(changed)}\n`); }],
      ['self', async () => { const changed = JSON.parse(JSON.stringify(original)); changed.members.push({ ...changed.members[0], path: 'extras-manifest.json' }); await writeFile(manifestPath, `${JSON.stringify(changed)}\n`); }],
    ]
    for (const [label, mutate] of mutations) {
      await rm(path.join(root, 'install.ps1'), { force: true })
      await rm(path.join(root, 'unexpected.txt'), { force: true })
      await writeFile(path.join(root, 'install.ps1'), Buffer.from('helper'))
      await writeFile(manifestPath, `${JSON.stringify(original)}\n`)
      await mutate()
      const expectedError = label === 'hash' ? /SHA-256/i : label === 'self' ? /own member|self/i : new RegExp(label, 'i')
      await assert.rejects(validateExtrasManifest({ root, tag: 'v0.0.0-build.19', sourceCommit: 'b'.repeat(40) }), expectedError)
    }
    const duplicate = JSON.parse(JSON.stringify(original)); duplicate.members.push({ ...duplicate.members[0] }); await writeFile(manifestPath, `${JSON.stringify(duplicate)}\n`)
    await assert.rejects(validateExtrasManifest({ root, tag: 'v0.0.0-build.19', sourceCommit: 'b'.repeat(40) }), /Duplicate/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('install helper verifies the published digest and never requires Authenticode', async () => {
  const helper = await readFile(path.join(REPO_ROOT, 'scripts', 'install.ps1'), 'utf8')
  assert.match(helper, /OLLAMA_INSTALLER_SHA256/)
  assert.match(helper, /Resolve-PublishedInstaller/)
  assert.match(helper, /api\.github\.com\/repos\/Ding-Ding-Projects\/material-ollama\/releases/)
  assert.match(helper, /browser_download_url/)
  assert.doesNotMatch(helper, /ollama\.com\/download/)
  assert.match(helper, /exact two-asset contract/)
  assert.match(helper, /Get-FileHash[\s\S]*SHA256/)
  assert.doesNotMatch(helper, /Get-AuthenticodeSignature/)
  assert.match(helper, /published SHA-256/i)
})

test('release workflow uses a recoverable draft transaction and verifies draft assets before publication', async () => {
  const workflow = await readFile(path.join(REPO_ROOT, '.github', 'workflows', 'release.yaml'), 'utf8')
  assert.match(workflow, /gh api --method POST "repos\/\$env:GITHUB_REPOSITORY\/releases"[\s\S]*-F draft=true/)
  assert.match(workflow, /gh api "repos\/\$env:GITHUB_REPOSITORY\/releases\/\$releaseId"/)
  assert.match(workflow, /check-release-assets\.mjs --tag \$tag --asset-names/)
  assert.match(workflow, /gh api --method PATCH "repos\/\$env:GITHUB_REPOSITORY\/releases\/\$releaseId"[\s\S]*-F draft=false/)
  assert.match(workflow, /SHA-256 ``\$\(\$_\.sha256\)``/)
  assert.match(workflow, /published\.published_at/)
  assert.match(workflow, /\[DateTimeOffset\]::Parse\(\$published\.published_at\)/)
  assert.match(workflow, /finalRelease = gh api --method PATCH "repos\/\$env:GITHUB_REPOSITORY\/releases\/\$releaseId"/)
  assert.doesNotMatch(workflow, /asset-upload-manifest|pathHash|normalized\.Contains\('\/'\)/)
  assert.match(workflow, /included inside the extras ZIP as `release-metadata\.json`/)
})

test('site release manifest requires structured SHA-256 digests for both assets', async () => {
  const fetcher = await readFile(path.join(REPO_ROOT, 'site', 'scripts', 'fetch-release-manifest.mjs'), 'utf8')
  assert.match(fetcher, /digestFor/)
  assert.match(fetcher, /installerSha256/)
  assert.match(fetcher, /extrasSha256/)
  assert.match(fetcher, /sha256:\[0-9a-f\]\{64\}/i)
  assert.match(fetcher, /!installerSha256 \|\| !extrasSha256/)
  assert.match(fetcher, /status: 'unavailable'/)
})
