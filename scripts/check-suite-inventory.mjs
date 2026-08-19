#!/usr/bin/env node

/**
 * Structural checker for the hand-written local-suite inventory at
 * docs/features/uh-completeness/suite-inventory.md.
 *
 * The inventory names every suite AREA this project's release gate cares
 * about -- unit, integration, DOM/interaction, model catalog, hardware fit,
 * and so on -- whether or not a real suite exists for it yet. A feature
 * area OMITTED from the inventory fails this gate: REQUIRED_AREA_IDS below
 * is a hand-written list of what MUST have a row, not a list derived from
 * whatever rows happen to be in the file today. A checker that only
 * validated rows it found could never notice a row that quietly
 * disappeared; this one walks the canonical list and complains about every
 * absence by name.
 *
 * Evidence is not just present-or-absent text. A `covered`/`partial` row's
 * Command and Evidence cells must both be real: Evidence is resolved
 * against the real filesystem (or, in --self-test, an injected in-memory
 * one) -- a script path that does not exist, or a "<file>::<test name>"
 * claim whose test is not actually declared there, both fail the gate. The
 * test-name match is LINE-ANCHORED on purpose (see resolveEvidence below):
 * a plain substring check still matches after the test is renamed (the old
 * name can be a substring of the new one) and still matches after the
 * whole line is commented out (the text is still sitting right there in
 * the file) -- anchoring to the start of the line closes both holes.
 *
 * A `missing` row is not a failure of THIS checker -- most areas in this
 * project genuinely have no dedicated suite yet, and saying so plainly is
 * the correct, useful answer. What IS required is that a missing row
 * carries a real reason (Notes, at least REASON_MIN_LENGTH characters) and
 * uses the exact placeholder in Command/Evidence, so "missing" can never be
 * quietly confused with "covered but the evidence field was left blank".
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INVENTORY_MD_PATH = path.join(ROOT, 'docs', 'features', 'uh-completeness', 'suite-inventory.md');

const MISSING_PLACEHOLDER = '—'; // em dash, "—" so this file's own bytes never need a literal em dash typed through a shell
const VALID_STATUSES = ['covered', 'partial', 'missing'];
const REASON_MIN_LENGTH = 20;
const MIN_SCOPE_LENGTH = 10;

// Keep this list in lockstep with the canonical suite-area contract this
// lane's brief names. Exact IDs are used throughout; no substring or
// descendant matching is permitted. If an area disappears from the
// markdown table, this list is what notices.
const REQUIRED_AREA_IDS = [
  'unit',
  'integration',
  'dom-interaction',
  'model-catalog',
  'hardware-fit',
  'pull-queue',
  'streaming-chat',
  'file-conversion',
  'pdf-operations',
  'queue-recovery',
  'ollama-manager',
  'harness-launch',
  'configuration-rollback',
  'guided-recovery',
  'accessibility',
  'localization',
  'security',
  'packaging',
  'documentation',
  'completeness',
  'capture-coverage',
];

const REQUIRED_COLUMNS = ['areaid', 'area', 'command', 'scope', 'evidence', 'status', 'notes'];

// ---------------------------------------------------------------------------
// Filesystem adapters -- REAL_FS_ADAPTER touches disk; createMemoryFsAdapter
// (used only by --self-test) resolves entirely against an injected map, the
// same split check-uh-inventory.mjs uses for the identical reason: every
// guard case must be provable without writing throwaway files to the real
// repo.
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
  readFileText: (absPath) => fs.readFileSync(absPath, 'utf8'),
};

function createMemoryFsAdapter(entries) {
  const files = new Map();
  for (const [relPath, content] of Object.entries(entries)) {
    files.set(resolvePath('', relPath), content);
  }
  return {
    existsSync: (absPath) => files.has(absPath),
    isFile: (absPath) => files.has(absPath),
    readFileText: (absPath) => files.get(absPath),
  };
}

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

// Strip line endings and drop the single trailing empty entry a final
// newline produces -- the same off-by-one trap check-uh-inventory.mjs's own
// splitLines guards against (a file's own trailing newline must never count
// as an extra line).
function splitLines(content) {
  const normalized = content.replace(/\r\n|\r/g, '\n');
  const withoutTrailingNewline = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized;
  if (withoutTrailingNewline === '') return [];
  return withoutTrailingNewline.split('\n');
}

function fail(code, message) {
  return { ok: false, code, message };
}

const OK = { ok: true };

// ---------------------------------------------------------------------------
// Markdown table parsing
//
// The inventory lives as one GitHub-flavored Markdown table. This parser is
// deliberately narrow: it looks for the header row naming "Area ID", checks
// the very next line is a separator row, and then reads pipe-delimited data
// rows until the table ends. Command/Scope/Evidence/Notes cells in this
// project's real content never need a literal "|" (the go test -run
// patterns below use a prefix match instead of an alternation precisely so
// this stays true), so this parser does not attempt to handle an escaped
// "\|" inside a cell -- if one ever shows up, this will loudly misparse the
// row rather than silently guess, which is the right failure direction for
// a completeness gate.
// ---------------------------------------------------------------------------

function normalizeHeaderName(raw) {
  return raw.trim().toLowerCase().replace(/\s+/g, '');
}

function splitTableRow(line) {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  return trimmed.split('|').map((cell) => cell.trim());
}

function isSeparatorRow(line) {
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes('-');
}

function parseInventoryMarkdown(markdown) {
  const lines = splitLines(markdown);
  const headerIndex = lines.findIndex((l) => /^\s*\|/.test(l) && /Area\s*ID/i.test(l));
  if (headerIndex < 0) {
    throw new Error('could not find the suite-inventory table header row (a "| Area ID | ... |" line)');
  }
  const headerCells = splitTableRow(lines[headerIndex]).map(normalizeHeaderName);
  for (const required of REQUIRED_COLUMNS) {
    if (!headerCells.includes(required)) {
      throw new Error(`suite-inventory table header is missing the required "${required}" column (found: ${headerCells.join(', ')})`);
    }
  }
  const sepLineIndex = headerIndex + 1;
  if (!lines[sepLineIndex] || !isSeparatorRow(lines[sepLineIndex])) {
    throw new Error('suite-inventory table is missing its header separator row (a "|---|---|...|" line) immediately after the header');
  }

  const rows = [];
  for (let i = sepLineIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!/^\s*\|/.test(line)) break; // table ended
    const cells = splitTableRow(line);
    if (cells.length !== headerCells.length) {
      throw new Error(
        `suite-inventory table row at line ${i + 1} has ${cells.length} cell(s), expected ${headerCells.length} to match the header: ${line}`,
      );
    }
    const row = {};
    headerCells.forEach((name, idx) => {
      row[name] = cells[idx];
    });
    rows.push(row);
  }
  return rows;
}

function loadInventoryRows() {
  const markdown = fs.readFileSync(INVENTORY_MD_PATH, 'utf8');
  return parseInventoryMarkdown(markdown);
}

// ---------------------------------------------------------------------------
// Evidence resolution
//
// An Evidence cell is either:
//   - a bare repo-relative script path ("scripts/check-docs-bundle.mjs"),
//     for a row whose suite is a standalone script rather than a named
//     test; the file existing (and being a file) is the whole claim, or
//   - "<repo-relative file>::<exact test name>", for a row backed by one
//     specific test. The file must exist AND must declare that exact test
//     name as a line-anchored `func Test...` (Go) or `it(...)`/`test(...)`
//     (JS/TS) -- never a substring match, so a rename or a commented-out
//     line both correctly fail this.
// ---------------------------------------------------------------------------

function resolveEvidence(value, ctx) {
  const sepIndex = value.indexOf('::');
  if (sepIndex === 0 || sepIndex === value.length - 2) {
    return fail('EVIDENCE_FORMAT_INVALID', `evidence '${value}' has an empty path or empty test name around '::'`);
  }
  const relPath = sepIndex >= 0 ? value.slice(0, sepIndex) : value;
  const testName = sepIndex >= 0 ? value.slice(sepIndex + 2) : null;

  if (!isSafeRelativePath(relPath)) {
    return fail('EVIDENCE_PATH_UNSAFE', `evidence path '${relPath}' is not a safe repo-relative path`);
  }
  const abs = resolvePath(ctx.root, relPath);
  if (!ctx.fs.existsSync(abs) || !ctx.fs.isFile(abs)) {
    return fail('EVIDENCE_PATH_NOT_FOUND', `evidence path '${relPath}' does not exist`);
  }
  if (testName === null) {
    return OK; // script-only evidence: the file existing is the whole claim
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
      'EVIDENCE_TEST_NOT_FOUND',
      `test '${testName}' was not found as a line-anchored declaration in '${relPath}' (renamed, deleted, or commented out)`,
    );
  }
  return OK;
}

// ---------------------------------------------------------------------------
// Row / table validation
// ---------------------------------------------------------------------------

function validateRow(row, ctx) {
  const errors = [];
  const id = row.areaid || '(blank area id)';
  const p = `row '${id}':`;

  if (!row.area || row.area.trim() === '') {
    errors.push(`ROW_AREA_LABEL_EMPTY: ${p} the Area label is empty`);
  }
  if (!row.scope || row.scope.trim().length < MIN_SCOPE_LENGTH) {
    errors.push(`ROW_SCOPE_TOO_SHORT: ${p} Scope must be a real, non-trivial description (>= ${MIN_SCOPE_LENGTH} chars)`);
  }

  if (!VALID_STATUSES.includes(row.status)) {
    errors.push(`STATUS_INVALID: ${p} status '${row.status}' is not one of ${VALID_STATUSES.join(', ')}`);
    return errors; // nothing further can be meaningfully checked
  }

  if (row.status === 'missing') {
    if (row.command !== MISSING_PLACEHOLDER) {
      errors.push(
        `STATUS_MISSING_COMMAND_NOT_PLACEHOLDER: ${p} status is missing but Command is '${row.command}', want the placeholder '${MISSING_PLACEHOLDER}'`,
      );
    }
    if (row.evidence !== MISSING_PLACEHOLDER) {
      errors.push(
        `STATUS_MISSING_EVIDENCE_NOT_PLACEHOLDER: ${p} status is missing but Evidence is '${row.evidence}', want the placeholder '${MISSING_PLACEHOLDER}'`,
      );
    }
    if (!row.notes || row.notes.trim().length < REASON_MIN_LENGTH) {
      errors.push(`STATUS_MISSING_REASON_TOO_SHORT: ${p} a missing row must carry a real reason in Notes (>= ${REASON_MIN_LENGTH} chars)`);
    }
    return errors;
  }

  // covered or partial: a real, resolvable suite is claimed.
  if (row.status === 'partial') {
    if (!row.notes || row.notes.trim().length < REASON_MIN_LENGTH) {
      errors.push(`STATUS_PARTIAL_REASON_TOO_SHORT: ${p} a partial row must explain the gap in Notes (>= ${REASON_MIN_LENGTH} chars)`);
    }
  }

  if (!row.command || row.command.trim() === '' || row.command === MISSING_PLACEHOLDER) {
    errors.push(`STATUS_COVERED_COMMAND_EMPTY: ${p} status is '${row.status}' but Command is empty or the missing-placeholder`);
  }

  if (!row.evidence || row.evidence.trim() === '' || row.evidence === MISSING_PLACEHOLDER) {
    errors.push(`STATUS_COVERED_EVIDENCE_PLACEHOLDER: ${p} status is '${row.status}' but Evidence is empty or the missing-placeholder`);
  } else {
    const result = resolveEvidence(row.evidence.trim(), ctx);
    if (!result.ok) {
      errors.push(`${result.code}: ${p} ${result.message}`);
    }
  }

  return errors;
}

function validateRows(rows, ctx) {
  const errors = [];
  const seen = new Map();

  for (const row of rows) {
    const id = row.areaid;
    if (id) {
      seen.set(id, (seen.get(id) ?? 0) + 1);
      if (!REQUIRED_AREA_IDS.includes(id)) {
        errors.push(`STRUCTURAL_UNKNOWN_AREA_ROW: area id '${id}' is not one of the canonical required areas`);
      }
    }
  }
  for (const [id, count] of seen) {
    if (count > 1) {
      errors.push(`STRUCTURAL_DUPLICATE_AREA_ROW: area id '${id}' appears ${count} times, want exactly once`);
    }
  }
  for (const requiredId of REQUIRED_AREA_IDS) {
    if (!seen.has(requiredId)) {
      errors.push(`STRUCTURAL_MISSING_AREA_ROW: required area '${requiredId}' has no row in the inventory table`);
    }
  }

  for (const row of rows) {
    errors.push(...validateRow(row, ctx));
  }

  return errors;
}

// ---------------------------------------------------------------------------
// --self-test: mutate one row (or the table) at a time, prove the checker
// turns red on that exact mutation, restore, prove green again. Every
// declared guard code must be observed firing at least once, and no
// undeclared code may fire -- the same "coverage assertion" discipline
// check-uh-inventory.mjs uses, for the identical reason: a checklist that
// only validates cases it has already tried cannot notice a case nobody
// wrote.
// ---------------------------------------------------------------------------

const ALL_GUARD_CODES = [
  'STRUCTURAL_MISSING_AREA_ROW',
  'STRUCTURAL_DUPLICATE_AREA_ROW',
  'STRUCTURAL_UNKNOWN_AREA_ROW',
  'STATUS_INVALID',
  'STATUS_MISSING_COMMAND_NOT_PLACEHOLDER',
  'STATUS_MISSING_EVIDENCE_NOT_PLACEHOLDER',
  'STATUS_MISSING_REASON_TOO_SHORT',
  'STATUS_PARTIAL_REASON_TOO_SHORT',
  'STATUS_COVERED_COMMAND_EMPTY',
  'STATUS_COVERED_EVIDENCE_PLACEHOLDER',
  'EVIDENCE_FORMAT_INVALID',
  'EVIDENCE_PATH_UNSAFE',
  'EVIDENCE_PATH_NOT_FOUND',
  'EVIDENCE_TEST_NOT_FOUND',
];

function cloneRows(rows) {
  return rows.map((r) => ({ ...r }));
}

// The default areaid on both builders below is deliberately a REAL
// required area ('unit') rather than an invented one: buildSyntheticTable
// substitutes an override row into the slot matching its own areaid, so a
// fixture row whose id is not one of REQUIRED_AREA_IDS gets APPENDED as an
// extra row instead -- which would spuriously trip
// STRUCTURAL_UNKNOWN_AREA_ROW on every single guard case that does not
// specifically intend to test that one code. Using 'unit' keeps every
// other guard case's "green" fixture genuinely green.
function baseCoveredRow(overrides = {}) {
  return {
    areaid: 'unit',
    area: 'Self-test area',
    command: 'go test ./selftest/...',
    scope: 'A synthetic row that exists only inside this self-test fixture.',
    evidence: 'selftest/example_test.go::TestExample',
    status: 'covered',
    notes: '',
    ...overrides,
  };
}

function baseMissingRow(overrides = {}) {
  return {
    areaid: 'unit',
    area: 'Self-test area',
    command: MISSING_PLACEHOLDER,
    scope: 'A synthetic row that exists only inside this self-test fixture.',
    evidence: MISSING_PLACEHOLDER,
    status: 'missing',
    notes: 'Nothing implements this yet, so there is nothing to test — a real, honest reason.',
    ...overrides,
  };
}

// A full, structurally-valid 21-row table (every REQUIRED_AREA_ID present
// exactly once) built from one shared "missing, with a real reason" row --
// so a guard case only has to swap in the ONE row it is mutating, exactly
// like check-uh-inventory.mjs's buildSyntheticInventory helper.
function buildSyntheticTable(overrideRow) {
  const rows = REQUIRED_AREA_IDS.map((id) =>
    id === overrideRow.areaid ? overrideRow : baseMissingRow({ areaid: id, area: id }),
  );
  if (!REQUIRED_AREA_IDS.includes(overrideRow.areaid)) {
    rows.push(overrideRow);
  }
  return rows;
}

const GO_EXAMPLE_FILE_CONTENT = ['package selftest', '', 'func TestExample(t *testing.T) {', '\tt.Log("ok")', '}', ''].join('\n');

function buildGuardCases() {
  return [
    {
      code: 'STRUCTURAL_MISSING_AREA_ROW',
      name: 'the exact model-catalog row is removed from the real committed table',
      green: () => ({ rows: loadInventoryRows(), fs: REAL_FS_ADAPTER, root: ROOT }),
      red: () => {
        const rows = loadInventoryRows().filter((r) => r.areaid !== 'model-catalog');
        return { rows, fs: REAL_FS_ADAPTER, root: ROOT };
      },
    },
    {
      code: 'STRUCTURAL_DUPLICATE_AREA_ROW',
      name: 'an area id appears twice',
      green: () => ({ rows: buildSyntheticTable(baseMissingRow()), fs: createMemoryFsAdapter({}), root: '' }),
      red: () => {
        const rows = buildSyntheticTable(baseMissingRow());
        rows.push(baseMissingRow({ areaid: 'unit', area: 'unit' }));
        return { rows, fs: createMemoryFsAdapter({}), root: '' };
      },
    },
    {
      code: 'STRUCTURAL_UNKNOWN_AREA_ROW',
      name: 'a row carries an area id nobody asked for',
      green: () => ({ rows: buildSyntheticTable(baseMissingRow()), fs: createMemoryFsAdapter({}), root: '' }),
      red: () => {
        const rows = buildSyntheticTable(baseMissingRow());
        rows.push(baseMissingRow({ areaid: 'made-up-area-nobody-required', area: 'Made up' }));
        return { rows, fs: createMemoryFsAdapter({}), root: '' };
      },
    },
    {
      code: 'STATUS_INVALID',
      name: 'status is not one of covered/partial/missing',
      green: () => ({ rows: buildSyntheticTable(baseMissingRow()), fs: createMemoryFsAdapter({}), root: '' }),
      red: () => ({ rows: buildSyntheticTable(baseMissingRow({ status: 'sort-of-covered-i-guess' })), fs: createMemoryFsAdapter({}), root: '' }),
    },
    {
      code: 'STATUS_MISSING_COMMAND_NOT_PLACEHOLDER',
      name: 'a missing row keeps a real command instead of the placeholder',
      green: () => ({ rows: buildSyntheticTable(baseMissingRow()), fs: createMemoryFsAdapter({}), root: '' }),
      red: () => ({ rows: buildSyntheticTable(baseMissingRow({ command: 'go test ./whatever/...' })), fs: createMemoryFsAdapter({}), root: '' }),
    },
    {
      code: 'STATUS_MISSING_EVIDENCE_NOT_PLACEHOLDER',
      name: 'a missing row keeps a real evidence claim instead of the placeholder',
      green: () => ({ rows: buildSyntheticTable(baseMissingRow()), fs: createMemoryFsAdapter({}), root: '' }),
      red: () => ({
        rows: buildSyntheticTable(baseMissingRow({ evidence: 'selftest/example_test.go::TestExample' })),
        fs: createMemoryFsAdapter({}),
        root: '',
      }),
    },
    {
      code: 'STATUS_MISSING_REASON_TOO_SHORT',
      name: "a missing row's reason is a few words, not a real explanation",
      green: () => ({ rows: buildSyntheticTable(baseMissingRow()), fs: createMemoryFsAdapter({}), root: '' }),
      red: () => ({ rows: buildSyntheticTable(baseMissingRow({ notes: 'n/a' })), fs: createMemoryFsAdapter({}), root: '' }),
    },
    {
      code: 'STATUS_PARTIAL_REASON_TOO_SHORT',
      name: 'a partial row never explains what the gap actually is',
      green: () => ({
        rows: buildSyntheticTable(
          baseCoveredRow({
            status: 'partial',
            notes: 'Covers the happy path only; the timeout and cancellation branches are still untested.',
          }),
        ),
        fs: createMemoryFsAdapter({ 'selftest/example_test.go': GO_EXAMPLE_FILE_CONTENT }),
        root: '',
      }),
      red: () => ({
        rows: buildSyntheticTable(baseCoveredRow({ status: 'partial', notes: '' })),
        fs: createMemoryFsAdapter({ 'selftest/example_test.go': GO_EXAMPLE_FILE_CONTENT }),
        root: '',
      }),
    },
    {
      code: 'STATUS_COVERED_COMMAND_EMPTY',
      name: 'a covered row has no runnable command',
      green: () => ({
        rows: buildSyntheticTable(baseCoveredRow()),
        fs: createMemoryFsAdapter({ 'selftest/example_test.go': GO_EXAMPLE_FILE_CONTENT }),
        root: '',
      }),
      red: () => ({
        rows: buildSyntheticTable(baseCoveredRow({ command: '' })),
        fs: createMemoryFsAdapter({ 'selftest/example_test.go': GO_EXAMPLE_FILE_CONTENT }),
        root: '',
      }),
    },
    {
      code: 'STATUS_COVERED_EVIDENCE_PLACEHOLDER',
      name: 'a covered row claims the missing-placeholder as its evidence',
      green: () => ({
        rows: buildSyntheticTable(baseCoveredRow()),
        fs: createMemoryFsAdapter({ 'selftest/example_test.go': GO_EXAMPLE_FILE_CONTENT }),
        root: '',
      }),
      red: () => ({ rows: buildSyntheticTable(baseCoveredRow({ evidence: MISSING_PLACEHOLDER })), fs: createMemoryFsAdapter({}), root: '' }),
    },
    {
      code: 'EVIDENCE_FORMAT_INVALID',
      name: 'evidence ends in "::" with nothing after it',
      green: () => ({
        rows: buildSyntheticTable(baseCoveredRow()),
        fs: createMemoryFsAdapter({ 'selftest/example_test.go': GO_EXAMPLE_FILE_CONTENT }),
        root: '',
      }),
      red: () => ({
        rows: buildSyntheticTable(baseCoveredRow({ evidence: 'selftest/example_test.go::' })),
        fs: createMemoryFsAdapter({ 'selftest/example_test.go': GO_EXAMPLE_FILE_CONTENT }),
        root: '',
      }),
    },
    {
      code: 'EVIDENCE_PATH_UNSAFE',
      name: 'evidence path escapes the repository with ../',
      green: () => ({
        rows: buildSyntheticTable(baseCoveredRow()),
        fs: createMemoryFsAdapter({ 'selftest/example_test.go': GO_EXAMPLE_FILE_CONTENT }),
        root: '',
      }),
      red: () => ({
        rows: buildSyntheticTable(baseCoveredRow({ evidence: '../outside/example_test.go::TestExample' })),
        fs: createMemoryFsAdapter({ 'selftest/example_test.go': GO_EXAMPLE_FILE_CONTENT }),
        root: '',
      }),
    },
    {
      code: 'EVIDENCE_PATH_NOT_FOUND',
      name: 'evidence points at a script/test file that does not exist',
      green: () => ({
        rows: buildSyntheticTable(baseCoveredRow()),
        fs: createMemoryFsAdapter({ 'selftest/example_test.go': GO_EXAMPLE_FILE_CONTENT }),
        root: '',
      }),
      red: () => ({ rows: buildSyntheticTable(baseCoveredRow()), fs: createMemoryFsAdapter({}), root: '' }),
    },
    {
      // Trap 1 of 2: the claimed test was renamed to a longer name that
      // happens to CONTAIN the old one as a substring. A plain
      // `content.includes(oldName)` check would still match; the
      // line-anchored exact-equality check here must not.
      code: 'EVIDENCE_TEST_NOT_FOUND',
      name: 'the real test was renamed to a superstring of the claimed name',
      green: () => ({
        rows: buildSyntheticTable(baseCoveredRow()),
        fs: createMemoryFsAdapter({ 'selftest/example_test.go': GO_EXAMPLE_FILE_CONTENT }),
        root: '',
      }),
      red: () => ({
        rows: buildSyntheticTable(baseCoveredRow()),
        fs: createMemoryFsAdapter({
          'selftest/example_test.go': GO_EXAMPLE_FILE_CONTENT.replace('TestExample', 'TestExampleRenamedButStillSimilar'),
        }),
        root: '',
      }),
    },
    {
      // Trap 2 of 2: the claimed test's line is still sitting in the file,
      // but commented out. The text is still there for a substring check
      // to find; a line-anchored check correctly refuses to match a line
      // that starts with a comment marker instead of `func`/`it`/`test`.
      code: 'EVIDENCE_TEST_NOT_FOUND',
      name: 'the real test line still exists but is commented out',
      green: () => ({
        rows: buildSyntheticTable(baseCoveredRow()),
        fs: createMemoryFsAdapter({ 'selftest/example_test.go': GO_EXAMPLE_FILE_CONTENT }),
        root: '',
      }),
      red: () => ({
        rows: buildSyntheticTable(baseCoveredRow()),
        fs: createMemoryFsAdapter({
          'selftest/example_test.go': GO_EXAMPLE_FILE_CONTENT.replace(
            'func TestExample(t *testing.T) {',
            '// func TestExample(t *testing.T) {',
          ),
        }),
        root: '',
      }),
    },
  ];
}

function runGuardCase(testCase, observedCodes) {
  const { rows: greenRows, fs: greenFs, root: greenRoot } = testCase.green();
  const greenErrors = validateRows(greenRows, { fs: greenFs, root: greenRoot });
  if (greenErrors.length > 0) {
    throw new Error(
      `self-test case '${testCase.name}' (code ${testCase.code}): the GREEN fixture was not actually clean:\n${greenErrors.join('\n')}`,
    );
  }

  const { rows: redRows, fs: redFs, root: redRoot } = testCase.red();
  const redErrors = validateRows(redRows, { fs: redFs, root: redRoot });
  const matched = redErrors.some((e) => e.startsWith(`${testCase.code}:`));
  if (!matched) {
    throw new Error(
      `self-test case '${testCase.name}': mutating the fixture did NOT turn the checker red with code ${testCase.code}. Errors observed instead:\n${
        redErrors.length > 0 ? redErrors.join('\n') : '(none -- the checker stayed green on a mutation it was supposed to catch)'
      }`,
    );
  }
  for (const e of redErrors) {
    const code = e.split(':')[0];
    observedCodes.add(code);
  }

  // Prove restoration too: re-running the green fixture after having just
  // run the red one must still be clean (guards against a case that
  // accidentally shares mutable state between its green() and red()
  // builders).
  const { rows: restoredRows, fs: restoredFs, root: restoredRoot } = testCase.green();
  const restoredErrors = validateRows(restoredRows, { fs: restoredFs, root: restoredRoot });
  if (restoredErrors.length > 0) {
    throw new Error(
      `self-test case '${testCase.name}' (code ${testCase.code}): restoring the green fixture after the red one did not come back clean:\n${restoredErrors.join('\n')}`,
    );
  }
}

function runSelfTest() {
  const baselineRows = loadInventoryRows();
  const baselineErrors = validateRows(baselineRows, { fs: REAL_FS_ADAPTER, root: ROOT });
  if (baselineErrors.length > 0) {
    throw new Error(`baseline suite-inventory.md is not structurally valid:\n${baselineErrors.join('\n')}`);
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
// Entry point
// ---------------------------------------------------------------------------

const selfTest = process.argv.includes('--self-test');

if (selfTest) {
  runSelfTest();
}

const rows = loadInventoryRows();
const errors = validateRows(rows, { fs: REAL_FS_ADAPTER, root: ROOT });

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  const counts = { covered: 0, partial: 0, missing: 0 };
  for (const row of rows) counts[row.status] = (counts[row.status] ?? 0) + 1;
  console.log(
    `PASS: suite inventory is structurally valid -- ${rows.length} areas (${counts.covered} covered, ${counts.partial} partial, ${counts.missing} missing)`,
  );
}
