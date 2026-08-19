import { defineDict } from "@/uh"

/**
 * Copy for ConverterSection, ConvertCategoryList and the job queue --
 * everything `src/uh/dict/tools.dict.ts` (outside this lane's allowed
 * paths) doesn't already carry. That file's `converter`, `converterDesc`,
 * `converterHonest` and `queue` keys are reused directly.
 */
export const convertDict = defineDict("convert", {
  pickFile: ["Pick a file…", "揀個檔案…"],
  changeFile: ["Change file", "換過個檔案"],
  noFileSelected: [
    "No file selected. Every conversion starts by picking one through the native file dialog.",
    "未揀檔案。要轉檔先要用個原生檔案對話框揀一個。",
  ],
  webviewUnavailable: [
    "The native file picker isn't available in this preview. Run the packaged desktop app to pick a real file.",
    "呢個預覽冇原生揀檔對話框。要用返個真正打包好嘅桌面 App 先揀到真檔案。",
  ],
  pickerLimitNotice: [
    "This dialog currently allows common document, image, and text/code file types up to 10 MB — the same allow-list the chat attachment picker uses. Audio, video, and larger archives are listed in the catalog below but can't be selected as a source file from this build yet.",
    "呢個對話框目前淨係俾揀常見文件、圖片同文字/程式碼檔（最大 10 MB）——同聊天附件揀檔用緊同一份名單。音頻、影片同大啲嘅壓縮檔喺下面目錄有得睇，但呢個 build 暫時揀唔到嚟做來源檔。",
  ],
  detecting: ["Detecting format…", "偵緊格式…"],
  detectedSource: ["Detected source format", "偵測到嘅來源格式"],
  detectionFailed: [
    "Could not determine the source format from the file's bytes.",
    "睇個檔案啲位元都睇唔出係咩格式。",
  ],
  categoryFormatCount: ["{n} formats", "{n} 種格式"],
  searchFormatsLabel: ["Search formats", "搵格式"],
  searchFormatsPlaceholder: ["Filter by name or extension…", "用名或副檔名篩選…"],
  noFormatsMatch: ["No formats match.", "冇符合嘅格式。"],
  currentFormat: ["Current format", "目前格式"],
  notAvailableOffline: ["Not available offline", "呢部機用唔到"],
  missingDependency: [
    "Needs {tool}, expected at {path}",
    "要有 {tool}，本應喺 {path}",
  ],
  convertTo: ["Convert to this format", "轉做呢個格式"],
  lossyTitle: ["This conversion changes the file", "呢個轉換會改到個檔案"],
  irreversibleNotice: ["This cannot be undone.", "呢步做咗就冚唔返轉頭。"],
  acknowledgeLossy: ["I understand, convert anyway", "明白喇，照轉"],
  startConversion: ["Convert", "轉檔"],
  jobQueueEmpty: [
    "No conversions yet. Pick a file and a target format above to queue one.",
    "未有轉換緊嘅嘢。喺上面揀個檔案同目標格式排隊啦。",
  ],
  stateQueued: ["Queued", "排緊隊"],
  stateRunning: ["Converting…", "轉緊…"],
  stateCompleted: ["Done", "搞掂"],
  stateFailed: ["Failed", "失敗"],
  stateCanceled: ["Canceled", "取消咗"],
  cancelJob: ["Cancel", "取消"],
  deleteJob: ["Remove from queue", "喺隊列移除"],
  retryJob: ["Retry", "再試一次"],
  outputSavedTo: ["Saved to", "存咗喺"],
  selectAll: ["Select all", "全選"],
  selectedCount: ["{n} selected", "揀咗 {n} 個"],
  bulkCancel: ["Cancel selected", "取消揀咗嘅"],
  bulkDelete: ["Remove selected", "移除揀咗嘅"],
  clearFinished: ["Clear finished", "清走搞掂咗嘅"],
  errorRetry: ["Try again", "再試一次"],
  queuedToast: ["queued for conversion.", "已經排咗隊轉檔。"],
  requeuedToast: ["requeued.", "已經再排過隊。"],
  bulkDeleteBody: ["Remove {n} job(s) from the queue?", "由隊列移除 {n} 個工作？"],
} as const)

declare module "../../uh/dict/registry" {
  interface DictRegistry {
    convert: (typeof convertDict)["dict"]
  }
}
