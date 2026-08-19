import { defineDict } from "./defineDict"

/**
 * Model store strings: search, hardware fit, pull queue. Seeded from the
 * design prototype's `MODEL_DICT` object.
 */
export const modelsDict = defineDict("models", {
  modelStore: ["Model store", "模型舖"],
  modelStoreSub: [
    "Pull models to this machine, check what fits your hardware, then chat.",
    "拉模型返嚟，睇吓部機夾唔夾，再開始傾。",
  ],
  searchModels: ["Search models", "搵模型"],
  hardwareFit: ["Hardware fit", "硬件夾唔夾"],
  pullShown: ["Pull all shown", "拉晒顯示嘅"],
  pullQueue: ["Pull queue", "下載隊列"],
  installed: ["Installed", "裝咗"],
  pull: ["Pull", "拉"],
  fitVram: ["Fits in VRAM", "入到 VRAM"],
  fitRam: ["Fits in RAM", "入到 RAM"],
  fitNo: ["Too big", "太大部"],
  filterMenu: ["Filter menu…", "篩選單…"],
  applySearch: ["Apply to search", "套用搜尋"],
} as const)

declare module "./registry" {
  interface DictRegistry {
    models: (typeof modelsDict)["dict"]
  }
}
