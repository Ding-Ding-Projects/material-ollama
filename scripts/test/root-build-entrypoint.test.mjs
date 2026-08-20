import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const entrypoint = fs.readFileSync(path.join(root, 'build.bat'), 'utf8').replaceAll('\r\n', '\n')

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
