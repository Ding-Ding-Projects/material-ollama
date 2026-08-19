import { defineDict } from "@/uh"

/**
 * Toolbox-screen-level copy this lane needs that `src/uh/dict/tools.dict.ts`
 * doesn't already carry (that file is outside this lane's allowed paths, so
 * this is a sibling namespace rather than an edit to it — same pattern as
 * `src/components/shell/shell.dict.ts`). The screen still reuses `tools`
 * directly for `toolboxTitle`, `toolboxSub`, `regexLab`, `converter` and
 * `authenticator` — those already exist and say exactly what's needed.
 */
export const toolboxLabDict = defineDict("toolboxLab", {
  regexLabSub: [
    "A fully local pattern lab: build, test and apply a regular expression with nothing sent anywhere. Insert a construct, watch it match your test text, then apply it — the same builder every search field's \".*\" affordance opens.",
    "全部喺本機嘅圖案實驗室：打、試、用返個 regex，乜都唔會送出去。揀個構件試吓，睇吓配唔配到你嘅測試文字，掂就用落去——同每個搜尋欄「.*」掣開嗰個係同一個 builder。",
  ],
  demoSearchLabel: ["Regex-aware search demo", "識 regex 嘅搜尋示範"],
  demoSearchPlaceholder: ["Applied pattern lands here…", "套用咗嘅圖案會喺呢度出現…"],
  demoSearchHint: [
    "Click .* to jump down to the builder, or build a pattern below and click \"Apply to search\" to send it up here.",
    "撳 .* 跳去下面個 builder，或者喺下面打個圖案，撳「用喺搜尋」送上嚟呢度。",
  ],
  appliedToast: ["Applied to the search field above.", "已經套用咗去上面個搜尋欄。"],
} as const)

declare module "../../uh/dict/registry" {
  interface DictRegistry {
    toolboxLab: (typeof toolboxLabDict)["dict"]
  }
}
