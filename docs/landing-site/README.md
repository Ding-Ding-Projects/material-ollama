# Material Ollama landing site

This directory contains the static landing, documentation, status, download, and settings surface for Material Ollama. It is published at `https://ding-ding-projects.github.io/material-ollama/` by the repository's GitHub Pages workflow.

## Boundary

The page is a landing and documentation surface. It introduces the installed desktop application and records the current evidence state. It is not the primary runtime, it does not host a model, and it must not be described as a playable substitute for the desktop application.

The page renders an installer link only after a verified release supplies an immutable version, commit, platform, asset filename, URL, size, and hash. The current card records `v0.0.0-build.47`; a guessed URL is never a download.

## Local operation

The page has no third-party runtime assets, CDN fonts, analytics, or network dependency. Serve this directory with any static file server and open `index.html`. Site preferences are kept in browser storage under the `material-ollama-landing-settings-v1` key.

The settings surface supports language presentation, two tone sliders, theme, density, local vocabulary-file presence, settings export/import, and reset. The vocabulary file is read in memory; its contents are never included in the settings export.

## Included surfaces

- landing overview with the runtime boundary stated in visible copy;
- model-library and CLI/configuration documentation cards;
- bundled documentation articles and a plain-text-first search;
- an anchored regular-expression builder for the search field;
- status cards with source, release, storage, and heartbeat state;
- a verified release card with the immutable download URL, size, SHA-256, source commit, unsigned warning, and an explicit open Squirrel.Windows migration boundary;
- browser-local settings with live theme and density changes;
- locally bundled SVG mark and the generated `social-preview.png` copy served by the public page.

The HTML includes absolute Open Graph metadata for the product-specific 1280×640 PNG social preview. The published URL and release manifest must be verified by the release owner before any public download control is added.
