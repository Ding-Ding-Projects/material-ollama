import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8').replaceAll('\r\n', '\n')
const build = read('scripts/build_windows.ps1')
const bootstrap = read('scripts/bootstrap_windows_tools.ps1')
const packager = read('scripts/package-squirrel.ps1')
const verifier = read('scripts/verify-squirrel-artifacts.ps1')
const workflow = read('.github/workflows/release.yaml')
const manifest = JSON.parse(read('scripts/release-dependencies.json'))

function assertSquirrelContract({ buildText = build, bootstrapText = bootstrap, packagerText = packager, verifierText = verifier, workflowText = workflow } = {}) {
  const squirrel = manifest.dependencies.find(item => item.name === 'Squirrel.Windows')
  assert.ok(squirrel, 'the dependency lock must declare Squirrel.Windows')
  assert.equal(squirrel.version, '2.0.1')
  assert.equal(squirrel.machine.package, 'squirrel.windows')
  assert.match(squirrel.user.url, /api\.nuget\.org\/v3-flatcontainer\/squirrel\.windows\/2\.0\.1\/squirrel\.windows\.2\.0\.1\.nupkg$/)
  assert.match(squirrel.user.sha256, /^[0-9a-f]{64}$/)
  assert.equal(squirrel.user.relativeExecutable, 'tools/Squirrel.exe')
  assert.match(bootstrapText, /foreach \(\$name in @\('CMake', 'Ninja', 'llvm-mingw', 'Squirrel\.Windows'\)\)/)
  assert.match(buildText, /scripts\\package-squirrel\.ps1/)
  assert.match(buildText, /-SquirrelPath \$script:SQUIRREL_EXE/)
  assert.match(buildText, /^\s*\$script:PKG_VERSION = Get-SquirrelVersion \$script:REPO_ROOT$/m)
  assert.doesNotMatch(buildText, /\$script:PKG_VERSION\s*=\s*\$matches\[1\]/)
  assert.doesNotMatch(buildText, /Inno Setup|ISCC\.exe|ollama\.iss/)
  assert.match(packagerText, /\$packageId = if \(\$Architecture -eq 'x64'\) \{ 'MaterialOllamaX64' \} else \{ 'MaterialOllamaArm64' \}/)
  assert.match(packagerText, /--releasify=/)
  assert.match(packagerText, /--no-msi/)
  assert.match(packagerText, /--no-delta/)
  assert.match(packagerText, /\$entryPoint = 'ollama app\.exe'/)
  assert.doesNotMatch(packagerText, /--signWithParams|signtool\.exe|Inno Setup/)
  assert.match(verifierText, /malformed RELEASES row/)
  assert.match(verifierText, /SHA-1 mismatch/)
  assert.match(verifierText, /unindexed package/)
  assert.match(verifierText, /path traversal/)
  assert.match(verifierText, /NotSigned/)
  assert.match(verifierText, /required package entry/)
  assert.match(verifierText, /source commit/)
  assert.match(workflowText, /verify-squirrel-build\.ps1/)
  assert.doesNotMatch(workflowText, /Inno Setup|InnoSetup|OllamaSetup\.exe/)
}

test('the pinned release dependency and production path use genuine unsigned Squirrel.Windows', () => {
  assertSquirrelContract()
})

// Runtime byte mutations belong to squirrel-byte-verifier.test.mjs. This file
// checks wiring only and cannot establish installer execution or binary safety.
