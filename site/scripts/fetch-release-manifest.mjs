#!/usr/bin/env node
// Resolves the newest verified (non-draft, non-prerelease) GitHub Release for the desktop
// application and writes a small, honest, structured manifest that the Status and Download
// routes import at build time. This performs the network verification once, at generation
// time -- the built site never fetches this data at runtime, matching the no-network-at-runtime
// requirement for the deployed pages.
//
// Usage: node site/scripts/fetch-release-manifest.mjs [--output <path>] [--repo <owner/name>]
//
// If no verified release can be resolved (no token, no network, no matching release, or the
// release carries no recognizable Windows installer asset), this writes an "unavailable"
// manifest with the exact reason instead of guessing at a URL or inventing a version. The
// Status and Download pages are required to render that honestly rather than fabricate.

import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const index = args.indexOf(name)
  return index === -1 ? fallback : args[index + 1]
}

const outputPath = fileURLToPath(new URL(option('--output', '../content/release-manifest.json'), import.meta.url))
const repo = option('--repo', process.env.GITHUB_REPOSITORY || 'Ding-Ding-Projects/material-ollama')
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN

const INSTALLER_NAME = 'OllamaSetup.exe'
const headers = {
  accept: 'application/vnd.github+json',
  'user-agent': 'material-ollama-site-release-manifest',
}
if (token) headers.authorization = `Bearer ${token}`

async function getJson(url) {
  const response = await fetch(url, { headers })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`)
  return response.json()
}

async function getPages(url) {
  const results = []
  for (let page = 1; page <= 20; page += 1) {
    const pageUrl = new URL(url)
    pageUrl.searchParams.set('per_page', '100')
    pageUrl.searchParams.set('page', String(page))
    const batch = await getJson(pageUrl)
    if (!Array.isArray(batch)) throw new Error(`Expected an array from ${pageUrl}`)
    results.push(...batch)
    if (batch.length < 100) return results
  }
  throw new Error(`Pagination limit reached for ${url}`)
}

function parseDimSumCodeName(body) {
  const en = /^- English name:\s*(.+)$/m.exec(body)?.[1]?.trim()
  const zh = /^- Traditional Chinese name:\s*(.+)$/m.exec(body)?.[1]?.trim()
  const dishId = /^- Dish ID:\s*(.+)$/m.exec(body)?.[1]?.trim()
  const catalogMatch = /^- Source catalog release:\s*\[[^\]]*\]\(([^)]+)\)/m.exec(body)
  const imageMatch = /^- Authoritative public image:\s*\[[^\]]*\]\(([^)]+)\)/m.exec(body)
  if (!en || !zh || !dishId) return null
  return {
    en,
    zhHant: zh,
    combined: `${en} · ${zh}`,
    dishId,
    catalogReleaseUrl: catalogMatch?.[1] || null,
    imageUrl: imageMatch?.[1] || null,
  }
}

function parseWorkflowEvidence(body) {
  const startedAt = /^- Workflow started:\s*(.+)$/m.exec(body)?.[1]?.trim()
  const completedAt = /^- Workflow completed:\s*(.+)$/m.exec(body)?.[1]?.trim()
  const duration = /^- Workflow duration:\s*(.+)$/m.exec(body)?.[1]?.trim()
  const runUrl = /^- Workflow run:\s*(\S+)$/m.exec(body)?.[1]?.trim()
  const platform = /^- Platform:\s*(.+)$/m.exec(body)?.[1]?.trim()
  if (!startedAt || !completedAt || !runUrl) return null
  return { startedAt, completedAt, duration: duration || null, runUrl, platform: platform || null }
}

async function writeResult(result) {
  const serialized = `${JSON.stringify(result, null, 2)}\n`
  await writeFile(outputPath, serialized, 'utf8')
  process.stdout.write(serialized)
}

async function main() {
  const releases = await getPages(`https://api.github.com/repos/${repo}/releases`)
  const verified = releases.find((release) => !release.draft && !release.prerelease)

  if (!verified) {
    await writeResult({
      schemaVersion: 1,
      status: 'unavailable',
      reason: 'No published (non-draft, non-prerelease) GitHub Release was found for this repository.',
      repo,
    })
    return
  }

  const installerAsset = verified.assets?.find((asset) => asset.name === INSTALLER_NAME)
  if (!installerAsset) {
    await writeResult({
      schemaVersion: 1,
      status: 'unavailable',
      reason: `Release ${verified.tag_name} carries no ${INSTALLER_NAME} asset.`,
      repo,
      releaseTag: verified.tag_name,
      releaseUrl: verified.html_url,
    })
    return
  }

  // One release, one download. Anything beyond the installer on the release page
  // means the publishing contract has drifted, so refuse rather than link it.
  const publishedNames = verified.assets?.map((asset) => asset.name) || []
  if (publishedNames.length !== 1) {
    await writeResult({
      schemaVersion: 1,
      status: 'unavailable',
      reason: `Release ${verified.tag_name} must publish exactly ${INSTALLER_NAME} and nothing else; found ${publishedNames.length} assets.`,
      repo,
      releaseTag: verified.tag_name,
      releaseUrl: verified.html_url,
    })
    return
  }
  const digestFor = (asset) => typeof asset?.digest === 'string' && /^sha256:[0-9a-f]{64}$/i.test(asset.digest)
    ? asset.digest.slice('sha256:'.length).toLowerCase()
    : null
  const installerSha256 = digestFor(installerAsset)
  if (!installerSha256 || !/^https:\/\//.test(installerAsset.browser_download_url)) {
    await writeResult({
      schemaVersion: 1,
      status: 'unavailable',
      reason: `Release ${verified.tag_name} must expose a valid sha256:<64hex> digest and an HTTPS download URL for the installer.`,
      repo,
      releaseTag: verified.tag_name,
      releaseUrl: verified.html_url,
    })
    return
  }

  const body = typeof verified.body === 'string' ? verified.body : ''
  const codeName = parseDimSumCodeName(body)
  const workflow = parseWorkflowEvidence(body)

  // Best-effort: confirm the linked workflow run actually reports a successful conclusion,
  // rather than trusting the release body's own claim about itself. A failure here degrades to
  // "unknown" rather than failing the whole manifest -- the release and installer asset are
  // independently real either way.
  let workflowConclusion = null
  if (workflow?.runUrl) {
    const runIdMatch = /\/runs\/(\d+)/.exec(workflow.runUrl)
    if (runIdMatch) {
      try {
        const run = await getJson(`https://api.github.com/repos/${repo}/actions/runs/${runIdMatch[1]}`)
        workflowConclusion = run.conclusion || run.status || null
      } catch {
        workflowConclusion = 'unknown'
      }
    }
  }
  if (workflow) workflow.conclusion = workflowConclusion

  const extraAssets = []

  await writeResult({
    schemaVersion: 1,
    status: 'verified',
    repo,
    release: {
      tag: verified.tag_name,
      name: verified.name || verified.tag_name,
      url: verified.html_url,
      commit: verified.target_commitish,
      publishedAt: verified.published_at,
      isDraft: verified.draft,
      isPrerelease: verified.prerelease,
    },
    workflow,
    installer: {
      name: installerAsset.name,
      url: installerAsset.browser_download_url,
      sizeBytes: installerAsset.size,
      sha256: installerSha256,
      platform: workflow?.platform || 'Windows',
      signed: false,
      signatureNote: 'This installer is unsigned by permanent project policy. Windows may show an unknown-publisher or SmartScreen warning; this does not mean the file was tampered with.',
    },
    assetCount: verified.assets?.length ?? 0,
    extraAssets,
    codeName,
  })
}

main().catch(async (error) => {
  console.warn(`fetch-release-manifest: ${error.message}`)
  await writeResult({
    schemaVersion: 1,
    status: 'unavailable',
    reason: `Release lookup failed: ${error.message}`,
    repo,
  })
})
