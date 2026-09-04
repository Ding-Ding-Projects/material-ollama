# Automatic updates

The Status screen uses the same updater instance as the desktop background service. It checks the latest published stable release of `Ding-Ding-Projects/material-ollama` at startup and hourly. `AutoUpdateEnabled` controls automatic downloading, not checking. Manual Check for updates and Download remain available. This implementation is for the unsigned Windows Squirrel installer.

## Feed and package contract

The release must contain `material-ollama-update.json` with schema version 1, a numeric `version`, `sourceCommit`, and `architectures.x64` or `architectures.arm64`. Each architecture records its package identity, setup asset, RELEASES asset, and full/delta package inventory with exact names, sizes, and SHA-256 hashes. Package records additionally carry SHA-1 and kind. The updater resolves names only from that same release. An older release without this manifest reports an unavailable feed.

The installed `package-version.json` binds the running numeric version to its architecture, package identity, source commit, entry point, and `app-<version>` directory. Development builds with no valid numeric provenance report unavailable rather than guessing a version. A release at or below the installed version is a normal up-to-date result.

Metadata reads are bounded. Network requests require allowlisted HTTPS GitHub hosts; at most four redirects may reach the GitHub release-asset hosts. Credentials in URLs, public HTTP, unrelated hosts, unsafe names and malformed inventories are refused. A numeric loopback HTTP origin is reserved for local fixtures. Metadata requests have a 90-second deadline. Package requests have a two-hour deadline, 45-second inactivity limit, bounded headers, and an 8 GiB package limit.

## Download and restart

The package streams to a unique staging directory with byte count, rate and estimated remaining time. Cancellation invalidates the request generation. SHA-1, SHA-256, exact byte count, safe NuGet paths, native PE architecture, NuGet identity and embedded version/source provenance must match before readiness. A local `RELEASES` file contains exactly the selected full package. Saved readiness is revalidated after restart and again before installation. State persistence failures remain visible.

Ready and Later states retain the exact version, release-note link and unsigned warning. Restart requires explicit confirmation, no composer draft or attachments, no active chat generation and no active HTTP mutation. The backend rejects malformed or missing consent. It runs installed `Update.exe --update <local-stage>`, then starts a separate `Update.exe --processStartAndWait "ollama app.exe"` and follows the normal graceful shutdown path. Startup and tray actions never silently install. The tray opens Status.

Installation errors keep the current process alive and report an error. They do not claim rollback, because Squirrel does not provide an automatic rollback guarantee. No signer, certificate discovery or authenticity claim is involved. SHA hashes provide transport/package integrity and do not authenticate an unsigned publisher.

## Local API and privacy

`GET /api/v1/update` returns status without starting work. `POST /api/v1/update/check` and `/download` start bounded asynchronous work. `/cancel` cancels, `/later` defers readiness, and `/restart` requires `{ "confirmed": true, "unsavedWork": false }`. The status card polls progress while operations run. Backend receipts stay in the stable Ollama application-data directory. HTTP status exposes no staging paths, package payloads or provider error bodies.

## Verification status

Focused tests are implemented in `app/updater/feed_test.go`, `app/updater/updater_windows_test.go`, `AutomaticUpdatesCard.dom.test.tsx`, and `UpdateFlow.dom.test.tsx`. They target real fixture HTTP/file boundaries and mounted UI interactions. The current ultra-speed delivery pass did not run the completed tests or capture the packaged runtime. Successful compilation is not runtime or installation evidence. Legacy updater tests cover the older archive implementation and do not prove this Squirrel path.

## Suggested articles

- [Release metadata](release-metadata.md)
- [Local version history](local-version-history.md)
- [Unsigned release policy](unsigned-release-policy.md)

