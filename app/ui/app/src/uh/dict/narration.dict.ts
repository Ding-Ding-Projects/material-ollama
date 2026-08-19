import { defineDict } from "./defineDict"

/**
 * Strings owned by `../narration.ts`. Kept minimal and separate from `app`
 * because it exists purely to give the narration module's own diagnostic
 * message a localized home, not because narration needs a whole namespace
 * of copy — the settings UI that wires narration up belongs to a sibling
 * lane.
 */
export const narrationDict = defineDict("narration", {
  noCantoneseVoice: [
    "No Cantonese voice is installed on this machine. Windows Settings → Time & language → Speech → Add voices.",
    "No Cantonese voice is installed on this machine. Windows Settings → Time & language → Speech → Add voices.",
  ],
} as const)

declare module "./registry" {
  interface DictRegistry {
    narration: (typeof narrationDict)["dict"]
  }
}
