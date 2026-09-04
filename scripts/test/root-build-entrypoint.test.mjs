import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const entrypoint = fs.readFileSync(path.join(root, 'build.bat'), 'utf8').replaceAll('\r\n', '\n')
const installerEntrypoint = fs.readFileSync(path.join(root, 'build-installer.bat'), 'utf8').replaceAll('\r\n', '\n')
const dependencyEntrypoint = fs.readFileSync(path.join(root, 'download-dependencies.bat'), 'utf8').replaceAll('\r\n', '\n')
const unsignedProbe = fs.readFileSync(path.join(root, 'scripts', 'verify-unsigned-installer.ps1'), 'utf8').replaceAll('\r\n', '\n')
const artifactProbe = fs.readFileSync(path.join(root, 'scripts', 'verify-installer-artifact.ps1'), 'utf8').replaceAll('\r\n', '\n')
const prereqBootstrap = fs.readFileSync(path.join(root, 'scripts', 'bootstrap_windows_prerequisites.ps1'), 'utf8').replaceAll('\r\n', '\n')
const toolBootstrap = fs.readFileSync(path.join(root, 'scripts', 'bootstrap_windows_tools.ps1'), 'utf8').replaceAll('\r\n', '\n')
const webViewFetcher = fs.readFileSync(path.join(root, 'scripts', 'fetch-webview2.ps1'), 'utf8').replaceAll('\r\n', '\n')
const hashModuleFixture = path.join(root, 'scripts', 'check-powershell-hash-module.ps1')

function assertUnsignedProbeContract(source) {
  assert.match(source, /Get-AuthenticodeSignature\s+-LiteralPath\s+\$resolvedPath/)
  assert.match(source, /securityModulePath = Join-Path \$PSHOME .*Microsoft\.PowerShell\.Security/)
  assert.match(source, /Import-Module -Name \$securityModulePath -Force -ErrorAction Stop/)
  assert.match(source, /if \(\$status -cne 'NotSigned'\)/)
  assert.match(source, /Get-FileHash\s+-LiteralPath\s+\$resolvedPath\s+-Algorithm SHA256/)
  assert.match(source, /Status=NotSigned/)
}

function assertArtifactProbeContract(source) {
  assert.doesNotMatch(source, /ReadAllBytes/)
  assert.match(source, /\[IO\.File\]::OpenRead\(\$resolvedPath\)/)
  assert.match(source, /function Read-ExactBytes/)
  assert.match(source, /0x4d.*0x5a/)
  assert.match(source, /0x50.*0x45/)
  assert.match(source, /VersionInfo\.FileDescription/)
  assert.match(source, /ExpectedCommit/)
  assert.match(source, /Get-FileHash[\s\S]*SHA256/)
}

const rootBuild = fs.readFileSync(path.join(root, 'scripts', 'root-build.ps1'), 'utf8').replaceAll('\r\n', '\n')
const rootManifest = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'root-build-manifest.json'), 'utf8'))

test('root build separates silent, explicit run, and fast release flags from named build steps', () => {
  for (const flag of ['/s', '--silent', '/run', '--run', '--release-fast']) {
    assert.ok(entrypoint.includes('"%~1"=="' + flag + '" goto arg_'))
  }
  assert.match(entrypoint, /RUN_AFTER_BUILD/)
  assert.match(entrypoint, /MATERIAL_OLLAMA_BUILD_MODE/)
  assert.match(entrypoint, /root-build[.]ps1/)
  assert.match(rootBuild, /if \(-not \$ReleaseFast\)/)
  assert.match(rootBuild, /if \(-not \$SilentMode -and -not \$RunAfterBuild\)/)
  assert.match(rootBuild, /if \(\$RunAfterBuild\)/)
  assert.match(rootBuild, /Assert-Payload \$binding/)
  assert.equal(rootManifest.targets.amd64.executable, 'dist/windows-ollama-app-amd64.exe')
  assert.equal(rootManifest.targets.arm64.executable, 'dist/windows-ollama-app-arm64.exe')
})

test('root dependency entrypoint returns activated PATH and delegates to one shared process', () => {
  assert.match(dependencyEntrypoint, /root-build[.]ps1" -DependenciesOnly -PathOutput/)
  assert.match(dependencyEntrypoint, /endlocal\r?\n  set "PATH=%%P"/)
  assert.match(rootBuild, /bootstrap_windows_prerequisites[.]ps1/)
  assert.match(rootBuild, /bootstrap_windows_tools[.]ps1/)
  assert.match(rootBuild, /fetch-webview2[.]ps1/)
  assert.match(rootBuild, /exit \$LASTEXITCODE/)
  assert.match(installerEntrypoint, /call "%SCRIPT_DIR%build[.]bat" \/s/)
  assert.doesNotMatch(installerEntrypoint, /call "%SCRIPT_DIR%download-dependencies[.]bat"/)
})

test('silent download helpers suppress host progress rendering while keeping phase receipts', () => {
  const progressContract = /^\$ProgressPreference = 'SilentlyContinue'$/m
  assert.match(toolBootstrap, progressContract)
  assert.match(webViewFetcher, progressContract)
  assert.doesNotMatch(
    toolBootstrap.replace("$ProgressPreference = 'SilentlyContinue'", ''),
    progressContract,
    'removing the tool-download progress contract must turn this check red',
  )
  assert.doesNotMatch(
    webViewFetcher.replace("$ProgressPreference = 'SilentlyContinue'", ''),
    progressContract,
    'removing the WebView2 progress contract must turn this check red',
  )
})

test('installer entrypoint proves the produced executable is unsigned before reporting its digest', () => {
  const squirrelVerifier = fs.readFileSync(path.join(root, 'scripts', 'verify-squirrel-build.ps1'), 'utf8')
  assert.match(squirrelVerifier, /verify-unsigned-installer\.ps1|NotSigned|Assert-SquirrelOutput/)
  assert.match(installerEntrypoint, /No release or upload action is performed/)
  assertUnsignedProbeContract(unsignedProbe)
  assert.throws(() => assertUnsignedProbeContract(unsignedProbe.replace('Get-AuthenticodeSignature', 'Get-FileHash')), /Authenticode/)
  assert.throws(() => assertUnsignedProbeContract(unsignedProbe.replace('Import-Module -Name $securityModulePath -Force -ErrorAction Stop', '# security import removed')), /securityModulePath/)
  assert.throws(() => assertUnsignedProbeContract(unsignedProbe.replace("$status -cne 'NotSigned'", "$false")), /-cne 'NotSigned'/)
  assert.match(installerEntrypoint, /verify-squirrel-build\.ps1/)
  assert.doesNotMatch(installerEntrypoint, /verify-installer-artifact\.ps1/)
  assertArtifactProbeContract(artifactProbe)
  assert.throws(() => assertArtifactProbeContract(artifactProbe.replace('[IO.File]::OpenRead($resolvedPath)', '[IO.File]::ReadAllBytes($resolvedPath)')), /ReadAllBytes/)
  assert.throws(() => assertArtifactProbeContract(artifactProbe.replace('$dosHeader[0] -ne 0x4d -or $dosHeader[1] -ne 0x5a', '$dosHeader[0] -ne 0x00 -or $dosHeader[1] -ne 0x5a')), /0x4d/)
  assert.throws(() => assertArtifactProbeContract(artifactProbe.replace('VersionInfo.FileDescription', 'VersionInfo.FileName')), /FileDescription/)
})

test('large sparse non-PE fixture is rejected from the bounded header path without a whole-file read', () => {
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const probeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'material-ollama-pe-header-'))
  const sparsePath = path.join(probeRoot, 'large-invalid-installer.exe')
  const fd = fs.openSync(sparsePath, 'w')
  try {
    fs.ftruncateSync(fd, 256 * 1024 * 1024)
    const dosHeader = Buffer.alloc(64)
    dosHeader[0] = 0x4d
    dosHeader[1] = 0x5a
    dosHeader.writeInt32LE(17 * 1024 * 1024, 0x3c)
    fs.writeSync(fd, dosHeader, 0, dosHeader.length, 0)
  } finally {
    fs.closeSync(fd)
  }
  try {
    const result = spawnSync(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts', 'verify-installer-artifact.ps1'), '-Path', sparsePath, '-ExpectedCommit', 'a'.repeat(40)], { cwd: root, encoding: 'utf8', timeout: 30_000 })
    assert.notEqual(result.status, 0)
    assert.match(`${result.stdout}${result.stderr}`, /bounded header range/i)
  } finally {
    fs.rmSync(probeRoot, { recursive: true, force: true })
  }
})

test('no-profile PowerShell hash fixture succeeds with implicit module loading disabled', () => {
  const fixtureSource = fs.readFileSync(hashModuleFixture, 'utf8')
  assert.match(fixtureSource, /PSModuleAutoloadingPreference\s*=\s*'None'/)
  assert.match(fixtureSource, /Import-Module -Name \$utilityModulePath -Force -ErrorAction Stop/)
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const result = spawnSync(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', hashModuleFixture], { cwd: root, encoding: 'utf8', timeout: 30_000 })
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.match(result.stdout, /no-profile hash-module fixture verified/i)
})

function assertSevenZipProbeContract(source) {
  assert.ok(source.includes('function Get-SevenZipVersion {'))
  assert.ok(source.includes("(?<version>\\d+(?:\\.\\d+){1,2})"))
  assert.ok(source.includes('function Test-SevenZipCompatible {'))
  assert.match(source, /\$actual -ge \[Version\]\$ManifestEntry\.version/)
  assert.match(source, /missing or unparseable/)
}

test('7-Zip bootstrap rejects missing, unparseable, and older executables and keeps the pinned path honest', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'release-dependencies.json'), 'utf8'))
  const sevenZip = manifest.dependencies.find((dependency) => dependency.name === '7-Zip')
  assert.equal(sevenZip.version, '26.2.0')
  assertSevenZipProbeContract(prereqBootstrap)
  assert.throws(() => assertSevenZipProbeContract(prereqBootstrap.replace('function Get-SevenZipVersion {', 'function Get-SevenZipVersionRemoved {')), /function Get-SevenZipVersion/)
  assert.throws(() => assertSevenZipProbeContract(prereqBootstrap.replace('$actual -ge [Version]$ManifestEntry.version', '$actual -eq [Version]$ManifestEntry.version')), /-ge/)
})

test('cold-cache CMake and LLVM-MinGW archive lifecycle leaves no blocking candidate after a failed install', () => {
  assert.match(toolBootstrap, /\.material-ollama-toolchain-stage-/)
  assert.match(toolBootstrap, /same-volume directory rename/)
  assert.doesNotMatch(toolBootstrap, /Expand-Archive/)
  assert.match(toolBootstrap, /\[IO\.Compression\.ZipFile\]::OpenRead/)
  assert.match(toolBootstrap, /\[IO\.Compression\.ZipFile\]::ExtractToDirectory/)
  assert.match(toolBootstrap, /unsafe member path|escapes its extraction root/)
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const fixture = spawnSync(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts', 'check-bootstrap-windows-tool-install.ps1')], { cwd: root, encoding: 'utf8', timeout: 120_000 })
  assert.equal(fixture.status, 0, `${fixture.stdout}\n${fixture.stderr}`)
  assert.match(fixture.stdout, /cold-cache CMake and LLVM-MinGW installs reject incomplete archives, leave no blocking candidate, and retry successfully/i)
})

test('native build no longer tells a fresh machine to install Node manually', () => {
  const buildScript = fs.readFileSync(path.join(root, 'scripts', 'build_windows.ps1'), 'utf8')
  assert.doesNotMatch(buildScript, /Visit:\s*https:\/\/nodejs\.org/)
  assert.match(buildScript, /Node\.js\/npm is unavailable after the repository dependency bootstrap/)
})

test('portable prerequisite manifests pin canonical sources and supported host architectures', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'root-prerequisites.json'), 'utf8'))
  assert.equal(manifest.schemaVersion, 1)
  assert.equal(manifest.platform, 'windows')
  assert.deepEqual(manifest.dependencies.map(item => item.name), ['Node.js', 'Go', '7-Zip'])
  for (const dependency of manifest.dependencies) {
    for (const arch of ['amd64', 'arm64']) {
      assert.match(dependency.architectures[arch].sha256, /^[a-f0-9]{64}$/)
      assert.match(dependency.architectures[arch].url, /^https:\/\/(nodejs[.]org\/|go[.]dev\/|github[.]com\/ip7z\/7zip\/)/)
    }
  }
  assert.doesNotMatch(prereqBootstrap, /Read-Host|Press any key|Install-WingetPackage/)
})
