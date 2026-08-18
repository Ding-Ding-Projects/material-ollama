#!/usr/bin/env node

/**
 * Structural and completion checker for the shared user-facing feature
 * inventory.  The feature list below is deliberately hand-written: a checker
 * that derives its expected list from the inventory cannot notice a feature
 * that disappeared from the inventory itself.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INVENTORY_PATH = path.join(ROOT, 'docs', 'features', 'uh-completeness', 'inventory.json');

const REQUIRED_SURFACES = ['desktop-app', 'landing-page'];
const REQUIRED_EVIDENCE_KEYS = [
  'status',
  'implementation',
  'documentation',
  'localizedCopy',
  'persistence',
  'focusedCheck',
  'builtArtifactProof',
  'captureEvidence',
];

// Keep this list in lockstep with the canonical feature contract. Exact IDs
// are used throughout; no substring or descendant matching is permitted.
const REQUIRED_FEATURE_IDS = [
  'language-modes',
  'funny-level-controls',
  'dialog-emoji-toggle',
  'school-mode',
  'personal-vocabulary',
  'narration',
  'narrator-voice-selection',
  'scheduled-settings',
  'external-settings-sources',
  'dim-sum-surprise',
  'dim-sum-release-catalog',
  'regex-builder',
  'notifications',
  'notification-center',
  'accessibility',
  'responsive-layout-and-sizing',
  'material-design',
  'appearance-editor',
  'infinite-color-translator',
  'app-logo-customization',
  'file-converter',
  'ollama-suite-manager',
  'model-store',
  'hardware-fit',
  'batch-pull-queue',
  'local-chat-sessions',
  'harness-profiles',
  'browser-tabs',
  'tab-docking-overflow',
  'tab-groups',
  'tab-discovery-searches',
  'tab-bulk-close',
  'offline-documentation-browser',
  'landing-page-boundary',
  'command-palette',
  'destructive-super-confirmation',
  'local-version-history',
  'changelog-viewer',
  'external-editor',
  'exports',
  'bulk-actions',
  'toy-locks',
  'support-tickets',
  'unlock-ladder',
  'two-factor-qr-pairing',
  'built-in-authenticator',
  'browser-extension-download-capture',
  'shared-link-embed',
  'provider-authored-renderer',
  'guided-forms',
  'rich-controls',
  'settings-explanations-provenance',
  'overlays',
  'context-menu-shortcuts',
  'long-operation-progress',
  'failure-recovery',
  'forge-publishing',
  'collapsible-filters',
  'blank-slate-presets',
  'app-display-name',
  'secret-display-history',
  'cli-gui-parity',
  'gui-capability-registry',
  'config-profiles',
  'status-hub',
  'status-discord-bridge',
  'tidbyt-status-display',
  'vocabulary-hash-lock',
  'sanitized-instruction-copy',
  'repository-root-build-script',
  'dependency-bootstrap',
  'bundled-runtime-dependencies',
  'unsigned-release-policy',
  'release-line-count',
  'issue-handoff',
  'rolling-discussion',
  'project-status',
  'site-homepage-link',
  'api-documentation-and-collection',
  'capture-manifest',
  'release-metadata',
  'cheap-transfer',
  'automatic-updates',
  'packaged-app-icon',
  'no-network-privacy',
];

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

function validateInventory(inventory, { requireComplete = false } = {}) {
  const errors = [];
  if (!inventory || typeof inventory !== 'object' || Array.isArray(inventory)) {
    return ['inventory must be an object'];
  }
  if (inventory.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (!Array.isArray(inventory.features)) errors.push('features must be an array');
  if (inventory.features?.length !== REQUIRED_FEATURE_IDS.length) {
    errors.push(`features must contain exactly ${REQUIRED_FEATURE_IDS.length} rows`);
  }

  const rows = inventory.features ?? [];
  const expectedSet = new Set(REQUIRED_FEATURE_IDS);
  const seen = new Set();
  for (const [index, row] of rows.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      errors.push(`features[${index}] must be an object`);
      continue;
    }
    if (typeof row.id !== 'string' || !expectedSet.has(row.id)) {
      errors.push(`features[${index}].id is not an exact canonical feature ID`);
      continue;
    }
    if (seen.has(row.id)) errors.push(`duplicate feature ID: ${row.id}`);
    seen.add(row.id);
    if (typeof row.title !== 'string' || row.title.trim() === '') {
      errors.push(`${row.id}.title must be non-empty`);
    }
    if (typeof row.contract !== 'string' || row.contract.trim() === '') {
      errors.push(`${row.id}.contract must be non-empty`);
    }
    if (typeof row.article !== 'string' || row.article.trim() === '') {
      errors.push(`${row.id}.article must name its documentation article`);
    }
    if (!exactKeys(row.surfaces, REQUIRED_SURFACES)) {
      errors.push(`${row.id}.surfaces must contain exactly desktop-app and landing-page`);
      continue;
    }
    for (const surfaceId of REQUIRED_SURFACES) {
      const evidence = row.surfaces[surfaceId];
      if (!exactKeys(evidence, REQUIRED_EVIDENCE_KEYS)) {
        errors.push(`${row.id}.${surfaceId} has incomplete evidence keys`);
        continue;
      }
      if (!['missing', 'in-progress', 'verified', 'not-applicable'].includes(evidence.status)) {
        errors.push(`${row.id}.${surfaceId}.status is invalid`);
      }
      for (const key of REQUIRED_EVIDENCE_KEYS.slice(1)) {
        if (evidence[key] !== null && typeof evidence[key] !== 'string') {
          errors.push(`${row.id}.${surfaceId}.${key} must be a string or null`);
        }
      }
      if (requireComplete) {
        if (evidence.status !== 'verified') {
          errors.push(`${row.id}.${surfaceId} is ${evidence.status}, not verified`);
        }
        for (const key of REQUIRED_EVIDENCE_KEYS.slice(1)) {
          if (typeof evidence[key] !== 'string' || evidence[key].trim() === '') {
            errors.push(`${row.id}.${surfaceId}.${key} is missing completion evidence`);
          }
        }
      }
    }
  }
  for (const id of REQUIRED_FEATURE_IDS) {
    if (!seen.has(id)) errors.push(`missing canonical feature row: ${id}`);
  }
  return errors;
}

function loadInventory() {
  return JSON.parse(fs.readFileSync(INVENTORY_PATH, 'utf8'));
}

function assertStructuralNegativeRegression(inventory) {
  const baselineErrors = validateInventory(inventory);
  if (baselineErrors.length > 0) {
    throw new Error(`baseline inventory is structurally invalid:\n${baselineErrors.join('\n')}`);
  }

  // Deliberately remove one exact row. This proves the check catches absence,
  // not merely malformed rows that happen to remain in the data.
  const broken = JSON.parse(JSON.stringify(inventory));
  const targetId = 'language-modes';
  const targetIndex = broken.features.findIndex((row) => row.id === targetId);
  if (targetIndex < 0) throw new Error(`self-test target row not found: ${targetId}`);
  const [removed] = broken.features.splice(targetIndex, 1);
  const brokenErrors = validateInventory(broken);
  if (brokenErrors.length === 0) {
    throw new Error(`negative regression stayed green after removing exact row: ${targetId}`);
  }

  // Restore the exact row and require the checker to return green again.
  broken.features.splice(targetIndex, 0, removed);
  const restoredErrors = validateInventory(broken);
  if (restoredErrors.length > 0) {
    throw new Error(`negative regression did not recover after restoring ${targetId}:\n${restoredErrors.join('\n')}`);
  }
}

const requireComplete = process.argv.includes('--require-complete');
const selfTest = process.argv.includes('--self-test');
const inventory = loadInventory();
const errors = validateInventory(inventory, { requireComplete });

if (selfTest) {
  assertStructuralNegativeRegression(inventory);
  console.log('PASS: inventory negative regression turned red on exact row removal and green after restoration');
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(requireComplete ? 'PASS: inventory is complete' : 'PASS: inventory structure is valid');
}
