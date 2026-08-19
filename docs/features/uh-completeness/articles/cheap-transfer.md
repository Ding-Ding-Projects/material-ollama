# Cheap Transfer

## Behaviour

This project's policy on large build dependencies and generated artifacts is: fetch them through scoped, cache-aware tooling that lives outside this Git repository's own object store, and never route a large file through standard Git LFS. `AGENTS.md`'s "Continuous integration and release policy" section states the policy in its sanitized-mirror form (see `sanitized-instruction-copy.md`); this row is about proving the repository actually honors it, structurally, rather than only stating it.

The specific, checkable claim: no file tracked by this repository declares `filter=lfs` (or the companion `merge=lfs`/`diff=lfs` attributes `git lfs track` writes alongside it) in any committed `.gitattributes` file, anywhere in the tree. This repository's single root `.gitattributes` file exists and is real (it declares `linguist-vendored`/`linguist-generated` hints for the vendored `llama/`/`ml/backend/` subtrees, and normalizes line endings), but contains no LFS filter declaration at all — large native build dependencies (the Go toolchain, the mingw/llvm cross-compiler, native runtime libraries) are fetched by `scripts/bootstrap_windows_tools.ps1` and friends into user- or project-scoped cache directories outside Git entirely, never committed as LFS pointers.

This is a repository-content check, not a machine-state check: the `git-lfs` binary being installed on a given machine (for unrelated reasons — many developer machines have it globally available) is irrelevant and not what this row tests. What matters is only whether *this repository's own `.gitattributes`* would turn any of its own tracked files into LFS pointers, which it does not.

## Configuration

Not applicable — this is a structural property of the committed `.gitattributes` file(s), not a runtime or per-user setting.

## Failure modes

If a future contributor (human or automated) ever ran `git lfs track "*.bin"` and committed the resulting `.gitattributes` change, the guard below fails immediately, naming the exact offending line and file — this was confirmed directly by planting `*.bin filter=lfs diff=lfs merge=lfs -text` into a scratch copy of `.gitattributes` and observing both guard assertions fail with that exact line quoted back, before restoring the original file and re-confirming a clean pass.

## Security considerations

Not directly security-relevant; this is primarily a supply-chain and repository-hygiene property. Routing large dependencies through the project's own scoped tooling rather than Git LFS keeps the repository's own clone size bounded and avoids a second, less-auditable storage backend (an LFS remote) with its own access and retention behavior separate from the Git remote itself.

## Verification

- Focused tests: `scripts/test/cheap-transfer.test.mjs` (`node --test scripts/test/cheap-transfer.test.mjs`) — two tests, both operating on the real committed `.gitattributes` file(s) as reported by `git ls-files` (never an untracked scratch file that happens to be sitting on disk): the first fails on any `filter=lfs` declaration; the second fails on any `merge=lfs`/`diff=lfs` declaration (the two other attributes `git lfs track` writes alongside `filter=lfs`, closing the same door a partially hand-edited `.gitattributes` could otherwise leave open).
- Both were deliberately broken (a real `git lfs track`-shaped line appended to a scratch copy of `.gitattributes`) and confirmed to fail with the exact offending line quoted, before the file was restored to its original committed bytes (`git diff --stat .gitattributes` confirmed clean afterward) and the tests re-confirmed passing.
- Run: `node --test scripts/test/cheap-transfer.test.mjs`.

## Suggested articles

- `dependency-bootstrap.md` — the scoped tooling this policy routes large build dependencies through instead of Git LFS.
- `sanitized-instruction-copy.md` — where this policy's own prose statement lives, in `AGENTS.md`'s sanitized mirror.
- `unsigned-release-policy.md` — another release/build-time policy this repository enforces structurally rather than only in prose.
