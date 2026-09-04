#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
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
const expectedSourceCommit = 'af5d9a4700692d47b97d40e438bd5c08d3d3b9fc';
const execFileAsync = promisify(execFile);

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
  assert(inventory.sourceCommit === expectedSourceCommit, 'inventory sourceCommit is not pinned to the declared baseline');
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
    assert(row.md3Audit && ['pending', 'complete'].includes(row.md3Audit.status), `${row.id}: audit status must be pending or complete`);
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
    assert(row.sourceCommit === inventory.sourceCommit, `${row.id}: sourceCommit differs from the pinned inventory provenance`);
    // A row may now be verified, but only with everything that makes the claim
    // checkable. Before this, every row was forced to 'gap' -- correct while no
    // captures existed, and impossible to move off once they did.
    assert(['gap', 'verified'].includes(row.status), `${row.id}: status must be gap or verified`);
    assert(row.parityClaimed === (row.status === 'verified'), `${row.id}: parityClaimed must match status`);

    if (row.status === 'gap') {
      assert(typeof row.gapReason === 'string' && row.gapReason.length > 0, `${row.id}: gapReason required`);
      continue;
    }

    // Everything below is what 'verified' has to survive.
    assert(!row.gapReason, `${row.id}: a verified row may not also carry a gapReason`);
    assert(typeof row.resolvedBuiltRoute === 'string' && /^\/[A-Za-z0-9/$._-]*$/.test(row.resolvedBuiltRoute),
      `${row.id}: verified rows need a real resolvedBuiltRoute -- the app:// string is an identifier, not a route the app implements`);
    assert(typeof row.builtInteraction === 'string' && row.builtInteraction.length > 0,
      `${row.id}: verified rows must say how the built state was reached`);

    assert(row.md3Audit.status === 'complete', `${row.id}: a verified row needs a completed Material Design 3 audit`);
    for (const key of requiredAudit) {
      const component = row.md3Audit.components[key];
      assert(component.status !== 'pending', `${row.id}: audit component ${key} is still pending`);
      assert(typeof component.evidence === 'string' && component.evidence.length > 0,
        `${row.id}: audit component ${key} needs evidence naming what in the capture supports it`);
      assert(typeof component.reviewer === 'string' && component.reviewer.length > 0, `${row.id}: audit component ${key} needs a reviewer`);
      assert(typeof component.reviewedAt === 'string' && component.reviewedAt.length > 0, `${row.id}: audit component ${key} needs reviewedAt`);
      // A defect is an open problem, not an accepted approximation. Strict
      // Material Design 3 means it is fixed, not signed off.
      assert(component.status !== 'defect', `${row.id}: audit component ${key} is a defect, so this row cannot be verified`);
      if (component.status === 'intentional-deviation') {
        assert(row.intentionalDeviations.some((d) => d.component === key),
          `${row.id}: audit component ${key} claims an intentional deviation with no matching entry in intentionalDeviations`);
      }
    }

    for (const key of requiredEvidence) {
      const evidence = row.evidence[key];
      assert(evidence.status === 'verified' || (evidence.status === 'not-applicable' && evidence.reason),
        `${row.id}: verified rows need every evidence slot verified, or not-applicable with a reason -- ${key} is ${evidence.status}`);
    }

    const provenance = row.captureProvenance;
    assert(provenance && typeof provenance === 'object', `${row.id}: verified rows need captureProvenance`);
    for (const key of ['tool', 'capturedAt', 'capturedOn', 'builtArtifactSha256', 'commit']) {
      assert(typeof provenance[key] === 'string' && provenance[key].length > 0, `${row.id}: captureProvenance.${key} is required`);
    }
    assert(provenance.dirty === false, `${row.id}: captures taken from a dirty tree are not evidence`);
  }
  const gap = inventory.rows.filter((r) => r.status === 'gap').length;
  const verified = inventory.rows.length - gap;
  return { rows: inventory.rows.length, gap, verified };
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
  try {
    await execFileAsync('git', ['cat-file', '-e', `${expectedSourceCommit}^{commit}`], { cwd: rootDir, windowsHide: true });
  } catch {
    fail(`sourceCommit ${expectedSourceCommit} is not present in the local Git object database`);
  }
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
  const bytes = checkEvidenceBytes(inventory);
  return { ...shape, htmlSha256: sha256(html), runtimeSha256: sha256(runtime), assets: assets.size, ...bytes, status: 'valid-inventory-and-assets' };
}


/**
 * Prove the evidence a verified row cites actually exists and is what it says.
 *
 * Everything above this reasons about the inventory JSON alone -- so a row could
 * claim parity from a sha256 that was never written by anything, and the guard
 * would agree. This is the half that opens the files.
 *
 *   1. every verified evidence file exists and RE-HASHES from disk to its record
 *   2. the two raw captures are PNGs whose IHDR says exactly the tuple size,
 *      so the tuple is proved on both sides rather than merely declared
 *   3. the diff record agrees with the two raw hashes and the tuple
 *   4. no sha256 is shared across rows -- which is what catches evidence
 *      copy-pasted from a row that did capture onto one that did not
 */
export function checkEvidenceBytes(inventory, { rootDir = root } = {}) {
  const seen = new Map();
  let files = 0;
  for (const row of inventory.rows) {
    if (row.status !== 'verified') continue;
    const hashes = {};
    for (const key of requiredEvidence) {
      const evidence = row.evidence[key];
      if (evidence.status !== 'verified') continue;
      const file = resolve(rootDir, evidence.path);
      assert(existsSync(file), `${row.id}: ${key} cites ${evidence.path}, which does not exist`);
      const bytes = readFileSync(file);
      const actual = createHash('sha256').update(bytes).digest('hex');
      assert(
        actual === evidence.sha256,
        `${row.id}: ${key} re-hashes to ${actual} but the inventory records ${evidence.sha256} -- the evidence on disk is not the evidence being claimed`,
      );
      hashes[key] = actual;
      files += 1;

      const owner = seen.get(actual);
      assert(
        !owner,
        `${row.id}: ${key} has the same bytes as ${owner} -- two rows cannot share one capture, so one of them did not capture`,
      );
      seen.set(actual, `${row.id}.${key}`);

      if (key === 'referenceRaw' || key === 'builtRaw') {
        // PNG: 8-byte signature, then a 13-byte IHDR whose width and height are
        // big-endian at offsets 16 and 20. No dependency, and it reads the real
        // pixels rather than a filename that claims a size.
        assert(bytes.length > 24 && bytes.readUInt32BE(0) === 0x89504e47, `${row.id}: ${key} is not a PNG`);
        const width = bytes.readUInt32BE(16);
        const height = bytes.readUInt32BE(20);
        assert(
          width === inventory.fixedTuple.width && height === inventory.fixedTuple.height,
          `${row.id}: ${key} is ${width}x${height}, but the comparison tuple is ${inventory.fixedTuple.width}x${inventory.fixedTuple.height}`,
        );
      }
    }

    const diff = row.evidence.diff;
    if (diff?.status === 'verified') {
      const record = JSON.parse(readFileSync(resolve(rootDir, diff.path), 'utf8'));
      assert(record.rowId === row.id, `${row.id}: diff record is for ${record.rowId}`);
      for (const [key, field] of [['referenceRaw', 'referenceSha256'], ['builtRaw', 'builtSha256']]) {
        if (!hashes[key]) continue;
        assert(
          record[field] === hashes[key],
          `${row.id}: the diff record was computed from a different ${key} than the one this row cites`,
        );
      }
      assert(
        record.pixelTotal === inventory.fixedTuple.width * inventory.fixedTuple.height,
        `${row.id}: diff record covers ${record.pixelTotal} pixels, not the tuple's frame`,
      );
    }
  }
  return { verifiedRows: inventory.rows.filter((r) => r.status === 'verified').length, evidenceFiles: files };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href && process.argv.includes('--self-test')) {
  const inventory = JSON.parse(await readFile(inventoryPath, 'utf8'));
  checkInventory(inventory);
  const referenceHtml = (await readFile(resolve(root, expectedReference.file))).toString('utf8');
  validateReferenceSourceWiring(referenceHtml);
  const mutations = [
    ['missing reference metadata', value => ({ ...value, reference: undefined })],
    ['bad reference hash', value => ({ ...value, reference: { ...value.reference, sha256: '0'.repeat(64) } })],
    ['bad source provenance', value => ({ ...value, sourceCommit: '1'.repeat(40) })],
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
  // The verified path needs its own baseline, because every mutation below is
  // a mutation OF a verified row. Building one and proving it green first is
  // what stops the eight checks under it going red for the wrong reason -- a
  // mutation that fails because the baseline was already invalid tests nothing.
  const auditComponent = (status = 'conforming') => ({
    status,
    evidence: 'self-test fixture',
    reviewer: 'self-test',
    reviewedAt: '2026-01-01T00:00:00.000Z',
  });
  const verifyRow = (row, overrides = {}) => ({
    ...row,
    status: 'verified',
    parityClaimed: true,
    gapReason: undefined,
    resolvedBuiltRoute: '/models',
    builtInteraction: 'self-test fixture',
    intentionalDeviations: [],
    md3Audit: {
      status: 'complete',
      components: Object.fromEntries(requiredAudit.map((key) => [key, auditComponent()])),
    },
    evidence: Object.fromEntries(
      requiredEvidence.map((key) => [key, { status: 'verified', path: `x/${key}.png`, sha256: 'a'.repeat(64) }]),
    ),
    captureProvenance: {
      tool: 'self-test',
      capturedAt: '2026-01-01T00:00:00.000Z',
      capturedOn: 'self-test',
      builtArtifactSha256: 'b'.repeat(64),
      commit: row.sourceCommit,
      dirty: false,
    },
    ...overrides,
  });
  const withVerifiedFirstRow = (value, overrides = {}) => ({
    ...value,
    rows: value.rows.map((row, index) => (index === 0 ? verifyRow(row, overrides) : row)),
  });

  // Baseline: a correctly formed verified row must PASS. If this throws, every
  // verified mutation below is meaningless.
  checkInventory(withVerifiedFirstRow(inventory));

  const verifiedMutations = [
    ['verified row not claiming parity', value => withVerifiedFirstRow(value, { parityClaimed: false })],
    ['verified row still carrying a gapReason', value => withVerifiedFirstRow(value, { gapReason: 'still unproven' })],
    ['verified row with a pending audit component', value => withVerifiedFirstRow(value, {
      md3Audit: { status: 'complete', components: Object.fromEntries(requiredAudit.map((k, i) => [k, auditComponent(i === 0 ? 'pending' : 'conforming')])) },
    })],
    ['verified row with a defect component', value => withVerifiedFirstRow(value, {
      md3Audit: { status: 'complete', components: Object.fromEntries(requiredAudit.map((k, i) => [k, auditComponent(i === 3 ? 'defect' : 'conforming')])) },
    })],
    ['verified row whose audit is still pending overall', value => withVerifiedFirstRow(value, {
      md3Audit: { status: 'pending', components: Object.fromEntries(requiredAudit.map((k) => [k, auditComponent()])) },
    })],
    ['audit component with no evidence naming what supports it', value => withVerifiedFirstRow(value, {
      md3Audit: { status: 'complete', components: Object.fromEntries(requiredAudit.map((k, i) => [k, i === 1 ? { ...auditComponent(), evidence: '' } : auditComponent()])) },
    })],
    ['deviation claimed by the audit with no matching entry', value => withVerifiedFirstRow(value, {
      md3Audit: { status: 'complete', components: Object.fromEntries(requiredAudit.map((k, i) => [k, auditComponent(i === 2 ? 'intentional-deviation' : 'conforming')])) },
      intentionalDeviations: [],
    })],
    ['verified row with an unproven evidence slot', value => withVerifiedFirstRow(value, {
      evidence: Object.fromEntries(requiredEvidence.map((k, i) => [k, i === 2 ? { status: 'pending', reason: 'not taken' } : { status: 'verified', path: 'x.png', sha256: 'a'.repeat(64) }])),
    })],
    ['verified row with no resolvedBuiltRoute -- the app:// string is an identifier', value => withVerifiedFirstRow(value, { resolvedBuiltRoute: undefined })],
    ['verified row with the app:// identifier passed off as a real route', value => withVerifiedFirstRow(value, { resolvedBuiltRoute: 'app://material-ollama/capture/shell' })],
    ['verified row that never says how the state was reached', value => withVerifiedFirstRow(value, { builtInteraction: '' })],
    ['verified row with no capture provenance', value => withVerifiedFirstRow(value, { captureProvenance: undefined })],
    ['captures taken from a dirty tree', value => withVerifiedFirstRow(value, {
      captureProvenance: { tool: 't', capturedAt: 'a', capturedOn: 'b', builtArtifactSha256: 'c', commit: 'd', dirty: true },
    })],
  ];
  for (const [name, mutate] of verifiedMutations) {
    let failed = false;
    try { checkInventory(mutate(inventory)); } catch { failed = true; }
    assert(failed, `verified mutation stayed green: ${name}`);
  }

  for (const [name, mutate] of [
    ['commented runtime wiring', source => source.replace('<script src="./support.js"></script>', '<!-- <script src="./support.js"></script> -->')],
    ['renamed runtime wiring', source => source.replace('./support.js', './support-renamed.js')],
  ]) {
    let failed = false;
    try { validateReferenceSourceWiring(mutate(referenceHtml)); } catch { failed = true; }
    assert(failed, `source mutation stayed green: ${name}`);
  }
  console.log(
    `design-parity self-test: PASS (${mutations.length + verifiedMutations.length + 2} deliberate mutations red; ` +
      'gap baseline and verified baseline both green)',
  );
} else if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(await checkDesignParity(), null, 2));
}
