# Api Documentation And Collection

## Behaviour

This repository documents two genuinely different HTTP APIs, and this row is specifically about the second one:

1. **The upstream Ollama server API** (port 11434) — documented in `docs/api.md` and `docs/openapi.yaml` (an OpenAPI 3.1 spec), plus the `docs/api/*.mdx` pages (authentication, streaming, OpenAI/Anthropic compatibility). This is the original upstream Ollama HTTP API and predates this fork's own work.
2. **The desktop app's own local HTTP API** — the `/api/v1/*` routes (plus a handful of `/api/*` passthrough routes) that `app/ui/ui.go`'s `Server.Handler()` registers on its own `http.ServeMux`, served by the app process itself on an OS-assigned loopback port (`127.0.0.1:0`). This is what the app's own React UI talks to for everything from model management to settings to the local chat sessions, TOTP authenticator, and Docker manager. Until this row, it had no dedicated documentation or Postman collection at all.

`scripts/generate-postman-collection.mjs` closes that gap by generating a real Postman Collection v2.1 JSON file — `docs/api/app-http-api.postman_collection.json` — parsed directly from `app/ui/ui.go`'s actual `mux.Handle("METHOD /path", ...)` registrations, rather than hand-written. It found and grouped **92** real routes (matching `grep -c 'mux\.\(Handle\|HandleFunc\)' app/ui/ui.go` exactly) into 21 folders by path prefix (`chat`, `models`, `settings`, `uh` for the cross-cutting UI-preferences/TOTP/School-mode routes, `codex`, `docker`, `convert`, `docs`, `launch`, `config`, `history`, `hardware`, `capabilities`, `cloud`, `release`, `model`, `create-chat`, `inference-compute`, `chats`, `root` for the bare `/` static/CORS-preflight routes, and `ollama-proxy` for the routes this app forwards verbatim to the real Ollama server rather than handling itself). Each request carries a description naming the exact Go handler method (or, for proxied routes, a pointer to `docs/api.md`) and the source line it was registered at.

The collection's `{{baseUrl}}` variable has no fixed default, because the app binds an OS-assigned ephemeral port — its description explains exactly how to discover the real port for a running instance (the same technique `scripts/capture/lib.mjs`'s `discoverListeningPort()` uses: inspect the process's own listening TCP sockets), and documents the `token` cookie every route except `root`/`ollama-proxy`/`OPTIONS` requires (skipped entirely when the app runs with `-dev`).

Because the collection is generated rather than hand-maintained, it cannot silently drift from what the server actually serves: `node scripts/generate-postman-collection.mjs --check` re-derives the whole collection from `app/ui/ui.go`'s current bytes and diffs it against the committed file, failing loudly the moment a route is added, renamed, or removed without the collection being regenerated.

## Configuration

Not applicable — this is a documentation/tooling artifact, not a runtime feature. Regenerating it after a route changes is `node scripts/generate-postman-collection.mjs`.

## Failure modes

If `app/ui/ui.go`'s route registrations are refactored into a shape the generator's line-based parser cannot recognize (for example, a registration split across more lines than the one exceptional case — the inline `OPTIONS /` CORS-preflight handler — already handles), the generator either throws (0 routes found is treated as a hard parser failure) or silently undercounts, which the `--check` mode's route-count cross-check against a live `grep`-equivalent count in the test suite is specifically designed to catch.

## Security considerations

The collection documents, but does not embed, any credential — the `token` cookie is described in prose (what it is, where it comes from, when it is skipped) rather than a placeholder value being baked into the file. No route in the collection is executed as part of generating or testing it; this is a static, offline artifact.

## Verification

- Focused tests: `scripts/test/api-postman-collection.test.mjs` (`node --test scripts/test/api-postman-collection.test.mjs`) — four tests: the committed collection is byte-identical to what `--check` re-derives from `app/ui/ui.go` right now; the collection contains exactly one request per real `mux.Handle(...)` registration (92, cross-checked against an independent regex count of the source file); the collection is structurally valid Postman v2.1 (every folder non-empty, every request using `{{baseUrl}}`, the `baseUrl` variable present); and no `GET`/`HEAD`/`OPTIONS` request declares a body.
- Both drift-detection assertions were deliberately broken (a 93rd route was added to `app/ui/ui.go` without regenerating the collection) and confirmed to fail with the real, specific route-count mismatch before being restored and re-confirmed passing.
- Run: `node --test scripts/test/api-postman-collection.test.mjs`.
- Implementation: `scripts/generate-postman-collection.mjs`; output: `docs/api/app-http-api.postman_collection.json`.

## Suggested articles

- `no-network-privacy.md` — the same `/api/v1/*` routes this collection documents are exactly the loopback-only traffic that row's live audit recorded.
- `ollama-suite-manager.md` — the model-store/pull-queue/harness routes this collection's `models`/`docker`/`codex`/`launch` folders cover.
- `bulk-actions.md` and `changelog-viewer.md` — user-facing features backed by several of the routes in this collection's `history`/`config` folders.
