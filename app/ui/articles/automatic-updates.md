# Automatic Updates

## Behaviour

The Status screen's Automatic Updates card (`app/ui/app/src/screens/status/AutomaticUpdatesCard.tsx`) reads and writes the real `AutoUpdateEnabled` field through the same `GET`/`POST /api/v1/settings` endpoints the pre-existing `Settings.tsx` toggle already used -- a genuinely second control surface for one real setting, not a fork of it, matching the "prefer the real control over a printout of it" rule. `AutomaticUpdatesCard.dom.test.tsx`'s "reflects the real AutoUpdateEnabled setting and can toggle it" proves the switch reads and writes the live value, and "always states that updates are unsigned too" proves the unsigned-by-policy disclosure renders unconditionally alongside it.

The backend half this card's switch drives is independently, thoroughly tested: `app/updater/updater_test.go`'s `TestAutoUpdateDisabledSkipsDownload` and `TestAutoUpdateReenabledDownloadsUpdate` prove the setting genuinely gates whether a background check downloads an update, not merely whether a UI element is greyed out; `TestBackgroundCheckerSkipsAlreadyStagedETagDownload`, `TestDownloadNewReleaseRejectsUnsafeHeaderFilename`, `TestDownloadNewReleaseDoesNotUseRawETagAsPathComponent`, `TestCancelOngoingDownload`, and `TestTriggerImmediateCheck` cover staging safety, path-injection rejection, cancellation, and a manual "check now" path.

Permanent no-signing policy is honored throughout: the card's own unsigned-note copy is unconditional, and nothing in `updater_test.go` claims or checks a signature. This card does not itself render the fuller persistent "ready to restart" banner with version/release-note link/Restart-Later actions the canonical contract also describes -- that machinery, if it exists, was not found wired to this specific card in this pass.

## Configuration

TODO(automatic-updates): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(automatic-updates): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(automatic-updates): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(automatic-updates): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(automatic-updates): link the related features, the prerequisites, and the natural next article a reader should open.
