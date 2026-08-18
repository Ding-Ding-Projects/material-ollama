# Shared feature completeness inventory

This directory is the hand-written contract for the two user-facing surfaces planned for Material Ollama:

1. the installed desktop application; and
2. the landing, documentation, download, status, and settings site.

The site is a landing surface, not the installed runtime and not a playable substitute. It therefore receives an independent local/per-visitor equivalent row for every contract item rather than delegating behavior to the desktop application.

## Inventory shape

[`inventory.json`](./inventory.json) contains one canonical feature row per requirement. Every row has independent `desktop-app` and `landing-page` evidence objects with these exact fields:

- `implementation`
- `documentation`
- `localizedCopy`
- `persistence`
- `focusedCheck`
- `builtArtifactProof`
- `captureEvidence`

The current base commit records the rows as `missing` with null evidence. That is intentional: the inventory is fail-closed and does not claim that a feature exists merely because its row exists. Each implementation lane must replace the nulls with exact paths, records, and evidence before the row can become `verified`.

The canonical ID list is duplicated in [`scripts/check-uh-inventory.mjs`](../../../scripts/check-uh-inventory.mjs). The duplication is deliberate. If a feature row disappears from the JSON, the checker still knows the row was required and fails instead of silently shrinking its expectations.

## Checks

The structural negative regression removes the exact `language-modes` row by ID, requires the checker to turn red, restores that exact row, and requires green again:

```powershell
node scripts/check-uh-inventory.mjs --self-test
```

The completion check is intentionally stricter and remains red until every desktop and landing-page evidence object is `verified` and every evidence field contains a real value:

```powershell
node scripts/check-uh-inventory.mjs --require-complete
```

The checker uses exact ID equality and exact evidence-key sets. It does not use substring matching, descendant selectors, or a list derived from whatever rows happen to remain in the file.

## Evidence contract

An implementation is not complete until the row links all of the following for each surface independently:

- the implementation and its persistence path where applicable;
- the feature article and localized copy resources;
- the focused check that exercises the contract;
- an interaction record from the built artifact; and
- a real capture record tied to the exact build commit.

Where a contract cannot literally apply to a surface, the row must use `not-applicable` and the evidence fields must document the precise boundary and the accessible, testable equivalent. A blank, placeholder, sibling link, or source-only claim is not evidence.

The inventory itself does not publish private vocabulary, credentials, machine details, or user data. Public documentation uses ordinary technical language; private conversational terminology remains outside repository records.
