import { defineDict } from "@/uh/dict/defineDict"

/**
 * Strings for the real Models screen build-out that don't already live in
 * the "models" namespace (src/uh/dict/models.dict.ts, seeded from the
 * design mock's fake client-side catalog/fit-slider prototype). This is a
 * separate namespace — not an extension of "models" — because
 * `defineDict` throws on a duplicate namespace registration and this
 * lane's allowed edits don't include that file.
 *
 * Deliberately does NOT reuse "models".fitVram/fitRam/fitNo: those were
 * seeded for the mock's fake two-tier "fits VRAM vs fits RAM vs too big"
 * slider. The real server-computed FitVerdict has four states
 * (runs-well/runs-with-limits/unlikely/unknown, see hardware.go) and
 * "runs-with-limits" specifically does NOT mean "fits in RAM" — it can
 * also mean "fits total VRAM but would evict a resident model". Reusing
 * the old labels would misrepresent what the server actually said.
 */
export const modelsUiDict = defineDict("modelsUi", {
  // Hardware fit bar
  ram: ["System RAM", "部機嘅 RAM"],
  vram: ["GPU VRAM", "顯示卡 VRAM"],
  freeOfTotal: ["free of", "得返"],
  storage: ["Free disk (models folder)", "模型資料夾剩返嘅磁碟位"],
  unknownValue: ["Unknown", "未知"],
  devicesUnknown: [
    "No compute device detected yet — this means not known yet, not \"no GPU\". It usually clears up moments after the server starts.",
    "重未偵測到顯示裝置 —— 意思係「重未知」，唔係「冇顯卡」。通常個伺服器啱啱起返身就會有。",
  ],
  contextLength: ["Context length used for fit estimates", "計算夾唔夾用嘅上下文長度"],
  contextOverride: ["set by OLLAMA_CONTEXT_LENGTH", "由 OLLAMA_CONTEXT_LENGTH 設定"],
  contextAssumed: [
    "assumed default — the real server may pick a different value",
    "假設嘅預設值 —— 實際伺服器可能會揀第個",
  ],
  measured: ["measured", "度過"],
  parsed: ["parsed from server log", "由伺服器日誌解讀"],
  assumed: ["assumed", "假設"],
  hardwareWarnings: ["Hardware detection notes", "偵測硬件時嘅備註"],

  // Pull queue
  queueTitle: ["Pull queue", "下載隊列"],
  stateQueued: ["Queued", "排緊隊"],
  stateDownloading: ["Downloading", "落緊載"],
  statePaused: ["Paused", "暫停咗"],
  stateFailed: ["Failed", "失敗咗"],
  stateCanceled: ["Canceled", "取消咗"],
  pauseAction: ["Pause", "暫停"],
  resumeAction: ["Resume", "繼續"],
  cancelAction: ["Cancel", "取消"],
  cancelKeepData: [
    "Cancel — keep partial data",
    "取消 —— 留低已下載嘅部份",
  ],
  cancelDeleteData: [
    "Cancel — delete partial data",
    "取消 —— 刪走已下載嘅部份",
  ],
  pausedNotice: [
    "Paused — partial data kept on disk. Resuming continues from here.",
    "暫停咗 —— 已下載嘅部份留咗喺硬碟度，一撳「繼續」就由呢度接住落。",
  ],

  // Installed / running models
  installedSectionTitle: ["Your models", "你嘅模型"],
  installedEmpty: [
    "No models installed yet. Pull one below to get started.",
    "重未裝任何模型。喺下面拉一個返嚟開始啦。",
  ],
  noSearchMatches: ["No installed models match this search.", "冇裝咗嘅模型夾到呢個搜尋。"],
  runningBadge: ["Running", "行緊"],
  removeModel: ["Remove model", "移除模型"],
  removeModelTitle: ["Remove this model?", "移除呢個模型？"],
  removeModelBodyIntro: [
    "This permanently deletes the downloaded weights for",
    "呢個動作會永久刪走已下載嘅模型檔案：",
  ],
  removeModelBodyWarning: [
    "from this machine. This cannot be undone — you'll need to pull it again to use it.",
    "喺呢部機度。呢個動作冚唪唥冇得返轉頭 —— 想再用就要重新拉過。",
  ],
  digest: ["Digest", "摘要"],
  modified: ["Modified", "改過"],
  family: ["Family", "家族"],
  parameterSize: ["Parameters", "參數量"],
  quantization: ["Quantization", "量化"],
  contextWindow: ["Context window", "上下文窗"],
  expiresAt: ["Unloads at", "幾時卸載"],
  vramInUse: ["VRAM in use", "用緊嘅 VRAM"],

  // Fit verdicts (see FitVerdict.verdict in hardware.go)
  fitRunsWell: ["Runs well", "行得順"],
  fitRunsWithLimits: ["Runs with limits", "行到但有限制"],
  fitUnlikely: ["Unlikely to run", "多數行唔到"],
  fitUnknown: ["Fit unknown", "未知夾唔夾"],
  fitDetailsTitle: ["Why this verdict?", "點解係咁嘅結論？"],
  evidence: ["Evidence", "證據"],
  assumptions: ["Assumptions", "假設"],
  missingData: ["Missing data", "缺咗嘅資料"],

  // Catalog (honest empty state — there is no downloaded catalog)
  catalogTitle: ["Browse the catalog", "睇吓模型目錄"],
  catalogNotDownloaded: [
    "Catalog has not been downloaded",
    "重未下載模型目錄",
  ],
  catalogNotDownloadedBody: [
    "There's no offline catalog to browse yet, so this can't list models you haven't already got. If you know the exact model reference, pull it directly below.",
    "而家重未有離線目錄可以睇，所以呢度列唔到你未裝過嘅模型。如果你知道確實嘅模型名，可以直接喺下面拉。",
  ],
  quickPullLabel: ["Pull by exact name", "打模型名直接拉"],
  quickPullPlaceholder: ["e.g. llama3.3:70b", "例如 llama3.3:70b"],
  quickPullButton: ["Pull", "拉"],

  // Toasts / status text
  pullQueuedToast: ["Queued", "已排隊"],
  pullFailedToast: ["failed", "失敗咗"],
  pullCompleteToast: ["finished downloading", "已經落完"],
  modelRemovedToast: ["removed", "已移除"],
} as const)

declare module "@/uh/dict/registry" {
  interface DictRegistry {
    modelsUi: (typeof modelsUiDict)["dict"]
  }
}
