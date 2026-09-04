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
    runners: ['windows-2022'],
    needs: { windows: [] },
    collectorCount: 1,
    receipts: ['build-receipt-windows-${{ matrix.preset }}.txt'],
    uploads: [
      {
        name: 'build-only-windows-${{ matrix.preset }}',
        paths: ['${{ matrix.superbuild_dir }}\\lib\\ollama\\**', 'ollama.exe', 'build-receipt-windows-${{ matrix.preset }}.txt'],
      },
    ],
  }),
  Object.freeze({
    relativePath: '.github/workflows/test-llamacpp-update.yaml',
    name: 'llamacpp-build-only',
    jobs: ['setup-environment', 'windows-depends', 'windows-build', 'windows-package'],
    runners: [
      'windows-2022',
      'windows-2022',
      'windows-2022',
      'windows-2022',
    ],
    needs: {
      'setup-environment': [],
      'windows-depends': ['setup-environment'],
      'windows-build': ['setup-environment'],
      'windows-package': ['setup-environment', 'windows-build', 'windows-depends'],
    },
    collectorCount: 3,
    receipts: [
      'dist\\build-receipt-windows-depends-${{ matrix.preset }}.txt',
      'dist\\build-receipt-windows-build.txt',
      'dist/build-receipt-windows-package.txt',
    ],
    uploads: [
      {
        name: 'depends-${{ matrix.os }}-${{ matrix.arch }}-${{ matrix.preset }}',
        paths: ['dist\\windows-amd64\\**', 'dist\\windows-arm64\\**', 'dist\\build-receipt-windows-depends-${{ matrix.preset }}.txt'],
      },
      {
        name: 'build-windows-amd64',
        paths: ['dist\\windows-amd64\\**', 'dist\\windows-arm64\\**', 'dist\\windows-ollama-app-amd64.exe', 'dist\\windows-ollama-app-arm64.exe', 'dist\\build-receipt-windows-build.txt'],
      },
      { name: 'ollama-windows-amd64.zip', paths: ['dist/ollama-windows-amd64.zip', 'dist/build-receipt-windows-package.txt'] },
      { name: 'ollama-windows-arm64.zip', paths: ['dist/ollama-windows-arm64.zip', 'dist/build-receipt-windows-package.txt'] },
      { name: 'ollama-windows-amd64-rocm.zip', paths: ['dist/ollama-windows-amd64-rocm.zip', 'dist/build-receipt-windows-package.txt'] },
      { name: 'OllamaSetup.exe', paths: ['dist/OllamaSetup.exe', 'dist/build-receipt-windows-package.txt'] },
      { name: 'install.ps1', paths: ['dist/install.ps1', 'dist/build-receipt-windows-package.txt'] },
    ],
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

function parseNeedsByJob(workflow) {
  const lines = workflow.slice(workflow.indexOf('\njobs:') + '\njobs:'.length).split(/\r?\n/)
  const needs = {}
  let currentJob = null
  for (const line of lines) {
    const job = /^  ([A-Za-z0-9_-]+):\s*$/.exec(line)
    if (job) {
      currentJob = job[1]
      needs[currentJob] = []
      continue
    }
    if (!currentJob) continue
    const edge = /^    needs:\s*(?:\[([^\]]*)\]|([A-Za-z0-9_-]+))/.exec(line)
    if (!edge) continue
    const list = edge[1] ?? edge[2]
    needs[currentJob] = list.split(',').map((value) => value.trim()).filter(Boolean)
  }
  return needs
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
  const actual = uploads.map((upload) => {
    const name = /^\s+name:\s+(.+)$/m.exec(upload.lines.join('\n'))
    assert.ok(name, `${expected.relativePath} upload is missing its exact name`)
    const lines = upload.lines
    const pathLine = lines.findIndex((line) => /^\s+path:\s*/.test(line))
    assert.notEqual(pathLine, -1, `${expected.relativePath} upload is missing its exact path`)
    const pathMatch = /^\s+path:\s*(.*)$/.exec(lines[pathLine])
    const pathIndent = lines[pathLine].match(/^\s*/)[0].length
    const paths = []
    if (pathMatch[1] && pathMatch[1] !== '|') paths.push(pathMatch[1].trim())
    for (let i = pathLine + 1; i < lines.length; i += 1) {
      if (!lines[i].trim()) continue
      const indent = lines[i].match(/^\s*/)[0].length
      if (indent <= pathIndent) break
      paths.push(lines[i].trim())
    }
    return { name: name[1].trim(), paths }
  })
  assert.deepEqual(actual, expected.uploads, `${expected.relativePath} upload inventory changed`)
  for (const upload of uploads) {
    const block = upload.lines.join('\n')
    assert.match(block, /^(?:      - if|        if):\s+\$\{\{\s*always\(\)\s*\}\}\s*$/m, `${expected.relativePath} uploads must run after earlier failure`)
    assert.match(block, /^        continue-on-error:\s+true\s*$/m, `${expected.relativePath} uploads must not mask the original failure`)
    assert.match(block, /^          if-no-files-found:\s+warn\s*$/m, `${expected.relativePath} uploads must warn when output is absent`)
    const retention = /^          retention-days:\s+(\d+)\s*$/m.exec(block)
    assert.ok(retention, `${expected.relativePath} uploads must have bounded retention`)
    assert.ok(Number(retention[1]) >= 1 && Number(retention[1]) <= 30, `${expected.relativePath} upload retention must be bounded`)
  }
}

function assertReceiptContract(workflow, expected) {
  const collectors = workflow.split(/(?=^      - )/m)
    .filter((step) => /^      - name: Collect Windows .* receipt\s*$/m.test(step))
  assert.equal(collectors.length, expected.collectorCount, `${expected.relativePath} receipt collector inventory changed`)
  for (const collector of collectors) {
    assert.match(collector, /^        if:\s+\$\{\{\s*always\(\)\s*\}\}\s*$/m, `${expected.relativePath} receipt collector must run after earlier failure`)
    assert.match(collector, /^        continue-on-error:\s+true\s*$/m, `${expected.relativePath} receipt collector must not mask the original failure`)
  }
  for (const receipt of expected.receipts) {
    const occurrences = workflow.split(receipt).length - 1
    assert.ok(occurrences >= 2, `${expected.relativePath} receipt path must be written and uploaded: ${receipt}`)
  }
  for (const field of [
    /"run_id=\$\{\{ github\.run_id \}\}"/,
    /"commit=\$\{\{ github\.sha \}\}"/,
    /"job=\$env:GITHUB_JOB"/,
    /"status=\$\{\{ job\.status \}\}"/,
    /"os=windows"/,
    /"arch=\$\{\{ runner\.arch \}\}"/,
    /"runner=\$\{\{ runner\.name \}\}"/,
    /"timestamp=\$\(\[DateTimeOffset\]::UtcNow\.ToString\('o'\)\)"/,
  ]) {
    assert.match(workflow, field, `${expected.relativePath} receipt is missing a required safe field`)
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
  const runners = [...workflow.matchAll(/^\s+runs-on:\s+(.+)$/gm)].map((match) => match[1].trim())
  assert.deepEqual(runners, expected.runners, `${expected.relativePath} runs-on inventory changed`)
  for (const os of extractMatrixOsValues(workflow)) {
    assert.equal(os, 'windows', `${expected.relativePath} matrix.os must remain Windows-only`)
  }
  for (const jobId of DISALLOWED_JOB_IDS) {
    assert.equal(jobs.includes(jobId), false, `${expected.relativePath} must not reintroduce quality job ${jobId}`)
  }

  for (const pattern of DISALLOWED_COMMANDS) {
    assert.doesNotMatch(workflow, pattern, `${expected.relativePath} contains a disallowed quality command or action`)
  }

  const actualNeeds = parseNeedsByJob(workflow)
  assert.deepEqual(Object.keys(actualNeeds), expected.jobs, `${expected.relativePath} needs job inventory changed`)
  for (const jobId of expected.jobs) {
    assert.deepEqual(actualNeeds[jobId], expected.needs[jobId], `${expected.relativePath} needs inventory changed for ${jobId}`)
    for (const reference of actualNeeds[jobId]) {
      assert.equal(DISALLOWED_JOB_IDS.includes(reference), false, `${expected.relativePath} has a quality-gate needs dependency on ${reference}`)
    }
  }

  assertUploadContract(workflow, expected)
  assertReceiptContract(workflow, expected)
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
    const uploadIndex = entry.uploads.length - 1
    for (const field of fields) {
      expectPolicyFailure(mutateUploadBlock(base, uploadIndex, (block) => block.replace(field, '')), entry)
    }
  }
})

test('removing a receipt collector or receipt path turns failure-evidence policy red', () => {
  for (const entry of WORKFLOW_INVENTORY) {
    const base = readWorkflow(entry.relativePath)
    expectPolicyFailure(base.replace(/^      - name: Collect Windows .* receipt\r?\n/m, '      - name: Removed receipt collector\n'), entry)
    expectPolicyFailure(mutateUploadBlock(base, entry.uploads.length - 1, (block) => block.replace(/\r?\n\s*[^\r\n]*build-receipt[^\r\n]*/m, '')), entry)
  }
})

test('unsafe upload path shapes turn the exact path inventory red', () => {
  const entry = WORKFLOW_INVENTORY[0]
  const base = readWorkflow(entry.relativePath)
  for (const unsafePath of ['.', '**/*', './', 'src', 'node_modules', 'cache', 'credentials', 'secrets']) {
    expectPolicyFailure(mutateUploadBlock(base, 0, (block) => block.replace(/^(            ).*$/m, (_, indent) => `${indent}${unsafePath}`)), entry)
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
  expectPolicyFailure(matrixBase.replace(/runs-on: windows-2022/, 'runs-on: windows'), matrixEntry)
  expectPolicyFailure(readWorkflow(WORKFLOW_INVENTORY[0].relativePath).replace(/runs-on: windows/, 'runs-on: [self-hosted, linux]'), WORKFLOW_INVENTORY[0])
})

test('adding a quality job to a needs chain turns the policy red', () => {
  const entry = WORKFLOW_INVENTORY[0]
  const base = readWorkflow(entry.relativePath)
  expectPolicyFailure(base.replace(/^  windows:\r?\n/m, '  windows:\n    needs: [test]\n'), entry)
})

test('referencing an unknown job in needs turns the workflow graph policy red', () => {
  const entry = WORKFLOW_INVENTORY[1]
  const base = readWorkflow(entry.relativePath)
  expectPolicyFailure(base.replace(/^    needs: setup-environment\r?\n/m, '    needs: [missing-job]\n'), entry)
})

test('each receipt collector retains its failure collection flags', () => {
  for (const entry of WORKFLOW_INVENTORY) {
    const base = readWorkflow(entry.relativePath)
    const steps = base.split(/(?=^      - )/m)
    for (let index = 0; index < steps.length; index += 1) {
      if (!/^      - name: Collect Windows .* receipt\s*$/m.test(steps[index])) continue
      for (const field of [/^        if:.*\r?\n/m, /^        continue-on-error:.*\r?\n/m]) {
        const changed = steps[index].replace(field, '')
        assert.notEqual(changed, steps[index], 'collector mutation must change the intended step')
        const mutated = [...steps]
        mutated[index] = changed
        expectPolicyFailure(mutated.join(''), entry)
      }
    }
  }
})

test('removing or substituting a required needs edge turns the graph policy red', () => {
  const entry = WORKFLOW_INVENTORY[1]
  const base = readWorkflow(entry.relativePath)
  expectPolicyFailure(base.replace(/^    needs: \[setup-environment, windows-build, windows-depends\]\r?\n/m, ''), entry)
  expectPolicyFailure(base.replace(/^    needs: \[setup-environment, windows-build, windows-depends\]\r?\n/m, '    needs: [setup-environment, windows-build, setup-environment]\n'), entry)
})
