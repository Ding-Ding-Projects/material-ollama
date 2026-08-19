import { defineDict } from "@/uh/dict/defineDict"

/**
 * The offline documentation browser's own strings. A separate "docs"
 * namespace rather than additions to "tools" -- this lane's allowed paths
 * do not include app/ui/app/src/uh/dict/tools.dict.ts, and a namespace is
 * exactly the boundary `defineDict` is built to let two lanes not collide
 * across.
 */
export const docsDict = defineDict("docs", {
  searchPlaceholder: ["Search 85 features…", "搵功能（85 個）…"],
  searchLabel: ["Search documentation articles", "搜尋說明文章"],
  noMatches: ["No features match this search.", "搵唔到符合嘅功能。"],
  matchCount: ["{n} of 85 features", "85 個功能入面 {n} 個"],
  selectPrompt: ["Select a feature to read its article.", "揀返個功能睇文章。"],
  notWrittenTitle: ["Article not yet written", "文章未寫"],
  notWrittenBody: [
    "This feature is in the shared inventory, but nobody has written its article yet -- only the generated section scaffold exists. Rendering that scaffold as documentation would claim the feature is documented when it isn't.",
    "呢個功能已經入咗清單，但仲未寫文章，淨係得個自動生成嘅骨架。當佢係文章咁樣顯示，即係呃人話已經有文檔。",
  ],
  writtenBadge: ["Written", "已寫"],
  scaffoldBadge: ["Not written", "未寫"],
  loadError: ["Could not load the documentation bundle.", "載入唔到說明文件。"],
  articleLoadError: ["Could not load this article.", "載入唔到呢篇文章。"],
  loadingLabel: ["Loading article", "載入緊文章"],
} as const)

declare module "@/uh/dict/registry" {
  interface DictRegistry {
    docs: (typeof docsDict)["dict"]
  }
}
