#!/usr/bin/env node
// scripts/check-docs-bundle.mjs
//
// Go's //go:embed cannot reach outside the directory holding the source
// file that declares it, so app/ui/docs.go cannot embed
// docs/features/uh-completeness/articles/ directly -- that directory lives
// four levels above app/ui/. Every article is therefore staged into
// app/ui/articles/, a flat byte-for-byte copy that app/ui/docs.go actually
// embeds.
//
// That copy step is exactly where files silently go missing or go stale,
// so this is a guard, not a formatter: it checks the staged bundle against
// docs/features/uh-completeness/inventory.json three ways --
//
//   1. staged .md count === inventory feature count. Not "at least" --
//      an accidental duplicate or a leftover file must also fail.
//   2. the set of staged basenames === the set of inventory ids, checked in
//      BOTH directions, so an orphaned extra staged file fails exactly as
//      loudly as a missing one.
//   3. every staged file's sha256 === its source file's sha256, which is
//      the only thing that catches a copy that is present but stale.
//
// Usage:
//   node scripts/check-docs-bundle.mjs          # check only; exit 1 on drift
//   node scripts/check-docs-bundle.mjs --fix     # re-copy the staged bundle
//                                                  from source, then re-check

import { createHash } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, "..")
const inventoryPath = join(
  repoRoot,
  "docs/features/uh-completeness/inventory.json",
)
const sourceDir = join(repoRoot, "docs/features/uh-completeness/articles")
const stagedDir = join(repoRoot, "app/ui/articles")

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

function mdBasenames(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => name.replace(/\.md$/, ""))
}

function loadInventoryIds() {
  const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"))
  return inventory.features.map((feature) => feature.id)
}

/** Re-copies app/ui/articles/ from docs/features/uh-completeness/articles/,
 * removing any staged file that no longer corresponds to an inventory id
 * first -- an orphan left behind by a renamed or removed feature is exactly
 * the "extra file" case the bidirectional check below exists to catch, and
 * a --fix pass should leave nothing left for that check to still fail on. */
function sync(ids) {
  mkdirSync(stagedDir, { recursive: true })
  const idSet = new Set(ids)
  for (const basename of mdBasenames(stagedDir)) {
    if (!idSet.has(basename)) {
      rmSync(join(stagedDir, `${basename}.md`))
    }
  }
  for (const id of ids) {
    const from = join(sourceDir, `${id}.md`)
    if (!existsSync(from)) continue // reported as a failure by check() below
    writeFileSync(join(stagedDir, `${id}.md`), readFileSync(from))
  }
}

function check(ids) {
  const failures = []
  const idSet = new Set(ids)

  const stagedBasenames = mdBasenames(stagedDir)
  const stagedSet = new Set(stagedBasenames)

  if (stagedBasenames.length !== ids.length) {
    failures.push(
      `staged article count is ${stagedBasenames.length}, inventory has ${ids.length} feature(s) -- these must be EQUAL, not "at least".`,
    )
  }

  for (const id of ids) {
    if (!stagedSet.has(id)) {
      failures.push(
        `missing from staged bundle: ${id}.md (listed in inventory.json, absent from app/ui/articles/)`,
      )
    }
  }

  for (const basename of stagedBasenames) {
    if (!idSet.has(basename)) {
      failures.push(
        `extra staged file with no matching inventory feature: app/ui/articles/${basename}.md`,
      )
    }
  }

  for (const id of ids) {
    if (!stagedSet.has(id)) continue // already reported as missing above
    const sourcePath = join(sourceDir, `${id}.md`)
    if (!existsSync(sourcePath)) {
      failures.push(
        `staged app/ui/articles/${id}.md has no source article at docs/features/uh-completeness/articles/${id}.md`,
      )
      continue
    }
    const stagedHash = sha256(join(stagedDir, `${id}.md`))
    const sourceHash = sha256(sourcePath)
    if (stagedHash !== sourceHash) {
      failures.push(
        `stale staged copy: app/ui/articles/${id}.md does not match its source (sha256 differs) -- run with --fix to re-copy it`,
      )
    }
  }

  return failures
}

function main() {
  const fix = process.argv.includes("--fix")
  const ids = loadInventoryIds()

  if (fix) {
    sync(ids)
  }

  const failures = check(ids)

  if (failures.length === 0) {
    console.log(
      `check-docs-bundle: OK -- ${ids.length} staged article(s) in app/ui/articles/ match ${ids.length} inventory feature(s), byte for byte.`,
    )
    process.exit(0)
  }

  console.error(`check-docs-bundle: FAILED -- ${failures.length} problem(s) found:\n`)
  for (const failure of failures) {
    console.error(`  - ${failure}`)
  }
  if (!fix) {
    console.error(
      `\nRun "node scripts/check-docs-bundle.mjs --fix" to re-copy the staged bundle from source.`,
    )
  }
  process.exit(1)
}

main()
