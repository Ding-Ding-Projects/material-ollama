import { defineDict } from "@/uh"

/**
 * Strings for the shared exporter (ExportDialog/ExportPreview/the
 * VS-Code-handoff half of the external-editor contract). Registered from
 * outside src/uh/** (this lane's boundary), same pattern as
 * components/shell/shell.dict.ts.
 */
export const exportsDict = defineDict("exports", {
  title: ["Export", "匯出"],
  subtitle: [
    "Pick a format, see what it can and can't carry, then save.",
    "揀個格式，睇下佢裝唔裝到晒啲料，之後至儲存。",
  ],
  formatLabel: ["Format", "格式"],
  previewLabel: ["Preview", "預覽"],
  htmlPreviewFrameTitle: ["HTML export preview", "HTML 匯出預覽"],
  viewRendered: ["View rendered", "睇返個樣"],
  viewRawSource: ["View raw source", "睇返原始碼"],
  schemaLabel: ["Schema", "格式結構"],
  encodingLabel: ["Encoding", "編碼"],
  rowsLabel: ["Rows", "有幾多行"],
  emptyList: [
    "There is nothing to export yet — the list is empty.",
    "而家仲未有嘢好匯出 —— 個清單係空嘅。",
  ],
  caveatsHeading: ["Before you export", "匯出之前，睇多眼"],
  noCaveats: [
    "This format keeps everything exactly as shown — nothing is flattened or approximated.",
    "呢個格式會原汁原味咁裝晒啲料 —— 冇壓縮，冇夾硬嚟。",
  ],
  save: ["Save file", "儲存檔案"],
  saved: ["Saved", "已經儲存好"],
  openInEditor: ["Open in VS Code", "用 VS Code 開"],
  editorBridgeUnavailable: [
    "VS Code hand-off isn't wired up in this build yet.",
    "呢個版本重未駁好用 VS Code 開嘅功能。",
  ],
  editorNotInstalled: [
    "VS Code wasn't found on this machine.",
    "呢部機搵唔到 VS Code。",
  ],
  editorLaunchFailed: ["Couldn't launch VS Code.", "開唔到 VS Code。"],
  copyPath: ["Copy path", "複製路徑"],
  pathCopied: ["Path copied", "路徑已複製"],
  pathCopyFailed: [
    "Couldn't copy automatically — select and copy the path yourself.",
    "自動複製唔到 —— 自己揀返段路徑複製啦。",
  ],
} as const)

declare module "@/uh/dict/registry" {
  interface DictRegistry {
    exports: (typeof exportsDict)["dict"]
  }
}
