# Sanitized Instruction Copy

## Behaviour

`README.md` and `AGENTS.md` both carry a real, substantial, sanitized mirror of the durable shared operating instructions that govern automated agent work in this repository — not a one-line pointer, and not the private source verbatim. `AGENTS.md` carries the full mirror, organized into sections covering instruction source and scope, autonomous completion and persistence, Git/GitHub completion discipline, continuous-integration and release policy (including the permanent no-code-signing rule), secrets handling, build-dependency policy, refusals and destructive-action boundaries, and this project's own feature-completeness discipline (which its `docs/features/uh-completeness/` inventory is a working instance of). `README.md` carries a shorter, real summary of the same rules under its own "Agent instructions" section, pointing back to `AGENTS.md` for the full version.

"Sanitized" here means specifically: every absolute path outside the repository, every OS username or home-directory reference, every machine or host name, every private-network IP address, every SSH connection target, and every credential/token value that appears anywhere in the private canonical source is either omitted entirely or restated as a *generalized rule with no identifying detail attached* — per the private source's own instruction that a rule which cannot be stated without a private detail is generalized rather than silently dropped. The private in-house conversational vocabulary the source instructions also define is omitted entirely and on purpose (that vocabulary is explicitly private-conversation-only and never meant to reach a public repository), rather than mirrored in any form.

## Configuration

Not applicable — this is static documentation content, refreshed by hand whenever the underlying shared instructions meaningfully change, not a runtime-configurable feature.

## Failure modes

If a future edit to either file accidentally reintroduces a private detail (an absolute path, a real IP, a token-shaped string), the guard below fails immediately and names exactly which pattern matched and where — this is not merely a style review, it is a mechanical check that runs as part of this project's own local test suite.

## Security considerations

This is fundamentally a leak-prevention control: the underlying private source is a machine- and account-specific operating document that must never appear in a public repository. The mirror exists precisely so agents working in this repository still get the durable, generally-applicable *rules* — without the mirror ever becoming the leak vector it exists to avoid. The guard test's pattern list was built from the actual classes of leak this kind of document produces (a Windows user-profile path, a private-network IP literal, an SSH-style `user@host` target, common credential-token prefixes) plus this specific machine's own known-private substrings (an OS username, a real email address, an SSH host pattern), so it catches both the general shape of a leak and the concrete ones most likely to actually occur here.

## Verification

- Focused tests: `scripts/test/sanitized-instruction-copy.test.mjs` (`node --test scripts/test/sanitized-instruction-copy.test.mjs`) — four tests: `README.md` and `AGENTS.md` each independently scanned for every leak pattern (Windows/Unix home-directory paths, private `10.x`/`172.16-31.x`/`192.168.x` IPv4 ranges, SSH `user@ip` targets, GitHub/OpenAI/AWS/bearer-token shapes, and the three known-private substrings for this machine/account) with zero matches required; `AGENTS.md` is confirmed to be a real, substantial mirror (over 4000 bytes, genuinely covering code signing, autonomous behavior, destructive-action refusal, secrets, and push discipline — not merely a file that happens to be long) rather than a token gesture at compliance; `README.md` is confirmed to carry real content of its own.
- The guard was deliberately broken twice: once by appending a literal Windows user-profile path (`C:\Users\<real-username>\...`) to `AGENTS.md` and confirming the exact pattern name and matched substring were reported, and once by confirming the length/content assertions correctly failed against the original, pre-authorship 21-line `AGENTS.md`. Both were restored and re-confirmed passing.
- Run: `node --test scripts/test/sanitized-instruction-copy.test.mjs`.

## Suggested articles

- `vocabulary-hash-lock.md` — the companion contract governing the private instructions' vocabulary specifically: proving possession and currency of it without ever letting its content reach this repository at all.
- `issue-handoff.md` and `rolling-discussion.md` — other places this project's Git/GitHub completion discipline (documented in this mirror) is put into practice.
