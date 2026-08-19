import { defineDict } from "./defineDict"

/**
 * Toolbox, docs, status/records, and support-ticket strings. Seeded from the
 * design prototype's `TOOLS_DICT` object.
 */
export const toolsDict = defineDict("tools", {
  toolboxTitle: ["Toolbox", "百寶箱"],
  toolboxSub: [
    "Local utilities. Nothing here touches the network.",
    "本地工具，全部唔上網。",
  ],
  regexLab: ["Regex lab", "Regex 實驗室"],
  openBuilder: ["Open full builder", "開完整 builder"],
  converter: ["File converter", "檔案轉換器"],
  converterDesc: [
    "Queue conversions between document and image formats. Runs with bounded concurrency and survives restarts.",
    "排隊轉檔，慢慢嚟。",
  ],
  converterHonest: [
    "Conversions run entirely on this machine. Lossy steps are disclosed per file before they run.",
    "全部本機轉，唔會上載。",
  ],
  queue: ["Queue", "排隊"],
  authenticator: ["Built-in authenticator", "內置驗證器"],
  acctName: ["Account name", "帳戶名"],
  acctSecret: ["Base32 secret", "Base32 秘密"],
  pair: ["Pair", "配對"],
  totpHonest: [
    "Real RFC 6238 codes, computed locally. Ordinary exports omit secrets; the secrets path sits behind the super-confirmation gate.",
    "真 TOTP，本機計。匯出唔會包秘密。",
  ],
  docsTitle: ["Documentation", "說明書"],
  searchDocs: ["Search features", "搵功能"],
  docsOffline: [
    "This documentation is bundled with the app and readable fully offline. Every feature row in the shared contract has an article here.",
    "說明書內置，離線都睇到。",
  ],
  statusTitle: ["Status & records", "狀態同紀錄"],
  statusSub: [
    "Release facts, change history, and your local activity — all verifiable, all local.",
    "發佈資料、變更紀錄、本地活動。",
  ],
  release: ["Current release", "目前版本"],
  checkUpdates: ["Check for updates", "睇吓有冇更新"],
  dishCatalog: ["Dim sum release catalog", "點心發佈目錄"],
  changelog: ["Changelog", "更新日誌"],
  versionHistory: ["Local version history", "本地版本歷史"],
  exportHist: ["Export", "匯出"],
  noHistory: [
    "No recorded changes yet. Change any setting to see it here.",
    "未有紀錄。",
  ],
  tickets: ["Support tickets", "支援工單"],
  ticketHonest: [
    "Nothing is sent anywhere. No ticket exists outside this machine, no network request is made, and nobody is reading it. Tickets live in local storage with everything else.",
    "Nothing is sent anywhere. 工單淨係存喺本機。",
  ],
  ticketPlaceholder: ["Describe the issue…", "講吓咩事…"],
  fileTicket: ["File ticket", "開工單"],
} as const)

declare module "./registry" {
  interface DictRegistry {
    tools: (typeof toolsDict)["dict"]
  }
}
