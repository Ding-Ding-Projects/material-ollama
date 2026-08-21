#!/usr/bin/env node
/**
 * Fetch the exact design runtime and font responses into a deterministic map.
 * The HTML and support.js files stay byte-identical; capture tooling maps the
 * original URLs to these local bytes instead of rewriting the reference.
 */
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = resolve(fileURLToPath(new URL('.', import.meta.url)));
const repoRoot = resolve(scriptDir, '..', '..');
const designDir = join(repoRoot, 'design');
const vendorDir = join(designDir, 'vendor');
const manifestPath = join(vendorDir, 'manifest.json');
const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36';
const requiredRuntimeUrls = [
  'https://unpkg.com/react@18.3.1/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone@7.29.0/babel.min.js',
];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function safeName(url, index) {
  const parsed = new URL(url);
  const raw = basename(parsed.pathname) || `asset-${index}`;
  const cleaned = raw.replace(/[^A-Za-z0-9._-]+/g, '_');
  const extension = extname(cleaned);
  const suffix = createHash('sha256').update(url).digest('hex').slice(0, 12);
  const maxStemLength = Math.max(1, 90 - extension.length - suffix.length - 1);
  const stem = (cleaned.slice(0, cleaned.length - extension.length) || 'asset').slice(0, maxStemLength);
  return `${String(index).padStart(3, '0')}-${stem}-${suffix}${extension}`;
}

async function fetchBytes(url) {
  const response = await fetch(url, { headers: { 'user-agent': userAgent } });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get('content-type') ?? 'application/octet-stream',
  };
}

const html = await readFile(join(designDir, 'Material Ollama.dc.html'), 'utf8');
const runtime = await readFile(join(designDir, 'support.js'), 'utf8');
const runtimeUrls = [...runtime.matchAll(/https:\/\/[^"']+/g)].map(match => match[0]);
const fontCssUrls = [...html.matchAll(/https:\/\/fonts\.googleapis\.com\/css2\?[^"']+/g)].map(match => match[0]);
const urls = [...new Set([...runtimeUrls, ...fontCssUrls])];
for (const requiredUrl of requiredRuntimeUrls) {
  if (!urls.includes(requiredUrl)) throw new Error(`required runtime URL is absent: ${requiredUrl}`);
}

await mkdir(vendorDir, { recursive: true });
for (const oldEntry of await readdir(vendorDir)) {
  await rm(join(vendorDir, oldEntry), { recursive: true, force: true });
}
const entries = [];
for (let index = 0; index < urls.length; index += 1) {
  const url = urls[index];
  const fetched = await fetchBytes(url);
  const localName = safeName(url, index);
  await writeFile(join(vendorDir, localName), fetched.bytes);
  const entry = {
    sourceUrl: url,
    localPath: `design/vendor/${localName}`,
    contentType: fetched.contentType,
    bytes: fetched.bytes.length,
    sha256: sha256(fetched.bytes),
  };
  entries.push(entry);

  if (url.startsWith('https://fonts.googleapis.com/css2?')) {
    const css = fetched.bytes.toString('utf8');
    const nestedUrls = [...css.matchAll(/url\((https:[^)]+)\)/g)].map(match => match[1]);
    for (const nestedUrl of [...new Set(nestedUrls)]) {
      const nested = await fetchBytes(nestedUrl);
      const nestedIndex = entries.length;
      const nestedName = safeName(nestedUrl, nestedIndex);
      await writeFile(join(vendorDir, nestedName), nested.bytes);
      entries.push({
        sourceUrl: nestedUrl,
        localPath: `design/vendor/${nestedName}`,
        contentType: nested.contentType,
        bytes: nested.bytes.length,
        sha256: sha256(nested.bytes),
        referencedBy: url,
      });
    }
  }
}

const manifest = {
  schemaVersion: 1,
  userAgent,
  sourceFiles: {
    html: sha256(await readFile(join(designDir, 'Material Ollama.dc.html'))),
    runtime: sha256(await readFile(join(designDir, 'support.js'))),
  },
  entries,
};
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ manifestPath, entries: entries.length }, null, 2));
