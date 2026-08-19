import { defineDict } from "@/uh"

/**
 * Shell-chrome strings the "app" dictionary doesn't carry yet: the command
 * palette's own title/search label, the notification bell's accessible
 * "unread" state, and the honest "not built yet" copy every placeholder
 * screen shows. Registered from outside src/uh/** (this lane's boundary)
 * using the same defineDict()/DictRegistry augmentation every other
 * *.dict.ts file uses — the namespace just lives here instead of there.
 *
 * Importing this module anywhere runs `defineDict()` as a side effect,
 * which is what actually registers the "shell" namespace at runtime;
 * every consumer of `useT("shell")` in this lane imports it directly so
 * registration never depends on import order elsewhere.
 */
export const shellDict = defineDict("shell", {
  unread: ["Unread notifications", "有未讀通知"],
  commandPalette: ["Command palette", "指令面板"],
  commandSearch: ["Command search", "搵指令"],
  screenKind: ["Screen", "版面"],
  noMatches: ["No matches", "冇符合嘅"],
  notBuiltYet: ["Not built yet", "仲未起好"],
  notBuiltYetBody: [
    "This screen is wired into navigation so you can see where it will live. The chrome around it is real — the room inside is still empty.",
    "呢個畫面已經駁咗落導航度，等你睇吓佢擺喺邊。周圍嘅裝修係真㗎，不過入面間房仲係空嘅。",
  ],
} as const)

declare module "../../uh/dict/registry" {
  interface DictRegistry {
    shell: (typeof shellDict)["dict"]
  }
}
