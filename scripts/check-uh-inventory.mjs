#!/usr/bin/env node

/**
 * Structural and completion checker for the shared user-facing feature
 * inventory.  The feature list below is deliberately hand-written: a checker
 * that derives its expected list from the inventory cannot notice a feature
 * that disappeared from the inventory itself.
 *
 * Evidence is not just present-or-absent text. Every non-null evidence
 * field is resolved against the real filesystem (or, in --self-test, an
 * injected in-memory filesystem): a path that does not exist, a test name
 * that is not actually declared, or a hash that does not match the real
 * file bytes all fail the gate. A row may only claim `verified` once every
 * one of its seven evidence fields genuinely resolves.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
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
const REQUIRED_SURFACE_ROW_KEYS = ['featureId', 'evidenceRef'];
const REQUIRED_LANDING_ROW_KEYS = ['featureId', 'evidenceRef', 'responsiveEvidence'];
const REQUIRED_RESPONSIVE_EVIDENCE_KEYS = [
  'status',
  'minWidth',
  'orientation',
  'touchTargets',
  'horizontalOverflow',
  'viewportBoundedOverlays',
];
const VALID_STATUSES = ['missing', 'in-progress', 'verified', 'not-applicable'];
const NOT_APPLICABLE_REASON_MIN_LENGTH = 20;

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

// ---------------------------------------------------------------------------
// Filesystem adapters
//
// Every evidence resolver receives an `fs` adapter rather than talking to
// `node:fs` directly, so --self-test can exercise every resolver against an
// injected in-memory filesystem instead of writing real files to disk.
// ---------------------------------------------------------------------------

const REAL_FS_ADAPTER = {
  existsSync: (absPath) => fs.existsSync(absPath),
  isFile: (absPath) => {
    try {
      return fs.statSync(absPath).isFile();
    } catch {
      return false;
    }
  },
  readFileBuffer: (absPath) => fs.readFileSync(absPath),
  readFileText: (absPath) => fs.readFileSync(absPath, 'utf8'),
};

function resolvePath(root, relPath) {
  return path.join(root, relPath);
}

function isSafeRelativePath(relPath) {
  if (typeof relPath !== 'string' || relPath.trim() === '') return false;
  if (path.isAbsolute(relPath)) return false;
  const normalized = path.normalize(relPath);
  if (normalized === '..' || normalized.startsWith(`..${path.sep}`)) return false;
  return true;
}

// Strip line endings and drop the single trailing empty entry that a final
// newline produces, so counting a file's own trailing newline never counts
// as an extra line (a real trap: see the shared instructions' notes on
// exactly this off-by-one).
function splitLines(content) {
  const normalized = content.replace(/\r\n|\r/g, '\n');
  const withoutTrailingNewline = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized;
  if (withoutTrailingNewline === '') return [];
  return withoutTrailingNewline.split('\n');
}

function slugifyHeading(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w\- ]+/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function extractHeadingSlugs(markdown) {
  const slugs = [];
  for (const line of splitLines(markdown)) {
    const m = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (m) slugs.push(slugifyHeading(m[1]));
  }
  return slugs;
}

function containsDictKey(content, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`['"\`]${escaped}['"\`]`);
  return pattern.test(content);
}

function fail(code, message) {
  return { ok: false, code, message };
}

const OK = { ok: true };

// ---------------------------------------------------------------------------
// Evidence field resolvers
//
// Each resolver takes the raw evidence string and a context
// { root, fs, row } and returns { ok: true } or { ok: false, code, message }.
// The code is what --self-test asserts fired; it is deliberately distinct
// per meaningfully different failure so a guard case can prove precisely
// which check caught its mutation.
// ---------------------------------------------------------------------------

function resolveImplementation(value, ctx) {
  const segments = value.split(',').map((s) => s.trim()).filter((s) => s !== '');
  if (segments.length === 0) {
    return fail('IMPL_PATH_NOT_FOUND', 'implementation must name at least one repo path');
  }
  for (const segment of segments) {
    const m = segment.match(/^(.+?)#L(\d+)-L(\d+)$/);
    const relPath = m ? m[1] : segment;
    if (!isSafeRelativePath(relPath)) {
      return fail('IMPL_PATH_NOT_FOUND', `implementation path '${relPath}' is not a safe repo-relative path`);
    }
    const abs = resolvePath(ctx.root, relPath);
    if (!ctx.fs.existsSync(abs) || !ctx.fs.isFile(abs)) {
      return fail('IMPL_PATH_NOT_FOUND', `implementation path '${relPath}' does not exist`);
    }
    if (m) {
      const start = Number(m[2]);
      const end = Number(m[3]);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
        return fail('IMPL_LINE_RANGE_OUT_OF_BOUNDS', `implementation line range #L${m[2]}-L${m[3]} in '${relPath}' is invalid`);
      }
      const totalLines = splitLines(ctx.fs.readFileText(abs)).length;
      if (end > totalLines) {
        return fail(
          'IMPL_LINE_RANGE_OUT_OF_BOUNDS',
          `implementation line range #L${m[2]}-L${m[3]} exceeds ${totalLines} lines in '${relPath}'`,
        );
      }
    }
  }
  return OK;
}

function resolveDocumentation(value, ctx) {
  const hashIndex = value.indexOf('#');
  const docPath = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
  const headingSlug = hashIndex >= 0 ? value.slice(hashIndex + 1) : null;
  if (docPath !== ctx.row.article) {
    return fail(
      'DOC_MUST_MATCH_ARTICLE',
      `documentation path '${docPath}' must equal the row's own article '${ctx.row.article}'`,
    );
  }
  if (!isSafeRelativePath(docPath)) {
    return fail('DOC_ARTICLE_NOT_FOUND', `documentation article '${docPath}' is not a safe repo-relative path`);
  }
  const abs = resolvePath(ctx.root, docPath);
  if (!ctx.fs.existsSync(abs) || !ctx.fs.isFile(abs)) {
    return fail('DOC_ARTICLE_NOT_FOUND', `documentation article '${docPath}' does not exist`);
  }
  if (headingSlug !== null && headingSlug !== '') {
    const slugs = extractHeadingSlugs(ctx.fs.readFileText(abs));
    if (!slugs.includes(headingSlug)) {
      return fail('DOC_HEADING_NOT_FOUND', `heading slug '${headingSlug}' was not found in '${docPath}'`);
    }
  }
  return OK;
}

function resolveLocalizedCopy(value, ctx) {
  if (value.startsWith('no-copy:')) {
    const reason = value.slice('no-copy:'.length).trim();
    if (reason === '') {
      return fail('LOCALIZED_COPY_FORMAT_INVALID', 'no-copy reason must not be empty');
    }
    return OK;
  }
  const hashIndex = value.lastIndexOf('#');
  if (hashIndex <= 0 || hashIndex === value.length - 1) {
    return fail(
      'LOCALIZED_COPY_FORMAT_INVALID',
      `localizedCopy '${value}' must be '<path>#<key>' or 'no-copy: <reason>'`,
    );
  }
  const relPath = value.slice(0, hashIndex);
  const key = value.slice(hashIndex + 1);
  if (!isSafeRelativePath(relPath)) {
    return fail('LOCALIZED_COPY_PATH_NOT_FOUND', `localizedCopy path '${relPath}' is not a safe repo-relative path`);
  }
  const abs = resolvePath(ctx.root, relPath);
  if (!ctx.fs.existsSync(abs) || !ctx.fs.isFile(abs)) {
    return fail('LOCALIZED_COPY_PATH_NOT_FOUND', `localizedCopy path '${relPath}' does not exist`);
  }
  if (!containsDictKey(ctx.fs.readFileText(abs), key)) {
    return fail('LOCALIZED_COPY_KEY_NOT_FOUND', `localizedCopy key '${key}' was not found in '${relPath}'`);
  }
  return OK;
}

function resolvePersistence(value, ctx) {
  if (value.startsWith('not-persisted:')) {
    const reason = value.slice('not-persisted:'.length).trim();
    if (reason === '') {
      return fail('PERSISTENCE_FORMAT_INVALID', 'not-persisted reason must not be empty');
    }
    return OK;
  }
  if (!isSafeRelativePath(value)) {
    return fail('PERSISTENCE_PATH_NOT_FOUND', `persistence path '${value}' is not a safe repo-relative path`);
  }
  const abs = resolvePath(ctx.root, value);
  if (!ctx.fs.existsSync(abs) || !ctx.fs.isFile(abs)) {
    return fail('PERSISTENCE_PATH_NOT_FOUND', `persistence path '${value}' does not exist`);
  }
  return OK;
}

// Line-anchored on purpose: a plain substring check on the test name still
// matches after the call is renamed (the old name can be a substring of the
// new one, or vice versa) and still matches after the whole line is
// commented out (the text is still sitting right there in the file). Anchor
// to the start of the line so a renamed test simply has no line whose
// extracted literal equals the recorded name, and a commented-out line
// starts with `//` rather than `it(`/`test(`/`func Test`, so it never
// matches at all.
function resolveFocusedCheck(value, ctx) {
  const sepIndex = value.indexOf('::');
  if (sepIndex <= 0 || sepIndex + 2 >= value.length) {
    return fail('FOCUSED_CHECK_FORMAT_INVALID', `focusedCheck '${value}' must be '<test file>::<exact test name>'`);
  }
  const relPath = value.slice(0, sepIndex);
  const testName = value.slice(sepIndex + 2);
  if (!isSafeRelativePath(relPath)) {
    return fail('FOCUSED_CHECK_FILE_NOT_FOUND', `focusedCheck file '${relPath}' is not a safe repo-relative path`);
  }
  const abs = resolvePath(ctx.root, relPath);
  if (!ctx.fs.existsSync(abs) || !ctx.fs.isFile(abs)) {
    return fail('FOCUSED_CHECK_FILE_NOT_FOUND', `focusedCheck file '${relPath}' does not exist`);
  }
  const isGo = relPath.endsWith('.go');
  const lines = splitLines(ctx.fs.readFileText(abs));
  const found = lines.some((line) => {
    if (isGo) {
      const m = line.match(/^func\s+(Test\w+)\s*\(/);
      return m !== null && m[1] === testName;
    }
    const m = line.match(/^\s*(?:it|test)\(\s*(['"`])((?:\\.|(?!\1).)*)\1/);
    return m !== null && m[2] === testName;
  });
  if (!found) {
    return fail(
      'FOCUSED_CHECK_TEST_NOT_FOUND',
      `focusedCheck test '${testName}' was not found as a line-anchored declaration in '${relPath}'`,
    );
  }
  return OK;
}

function resolveCaptureEvidence(value, ctx) {
  const m = value.match(/^(.+)@sha256:([0-9a-fA-F]{64})$/);
  if (!m) {
    return fail('CAPTURE_FORMAT_INVALID', `captureEvidence '${value}' must be '<path>@sha256:<64 hex>'`);
  }
  const relPath = m[1];
  const expectedHash = m[2].toLowerCase();
  if (!isSafeRelativePath(relPath)) {
    return fail('CAPTURE_FILE_NOT_FOUND', `captureEvidence path '${relPath}' is not a safe repo-relative path`);
  }
  const abs = resolvePath(ctx.root, relPath);
  if (!ctx.fs.existsSync(abs) || !ctx.fs.isFile(abs)) {
    return fail('CAPTURE_FILE_NOT_FOUND', `captureEvidence path '${relPath}' does not exist`);
  }
  const actualHash = crypto.createHash('sha256').update(ctx.fs.readFileBuffer(abs)).digest('hex');
  if (actualHash !== expectedHash) {
    return fail(
      'CAPTURE_HASH_MISMATCH',
      `captureEvidence hash for '${relPath}' (sha256:${actualHash}) does not match recorded sha256:${expectedHash}`,
    );
  }
  return OK;
}

function resolveBuiltArtifactProof(value, ctx) {
  const hashIndex = value.indexOf('#');
  if (hashIndex <= 0 || hashIndex === value.length - 1) {
    return fail('ARTIFACT_FORMAT_INVALID', `builtArtifactProof '${value}' must be '<manifest path>#<dot.key.path>'`);
  }
  const relPath = value.slice(0, hashIndex);
  const keyPath = value.slice(hashIndex + 1);
  if (!isSafeRelativePath(relPath)) {
    return fail('ARTIFACT_MANIFEST_NOT_FOUND', `builtArtifactProof manifest '${relPath}' is not a safe repo-relative path`);
  }
  const abs = resolvePath(ctx.root, relPath);
  if (!ctx.fs.existsSync(abs) || !ctx.fs.isFile(abs)) {
    return fail('ARTIFACT_MANIFEST_NOT_FOUND', `builtArtifactProof manifest '${relPath}' does not exist`);
  }
  let parsed;
  try {
    parsed = JSON.parse(ctx.fs.readFileText(abs));
  } catch {
    return fail('ARTIFACT_MANIFEST_INVALID_JSON', `builtArtifactProof manifest '${relPath}' is not valid JSON`);
  }
  const segments = keyPath.split('.').filter((s) => s !== '');
  if (segments.length === 0) {
    return fail('ARTIFACT_FORMAT_INVALID', `builtArtifactProof '${value}' must name a non-empty dot.key.path`);
  }
  let cursor = parsed;
  for (const segment of segments) {
    if (cursor === null || typeof cursor !== 'object' || !(segment in cursor)) {
      return fail('ARTIFACT_KEY_NOT_FOUND', `builtArtifactProof key '${keyPath}' was not found in '${relPath}'`);
    }
    cursor = cursor[segment];
  }
  if (cursor === undefined) {
    return fail('ARTIFACT_KEY_NOT_FOUND', `builtArtifactProof key '${keyPath}' resolved to undefined in '${relPath}'`);
  }
  return OK;
}

function resolveEvidenceField(key, value, ctx) {
  switch (key) {
    case 'implementation':
      return resolveImplementation(value, ctx);
    case 'documentation':
      return resolveDocumentation(value, ctx);
    case 'localizedCopy':
      return resolveLocalizedCopy(value, ctx);
    case 'persistence':
      return resolvePersistence(value, ctx);
    case 'focusedCheck':
      return resolveFocusedCheck(value, ctx);
    case 'builtArtifactProof':
      return resolveBuiltArtifactProof(value, ctx);
    case 'captureEvidence':
      return resolveCaptureEvidence(value, ctx);
    default:
      return OK;
  }
}

function guardError(featureId, surfaceId, key, code, message) {
  return `${featureId}.${surfaceId}.${key} [${code}] ${message}`;
}

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

// ---------------------------------------------------------------------------
// Structural + evidence validation
// ---------------------------------------------------------------------------

function validateInventory(inventory, { requireComplete = false, fsAdapter = REAL_FS_ADAPTER, root = ROOT } = {}) {
  const errors = [];
  if (!inventory || typeof inventory !== 'object' || Array.isArray(inventory)) {
    return ['inventory must be an object'];
  }
  if (inventory.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (!Array.isArray(inventory.features)) errors.push('features must be an array');
  if (inventory.features?.length !== REQUIRED_FEATURE_IDS.length) {
    errors.push(`features must contain exactly ${REQUIRED_FEATURE_IDS.length} rows`);
  }

  if (!exactKeys(inventory.surfaceRows, REQUIRED_SURFACES)) {
    errors.push('surfaceRows must contain exactly desktop-app and landing-page');
  } else {
    for (const surfaceId of REQUIRED_SURFACES) {
      const rows = inventory.surfaceRows[surfaceId];
      if (!Array.isArray(rows) || rows.length !== REQUIRED_FEATURE_IDS.length) {
        errors.push(`surfaceRows.${surfaceId} must contain exactly ${REQUIRED_FEATURE_IDS.length} rows`);
        continue;
      }
      const rowIds = new Set();
      for (const [index, row] of rows.entries()) {
        const expectedKeys = surfaceId === 'landing-page'
          ? REQUIRED_LANDING_ROW_KEYS
          : REQUIRED_SURFACE_ROW_KEYS;
        if (!exactKeys(row, expectedKeys)) {
          errors.push(`surfaceRows.${surfaceId}[${index}] has incomplete exact-boundary fields`);
          continue;
        }
        if (typeof row.featureId !== 'string' || !REQUIRED_FEATURE_IDS.includes(row.featureId)) {
          errors.push(`surfaceRows.${surfaceId}[${index}].featureId is not canonical`);
          continue;
        }
        if (rowIds.has(row.featureId)) errors.push(`duplicate ${surfaceId} row: ${row.featureId}`);
        rowIds.add(row.featureId);
        if (typeof row.evidenceRef !== 'string' || row.evidenceRef.trim() === '') {
          errors.push(`surfaceRows.${surfaceId}[${index}].evidenceRef is empty`);
        }
        if (surfaceId === 'landing-page') {
          if (!exactKeys(row.responsiveEvidence, REQUIRED_RESPONSIVE_EVIDENCE_KEYS)) {
            errors.push(`surfaceRows.landing-page[${index}].responsiveEvidence is incomplete`);
          } else {
            if (!VALID_STATUSES.includes(row.responsiveEvidence.status)) {
              errors.push(`surfaceRows.landing-page[${index}].responsiveEvidence.status is invalid`);
            }
            for (const key of REQUIRED_RESPONSIVE_EVIDENCE_KEYS.slice(1)) {
              if (row.responsiveEvidence[key] !== null && typeof row.responsiveEvidence[key] !== 'string') {
                errors.push(`surfaceRows.landing-page[${index}].responsiveEvidence.${key} must be a string or null`);
              }
            }
            if (requireComplete) {
              if (row.responsiveEvidence.status !== 'verified') {
                errors.push(`surfaceRows.landing-page[${index}].responsiveEvidence is ${row.responsiveEvidence.status}, not verified`);
              }
              for (const key of REQUIRED_RESPONSIVE_EVIDENCE_KEYS.slice(1)) {
                if (typeof row.responsiveEvidence[key] !== 'string' || row.responsiveEvidence[key].trim() === '') {
                  errors.push(`surfaceRows.landing-page[${index}].responsiveEvidence.${key} is missing completion evidence`);
                }
              }
            }
          }
        }
      }
      for (const id of REQUIRED_FEATURE_IDS) {
        if (!rowIds.has(id)) errors.push(`surfaceRows.${surfaceId} is missing canonical row: ${id}`);
      }
    }
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

      const status = evidence.status;
      const validStatus = VALID_STATUSES.includes(status);
      if (!validStatus) {
        errors.push(guardError(row.id, surfaceId, 'status', 'STATUS_INVALID', `status '${status}' is not one of ${VALID_STATUSES.join('/')}`));
      }

      // Basic type check runs regardless of status: a resolver must never
      // be handed a non-string, non-null value.
      for (const key of REQUIRED_EVIDENCE_KEYS.slice(1)) {
        if (evidence[key] !== null && typeof evidence[key] !== 'string') {
          errors.push(`${row.id}.${surfaceId}.${key} must be a string or null`);
        }
      }

      if (validStatus) {
        if (status === 'missing') {
          // A missing row may not carry prose: every field must be null.
          for (const key of REQUIRED_EVIDENCE_KEYS.slice(1)) {
            if (evidence[key] !== null) {
              errors.push(
                guardError(row.id, surfaceId, key, 'STATUS_MISSING_MUST_BE_NULL', `${key} must be null while status is missing`),
              );
            }
          }
        } else if (status === 'not-applicable') {
          // Every field must record a real reason, not resolve a path.
          for (const key of REQUIRED_EVIDENCE_KEYS.slice(1)) {
            const val = evidence[key];
            if (typeof val !== 'string' || val.trim().length < NOT_APPLICABLE_REASON_MIN_LENGTH) {
              errors.push(
                guardError(
                  row.id,
                  surfaceId,
                  key,
                  'STATUS_NOT_APPLICABLE_REASON_TOO_SHORT',
                  `${key} must record a reason of at least ${NOT_APPLICABLE_REASON_MIN_LENGTH} characters while status is not-applicable`,
                ),
              );
            }
          }
        } else {
          // in-progress or verified: nulls are only tolerated in-progress,
          // and every non-null field must genuinely resolve on disk.
          for (const key of REQUIRED_EVIDENCE_KEYS.slice(1)) {
            const val = evidence[key];
            if (val === null) {
              if (status === 'verified') {
                errors.push(
                  guardError(row.id, surfaceId, key, 'STATUS_VERIFIED_FIELD_MISSING', `${key} must be present while status is verified`),
                );
              }
              continue;
            }
            if (typeof val !== 'string') continue; // already reported above
            const result = resolveEvidenceField(key, val, { root, fs: fsAdapter, row });
            if (!result.ok) {
              errors.push(guardError(row.id, surfaceId, key, result.code, result.message));
            }
          }
        }
      }

      if (requireComplete && evidence.status !== 'verified') {
        errors.push(`${row.id}.${surfaceId} is ${evidence.status}, not verified`);
      }
    }

    // The article path itself is tolerated as a dangling reference only
    // while the whole row is still fully 'missing'. The moment either
    // surface claims anything more, the article file must actually exist.
    if (typeof row.article === 'string' && row.article.trim() !== '') {
      const rowFullyMissing = REQUIRED_SURFACES.every(
        (surfaceId) => row.surfaces[surfaceId] && row.surfaces[surfaceId].status === 'missing',
      );
      if (!rowFullyMissing) {
        const abs = resolvePath(root, row.article);
        if (!fsAdapter.existsSync(abs) || !fsAdapter.isFile(abs)) {
          errors.push(`${row.id}.article [ARTICLE_PATH_NOT_FOUND] article path '${row.article}' does not exist on disk`);
        }
      }
    }
  }
  for (const id of REQUIRED_FEATURE_IDS) {
    if (!seen.has(id)) errors.push(`[STRUCTURAL_MISSING_FEATURE_ROW] missing canonical feature row: ${id}`);
  }
  return errors;
}

function loadInventory() {
  return JSON.parse(fs.readFileSync(INVENTORY_PATH, 'utf8'));
}

// ---------------------------------------------------------------------------
// --self-test: a case table with a coverage assertion.
//
// For every guard the checker can raise: run a fixture that is green, apply
// exactly one deliberate mutation, assert THAT guard's code fires (and no
// other code is trusted to have fired instead), then re-validate the
// untouched green fixture and require it to still be green. After every
// case has run, assert that every declared guard code was actually observed
// failing at least once - a guard nobody has watched fail proves nothing,
// and a code that is declared but never exercised is exactly the kind of
// gap this whole file exists to catch.
// ---------------------------------------------------------------------------

function createMemoryFsAdapter(entries) {
  const files = new Map();
  for (const [relPath, content] of Object.entries(entries)) {
    const abs = resolvePath('', relPath);
    files.set(abs, Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8'));
  }
  return {
    existsSync: (absPath) => files.has(absPath),
    isFile: (absPath) => files.has(absPath),
    readFileBuffer: (absPath) => files.get(absPath),
    readFileText: (absPath) => files.get(absPath).toString('utf8'),
  };
}

function makeMissingEvidence() {
  return {
    status: 'missing',
    implementation: null,
    documentation: null,
    localizedCopy: null,
    persistence: null,
    focusedCheck: null,
    builtArtifactProof: null,
    captureEvidence: null,
  };
}

function makeMissingRow(id) {
  return {
    id,
    title: id,
    contract: 'Canonical shared contract row used by a self-test fixture.',
    article: `docs/features/uh-completeness/articles/${id}.md`,
    surfaces: {
      'desktop-app': makeMissingEvidence(),
      'landing-page': makeMissingEvidence(),
    },
  };
}

function buildCanonicalSurfaceRows() {
  const surfaceRows = { 'desktop-app': [], 'landing-page': [] };
  for (const id of REQUIRED_FEATURE_IDS) {
    surfaceRows['desktop-app'].push({ featureId: id, evidenceRef: `features.${id}.surfaces.desktop-app` });
    surfaceRows['landing-page'].push({
      featureId: id,
      evidenceRef: `features.${id}.surfaces.landing-page`,
      responsiveEvidence: {
        status: 'missing',
        minWidth: null,
        orientation: null,
        touchTargets: null,
        horizontalOverflow: null,
        viewportBoundedOverlays: null,
      },
    });
  }
  return surfaceRows;
}

// Builds a fully structurally-valid synthetic inventory (every canonical ID
// present, correct surfaceRows shape) with every row 'missing'/null except
// the one row supplied, which replaces the 'language-modes' slot. This lets
// each guard case exercise exactly one row/field in isolation without the
// weight of constructing all 85 real rows.
function buildSyntheticInventory(overrideRow) {
  const features = REQUIRED_FEATURE_IDS.map((id) => (id === overrideRow.id ? overrideRow : makeMissingRow(id)));
  return {
    schemaVersion: 1,
    features,
    surfaceRows: buildCanonicalSurfaceRows(),
  };
}

const ARTICLE_REL_PATH = 'docs/features/uh-completeness/articles/language-modes.md';
const ARTICLE_CONTENT = '# Language Modes\n\n## Overview\n\nSome descriptive text for the self-test fixture.\n';

// Builds a fixture whose 'language-modes' desktop-app surface is
// 'in-progress' with exactly one evidence field set to `value`; every other
// field stays null (which 'in-progress' permits). `files` are the
// additional in-memory files the field under test needs to resolve.
function buildFieldCaseFixture(fieldName, value, { files = {}, includeArticle = true } = {}) {
  const row = makeMissingRow('language-modes');
  row.surfaces['desktop-app'] = {
    ...makeMissingEvidence(),
    status: 'in-progress',
    [fieldName]: value,
  };
  const inventory = buildSyntheticInventory(row);
  const fsAdapter = createMemoryFsAdapter({
    ...(includeArticle ? { [ARTICLE_REL_PATH]: ARTICLE_CONTENT } : {}),
    ...files,
  });
  return { inventory, fsAdapter, root: '' };
}

function buildArticleExistsFixture(includeArticle) {
  const row = makeMissingRow('language-modes');
  row.surfaces['desktop-app'].status = 'in-progress';
  const inventory = buildSyntheticInventory(row);
  const fsAdapter = createMemoryFsAdapter(includeArticle ? { [ARTICLE_REL_PATH]: ARTICLE_CONTENT } : {});
  return { inventory, fsAdapter, root: '' };
}

function buildStatusMissingFixture(implementationValue) {
  const row = makeMissingRow('language-modes');
  row.surfaces['desktop-app'].implementation = implementationValue;
  const inventory = buildSyntheticInventory(row);
  return { inventory, fsAdapter: createMemoryFsAdapter({}), root: '' };
}

function buildStatusInvalidFixture(status) {
  const row = makeMissingRow('language-modes');
  row.surfaces['desktop-app'].status = status;
  const inventory = buildSyntheticInventory(row);
  return { inventory, fsAdapter: createMemoryFsAdapter({}), root: '' };
}

const VALID_NOT_APPLICABLE_REASON = 'This contract genuinely does not apply to this synthetic self-test row.';

function buildNotApplicableFixture(overrides = {}) {
  const row = makeMissingRow('language-modes');
  const reasons = {
    implementation: VALID_NOT_APPLICABLE_REASON,
    documentation: VALID_NOT_APPLICABLE_REASON,
    localizedCopy: VALID_NOT_APPLICABLE_REASON,
    persistence: VALID_NOT_APPLICABLE_REASON,
    focusedCheck: VALID_NOT_APPLICABLE_REASON,
    builtArtifactProof: VALID_NOT_APPLICABLE_REASON,
    captureEvidence: VALID_NOT_APPLICABLE_REASON,
    ...overrides,
  };
  row.surfaces['desktop-app'] = { status: 'not-applicable', ...reasons };
  const inventory = buildSyntheticInventory(row);
  const fsAdapter = createMemoryFsAdapter({ [ARTICLE_REL_PATH]: ARTICLE_CONTENT });
  return { inventory, fsAdapter, root: '' };
}

const CAPTURE_REL_PATH = 'docs/features/uh-completeness/captures/language-modes-desktop.png';
const CAPTURE_CONTENT = 'fake-png-bytes-for-the-language-modes-desktop-self-test-fixture';
const CAPTURE_HASH = crypto.createHash('sha256').update(Buffer.from(CAPTURE_CONTENT, 'utf8')).digest('hex');
const MANIFEST_REL_PATH = 'docs/features/uh-completeness/artifacts/manifest.json';
const MANIFEST_CONTENT = JSON.stringify({ features: { 'language-modes': { 'desktop-app': 'verified' } } });

const VERIFIED_FIXTURE_FILES = {
  'src/uh/language-modes/index.ts': 'export const LanguageModes = 1;\nexport const Second = 2;\nexport const Third = 3;\n',
  'src/uh/language-modes/language-modes.dict.ts': "export const dict = { 'language-modes.title': 'Language' };\n",
  'src/uh/language-modes/persistence.ts': 'export const persistenceKey = "language-modes";\n',
  'src/uh/language-modes/index.test.ts':
    "describe('language modes', () => {\n  it('renders English by default', () => {\n    expect(true).toBe(true);\n  });\n});\n",
  [MANIFEST_REL_PATH]: MANIFEST_CONTENT,
  [CAPTURE_REL_PATH]: CAPTURE_CONTENT,
};

function buildVerifiedEvidence(overrides = {}) {
  return {
    status: 'verified',
    implementation: 'src/uh/language-modes/index.ts#L1-L2',
    documentation: `${ARTICLE_REL_PATH}#overview`,
    localizedCopy: 'src/uh/language-modes/language-modes.dict.ts#language-modes.title',
    persistence: 'src/uh/language-modes/persistence.ts',
    focusedCheck: 'src/uh/language-modes/index.test.ts::renders English by default',
    builtArtifactProof: `${MANIFEST_REL_PATH}#features.language-modes.desktop-app`,
    captureEvidence: `${CAPTURE_REL_PATH}@sha256:${CAPTURE_HASH}`,
    ...overrides,
  };
}

function buildVerifiedFixture(evidenceOverrides = {}, extraFiles = {}) {
  const row = makeMissingRow('language-modes');
  row.surfaces['desktop-app'] = buildVerifiedEvidence(evidenceOverrides);
  const inventory = buildSyntheticInventory(row);
  const fsAdapter = createMemoryFsAdapter({
    [ARTICLE_REL_PATH]: ARTICLE_CONTENT,
    ...VERIFIED_FIXTURE_FILES,
    ...extraFiles,
  });
  return { inventory, fsAdapter, root: '' };
}

// The complete, hand-maintained set of guard codes the checker can raise.
// This is intentionally independent of the case table below: if a case is
// ever deleted without deleting its code here too, the coverage assertion
// at the end of runSelfTest notices the gap instead of silently shrinking
// what --self-test claims to guarantee.
const ALL_GUARD_CODES = [
  'STRUCTURAL_MISSING_FEATURE_ROW',
  'ARTICLE_PATH_NOT_FOUND',
  'STATUS_MISSING_MUST_BE_NULL',
  'STATUS_INVALID',
  'STATUS_NOT_APPLICABLE_REASON_TOO_SHORT',
  'STATUS_VERIFIED_FIELD_MISSING',
  'IMPL_PATH_NOT_FOUND',
  'IMPL_LINE_RANGE_OUT_OF_BOUNDS',
  'DOC_MUST_MATCH_ARTICLE',
  'DOC_ARTICLE_NOT_FOUND',
  'DOC_HEADING_NOT_FOUND',
  'LOCALIZED_COPY_FORMAT_INVALID',
  'LOCALIZED_COPY_PATH_NOT_FOUND',
  'LOCALIZED_COPY_KEY_NOT_FOUND',
  'PERSISTENCE_FORMAT_INVALID',
  'PERSISTENCE_PATH_NOT_FOUND',
  'FOCUSED_CHECK_FORMAT_INVALID',
  'FOCUSED_CHECK_FILE_NOT_FOUND',
  'FOCUSED_CHECK_TEST_NOT_FOUND',
  'CAPTURE_FORMAT_INVALID',
  'CAPTURE_FILE_NOT_FOUND',
  'CAPTURE_HASH_MISMATCH',
  'ARTIFACT_FORMAT_INVALID',
  'ARTIFACT_MANIFEST_NOT_FOUND',
  'ARTIFACT_MANIFEST_INVALID_JSON',
  'ARTIFACT_KEY_NOT_FOUND',
];

function buildGuardCases() {
  return [
    {
      code: 'STRUCTURAL_MISSING_FEATURE_ROW',
      name: 'exact canonical row removed from the real committed inventory',
      green: () => ({ inventory: loadInventory(), fsAdapter: REAL_FS_ADAPTER, root: ROOT }),
      red: () => {
        const broken = JSON.parse(JSON.stringify(loadInventory()));
        const targetIndex = broken.features.findIndex((row) => row.id === 'language-modes');
        if (targetIndex < 0) throw new Error('self-test target row not found: language-modes');
        broken.features.splice(targetIndex, 1);
        return { inventory: broken, fsAdapter: REAL_FS_ADAPTER, root: ROOT };
      },
    },
    {
      code: 'ARTICLE_PATH_NOT_FOUND',
      name: 'article file missing once a surface claims more than missing',
      green: () => buildArticleExistsFixture(true),
      red: () => buildArticleExistsFixture(false),
    },
    {
      code: 'STATUS_MISSING_MUST_BE_NULL',
      name: 'a field is non-null while status stays missing',
      green: () => buildStatusMissingFixture(null),
      red: () => buildStatusMissingFixture('src/uh/language-modes/index.ts'),
    },
    {
      code: 'STATUS_INVALID',
      name: 'status is not one of the four canonical values',
      green: () => buildStatusInvalidFixture('missing'),
      red: () => buildStatusInvalidFixture('bogus-status'),
    },
    {
      code: 'STATUS_NOT_APPLICABLE_REASON_TOO_SHORT',
      name: 'a not-applicable reason is shorter than 20 characters',
      green: () => buildNotApplicableFixture(),
      red: () => buildNotApplicableFixture({ implementation: 'n/a' }),
    },
    {
      code: 'STATUS_VERIFIED_FIELD_MISSING',
      name: 'a field is null while status is verified',
      green: () => buildVerifiedFixture(),
      red: () => buildVerifiedFixture({ captureEvidence: null }),
    },
    {
      code: 'IMPL_PATH_NOT_FOUND',
      name: 'implementation path does not exist',
      green: () =>
        buildFieldCaseFixture('implementation', 'src/uh/language-modes/index.ts#L1-L2', {
          files: { 'src/uh/language-modes/index.ts': 'line one\nline two\nline three\n' },
        }),
      red: () =>
        buildFieldCaseFixture('implementation', 'src/uh/language-modes/missing.ts#L1-L2', {
          files: { 'src/uh/language-modes/index.ts': 'line one\nline two\nline three\n' },
        }),
    },
    {
      code: 'IMPL_LINE_RANGE_OUT_OF_BOUNDS',
      name: 'implementation line range exceeds the file length',
      green: () =>
        buildFieldCaseFixture('implementation', 'src/uh/language-modes/index.ts#L1-L2', {
          files: { 'src/uh/language-modes/index.ts': 'line one\nline two\nline three\n' },
        }),
      red: () =>
        buildFieldCaseFixture('implementation', 'src/uh/language-modes/index.ts#L1-L100', {
          files: { 'src/uh/language-modes/index.ts': 'line one\nline two\nline three\n' },
        }),
    },
    {
      code: 'DOC_MUST_MATCH_ARTICLE',
      name: 'documentation path does not equal the row article',
      green: () => buildFieldCaseFixture('documentation', `${ARTICLE_REL_PATH}#overview`),
      red: () => buildFieldCaseFixture('documentation', 'docs/features/uh-completeness/articles/wrong-article.md#overview'),
    },
    {
      code: 'DOC_ARTICLE_NOT_FOUND',
      name: 'the article the documentation field points at does not exist',
      green: () => buildFieldCaseFixture('documentation', ARTICLE_REL_PATH),
      red: () => buildFieldCaseFixture('documentation', ARTICLE_REL_PATH, { includeArticle: false }),
    },
    {
      code: 'DOC_HEADING_NOT_FOUND',
      name: 'the recorded heading slug is not a real heading in the article',
      green: () => buildFieldCaseFixture('documentation', `${ARTICLE_REL_PATH}#overview`),
      red: () => buildFieldCaseFixture('documentation', `${ARTICLE_REL_PATH}#does-not-exist`),
    },
    {
      code: 'LOCALIZED_COPY_FORMAT_INVALID',
      name: 'a no-copy reason is empty',
      green: () => buildFieldCaseFixture('localizedCopy', 'no-copy: this feature has no localized copy of its own'),
      red: () => buildFieldCaseFixture('localizedCopy', 'no-copy:    '),
    },
    {
      code: 'LOCALIZED_COPY_PATH_NOT_FOUND',
      name: 'the localizedCopy path does not exist',
      green: () =>
        buildFieldCaseFixture('localizedCopy', 'src/uh/language-modes/language-modes.dict.ts#language-modes.title', {
          files: { 'src/uh/language-modes/language-modes.dict.ts': "export const dict = { 'language-modes.title': 'Language' };\n" },
        }),
      red: () =>
        buildFieldCaseFixture('localizedCopy', 'src/uh/language-modes/missing.dict.ts#language-modes.title', {
          files: { 'src/uh/language-modes/language-modes.dict.ts': "export const dict = { 'language-modes.title': 'Language' };\n" },
        }),
    },
    {
      code: 'LOCALIZED_COPY_KEY_NOT_FOUND',
      name: 'the localizedCopy key is not present in the dict file',
      green: () =>
        buildFieldCaseFixture('localizedCopy', 'src/uh/language-modes/language-modes.dict.ts#language-modes.title', {
          files: { 'src/uh/language-modes/language-modes.dict.ts': "export const dict = { 'language-modes.title': 'Language' };\n" },
        }),
      red: () =>
        buildFieldCaseFixture('localizedCopy', 'src/uh/language-modes/language-modes.dict.ts#language-modes.nonexistent', {
          files: { 'src/uh/language-modes/language-modes.dict.ts': "export const dict = { 'language-modes.title': 'Language' };\n" },
        }),
    },
    {
      code: 'PERSISTENCE_FORMAT_INVALID',
      name: 'a not-persisted reason is empty',
      green: () => buildFieldCaseFixture('persistence', 'not-persisted: this feature intentionally stores no local state'),
      red: () => buildFieldCaseFixture('persistence', 'not-persisted:    '),
    },
    {
      code: 'PERSISTENCE_PATH_NOT_FOUND',
      name: 'the persistence path does not exist',
      green: () =>
        buildFieldCaseFixture('persistence', 'src/uh/language-modes/persistence.ts', {
          files: { 'src/uh/language-modes/persistence.ts': 'export const persistenceKey = "language-modes";\n' },
        }),
      red: () =>
        buildFieldCaseFixture('persistence', 'src/uh/language-modes/missing-persistence.ts', {
          files: { 'src/uh/language-modes/persistence.ts': 'export const persistenceKey = "language-modes";\n' },
        }),
    },
    {
      code: 'FOCUSED_CHECK_FORMAT_INVALID',
      name: 'focusedCheck is missing the ::test-name separator',
      green: () =>
        buildFieldCaseFixture('focusedCheck', 'src/uh/language-modes/index.test.ts::renders English by default', {
          files: {
            'src/uh/language-modes/index.test.ts':
              "it('renders English by default', () => {\n  expect(true).toBe(true);\n});\n",
          },
        }),
      red: () =>
        buildFieldCaseFixture('focusedCheck', 'src/uh/language-modes/index.test.ts', {
          files: {
            'src/uh/language-modes/index.test.ts':
              "it('renders English by default', () => {\n  expect(true).toBe(true);\n});\n",
          },
        }),
    },
    {
      code: 'FOCUSED_CHECK_FILE_NOT_FOUND',
      name: 'the focusedCheck test file does not exist',
      green: () =>
        buildFieldCaseFixture('focusedCheck', 'src/uh/language-modes/index.test.ts::renders English by default', {
          files: {
            'src/uh/language-modes/index.test.ts':
              "it('renders English by default', () => {\n  expect(true).toBe(true);\n});\n",
          },
        }),
      red: () =>
        buildFieldCaseFixture('focusedCheck', 'src/uh/language-modes/missing.test.ts::renders English by default', {
          files: {
            'src/uh/language-modes/index.test.ts':
              "it('renders English by default', () => {\n  expect(true).toBe(true);\n});\n",
          },
        }),
    },
    {
      code: 'FOCUSED_CHECK_TEST_NOT_FOUND',
      name: 'the JS test was renamed so the recorded name no longer matches any line',
      green: () =>
        buildFieldCaseFixture('focusedCheck', 'src/uh/language-modes/index.test.ts::renders English by default', {
          files: {
            'src/uh/language-modes/index.test.ts':
              "it('renders English by default', () => {\n  expect(true).toBe(true);\n});\n",
          },
        }),
      red: () =>
        buildFieldCaseFixture('focusedCheck', 'src/uh/language-modes/index.test.ts::renders English by default', {
          files: {
            'src/uh/language-modes/index.test.ts':
              "it('renders english mode with a totally different name', () => {\n  expect(true).toBe(true);\n});\n",
          },
        }),
    },
    {
      code: 'FOCUSED_CHECK_TEST_NOT_FOUND',
      name: 'the JS test line was commented out, so the text is present but not a live declaration',
      green: () =>
        buildFieldCaseFixture('focusedCheck', 'src/uh/language-modes/index.test.ts::renders English by default', {
          files: {
            'src/uh/language-modes/index.test.ts':
              "it('renders English by default', () => {\n  expect(true).toBe(true);\n});\n",
          },
        }),
      red: () =>
        buildFieldCaseFixture('focusedCheck', 'src/uh/language-modes/index.test.ts::renders English by default', {
          files: {
            'src/uh/language-modes/index.test.ts':
              "// it('renders English by default', () => {\n  expect(true).toBe(true);\n// });\n",
          },
        }),
    },
    {
      code: 'FOCUSED_CHECK_TEST_NOT_FOUND',
      name: 'the Go test line was commented out (proves the ^func Test anchor, not just the JS branch)',
      green: () =>
        buildFieldCaseFixture('focusedCheck', 'src/uh/language-modes/language_modes_test.go::TestRendersEnglishByDefault', {
          files: {
            'src/uh/language-modes/language_modes_test.go':
              'package languagemodes\n\nfunc TestRendersEnglishByDefault(t *testing.T) {\n\tif !true {\n\t\tt.Fail()\n\t}\n}\n',
          },
        }),
      red: () =>
        buildFieldCaseFixture('focusedCheck', 'src/uh/language-modes/language_modes_test.go::TestRendersEnglishByDefault', {
          files: {
            'src/uh/language-modes/language_modes_test.go':
              'package languagemodes\n\n// func TestRendersEnglishByDefault(t *testing.T) {\n\tif !true {\n\t\tt.Fail()\n\t}\n}\n',
          },
        }),
    },
    {
      code: 'CAPTURE_FORMAT_INVALID',
      name: 'captureEvidence is missing the @sha256: hash suffix',
      green: () =>
        buildFieldCaseFixture('captureEvidence', `${CAPTURE_REL_PATH}@sha256:${CAPTURE_HASH}`, {
          files: { [CAPTURE_REL_PATH]: CAPTURE_CONTENT },
        }),
      red: () =>
        buildFieldCaseFixture('captureEvidence', CAPTURE_REL_PATH, {
          files: { [CAPTURE_REL_PATH]: CAPTURE_CONTENT },
        }),
    },
    {
      code: 'CAPTURE_FILE_NOT_FOUND',
      name: 'the capture file does not exist',
      green: () =>
        buildFieldCaseFixture('captureEvidence', `${CAPTURE_REL_PATH}@sha256:${CAPTURE_HASH}`, {
          files: { [CAPTURE_REL_PATH]: CAPTURE_CONTENT },
        }),
      red: () =>
        buildFieldCaseFixture(
          'captureEvidence',
          `docs/features/uh-completeness/captures/missing.png@sha256:${CAPTURE_HASH}`,
          { files: { [CAPTURE_REL_PATH]: CAPTURE_CONTENT } },
        ),
    },
    {
      code: 'CAPTURE_HASH_MISMATCH',
      name: 'the recorded hash does not match the real file bytes',
      green: () =>
        buildFieldCaseFixture('captureEvidence', `${CAPTURE_REL_PATH}@sha256:${CAPTURE_HASH}`, {
          files: { [CAPTURE_REL_PATH]: CAPTURE_CONTENT },
        }),
      red: () =>
        buildFieldCaseFixture(
          'captureEvidence',
          `${CAPTURE_REL_PATH}@sha256:${'0'.repeat(64)}`,
          { files: { [CAPTURE_REL_PATH]: CAPTURE_CONTENT } },
        ),
    },
    {
      code: 'ARTIFACT_FORMAT_INVALID',
      name: 'builtArtifactProof is missing the #dot.key.path suffix',
      green: () =>
        buildFieldCaseFixture('builtArtifactProof', `${MANIFEST_REL_PATH}#features.language-modes.desktop-app`, {
          files: { [MANIFEST_REL_PATH]: MANIFEST_CONTENT },
        }),
      red: () =>
        buildFieldCaseFixture('builtArtifactProof', MANIFEST_REL_PATH, {
          files: { [MANIFEST_REL_PATH]: MANIFEST_CONTENT },
        }),
    },
    {
      code: 'ARTIFACT_MANIFEST_NOT_FOUND',
      name: 'the artifact manifest does not exist',
      green: () =>
        buildFieldCaseFixture('builtArtifactProof', `${MANIFEST_REL_PATH}#features.language-modes.desktop-app`, {
          files: { [MANIFEST_REL_PATH]: MANIFEST_CONTENT },
        }),
      red: () =>
        buildFieldCaseFixture(
          'builtArtifactProof',
          'docs/features/uh-completeness/artifacts/missing-manifest.json#features.language-modes.desktop-app',
          { files: { [MANIFEST_REL_PATH]: MANIFEST_CONTENT } },
        ),
    },
    {
      code: 'ARTIFACT_MANIFEST_INVALID_JSON',
      name: 'the artifact manifest is not valid JSON',
      green: () =>
        buildFieldCaseFixture('builtArtifactProof', `${MANIFEST_REL_PATH}#features.language-modes.desktop-app`, {
          files: { [MANIFEST_REL_PATH]: MANIFEST_CONTENT },
        }),
      red: () =>
        buildFieldCaseFixture('builtArtifactProof', `${MANIFEST_REL_PATH}#features.language-modes.desktop-app`, {
          files: { [MANIFEST_REL_PATH]: '{not valid json' },
        }),
    },
    {
      code: 'ARTIFACT_KEY_NOT_FOUND',
      name: 'the dot.key.path does not resolve inside the manifest',
      green: () =>
        buildFieldCaseFixture('builtArtifactProof', `${MANIFEST_REL_PATH}#features.language-modes.desktop-app`, {
          files: { [MANIFEST_REL_PATH]: MANIFEST_CONTENT },
        }),
      red: () =>
        buildFieldCaseFixture('builtArtifactProof', `${MANIFEST_REL_PATH}#features.language-modes.nonexistent-surface`, {
          files: { [MANIFEST_REL_PATH]: MANIFEST_CONTENT },
        }),
    },
  ];
}

function runGuardCase(testCase, observedCodes) {
  const label = testCase.name ? `${testCase.code} (${testCase.name})` : testCase.code;

  const green1 = testCase.green();
  const greenErrors = validateInventory(green1.inventory, { fsAdapter: green1.fsAdapter, root: green1.root });
  if (greenErrors.length > 0) {
    throw new Error(`case [${label}]: baseline fixture expected to be green but got:\n${greenErrors.join('\n')}`);
  }

  const red = testCase.red();
  const redErrors = validateInventory(red.inventory, { fsAdapter: red.fsAdapter, root: red.root });
  if (!redErrors.some((e) => e.includes(`[${testCase.code}]`))) {
    throw new Error(
      `case [${label}]: mutation did not turn red with guard code [${testCase.code}]. Errors were:\n${redErrors.join('\n') || '(no errors at all)'}`,
    );
  }

  const green2 = testCase.green();
  const restoredErrors = validateInventory(green2.inventory, { fsAdapter: green2.fsAdapter, root: green2.root });
  if (restoredErrors.length > 0) {
    throw new Error(`case [${label}]: did not return to green after restoration:\n${restoredErrors.join('\n')}`);
  }

  observedCodes.add(testCase.code);
}

function runSelfTest() {
  const inventory = loadInventory();
  const baselineErrors = validateInventory(inventory);
  if (baselineErrors.length > 0) {
    throw new Error(`baseline inventory is structurally invalid:\n${baselineErrors.join('\n')}`);
  }

  const cases = buildGuardCases();
  const observedCodes = new Set();
  for (const testCase of cases) {
    runGuardCase(testCase, observedCodes);
  }

  const neverFired = ALL_GUARD_CODES.filter((code) => !observedCodes.has(code));
  if (neverFired.length > 0) {
    throw new Error(`the following declared guard codes never turned red in any case: ${neverFired.join(', ')}`);
  }
  const undeclared = [...observedCodes].filter((code) => !ALL_GUARD_CODES.includes(code));
  if (undeclared.length > 0) {
    throw new Error(`the following guard codes fired but are not declared in ALL_GUARD_CODES: ${undeclared.join(', ')}`);
  }

  console.log(
    `PASS: ${cases.length} guard cases exercised, each turning red on its own exact mutation and green again after restoration; all ${ALL_GUARD_CODES.length} declared guard codes were observed failing at least once`,
  );
}

// ---------------------------------------------------------------------------
// --progress: a human-readable, non-gating status summary. It never fails
// the process on its own - it exists so `npm run progress` gives a human a
// quick read on how many rows have actually earned `verified` versus how
// many are still `missing`/`in-progress`/`not-applicable`, without printing
// the full per-field error list the gate itself produces.
// ---------------------------------------------------------------------------

function computeProgress(inventory) {
  const summary = {};
  for (const surfaceId of REQUIRED_SURFACES) {
    summary[surfaceId] = { missing: 0, 'in-progress': 0, verified: 0, 'not-applicable': 0, invalid: 0 };
  }
  for (const row of inventory.features ?? []) {
    for (const surfaceId of REQUIRED_SURFACES) {
      const status = row.surfaces?.[surfaceId]?.status;
      if (Object.prototype.hasOwnProperty.call(summary[surfaceId], status)) {
        summary[surfaceId][status] += 1;
      } else {
        summary[surfaceId].invalid += 1;
      }
    }
  }
  return summary;
}

function printProgress(inventory) {
  const summary = computeProgress(inventory);
  const totalFeatures = (inventory.features ?? []).length;
  let totalVerified = 0;
  let totalRowSurfaces = 0;
  console.log(`Inventory progress: ${totalFeatures} canonical features across ${REQUIRED_SURFACES.length} surfaces`);
  for (const surfaceId of REQUIRED_SURFACES) {
    const s = summary[surfaceId];
    totalVerified += s.verified;
    totalRowSurfaces += s.missing + s['in-progress'] + s.verified + s['not-applicable'] + s.invalid;
    const invalidSuffix = s.invalid > 0 ? ` invalid-status=${s.invalid}` : '';
    console.log(
      `  ${surfaceId}: missing=${s.missing} in-progress=${s['in-progress']} verified=${s.verified} not-applicable=${s['not-applicable']}${invalidSuffix}`,
    );
  }
  const pct = totalRowSurfaces === 0 ? 0 : Math.round((totalVerified / totalRowSurfaces) * 1000) / 10;
  console.log(`Overall: ${totalVerified}/${totalRowSurfaces} surface rows verified (${pct}%)`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const requireComplete = process.argv.includes('--require-complete');
const selfTest = process.argv.includes('--self-test');
const progressFlag = process.argv.includes('--progress');

if (progressFlag) {
  printProgress(loadInventory());
  process.exit(0);
}

if (selfTest) {
  runSelfTest();
}

const inventory = loadInventory();
const errors = validateInventory(inventory, { requireComplete });

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(requireComplete ? 'PASS: inventory is complete' : 'PASS: inventory structure is valid');
}
