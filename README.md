# Material Ollama

Material Ollama is a local-first desktop companion for Ollama. It keeps the upstream command-line and service behavior available while giving every supported operation a guided graphical route.

> **Surface boundary:** the landing and documentation site introduces the installed desktop application. It is not the runtime, does not host a model, and is not a playable substitute for the application.

## Start here

- Landing and documentation source: [`site/`](./site/)
- Existing static source and design notes: [`docs/landing-site/`](./docs/landing-site/)
- CLI and API documentation: [`docs/cli.mdx`](./docs/cli.mdx) and [`docs/api.md`](./docs/api.md)
- Feature contract inventory: [`docs/features/uh-completeness/`](./docs/features/uh-completeness/)
- Installation: **pending a verified release**. No guessed installer URL is published.
- Hosted landing URL: **pending verified Sites deployment**. The repository must not claim a live URL before that deployment is confirmed.

## What this fork adds

Material Ollama preserves the upstream Ollama project and adds a GUI/documentation layer for:

- model discovery, installed and running-model state, hardware-fit evidence, pull queues, and local chat;
- command and configuration parity, including guided arguments, flags, aliases, profiles, provenance, restart, and rollback;
- a local file converter, exports, bulk actions, history, external-editor handoff, and offline documentation;
- accessible responsive navigation, browser-style tabs, groups, search, an anchored regex builder, a command palette, and recovery surfaces;
- local visitor settings on the landing page, with no analytics, CDN assets, or network dependency.

## Documentation map

| Area | Source | Purpose |
| --- | --- | --- |
| Landing surface | [`docs/landing-site/README.md`](./docs/landing-site/README.md) | Boundary, local settings, status, and verified-download rules |
| Hosted source | [`site/README.md`](./site/README.md) | Vinext/OpenNext-compatible build and hosting notes |
| CLI parity | [`docs/cli.mdx`](./docs/cli.mdx) | Upstream command behavior and integration routes |
| API parity | [`docs/api.md`](./docs/api.md) | Local API endpoints, streaming, and errors |
| Feature inventory | [`docs/features/uh-completeness/README.md`](./docs/features/uh-completeness/README.md) | Hand-written canonical coverage list and evidence fields |
| Troubleshooting | [`docs/troubleshooting.mdx`](./docs/troubleshooting.mdx) | Recovery paths and known service issues |

<details>
<summary>Feature and evidence status</summary>

The feature inventory records every canonical user-facing contract independently for the desktop application and the landing page. A row is not considered complete merely because its name exists: implementation, documentation, localized copy, persistence, focused checks, built-artifact proof, and real capture evidence must be recorded separately.

The current landing-page source exposes a registry record for all 85 canonical IDs. Its runtime and release evidence remain honest: the download control stays absent until an immutable release manifest is verified, and real built-artifact captures are recorded as pending while the ultra-speed delivery lane is active.

</details>

<details>
<summary>Build and package</summary>

The desktop project follows the upstream Go/CMake toolchain. The hosted landing source has its own `package.json`, Vinext/Vite configuration, Cloudflare-compatible worker entry, and `.openai/hosting.json` metadata. Build dependencies must remain outside the desktop dependency tree.

The landing site uses the existing local mark and social-preview assets. It has no remote fonts, analytics, tracking scripts, or runtime model connection.

</details>

<details>
<summary>Release and download policy</summary>

Release notes must identify the exact source commit, artifact names, hashes, line-count evidence, and unsigned status. The landing page may show an installer only after the release owner verifies the immutable asset URL and size. A pending, guessed, or source-only URL is intentionally not rendered as a download action.

</details>

## Upstream relationship

This project is based on [`ollama/ollama`](https://github.com/ollama/ollama). The local `upstream` remote is retained for non-destructive synchronization, while the fork's default branch is the integration target for Material Ollama work.

## License

See [`LICENSE`](./LICENSE) for the upstream license and attribution.
