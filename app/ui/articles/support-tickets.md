# Support Tickets

## Behaviour

The Status screen's Support Tickets card (`app/ui/app/src/screens/status/SupportTicketsCard.tsx`, 223 lines) plays the recovery route as a fictional support desk, per the canonical contract: a category picker (locked out / confused / question), a bounded description field (`MAX_DESCRIPTION_LENGTH = 500`), a locally generated ticket that moves from filed to a canned response to resolved on demand. `SupportTicketsCard.dom.test.tsx` proves the disclosure line ("nothing is sent anywhere") is identical across every funny level -- via a dedicated `channel="label"` that structurally skips `funny()` styling -- stays present and unstyled in bilingual mode, and is shown even under School mode (since the disclosure is a fact, not a dim-sum/humour feature that School mode would hide); a separate test proves filing a ticket shows the canned response and moves it to resolved, and that an empty ticket cannot be submitted.

The "resolution" is deliberately honest about what this lane's allowed paths permit: the card's own doc comment explains that every JSON-backed store in this project resolves its path under `%LOCALAPPDATA%\Ollama`, but there is no webview binding (`app/cmd/app/webview.go`'s `wv.Bind(...)` calls) that could launch a native Explorer window, and adding one was out of scope for the lane that built this card. So "Copy folder path" does exactly what it says -- puts the real, exact path on the clipboard -- rather than shipping a button labeled "Open folder" that would silently do nothing, which is precisely the decorative-control failure the shared instructions forbid.

## Configuration

TODO(support-tickets): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(support-tickets): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(support-tickets): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(support-tickets): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(support-tickets): link the related features, the prerequisites, and the natural next article a reader should open.
