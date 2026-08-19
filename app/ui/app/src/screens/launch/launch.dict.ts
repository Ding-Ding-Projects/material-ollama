import { defineDict } from "@/uh"

/**
 * Strings specific to the real Launch screen (the grid of harness cards at
 * `/launch`), co-located with its components per the lane brief. The
 * screen's heading/subheading reuse the "app" namespace's existing
 * `launchTitle`/`launchSub` keys (already shipped for this destination's
 * nav-rail label) rather than duplicating them here.
 *
 * Importing this module runs `defineDict()` as a side effect, which is what
 * registers the "launch" namespace at runtime -- every consumer of
 * `useT("launch")` in this lane imports it directly so registration never
 * depends on import order elsewhere.
 */
export const launchDict = defineDict("launch", {
  launchAction: ["Launch", "開"],
  copyAction: ["Copy command", "複製指令"],
  installedBadge: ["Installed", "裝咗喇"],
  notInstalledBadge: ["Not installed", "未裝"],
  notInstalledReason: ["is not installed -- its binary was not found on this machine", "未裝 -- 喺呢部機度搵唔到個程式"],
  installHintPrefix: ["Install hint:", "裝法提示："],
  launchStarted: ["opened in a new terminal", "喺新終端機開咗"],
  launchFailed: ["could not be launched", "開唔到"],
  copied: ["Command copied", "指令複製咗喇"],
  loadFailed: [
    "Could not load the list of coding agents.",
    "個 agent 清單載入唔到。",
  ],
  loading: ["Loading coding agents…", "載緊 agent 清單…"],
} as const)

declare module "../../uh/dict/registry" {
  interface DictRegistry {
    launch: (typeof launchDict)["dict"]
  }
}
