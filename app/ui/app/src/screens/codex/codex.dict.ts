import { defineDict } from "@/uh"

/**
 * The "codex" namespace: every string the Codex CLI harness screen renders.
 * Same defineDict()/DictRegistry pattern as screens/devtools/devtools.dict.ts;
 * registration happens the moment any module in this directory imports it.
 */
export const codexDict = defineDict("codex", {
  title: ["Codex CLI harness", "Codex CLI 工具台"],
  subtitle: [
    "An allowlisted local run of the Codex CLI: guided profiles, preflight, streamed output, cancellation, and a bounded redacted history.",
    "喺本機安全咁行 Codex CLI：有嚮導設定檔、行之前先檢查、輸出即時串流、可以中途取消，仲會保留一段刪走敏感資料嘅紀錄。",
  ],

  modeQuickFix: ["Quick fix", "快速修復"],
  modeFullRun: ["Full run", "完整執行"],
  modeDryRun: ["Dry run", "試行"],
  modeLegend: ["Run mode", "執行模式"],

  workingDirectory: ["Working directory", "工作目錄"],
  workingDirectoryPlaceholder: ["Current directory", "目前目錄"],
  prompt: ["Prompt", "提示"],
  promptPlaceholder: ["Optional prompt appended to argv", "可選，會接喺 argv 後面"],

  commandPreview: ["Command preview", "指令預覽"],
  commandPreviewPending: [
    "The exact command is resolved by preflight before anything runs.",
    "真正嘅指令要行 preflight 之後先確定，未確定前唔會執行。",
  ],

  checkBinaryFound: ["codex binary found", "搵到 codex 執行檔"],
  checkBinaryMissing: ["codex binary not found", "搵唔到 codex 執行檔"],
  checkSandbox: ["sandbox available", "沙箱可用"],
  checkSandboxUnknown: ["sandbox state unknown until preflight", "行 preflight 之前唔知沙箱狀態"],
  checkDirectory: ["using current directory", "用緊目前目錄"],
  checkRollback: ["rollback checkpoint ready", "回滾點準備好"],
  checkRollbackOff: ["rollback checkpoint disabled", "回滾點已關"],

  run: ["Run", "執行"],
  running: ["Running…", "執行緊…"],
  cancel: ["Cancel", "取消"],
  openEditor: ["Open in external editor", "喺外部編輯器打開"],
  rollbackOnFailure: ["Restore the app profile if the launch fails", "launch 失敗就還原返 app 設定檔"],

  historyTitle: ["Run history", "執行紀錄"],
  historyNote: [
    "Bounded to the last 12 runs. Secrets and env values are redacted before storage.",
    "只保留最近 12 次。密碼同環境變數存之前已經遮走。",
  ],
  historyEmpty: ["No runs yet.", "仲未行過。"],

  discoveryFailed: ["Could not check for the Codex CLI", "查唔到 Codex CLI"],
  runFailed: ["The run could not be started", "開唔到嗰次執行"],
} as const)

declare module "../../uh/dict/registry" {
  interface DictRegistry {
    codex: (typeof codexDict)["dict"]
  }
}
