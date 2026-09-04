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
    uploadCount: 1,
  }),
  Object.freeze({
    relativePath: '.github/workflows/test-llamacpp-update.yaml',
    name: 'llamacpp-build-only',
    jobs: ['setup-environment', 'windows-depends', 'windows-build', 'windows-package'],
    uploadCount: 7,
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

function extractUploadBlocks(workflow) {
  const lines = workflow.split(/\r?\n/)
  const blocks = []
  for (let start = 0; start < lines.length; start += 1) {
    if (!/^      - /.test(lines[start])) continue
    let end = start + 1
    while (end < lines.length && !/^      - /.test(lines[end])) end += 1
    if (lines.slice(start, end).some((line) => /uses:\s*actions\/upload-artifact@/i.test(line))) {
      blocks.push({ start, end, lines: lines.slice(start, end) })
    }
    start = end - 1
  }
  return blocks
}

function assertUploadContract(workflow, expected) {
  const uploads = extractUploadBlocks(workflow)
  assert.equal(uploads.length, expected.uploadCount, `${expected.relativePath} upload inventory changed`)
  for (const upload of uploads) {
    const block = upload.lines.join('\n')
    assert.match(block, /^(?:      - if|        if):\s+\$\{\{\s*always\(\)\s*\}\}\s*$/m, `${expected.relativePath} uploads must run after earlier failure`)
    assert.match(block, /^        continue-on-error:\s+true\s*$/m, `${expected.relativePath} uploads must not mask the original failure`)
    assert.match(block, /^          if-no-files-found:\s+warn\s*$/m, `${expected.relativePath} uploads must warn when output is absent`)
    const retention = /^          retention-days:\s+(\d+)\s*$/m.exec(block)
    assert.ok(retention, `${expected.relativePath} uploads must have bounded retention`)
    assert.ok(Number(retention[1]) >= 1 && Number(retention[1]) <= 30, `${expected.relativePath} upload retention must be bounded`)
    assert.doesNotMatch(block, /(?:^|[\\/])(?:\.git|node_modules|credentials?|secrets?|cache|src)(?:[\\/]|$)/im, `${expected.relativePath} uploads must exclude source, caches, credentials, and See Futs`)
  }
}

function mutateUploadBlock(workflow, index, mutation) {
  const lines = workflow.split(/\r?\n/)
  const uploads = extractUploadBlocks(workflow)
  assert.ok(uploads[index], `upload ${index} must exist for mutation coverage`)
  const upload = uploads[index]
  const block = mutation(upload.lines.join('\n'))
  return [...lines.slice(0, upload.start), ...block.split('\n'), ...lines.slice(upload.end)].join('\n')
}

function extractMatrixOsValues(workflow) {
  const values = []
  for (const match of workflow.matchAll(/^\s+os:\s*(?:\[([^\]]*)\]|([A-Za-z0-9_-]+))\s*$/gm)) {
    const list = match[1] ?? match[2]
    values.push(...list.split(',').map((value) => value.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean))
  }
  return values
}

function assertBuildOnlyWorkflow(workflow, expected) {
  assert.match(workflow, /^concurrency:\s*$/m, `${expected.relativePath} must cancel superseded builds`)
  assert.match(workflow, /^  group:\s+\$\{\{ github\.workflow \}\}-\$\{\{ github\.ref \}\}\s*$/m, `${expected.relativePath} must scope concurrency by workflow and ref`)
  assert.match(workflow, /^  cancel-in-progress:\s+true\s*$/m, `${expected.relativePath} must cancel superseded builds`)
  assert.match(workflow, /^  push:\s*$/m, `${expected.relativePath} must run on push`)
  assert.match(workflow, /^  workflow_dispatch:\s*$/m, `${expected.relativePath} must support manual dispatch`)
  assert.doesNotMatch(workflow, /^  pull_request:\s*$/m, `${expected.relativePath} must not target a self-hosted runner from pull_request`)
  assert.doesNotMatch(workflow, /^    paths:\s*$/m, `${expected.relativePath} push must not be path-filtered`)
  assert.match(workflow, new RegExp(`^name:\\s+${expected.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm'))

  const jobs = extractJobIds(workflow)
  assert.deepEqual(jobs, expected.jobs, `${expected.relativePath} job inventory changed`)
  assert.doesNotMatch(workflow, /^\s+runs-on:\s+(?:ubuntu|macos|linux)/im, `${expected.relativePath} must not run non-Windows jobs`)
  for (const os of extractMatrixOsValues(workflow)) {
    assert.equal(os, 'windows', `${expected.relativePath} matrix.os must remain Windows-only`)
  }
  for (const jobId of DISALLOWED_JOB_IDS) {
    assert.equal(jobs.includes(jobId), false, `${expected.relativePath} must not reintroduce quality job ${jobId}`)
  }

  for (const pattern of DISALLOWED_COMMANDS) {
    assert.doesNotMatch(workflow, pattern, `${expected.relativePath} contains a disallowed quality command or action`)
  }

  for (const reference of parseNeeds(workflow)) {
    assert.equal(expected.jobs.includes(reference), true, `${expected.relativePath} needs unknown job ${reference}`)
    assert.equal(DISALLOWED_JOB_IDS.includes(reference), false, `${expected.relativePath} has a quality-gate needs dependency on ${reference}`)
  }

  assertUploadContract(workflow, expected)
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

test('reintroducing a pull_request trigger turns the self-hosted runner policy red', () => {
  for (const entry of WORKFLOW_INVENTORY) {
    const base = readWorkflow(entry.relativePath)
    expectPolicyFailure(base.replace(/^  push:\r?\n/m, '  push:\n  pull_request:\n'), entry)
  }
})

test('adding push path filters turns the every-push policy red', () => {
  const entry = WORKFLOW_INVENTORY[0]
  const base = readWorkflow(entry.relativePath)
  expectPolicyFailure(base.replace(/^  push:\r?\n/m, "  push:\n    paths:\n      - '**/*'\n"), entry)
})

test('removing each required upload field turns failure-evidence policy red', () => {
  const fields = [
    /^(?:      - if|        if):.*\n/m,
    /^        continue-on-error:.*\n/m,
    /^          if-no-files-found:.*\n/m,
    /^          retention-days:.*\n/m,
  ]
  for (const entry of WORKFLOW_INVENTORY) {
    const base = readWorkflow(entry.relativePath)
    const uploadIndex = entry.uploadCount - 1
    for (const field of fields) {
      expectPolicyFailure(mutateUploadBlock(base, uploadIndex, (block) => block.replace(field, '')), entry)
    }
  }
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

test('changing a direct or matrix runner to non-Windows turns the policy red', () => {
  for (const entry of WORKFLOW_INVENTORY) {
    const base = readWorkflow(entry.relativePath)
    expectPolicyFailure(base.replace(/runs-on: windows/, 'runs-on: ubuntu-latest'), entry)
  }

  const matrixEntry = WORKFLOW_INVENTORY[1]
  const matrixBase = readWorkflow(matrixEntry.relativePath)
  expectPolicyFailure(matrixBase.replace(/os: \[windows\]/, 'os: [linux]'), matrixEntry)
})

test('adding a quality job to a needs chain turns the policy red', () => {
  const entry = WORKFLOW_INVENTORY[0]
  const base = readWorkflow(entry.relativePath)
  expectPolicyFailure(base.replace(/^  windows:\r?\n/m, '  windows:\n    needs: [test]\n'), entry)
})

test('referencing an unknown job in needs turns the workflow graph policy red', () => {
  const entry = WORKFLOW_INVENTORY[1]
  const base = readWorkflow(entry.relativePath)
  expectPolicyFailure(base.replace(/^  windows-depends:\r?\n/m, '  windows-depends:\n    needs: [missing-job]\n'), entry)
})
