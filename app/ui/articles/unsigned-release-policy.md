# Unsigned Release Policy

## Behaviour

The Status screen's Release card (`app/ui/app/src/screens/status/ReleaseCard.tsx`) states plainly, unconditionally, and for every build (dev or release) that code signing is permanently out of scope for this project and that Windows may show an unknown-publisher warning as a result -- exactly the disclosure the permanent no-signing policy requires. Critically, the claim is not asserted alone: `app/ui/release.go`'s `unsignedEvidence` constant names the exact, checkable mechanism that backs it -- `.github/workflows/release.yaml`'s "Verify unsigned Windows package" step, which throws unless `(Get-AuthenticodeSignature 'dist\OllamaSetup.exe').Status -eq 'NotSigned'` -- and the card renders that literal string under "Unsigned by policy" so a user (or an auditor) can go verify the claim against the real workflow rather than trusting prose. `app/ui/release_test.go`'s `TestReleaseInfo_DevBuildReports0_0_0WithNoCodeName` asserts `UnsignedEvidence` is never empty, precisely so the unsigned claim can never ship without naming the assertion that backs it.

This is a genuinely stronger disclosure than a bare warning: most apps that skip signing either say nothing or make an unverifiable claim ("this is safe, trust us"); this one names a CI assertion an outside party could independently go read and confirm actually runs.

## Configuration

TODO(unsigned-release-policy): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(unsigned-release-policy): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(unsigned-release-policy): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(unsigned-release-policy): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(unsigned-release-policy): link the related features, the prerequisites, and the natural next article a reader should open.
