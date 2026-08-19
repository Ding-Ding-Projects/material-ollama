#!/usr/bin/env node
// scripts/new-feature-article.mjs
//
// Scaffolds docs/features/uh-completeness/articles/<id>.md from the shared
// feature contract at docs/features/uh-completeness/inventory.json. Every
// scaffold's H1 is the inventory's exact `title` for that feature id,
// followed by the six section headings the feature-article contract
// requires, in this fixed order:
//
//   Behaviour, Configuration, Failure modes, Security considerations,
//   Verification, Suggested articles
//
// Each section holds exactly one single-line `TODO(<id>): ...` marker and
// nothing else. This script writes SCAFFOLDS, never prose -- filling a
// section in is a separate, deliberate hand edit made directly to the
// generated file afterward. That is also why the marker is single-line: the
// completeness pipeline (app/ui/docs.go) treats a file as "not yet written"
// when every non-heading line still starts with `TODO(`, and a marker that
// wrapped onto a second line would defeat that check for a spot that was
// never actually written.
//
// Re-running this script never overwrites a file that already exists unless
// --force is passed, so a hand-written article survives a later --all pass
// run for a *different* feature.
//
// Usage:
//   node scripts/new-feature-article.mjs <feature-id> [--force]
//   node scripts/new-feature-article.mjs --all [--force]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, "..")
const inventoryPath = join(
  repoRoot,
  "docs/features/uh-completeness/inventory.json",
)
const articlesDir = join(repoRoot, "docs/features/uh-completeness/articles")

// The exact section order the completeness inventory's article contract
// requires. Do not reorder, rename, add, or remove a heading here without
// updating that contract too -- this list and the guard in
// scripts/check-docs-bundle.mjs are two halves of the same promise.
const SECTIONS = [
  [
    "Behaviour",
    "describe what this feature actually does, on every surface the shared contract lists, in plain factual prose",
  ],
  [
    "Configuration",
    "describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists",
  ],
  [
    "Failure modes",
    "describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees",
  ],
  [
    "Security considerations",
    "describe what this feature must never expose or allow, and the exact mechanism that enforces it",
  ],
  [
    "Verification",
    "name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature",
  ],
  [
    "Suggested articles",
    "link the related features, the prerequisites, and the natural next article a reader should open",
  ],
]

function loadInventory() {
  const raw = readFileSync(inventoryPath, "utf8")
  const inventory = JSON.parse(raw)
  const byId = new Map(inventory.features.map((feature) => [feature.id, feature]))
  return { inventory, byId }
}

/** Builds the scaffold body. The H1 is the inventory's `title`, verbatim. */
function scaffold(id, title) {
  const lines = [`# ${title}`, ""]
  for (const [heading, hint] of SECTIONS) {
    lines.push(`## ${heading}`, "")
    lines.push(`TODO(${id}): ${hint}.`)
    lines.push("")
  }
  // Collapse the trailing blank lines to exactly one final newline.
  return lines.join("\n").replace(/\n+$/, "\n")
}

function main() {
  const args = process.argv.slice(2)
  const force = args.includes("--force")
  const all = args.includes("--all")
  const idArg = args.find((arg) => !arg.startsWith("--"))

  if (!all && !idArg) {
    console.error("Usage: node scripts/new-feature-article.mjs <feature-id> [--force]")
    console.error("       node scripts/new-feature-article.mjs --all [--force]")
    process.exit(1)
  }

  const { byId } = loadInventory()

  let targets
  if (all) {
    targets = [...byId.keys()]
  } else {
    if (!byId.has(idArg)) {
      console.error(
        `new-feature-article: unknown feature id "${idArg}" -- it is not listed in docs/features/uh-completeness/inventory.json`,
      )
      process.exit(1)
    }
    targets = [idArg]
  }

  if (!existsSync(articlesDir)) {
    mkdirSync(articlesDir, { recursive: true })
  }

  let created = 0
  let overwritten = 0
  let skipped = 0

  for (const id of targets) {
    const feature = byId.get(id)
    const path = join(articlesDir, `${id}.md`)
    const existedBefore = existsSync(path)

    if (existedBefore && !force) {
      skipped++
      console.log(`skip     ${id}.md  (already exists -- pass --force to overwrite)`)
      continue
    }

    writeFileSync(path, scaffold(id, feature.title), "utf8")
    if (existedBefore) {
      overwritten++
      console.log(`overwrite ${id}.md`)
    } else {
      created++
      console.log(`create    ${id}.md`)
    }
  }

  console.log(
    `\n${created} created, ${overwritten} overwritten, ${skipped} skipped -- ${targets.length} feature(s) targeted.`,
  )

  if (skipped > 0 && !force) {
    console.log(`(Pass --force to overwrite the ${skipped} existing scaffold(s) too.)`)
  }
}

main()
