#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadDesignAssetMap } from '../design-reference/request-map.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const inventoryPath = resolve(root, 'docs/features/design-parity/inventory.json');
const requiredIds = [
  'shell', 'models', 'chat', 'launch', 'cli-harness', 'developer', 'toolbox', 'docs', 'status', 'settings',
  'overlay-command-palette', 'overlay-notification-center', 'overlay-destructive-confirmation',
  'overlay-school-mode-unlock', 'overlay-dim-sum-surprise', 'overlay-regex-builder',
  'overlay-context-menu', 'overlay-snackbar',
];
const requiredEvidence = ['referenceRaw', 'builtRaw', 'sideBySide', 'diff'];
const requiredAudit = ['buttons', 'fields', 'menus', 'tabs', 'dialogs', 'navigation', 'selection', 'typography', 'colorRoles', 'shape', 'elevation', 'stateLayers', 'focus', 'motion', 'accessibility'];
const expectedReference = {
  file: 'design/Material Ollama.dc.html',
  sha256: '8f3fd2568578b56e20f68cc131d98ba087acdd8ea6072e956a0d7bac5b6a8eac',
  runtime: 'design/support.js',
  runtimeSha256: '8fe7df74405f3c55f49b7249c74ea1397e65d07dea2b1bd3b4a489bec2e28cbe',
};
const expectedFixedTuple = {
  theme: 'light', locale: 'en-US', viewport: { width: 816, height: 639 }, scale: 1,
  seed: '#8a5a00', radius: '16px', schoolMode: 'off',
};
const expectedReadmeSha256 = '69079abb32044697ced6266161e58e9142c0c193b4706c4f471d6fdff30e7522';
const expectedReceiptSha256 = '9be9d6c55583ef54161e64dd037fee5ceeb292bf3589b30a3efb0f6c75a8b019';

function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
function sameJson(left, right) { return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right)); }
function validateTuple(tuple, id) {
  assert(tuple && typeof tuple === 'object', `${id}: tuple must be an object`);
  assert(sameJson(tuple, { screen: tuple.screen, state: tuple.state, ...expectedFixedTuple }), `${id}: tuple must include the complete fixed comparison tuple`);
  assert(typeof tuple.screen === 'string' && tuple.screen.length > 0, `${id}: tuple.screen is required`);
  assert(typeof tuple.state === 'string' && tuple.state.length > 0, `${id}: tuple.state is required`);
}

export function checkInventory(inventory) {
  assert(inventory && inventory.schemaVersion === 1, 'schemaVersion must be 1');
  assert(inventory.reference && typeof inventory.reference === 'object', 'reference metadata is required');
  assert(inventory.reference.file === expectedReference.file && inventory.reference.sha256 === expectedReference.sha256, 'reference HTML metadata is invalid');
  assert(inventory.reference.runtime === expectedReference.runtime && inventory.reference.runtimeSha256 === expectedReference.runtimeSha256, 'reference runtime metadata is invalid');
  assert(sameJson(inventory.fixedTuple, expectedFixedTuple), 'fixed tuple metadata is incomplete or incorrect');
  assert(Array.isArray(inventory.rows), 'rows must be an array');
  const ids = inventory.rows.map(row => row.id);
  assert(ids.length === requiredIds.length, `expected exactly ${requiredIds.length} rows`);
  assert(new Set(ids).size === ids.length, 'row ids must be unique');
  const referenceRoutes = new Set();
  const realRoutes = new Set();
  for (const id of requiredIds) assert(ids.includes(id), `missing hand-written row ${id}`);
  for (const row of inventory.rows) {
    for (const field of ['id', 'group', 'screen', 'state', 'referenceFile', 'referenceRoute', 'realBuiltRoute', 'tuple', 'determinism', 'md3Audit', 'evidence', 'intentionalDeviations', 'sourceCommit', 'captureProvenance', 'status']) {
      assert(Object.hasOwn(row, field), `${row.id}: missing ${field}`);
    }
    assert(row.referenceFile && row.referenceFile.path === expectedReference.file && row.referenceFile.sha256 === expectedReference.sha256, `${row.id}: reference file path/hash is not pinned`);
    assert(typeof row.referenceRoute === 'string' && row.referenceRoute.length > 0, `${row.id}: reference route must be non-empty`);
    assert(typeof row.realBuiltRoute === 'string' && row.realBuiltRoute.length > 0, `${row.id}: real built route must be non-empty`);
    assert(row.referenceRoute === `/reference/material-ollama/#${row.id}`, `${row.id}: reference route boundary is incorrect`);
    assert(row.realBuiltRoute === `app://material-ollama/capture/${row.id}`, `${row.id}: real built route boundary is incorrect`);
    assert(!referenceRoutes.has(row.referenceRoute), `${row.id}: duplicate reference route`);
    assert(!realRoutes.has(row.realBuiltRoute), `${row.id}: duplicate real built route`);
    referenceRoutes.add(row.referenceRoute);
    realRoutes.add(row.realBuiltRoute);
    validateTuple(row.tuple, row.id);
    for (const key of ['fixture', 'time', 'motion', 'random', 'fonts', 'network']) assert(typeof row.determinism[key] === 'string' && row.determinism[key].length > 0, `${row.id}: missing determinism.${key}`);
    assert(row.md3Audit && row.md3Audit.status === 'pending', `${row.id}: audit must remain pending until capture review`);
    for (const key of requiredAudit) {
      const component = row.md3Audit.components?.[key];
      assert(component && ['pending', 'conforming', 'defect', 'intentional-deviation'].includes(component.status), `${row.id}: missing audit component ${key}`);
    }
    for (const key of requiredEvidence) {
      const evidence = row.evidence[key];
      assert(evidence && ['pending', 'not-applicable', 'verified'].includes(evidence.status), `${row.id}: invalid evidence status ${key}`);
      if (evidence.status !== 'verified') assert(typeof evidence.reason === 'string' && evidence.reason.length > 0, `${row.id}: ${key} gap needs a reason`);
      if (evidence.status === 'verified') assert(typeof evidence.path === 'string' && /^[0-9a-f]{64}$/.test(evidence.sha256), `${row.id}: verified ${key} needs path/hash`);
    }
    assert(Array.isArray(row.intentionalDeviations), `${row.id}: intentionalDeviations must be an array`);
    for (const deviation of row.intentionalDeviations) {
      assert(typeof deviation.reason === 'string' && deviation.reason.length > 0, `${row.id}: intentional deviation needs a reason`);
      assert(typeof deviation.approval === 'string' && deviation.approval.length > 0, `${row.id}: intentional deviation needs approval`);
    }
    assert(typeof row.sourceCommit === 'string' && /^[0-9a-f]{40}$/.test(row.sourceCommit), `${row.id}: sourceCommit must be a full lowercase commit SHA`);
    assert(row.status === 'gap', `${row.id}: this lane cannot claim parity before real captures`);
    assert(typeof row.gapReason === 'string' && row.gapReason.length > 0, `${row.id}: gapReason required`);
    assert(row.parityClaimed === false, `${row.id}: gap rows may not claim parity`);
  }
  return { rows: inventory.rows.length, status: 'valid-gap-inventory' };
}

function externalUrls(text) {
  return [...text.matchAll(/https:\/\/[^"']+/g)].map(match => match[0]);
}

function assertExactSet(actual, expected, label) {
  assert(actual.size === expected.size, `${label}: expected ${expected.size} URLs, got ${actual.size}`);
  for (const value of expected) assert(actual.has(value), `${label}: missing ${value}`);
  for (const value of actual) assert(expected.has(value), `${label}: stale or extra ${value}`);
}

export function validateReferenceSourceWiring(htmlText) {
  const wiringLines = htmlText.split(/\r?\n/).filter(line => line.includes('support.js'));
  assert(wiringLines.length === 1 && wiringLines[0].trim() === '<script src="./support.js"></script>', 'reference runtime wiring must be one exact, uncommented script line');
}

export async function checkDesignParity({ rootDir = root } = {}) {
  const inventory = JSON.parse(await readFile(resolve(rootDir, 'docs/features/design-parity/inventory.json'), 'utf8'));
  const shape = checkInventory(inventory);
  const html = await readFile(resolve(rootDir, expectedReference.file));
  const runtime = await readFile(resolve(rootDir, expectedReference.runtime));
  validateReferenceSourceWiring(html.toString('utf8'));
  assert(sha256(html) === expectedReference.sha256, 'committed design HTML hash drifted');
  assert(sha256(runtime) === expectedReference.runtimeSha256, 'committed design runtime hash drifted');
  assert(inventory.reference.sha256 === sha256(html), 'inventory HTML hash does not match committed bytes');
  assert(inventory.reference.runtimeSha256 === sha256(runtime), 'inventory runtime hash does not match committed bytes');

  const readme = await readFile(resolve(rootDir, 'design/README.md'));
  const receipt = await readFile(resolve(rootDir, 'design/IMPORT-RECEIPT.md'));
  assert(sha256(readme) === expectedReadmeSha256, 'design README hash drifted from the accepted sanitized handoff');
  assert(sha256(receipt) === expectedReceiptSha256, 'design import receipt hash drifted');
  assert(receipt.toString('utf8').includes('f311695b495ca9c321eb0b2390c52dcff9eeaf1cadc38f6a32ebc8aeb3ad5232'), 'receipt lost original README hash');
  assert(receipt.toString('utf8').includes(expectedReadmeSha256), 'receipt lost accepted README hash');

  const manifestPath = resolve(rootDir, 'design/vendor/manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const assets = await loadDesignAssetMap({ manifestPath, rootDir });
  assert(manifest.sourceFiles?.html === sha256(html), 'manifest HTML source hash is stale');
  assert(manifest.sourceFiles?.runtime === sha256(runtime), 'manifest runtime source hash is stale');
  const expectedUrls = new Set([
    ...externalUrls(runtime.toString('utf8')),
    ...[...html.toString('utf8').matchAll(/https:\/\/fonts\.googleapis\.com\/css2\?[^"']+/g)].map(match => match[0]),
  ]);
  for (const sourceUrl of [...expectedUrls]) {
    const response = assets.get(sourceUrl);
    assert(response, `manifest is missing source URL ${sourceUrl}`);
    if (response.contentType.startsWith('text/css')) {
      for (const nestedUrl of response.body.toString('utf8').matchAll(/url\((https:[^)]+)\)/g)) expectedUrls.add(nestedUrl[1]);
    }
  }
  assertExactSet(new Set(assets.keys()), expectedUrls, 'design asset manifest');
  return { ...shape, htmlSha256: sha256(html), runtimeSha256: sha256(runtime), assets: assets.size, status: 'valid-gap-inventory-and-assets' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href && process.argv.includes('--self-test')) {
  const inventory = JSON.parse(await readFile(inventoryPath, 'utf8'));
  checkInventory(inventory);
  const referenceHtml = (await readFile(resolve(root, expectedReference.file))).toString('utf8');
  validateReferenceSourceWiring(referenceHtml);
  const mutations = [
    ['missing reference metadata', value => ({ ...value, reference: undefined })],
    ['bad reference hash', value => ({ ...value, reference: { ...value.reference, sha256: '0'.repeat(64) } })],
    ['missing fixed tuple field', value => ({ ...value, fixedTuple: { ...value.fixedTuple, seed: undefined } })],
    ['bad row tuple field', value => ({ ...value, rows: value.rows.map((row, index) => index === 0 ? { ...row, tuple: { ...row.tuple, radius: '12px' } } : row) })],
    ['duplicate routes', value => ({ ...value, rows: value.rows.map((row, index) => index === 1 ? { ...row, referenceRoute: value.rows[0].referenceRoute } : row) })],
    ['missing capture evidence', value => ({ ...value, rows: value.rows.map((row, index) => index === 0 ? { ...row, evidence: { ...row.evidence, builtRaw: undefined } } : row) })],
    ['missing audit field', value => ({ ...value, rows: value.rows.map((row, index) => index === 0 ? { ...row, md3Audit: { ...row.md3Audit, components: { ...row.md3Audit.components, buttons: undefined } } } : row) })],
    ['missing evidence field', value => ({ ...value, rows: value.rows.map((row, index) => index === 0 ? { ...row, evidence: { ...row.evidence, diff: undefined } } : row) })],
    ['missing row', value => ({ ...value, rows: value.rows.slice(1) })],
    ['missing route', value => ({ ...value, rows: value.rows.map((row, index) => index === 0 ? { ...row, realBuiltRoute: undefined } : row) })],
    ['missing tuple field', value => ({ ...value, rows: value.rows.map((row, index) => index === 0 ? { ...row, tuple: { ...row.tuple, scale: undefined } } : row) })],
    ['missing audit', value => ({ ...value, rows: value.rows.map((row, index) => index === 0 ? { ...row, md3Audit: { status: 'pending', components: {} } } : row) })],
    ['missing diff reason', value => ({ ...value, rows: value.rows.map((row, index) => index === 0 ? { ...row, evidence: { ...row.evidence, diff: { status: 'pending' } } } : row) })],
    ['unapproved deviation', value => ({ ...value, rows: value.rows.map((row, index) => index === 0 ? { ...row, intentionalDeviations: [{}] } : row) })],
  ];
  for (const [name, mutate] of mutations) {
    let failed = false;
    try { checkInventory(mutate(inventory)); } catch { failed = true; }
    assert(failed, `negative mutation stayed green: ${name}`);
  }
  for (const [name, mutate] of [
    ['commented runtime wiring', source => source.replace('<script src="./support.js"></script>', '<!-- <script src="./support.js"></script> -->')],
    ['renamed runtime wiring', source => source.replace('./support.js', './support-renamed.js')],
  ]) {
    let failed = false;
    try { validateReferenceSourceWiring(mutate(referenceHtml)); } catch { failed = true; }
    assert(failed, `source mutation stayed green: ${name}`);
  }
  console.log('design-parity self-test: PASS (16 deliberate mutations red; baseline green)');
} else if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(await checkDesignParity(), null, 2));
}
