#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }

export function checkInventory(inventory) {
  assert(inventory && inventory.schemaVersion === 1, 'schemaVersion must be 1');
  assert(Array.isArray(inventory.rows), 'rows must be an array');
  const ids = inventory.rows.map(row => row.id);
  assert(ids.length === requiredIds.length, `expected exactly ${requiredIds.length} rows`);
  assert(new Set(ids).size === ids.length, 'row ids must be unique');
  for (const id of requiredIds) assert(ids.includes(id), `missing hand-written row ${id}`);
  for (const row of inventory.rows) {
    for (const field of ['id', 'group', 'screen', 'state', 'referenceFile', 'referenceRoute', 'realBuiltRoute', 'tuple', 'determinism', 'md3Audit', 'evidence', 'intentionalDeviations', 'sourceCommit', 'captureProvenance', 'status']) {
      assert(Object.hasOwn(row, field), `${row.id}: missing ${field}`);
    }
    assert(typeof row.referenceRoute === 'string' && row.referenceRoute.length > 0, `${row.id}: reference route must be non-empty`);
    assert(typeof row.realBuiltRoute === 'string' && row.realBuiltRoute.length > 0, `${row.id}: real built route must be non-empty`);
    assert(row.tuple && row.tuple.theme === 'light' && row.tuple.locale === 'en-US' && row.tuple.scale === 1, `${row.id}: wrong fixed tuple`);
    assert(row.tuple.viewport?.width === 816 && row.tuple.viewport?.height === 639, `${row.id}: wrong viewport`);
    for (const key of ['fixture', 'time', 'motion', 'random', 'fonts', 'network']) assert(typeof row.determinism[key] === 'string' && row.determinism[key].length > 0, `${row.id}: missing determinism.${key}`);
    assert(row.md3Audit && row.md3Audit.status === 'pending', `${row.id}: audit must remain pending until capture review`);
    for (const key of requiredAudit) assert(Object.hasOwn(row.md3Audit.components ?? {}, key), `${row.id}: missing audit component ${key}`);
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
    assert(row.status === 'gap', `${row.id}: this lane cannot claim parity before real captures`);
    assert(typeof row.gapReason === 'string' && row.gapReason.length > 0, `${row.id}: gapReason required`);
    assert(row.parityClaimed === false, `${row.id}: gap rows may not claim parity`);
  }
  return { rows: inventory.rows.length, status: 'valid-gap-inventory' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href && process.argv.includes('--self-test')) {
  const inventory = JSON.parse(await readFile(inventoryPath, 'utf8'));
  checkInventory(inventory);
  const mutations = [
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
  console.log('design-parity self-test: PASS (6 deliberate mutations red; baseline green)');
} else if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const inventory = JSON.parse(await readFile(inventoryPath, 'utf8'));
  console.log(JSON.stringify(checkInventory(inventory), null, 2));
}
