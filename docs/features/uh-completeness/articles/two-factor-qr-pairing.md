# Two-Factor QR Pairing

## Behaviour

`app/ui/app/src/screens/toolbox/PairingDialog.tsx` (213 lines) implements real QR-based TOTP pairing rather than base32-only entry: a name/algorithm(SHA1/SHA256/SHA512)/digits(6-8)/period form, a "Preview pairing" step that asks the server for a genuinely fresh random secret and its `otpauth://totp/` URI without persisting anything yet, an in-process QR render of that exact URI, the manual base32 secret grouped into 4-character blocks behind an explicit reveal toggle (`revealed`), and a final "Confirm & store secret" step that is the only call in the whole flow that actually writes the secret into this computer's OS credential vault.

The QR itself (`app/ui/app/src/screens/toolbox/QrCode.tsx`) is drawn entirely in-process from `qrEncoder.ts`'s own encoder (`encodeQr`) as an inline SVG -- no `<img>`, no canvas round-trip, and explicitly no third-party or remote QR image service, matching the canonical contract's "never a third-party QR web service" requirement exactly. A 4-module quiet zone is added on every side, matching the real ISO/IEC 18004 minimum a scanner expects. The encoder is directly, thoroughly tested: `qrEncoder.test.ts`'s nine cases include round-tripping a real `otpauth://` pairing URI and a Cantonese account name through independent decoding, forcing a multi-block version for a long payload, determinism (encoding the same text twice yields an identical matrix), and the standard finder-pattern/dark-module placement a real scanner relies on.

The manual secret is never revealed by default (`revealed` starts `false`), and the confirm step's own doc comment states plainly that nothing is persisted until that final explicit action -- so a user who abandons the dialog after previewing has stored nothing.

## Configuration

TODO(two-factor-qr-pairing): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(two-factor-qr-pairing): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(two-factor-qr-pairing): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(two-factor-qr-pairing): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(two-factor-qr-pairing): link the related features, the prerequisites, and the natural next article a reader should open.
