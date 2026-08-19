#!/usr/bin/env node
// Reads every hand-written feature article under docs/features/uh-completeness/articles/ and
// builds a single structured JSON index the offline documentation browser (site/app/docs) imports
// at build time. No network access, no invented copy: every word in the output is copied verbatim
// from the article files or from the canonical feature inventory that names them.
//
// Usage: node site/scripts/build-docs-index.mjs [--output <path>]

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const ARTICLES_DIR = fileURLToPath(new URL('../../docs/features/uh-completeness/articles/', import.meta.url))
const INVENTORY_PATH = fileURLToPath(new URL('../../docs/features/uh-completeness/inventory.json', import.meta.url))

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const index = args.indexOf(name)
  return index === -1 ? fallback : args[index + 1]
}
const outputPath = fileURLToPath(new URL(option('--output', '../content/docs-articles.json'), import.meta.url))

const SECTION_ORDER = [
  { id: 'behaviour', heading: 'Behaviour' },
  { id: 'configuration', heading: 'Configuration' },
  { id: 'failure-modes', heading: 'Failure modes' },
  { id: 'security', heading: 'Security considerations' },
  { id: 'verification', heading: 'Verification' },
  { id: 'suggested', heading: 'Suggested articles' },
]

// Grouping is presentation only -- every id, title, and article path below is read from the
// canonical inventory. This table exists so the drawer can group 85 flat records into a
// browsable set of topics; it invents no feature and drops none (the self-test below proves it).
const CATEGORIES = [
  { id: 'language', name: 'Language & communication' },
  { id: 'personalization', name: 'Personalization & settings' },
  { id: 'appearance', name: 'Appearance, layout & accessibility' },
  { id: 'navigation', name: 'Search, navigation & tabs' },
  { id: 'delight', name: 'Notifications & delight' },
  { id: 'ollama', name: 'Ollama suite manager' },
  { id: 'history', name: 'History, recovery & content editing' },
  { id: 'security', name: 'Security & access' },
  { id: 'downloads', name: 'Downloads & embeds' },
  { id: 'publishing', name: 'Publishing & documentation' },
  { id: 'ops', name: 'Build, release & operations' },
]

const CATEGORY_BY_FEATURE_ID = {
  'language-modes': 'language',
  'funny-level-controls': 'language',
  'dialog-emoji-toggle': 'language',
  'school-mode': 'language',
  'personal-vocabulary': 'language',
  narration: 'language',
  'narrator-voice-selection': 'language',
  'scheduled-settings': 'personalization',
  'external-settings-sources': 'personalization',
  'app-logo-customization': 'personalization',
  'settings-explanations-provenance': 'personalization',
  'app-display-name': 'personalization',
  'config-profiles': 'personalization',
  'dim-sum-surprise': 'delight',
  'dim-sum-release-catalog': 'delight',
  notifications: 'delight',
  'notification-center': 'delight',
  accessibility: 'appearance',
  'responsive-layout-and-sizing': 'appearance',
  'material-design': 'appearance',
  'appearance-editor': 'appearance',
  'infinite-color-translator': 'appearance',
  overlays: 'appearance',
  'file-converter': 'ollama',
  'ollama-suite-manager': 'ollama',
  'model-store': 'ollama',
  'hardware-fit': 'ollama',
  'batch-pull-queue': 'ollama',
  'local-chat-sessions': 'ollama',
  'harness-profiles': 'ollama',
  'cli-gui-parity': 'ollama',
  'gui-capability-registry': 'ollama',
  'regex-builder': 'navigation',
  'browser-tabs': 'navigation',
  'tab-docking-overflow': 'navigation',
  'tab-groups': 'navigation',
  'tab-discovery-searches': 'navigation',
  'tab-bulk-close': 'navigation',
  'command-palette': 'navigation',
  'context-menu-shortcuts': 'navigation',
  'collapsible-filters': 'navigation',
  'offline-documentation-browser': 'publishing',
  'landing-page-boundary': 'publishing',
  'changelog-viewer': 'publishing',
  'forge-publishing': 'publishing',
  'site-homepage-link': 'publishing',
  'api-documentation-and-collection': 'publishing',
  'destructive-super-confirmation': 'history',
  'local-version-history': 'history',
  'external-editor': 'history',
  exports: 'history',
  'bulk-actions': 'history',
  'provider-authored-renderer': 'history',
  'guided-forms': 'history',
  'rich-controls': 'history',
  'long-operation-progress': 'history',
  'failure-recovery': 'history',
  'blank-slate-presets': 'history',
  'toy-locks': 'security',
  'support-tickets': 'security',
  'unlock-ladder': 'security',
  'two-factor-qr-pairing': 'security',
  'built-in-authenticator': 'security',
  'secret-display-history': 'security',
  'vocabulary-hash-lock': 'security',
  'no-network-privacy': 'security',
  'browser-extension-download-capture': 'downloads',
  'shared-link-embed': 'downloads',
  'status-hub': 'ops',
  'status-discord-bridge': 'ops',
  'tidbyt-status-display': 'ops',
  'sanitized-instruction-copy': 'ops',
  'repository-root-build-script': 'ops',
  'dependency-bootstrap': 'ops',
  'bundled-runtime-dependencies': 'ops',
  'unsigned-release-policy': 'ops',
  'release-line-count': 'ops',
  'issue-handoff': 'ops',
  'rolling-discussion': 'ops',
  'project-status': 'ops',
  'capture-manifest': 'ops',
  'release-metadata': 'ops',
  'cheap-transfer': 'ops',
  'automatic-updates': 'ops',
  'packaged-app-icon': 'ops',
}

function isTodoOnly(text) {
  const trimmed = text.trim()
  return trimmed.length === 0 || /^TODO\(/.test(trimmed)
}

function parseArticle(raw, slug) {
  // Normalize CRLF -> LF up front so every downstream split/regex works regardless of the
  // checkout's line-ending setting.
  const normalized = raw.replace(/\r\n/g, '\n')
  const titleMatch = /^#\s+(.+?)\s*$/m.exec(normalized)
  const title = titleMatch ? titleMatch[1].trim() : slug

  const sections = SECTION_ORDER.map(({ id, heading }, index) => {
    const startPattern = new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm')
    const startMatch = startPattern.exec(normalized)
    if (!startMatch) return { id, heading, text: '', isTodo: true }
    const contentStart = startMatch.index + startMatch[0].length
    const rest = normalized.slice(contentStart)
    const nextHeadingMatch = /^##\s+/m.exec(rest)
    const content = (nextHeadingMatch ? rest.slice(0, nextHeadingMatch.index) : rest).trim()
    return { id, heading, text: content, isTodo: isTodoOnly(content) }
  })

  const isScaffoldOnly = sections.every((section) => section.isTodo)
  return { title, sections, isScaffoldOnly }
}

async function main() {
  const inventory = JSON.parse(await readFile(INVENTORY_PATH, 'utf8'))
  const files = (await readdir(ARTICLES_DIR)).filter((name) => name.endsWith('.md')).sort()

  const fileSlugs = new Set(files.map((name) => name.replace(/\.md$/, '')))
  const inventoryIds = new Set(inventory.features.map((feature) => feature.id))
  const missingFromInventory = [...fileSlugs].filter((slug) => !inventoryIds.has(slug))
  const missingFromDisk = [...inventoryIds].filter((id) => !fileSlugs.has(id))
  if (missingFromInventory.length || missingFromDisk.length) {
    throw new Error(
      `Article/inventory mismatch. On disk but not in inventory: ${JSON.stringify(missingFromInventory)}. ` +
      `In inventory but missing on disk: ${JSON.stringify(missingFromDisk)}.`
    )
  }

  const uncategorized = [...fileSlugs].filter((slug) => !CATEGORY_BY_FEATURE_ID[slug])
  if (uncategorized.length) {
    throw new Error(`No category assigned for: ${JSON.stringify(uncategorized)}`)
  }

  const articles = []
  for (const file of files) {
    const slug = file.replace(/\.md$/, '')
    const raw = await readFile(new URL(file, `file://${ARTICLES_DIR}`), 'utf8')
    const parsed = parseArticle(raw, slug)
    const inventoryEntry = inventory.features.find((feature) => feature.id === slug)
    articles.push({
      id: slug,
      title: parsed.title,
      category: CATEGORY_BY_FEATURE_ID[slug],
      sourcePath: inventoryEntry.article,
      isScaffoldOnly: parsed.isScaffoldOnly,
      sections: parsed.sections,
    })
  }

  articles.sort((a, b) => a.title.localeCompare(b.title))

  const categoryCounts = new Map()
  for (const article of articles) categoryCounts.set(article.category, (categoryCounts.get(article.category) || 0) + 1)
  const categories = CATEGORIES
    .map((category) => ({ ...category, count: categoryCounts.get(category.id) || 0 }))
    .filter((category) => category.count > 0)

  const output = {
    schemaVersion: 1,
    sourceInventory: 'docs/features/uh-completeness/inventory.json',
    articleCount: articles.length,
    categories,
    articles,
  }

  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
  process.stdout.write(`Wrote ${articles.length} articles across ${categories.length} categories to ${outputPath}\n`)
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
