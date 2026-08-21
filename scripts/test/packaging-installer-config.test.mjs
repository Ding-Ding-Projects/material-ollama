#!/usr/bin/env node
// scripts/test/packaging-installer-config.test.mjs
//
// Real, committed coverage for the "packaging" suite-inventory area's
// checked-in Windows installer configuration -- app/ollama.iss, the real
// Inno Setup script scripts/build_windows.ps1 compiles with ISCC.exe to
// produce OllamaSetup.exe.
//
// This project is a native Go application packaged with Inno Setup, NOT an
// Electron app packaged with Squirrel.Windows -- there is no Setup.exe /
// RELEASES / .nupkg triplet anywhere in this repository. See the
// "packaging" row's own Scope column, corrected in this lane, for the real
// mechanism.
//
// What this file verifies is the real, committed .iss SOURCE the release
// build compiles, not an actually-produced installer binary: producing one
// needs the project's full native toolchain (MSVC, CUDA/HIP, Inno Setup
// itself) wired up via scripts/build_windows.ps1, which is out of this
// lane's bounded scope. Each test below is a real regression the checked-in
// script's own comments call out as a genuine hazard -- not a placeholder
// existence check.
//
// Run with: node --test scripts/test/packaging-installer-config.test.mjs

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync as readJsonFile } from 'node:fs'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const ISS_PATH = path.join(REPO_ROOT, 'app', 'ollama.iss')

function readIss() {
  return readFileSync(ISS_PATH, 'utf8')
}

function extractSetupAppIdGuid(content) {
  // [Setup]'s AppId uses Inno's "{{" escape for a literal leading brace:
  //   AppId={{44E83376-CE68-45EB-8FC1-393500EB558C}
  const m = content.match(/^AppId=\{\{([0-9A-Fa-f-]{36})\}\s*$/m)
  assert.ok(m, 'expected to find a "AppId={{<GUID>}" line in the [Setup] section')
  return m[1].toUpperCase()
}

function extractCodePerUserUninstallKeyGuid(content) {
  // [Code]'s PerUserUninstallKey constant embeds the same GUID inside a
  // plain Pascal string literal (no "{{" escaping there):
  //   PerUserUninstallKey = '...\Uninstall\{44E83376-...-EB558C}_is1';
  const m = content.match(/PerUserUninstallKey\s*=\s*'[^']*\{([0-9A-Fa-f-]{36})\}_is1'/)
  assert.ok(m, 'expected to find the PerUserUninstallKey Pascal constant in the [Code] section')
  return m[1].toUpperCase()
}

test('the [Setup] AppId GUID matches the [Code] PerUserUninstallKey GUID used for per-user-to-machine-wide migration detection', () => {
  const content = readIss()
  const setupGuid = extractSetupAppIdGuid(content)
  const codeGuid = extractCodePerUserUninstallKeyGuid(content)
  // The .iss file's own comment on AppId documents exactly why this must
  // hold: InitializeSetup() hardcodes this GUID (rather than deriving it
  // from the preprocessor) to detect an existing per-user install before a
  // machine-wide one proceeds, and the comment explicitly warns these two
  // must stay in lockstep. A future AppId rotation that updates [Setup] but
  // not this Pascal constant would silently break that migration check --
  // Setup would stop recognizing its own prior per-user installs -- with no
  // compiler error, because Inno Setup does not cross-check a literal
  // string constant against a preprocessor directive for you.
  assert.equal(
    codeGuid,
    setupGuid,
    `[Setup] AppId (${setupGuid}) and [Code] PerUserUninstallKey (${codeGuid}) have drifted apart; ` +
      'InitializeSetup()\'s per-user-install migration detection silently breaks when these disagree',
  )
})

test('the installer source declares no SignTool or other code-signing directive, honoring the project\'s permanent no-signing policy', () => {
  const content = readIss()
  assert.doesNotMatch(
    content,
    /^\s*(SignTool|SignedUninstaller|SignToolRetryCount|SignToolMinimumTimeBetween)\s*=/im,
    'app/ollama.iss must never declare a code-signing directive -- code signing is permanently prohibited for every project under the current policy',
  )
})

test('PrivilegesRequiredOverridesAllowed keeps the commandline override, so unattended /ALLUSERS and /CURRENTUSER installs remain possible under /VERYSILENT', () => {
  const content = readIss()
  const m = content.match(/^PrivilegesRequiredOverridesAllowed=(.+)$/m)
  assert.ok(m, 'expected a PrivilegesRequiredOverridesAllowed directive in [Setup]')
  const values = m[1].trim().toLowerCase().split(/\s+/)
  // The file's own [Setup] comment explains why both values are required:
  // "dialog" keeps the existing no-UAC-prompt per-user default for a plain
  // double-click, and "commandline" is what lets this project's silent
  // build/release tooling opt into a machine-wide install via /ALLUSERS
  // under /VERYSILENT, where there is no dialog to answer. Losing either
  // value silently breaks one of those two paths with no compiler error.
  assert.ok(values.includes('dialog'), `expected "dialog" in PrivilegesRequiredOverridesAllowed, got: ${m[1]}`)
  assert.ok(values.includes('commandline'), `expected "commandline" in PrivilegesRequiredOverridesAllowed, got: ${m[1]}`)
})

test('PrivilegesRequired stays at the per-user default so a plain double-click install never elevates by default', () => {
  const content = readIss()
  const m = content.match(/^PrivilegesRequired=(\S+)\s*$/m)
  assert.ok(m, 'expected a PrivilegesRequired directive in [Setup]')
  assert.equal(
    m[1].toLowerCase(),
    'lowest',
    'PrivilegesRequired must stay "lowest" -- the per-user, no-UAC-prompt install path every current user has is the declared default; ' +
      'only PrivilegesRequiredOverridesAllowed above should let a user opt into elevation',
  )
})

test('the installer embeds the exact source commit in PE version information for local artifact provenance', () => {
  const content = readIss()
  const buildScript = readFileSync(path.join(REPO_ROOT, 'scripts', 'build_windows.ps1'), 'utf8')
  assert.match(content, /#if GetEnv\("GIT_COMMIT"\)/)
  assert.match(content, /VersionInfoDescription=Material Ollama build \{#MyAppCommit\}/)
  assert.match(buildScript, /SOURCE_COMMIT\s*=\s*\(\(git rev-parse HEAD/)
  assert.match(buildScript, /GIT_COMMIT = \$script:SOURCE_COMMIT/)
})

test('the installer embeds pinned x64 and ARM64 WebView2 standalone payloads and verifies them before launch', () => {
  const content = readIss()
  const manifest = JSON.parse(readJsonFile(path.join(REPO_ROOT, 'scripts', 'release-dependencies.json'), 'utf8'))
  assert.equal(manifest.webview2.length, 2)
  assert.deepEqual(manifest.webview2.map((item) => item.architecture).sort(), ['arm64', 'x64'])
  for (const item of manifest.webview2) {
    assert.match(item.url, /^https:\/\/msedge\.sf\.dl\.delivery\.mp\.microsoft\.com\//)
    assert.match(item.sha256, /^[0-9a-f]{64}$/i)
    assert.match(content, new RegExp(item.filename.replaceAll('.', '\\.'), 'g'))
    assert.doesNotMatch(content, new RegExp(`Source: .*${item.filename.replaceAll('.', '\\.')}.+Check:`, 'i'))
  }
  assert.match(content, /function HasWebView2Runtime\(\): Boolean/)
  assert.match(content, /function InstallWebView2Runtime\(\): Boolean/)
  assert.match(content, /ExtractTemporaryFile\(ExtractFileName\(InstallerPath\)\)/)
  assert.match(content, /['"]\/silent \/install['"]|['"]\/silent \/install['"]/) // documented standalone switch
  assert.match(content, /not HasWebView2Runtime\(\).*InstallWebView2Runtime/s)
  assert.match(content, /EdgeUpdate\\ClientState/)
  assert.match(content, /'EBWebView'/)
  assert.match(content, /WOW6432Node/)
  assert.match(content, /EmbeddedBrowserWebView\.dll/)
  assert.match(content, /Architecture := 'arm64'/)
  assert.match(content, /Architecture := 'x64'/)
})

test('universal packaging fails closed instead of silently falling back or omitting an architecture', () => {
  const content = readIss()
  const buildScript = readFileSync(path.join(REPO_ROOT, 'scripts', 'build_windows.ps1'), 'utf8')
  assert.doesNotMatch(content, /#if FileExists\("\.\.\\dist\\windows-ollama-app-amd64\.exe"\)/)
  assert.doesNotMatch(content, /windows-ollama-app-amd64\.exe"; DestDir: "\{app\}"; DestName: "\{#MyAppExeName\}" ;Check: IsArm64/)
  assert.match(buildScript, /function ValidateUniversalWindowsPayload/)
  assert.match(buildScript, /windows-ollama-app-arm64\.exe/)
  assert.match(buildScript, /windows-arm64\\ollama\.exe/)
  assert.match(buildScript, /llama-server\.exe/)
  assert.match(buildScript, /arm64CCPath = if \(\$script:LLVM_MINGW_BIN\)/)
  assert.match(buildScript, /cmake --fresh -S llama\\server --preset cpu_arm64/)
  assert.match(buildScript, /-DCMAKE_C_COMPILER=\$verifiedArm64CC/)
  assert.match(buildScript, /-DCMAKE_CXX_COMPILER=\$verifiedArm64CXX/)
  assert.match(buildScript, /-DHOST_CXX_COMPILER=\$verifiedHostCXX/)
  assert.doesNotMatch(
    buildScript.replace('cmake --fresh -S llama\\server --preset cpu_arm64', 'cmake -S llama\\server --preset cpu_arm64'),
    /cmake --fresh -S llama\\server --preset cpu_arm64/,
    'removing the fresh verified ARM64 configure path must turn this check red',
  )
  assert.match(buildScript, /vcruntime140\.dll/)
  assert.match(buildScript, /libgcc_s_seh-1\.dll/)
  assert.match(buildScript, /throw "Universal Windows installer payload is missing/)
  const normalizedBuildScript = buildScript.replaceAll('\r\n', '\n')
  const validationBeforeBuild = /ValidateUniversalWindowsPayload\n\s+Write-Output "Building Ollama Installer"/
  assert.match(normalizedBuildScript, validationBeforeBuild)
  assert.doesNotMatch(
    normalizedBuildScript.replace(/^\s*ValidateUniversalWindowsPayload\s*$/m, ''),
    validationBeforeBuild,
    'removing the fail-closed payload validation must turn this ordering check red',
  )
})

function activeWebViewRuntimeBody(content) {
  const declaration = content.indexOf('function HasWebView2Runtime(): Boolean;')
  const start = content.indexOf('function HasWebView2Runtime(): Boolean;', declaration + 1)
  const end = content.indexOf('function InstallWebView2Runtime(): Boolean;', start)
  assert.ok(start >= 0 && end > start, 'expected the complete HasWebView2Runtime function body')
  return content.slice(start, end).split(/\r?\n/).filter((line) => {
    const trimmed = line.trim()
    return trimmed !== '' && !trimmed.startsWith('//') && !trimmed.startsWith(';') && !trimmed.startsWith('{') && !trimmed.startsWith('*')
  }).join('\n')
}

function assertWebViewRuntimeSource(content) {
  const body = activeWebViewRuntimeBody(content)
  assert.match(body, /for RootIndex := 0 to 1 do begin/)
  assert.match(body, /for KeyIndex := 0 to 1 do begin/)
  assert.match(body, /RegQueryStringValue\(Roots\[RootIndex\], ClientKeys\[KeyIndex\], 'pv', ClientVersion\)/)
  assert.match(body, /RegQueryStringValue\(Roots\[RootIndex\], StateKeys\[KeyIndex\], 'EBWebView', ClientPath\)/)
  assert.match(body, /VersionAtLeast\(ClientVersion, WebView2MinimumVersion\)/)
  assert.match(body, /VersionAtLeast\(StateVersion, WebView2MinimumVersion\)/)
  assert.match(body, /FileExists\(AddBackslash\(ClientPath\) \+ 'EBWebView\\' \+ Architecture \+ '\\EmbeddedBrowserWebView\.dll'\)/)
  assert.match(body, /Roots\[RootIndex\]/)
  assert.match(body, /RootIndex = 1\) and \(KeyIndex = 0\)/)
}

function versionAtLeast(value, minimum) {
  const actual = String(value).split('.').map((part) => Number.parseInt(part, 10))
  const required = String(minimum).split('.').map((part) => Number.parseInt(part, 10))
  if (actual.some((part) => Number.isNaN(part))) return false
  for (let index = 0; index < required.length; index += 1) {
    const left = actual[index] || 0
    const right = required[index] || 0
    if (left !== right) return left > right
  }
  return true
}

function acceptsWebViewFixture(fixture) {
  const expectedSuffix = `EBWebView\\${fixture.architecture}\\EmbeddedBrowserWebView.dll`
  return versionAtLeast(fixture.clientsPv, '151.0.4129.101') &&
    versionAtLeast(fixture.stateVersion, '151.0.4129.101') &&
    fixture.stateDllPath.endsWith(expectedSuffix) &&
    fixture.dllExists === true
}

test('WebView2 acceptance requires both registry records and the loader-compatible architecture path', () => {
  const content = readIss()
  assertWebViewRuntimeSource(content)
  const valid = {
    clientsPv: '151.0.4129.101',
    stateVersion: '151.0.4129.101',
    stateDllPath: 'C:\\Program Files (x86)\\Microsoft\\EdgeWebView\\Application\\151.0.4129.101\\EBWebView\\x64\\EmbeddedBrowserWebView.dll',
    architecture: 'x64',
    dllExists: true,
  }
  assert.equal(acceptsWebViewFixture(valid), true)
  const invalidCases = [
    ['missing EBWebView segment', { ...valid, stateDllPath: valid.stateDllPath.replace('EBWebView\\', '') }],
    ['missing Clients pv', { ...valid, clientsPv: '' }],
    ['malformed Clients pv', { ...valid, clientsPv: 'runtime' }],
    ['old Clients pv', { ...valid, clientsPv: '130.0.2849.46' }],
    ['missing ClientState version', { ...valid, stateVersion: '' }],
    ['malformed ClientState version', { ...valid, stateVersion: 'runtime' }],
    ['old ClientState version', { ...valid, stateVersion: '130.0.2849.46' }],
    ['wrong architecture', { ...valid, architecture: 'arm64' }],
    ['missing architecture DLL', { ...valid, dllExists: false }],
  ]
  for (const [label, fixture] of invalidCases) assert.equal(acceptsWebViewFixture(fixture), false, label)
})

test('WebView2 source contract rejects commented-out and renamed registry calls', () => {
  const content = readIss()
  const mutations = [
    ['commented ClientState call', "RegQueryStringValue(Roots[RootIndex], StateKeys[KeyIndex], 'EBWebView', ClientPath)", "// RegQueryStringValue(Roots[RootIndex], StateKeys[KeyIndex], 'EBWebView', ClientPath)"],
    ['renamed StateKeys call', "RegQueryStringValue(Roots[RootIndex], StateKeys[KeyIndex], 'EBWebView', ClientPath)", "RegQueryStringValue(Roots[RootIndex], StateKeysRenamed[KeyIndex], 'EBWebView', ClientPath)"],
    ['renamed EBWebView value', "'EBWebView', ClientPath", "'EBWebViewRenamed', ClientPath"],
    ['removed architecture segment', String.raw`'EBWebView\' + Architecture`, "'' + Architecture"],
  ]
  for (const [label, needle, replacement] of mutations) {
    const mutated = content.replace(needle, replacement)
    assert.notEqual(mutated, content, `${label} mutation must change the fixture`)
    assert.throws(() => assertWebViewRuntimeSource(mutated), /./, label)
  }
})
