// Bundled site content. Every string here ships inside the built site source — nothing is fetched
// at runtime. Facts (the release tag, commit, hash, size) stay identical across every language and
// tone setting; only their surrounding labels are translated.

export type PageId = 'overview' | 'features' | 'docs' | 'status' | 'settings'

export const VERIFIED_RELEASE = {
  tag: 'v0.0.0-build.9',
  releaseUrl: 'https://github.com/Ding-Ding-Projects/material-ollama/releases/tag/v0.0.0-build.9',
  commit: '8175c3ff1b490b7e17217b39f1b3b625f80dd218',
  installerUrl: 'https://github.com/Ding-Ding-Projects/material-ollama/releases/download/v0.0.0-build.9/OllamaSetup.exe',
  installerSize: '40,211,120 bytes',
  installerSha256: '7571508dc67a4ea4b78f4c37aecea5f315ac8d6b564dca737144fd82b1cb41b0',
  codeName: 'Scallop Har Gow · 帶子蝦餃',
  dishId: 'hk-dish-0002',
  photoUrl: 'https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/hk-dish-0002-scallop-har-gow.png',
  landingUrl: 'https://ding-ding-projects.github.io/material-ollama/',
} as const

export const PAGES: Array<{ id: PageId; icon: string; label: string; labelZh: string; summary: string; summaryZh: string }> = [
  { id: 'overview', icon: '⌂', label: 'Overview', labelZh: '概覽', summary: 'Boundary, purpose, and the verified starting point.', summaryZh: '界線、目的同已核實嘅起點。' },
  { id: 'features', icon: '◈', label: 'Feature map', labelZh: '功能地圖', summary: 'The complete landing-page contract and product map.', summaryZh: '完整嘅landing page規範同產品地圖。' },
  { id: 'docs', icon: '▤', label: 'Documentation', labelZh: '文件', summary: 'Offline-friendly articles with real source links.', summaryZh: '離線都睇得嘅文章，附真實source連結。' },
  { id: 'status', icon: '◌', label: 'Status', labelZh: '狀態', summary: 'Release, source, and verification evidence.', summaryZh: '版本、source同驗證佐證。' },
  { id: 'settings', icon: '⚙', label: 'Settings', labelZh: '設定', summary: 'Per-visitor state, appearance, language, and recovery.', summaryZh: '每位訪客嘅狀態、外觀、語言同復原方法。' },
]

export type CatalogFeature = { id: string; title: string; titleZh: string; category: string; summary: string; summaryZh: string; surface: string }

export const FEATURE_CATALOG: CatalogFeature[] = [
  { id: 'language-modes', title: 'Language modes', titleZh: '語言模式', category: 'Communication', summary: 'English, playful Hong Kong-style Cantonese, and bilingual presentation.', summaryZh: '英文、輕鬆嘅香港式廣東話同雙語呈現。', surface: 'Settings and every site surface' },
  { id: 'funny-levels', title: 'Independent tone controls', titleZh: '獨立語氣控制', category: 'Communication', summary: 'Separate 1–5 tone levels for English and Cantonese copy.', summaryZh: '英文同廣東話文案各自有1到5級語氣可調。', surface: 'Settings and notifications' },
  { id: 'emoji-dialogs', title: 'Dialog emoji preference', titleZh: '對話框Emoji偏好', category: 'Communication', summary: 'A persisted decoration toggle that never changes control labels or accessible names.', summaryZh: '一個會記住嘅裝飾switch，永遠唔會改動控制項標籤或者accessible name。', surface: 'Settings and messages' },
  { id: 'school-mode', title: 'School mode', titleZh: '學校模式（專注模式）', category: 'Communication', summary: 'A shared, renamed focus mode with an explicit local reset route.', summaryZh: '一個可以改名嘅共用專注模式，附明確嘅本地還原方法。', surface: 'Settings and all visitor state' },
  { id: 'narrator', title: 'Narrator and voice choice', titleZh: '旁述同聲音選擇', category: 'Accessibility', summary: 'Opt-in serialized narration with independent English and Cantonese voice choices.', summaryZh: '自願開啟嘅序列式旁述，英文同廣東話聲音各自獨立揀選。', surface: 'Settings and status' },
  { id: 'personal-vocabulary', title: 'Personal vocabulary upload', titleZh: '個人詞彙上載', category: 'Privacy', summary: 'Bounded local JSON validation with no file contents in exports or logs.', summaryZh: '有上限嘅本地JSON驗證，檔案內容永遠唔會出現喺exports或者logs度。', surface: 'Settings' },
  { id: 'scheduled-settings', title: 'Scheduled settings', titleZh: '排程設定', category: 'Customization', summary: 'Local, HTTPS, and Home Assistant sources with timezone and fallback notes.', summaryZh: '本地、HTTPS同Home Assistant三種來源，附時區同後備說明。', surface: 'Settings' },
  { id: 'dim-sum', title: 'Dim sum surprise', titleZh: '點心驚喜', category: 'Delight', summary: 'A local, non-blocking 10% startup delight with bilingual dish naming.', summaryZh: '一個本地、唔會阻住你嘅10%開機小驚喜，點心名雙語顯示。', surface: 'Overview and visitor session' },
  { id: 'notifications', title: 'Notifications and history', titleZh: '通知同紀錄', category: 'Operations', summary: 'Non-blocking notices remain reviewable, dismissible, and export-aware.', summaryZh: '唔會阻住你嘅通知仍然可以翻查、拉走同埋支援匯出。', surface: 'Status and settings' },
  { id: 'appearance', title: 'Per-element appearance editor', titleZh: '逐元件外觀編輯器', category: 'Appearance', summary: 'Every rendered surface is an explicit appearance target with reset and export paths.', summaryZh: '每一個渲染出嚟嘅介面都係明確嘅外觀目標，有還原同匯出方法。', surface: 'Settings and feature cards' },
  { id: 'logo', title: 'Logo customization', titleZh: 'Logo自訂', category: 'Appearance', summary: 'Shipped presets and a bounded local custom-image route with rollback state.', summaryZh: '出廠樣式加上有上限嘅本地自訂圖片方法，附還原狀態。', surface: 'Settings' },
  { id: 'color-translator', title: 'Infinite color translator', titleZh: '無限色彩轉換器', category: 'Appearance', summary: 'Continuous color selection, translation, alpha preservation, and contrast readout.', summaryZh: '連續色彩選擇、轉換、保留透明度同對比度讀數。', surface: 'Settings' },
  { id: 'tabs', title: 'Tabbed navigation', titleZh: '分頁式導航', category: 'Navigation', summary: 'Dockable tabs with overflow, keyboard movement, and persisted position.', summaryZh: '可泊位嘅分頁，支援overflow、鍵盤移動同記住位置。', surface: 'Every page' },
  { id: 'tab-groups', title: 'Tab groups, pinning, and searches', titleZh: '分頁群組、置頂同搜尋', category: 'Navigation', summary: 'Current-strip, group, group-name, and master-tab discovery paths.', summaryZh: '涵蓋目前分頁列、群組、群組名同總分頁四種搜尋方法。', surface: 'Settings and navigation' },
  { id: 'regex-builder', title: 'Anchored regex builder', titleZh: '定位式Regex建立器', category: 'Search', summary: 'Plain-text-first search with flags, sample text, feedback, and copyable patterns.', summaryZh: '以純文字為預設嘅搜尋，附flags、範例文字、即時回饋同可複製pattern。', surface: 'Every search surface' },
  { id: 'command-palette', title: 'Command palette', titleZh: '指令面板', category: 'Navigation', summary: 'Ctrl+Shift+F teleports to pages, features, and settings controls.', summaryZh: 'Ctrl+Shift+F可以即刻跳去頁面、功能同設定控制項。', surface: 'Global' },
  { id: 'locks', title: 'Toy locks', titleZh: '玩味鎖', category: 'Recovery', summary: 'Per-element password or OTP lock disclosures with local reset instructions.', summaryZh: '逐元件密碼或者OTP鎖嘅說明，附本地還原指引。', surface: 'Feature map and settings' },
  { id: 'support-tickets', title: 'Support Tickets', titleZh: '客服票務', category: 'Recovery', summary: 'A local fictional desk that opens the data folder and never sends a request.', summaryZh: '一個虛構嘅本地客服枱，淨係打開資料夾，永遠唔會發request。', surface: 'Settings and help' },
  { id: 'unlock-ladder', title: 'Unlock ladder', titleZh: '解鎖階梯', category: 'Recovery', summary: 'Documented local equivalent for the dim sum, sums, mole, and clock ladder.', summaryZh: '已記錄嘅本地對應版，涵蓋點心、加數、打地鼠同計時階梯。', surface: 'Recovery documentation' },
  { id: 'authenticator', title: 'Built-in authenticator', titleZh: '內置驗證器', category: 'Security', summary: 'Local OTP registration, QR pairing, vector coverage, and redacted export promise.', summaryZh: '本地OTP登記、QR配對、測試向量覆蓋，同保證匯出時會遮蔽敏感內容。', surface: 'Feature map and documentation' },
  { id: 'history', title: 'Local version history', titleZh: '本地版本紀錄', category: 'Recovery', summary: 'Append-only visitor history with redaction, filtering, restore, and export concepts.', summaryZh: '只可新增嘅訪客紀錄，附遮蔽、過濾、還原同匯出概念。', surface: 'Settings and documentation' },
  { id: 'destructive-confirmation', title: 'Destructive-action confirmation', titleZh: '不可逆動作確認', category: 'Safety', summary: 'Two keys plus a full-range slider before irreversible local reset actions.', summaryZh: '不可逆嘅本地還原動作，要先撳兩條key加拉滿一條滑桿。', surface: 'Settings' },
  { id: 'file-converter', title: 'Local file converter', titleZh: '本地檔案轉換器', category: 'Tools', summary: 'Categorized adapters, local file picking, progress, cancellation, and output honesty.', summaryZh: '分類adapter、本地選檔、進度、取消同誠實嘅輸出結果。', surface: 'Feature map and documentation' },
  { id: 'ollama-manager', title: 'Local Ollama suite manager', titleZh: '本地Ollama套件管理器', category: 'Ollama', summary: 'Model catalog, tags, pulls, chat, fit evidence, and allowlisted harness concepts.', summaryZh: '模型目錄、tags、pull、chat、合適度佐證，同白名單harness概念。', surface: 'Feature map and documentation' },
  { id: 'cli-parity', title: 'CLI parity', titleZh: 'CLI對應', category: 'Ollama', summary: 'A GUI mapping for commands, flags, aliases, progress, errors, and hidden tools.', summaryZh: '將指令、flags、別名、進度、錯誤同隱藏工具全部對應返去GUI。', surface: 'Feature map and documentation' },
  { id: 'config-parity', title: 'Configuration parity', titleZh: '設定對應', category: 'Ollama', summary: 'Effective values, provenance, profiles, restart, rollback, and import/export.', summaryZh: '實際生效數值、來源、profile、重啟、還原同匯入匯出。', surface: 'Feature map and documentation' },
  { id: 'external-editor', title: 'External editor handoff', titleZh: '外部編輯器交接', category: 'Tools', summary: 'Exports have an explicit path to a detected Visual Studio Code workspace.', summaryZh: 'Export有明確方法送去偵測到嘅Visual Studio Code工作區。', surface: 'Documentation and feature map' },
  { id: 'exports', title: 'Complete exports', titleZh: '完整匯出', category: 'Data', summary: 'Structured and text exports name omitted private values and preserve active filters.', summaryZh: '結構化同純文字匯出都會講明漏咗邊啲私隱數值，仲保留住現用嘅過濾條件。', surface: 'Settings and documentation' },
  { id: 'bulk-actions', title: 'Bulk actions', titleZh: '批量操作', category: 'Data', summary: 'Selection, inverse selection, scoped previews, progress, and undo-aware outcomes.', summaryZh: '選取、反選、範圍預覽、進度，同支援復原嘅結果。', surface: 'Feature map and documentation' },
  { id: 'changelog', title: 'Changelog viewer', titleZh: '更新日誌檢視器', category: 'Documentation', summary: 'Every recorded release entry includes a date, category, and commit link.', summaryZh: '每一條記錄落嚟嘅版本項目都有日期、分類同commit連結。', surface: 'Documentation' },
  { id: 'offline-docs', title: 'Offline documentation browser', titleZh: '離線文件瀏覽器', category: 'Documentation', summary: 'Bundled feature articles render locally and link to one another.', summaryZh: '打包好嘅功能文章本地渲染，仲會互相連結。', surface: 'Documentation' },
  { id: 'provider-markdown', title: 'Rendered provider-authored text', titleZh: '第三方文字渲染', category: 'Documentation', summary: 'Markdown is presented as markup with honest empty states and safe link boundaries.', summaryZh: 'Markdown會真正渲染出格式，有誠實嘅空白狀態同安全嘅連結界線。', surface: 'Documentation' },
  { id: 'social-preview', title: 'Product social preview', titleZh: '產品社交預覽圖', category: 'Publishing', summary: 'The site carries product-specific Open Graph and large-card metadata.', summaryZh: '網站帶有專屬產品嘅Open Graph同大卡片metadata。', surface: 'Metadata and publishing' },
  { id: 'download-states', title: 'Browser-extension download states', titleZh: '瀏覽器擴充下載狀態', category: 'Publishing', summary: 'Start, active progress, and completion surfaces are documented as independent states.', summaryZh: '開始、進行中同完成三個介面各自獨立記錄為唔同狀態。', surface: 'Documentation' },
  { id: 'status-hub', title: 'Live status surface', titleZh: '即時狀態介面', category: 'Publishing', summary: 'Current state, evidence, next gates, and honest unverified states are visible.', summaryZh: '目前狀態、佐證、下一步關卡，同誠實嘅未驗證狀態全部睇得到。', surface: 'Status' },
  { id: 'responsive', title: 'Responsive and touch sizing', titleZh: '響應式同觸控尺寸', category: 'Accessibility', summary: 'The layout targets 320px upward, portrait and landscape, without sideways body scroll.', summaryZh: '版面由320px起跳，直向橫向都得，body永遠唔會側向捲動。', surface: 'Every page' },
  { id: 'keyboard', title: 'Keyboard and screen-reader access', titleZh: '鍵盤同讀屏軟件存取', category: 'Accessibility', summary: 'Visible focus, semantic roles, labels, and non-color status communication.', summaryZh: '清楚可見嘅focus、有語意嘅role、標籤，同唔淨靠顏色表達嘅狀態。', surface: 'Every page' },
  { id: 'reduced-motion', title: 'Reduced motion and quiet operation', titleZh: '減少動態同安靜運作', category: 'Accessibility', summary: 'Animation and narration choices respect local accessibility preferences.', summaryZh: '動畫同旁述選擇會尊重本機嘅無障礙偏好設定。', surface: 'Every page' },
  { id: 'appearance-presets', title: 'Theme presets and import/export', titleZh: '主題樣式同匯入匯出', category: 'Appearance', summary: 'Named presets, local customizations, and resettable site state.', summaryZh: '有名嘅樣式、本地自訂同可還原嘅網站狀態。', surface: 'Settings' },
  { id: 'app-rename', title: 'Display-name customization', titleZh: '顯示名稱自訂', category: 'Customization', summary: 'The visitor-facing name is separate from package identity and is locally resettable.', summaryZh: '訪客見到嘅名稱同套件身份分開處理，仲可以本地還原。', surface: 'Settings' },
  { id: 'updates', title: 'Unsigned update transparency', titleZh: '未簽署更新透明度', category: 'Publishing', summary: 'The verified Windows release shows its immutable download facts and unsigned warning.', summaryZh: '已核實嘅Windows版本會顯示佢冇得改嘅下載事實同未簽署警告。', surface: 'Downloads and status' },
  { id: 'privacy', title: 'No-network visitor state', titleZh: '零網絡訪客狀態', category: 'Privacy', summary: 'The site works from bundled assets and browser storage without analytics or tracking.', summaryZh: '網站淨係靠打包資源同瀏覽器儲存運作，冇任何分析或者追蹤。', surface: 'Every page' },
]

// Every canonical feature ID the completeness inventory expects a landing-page row for. The
// landing page keeps a local equivalent record for each one — even the 41 without bespoke curated
// copy yet — so a feature silently disappearing from this registry stays visible in a diff.
export const CANONICAL_FEATURE_IDS = [
  'language-modes', 'funny-level-controls', 'dialog-emoji-toggle', 'school-mode', 'personal-vocabulary', 'narration', 'narrator-voice-selection', 'scheduled-settings', 'external-settings-sources', 'dim-sum-surprise', 'dim-sum-release-catalog', 'regex-builder', 'notifications', 'notification-center', 'accessibility', 'responsive-layout-and-sizing', 'material-design', 'appearance-editor', 'infinite-color-translator', 'app-logo-customization', 'file-converter', 'ollama-suite-manager', 'model-store', 'hardware-fit', 'batch-pull-queue', 'local-chat-sessions', 'harness-profiles', 'browser-tabs', 'tab-docking-overflow', 'tab-groups', 'tab-discovery-searches', 'tab-bulk-close', 'offline-documentation-browser', 'landing-page-boundary', 'command-palette', 'destructive-super-confirmation', 'local-version-history', 'changelog-viewer', 'external-editor', 'exports', 'bulk-actions', 'toy-locks', 'support-tickets', 'unlock-ladder', 'two-factor-qr-pairing', 'built-in-authenticator', 'browser-extension-download-capture', 'shared-link-embed', 'provider-authored-renderer', 'guided-forms', 'rich-controls', 'settings-explanations-provenance', 'overlays', 'context-menu-shortcuts', 'long-operation-progress', 'failure-recovery', 'forge-publishing', 'collapsible-filters', 'blank-slate-presets', 'app-display-name', 'secret-display-history', 'cli-gui-parity', 'gui-capability-registry', 'config-profiles', 'status-hub', 'status-discord-bridge', 'tidbyt-status-display', 'vocabulary-hash-lock', 'sanitized-instruction-copy', 'repository-root-build-script', 'dependency-bootstrap', 'bundled-runtime-dependencies', 'unsigned-release-policy', 'release-line-count', 'issue-handoff', 'rolling-discussion', 'project-status', 'site-homepage-link', 'api-documentation-and-collection', 'capture-manifest', 'release-metadata', 'cheap-transfer', 'automatic-updates', 'packaged-app-icon', 'no-network-privacy',
] as const

export const FEATURE_ALIASES: Record<string, string> = {
  'funny-levels': 'funny-level-controls', 'narrator': 'narration', 'dim-sum': 'dim-sum-surprise', 'color-translator': 'infinite-color-translator',
  'logo': 'app-logo-customization', 'ollama-manager': 'ollama-suite-manager', 'tabs': 'browser-tabs', 'locks': 'toy-locks', 'history': 'local-version-history',
  'destructive-confirmation': 'destructive-super-confirmation', 'cli-parity': 'cli-gui-parity', 'config-parity': 'config-profiles', 'status-hub': 'status-hub',
  'social-preview': 'shared-link-embed', 'provider-markdown': 'provider-authored-renderer', 'responsive': 'responsive-layout-and-sizing', 'privacy': 'no-network-privacy',
  'notifications': 'notification-center', 'emoji-dialogs': 'dialog-emoji-toggle', 'appearance': 'appearance-editor', 'authenticator': 'built-in-authenticator',
  'changelog': 'changelog-viewer', 'offline-docs': 'offline-documentation-browser', 'download-states': 'browser-extension-download-capture',
  'keyboard': 'accessibility', 'app-rename': 'app-display-name', 'updates': 'automatic-updates',
}

function titleFromId(id: string) {
  return id.split('-').map((part) => (part ? `${part[0].toUpperCase()}${part.slice(1)}` : part)).join(' ')
}

export type ResolvedFeature = CatalogFeature

export const ALL_FEATURES: ResolvedFeature[] = CANONICAL_FEATURE_IDS.map((id) => {
  const existing = FEATURE_CATALOG.find((feature) => feature.id === id || FEATURE_ALIASES[feature.id] === id)
  if (existing) return { ...existing, id }
  return {
    id,
    title: titleFromId(id),
    // Canonical IDs without bespoke curated copy keep their technical identifier-derived title in
    // every language mode, the same way a commit SHA or a config key stays literal — but the
    // summary sentence around it is still bilingual.
    titleZh: titleFromId(id),
    category: 'Contract',
    summary: 'This landing page carries a local equivalent record for the canonical user-facing requirement and keeps its evidence state explicit.',
    summaryZh: '呢個landing page都有一份呢項規範要求嘅本地紀錄，evidence狀態寫得清清楚楚，唔會扮已經做完。',
    surface: 'Landing page feature map and documentation',
  }
})

export type Article = { id: string; title: string; titleZh: string; summary: string; summaryZh: string; category: string; commit: string }

export const ARTICLES: Article[] = [
  { id: 'boundary', title: 'Landing surface boundary', titleZh: 'Landing介面嘅界線', summary: 'What the site is, what the installed desktop application is, and why no runtime is embedded.', summaryZh: '呢個網站係乜、已安裝嘅桌面應用程式係乜，同埋點解冇任何runtime內嵌喺度。', category: 'Orientation', commit: '4e910fccfd223b9034ca21f72eeffa19b4460974' },
  { id: 'parity', title: 'GUI, CLI, and configuration parity', titleZh: 'GUI、CLI同設定對應', summary: 'How the product maps commands, flags, environment values, and managed-service profiles.', summaryZh: '產品點樣將指令、flags、環境變數同受管理服務profile一一對應。', category: 'Ollama', commit: '4e910fccfd223b9034ca21f72eeffa19b4460974' },
  { id: 'privacy', title: 'Local visitor state and privacy', titleZh: '本地訪客狀態同私隱', summary: 'What stays in browser storage, what exports omit, and how a reset works.', summaryZh: '邊啲留喺瀏覽器儲存、export會漏低邊啲，同埋還原點樣運作。', category: 'Privacy', commit: '4e910fccfd223b9034ca21f72eeffa19b4460974' },
  { id: 'accessibility', title: 'Accessibility and responsive behavior', titleZh: '無障礙同響應式行為', summary: 'Keyboard, screen-reader, reduced-motion, touch, and narrow-width expectations.', summaryZh: '鍵盤、讀屏軟件、減少動態、觸控同窄螢幕嘅預期行為。', category: 'Accessibility', commit: '4e910fccfd223b9034ca21f72eeffa19b4460974' },
  { id: 'downloads', title: 'Verified downloads and release evidence', titleZh: '已核實嘅下載同版本佐證', summary: 'The Windows installer is linked to the immutable release manifest, exact commit, size, and hash.', summaryZh: 'Windows安裝程式連結去冇得改嘅版本清單、精確commit、大細同hash值。', category: 'Publishing', commit: VERIFIED_RELEASE.commit },
]
