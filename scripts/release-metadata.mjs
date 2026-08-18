#!/usr/bin/env node

import { basename } from 'node:path'
import { writeFile } from 'node:fs/promises'

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const index = args.indexOf(name)
  return index === -1 ? fallback : args[index + 1]
}

const outputPath = option('--output', 'release-metadata.json')
const catalogUrl = option('--catalog-url', 'https://raw.githubusercontent.com/Ding-Ding-Projects/dim-sum-photos/main/catalog/index.json')
const sourceRepo = option('--source-repo', 'Ding-Ding-Projects/dim-sum-photos')
const targetRepo = option('--target-repo', process.env.GITHUB_REPOSITORY || 'Ding-Ding-Projects/material-ollama')
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN

const headers = {
  accept: 'application/vnd.github+json',
  'user-agent': 'material-ollama-release-metadata',
}
if (token) headers.authorization = `Bearer ${token}`

async function getJson(url, authenticated = false) {
  const response = await fetch(url, {
    headers: authenticated ? headers : { accept: 'application/json', 'user-agent': headers['user-agent'] },
  })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`)
  return response.json()
}

async function getPages(url, authenticated = true) {
  const results = []
  for (let page = 1; page <= 100; page += 1) {
    const pageUrl = new URL(url)
    pageUrl.searchParams.set('per_page', '100')
    pageUrl.searchParams.set('page', String(page))
    const batch = await getJson(pageUrl, authenticated)
    if (!Array.isArray(batch)) throw new Error(`Expected an array from ${pageUrl}`)
    results.push(...batch)
    if (batch.length < 100) return results
  }
  throw new Error(`Pagination limit reached for ${url}`)
}

async function writeResult(result) {
  const serialized = `${JSON.stringify(result, null, 2)}\n`
  await writeFile(outputPath, serialized, 'utf8')
  process.stdout.write(serialized)
}

async function main() {
  const catalog = await getJson(catalogUrl, false)
  if (!Array.isArray(catalog.dishes)) throw new Error('Catalog has no dishes array')

  const sourceReleases = await getPages(`https://api.github.com/repos/${sourceRepo}/releases`)
  const publishedReleases = sourceReleases.filter((release) => release.tag_name?.startsWith('catalog-v1'))
  const assetsByFilename = new Map()
  for (const release of publishedReleases) {
    const assets = await getPages(release.assets_url)
    for (const asset of assets) {
      if (!assetsByFilename.has(asset.name)) {
        assetsByFilename.set(asset.name, {
          name: asset.name,
          url: asset.browser_download_url,
          releaseTag: release.tag_name,
          releaseUrl: release.html_url,
        })
      }
    }
  }

  const targetReleases = await getPages(`https://api.github.com/repos/${targetRepo}/releases`, Boolean(token))
  const usedCodeNames = new Set()
  for (const release of targetReleases) {
    const body = typeof release.body === 'string' ? release.body : ''
    for (const match of body.matchAll(/^Dim sum code name:\s*(.+)$/gmi)) {
      usedCodeNames.add(match[1].trim())
    }
  }

  const selected = catalog.dishes.find((dish) => {
    const asset = assetsByFilename.get(basename(dish.image?.path || ''))
    const codeName = `${dish.name?.en || ''} · ${dish.name?.zhHant || ''}`
    return asset && dish.name?.en && dish.name?.zhHant && !usedCodeNames.has(codeName)
  })

  if (!selected) {
    await writeResult({
      schemaVersion: 1,
      status: 'unavailable',
      reason: 'No unused dish with a published catalog-v1 image asset was available.',
      catalogUrl,
      sourceRepo,
      targetRepo,
    })
    return
  }

  const asset = assetsByFilename.get(basename(selected.image.path))
  const codeName = `${selected.name.en} · ${selected.name.zhHant}`
  await writeResult({
    schemaVersion: 1,
    status: 'selected',
    codeName,
    dishId: selected.id,
    slug: selected.slug,
    name: selected.name,
    catalogUrl,
    sourceRepo,
    sourceReleaseTag: asset.releaseTag,
    sourceReleaseUrl: asset.releaseUrl,
    imageAssetName: asset.name,
    imageUrl: asset.url,
  })
}

main().catch(async (error) => {
  console.warn(`release-metadata: ${error.message}`)
  await writeResult({
    schemaVersion: 1,
    status: 'unavailable',
    reason: `Catalog lookup was unavailable: ${error.message}`,
    catalogUrl,
    sourceRepo,
    targetRepo,
  })
})
