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

test('root build consumes silent switches before forwarding build step names', () => {
  assert.match(entrypoint, /^if \/I "%~1"=="\/s" goto arg_silent$/m)
  assert.match(entrypoint, /^if \/I "%~1"=="--silent" goto arg_silent$/m)
  assert.match(entrypoint, /^if \/I "%SILENT%"=="1" set "SILENT_MODE=1"$/m)
  assert.match(entrypoint, /^set "BUILD_STEPS=!BUILD_STEPS! "%~1""$/m)
  assert.match(entrypoint, /build_windows\.ps1" %BUILD_STEPS%$/m)
  assert.doesNotMatch(entrypoint, /build_windows\.ps1" %\*/)
})

test('silent argument parsing runs before every build gate', () => {
  const parse = entrypoint.indexOf(':parse_args')
  const inventory = entrypoint.indexOf('node scripts\\check-uh-inventory.mjs --self-test')
  const delegate = entrypoint.indexOf('scripts\\build_windows.ps1" %BUILD_STEPS%')
  assert.ok(parse >= 0 && parse < inventory && inventory < delegate)
})

test('root dependency bootstrap owns fresh-machine tools and WebView2, while installer delegates once through build.bat', () => {
  assert.match(entrypoint, /download-dependencies\.bat.*\/s/)
  assert.match(dependencyEntrypoint, /bootstrap_windows_prerequisites\.ps1/)
  assert.match(dependencyEntrypoint, /bootstrap_windows_tools\.ps1/)
  assert.match(dependencyEntrypoint, /fetch-webview2\.ps1/)
  assert.match(installerEntrypoint, /call "%SCRIPT_DIR%build\.bat" \/s/)
  assert.doesNotMatch(installerEntrypoint, /call "%SCRIPT_DIR%download-dependencies\.bat"/)
  assert.match(dependencyEntrypoint, /POWERSHELL_EXE=%SystemRoot%\\System32\\WindowsPowerShell\\v1\.0\\powershell\.exe/)
  assert.doesNotMatch(dependencyEntrypoint, /^powershell(?:\.exe)?\s+-NoProfile/m)
  assert.match(entrypoint, /POWERSHELL_EXE=%SystemRoot%\\System32\\WindowsPowerShell\\v1\.0\\powershell\.exe/)
  assert.doesNotMatch(entrypoint, /^powershell(?:\.exe)?\s+-NoProfile/m)
  assert.match(installerEntrypoint, /POWERSHELL_EXE=%SystemRoot%\\System32\\WindowsPowerShell\\v1\.0\\powershell\.exe/)
  assert.doesNotMatch(installerEntrypoint, /^powershell(?:\.exe)?\s+-NoProfile/m)
})

test('installer entrypoint proves the produced executable is unsigned before reporting its digest', () => {
  assert.match(installerEntrypoint, /verify-unsigned-installer\.ps1/)
  assert.match(installerEntrypoint, /No release or upload action is performed/)
  assertUnsignedProbeContract(unsignedProbe)
  assert.throws(() => assertUnsignedProbeContract(unsignedProbe.replace('Get-AuthenticodeSignature', 'Get-FileHash')), /Authenticode/)
  assert.throws(() => assertUnsignedProbeContract(unsignedProbe.replace('Import-Module -Name $securityModulePath -Force -ErrorAction Stop', '# security import removed')), /securityModulePath/)
  assert.throws(() => assertUnsignedProbeContract(unsignedProbe.replace("$status -cne 'NotSigned'", "$false")), /-cne 'NotSigned'/)
  assert.match(installerEntrypoint, /verify-installer-artifact\.ps1/)
  assert.match(installerEntrypoint, /git -C .*rev-parse HEAD/)
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

test('bootstrap versions stay aligned with the release manifest and workflow contract', () => {
  const helper = fs.readFileSync(path.join(root, 'scripts', 'bootstrap_windows_prerequisites.ps1'), 'utf8')
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'release-dependencies.json'), 'utf8'))
  const sevenZip = manifest.dependencies.find((item) => item.name === '7-Zip')
  assert.equal(sevenZip.version, '26.2.0')
  const cmake = manifest.dependencies.find((item) => item.name === 'CMake')
  const llvmMingw = manifest.dependencies.find((item) => item.name === 'llvm-mingw')
  assert.equal(cmake.user.relativeExecutable, 'bin/cmake.exe')
  assert.equal(llvmMingw.user.relativeExecutable, 'bin/x86_64-w64-mingw32-gcc.exe')
  assert.doesNotMatch(cmake.user.relativeExecutable, new RegExp(`^${cmake.user.archiveRoot}`))
  assert.doesNotMatch(llvmMingw.user.relativeExecutable, new RegExp(`^${llvmMingw.user.archiveRoot}`))
  assert.match(sevenZip.source, /7zip\.7zip version 26\.02/)
  assert.match(helper, /Test-NodeCompatible[\s\S]*\[Version\]'22\.13\.0'/)
  assert.match(helper, /go\.exe version[\s\S]*go1\\\.26/)
  assert.match(helper, /7zip\.install[\s\S]*sevenZipManifest\.version/)
  assert.match(helper, /7zip\.7zip.*26\.02/)
  assert.match(helper, /Refresh-UserPath/)
  assert.match(helper, /IsInRole\(/)
  assert.match(helper, /Test-NodeCompatible/)
  assert.doesNotMatch(helper, /Read-Host|pause|Press any key/i)
})
