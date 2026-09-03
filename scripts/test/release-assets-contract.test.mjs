import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { assertNestedArchiveCoverage, assertReleaseAssetNames } from '../check-release-assets.mjs'

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

test('release publishes exactly one asset: the installer, and nothing else', () => {
  const tag = 'v0.0.0-build.19'
  assert.doesNotThrow(() => assertReleaseAssetNames(['OllamaSetup.exe'], tag))
  assert.throws(() => assertReleaseAssetNames(['OllamaSetup.exe', 'material-ollama-extras-v0.0.0-build.19.zip'], tag), /exactly one/)
  assert.throws(() => assertReleaseAssetNames(['OllamaSetup.exe', 'install.ps1'], tag), /exactly one/)
  assert.throws(() => assertReleaseAssetNames([], tag), /exactly one/)
  assert.throws(() => assertReleaseAssetNames(['Setup.exe'], tag), /Unexpected release asset/)
  assert.throws(() => assertReleaseAssetNames(['OllamaSetup.exe', 'OllamaSetup.exe'], tag), /duplicate/i)
  // The old 57-asset shape must stay impossible.
  assert.throws(() => assertReleaseAssetNames(['windows-amd64__lib__ollama__ggml.dll--dc5ce0c5649e'], tag), /Unexpected|flattened|hash/)
  assert.throws(() => assertReleaseAssetNames(['OllamaSetup.exe--0123456789ab'], tag), /Unexpected|flattened|hash/)
  // A malformed tag is refused before any name is considered.
  assert.throws(() => assertReleaseAssetNames(['OllamaSetup.exe'], 'v0.0.0/build.19'), /Invalid release tag/)
})

test('asset-name CLI mode does not require a dist directory, while explicit coverage still does', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'material-ollama-cli-modes-'))
  try {
    const checker = path.join(REPO_ROOT, 'scripts', 'check-release-assets.mjs')
    const namesOnly = spawnSync(process.execPath, [checker, '--tag', 'v0.0.0-build.19', '--asset-names', 'OllamaSetup.exe'], { cwd: root, encoding: 'utf8' })
    assert.equal(namesOnly.status, 0, namesOnly.stderr)
    const bothModes = await fixture()
    const both = spawnSync(process.execPath, [checker, '--tag', 'v0.0.0-build.19', '--asset-names', 'OllamaSetup.exe', '--dist', bothModes], { cwd: REPO_ROOT, encoding: 'utf8' })
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

test('install helper verifies the published digest and never requires Authenticode', async () => {
  const helper = await readFile(path.join(REPO_ROOT, 'scripts', 'install.ps1'), 'utf8')
  assert.match(helper, /OLLAMA_INSTALLER_SHA256/)
  assert.match(helper, /Resolve-PublishedInstaller/)
  assert.match(helper, /api\.github\.com\/repos\/Ding-Ding-Projects\/material-ollama\/releases/)
  assert.match(helper, /browser_download_url/)
  assert.doesNotMatch(helper, /ollama\.com\/download/)
  assert.match(helper, /exact one-asset contract/)
  assert.match(helper, /^\s*\$assets\.Count -ne 1 /m)
  // Nothing may reintroduce a second required asset.
  assert.doesNotMatch(helper, /extras/i)
  assert.match(helper, /Get-FileHash[\s\S]*SHA256/)
  assert.doesNotMatch(helper, /Get-AuthenticodeSignature/)
  assert.match(helper, /published SHA-256/i)
})

test('release workflow uses a recoverable draft transaction, the real upload host, and one asset', async () => {
  const workflow = await readFile(path.join(REPO_ROOT, '.github', 'workflows', 'release.yaml'), 'utf8')
  assert.match(workflow, /gh api --method POST "repos\/\$env:GITHUB_REPOSITORY\/releases"[\s\S]*-F draft=true/)
  assert.match(workflow, /gh api "repos\/\$env:GITHUB_REPOSITORY\/releases\/\$releaseId"/)
  assert.match(workflow, /check-release-assets\.mjs --tag \$tag --asset-names/)
  assert.match(workflow, /gh api --method PATCH "repos\/\$env:GITHUB_REPOSITORY\/releases\/\$releaseId"[\s\S]*-F draft=false/)
  assert.match(workflow, /SHA-256 ``\$\(\$_\.sha256\)``/)
  assert.match(workflow, /published\.published_at/)
  assert.match(workflow, /finalRelease = gh api --method PATCH "repos\/\$env:GITHUB_REPOSITORY\/releases\/\$releaseId"/)
  assert.doesNotMatch(workflow, /asset-upload-manifest|pathHash|normalized\.Contains\('\/'\)/)

  // Asset uploads must go to the upload host, taken from the release response's
  // own upload_url. A bare gh api path resolves against api.github.com and 404s,
  // which is exactly how run 32544293738 lost a finished installer.
  assert.match(workflow, /^\s*\$uploadBase = \$draft\.upload_url -replace/m)
  assert.match(workflow, /^\s*\$uploaded = gh api --method POST "\$\{uploadBase\}\?name=\$assetName"/m)
  assert.doesNotMatch(workflow, /releases\/\$releaseId\/assets\?name=/)

  // One release, one download.
  assert.match(workflow, /^\s*\$assetNames = @\('OllamaSetup\.exe'\)$/m)
  assert.match(workflow, /^\s*if \(\$assetNames\.Count -ne 1\)/m)
  assert.doesNotMatch(workflow, /extras/i)

  // A push to a side branch must not mint a release.
  assert.match(workflow, /^\s*branches: \[main\]$/m)
})

test('site release manifest requires a structured SHA-256 digest and refuses any second asset', async () => {
  const fetcher = await readFile(path.join(REPO_ROOT, 'site', 'scripts', 'fetch-release-manifest.mjs'), 'utf8')
  assert.match(fetcher, /^\s*const installerSha256 = digestFor\(installerAsset\)$/m)
  assert.match(fetcher, /^\s*if \(publishedNames\.length !== 1\) \{$/m)
  assert.match(fetcher, /^\s*if \(!installerSha256 \|\| !\/\^https:/m)
  assert.match(fetcher, /sha256:\[0-9a-f\]\{64\}/i)
  assert.match(fetcher, /status: 'unavailable'/)
  // The extras ZIP is gone; nothing may reintroduce a second published asset.
  assert.doesNotMatch(fetcher, /extras/i)
})
