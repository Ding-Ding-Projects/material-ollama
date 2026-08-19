import { defineDict } from "@/uh/dict/defineDict"

/**
 * The Status screen's own strings. A separate "status" namespace (this
 * lane's allowed paths don't include the shared uh/dict/tools.dict.ts,
 * which already owns unrelated "statusTitle"/"statusSub" placeholder
 * keys from before this screen had real content) -- defineDict throws on
 * a duplicate namespace registration, so a fresh namespace is also the
 * mechanically correct choice, not just the tidy one.
 */
export const statusDict = defineDict("status", {
  pageTitle: ["Status", "狀態"],
  pageSubtitle: [
    "Release identity, the changelog, local version history, and the fully local support desk -- all real, all built from this binary and this database.",
    "發佈身份、更新日誌、本地版本歷史，仲有成套本地嘅支援台 —— 全部真嘢，全部由呢個 binary 同呢個資料庫直出。",
  ],
  loadErrorRelease: ["Could not load release information.", "載入唔到發佈資訊。"],
  loadErrorHistory: ["Could not load local version history.", "載入唔到本地版本歷史。"],
  retry: ["Retry", "再試一次"],
  loadingRelease: ["Loading release information…", "載入緊發佈資訊…"],
  loadingHistory: ["Loading local version history…", "載入緊本地版本歷史…"],

  // --- Release card ------------------------------------------------
  releaseHeading: ["Release", "發佈版本"],
  devBuildBadge: ["Development build", "開發版本"],
  devBuildTitle: ["Development build — no release code name", "開發版本 —— 冇發佈代號"],
  devBuildBody: [
    "This binary never went through the release workflow, so it never earned a dim-sum code name — borrowing one from a real release would be a lie about what's running.",
    "呢個 binary 未經過發佈流程，所以未有攞到點心代號 —— 借用真發佈嘅代號嚟講就係呃人話而家行緊咩。",
  ],
  versionLabel: ["Version", "版本"],
  commitLabel: ["Commit", "提交"],
  codeNameLabel: ["Release code name", "發佈代號"],
  workflowRunLabel: ["Workflow run", "工作流程"],
  builtAtLabel: ["Built at", "起版時間"],
  unsignedHeading: ["Unsigned by policy", "按政策唔簽署"],
  unsignedBody: [
    "Code signing is permanently out of scope for this project. Windows may show an unknown-publisher warning — that's expected, not a bug.",
    "呢個項目永久唔簽署代碼。Deen No 可能會彈「未知發行商」警告 —— 呢個係預咗嘅，唔係 bug。",
  ],
  unsignedEvidenceLabel: ["Enforced by", "由呢度執行"],
  assetManifestUnavailableHeading: ["Installer asset count", "安裝包檔案數"],
  assetManifestUnavailable: [
    "Not available offline — the asset manifest is only computed after packaging finishes, well after this binary was built.",
    "離線攞唔到 —— 個檔案清單要打包完先計得出，遠遠遲過呢個 binary 起好嗰陣。",
  ],

  // --- Automatic updates card ---------------------------------------
  autoUpdatesHeading: ["Automatic updates", "自動更新"],
  autoUpdatesBody: [
    "Chrome-style background checks, staged locally, never installed without your say-so. This switch writes straight to the same setting Settings uses.",
    "好似 Chrome 咁背景check，落地先擺好，未你話事之前唔會裝落去。呢粒掣同「設定」入面嗰個係同一個開關。",
  ],
  autoUpdatesToggleLabel: ["Check for updates automatically", "自動check有冇更新"],
  autoUpdatesUnsignedNote: [
    "Every downloaded update package is unsigned too, for the same reason the installer is — this project never signs anything.",
    "揸落嚟嘅更新包都係唔簽署嘅，同個安裝包一樣原因 —— 呢個項目乜都唔簽。",
  ],
  autoUpdatesLoadError: ["Could not load the update setting.", "載入唔到更新設定。"],
  autoUpdatesSaveError: ["Could not save the update setting.", "儲存唔到更新設定。"],
  autoUpdatesSavedToast: ["Automatic-update preference saved.", "自動更新偏好已經儲存。"],

  // --- Dim sum -------------------------------------------------------
  dimSumCatalogHeading: ["Release dim sum catalog", "發佈點心目錄"],
  dimSumCatalogBody: [
    "One code-name dish per release, snapshotted from the public catalog at build time so it works offline.",
    "每個發佈揸一碟做代號嘅點心，起版嗰陣就影低公開目錄，離線都睇得到。",
  ],
  dimSumCatalogEmpty: [
    "No catalog snapshot is embedded in this build — that's expected for a development build, which never ran the release workflow that fetches one.",
    "呢個版度冇夾埋目錄快照 —— 開發版本本身就係咁，冇跑過去攞目錄嘅發佈流程。",
  ],
  dimSumCatalogCount: ["{n} dishes in this build's snapshot", "呢個版嘅快照有 {n} 碟"],
  dimSumSurpriseHeading: ["Dim sum surprise", "點心驚喜"],
  dimSumSurpriseBody: [
    "A small treat from the release catalog. The dish name is always exact — the fun is only around it.",
    "出自發佈點心目錄嘅小驚喜，菜名永遠冇改。",
  ],

  // --- Changelog viewer ------------------------------------------------
  changelogHeading: ["Changelog", "更新日誌"],
  changelogBody: [
    "Real commits from this repository's own history — every entry links straight to it on GitHub. Never invented, never paraphrased.",
    "全部係呢個庫房嘅真實提交 —— 每一項都直接連去 GitHub 睇。從來冇作、冇改寫。",
  ],
  changelogSearchLabel: ["Search the changelog", "搜尋更新日誌"],
  changelogSearchPlaceholder: ["Search commit subjects…", "搵提交標題…"],
  changelogCount: ["{n} of {total} commits", "{total} 個提交入面 {n} 個"],
  changelogNoMatches: ["No commits match this search and date range.", "呢個搜尋同日期範圍搵唔到提交。"],
  changelogViewCommit: ["View on GitHub", "去 GitHub 睇"],

  // --- Shared date-range filter ---------------------------------------
  dateFilterLabel: ["Date range", "日期範圍"],
  dateFromLabel: ["From", "由"],
  dateToLabel: ["To", "到"],
  dateFilterClear: ["Clear", "清除"],
  dateFilterAll: ["All time", "全部時間"],
  dateFilterToday: ["Today", "今日"],
  dateFilterThisWeek: ["This week", "今個禮拜"],
  dateFilterInvalid: ["That date range is backwards — From must be on or before To.", "個日期範圍掉轉咗 —— 「由」要響「到」之前或者同日。"],

  // --- Local version history -------------------------------------------
  historyHeading: ["Local version history", "本地版本歷史"],
  historyBody: [
    "Every append-only checkpoint this app has recorded — real rows from the local database, never sample data.",
    "呢個 app 記低嘅每一個 append-only 記錄點 —— 本地資料庫嘅真實資料，唔係樣板數據。",
  ],
  historyEmpty: ["No local history recorded yet.", "仲未記錄過本地歷史。"],
  historyNoMatches: ["No events match this date range and action filter.", "呢個日期範圍同動作篩選搵唔到事件。"],
  historyActionFilterLabel: ["Filter by action", "按動作篩選"],
  historyActionAll: ["All actions", "所有動作"],
  historyAddNoteLabel: ["Record a checkpoint", "記低一個檢查點"],
  historyAddNotePlaceholder: ["What happened…", "發生咗咩事…"],
  historyAddNoteSubmit: ["Record", "記低"],
  historyAddNoteError: ["Could not record that checkpoint.", "記錄唔到呢個檢查點。"],
  historyCount: ["{n} of {total} events", "{total} 個事件入面 {n} 個"],
  exportButtonLabel: ["Export as JSON", "匯出做 JSON"],
  exportEncodingNote: [
    "UTF-8 JSON, matching the current filter. Secrets — API keys, TOTP seeds, passwords — are never included.",
    "UTF-8 嘅 JSON，跟返而家嘅篩選。密鑰、TOTP 種子、密碼呢啲敏感資料一律唔會夾入去。",
  ],
  exportedToast: ["Export downloaded.", "匯出檔案已經落咗嚟。"],

  // --- Support tickets --------------------------------------------------
  ticketsHeading: ["Support Tickets", "支援台"],
  ticketsDisclosure: [
    "This is a bit, not a service. Nothing here is sent anywhere. No ticket exists outside this machine. No network request is made. No data is collected. Nobody is reading this.",
    "呢度純粹整蠱，唔係真服務。呢度嘅嘢一樣都唔會send去邊。冇任何票存在呢部機以外嘅地方。冇任何網絡請求。冇收集任何資料。冇人喺度睇緊。",
  ],
  ticketsBody: [
    "Locked out? Confused? File a ticket. It plays the part properly — right up until the resolution, which is the one thing that actually works.",
    "俾鎖咗出去？唔知點算？開張飛啦。成套流程都做足戲 —— 直至去到解決方案，先係真正做到嘢嗰步。",
  ],
  ticketsCategoryLabel: ["Category", "類別"],
  ticketCategoryLockedOut: ["Locked out", "俾鎖咗出去"],
  ticketCategoryConfused: ["Something's wrong", "有啲嘢唔妥"],
  ticketCategoryQuestion: ["General question", "一般查詢"],
  ticketsDescriptionLabel: ["Describe the problem", "講吓個問題"],
  ticketsDescriptionPlaceholder: ["What's going on…", "發生緊咩事…"],
  ticketsSubmit: ["Submit ticket", "提交"],
  ticketsEmpty: ["No tickets filed yet. Lucky you.", "仲未開過飛。你好彩喎。"],
  ticketsCannedResponse: [
    "Thank you for contacting Support. Your ticket has been received and assigned our highest possible priority (this is the only priority we have).",
    "多謝聯絡支援台。你張飛已經收到，仲攞咗最高優先級（我哋淨係得呢個優先級）。",
  ],
  ticketsStatusOpen: ["Open", "處理緊"],
  ticketsStatusResolved: ["Resolved", "已解決"],
  ticketsResolveButton: ["Resolve", "解決"],
  ticketsResolvedTitle: ["Resolution", "解決方案"],
  ticketsResolvedBody: [
    "Delete this app's local data folder yourself, in your own file manager. That's the fix — for real, every time.",
    "自己用返你部機嘅檔案總管，刪咗呢個 app 嘅本地資料夾。呢個先係真正嘅解決方法 —— 每次都係。",
  ],
  ticketsFolderPathLabel: ["Local data folder", "本地資料夾"],
  ticketsCopyPathButton: ["Copy folder path", "複製資料夾路徑"],
  ticketsCopiedToast: ["Path copied. Paste it into File Explorer's address bar to open it.", "路徑已複製。貼落檔案總管嘅網址列就開到。"],
  ticketsCopyFailed: ["Couldn't reach the clipboard — the path is written out above, so you can select and copy it by hand.", "攞唔到剪貼簿 —— 路徑已經寫喺上面，可以自己揀住複製。"],
  ticketsClearAll: ["Clear all tickets", "清晒所有飛"],
  ticketsClearTitle: ["Clear every ticket?", "清晒所有飛？"],
  ticketsClearBody: [
    "This deletes every locally stored ticket on this device. It cannot be undone — because, as above, there was never a server copy to restore from.",
    "呢個動作會刪晒呢部機度儲存嘅所有飛，冇得返轉頭 —— 因為好似上面講，本身都冇伺服器留底俾你翻叫。",
  ],
} as const)

declare module "@/uh/dict/registry" {
  interface DictRegistry {
    status: (typeof statusDict)["dict"]
  }
}
