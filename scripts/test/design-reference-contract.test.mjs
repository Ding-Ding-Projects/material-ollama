import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkInventory } from '../parity/check-design-parity.mjs';
import { startReferenceServer } from '../design-reference/reference-renderer.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const design = name => resolve(root, 'design', name);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

test('imported design HTML and support runtime retain source bytes', async () => {
  const html = await readFile(design('Material Ollama.dc.html'));
  const runtime = await readFile(design('support.js'));
  assert.equal(sha256(html), '8f3fd2568578b56e20f68cc131d98ba087acdd8ea6072e956a0d7bac5b6a8eac');
  assert.equal(sha256(runtime), '8fe7df74405f3c55f49b7249c74ea1397e65d07dea2b1bd3b4a489bec2e28cbe');
  assert.match(html.toString('utf8'), /<script src="\.\/support\.js"><\/script>/);
});

test('direct reference renderer serves the committed files without rewriting', async () => {
  const serverState = await startReferenceServer();
  try {
    const htmlResponse = await fetch(`http://127.0.0.1:${serverState.port}${serverState.route}`);
    const runtimeResponse = await fetch(`http://127.0.0.1:${serverState.port}${serverState.route}support.js`);
    assert.equal(htmlResponse.status, 200);
    assert.equal(runtimeResponse.status, 200);
    assert.deepEqual(Buffer.from(await htmlResponse.arrayBuffer()), await readFile(design('Material Ollama.dc.html')));
    assert.deepEqual(Buffer.from(await runtimeResponse.arrayBuffer()), await readFile(design('support.js')));
  } finally {
    await new Promise((resolve, reject) => serverState.server.close(error => error ? reject(error) : resolve()));
  }
});

test('vendored asset manifest hashes every deterministic runtime and font response', async () => {
  const manifest = JSON.parse(await readFile(resolve(root, 'design/vendor/manifest.json'), 'utf8'));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(Object.hasOwn(manifest, 'fetchedAt'), false, 'manifest must not contain a wall-clock value');
  assert.ok(manifest.entries.length >= 3);
  const sourceUrls = new Set(manifest.entries.map(entry => entry.sourceUrl));
  for (const entry of manifest.entries) {
    const bytes = await readFile(resolve(root, entry.localPath));
    assert.equal(bytes.length, entry.bytes, entry.sourceUrl);
    assert.equal(sha256(bytes), entry.sha256, entry.sourceUrl);
  }
  const cssEntries = manifest.entries.filter(entry => entry.sourceUrl.startsWith('https://fonts.googleapis.com/css2?'));
  assert.ok(cssEntries.length >= 2);
  let sawUnicodeRange = false;
  for (const entry of cssEntries) {
    const css = await readFile(resolve(root, entry.localPath), 'utf8');
    assert.match(css, /@font-face/);
    assert.match(css, /font-weight:/);
    sawUnicodeRange ||= /unicode-range:/.test(css);
    for (const match of css.matchAll(/url\((https:[^)]+)\)/g)) assert.ok(sourceUrls.has(match[1]), `missing font response ${match[1]}`);
  }
  assert.equal(sawUnicodeRange, true, 'font family CSS must retain unicode-range declarations when supplied');
});

test('handoff sanitization contains no private-source marker and exactly three substitutions', async () => {
  const readme = await readFile(design('README.md'), 'utf8');
  const privateMarker = String.fromCharCode(64, 117, 104);
  assert.equal(readme.includes(privateMarker), false);
  assert.equal((readme.match(/shared settings/g) ?? []).length, 2);
  assert.equal((readme.match(/shared feature contract/g) ?? []).length, 2);
});

test('inventory has every declared row and preserves explicit gaps', async () => {
  const inventory = JSON.parse(await readFile(resolve(root, 'docs/features/design-parity/inventory.json'), 'utf8'));
  assert.deepEqual(checkInventory(inventory), { rows: 18, status: 'valid-gap-inventory' });
  assert.ok(inventory.rows.every(row => row.status === 'gap' && row.parityClaimed === false));
});

test('inventory guard rejects exact missing boundaries', async () => {
  const inventory = JSON.parse(await readFile(resolve(root, 'docs/features/design-parity/inventory.json'), 'utf8'));
  const mutations = [
    value => ({ ...value, rows: value.rows.slice(1) }),
    value => ({ ...value, rows: value.rows.map((row, index) => index === 0 ? { ...row, referenceRoute: '' } : row) }),
    value => ({ ...value, rows: value.rows.map((row, index) => index === 0 ? { ...row, tuple: { ...row.tuple, viewport: undefined } } : row) }),
    value => ({ ...value, rows: value.rows.map((row, index) => index === 0 ? { ...row, md3Audit: { status: 'pending', components: {} } } : row) }),
    value => ({ ...value, rows: value.rows.map((row, index) => index === 0 ? { ...row, evidence: { ...row.evidence, referenceRaw: { status: 'pending' } } } : row) }),
  ];
  for (const mutate of mutations) assert.throws(() => checkInventory(mutate(inventory)));
});
