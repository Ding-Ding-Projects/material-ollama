# Repository Root Build Script

## Behaviour

This is a repository build-tooling contract, not a screen inside the running desktop app -- there is no in-app surface for it to occupy. The real implementation is `build.bat` at the repository root. It consumes `/s` and `--silent` itself, also recognizes `SILENT=1`, and forwards only actual build step names to `scripts/build_windows.ps1`. Before delegating, it runs `node scripts/check-uh-inventory.mjs --self-test`, the plain structural inventory check, and the vocabulary lock check, refusing to build if any check fails.

## Configuration

Run `build.bat /s` for the full touchless build. A named step may follow the switch, such as `build.bat /s app`. `build.bat --silent` and a process-scoped `SILENT=1` select the same non-interactive path. With no step name, the PowerShell build helper selects its complete default graph.

## Failure modes

An inventory or vocabulary check returns a non-zero exit before compilation. A missing Node.js runtime is reported before those checks. A build helper failure is propagated as a non-zero result. Silent switches are never treated as step names; unknown remaining names are reported by the PowerShell helper.

## Security considerations

The wrapper does not request credentials, signing material, or persistent execution-policy changes. Argument parsing has a focused source contract that asserts silent switches are consumed before delegation and that the former raw `%*` forwarding route cannot return.

## Verification

`node --test scripts/test/root-build-entrypoint.test.mjs` checks exact parser boundaries, delegation ordering, and the absence of raw argument forwarding. The operational proof runs the real root wrapper with `/s`; this build-only surface has no application capture.

## Suggested articles

- [Vocabulary hash lock](./vocabulary-hash-lock.md)
- [Unsigned release policy](./unsigned-release-policy.md)
- [Release artifact collection](./release-artifact-collection.md)
