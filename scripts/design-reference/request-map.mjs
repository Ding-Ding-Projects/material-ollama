#!/usr/bin/env node
/**
 * Exact source-URL map for the design-reference CDP Fetch domain.
 *
 * The reference HTML and support runtime deliberately retain their original
 * external URLs. A capture harness loads this map once, verifies every local
 * byte against the committed manifest, and uses `toFetchFulfillRequest()` for
 * Fetch.fulfillRequest. Unknown URLs never fall back to the network.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = resolve(fileURLToPath(new URL('.', import.meta.url)));
const defaultRootDir = resolve(scriptDir, '..', '..');
const defaultManifestPath = join(defaultRootDir, 'design', 'vendor', 'manifest.json');

export class DesignAssetRequestError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DesignAssetRequestError';
    this.code = code;
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function fail(code, message) {
  throw new DesignAssetRequestError(code, message);
}

function assertManifestEntry(entry, index) {
  if (!entry || typeof entry !== 'object') fail('INVALID_MANIFEST', `manifest entry ${index} is not an object`);
  for (const key of ['sourceUrl', 'localPath', 'contentType', 'bytes', 'sha256']) {
    if (!(key in entry)) fail('INVALID_MANIFEST', `manifest entry ${index} is missing ${key}`);
  }
  let source;
  try { source = new URL(entry.sourceUrl); } catch { fail('INVALID_MANIFEST', `manifest entry ${index} has an invalid source URL`); }
  if (source.protocol !== 'https:') fail('INVALID_MANIFEST', `manifest entry ${index} is not HTTPS`);
  if (source.username || source.password || source.hash) fail('INVALID_MANIFEST', `manifest entry ${index} contains URL credentials or a fragment`);
  if (!/^design\/vendor\/[A-Za-z0-9._-]+$/.test(entry.localPath)) fail('INVALID_MANIFEST', `manifest entry ${index} has an unsafe local path`);
  if (!Number.isInteger(entry.bytes) || entry.bytes < 0) fail('INVALID_MANIFEST', `manifest entry ${index} has an invalid byte length`);
  if (!/^[0-9a-f]{64}$/.test(entry.sha256)) fail('INVALID_MANIFEST', `manifest entry ${index} has an invalid SHA-256`);
}

export async function loadDesignAssetMap({ manifestPath = defaultManifestPath, rootDir = defaultRootDir } = {}) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.entries)) fail('INVALID_MANIFEST', 'design asset manifest schema is not supported');
  const assets = new Map();
  for (const [index, entry] of manifest.entries.entries()) {
    assertManifestEntry(entry, index);
    if (assets.has(entry.sourceUrl)) fail('INVALID_MANIFEST', `duplicate source URL: ${entry.sourceUrl}`);
    const localPath = resolve(rootDir, entry.localPath);
    const relativePath = relative(resolve(rootDir), localPath);
    if (isAbsolute(relativePath) || relativePath.startsWith(`..${'\\'}`) || relativePath.startsWith(`..${'/'}`)) fail('INVALID_MANIFEST', `asset escapes root: ${entry.localPath}`);
    const body = await readFile(localPath);
    if (body.length !== entry.bytes) fail('ASSET_LENGTH_MISMATCH', `${entry.sourceUrl}: expected ${entry.bytes} bytes, got ${body.length}`);
    const actualHash = sha256(body);
    if (actualHash !== entry.sha256) fail('ASSET_HASH_MISMATCH', `${entry.sourceUrl}: expected ${entry.sha256}, got ${actualHash}`);
    assets.set(entry.sourceUrl, Object.freeze({
      sourceUrl: entry.sourceUrl,
      localPath: entry.localPath,
      status: 200,
      contentType: entry.contentType,
      body,
      sha256: actualHash,
    }));
  }
  return assets;
}

export function resolveDesignRequest(assets, sourceUrl) {
  if (!(assets instanceof Map)) fail('INVALID_ASSET_MAP', 'assets must be the map returned by loadDesignAssetMap');
  const asset = assets.get(sourceUrl);
  if (!asset) fail('UNKNOWN_DESIGN_ASSET', `unknown design asset URL: ${sourceUrl}`);
  return { status: asset.status, contentType: asset.contentType, body: asset.body };
}

export function toFetchFulfillRequest(response) {
  if (!response || response.status !== 200 || !Buffer.isBuffer(response.body)) fail('INVALID_RESPONSE', 'Fetch fulfillment requires a verified 200 response body');
  return {
    responseCode: response.status,
    responseHeaders: [{ name: 'Content-Type', value: response.contentType }],
    body: response.body.toString('base64'),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href && process.argv.includes('--check')) {
  const assets = await loadDesignAssetMap();
  console.log(JSON.stringify({ status: 'verified', entries: assets.size, unknownPolicy: 'refuse' }, null, 2));
}
