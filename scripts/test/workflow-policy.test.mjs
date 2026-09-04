import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..')

const WORKFLOW_INVENTORY = Object.freeze([
  Object.freeze({
    relativePath: '.github/workflows/test.yaml',
    name: 'build-only',
    jobs: ['windows'],
  }),
  Object.freeze({
    relativePath: '.github/workflows/test-llamacpp-update.yaml',
    name: 'llamacpp-build-only',
    jobs: ['setup-environment', 'windows-depends', 'windows-build', 'windows-package'],
  }),
])

const DISALLOWED_JOB_IDS = Object.freeze([
  'test',
  'race',
  'lint',
  'typecheck',
  'type_check',
  'static-analysis',
  'static_analysis',
  'coverage',
  'accessibility',
  'screenshots',
  'quality',
  'quality-gate',
  'quality_gate',
  'go_mod_tidy',
])

const DISALLOWED_COMMANDS = Object.freeze([
  /\bnpm\s+(?:run\s+)?(?:test|lint|typecheck|type-check|coverage)\b/i,
  /\b(?:go\s+test|cargo\s+test|dotnet\s+test|pytest|vitest|jest|eslint|tsc)\b/i,
  /golangci\/golangci-lint-action@/i,
])

function readWorkflow(relativePath) {
  return readFileSync(path.join(REPO_ROOT, relativePath), 'utf8')
}

function extractJobIds(workflow) {
  const jobsMarker = workflow.indexOf('\njobs:')
  assert.notEqual(jobsMarker, -1, 'workflow must declare jobs')
  return workflow
    .slice(jobsMarker + '\njobs:'.length)
    .split(/\r?\n/)
    .flatMap((line) => {
      const match = /^  ([A-Za-z0-9_-]+):\s*$/.exec(line)
      return match ? [match[1]] : []
    })
}

function parseNeeds(workflow) {
  const references = []
  for (const match of workflow.matchAll(/^\s+needs:\s*(?:\[([^\]]*)\]|([A-Za-z0-9_-]+))/gm)) {
    const list = match[1] ?? match[2]
    references.push(...list.split(',').map((value) => value.trim()).filter(Boolean))
  }
  return references
}

function assertBuildOnlyWorkflow(workflow, expected) {
  assert.match(workflow, /^concurrency:\s*$/m, `${expected.relativePath} must cancel superseded builds`)
  assert.match(workflow, /^  group:\s+\$\{\{ github\.workflow \}\}-\$\{\{ github\.ref \}\}\s*$/m, `${expected.relativePath} must scope concurrency by workflow and ref`)
  assert.match(workflow, /^  cancel-in-progress:\s+true\s*$/m, `${expected.relativePath} must cancel superseded builds`)
  assert.match(workflow, /^  push:\s*$/m, `${expected.relativePath} must run on push`)
  assert.match(workflow, /^  workflow_dispatch:\s*$/m, `${expected.relativePath} must support manual dispatch`)
  assert.match(workflow, new RegExp(`^name:\\s+${expected.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm'))

  const jobs = extractJobIds(workflow)
  assert.deepEqual(jobs, expected.jobs, `${expected.relativePath} job inventory changed`)
  assert.doesNotMatch(workflow, /^\s+runs-on:\s+(?:ubuntu|macos|linux)/im, `${expected.relativePath} must not run non-Windows jobs`)
  for (const jobId of DISALLOWED_JOB_IDS) {
    assert.equal(jobs.includes(jobId), false, `${expected.relativePath} must not reintroduce quality job ${jobId}`)
  }

  for (const pattern of DISALLOWED_COMMANDS) {
    assert.doesNotMatch(workflow, pattern, `${expected.relativePath} contains a disallowed quality command or action`)
  }

  for (const reference of parseNeeds(workflow)) {
    assert.equal(DISALLOWED_JOB_IDS.includes(reference), false, `${expected.relativePath} has a quality-gate needs dependency on ${reference}`)
  }
}

function expectPolicyFailure(workflow, expected) {
  assert.throws(() => assertBuildOnlyWorkflow(workflow, expected), assert.AssertionError)
}

test('hand-written workflow inventory covers the build-only workflows exactly', () => {
  assert.deepEqual(WORKFLOW_INVENTORY.map((entry) => entry.relativePath), [
    '.github/workflows/test.yaml',
    '.github/workflows/test-llamacpp-update.yaml',
  ])
  for (const entry of WORKFLOW_INVENTORY) {
    assertBuildOnlyWorkflow(readWorkflow(entry.relativePath), entry)
  }
})

test('removing the push trigger turns the build-only policy red', () => {
  const entry = WORKFLOW_INVENTORY[0]
  const workflow = readWorkflow(entry.relativePath).replace(/^  push:\r?\n(?:    paths:\r?\n(?:      .*\r?\n)*)?/m, '')
  expectPolicyFailure(workflow, entry)
})

test('removing manual dispatch turns the build-only policy red', () => {
  const entry = WORKFLOW_INVENTORY[1]
  const workflow = readWorkflow(entry.relativePath).replace(/^  workflow_dispatch:\r?\n/m, '')
  expectPolicyFailure(workflow, entry)
})

test('reintroducing each disallowed quality command turns the policy red', () => {
  const entry = WORKFLOW_INVENTORY[0]
  const base = readWorkflow(entry.relativePath)
  for (const command of ['npm test', 'go test ./...', 'pytest', 'vitest run', 'eslint .', 'tsc --noEmit', 'cargo test']) {
    expectPolicyFailure(`${base}\n# deliberate regression\nrun: ${command}\n`, entry)
  }
  expectPolicyFailure(`${base}\nuses: golangci/golangci-lint-action@v9\n`, entry)
})

test('reintroducing each disallowed quality job turns the policy red', () => {
  const entry = WORKFLOW_INVENTORY[0]
  const base = readWorkflow(entry.relativePath)
  for (const jobId of DISALLOWED_JOB_IDS) {
    expectPolicyFailure(`${base}\n  ${jobId}:\n    runs-on: ubuntu-latest\n`, entry)
  }
})

test('adding a quality job to a needs chain turns the policy red', () => {
  const entry = WORKFLOW_INVENTORY[0]
  const base = readWorkflow(entry.relativePath)
  expectPolicyFailure(base.replace(/^  windows:\r?\n/m, '  windows:\n    needs: [test]\n'), entry)
})
