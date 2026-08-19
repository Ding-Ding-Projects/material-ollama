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
