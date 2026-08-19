import { defineDict } from "@/uh"

/**
 * The "devtools" namespace: every string this screen's own panels render.
 * Kept local to this lane (outside src/uh/**) using the same
 * defineDict()/DictRegistry-augmentation pattern src/components/shell/
 * shell.dict.ts already established — see that file's own comment for why
 * this is the sanctioned way to add a namespace from outside src/uh/**.
 * Registration happens the moment any module imports this file, which every
 * component in this directory does.
 */
export const devtoolsDict = defineDict("devtools", {
  title: ["Developer Tools", "開發者工具"],
  subtitle: [
    "Every CLI command and configuration value, straight from the live Cobra command tree — nothing hand-typed, nothing out of date.",
    "所有 CLI 指令同設定值，直接由實時嘅 Cobra 指令樹度攞返嚟——冇手打，唔會過時。",
  ],
  commandsCount: ["commands", "個指令"],
  hiddenCount: ["hidden", "隱藏咗"],
  optionsCount: ["configuration options", "個設定"],
  loading: [
    "Loading the live command and configuration inventory…",
    "載緊實時指令同設定清單…",
  ],
  errorLoading: [
    "Couldn't load the CLI and configuration inventory.",
    "攞唔到 CLI 同設定清單，衰咗。",
  ],
  retry: ["Retry", "再試一次"],

  parityHeading: ["CLI ↔ GUI parity", "CLI ↔ GUI 對照表"],
  parityIntro: [
    "Every command the CLI understands, including the ones with no menu of their own yet. Hidden commands carry a distinct badge — they're included on purpose, not a leak.",
    "CLI 識嘅每個指令都喺呢度，包括仲未有自己選單嗰啲。隱藏指令有個特別牌仔——擺出嚟係特登嘅，唔係漏咗嘢出嚟。",
  ],
  searchCommandsLabel: ["Search commands", "搵指令"],
  searchCommandsPlaceholder: [
    "Filter by name, use, alias, or description…",
    "用名、用法、別名或者描述篩選…",
  ],
  noCommandsMatch: ["No commands match.", "冇符合嘅指令。"],
  invalidPattern: [
    "That pattern doesn't compile — showing nothing until it does.",
    "個 pattern 砌唔到，改好先至有嘢睇。",
  ],
  hiddenBadge: ["Hidden", "隱藏"],
  aliasesLabel: ["Aliases", "別名"],
  flagsLabel: ["Flags", "旗標"],
  noFlags: ["No flags.", "冇旗標。"],
  noDescription: ["No description provided.", "冇描述。"],
  persistentFlag: ["persistent", "全域"],
  guiRouteLabel: ["GUI route", "GUI 路徑"],
  routeNotWired: [
    "Intended route — no screen renders it yet.",
    "預計嘅路徑——仲未有畫面駁住佢。",
  ],
  openRoute: ["Open", "開"],

  configHeading: ["Effective configuration", "實際生效嘅設定"],
  configIntro: [
    "Where every value actually came from — the environment, this app's own config, both, or Ollama's default. This list is read-only; use a profile below to change one.",
    "每個值其實由邊度嚟——環境變數、呢個 app 自己嘅設定、兩樣都有，定係 Ollama 嘅預設值。呢張清單淨係睇，要改就用返下面嘅設定檔。",
  ],
  searchConfigLabel: ["Search configuration", "搵設定"],
  searchConfigPlaceholder: [
    "Filter by name or description…",
    "用名或者描述篩選…",
  ],
  noConfigMatch: ["No configuration options match.", "冇符合嘅設定。"],
  sourceDefault: ["default", "預設值"],
  sourceEnvironment: ["environment", "環境變數"],
  sourceConfig: ["config", "設定檔"],
  sourceBoth: ["environment + config", "環境變數＋設定檔"],
  effectiveValueLabel: ["Effective value", "實際值"],
  emptyValue: ["(empty)", "（空嘅）"],
  restartBadge: ["Restart required", "要重啟"],

  profilesHeading: ["Configuration profiles", "設定檔"],
  profilesIntro: [
    "A profile is a named set of environment overrides applied to the service this app manages. Applying one restarts that service — right now, on this machine.",
    "設定檔即係一組有名嘅環境變數覆寫，套用喺呢個 app 管理嘅服務度。一撳套用，個服務即刻喺呢部機度重啟。",
  ],
  profileListLabel: ["Profiles", "設定檔清單"],
  newProfileOption: ["New profile…", "新設定檔…"],
  activeSuffix: ["Active", "使緊"],
  noProfileSelected: [
    "Building a new profile. Pick one above to edit it instead.",
    "而家起緊新嘅。想改返舊嘅就喺上面揀返佢。",
  ],
  profileNameLabel: ["Name", "名"],
  profileNamePlaceholder: ["Local GPU profile", "本機 GPU 設定檔"],
  profileDescLabel: ["Description", "描述"],
  profileDescPlaceholder: ["When should this be used?", "幾時會用呢個？"],
  overridesHeading: ["Overrides", "覆寫值"],
  overridesIntro: [
    "Toggle a key on to override it in this profile. Keys left off inherit whatever the service already has.",
    "撳開個掣就即係覆寫嗰個 key。冇撳嘅就跟返個服務本身有嘅值。",
  ],
  overrideToggle: ["Override", "覆寫"],
  overrideValueLabel: ["Override value", "覆寫值"],
  booleanHelper: ["true or false", "true 定 false"],
  listHelper: ["Comma-separated values", "用逗號分開嘅值"],
  saveProfile: ["Save profile", "儲存設定檔"],
  createProfile: ["Create profile", "新增設定檔"],
  applyProfile: ["Apply & restart", "套用同重啟"],
  deleteProfile: ["Delete profile", "刪除設定檔"],
  applyNotice: [
    "Applying restarts the managed Ollama service on this machine.",
    "套用會即刻喺呢部機度重啟 Ollama 服務。",
  ],
  applyDialogTitle: ["Apply this profile?", "套用呢個設定檔？"],
  applyDialogBody: [
    "This restarts the managed Ollama service right now, on this machine. Anything mid-request gets interrupted.",
    "呢個動作會即刻喺呢部機度重啟 Ollama 服務。行緊嘅嘢會被打斷。",
  ],
  applyConfirmLabel: ["Apply & restart", "套用同重啟"],
  applyCancel: ["Cancel", "算數"],
  deleteDialogTitle: ["Delete this profile?", "刪除呢個設定檔？"],
  deleteDialogBody: [
    "This deletes the profile permanently and restores the service to its baseline configuration. This can't be undone.",
    "呢個動作會永久刪走個設定檔，個服務會返去底線設定。刪咗就冇得返轉頭㗎喇。",
  ],
  deleteConfirmLabel: ["Delete", "刪除"],
  statusSaved: ["Profile saved.", "設定檔已經儲存。"],
  statusApplied: [
    "Profile applied — the service restart was requested.",
    "設定檔已經套用——已經叫咗個服務重啟。",
  ],
  statusDeleted: [
    "Profile deleted — the service was restored to its baseline.",
    "設定檔已經刪除——服務已經還原返底線設定。",
  ],
} as const)

declare module "../../uh/dict/registry" {
  interface DictRegistry {
    devtools: (typeof devtoolsDict)["dict"]
  }
}
