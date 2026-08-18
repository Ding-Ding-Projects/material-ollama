# Material Ollama landing site

This directory is the hosted landing, documentation, status, settings, and download surface for Material Ollama. It is a Vinext/OpenNext-compatible source tree for Sites hosting.

## Boundary

The site introduces the installed desktop application. It does not run Ollama, host a model, execute a command, or pretend to be the desktop application. The download surface stays pending until a verified release manifest supplies an immutable version, commit, platform, asset, size, and hash.

## Local state and privacy

The page stores visitor preferences in browser storage. It validates a personal vocabulary JSON file locally and keeps only a boolean loaded state in ordinary site settings. Exports omit file contents and other private values. There are no analytics, tracking scripts, CDN fonts, remote images, or model-service requests.

## Included site surfaces

- landing boundary and product overview;
- canonical feature registry with 85 hand-written records;
- CLI/configuration parity and local Ollama suite documentation;
- offline-friendly articles with commit links and suggested articles;
- status cards with unverified release and download states;
- English, playful Hong Kong-style Cantonese, and bilingual settings;
- independent tone controls, focus mode, narrator choices, local vocabulary upload, scheduled settings, logo selection, tab docking, local notifications, history, exports, and reset confirmation;
- browser-style navigation, four tab-search scopes, an anchored regex builder, command palette, responsive touch layout, and reduced-motion handling.

## Build

```sh
npm install
npm run build
```

The build emits the Vinext standalone bundle and copies `.openai/hosting.json` into `dist/.openai/` for Sites packaging. The current hosting project id is stored in that file; credentials are supplied by Sites and are never committed.

## Hosting state

The production URL is intentionally not written here until a deployment succeeds and its exact URL is verified. The repository README carries the same boundary and pending-download statement.
