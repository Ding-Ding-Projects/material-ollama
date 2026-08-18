#!/usr/bin/env node

import { execFile, execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const args = new Set(process.argv.slice(2))
const format = process.argv.includes('--format')
  ? process.argv[process.argv.indexOf('--format') + 1]
  : 'markdown'

if (!['markdown', 'json'].includes(format)) {
  console.error('count-lines: --format must be markdown or json')
  process.exit(2)
}

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)

const excluded = [
  /(^|\\|\/)node_modules(\\|\/)/,
  /(^|\\|\/)vendor(\\|\/)/,
  /(^|\\|\/)dist(\\|\/)/,
  /(^|\\|\/)build(\\|\/)/,
  /(^|\\|\/)\.git(\\|\/)/,
  /(^|\\|\/)llama[\\/]llama\.cpp(\\|\/)/,
  /(^|\\|\/)ml[\\/]backend[\\/]ggml[\\/]ggml(\\|\/)/,
  /(^|\\|\/)package-lock\.json$/,
  /(^|\\|\/)pnpm-lock\.yaml$/,
  /(^|\\|\/)yarn\.lock$/,
  /(^|\\|\/)Cargo\.lock$/,
  /(^|\\|\/)go\.sum$/,
]

const sourceExtensions = new Set([
  '.c', '.cc', '.cpp', '.cxx', '.go', '.h', '.hh', '.hpp', '.m', '.mm',
  '.java', '.js', '.jsx', '.mjs', '.py', '.ps1', '.rs', '.sh', '.swift',
  '.ts', '.tsx', '.vue',
])
const markupExtensions = new Set([
  '.css', '.html', '.htm', '.less', '.md', '.mdx', '.sass', '.scss', '.svg',
  '.xml', '.xhtml', '.yaml', '.yml',
])

const totals = {
  source: { files: 0, total: 0, nonBlank: 0 },
  tests: { files: 0, total: 0, nonBlank: 0 },
  'styles/markup': { files: 0, total: 0, nonBlank: 0 },
  generated: { files: 0, total: 0, nonBlank: 0 },
  other: { files: 0, total: 0, nonBlank: 0 },
}

const isTest = (file) => /(^|[._-])(test|spec)([._-]|$)|(^|[\\/])tests?([\\/]|$)|_test\./i.test(file)
const isGenerated = (file) => /(^|[\\/])generated([\\/]|$)|\.generated\./i.test(file)

const includedFiles = []
for (const file of files) {
  if (!existsSync(file)) continue
  if (excluded.some((pattern) => pattern.test(file))) continue
  const extension = path.extname(file).toLowerCase()
  let category = 'other'
  if (isGenerated(file)) category = 'generated'
  else if (isTest(file)) category = 'tests'
  else if (sourceExtensions.has(extension)) category = 'source'
  else if (markupExtensions.has(extension)) category = 'styles/markup'
  else continue

  let content
  try {
    content = readFileSync(file, 'utf8')
  } catch (error) {
    console.error(`count-lines: unable to read ${file}: ${error.message}`)
    process.exit(1)
  }
  const lines = content.length === 0 ? [] : content.split(/\r\n|\n|\r/)
  if (lines.at(-1) === '') lines.pop()
  const item = {
    file,
    category,
    files: 1,
    total: lines.length,
    nonBlank: lines.filter((line) => line.trim().length > 0).length,
  }
  includedFiles.push(item)
  totals[category].files += 1
  totals[category].total += item.total
  totals[category].nonBlank += item.nonBlank
}

const all = Object.values(totals).reduce((sum, item) => ({
  files: sum.files + item.files,
  total: sum.total + item.total,
  nonBlank: sum.nonBlank + item.nonBlank,
}), { files: 0, total: 0, nonBlank: 0 })

async function countAttribution() {
  const attribution = { agent: 0, other: 0, unknown: 0 }
  const queue = includedFiles.slice()
  const worker = async () => {
    while (queue.length > 0) {
      const item = queue.pop()
      if (!item) return
      try {
        const { stdout } = await execFileAsync('git', ['blame', '--line-porcelain', '--', item.file], {
          encoding: 'utf8',
          maxBuffer: 64 * 1024 * 1024,
        })
        let author = ''
        let remaining = 0
        for (const line of stdout.split(/\r\n|\n|\r/)) {
          const header = line.match(/^[0-9a-f]{40} \d+ \d+(?: (\d+))?$/)
          if (header) {
            remaining = Number(header[1] || 1)
            author = ''
          } else if (line.startsWith('author ')) {
            author = line.slice('author '.length).toLowerCase()
          } else if (remaining > 0 && (line.startsWith(' ') || line.startsWith('\t'))) {
            if (/agent|bot|automation|codex|claude|gpt/.test(author)) attribution.agent += 1
            else attribution.other += 1
            remaining -= 1
          }
        }
      } catch {
        attribution.unknown += item.total
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(8, includedFiles.length) }, worker))
  return attribution
}

const attribution = args.has('--skip-attribution')
  ? { agent: 0, other: 0, unknown: 0 }
  : await countAttribution()

const result = {
  schemaVersion: 1,
  excluded: 'Vendored sources, third-party trees, dependency directories, generated build output, and lockfiles are excluded.',
  categories: totals,
  total: all,
  attribution,
}

if (format === 'json') {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
} else {
  const rows = Object.entries(totals)
    .map(([name, value]) => `| ${name} | ${value.files} | ${value.total} | ${value.nonBlank} |`)
    .join('\n')
  process.stdout.write([
    '| Category | Files | Total lines | Non-blank lines |',
    '| --- | ---: | ---: | ---: |',
    rows,
    `| **Grand total** | **${all.files}** | **${all.total}** | **${all.nonBlank}** |`,
    '',
    `Agent-attributed surviving lines: ${attribution.agent}`,
    `Other-attributed surviving lines: ${attribution.other}`,
    `Unknown-attribution lines: ${attribution.unknown}`,
    '',
    result.excluded,
    '',
  ].join('\n'))
}
