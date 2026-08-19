# Vocabulary Hash Lock

## Behaviour

This project gates its builds and its pushes on a lock derived, at run time, from a private instruction source that lives entirely outside this repository — and this repository itself never contains that private source's content, and never contains a pinned hash of it either. `scripts/check-vocabulary.mjs` is the implementation.

The mechanism, precisely:

1. **Locate a private source.** The script searches a fixed list of candidate locations, every one of which is derived from the operating user's home directory (`os.homedir()`) — never from anything inside this repository — for a Markdown file whose text contains a specific section-start heading. An explicit `AGENT_VOCAB_SOURCE` environment variable, when set, is tried first. None of this is hard-coded to one username or machine; the whole point is that a private source, if one exists on the machine running the check, is found without this repository ever needing to know where.
2. **Extract and hash the vocabulary section.** Only the text between that start heading and the next top-level heading is hashed (SHA-256) — not the whole file, and not merely a filename or a timestamp — so an edit anywhere else in the same private document never triggers this gate, and an edit *inside* the section always does.
3. **Compare against a lock file sitting beside the private source** — also outside this repository, never committed here, and never even read except by this one script. `--lock` (re)writes that lock file with the section's current hash; the default (check) mode compares against it.

The result is fail-open for a stranger and fail-closed for staleness, exactly as the private source's own instructions specify: someone building this public repository with no private source at all sees a clean skip (`outcome: "skip-no-source"`, exit 0) with a plain explanation — refusing a stranger a build of a public repository would be absurd. Someone whose private source *is* present but whose lock is missing, stale, or corrupt sees a hard failure (exit 1) naming exactly what's wrong and what to run to fix it. Adding a term to the private dictionary therefore fails every build and every guarded push until whoever has that private source deliberately reviews the change and re-locks it — that friction is the entire point, not a bug.

`build.bat` calls `node scripts\check-vocabulary.mjs` after the shared-inventory gates and before delegating to the real Windows build, failing the build closed on a genuine mismatch. `scripts/git-hooks/pre-push` (opt-in via `git config core.hooksPath scripts/git-hooks`, not silently enabled for every clone) runs the identical check before a push.

**What this cannot prove**, stated plainly rather than implied: it cannot and does not claim that the private vocabulary was ever actually *spoken* by any agent in any conversation. It only proves that a private dictionary file, if one is present on the machine, exists, is readable, and matches a hash somebody deliberately pinned after reviewing it. Claiming more than that would make this exactly the decorative gate the shared instructions elsewhere warn against.

## Configuration

- `AGENT_VOCAB_SOURCE` (environment variable) — an explicit path to the private source file, taking priority over the default candidate search.
- `node scripts/check-vocabulary.mjs --lock` — (re)writes the lock file beside the located private source, pinning its current hash. This is the one action a maintainer performs after reviewing a real dictionary change.
- `git config core.hooksPath scripts/git-hooks` — opts a local checkout into running the pre-push hook; not active by default.

## Failure modes

- No private source found anywhere → skip, exit 0, explanatory message. Not a failure.
- Private source found, no lock file present → fail closed, exit 1, names the exact lock path to create with `--lock`.
- Private source found, lock file present but its JSON is corrupt/unparseable → fail closed, exit 1.
- Private source found, lock file present, hash mismatches (the dictionary changed since the last lock) → fail closed, exit 1, states both the locked and the current hash.
- An edit anywhere in the private source *outside* the vocabulary section → no effect; the section hash is unchanged, so the check still passes.

## Security considerations

The private source's actual content — the vocabulary itself — never touches this repository at any point: not in a commit, not in an error message (only its SHA-256 hash and file path are ever printed), not in the lock file (which records only the hash, the source path, and a timestamp). The lock file itself lives outside this repository by construction (beside the private source, in the user's home directory), so there is no path by which running this check could accidentally commit anything private.

## Verification

- Focused tests: `scripts/check-vocabulary.mjs --self-test` — ten checks, run entirely against real temporary files under the OS temp directory, never against the operator's actual private source: the no-source skip path; a candidate file present but lacking the vocabulary heading (also skips); locking, then a plain check passing against an unchanged source; a fail-closed hash mismatch after editing content *inside* the section (deliberately confirmed to require the edit land inside the section boundary — an earlier draft of this exact self-test case had the planted edit land just outside it and incorrectly passed, which is exactly the kind of guard-that-never-actually-fires this project's own documented pitfalls warn about); an edit *outside* the section not affecting the hash; a corrupt lock file failing closed; first-matching-candidate-wins across multiple candidates; and the section extractor correctly stopping at the next heading rather than reading to end-of-file.
- Wrapper test: `scripts/test/vocabulary-hash-lock.test.mjs` (`node --test scripts/test/vocabulary-hash-lock.test.mjs`) — runs the self-test suite above via `execFileSync` and asserts a clean pass; separately confirms that with an intentionally-nonexistent `AGENT_VOCAB_SOURCE` override, the process never crashes and produces one of the recognized outcome messages (worded to remain correct regardless of whether this specific machine happens to have its own real private source in one of the default candidate directories); and confirms by reading the script's own source that no default candidate path is ever derived from this repository's own root.
- Real-machine verification: on this machine, the default candidate search located a real private source; `node scripts/check-vocabulary.mjs` initially reported `fail-missing-lock` (no lock file yet existed); `node scripts/check-vocabulary.mjs --lock` wrote the lock file; a subsequent `node scripts/check-vocabulary.mjs` reported a clean pass. Neither the private source's content nor its path leaked into this repository at any point in that sequence.
- Implementation: `scripts/check-vocabulary.mjs`; wiring: `build.bat`, `scripts/git-hooks/pre-push`.

## Suggested articles

- `sanitized-instruction-copy.md` — the companion contract: what of the same private instructions IS allowed to reach this public repository (a sanitized, generalized mirror), and how that's kept honest.
- `unsigned-release-policy.md` — another build-time gate `build.bat` runs before delegating to the real Windows build.
- `repository-root-build-script.md` — `build.bat`'s own broader gate sequence this check is one step of.
