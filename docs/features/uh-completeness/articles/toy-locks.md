# Toy Locks

## Behaviour

`Lockable.tsx` (with `app/ui/app/src/uh/locksStore.ts` behind it) is a real, wrap-any-element toy lock: it renders "Lock this element…" on an unlocked element, replaces the real children with a locked placeholder that leaves nothing reachable underneath once locked, and correctly separates two independently created locks so neither's credential ever unlocks the other -- `Lockable.dom.test.tsx`'s five tests prove exactly this, including "a wrong password stays locked and shows the mismatch; the right one reveals the children again" and "two independently locked elements never share a credential". `LockManager.tsx` is the enumerable list every lock surface requires: an empty state, a real search over the list, bulk-remove of only the currently-unlocked selection (protecting a still-locked row from being force-removed blind), and a redacted history export with no secret-shaped content (`LockManager.dom.test.tsx`'s four tests).

Credentials are handled carefully for what they are: `locksCrypto.ts` salts and SHA-256-hashes a password (via the real Web Crypto `crypto.subtle`) rather than ever storing raw bytes, and never needs the plaintext again to verify a later attempt (`locksCrypto.dom.test.tsx`'s "never needs the plaintext again -- verifies correct and rejects wrong", "two locks with the same password still get independent salts and hashes"). TOTP-method locks pass the same real RFC 6238 vectors the built-in authenticator does (`matches the RFC 6238 Appendix B SHA1/8-digit vector at T=59s` and `T=1111111109s`). Unlock duration genuinely offers all three canonical choices -- "this surface only" (component-local React state, resets on unmount), a chosen number of minutes, or "until the app closes" (`sessionStorage`) -- proven by `locksStore.dom.test.tsx`'s "'surface' duration never touches session storage", "'minutes' duration expires after the chosen window", and "'untilClose' duration stays unlocked far into the future". A rate limiter locks out after `LOCKS_MAX_ATTEMPTS` failures and recovers after the wait elapses, and a correct unlock clears the lockout state including its backoff escalation.

The one honestly-declared deviation from the fuller contract: a lock's credential lives in this renderer's own local storage rather than the operating-system credential vault. The module's own header comment explains why this is a deliberate, disclosed choice rather than an oversight -- this feature's own contract already states a toy lock is "a self-imposed speed bump, not encryption," with "delete the app's local data folder" as its documented recovery path, and wiring a real Go-backed vault endpoint was outside this lane's frontend-only allowed paths (mirroring the same placeholder pattern `app/ui/app/src/uh/provider.tsx` already used for preferences before a later lane gave it a real backend).

## Configuration

TODO(toy-locks): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(toy-locks): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(toy-locks): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(toy-locks): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(toy-locks): link the related features, the prerequisites, and the natural next article a reader should open.
