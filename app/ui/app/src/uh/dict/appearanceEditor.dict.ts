import { defineDict } from "./defineDict"

/**
 * Per-element appearance editor strings. Seeded from the design prototype's
 * `APP_ED_DICT` object.
 */
export const appearanceEditorDict = defineDict("appearanceEditor", {
  editAppearance: ["Edit appearance…", "執吓外觀…"],
  appEdNote: [
    "Pick an element class, then a color. Overrides apply live, persist, and survive theme or seed changes until you reset them.",
    "揀元素，再揀色。即時生效，會記住。",
  ],
  resetElement: ["Reset element", "還原元素"],
  resetAllOverrides: ["Reset all overrides", "還原晒"],
  doneBtn: ["Done", "搞掂"],
} as const)

declare module "./registry" {
  interface DictRegistry {
    appearanceEditor: (typeof appearanceEditorDict)["dict"]
  }
}
