import { defineDict } from "./defineDict"

/**
 * Shared/general strings: chat shell, notifications, tabs, palette, dim sum,
 * school mode unlock. Seeded from the design prototype's `DICT` object.
 */
export const appDict = defineDict("app", {
  palette: ["Search", "搵嘢"],
  notifications: ["Notifications", "通知"],
  clearAll: ["Clear all", "全部清走"],
  noNotifs: ["Nothing here yet. Quiet llama.", "乜都冇，靜英英。"],
  newChat: ["New chat", "開新傾偈"],
  searchChats: ["Search chats", "搵傾偈"],
  hero: ["How can I help?", "有咩幫到你？"],
  heroSub: [
    "Runs locally. Your data stays on this machine.",
    "本地運行，資料唔會離開部機。",
  ],
  sendMsg: ["Send a message", "打句嘢啦"],
  send: ["Send", "發送"],
  think: ["Think", "諗深啲"],
  webSearch: ["Web search", "上網搵"],
  localNote: [
    "Local models via Ollama — nothing leaves this device unless cloud is on.",
    "本地模型行 Ollama —— 唔開雲端，資料唔出街。",
  ],
  cancel: ["Cancel", "算數"],
  save: ["Save", "儲存"],
  unlock: ["Unlock", "解鎖"],
  delete: ["Delete", "刪除"],
  yum: ["Yum!", "好味！"],
  paletteHint: ["Type a command, setting, or screen…", "打指令、設定或者版面…"],
  dimsumSurprise: ["Dim sum surprise", "點心驚喜"],
  dishNote: [
    "A small treat from the release catalog. The dish name is always exact — the fun is only around it.",
    "出自發佈點心目錄嘅小驚喜，菜名永遠冇改。",
  ],
  schoolUnlockBody: [
    "Enter the PIN to turn this mode off. This is a self-imposed speed bump, not a security boundary.",
    "Enter the PIN to turn this mode off. This is a self-imposed speed bump, not a security boundary.",
  ],
  schoolReset: [
    "Forgot it? Clearing this app’s local data resets the lock — by design.",
    "Forgot it? Clearing this app’s local data resets the lock — by design.",
  ],
  wrongPin: ["That PIN didn’t match.", "個 PIN 唔啱喎。"],
  today: ["Today", "今日"],
  thisWeek: ["This week", "今個禮拜"],
  older: ["Older", "舊啲嘅"],
  chat: ["Chat", "傾偈"],
  launchNav: ["Launch", "出發"],
  models: ["Models", "模型舖"],
  codex: ["Codex CLI", "Codex 台"],
  devtools: ["Developer", "開發者"],
  toolbox: ["Toolbox", "百寶箱"],
  docs: ["Docs", "說明書"],
  status: ["Status", "狀態"],
  settings: ["Settings", "設定"],
  rename: ["Rename", "改名"],
  pin: ["Pin tab", "釘住"],
  unpin: ["Unpin tab", "解釘"],
  closeTab: ["Close tab", "閂呢個 tab"],
  closeOthers: ["Close other tabs", "閂晒其他 tab"],
  closeRight: ["Close tabs to the right", "閂右邊嗰啲"],
  group: ["Add to group", "加入組別"],
  ungroup: ["Remove from group", "退出組別"],
  closeAllTabs: ["Close all", "閂晒"],
  clearChats: ["Clear all chats", "清晒所有傾偈"],
  launchTitle: ["Launch a coding agent", "開個寫程式代理"],
  launchSub: [
    "Run agent harnesses against your local Ollama models.",
    "用本地 Ollama 模型行各個 agent。",
  ],
  launch: ["Launch", "開行"],
} as const)

declare module "./registry" {
  interface DictRegistry {
    app: (typeof appDict)["dict"]
  }
}
