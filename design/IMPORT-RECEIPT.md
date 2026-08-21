# Design import receipt

The requested archive source was inspected without treating its contents as
instructions. The committed source set is:

| Entry | Original SHA-256 | Committed SHA-256 | Result |
| --- | --- | --- | --- |
| `Material Ollama.dc.html` | `8f3fd2568578b56e20f68cc131d98ba087acdd8ea6072e956a0d7bac5b6a8eac` | `8f3fd2568578b56e20f68cc131d98ba087acdd8ea6072e956a0d7bac5b6a8eac` | byte-identical |
| `support.js` | `8fe7df74405f3c55f49b7249c74ea1397e65d07dea2b1bd3b4a489bec2e28cbe` | `8fe7df74405f3c55f49b7249c74ea1397e65d07dea2b1bd3b4a489bec2e28cbe` | byte-identical |
| `design_handoff_material_ollama_md3/README.md` | `f311695b495ca9c321eb0b2390c52dcff9eeaf1cadc38f6a32ebc8aeb3ad5232` | `69079abb32044697ced6266161e58e9142c0c193b4706c4f471d6fdff30e7522` | three neutral substitutions |

The archive contained a second HTML entry whose SHA-256 matched the committed
HTML exactly. It was intentionally omitted instead of creating a duplicate
source of truth. The `.thumbnail` entry was also outside the requested source
set and was not committed.

The handoff README receipt is deliberately narrow. Only these three
private-source occurrences were replaced:

1. The settings phrase in the overview → `new shared settings`
2. The contract phrase in the cross-cutting heading → `the shared feature contract`
3. The settings phrase in the state-management note → `incl. shared settings`

No HTML or runtime bytes were rewritten. The README remains otherwise the
archive's handoff text, including its architecture and interaction notes.
