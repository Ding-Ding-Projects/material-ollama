# Hardware Fit

## Behaviour

`app/ui/hardware.go`'s `computeFitVerdict` (L388-L462) is the real decision function behind every fit badge the app shows: given a model's byte size, the endpoint's free VRAM, and free system RAM, it returns one of the four canonical verdicts -- `runs-well`, `runs-with-limits`, `unlikely`, or `unknown` -- and `hardware_test.go`'s `TestComputeFitVerdict_FitsFreeVRAMYieldsRunsWell` (plus its sibling nil/unknown-input cases) proves `unknown` is the only possible outcome when both RAM and VRAM are genuinely undetected, rather than a silent false negative. Every reported quantity is a `ByteValue` carrying an explicit confidence level -- `measured` (queried live via `GlobalMemoryStatusEx`/`GetDiskFreeSpaceExW`), `parsed` (scraped from a server log line), or `assumed` (a documented default) -- so the UI never coerces "not known yet" into a silent zero.

On the frontend, the Models screen's "Hardware fit" card (`app/ui/app/src/screens/models/HardwareFitBar.tsx`) renders exactly that data: measured System RAM and free disk with their confidence badges, GPU VRAM with an honest "No compute device detected yet -- this usually clears up moments after the server starts" explanation rather than a bare "0 GB", the context length used for the estimate (with its own assumed/measured/parsed provenance), and a "Hardware detection notes" list surfacing any warnings the server produced. `FitBadge.tsx` renders the same four verdicts as compact chips on each installed model card ("Runs with limits", etc.), and `app/store/store.go`'s `Hardware map[string]HardwareOverrides` (keyed per endpoint, not flattened, because RAM/VRAM belong to the machine an endpoint talks to) is where a user-supplied hardware override would persist once a UI for entering one exists -- no such override UI has been found yet, so today the numbers shown are always the server-detected ones.

## Configuration

TODO(hardware-fit): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(hardware-fit): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(hardware-fit): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(hardware-fit): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(hardware-fit): link the related features, the prerequisites, and the natural next article a reader should open.
