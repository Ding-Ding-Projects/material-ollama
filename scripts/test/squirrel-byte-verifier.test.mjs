import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const scripts = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const commit = '1234567890abcdef1234567890abcdef12345678'
const packageId = 'MaterialOllamaX64'
const version = '1.23.4'
const packageName = `${packageId}-${version}-full.nupkg`
const setupName = 'MaterialOllama-x64-Setup.exe'
const shell = process.platform === 'win32' ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : 'powershell.exe'
const hash = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex')
const quote = value => `'${value.replaceAll("'", "''")}'`

function powershell(args) {
  const result = spawnSync(shell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...args], {
    encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024,
  })
  assert.ifError(result.error)
  assert.equal(result.signal, null, 'PowerShell must finish within the bounded deadline')
  return { ...result, output: `${result.stdout}\n${result.stderr}`.replace(/\r\n/g, '\n') }
}

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}
function u16(value) { const bytes = Buffer.alloc(2); bytes.writeUInt16LE(value); return bytes }
function u32(value) { const bytes = Buffer.alloc(4); bytes.writeUInt32LE(value); return bytes }

// Controlled stored ZIPs let each test change actual package bytes, including
// entries a normal archive writer refuses, without adding an archive dependency.
function zipBytes(entries) {
  const local = [], central = []
  let offset = 0
  for (const [name, source] of entries) {
    const filename = Buffer.from(name), data = Buffer.from(source), crc = crc32(data)
    const header = Buffer.concat([u32(0x04034b50), u16(20), u16(0x800), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(filename.length), u16(0), filename])
    local.push(header, data)
    central.push(Buffer.concat([u32(0x02014b50), u16(20), u16(20), u16(0x800), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(filename.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), filename]))
    offset += header.length + data.length
  }
  const directory = Buffer.concat(central)
  return Buffer.concat([...local, directory, u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(directory.length), u32(offset), u16(0)])
}

test('Squirrel byte verification rejects independently corrupted release fixtures', { skip: process.platform !== 'win32' && 'requires Windows Authenticode and Windows PowerShell', timeout: 240000 }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'squirrel-byte-verifier-'))
  try {
    // Snapshot both production scripts, not their logic, so concurrent development
    // cannot change the implementation halfway through this suite's verdict.
    const sourceHashes = {}
    for (const name of ['verify-squirrel-artifacts.ps1', 'squirrel-contract.ps1']) {
      const bytes = await readFile(path.join(scripts, name))
      sourceHashes[name] = hash(bytes)
      await writeFile(path.join(root, name), bytes)
    }
    t.diagnostic(`Production script SHA-256: ${JSON.stringify(sourceHashes)}`)
    const executablePath = path.join(root, 'fixture.exe')
    const compiled = powershell(['-Command', `$ErrorActionPreference='Stop'; Add-Type -TypeDefinition 'public class Fixture { public static void Main() {} }' -OutputAssembly ${quote(executablePath)} -OutputType ConsoleApplication -CompilerParameters (New-Object System.CodeDom.Compiler.CompilerParameters -Property @{ CompilerOptions='/platform:x64' }); if ((Get-AuthenticodeSignature -LiteralPath ${quote(executablePath)}).Status -ne 'NotSigned') { throw 'Fixture must be unsigned.' }`])
    assert.equal(compiled.status, 0, compiled.output)
    const executable = await readFile(executablePath)
    assert.ok(executable.length > 128)

    async function fixture(change = {}) {
      const dir = await mkdtemp(path.join(root, 'case-'))
      const installed = { schemaVersion: 1, packageId, version, sourceCommit: commit, architecture: 'x64', entryPoint: 'ollama app.exe', ...change.installed }
      let entries = [
        ['lib/net45/ollama app.exe', executable], ['lib/net45/ollama.exe', executable],
        ['lib/net45/lib/ollama/llama-server.exe', executable], ['lib/net45/app.ico', Buffer.from([0, 0, 1, 0, 1, 0])],
        ['lib/net45/webview2/MicrosoftEdgeWebView2RuntimeInstallerX64.exe', executable],
        ['lib/net45/package-version.json', JSON.stringify(installed)],
        [`${packageId}.nuspec`, `<package><metadata><id>${change.nuspecId ?? packageId}</id><version>${change.nuspecVersion ?? version}</version><description>Windows x64 package</description><releaseNotes>Source ${commit}</releaseNotes></metadata></package>`],
      ]
      if (change.entries) entries = change.entries(entries)
      const bytes = zipBytes(entries)
      const releases = `${hash(bytes, 'sha1')} ${packageName} ${bytes.length}\n`
      const provenance = { schemaVersion: 1, packageId, version, sourceCommit: commit, architecture: 'x64', setupFile: setupName, signing: 'disabled', fullPackage: packageName, fullPackageSha256: hash(bytes), fullPackageLength: bytes.length, ...change.provenance }
      await writeFile(path.join(dir, setupName), change.setup ?? executable)
      await writeFile(path.join(dir, packageName), bytes)
      await writeFile(path.join(dir, 'RELEASES'), change.releases ? change.releases(releases, bytes) : releases)
      await writeFile(path.join(dir, 'provenance.json'), JSON.stringify(provenance))
      const output = path.join(dir, 'receipt.json')
      const result = powershell(['-File', path.join(root, 'verify-squirrel-artifacts.ps1'), '-ArtifactDirectory', dir, '-ProvenancePath', path.join(dir, 'provenance.json'), '-ExpectedCommit', commit, '-SetupFile', setupName, '-ExpectedPackageId', packageId, '-ExpectedVersion', version, '-ExpectedArchitecture', 'x64', '-RequiredPackageEntry', 'lib/net45/ollama app.exe', '-OutputPath', output])
      return { ...result, dir, outputPath: output }
    }
    async function rejected(change, expected) {
      const result = await fixture(change)
      assert.notEqual(result.status, 0, 'corrupt fixture must be rejected')
      assert.match(result.output, expected)
      await assert.rejects(readFile(result.outputPath), { code: 'ENOENT' }, 'rejection must not produce a success receipt')
    }
    const replaceEntry = (name, mutate) => entries => entries.map(([entry, data]) => [entry, entry === name ? mutate(Buffer.from(data)) : data])

    await t.test('healthy unsigned PE and ZIP produce a byte-bound receipt', async () => {
      const result = await fixture()
      assert.equal(result.status, 0, result.output)
      const receipt = JSON.parse((await readFile(result.outputPath, 'utf8')).replace(/^\uFEFF/, ''))
      assert.equal(receipt.verified, true)
      assert.equal(receipt.setupAuthenticode, 'NotSigned')
      assert.equal(receipt.sourceCommit, commit)
      assert.equal(receipt.setupSha256, hash(executable))
      const bytes = await readFile(path.join(result.dir, packageName))
      assert.equal(receipt.fullPackageSha256, hash(bytes))
      assert.equal(receipt.fullPackageLength, bytes.length)
      assert.deepEqual(receipt.releasesRows, [{ name: packageName, length: bytes.length, sha1: hash(bytes, 'sha1') }])
    })
    const cases = [
      ['malformed RELEASES row', { releases: () => 'not-a-package-row\n' }, /malformed RELEASES row/],
      ['empty RELEASES', { releases: () => '# no packages\n' }, /RELEASES has no package rows/],
      ['wrong RELEASES length', { releases: (_line, bytes) => `${hash(bytes, 'sha1')} ${packageName} ${bytes.length + 1}\n` }, /RELEASES length mismatch/],
      ['wrong RELEASES SHA-1', { releases: (_line, bytes) => `${'0'.repeat(40)} ${packageName} ${bytes.length}\n` }, /RELEASES SHA-1 mismatch/],
      ['duplicate RELEASES row', { releases: line => line + line }, /RELEASES contains duplicate package names/],
      ['path traversal in RELEASES', { releases: line => line.replace(packageName, `../${packageName}`) }, /unsafe or non-package RELEASES member/],
      ['missing desktop entry', { entries: entries => entries.filter(([name]) => name !== 'lib/net45/ollama app.exe') }, /required package entry .*ollama app[.]exe.* is missing/],
      ['missing native server entry', { entries: entries => entries.filter(([name]) => name !== 'lib/net45/lib/ollama/llama-server.exe') }, /required package entry .*llama-server[.]exe.* is missing or empty/],
      ['empty bundled runtime entry', { entries: replaceEntry('lib/net45/webview2/MicrosoftEdgeWebView2RuntimeInstallerX64.exe', () => Buffer.alloc(0)) }, /required package entry .*webview2.* is missing or empty/],
      ['wrong payload architecture', { entries: replaceEntry('lib/net45/ollama.exe', bytes => { bytes.writeUInt16LE(0xaa64, bytes.readUInt32LE(60) + 4); return bytes }) }, /PE architecture mismatch for lib\/net45\/ollama[.]exe/],
      ['invalid payload DOS header', { entries: replaceEntry('lib/net45/ollama.exe', bytes => { bytes.writeUInt16LE(0, 0); return bytes }) }, /Invalid PE DOS header/],
      ['invalid payload PE offset', { entries: replaceEntry('lib/net45/ollama.exe', bytes => { bytes.writeUInt32LE(0xffffffff, 60); return bytes }) }, /Invalid PE header offset/],
      ['invalid payload PE signature', { entries: replaceEntry('lib/net45/ollama.exe', bytes => { bytes.writeUInt32LE(0, bytes.readUInt32LE(60)); return bytes }) }, /Invalid PE signature/],
      ['wrong installed version identity', { installed: { version: '1.23.5' } }, /installed package version metadata does not match expected identity/],
      ['wrong installed architecture identity', { installed: { architecture: 'arm64' } }, /installed package version metadata does not match expected identity/],
      ['stale installed source commit', { installed: { sourceCommit: 'f'.repeat(40) } }, /installed package version metadata does not match expected identity/],
      ['case-insensitive duplicate ZIP path', { entries: entries => [...entries, ['LIB/NET45/OLLAMA.EXE', executable]] }, /package has duplicate case-insensitive paths/],
      ['ZIP path traversal', { entries: entries => [...entries, ['lib/net45/../escape.txt', 'invalid']] }, /package contains path traversal entry/],
      ['wrong nuspec version', { nuspecVersion: '1.23.5' }, /package manifest version does not match the expected version/],
      ['wrong nuspec package ID', { nuspecId: 'AnotherPackage' }, /package manifest ID does not match the expected package ID/],
      ['stale provenance source commit', { provenance: { sourceCommit: 'f'.repeat(40) } }, /provenance source commit does not match expected commit/],
      ['wrong provenance SHA-256', { provenance: { fullPackageSha256: '0'.repeat(64) } }, /provenance full package SHA-256 does not match the package bytes/],
      ['wrong provenance byte length', { provenance: { fullPackageLength: 1 } }, /provenance full package length does not match the package bytes/],
      ['invalid setup bytes', { setup: Buffer.alloc(1024) }, /Invalid PE DOS header/],
    ]
    for (const [name, mutation, message] of cases) await t.test(name, () => rejected(mutation, message))

    await t.test('an existing signed executable is refused as setup without creating a signing key', async () => {
      const signature = powershell(['-Command', `[string](Get-AuthenticodeSignature -LiteralPath ${quote(shell)}).Status`])
      assert.equal(signature.status, 0, signature.output)
      assert.equal(signature.stdout.trim(), 'Valid', 'the existing Windows executable must actually be signed for this negative fixture')
      await rejected({ setup: await readFile(shell) }, /setup executable Authenticode status is 'Valid', expected 'NotSigned'/)
    })

    await t.test('helper validates numeric package versions and real PE architectures', () => {
      const result = powershell(['-Command', `$ErrorActionPreference='Stop'; . ${quote(path.join(root, 'squirrel-contract.ps1'))}; $valid=Get-SquirrelVersion -SourceRoot ${quote(root)} -ExplicitVersion '1.23.4'; if ($valid -cne '1.23.4') { throw 'Wrong explicit version.' }; foreach ($invalid in @('1.2','01.2.3','1.2.3-beta','1.2.65535')) { $refused=$false; try { Get-SquirrelVersion -SourceRoot ${quote(root)} -ExplicitVersion $invalid | Out-Null } catch { if ($_.Exception.Message -notmatch 'numeric three-part|must not exceed') { throw }; $refused=$true }; if (-not $refused) { throw "Accepted invalid version: $invalid" } }; Assert-PeFile ${quote(executablePath)} 'x64' | Out-Null; $refused=$false; try { Assert-PeFile ${quote(executablePath)} 'arm64' | Out-Null } catch { if ($_.Exception.Message -notmatch 'PE architecture mismatch') { throw }; $refused=$true }; if (-not $refused) { throw 'Accepted wrong architecture.' }; 'helper assertions passed'`])
      assert.equal(result.status, 0, result.output)
      assert.match(result.stdout, /helper assertions passed/)
    })
    for (const [name, expected] of Object.entries(sourceHashes)) assert.equal(hash(await readFile(path.join(scripts, name))), expected, `${name} changed during verification; rerun against the current implementation`)
  } finally {
    assert.ok(path.basename(root).startsWith('squirrel-byte-verifier-'))
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()))
    await rm(root, { recursive: true, force: true })
  }
})
