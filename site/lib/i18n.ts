// Local-only presentation helpers. Nothing here calls a network; every string is bundled with the
// site source. `present()` chooses between English, playful Hong Kong-style Cantonese, or a
// bilingual join of both, and forces English whenever focus mode ("school mode") is active.
// `t()` reads a key out of the shared DICTIONARY. `tone()` reads a key out of TONE_COPY, which
// varies by the two independent 1-5 funny-level sliders while keeping every underlying fact
// identical between levels — only the voice around the fact changes.

export type LanguageMode = 'english' | 'cantonese' | 'bilingual'

export type LangCtx = {
  languageMode: LanguageMode
  schoolMode: boolean
}

export type ToneCtx = LangCtx & {
  funnyEnglish: number
  funnyCantonese: number
}

export function present(mode: LanguageMode, english: string, cantonese: string, school = false): string {
  if (school || mode === 'english') return english
  if (mode === 'cantonese') return cantonese
  return `${english} · ${cantonese}`
}

function fill(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text
  let out = text
  for (const [key, value] of Object.entries(vars)) out = out.split(`{${key}}`).join(String(value))
  return out
}

// A short, technical-register generic sentence reused by every canonical-only feature record that
// has no bespoke curated copy yet. Translated once, applied everywhere it is needed, so no feature
// silently stays English-only in Cantonese or bilingual mode.
export const GENERIC_FEATURE_SUMMARY = {
  en: 'This landing page carries a local equivalent record for the canonical user-facing requirement and keeps its evidence state explicit.',
  zh: '呢個landing page都有一份呢項規範要求嘅本地紀錄，evidence狀態寫得清清楚楚，唔會扮已經做完。',
}

export const CATEGORY_LABELS: Record<string, string> = {
  Communication: '溝通',
  Accessibility: '無障礙',
  Privacy: '私隱',
  Customization: '自訂',
  Delight: '小驚喜',
  Operations: '運作',
  Appearance: '外觀',
  Navigation: '導航',
  Search: '搜尋',
  Recovery: '復原',
  Security: '安全',
  Tools: '工具',
  Ollama: 'Ollama',
  Data: '資料',
  Documentation: '文件',
  Publishing: '發佈',
  Contract: '規範',
}

export function categoryLabel(ctx: LangCtx, category: string): string {
  const zh = CATEGORY_LABELS[category] || category
  return present(ctx.languageMode, category, zh, ctx.schoolMode)
}

const DICTIONARY = {
  brandBadge: { en: 'Landing · docs · status', zh: 'Landing · 文件 · 狀態' },
  statusReleaseVerified: { en: 'Release verified', zh: '已核實版本' },
  paletteHint: { en: 'command palette', zh: '指令面板' },
  notificationsBell: { en: 'Notification history', zh: '通知紀錄' },
  notificationsBellEmpty: { en: 'No notifications yet', zh: '暫時未有通知' },
  notificationsPanelTitle: { en: 'Notification centre', zh: '通知中心' },
  notificationsPanelEmpty: { en: 'Nothing has happened in this browser session yet.', zh: '呢個瀏覽器session暫時未發生過任何事。' },
  notificationsPanelClear: { en: 'Clear history', zh: '清除紀錄' },
  notificationsPanelClose: { en: 'Close notification centre', zh: '關閉通知中心' },
  notificationsPanelFootnote: { en: 'Dismissing a toast never deletes it from this history.', zh: '拉走浮動通知唔會刪走呢度嘅紀錄。' },

  navIntroEyebrow: { en: 'Local-first landing', zh: '本地優先嘅Landing Page' },
  navIntroBody: { en: 'A clear starting point for the installed desktop application, its command parity, and its evidence.', zh: '呢度係桌面應用程式、佢嘅command對應同埋佐證嘅清晰起點。' },
  searchThisSite: { en: 'Search this site', zh: '搜尋呢個網站' },
  searchPlaceholder: { en: 'Search features and articles', zh: '搜尋功能同文章' },
  searchPlainDefault: { en: 'Plain-text search is active by default.', zh: '預設用純文字搜尋。' },
  navFootnote: { en: 'Models run in the installed desktop application, not in this page.', zh: '模型喺已安裝嘅桌面應用程式度運行，唔係喺呢一頁。' },

  regexBuilderSummary: { en: '.* Regex builder', zh: '.* Regex 建立器' },
  regexBuilderIntro: { en: 'Plain text is the default. Build a local expression with a real pattern, flags, and sample text.', zh: '預設用純文字。你可以喺度用真正嘅pattern、flags同範例文字整一條本地expression。' },
  regexPatternLabel: { en: 'Pattern', zh: 'Pattern（樣式）' },
  regexFlagsLabel: { en: 'Flags', zh: 'Flags（旗標）' },
  regexSampleLabel: { en: 'Sample text', zh: '範例文字' },
  regexUseButton: { en: 'Use pattern', zh: '套用pattern' },
  regexEmptyPrompt: { en: 'Enter a pattern to preview it.', zh: '打一條pattern先可以睇預覽。' },
  regexNoMatches: { en: 'Preview has no matches.', zh: '預覽冇任何相符結果。' },
  regexErrorPrefix: { en: 'Pattern error:', zh: 'Pattern有問題：' },
  regexModeActive: { en: 'Regex mode is active for this field.', zh: '呢個欄位而家用緊regex模式。' },
  plainModeActive: { en: 'Plain-text mode is active.', zh: '而家用緊純文字模式。' },
  filterLocally: { en: 'Filter locally', zh: '本地過濾' },
  scopedSearchPlaceholder: { en: 'Type to search this scope', zh: '打字搜尋呢個範圍' },
  noLocalMatches: { en: 'No local matches yet.', zh: '暫時搵唔到相符結果。' },
  jumpTo: { en: 'Jump to', zh: '跳去' },

  currentTabStripSearch: { en: 'Current tab strip search', zh: '目前分頁列搜尋' },
  tabGroupSearch: { en: 'Tab group search (by feature category)', zh: '分頁群組搜尋（按功能分類）' },
  tabGroupNamesSearch: { en: 'Tab group names search', zh: '分頁群組名稱搜尋' },
  masterTabSearch: { en: 'Master open-tab search (pages, features, articles)', zh: '總分頁搜尋（頁面、功能、文章）' },

  openFeatureRecord: { en: 'Open feature record', zh: '打開功能紀錄' },
  closeFeatureRecord: { en: 'Close feature record', zh: '關閉功能紀錄' },
  siteEquivalent: { en: 'Site equivalent', zh: '網站對應版' },
  siteSurfaceLabel: { en: 'Site surface', zh: '網站介面' },
  stateLabel: { en: 'State', zh: '狀態' },
  stateValue: { en: 'Documented local equivalent; runtime behavior belongs to the installed desktop application.', zh: '已記錄嘅本地對應版；真正運行行為屬於已安裝嘅桌面應用程式。' },
  privacyLabel: { en: 'Privacy', zh: '私隱' },
  privacyValue: { en: 'Bundled assets and browser-local state only. No analytics or third-party assets.', zh: '淨係用打包好嘅資源同瀏覽器本地狀態，冇任何分析或者第三方資源。' },

  overviewEyebrow: { en: 'Material Ollama · landing page', zh: 'Material Ollama · Landing Page' },
  overviewTitle: { en: 'Local models, clearly explained.', zh: '本地模型，講到明明白白。' },
  boundaryTitle: { en: 'Important boundary', zh: '重要界線' },
  viewReleaseEvidence: { en: 'View release evidence', zh: '睇版本佐證' },
  readDocumentation: { en: 'Read documentation', zh: '睇文件' },
  stateStaysHere: { en: 'State stays in this browser', zh: '狀態淨係留喺呢個瀏覽器' },
  surfaceMapEyebrow: { en: 'Surface map', zh: '介面地圖' },
  surfaceMapTitle: { en: 'One honest place to start.', zh: '一個老實嘅起點。' },
  surfaceMapBody: { en: 'The landing page names the boundary, documents the product, and offers the verified Windows installer with its release evidence.', zh: '呢頁清楚講明界線、記錄產品，仲提供已核實嘅Windows安裝程式同版本佐證。' },
  verifiedReleaseHeading: { en: 'Verified release:', zh: '已核實版本：' },
  viewReleaseNotes: { en: 'View {tag} release notes', zh: '睇{tag}版本說明' },
  downloadInstaller: { en: 'Download the Windows installer', zh: '下載Windows安裝程式' },
  unsignedWarning: { en: 'The installer is unsigned and may trigger an unknown-publisher or SmartScreen warning.', zh: '呢個安裝程式未經簽署，可能會觸發「未知發行者」或者SmartScreen警告。' },
  viewDishPhoto: { en: 'View the authoritative public dish photo', zh: '睇官方公開嘅點心相' },
  visitorStateHeading: { en: 'Visitor state', zh: '訪客狀態' },

  featuresEyebrow: { en: 'Complete feature map', zh: '完整功能地圖' },
  featuresTitle: { en: 'Every required surface has a record here.', zh: '每一個必要嘅介面喺呢度都有紀錄。' },
  featuresBody: { en: "This registry is hand-written so a feature disappearing from the landing page is visible. Cards describe the site's own local equivalent and point to the installed application's authoritative behavior.", zh: '呢份登記係手寫嘅，所以邊個功能喺landing page度唔見咗都會即刻睇得出。卡片講嘅係呢個網站自己嘅本地對應版，實際行為以已安裝嘅應用程式為準。' },
  filterFeatureRecords: { en: 'Filter feature records', zh: '過濾功能紀錄' },
  filterFeaturePlaceholder: { en: 'Try chat, settings, accessibility', zh: '試吓打chat、settings、accessibility' },
  matchesOfTotal: { en: '{matches} of {total} canonical records', zh: '{total}項規範紀錄入面有{matches}項相符' },
  schoolModeActiveHeading: { en: '{name} is active', zh: '{name}已經開啟' },
  schoolModeActiveBody: { en: 'English-only focus presentation is active. Optional playful and Cantonese capabilities remain stored but are not rendered in this mode.', zh: '而家用緊淨英文嘅專注模式。淨係揀用嘅趣怪同廣東話功能仲係儲住，不過呢個模式唔會顯示出嚟。' },
  noFeatureMatches: { en: 'No feature record matches this filter yet.', zh: '暫時冇功能紀錄同呢個過濾條件相符。' },

  docsEyebrow: { en: 'Documentation', zh: '文件' },
  docsTitle: { en: 'Short articles, useful boundaries.', zh: '短小文章，實用嘅界線。' },
  docsBody: { en: 'Articles are bundled with the site source, render locally, and link every released claim to a real commit.', zh: '文章同網站source一齊打包、本地渲染，每個發佈過嘅講法都連返去一個真實commit。' },
  readArticle: { en: 'Read article', zh: '閱讀文章' },
  closeArticle: { en: 'Close article', zh: '關閉文章' },
  articleCommitLinked: { en: 'Commit linked', zh: '已連結Commit' },
  articleBoilerplate: { en: 'The site is a landing and documentation surface. It preserves the desktop boundary, keeps local state private to this browser, and reports unknown release or service state as unknown rather than inventing a success.', zh: '呢個網站係landing同文件介面。佢保持同桌面應用程式嘅界線、將本地狀態留喺呢個瀏覽器度私隱處理，而且未知嘅版本或者服務狀態就講未知，唔會作大話講成功。' },
  openSourceCommit: { en: 'Open source commit', zh: '打開source commit' },
  suggestedArticles: { en: 'Suggested articles:', zh: '推薦文章：' },

  statusEyebrow: { en: 'Status and evidence', zh: '狀態同佐證' },
  statusTitle: { en: 'What is verified, what remains pending.', zh: '邊啲已經核實，邊啲仲未搞掂。' },
  statusBody: { en: 'The landing page does not connect to an Ollama service. It reports the independently verified Windows release and keeps the owner-only site boundary explicit.', zh: '呢頁landing page唔會連接Ollama服務，佢淨係報告獨立核實過嘅Windows版本，仲清楚講明呢個網站係owner-only嘅界線。' },
  statusReleaseLabel: { en: 'Release', zh: '版本' },
  statusInstallerLabel: { en: 'Installer', zh: '安裝程式' },
  statusInstallerValue: { en: 'Download verified', zh: '下載已核實' },
  statusLandingAccessLabel: { en: 'Landing access', zh: 'Landing存取' },
  statusLandingAccessValue: { en: 'Owner-only', zh: '只限Owner' },
  statusHeartbeatLabel: { en: 'Heartbeat', zh: '心跳' },
  statusHeartbeatBody: { en: 'Rendered locally when this page is open.', zh: '呢一頁開住嘅時候本地渲染出嚟。' },
  viewReleaseNotesPlain: { en: 'View release notes', zh: '睇版本說明' },
  openVerifiedLandingUrl: { en: 'Open the verified landing URL', zh: '打開已核實嘅landing網址' },
  anonymousAccessBounded: { en: 'anonymous access is intentionally bounded.', zh: '匿名存取係刻意受限嘅。' },
  duplicatePhotoNote: { en: 'The authoritative public image is', zh: '官方公開圖片係' },
  noDuplicateImage: { en: '; no duplicate image is copied into this project.', zh: '；本專案冇再複製多一張圖。' },
  downloadWindowsInstaller: { en: 'Download Windows installer', zh: '下載Windows安裝程式' },
  evidenceItemHeader: { en: 'Evidence item', zh: '佐證項目' },
  evidenceStateHeader: { en: 'State', zh: '狀態' },
  evidenceMeaningHeader: { en: 'Meaning', zh: '意思' },
  createLocalStatusNotice: { en: 'Create local status notice', zh: '建立本地狀態通知' },
  noticeCountSuffix: { en: 'in the local history.', zh: '喺本地紀錄入面。' },
  noticeSingular: { en: 'notice', zh: '則通知' },
  noticePlural: { en: 'notices', zh: '則通知' },

  settingsEyebrow: { en: 'Per-visitor settings', zh: '訪客個人設定' },
  settingsTitle: { en: 'Make the site readable to you.', zh: '將呢個網站調到啱你睇。' },
  settingsBody: { en: 'Every value below is local browser state. Settings are not account data, are not synchronized, and do not configure an external Ollama service.', zh: '以下每一個數值都係本地瀏覽器狀態。設定唔係帳戶資料，唔會同步，亦都唔會設定外部嘅Ollama服務。' },
  savedLocally: { en: 'Saved locally in this browser.', zh: '已喺呢個瀏覽器本地儲存。' },
  changesStoredLocally: { en: 'Changes are stored only in this browser.', zh: '改動淨係儲喺呢個瀏覽器。' },
  languageTag: { en: 'Language', zh: '語言' },
  persistedTag: { en: 'Persisted', zh: '已儲存' },
  presentationHeading: { en: 'Presentation', zh: '呈現方式' },
  languageModeLabel: { en: 'Language mode', zh: '語言模式' },
  languageModeEnglish: { en: 'English', zh: 'English（英文）' },
  languageModeCantonese: { en: 'Playful Hong Kong-style Cantonese', zh: '輕鬆嘅香港式廣東話' },
  languageModeBilingual: { en: 'Bilingual', zh: '雙語' },
  englishToneLabel: { en: 'English tone', zh: '英文語氣' },
  cantoneseToneLabel: { en: 'Cantonese tone', zh: '廣東話語氣' },
  showEmojiLabel: { en: 'Show emojis in dialogs and messages', zh: '喺對話框同訊息度顯示emoji' },
  presentationExplain: { en: 'These four controls change how every message on this site reads. They never change what actually happened — a download size, a hash, or a version number stays exact at every tone level.', zh: '呢四個控制項會改變呢個網站每一則訊息嘅語氣。但佢哋永遠唔會改變實際發生咗乜嘢——下載大細、hash值定係版本號碼，喺任何語氣level都保持一模一樣。' },

  focusAccessTag: { en: 'Focus and access', zh: '專注同存取' },
  localOnlyTag: { en: 'Local only', zh: '純本地' },
  focusModeHeading: { en: 'Focus mode and narration', zh: '專注模式同旁述' },
  enableFocusMode: { en: 'Enable focus mode', zh: '開啟專注模式' },
  focusModeNameLabel: { en: 'Focus mode display name', zh: '專注模式顯示名稱' },
  enableNarrator: { en: 'Enable narrator (off by default)', zh: '開啟旁述（預設關閉）' },
  narratedLanguageLabel: { en: 'Narrated language', zh: '旁述語言' },
  narratedBoth: { en: 'Both', zh: '兩種都要' },
  englishVoiceLabel: { en: 'English voice', zh: '英文聲音' },
  cantoneseVoiceLabel: { en: 'Cantonese voice', zh: '廣東話聲音' },
  chooseAutomatically: { en: 'Choose automatically', zh: '自動選擇' },
  installedSystemVoice: { en: 'Installed system voice', zh: '已安裝嘅系統聲音' },
  voiceProvenance: { en: "Voice names are runtime choices; this site stores only the selected preference.", zh: '實際聲音名稱由runtime決定；呢個網站淨係儲低你揀咗邊個偏好。' },
  focusExplain: { en: 'Turning on focus mode forces English everywhere and hides optional playful or Cantonese surfaces without deleting your saved choices. Turn it off any time to get them back.', zh: '開啟專注模式會強制成個網站淨用英文，仲會收埋淨係揀用嘅趣怪或者廣東話介面，但唔會刪走你已儲低嘅選擇。隨時關返都會攞返晒。' },

  appearanceTag: { en: 'Appearance', zh: '外觀' },
  livePreviewTag: { en: 'Live preview', zh: '即時預覽' },
  siteAppearanceHeading: { en: 'Site appearance', zh: '網站外觀' },
  themeLabel: { en: 'Theme', zh: '主題' },
  themeDark: { en: 'Dark', zh: '深色' },
  themeLight: { en: 'Light', zh: '淺色' },
  themeAuto: { en: 'Auto (match this device)', zh: '自動（跟返部機）' },
  densityLabel: { en: 'Density', zh: '密度' },
  densityComfortable: { en: 'Comfortable', zh: '寬鬆' },
  densityCompact: { en: 'Compact', zh: '緊湊' },
  tabDockLabel: { en: 'Tab strip docking', zh: '分頁列泊位' },
  dockLeft: { en: 'Left (default)', zh: '左邊（預設）' },
  dockRight: { en: 'Right', zh: '右邊' },
  dockTop: { en: 'Top', zh: '上面' },
  dockBottom: { en: 'Bottom', zh: '下面' },
  accentColorLabel: { en: 'Accent colour (seed)', zh: '主色（種子色）' },
  accentColorReset: { en: 'Reset to default', zh: '還原預設' },
  cornerRadiusLabel: { en: 'Corner roundness', zh: '轉角圓角度' },
  logoPresetLabel: { en: 'Logo preset', zh: 'Logo樣式' },
  logoDefault: { en: 'Material Ollama mark', zh: 'Material Ollama標誌' },
  logoSoft: { en: 'Soft accent mark', zh: '柔和主色標誌' },
  logoMono: { en: 'Monochrome mark', zh: '單色標誌' },
  uploadCustomLogo: { en: 'Upload a local custom logo', zh: '上載本地自訂Logo' },
  logoFallbackNote: { en: 'The shipped mark remains the fallback until a valid local custom image is selected.', zh: '喺你揀到有效嘅本地自訂圖片之前，會一直用返出廠嘅標誌做後備。' },
  appearanceExplain: { en: 'Theme, accent colour, and corner roundness are Material Design 3 tokens applied live to this page as CSS custom properties. Auto theme follows this device\'s system preference; explicit Dark or Light always wins over it.', zh: '主題、主色同轉角圓角度都係Material Design 3嘅tokens，會即時以CSS custom properties套用喺呢一頁。自動主題會跟返呢部機嘅系統偏好；明確揀咗深色或者淺色就一定贏。' },

  localDataTag: { en: 'Local data', zh: '本地資料' },
  noNetworkTag: { en: 'No network', zh: '冇網絡' },
  filesScheduleHeading: { en: 'Files, schedule, and recovery', zh: '檔案、排程同復原' },
  uploadPersonalVocabulary: { en: 'Upload personal vocabulary JSON', zh: '上載個人詞彙JSON' },
  vocabularyLoadedHelp: { en: 'A valid file is active locally. Its contents are never included in exports.', zh: '有一個有效檔案喺本地生效緊，佢嘅內容永遠唔會出現喺exports度。' },
  vocabularyEmptyHelp: { en: 'No file loaded. The site keeps its original wording.', zh: '未載入檔案，網站保持原本嘅措辭。' },
  clearVocabulary: { en: 'Clear vocabulary', zh: '清除詞彙' },
  enableScheduledSettings: { en: 'Enable local scheduled settings', zh: '開啟本地排程設定' },
  scheduledValueSourceLabel: { en: 'Scheduled value source', zh: '排程數值來源' },
  sourceLocalData: { en: 'Local data', zh: '本地資料' },
  sourceHttps: { en: 'Validated HTTPS endpoint', zh: '已驗證嘅HTTPS端點' },
  sourceHomeAssistant: { en: 'Home Assistant boolean', zh: 'Home Assistant布林值' },
  exportSettings: { en: 'Export settings', zh: '匯出設定' },
  importSettings: { en: 'Import settings', zh: '匯入設定' },
  resetLocalState: { en: 'Reset local state', zh: '還原本地狀態' },
  filesExplain: { en: 'Uploads are validated locally and never leave this browser. Exports name every value they carried and every private value they left out on purpose.', zh: '上載嘅檔案淨係喺本地驗證，永遠唔會離開呢個瀏覽器。Export會列明帶埋嘅每一個數值，同埋刻意冇帶嘅每一個私隱數值。' },

  supportTicketsHeading: { en: 'Support Tickets', zh: '客服票務' },
  supportTicketsBody: { en: "This site has no support network. The recovery equivalent is to clear this site's browser storage; the app's own desktop recovery route is documented separately.", zh: '呢個網站冇任何客服網絡。對應嘅復原方法就係清除呢個網站嘅瀏覽器儲存；應用程式自己嗰套桌面復原方法有另外記錄。' },
  createLocalTicketNotice: { en: 'Create a local ticket notice', zh: '建立本地票務通知' },
  supportNoticeTitle: { en: 'Local support note', zh: '本地支援備註' },

  resetDialogTag: { en: 'Destructive action', zh: '不可逆動作' },
  resetDialogTitle: { en: 'Reset site state?', zh: '要還原網站狀態？' },
  resetKeyOne: { en: 'I understand which local data is affected', zh: '我明白邊啲本地資料會受影響' },
  resetKeyTwo: { en: 'I understand this action cannot be undone here', zh: '我明白呢個動作喺呢度冚唪唥做唔返轉頭' },
  resetSlideLabel: { en: 'Slide fully to authorize', zh: '拉到盡先算授權' },
  emergencyExit: { en: 'Emergency exit', zh: '緊急離開' },
  resetEscapeHint: { en: 'Escape also cancels this local confirmation.', zh: '撳Escape都可以取消呢個本地確認。' },

  paletteTag: { en: 'Command palette', zh: '指令面板' },
  paletteTitle: { en: 'Go to a page or feature', zh: '跳去某一頁或者功能' },
  paletteSearchAria: { en: 'Search command palette', zh: '搜尋指令面板' },
  paletteSearchPlaceholder: { en: 'Search commands, pages, and controls', zh: '搜尋指令、頁面同控制項' },
  paletteClose: { en: 'Close command palette', zh: '關閉指令面板' },
  paletteNoResults: { en: 'No command matches this query.', zh: '冇任何指令同呢個查詢相符。' },

  footerLine1: { en: 'Material Ollama landing and documentation surface · local state only', zh: 'Material Ollama landing同文件介面 · 淨係本地狀態' },
  dismiss: { en: 'Dismiss', zh: '拉走' },
} as const

export type DictionaryKey = keyof typeof DICTIONARY

export function t(ctx: LangCtx, key: DictionaryKey, vars?: Record<string, string | number>): string {
  const entry = DICTIONARY[key]
  return fill(present(ctx.languageMode, entry.en, entry.zh, ctx.schoolMode), vars)
}

// tone(): copy that visibly changes with the two independent 1-5 sliders. Index 0 is fully
// professional, index 4 is maximum playful. School mode always renders the professional English
// variant, matching the rule that focus mode suppresses optional playful presentation.
const TONE_COPY = {
  heroLede: {
    en: [
      'A local-first landing, documentation, status, and download surface for a desktop companion application.',
      'A local-first landing and documentation surface for a desktop companion application.',
      "Everything you need before you install: what it is, what it isn't, and where the download evidence lives.",
      'No cloud required, no account, no drama — just the facts about the desktop app before you install it.',
      "This page won't run a single model. It will happily tell you everything else, with zero chill.",
    ],
    zh: [
      '一個本地優先嘅landing、文件、狀態同下載介面，服務一個桌面伴隨應用程式。',
      '一個本地優先嘅landing同文件介面，服務一個桌面伴隨應用程式。',
      '安裝之前你想知嘅嘢呢度都有：呢個係乜、唔係乜，同埋下載佐證擺喺邊。',
      '唔使用雲端、唔使開帳戶、冇花巧——安裝之前，桌面應用程式嘅事實呢度講晒。',
      '呢一頁一個模型都唔會幫你跑，但其他嘢佢會好興奮咁講畀你聽，冇得頂。',
    ],
  },
  boundaryNote: {
    en: [
      'This site introduces the installed desktop application. It is not the primary runtime, it does not host a model, and it is not a playable substitute for the desktop application.',
      'This site introduces the installed desktop application. It never runs a model itself and is never a substitute for it.',
      "Think of this page as the lobby, not the workshop: it introduces the desktop app, and never pretends to be it.",
      "This page is strictly the lobby. Ask it to run a model and it will point you very firmly at the front door.",
      "Landing page energy only: intros, links, and receipts. The actual model-running happens next door, in the real app.",
    ],
    zh: [
      '呢個網站淨係介紹已安裝嘅桌面應用程式。佢唔係主要嘅runtime，唔會託管任何模型，亦都唔係桌面應用程式嘅可玩替代品。',
      '呢個網站淨係介紹已安裝嘅桌面應用程式。佢自己永遠唔會跑模型，都唔會扮成係嗰個應用程式。',
      '呢一頁淨係大堂，唔係工作室：佢負責介紹桌面應用程式，永遠唔會扮成係佢。',
      '呢一頁淨係做大堂嘅角色。叫佢跑模型？佢會好認真咁指返去正門。',
      '呢頁純粹係landing page嘅本份：介紹、連結、收據。真正跑模型嗰件事，喺隔籬嗰個真正嘅app度發生。',
    ],
  },
  visitorStateNote: {
    en: [
      'All settings, notices, search state, and feature selections stay local to this browser. No request is needed to browse the site.',
      'All settings, notices, and selections stay local to this browser. Browsing needs no request at all.',
      'Nothing you click here leaves this browser — settings, notices, and search all stay put.',
      'This tab keeps its own little secret diary of your settings, and nobody else ever reads it.',
      'Whatever you fiddle with here stays in this tab forever, like a very well-behaved houseplant.',
    ],
    zh: [
      '所有設定、通知、搜尋狀態同功能選擇都留喺呢個瀏覽器度，瀏覽網站唔使發任何request。',
      '所有設定、通知同選擇都留喺呢個瀏覽器度，瀏覽根本唔使發任何request。',
      '你喺呢度撳嘅嘢一律唔會離開呢個瀏覽器——設定、通知、搜尋，通通留低。',
      '呢個分頁有本自己嘅小日記記低你嘅設定，冇第二個人會偷睇。',
      '你喺呢度郁過嘅嘢會永遠留喺呢個分頁度，乖到好似盆植物咁。',
    ],
  },
  settingsIntro: {
    en: [
      'Every value below is local browser state. Settings are not account data, are not synchronized, and do not configure an external Ollama service.',
      'Every value below lives only in this browser and never configures anything external.',
      'Nothing on this page phones home — every switch below only ever touches this browser.',
      'Flip whatever you like. It all stays right here, and none of it calls Ollama, an account, or anyone else.',
      'Go wild with the settings below — this browser is the only thing that will ever notice.',
    ],
    zh: [
      '以下每一個數值都係本地瀏覽器狀態。設定唔係帳戶資料，唔會同步，亦都唔會設定任何外部嘅Ollama服務。',
      '以下每一個數值都淨係存喺呢個瀏覽器度，唔會設定任何外部嘅嘢。',
      '呢一頁邊個掣都唔會打電話返屋企——以下每一個switch淨係影響緊呢個瀏覽器。',
      '你想點撥就點撥，一切都留喺呢度，唔會call Ollama、帳戶定係任何人。',
      '以下嘅設定盡管去玩，唯一會有反應嘅就係呢個瀏覽器本身。',
    ],
  },
  resetDialogIntro: {
    en: [
      "This clears settings, notices, and local feature history from this browser. It does not delete the installed desktop application's data.",
      'This clears local settings and history from this browser only. The desktop app keeps its own data.',
      "Heads up: this wipes what this browser remembers about your visit. The real app's data is untouched.",
      "Yes, this one is the real deal — it wipes this browser's memory of you. The desktop app? Totally fine, unbothered.",
      "This is the button that makes this tab forget you ever existed. The desktop app will still remember you fondly.",
    ],
    zh: [
      '呢個動作會清除呢個瀏覽器嘅設定、通知同本地功能紀錄，但唔會刪走已安裝桌面應用程式嘅資料。',
      '呢個動作淨係清除呢個瀏覽器嘅本地設定同紀錄，桌面應用程式自己嗰份資料照樣留低。',
      '提提你：呢個動作會抹走呢個瀏覽器對你呢次拜訪嘅記憶，真正嗰個app嘅資料完全冇事。',
      '冇錯，呢個係認真嘅——佢會抹走呢個瀏覽器對你嘅記憶。桌面app？完全冇受影響，淡定得好。',
      '呢個掣一撳落去，呢個分頁就會唔記得你存在過。桌面app就仲會好掛住你。',
    ],
  },
  dimSumNoticeDetail: {
    en: [
      'Dim sum surprise is available in the installed application; this landing surface remains non-blocking.',
      'The dim sum surprise lives in the installed app; this page only shows a small, non-blocking note about it.',
      'The real dim sum delight is in the desktop app — this is just a friendly nudge that it exists.',
      "This page can't serve you actual dim sum. The desktop app can, sort of, in a 10%-chance, very cute way.",
      'Consider this a tiny appetizer notice — the full dim sum surprise menu lives in the installed app.',
    ],
    zh: [
      '點心驚喜功能喺已安裝嘅應用程式度先有；呢個landing頁淨係一個唔會阻住你嘅小通知。',
      '真正嘅點心驚喜住喺已安裝嘅app度；呢一頁淨係俾個細細嘅提示話你知有呢件事。',
      '真正嘅點心驚喜喺桌面app度先食到——呢度淨係好心提你一句話有呢樣嘢。',
      '呢一頁冇真正嘅點心俾你，但桌面app就有，大概10%機會，仲幾得意。',
      '就當呢個係開胃小點通知——完整嘅點心驚喜菜單喺已安裝嘅app度。',
    ],
  },
  paletteFootnote: {
    en: [
      'Keyboard: Ctrl+Shift+F opens this palette; Escape closes it.',
      'Ctrl+Shift+F opens this palette; Escape closes it.',
      'Two keys to remember: Ctrl+Shift+F opens, Escape closes.',
      'Ctrl+Shift+F summons this little helper. Escape sends it away, no hard feelings.',
      'Ctrl+Shift+F: poof, palette. Escape: poof, gone. Magic, but keyboard-shaped.',
    ],
    zh: [
      '鍵盤操作：Ctrl+Shift+F打開呢個面板；Escape就關閉。',
      'Ctrl+Shift+F打開呢個面板；Escape關閉。',
      '記住兩粒掣就得：Ctrl+Shift+F打開，Escape關閉。',
      'Ctrl+Shift+F召喚呢個小幫手，Escape就送佢走，冇有怨言嘅。',
      'Ctrl+Shift+F：咻，面板出現。Escape：咻，唔見咗。鍵盤版魔法。',
    ],
  },
  footerTagline: {
    en: [
      'Material Ollama landing and documentation surface · local state only',
      'Material Ollama landing surface · local state only',
      'A local-only landing page for Material Ollama',
      'Material Ollama landing page, running on pure local vibes only',
      'This footer, like the rest of the page, has never once phoned home',
    ],
    zh: [
      'Material Ollama landing同文件介面 · 淨係本地狀態',
      'Material Ollama landing介面 · 淨係本地狀態',
      '一個純本地嘅Material Ollama landing page',
      'Material Ollama landing page，純粹本地氣氛運作中',
      '呢個footer同成頁一樣，從未打過電話返屋企',
    ],
  },
} as const

export type ToneKey = keyof typeof TONE_COPY

export function tone(ctx: ToneCtx, key: ToneKey, vars?: Record<string, string | number>): string {
  const entry = TONE_COPY[key]
  if (ctx.schoolMode) return fill(entry.en[0], vars)
  const englishLevel = Math.min(5, Math.max(1, ctx.funnyEnglish)) - 1
  const cantoneseLevel = Math.min(5, Math.max(1, ctx.funnyCantonese)) - 1
  const english = entry.en[englishLevel]
  const cantonese = entry.zh[cantoneseLevel]
  if (ctx.languageMode === 'english') return fill(english, vars)
  if (ctx.languageMode === 'cantonese') return fill(cantonese, vars)
  return fill(`${english} · ${cantonese}`, vars)
}

export function emoji(showEmoji: boolean, symbol: string): string {
  return showEmoji ? `${symbol} ` : ''
}
