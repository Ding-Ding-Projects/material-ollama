#!/usr/bin/env node
// Source-level contract checks for the build/deploy-only GitHub Pages workflow.
// These exact assertions are intentionally narrow: changing the runner,
// permissions, action major, trigger, or adding a test/lint step makes the
// contract red until the original is restored.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import assert from 'node:assert/strict'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const WORKFLOW_PATH = path.join(REPO_ROOT, '.github', 'workflows', 'pages.yaml')

test('Pages workflow is public-source build/deploy only', () => {
  const workflow = readFileSync(WORKFLOW_PATH, 'utf8')
  assert.match(workflow, /^name:\s+GitHub Pages\s*$/m)
  assert.match(workflow, /^\s+push:\s*$/m)
  assert.match(workflow, /^\s+workflow_dispatch:\s*$/m)
  assert.match(workflow, /^\s+branches:\s*\n\s+- main\s*$/m)
  assert.match(workflow, /^\s+contents:\s+read\s*$/m)
  assert.match(workflow, /^\s+pages:\s+write\s*$/m)
  assert.match(workflow, /^\s+id-token:\s+write\s*$/m)
  assert.match(workflow, /^\s+group:\s+pages-\$\{\{ github\.workflow \}\}-\$\{\{ github\.ref \}\}\s*$/m)
  assert.match(workflow, /^\s+cancel-in-progress:\s+true\s*$/m)
  assert.match(workflow, /^\s+runs-on:\s+windows-2025\s*$/m)
  assert.match(workflow, /actions\/configure-pages@v6/)
  assert.match(workflow, /actions\/upload-pages-artifact@v5/)
  assert.match(workflow, /actions\/deploy-pages@v5/)
  assert.match(workflow, /^\s+path:\s+docs\/landing-site\s*$/m)
  assert.doesNotMatch(workflow, /\b(?:npm\s+(?:run\s+)?(?:test|lint)|(?:vitest|jest|pytest|go\s+test|eslint|tsc))\b/i)
})
