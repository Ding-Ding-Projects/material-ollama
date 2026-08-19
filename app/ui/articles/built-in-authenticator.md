# Built-In Authenticator

## Behaviour

The Toolbox screen's Authenticator section (`app/ui/app/src/screens/toolbox/AuthenticatorSection.tsx`) is a real, local TOTP authenticator: registered accounts, codes computed server-side, and secrets stored in this machine's OS credential vault (`app/ui/totp.go`'s `SecretStore`) -- the component's own doc comment states plainly that nothing here is simulated, and no secret is ever cached in component state beyond the one documented pairing-preview reveal. `TotpAccountRow.tsx` renders each account's live current code, grouped for readability, with a non-colour-only countdown, and a delete action gated behind typing the exact "REMOVE" keyword (`TotpAccountRow.dom.test.tsx`'s "keeps the delete action inert until the exact REMOVE keyword is typed" and "shows the real failure and a retry route when the delete call fails").

The RFC 6238/6229 correctness is proven directly against the published test vectors, not merely asserted: `app/ui/totp_test.go`'s `TestTOTPRFC6238Vectors` matches the RFC 6238 Appendix B SHA1/8-digit vectors at `T=59s` and `T=1111111109s`, and further cases prove a freshly generated secret verifies its own current code, tolerate one period of clock skew in either direction, reject a code two periods away, and reject empty/garbage input. `TestDecodeBase32SecretRoundTrip` and `TestNormalizeTOTPParamsDefaults` cover the encoding and parameter-defaulting halves respectively. A clock-skew warning (`clockSkewWarning`) surfaces in the UI itself when the local clock is likely to produce codes a real server would reject, rather than emitting confidently wrong digits with no explanation.

Standard algorithms and digit counts are supported (SHA1/SHA256/SHA512, 6-8 digits, arbitrary period via `PairingDialog.tsx`'s form), defaulting to SHA1/6/30 as the canonical contract requires. The refusal-consistent secret handling described in `two-factor-qr-pairing.md` applies here too: beyond the one-time pairing reveal, no secret value, length, or composition is ever displayed or characterized by this UI.

## Configuration

TODO(built-in-authenticator): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(built-in-authenticator): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(built-in-authenticator): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(built-in-authenticator): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(built-in-authenticator): link the related features, the prerequisites, and the natural next article a reader should open.
