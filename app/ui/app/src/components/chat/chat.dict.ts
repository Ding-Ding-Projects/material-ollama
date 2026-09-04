import { defineDict } from "@/uh"

/**
 * The "chat" namespace: composer controls.
 *
 * Started small on purpose. ChatForm is a large pre-rewrite component whose
 * strings are still English literals; localizing all of it is its own lane.
 * Every control converted to a Material primitive brings its strings here as
 * it goes, so the namespace grows with the conversion rather than landing as
 * one unreviewable sweep.
 */
export const chatDict = defineDict("chat", {
  webSearch: ["Web search", "網上搜尋"],
  webSearchOn: ["Web search is on", "網上搜尋開咗"],
  webSearchOff: ["Web search is off", "網上搜尋熄咗"],
  think: ["Think", "諗嘢"],
  thinkOn: ["Thinking is on", "諗嘢模式開咗"],
  thinkOff: ["Thinking is off", "諗嘢模式熄咗"],
  thinkLevelLabel: ["Thinking level", "諗嘢深度"],
  thinkLow: ["Low", "淺"],
  thinkMedium: ["Medium", "中"],
  thinkHigh: ["High", "深"],
} as const)

declare module "../../uh/dict/registry" {
  interface DictRegistry {
    chat: (typeof chatDict)["dict"]
  }
}
