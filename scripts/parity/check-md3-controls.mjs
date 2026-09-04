#!/usr/bin/env node
/**
 * Fail-closed guard for the "pure Material Design 3, no generic elements" rule.
 *
 * Product chrome must be built from real Material Design 3 primitives with
 * correct component anatomy -- never a raw <button>, <input>, <select> or
 * <textarea> dressed up with classes. This walks the renderer source and
 * refuses any occurrence that is not explicitly recorded below.
 *
 * Two kinds of record, and the difference matters:
 *
 *   exception -- a control that stays. Material has no primitive for it, or a
 *                kit component would lose behaviour the product needs. Each
 *                one carries the reason. These are decisions.
 *
 *   backlog   -- a control that should become a kit primitive and has not yet.
 *                These are debt, counted and visible, and the count may only
 *                go down. A new one fails the run.
 *
 * The list is hand-written on purpose. A guard that only validated the
 * occurrences it discovered would pass on a file that had grown ten more,
 * which is the failure this exists to prevent.
 */

import { readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..')
const srcRoot = path.join(repoRoot, 'app/ui/app/src')

const RAW_CONTROL = /<(button|input|select|textarea)\b/

/** Directories whose contents are not product chrome. */
const SKIP_DIRS = new Set(['md3', 'node_modules', 'assets', 'stories'])

/** Files exempt wholesale, with the reason. */
const EXEMPT_FILES = new Map([
  ['components/ui/display.tsx', 'shadcn-era primitive shim, not rendered by any Material surface'],
])

/**
 * Controls that stay, each with the reason it cannot be a kit primitive.
 * Keyed by "<path>:<tag>" with the count expected in that file.
 */
const EXCEPTIONS = [
  {
    file: 'screens/status/DateRangeFilter.tsx',
    tag: 'input',
    count: 2,
    reason:
      'Native date inputs. The changelog-viewer contract needs BOTH an anchored calendar popover and free typing in the locale format; the kit has no date-picker primitive, and a hand-built calendar would have to reimplement keyboard navigation, locale parsing and the popover. Both wear real Material tokens.',
  },
  {
    file: 'components/ChatForm.tsx',
    tag: 'input',
    count: 1,
    reason:
      'The hidden file input behind the attachment button. There is no file-picker primitive in Material, and the platform control is what opens the OS dialog. It is visually hidden and driven by a real button.',
  },
  {
    file: 'components/ChatForm.tsx',
    tag: 'textarea',
    count: 1,
    reason:
      'The message composer. It autosizes to its content and sends on Enter while allowing Shift+Enter for a newline; the kit TextField is a single-line control and would lose both.',
  },
]

/**
 * Controls that should become kit primitives and have not yet. This number may
 * only go down. It is debt, recorded so it cannot hide.
 */
const BACKLOG_LIMIT = 33

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      yield* walk(path.join(dir, entry.name))
    } else if (entry.name.endsWith('.tsx')) {
      if (entry.name.includes('.test.') || entry.name.includes('.stories.')) continue
      yield path.join(dir, entry.name)
    }
  }
}

/** Strip line and block comments so prose about <button> is not a finding. */
function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

async function main() {
  const findings = []
  for await (const absolute of walk(srcRoot)) {
    const rel = path.relative(srcRoot, absolute).split(path.sep).join('/')
    if (EXEMPT_FILES.has(rel)) continue
    const source = withoutComments(await readFile(absolute, 'utf8'))
    for (const line of source.split('\n')) {
      const match = RAW_CONTROL.exec(line)
      if (match) findings.push({ file: rel, tag: match[1] })
    }
  }

  const counted = new Map()
  for (const f of findings) {
    const key = `${f.file}:${f.tag}`
    counted.set(key, (counted.get(key) ?? 0) + 1)
  }

  const errors = []

  // A stale file exemption is as dangerous as a stale control exception: it
  // sits there quietly, and the day a new file appears at that exact path it
  // is waved through without anyone arguing for it.
  for (const [file, reason] of EXEMPT_FILES) {
    if (!existsSync(path.join(srcRoot, file))) {
      errors.push(`Exempt file no longer exists: ${file} (${reason}). Delete the entry.`)
    }
  }

  let excepted = 0
  for (const exception of EXCEPTIONS) {
    const key = `${exception.file}:${exception.tag}`
    const actual = counted.get(key) ?? 0
    if (actual === 0) {
      errors.push(
        `Recorded exception no longer exists: ${key}. Delete the entry -- a stale exception silently permits a future control nobody argued for.`,
      )
      continue
    }
    if (actual > exception.count) {
      errors.push(
        `${key}: ${actual} occurrences, but only ${exception.count} are recorded. A new one was added without a reason.`,
      )
    }
    excepted += Math.min(actual, exception.count)
    counted.set(key, actual - Math.min(actual, exception.count))
  }

  const backlog = [...counted.entries()].filter(([, n]) => n > 0)
  const backlogTotal = backlog.reduce((sum, [, n]) => sum + n, 0)

  if (backlogTotal > BACKLOG_LIMIT) {
    errors.push(
      `Generic-control backlog grew: ${backlogTotal} occurrences against a limit of ${BACKLOG_LIMIT}. ` +
        `Convert it to a Material primitive, or record it as an exception with the reason it cannot be one.`,
    )
  }

  const report = {
    scannedFiles: new Set(findings.map((f) => f.file)).size,
    recordedExceptions: excepted,
    backlogTotal,
    backlogLimit: BACKLOG_LIMIT,
    worstOffenders: backlog.sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k} x${n}`),
  }

  if (errors.length > 0) {
    process.stderr.write(`${errors.join('\n')}\n`)
    process.stderr.write(`${JSON.stringify(report, null, 2)}\n`)
    process.exitCode = 1
    return
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(
    `PASS: ${excepted} recorded exception(s); ${backlogTotal} generic control(s) still to convert (limit ${BACKLOG_LIMIT}).\n`,
  )
}

await main()
