# Completeness inventory changelog

## 2026-08-20 — Silent root builds consume their own switches

- Corrected `build.bat /s` and `build.bat --silent` so the wrapper consumes those switches instead of forwarding them as invalid PowerShell build-step names.
- Preserved named-step forwarding and documented `SILENT=1`.
- Added focused exact-boundary checks for the parser and delegated command.

## 2026-08-18 — Inventory contract introduced

- Added the hand-written canonical feature list for the installed desktop application and the independent landing/documentation site.
- Added separate evidence fields for implementation, documentation, localization, persistence, focused checks, built-artifact interaction, and real captures.
- Added explicit root-level rows for every feature on both surfaces, with per-row landing-page responsive evidence for 320px+, portrait/landscape, touch targets, no sideways body scrolling, and viewport-bounded overlays.
- Added the exact-boundary negative regression checker, including removal-and-restoration coverage for a canonical row.
- Recorded the current base state honestly as incomplete; no feature is marked verified by this inventory-only change.

The integration commit that carries this entry is recorded by the release changelog when the lane lands.
