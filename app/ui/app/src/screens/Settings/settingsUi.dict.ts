import { defineDict } from "@/uh"

/**
 * Settings-screen-level copy. A sibling namespace to `src/uh/dict/app.dict.ts`
 * and `src/uh/dict/appearanceEditor.dict.ts` (the per-element appearance
 * editor's own namespace — a different feature from this screen's Appearance
 * card, so this file claims its own "settingsUi" namespace rather than
 * reusing that one) — same colocated-`*.dict.ts` pattern
 * `src/screens/toolbox/toolboxLab.dict.ts` and
 * `src/screens/models/modelsUi.dict.ts` already established.
 */
export const settingsUiDict = defineDict("settingsUi", {
  // --- Screen chrome ---------------------------------------------------
  screenTitle: ["Settings", "設定"],
  screenSub: [
    "Everything here is real: every change is saved and takes effect immediately.",
    "呢度樣樣都係真㗎：改咗即刻生效，即刻儲埋。",
  ],
  searchLabel: ["Search settings", "搵設定"],
  searchPlaceholder: ["Search settings…", "搵設定…"],
  collapseSearch: ["Collapse search", "收埋搜尋"],
  expandSearch: ["Expand search", "展開搜尋"],
  noCardsMatch: [
    "No settings match that search.",
    "搵唔到符合嘅設定。",
  ],
  regexBuilderTrigger: ["Regex builder", "Regex 工具"],
  savingNow: ["Saving…", "儲緊…"],
  savedJustNow: ["Saved.", "儲咗喇。"],
  loadFailed: [
    "Couldn't load your preferences from the app. Showing the compiled-in defaults instead.",
    "冇辦法從個 app 讀返你嘅設定，暫時顯示緊出廠預設值。",
  ],

  // --- Shared row chrome -------------------------------------------------
  explainToggle: ["What does this do?", "呢個係做咩㗎？"],
  provenanceStored: ["Currently your saved value:", "而家用緊你揀嘅值："],
  provenanceDefault: ["Currently the compiled-in default:", "而家用緊出廠預設值："],
  disabledPrefix: ["Unavailable —", "而家用唔到 ——"],

  // --- General card --------------------------------------------------------
  generalTitle: ["General", "一般"],
  generalSub: [
    "The basics: how Ollama runs on this machine.",
    "最基本嗰啲：Ollama 喺呢部機點行。",
  ],
  emojiLabel: ["Show emojis in dialogs", "喺對話框度顯示表情符號"],
  emojiExplain: [
    "Adds a decorative emoji to dialogs and message boxes. Button labels and field names never get one — this only changes descriptive text.",
    "喺對話框同訊息框加個裝飾用嘅表情符號。掣同欄位個名唔會有——淨係改描述文字。",
  ],
  emojiToggleLabel: ["Show emojis", "顯示表情符號"],
  modelLocationLabel: ["Model location", "模型存放位置"],
  modelLocationExplain: [
    "Where downloaded models are stored on disk. Changing it doesn't move existing models — it only changes where new ones land.",
    "已下載模型喺硬碟嘅存放位置。改呢個唔會搬走現有模型——淨係改新模型擺喺邊。",
  ],
  browseBtn: ["Browse…", "揀…"],
  browseUnavailable: [
    "The native folder picker isn't available in this build.",
    "呢個 build 冇原生資料夾選擇器。",
  ],
  exposeLabel: ["Expose Ollama to the network", "將 Ollama 開放俾網絡"],
  exposeExplain: [
    "Lets other devices on your network reach this machine's Ollama server, instead of only this computer.",
    "俾同一網絡入面其他裝置都連到呢部機嘅 Ollama 伺服器，唔止呢部機自己用。",
  ],
  exposeToggleLabel: ["Expose to network", "開放俾網絡"],
  autoUpdateLabel: ["Auto-download updates", "自動下載更新"],
  autoUpdateExplain: [
    "Downloads a new version in the background when one's available, so it's ready to install without waiting.",
    "有新版本嘅時候喺背景自動下載，唔使等就可以安裝。",
  ],
  autoUpdateToggleLabel: ["Auto-download", "自動下載"],
  contextLengthLabel: ["Context length", "上下文長度"],
  contextLengthExplain: [
    "How much of your conversation local models can remember and use when generating a response. A restart of the running model is needed for a change to take effect.",
    "本地模型記得幾多對話內容，用嚟生成回應。改咗要重新啟動個模型先生效。",
  ],
  restartNotice: [
    "Applies the next time this model starts.",
    "個模型下次啟動先套用。",
  ],
  resetGeneralBtn: ["Reset general settings", "還原一般設定"],
  resetGeneralExplain: [
    "Puts model location, network exposure, auto-update and context length back to their shipped defaults.",
    "將模型位置、網絡開放、自動更新同上下文長度還原做出廠設定。",
  ],

  // --- Language & voice card --------------------------------------------
  langVoiceTitle: ["Language & voice", "語言同聲音"],
  langVoiceSub: [
    "How the app talks to you: written text, and — if you turn it on — spoken narration.",
    "個 app 點同你講嘢：文字，同埋（如果你開咗）講出嚟嘅聲。",
  ],
  langModeLabel: ["Language mode", "語言模式"],
  langModeExplain: [
    "English, playful Hong Kong-style Cantonese, or both together. Applies to every dialog, notification and message across the whole app.",
    "英文、香港式抵死廣東話，定係兩樣一齊嚟。成個 app 嘅對話框、通知同訊息都會跟。",
  ],
  langModeEnglish: ["English", "英文"],
  langModeCantonese: ["Cantonese", "廣東話"],
  langModeBoth: ["Both", "兩種都要"],
  funnyEnLabel: ["English funny level", "英文抵死程度"],
  funnyEnExplain: [
    "How playful English copy gets, from fully professional to maximum fun. Facts (file names, numbers, errors) never change — only the voice around them.",
    "英文文案有幾抵死，由專業到盡地一鋪都得。事實（檔案名、數字、錯誤）永遠唔變——淨係語氣變。",
  ],
  funnyYueLabel: ["Cantonese funny level", "廣東話抵死程度"],
  funnyYueExplain: [
    "How playful Cantonese copy gets, independently of the English slider.",
    "廣東話文案有幾抵死，同英文個掣分開調。",
  ],
  funnyLevel0: ["Fully serious", "正正經經"],
  funnyLevel1: ["Reserved", "收斂啲"],
  funnyLevel2: ["Balanced", "中規中矩"],
  funnyLevel3: ["Playful", "幾抵死"],
  funnyLevel4: ["Maximum fun", "盡地一鋪"],
  narratorTitle: ["Spoken narrator", "講嘢功能"],
  narratorOnLabel: ["Narrator", "讀出通知"],
  narratorOnExplain: [
    "Reads app events out loud using your operating system's text-to-speech voices. Off by default — nothing speaks until you turn this on.",
    "用你部機嘅語音朗讀個 app 嘅事件。預設係關嘅——你唔開佢就唔會出聲。",
  ],
  narratorOnToggleLabel: ["Narrator", "讀出通知"],
  narratorLangLabel: ["Narrated language", "朗讀語言"],
  narratorLangExplain: [
    "Which language narration speaks in. \"Both\" speaks English, then Cantonese, one after the other — never at the same time.",
    "朗讀用邊種語言。「兩種都要」會先講英文，再講廣東話——唔會同時講。",
  ],
  narratorVoiceEnLabel: ["English voice", "英文聲線"],
  narratorVoiceEnExplain: [
    "Which installed voice reads English narration. \"Choose automatically\" lets the app pick the best available English voice for you.",
    "邊個裝咗嘅聲線讀英文。「自動揀」會俾個 app 幫你揀個最啱嘅英文聲。",
  ],
  narratorVoiceYueLabel: ["Cantonese voice", "廣東話聲線"],
  narratorVoiceYueExplain: [
    "Which installed voice reads Cantonese narration. \"Choose automatically\" prefers a real Hong Kong Cantonese (zh-HK) voice when one is installed.",
    "邊個裝咗嘅聲線讀廣東話。「自動揀」會優先用返個真香港粵語（zh-HK）聲，如果裝咗嘅話。",
  ],
  narratorAutoOption: ["Choose automatically", "自動揀"],
  narratorNotInstalled: [
    "This voice isn't installed on this computer anymore — falling back to automatic.",
    "呢個聲線喺呢部機已經冇裝喇——改用自動揀。",
  ],
  narratorUnsupported: [
    "This browser build has no speech synthesis available at all.",
    "呢個版本完全冇語音合成功能。",
  ],
  narratorRateLabel: ["Speaking rate", "講嘢速度"],
  narratorRateExplain: [
    "How fast the chosen voice speaks, as a multiple of its own normal speed.",
    "揀咗嘅聲線講幾快，係佢正常速度嘅幾多倍。",
  ],
  narratorPreviewBtn: ["Preview", "試聽"],
  narratorPreviewPhraseEn: [
    "This is Material Ollama's narrator.",
    "This is Material Ollama's narrator.",
  ],
  narratorPreviewPhraseYue: [
    "呢個係 Material Ollama 嘅讀嘢聲。",
    "呢個係 Material Ollama 嘅讀嘢聲。",
  ],

  // --- School mode card --------------------------------------------------
  schoolTitle: ["School mode", "校園模式"],
  schoolSub: [
    "A self-imposed speed bump, not a security boundary. It forces English, and turns Cantonese, funny levels, personal vocabulary and the dim sum surprise off — everywhere in the app.",
    "呢個係俾自己嘅減速丘，唔係安全防線。開咗會逼用英文，廣東話、抵死程度、個人詞彙同點心驚喜全部——成個 app 都會——關埋。",
  ],
  schoolOnLabel: ["School mode", "校園模式"],
  schoolOnExplain: [
    "When on, every screen switches to English only, and Cantonese, funny-level styling, personal vocabulary and the dim sum surprise behave as if they were never installed. Turning it off needs the PIN below.",
    "開咗嘅話，成個介面淨係用英文，廣東話、抵死程度、個人詞彙同點心驚喜就好似冇裝過咁。閂返要用下面個 PIN。",
  ],
  schoolOnToggleLabel: ["School mode", "校園模式"],
  schoolNameLabel: ["Mode name", "模式個名"],
  schoolNameExplain: [
    "Renames \"School mode\" everywhere it's shown in the app — labels, descriptions and search all use your chosen name instead of the shipped one.",
    "將「校園模式」成個 app 顯示嘅名都改咗——標籤、描述同搜尋都會用返你揀嘅名，唔用返出廠個名。",
  ],
  schoolNamePlaceholder: ["School mode", "校園模式"],
  schoolPinLabel: ["Unlock PIN", "解鎖 PIN"],
  schoolPinExplain: [
    "The PIN needed to turn School mode back off once it's on. This is a UX lock, not encryption — clearing this app's local data resets it, by design.",
    "校園模式開咗之後，閂返要用嘅 PIN。呢個係體驗鎖，唔係加密——刪走個 app 嘅本機資料就會重設，呢個係故意咁設計。",
  ],
  schoolPinPlaceholder: ["At least 4 characters", "最少 4 個字符"],
  schoolPinSetBtn: ["Set PIN", "設定 PIN"],
  schoolPinChangeBtn: ["Change PIN", "改 PIN"],
  schoolPinClearBtn: ["Clear PIN", "清走 PIN"],
  schoolPinSetStatus: ["A PIN is set.", "已經設定咗 PIN。"],
  schoolPinUnsetStatus: ["No PIN set yet.", "仲未設定 PIN。"],
  schoolPinTooShort: ["PIN must be at least 4 characters.", "PIN 最少要 4 個字符。"],
  schoolPinSaveFailed: ["Couldn't save that PIN. Try again.", "個 PIN 儲唔到，再試多次。"],
  schoolPinSaved: ["PIN saved.", "PIN 已經儲咗。"],
  schoolPinCleared: ["PIN cleared.", "PIN 已經清走。"],
  schoolCannotDisable: [
    "Set a PIN before turning School mode on, so you can turn it back off again.",
    "開校園模式之前要先設定 PIN，咁樣先閂得返。",
  ],

  // --- Appearance card -----------------------------------------------------
  appearanceTitle: ["Appearance", "外觀"],
  appearanceSub: [
    "Colour, shape and identity — applied live as you change it, and saved for next time.",
    "顏色、形狀同身份——即改即用，下次開返都會記得。",
  ],
  seedLabel: ["Seed colour", "主色"],
  seedExplain: [
    "The one colour every other colour in the app is generated from — primary, containers, tints, all of it.",
    "成個 app 其他顏色都係由呢個主色推算出嚟嘅——主色、容器色、色調，全部都係。",
  ],
  seedSwatchLabel: ["Use this seed colour", "揀呢個做主色"],
  seedHexLabel: ["Hex", "十六進制"],
  seedHexInvalid: [
    "Not a valid hex colour yet — keep typing or paste one like #4c57d6.",
    "仲未係有效嘅十六進制顏色——打多陣或者貼個好似 #4c57d6 咁嘅。",
  ],
  themeLabel: ["Theme", "主題"],
  themeExplain: [
    "Light, dark, or match the operating system automatically.",
    "淺色、深色，定係跟返作業系統自動切換。",
  ],
  themeLight: ["Light", "淺色"],
  themeDark: ["Dark", "深色"],
  themeAuto: ["Auto", "自動"],
  radiusLabel: ["Corner radius", "圓角幅度"],
  radiusExplain: [
    "How rounded cards, buttons and other surfaces are, from sharp to very round.",
    "卡片、掣同其他表面有幾圓，由方角到好圓都得。",
  ],
  appNameLabel: ["App display name", "App 顯示名稱"],
  appNameExplain: [
    "The name shown in the title bar and About screen. Preview only in this card for now — wiring it into the live title bar is a separate change.",
    "喺標題欄同關於畫面顯示嘅名。呢張卡淨係做預覽——駁去真正嘅標題欄要另一次改動。",
  ],
  appNamePlaceholder: ["Material Ollama", "Material Ollama"],
  appNameReset: ["Reset to \"Material Ollama\"", "還原做「Material Ollama」"],
  glyphLabel: ["Logo glyph", "標誌圖案"],
  glyphExplain: [
    "The glyph shown beside the app name. \"Brand mark\" is the project's real logo; every other option is a Material Symbol standing in for it.",
    "喺 app 個名旁邊顯示嘅圖案。「品牌標誌」係個項目真正嘅 logo；其他選項就係用 Material Symbol 頂替。",
  ],
  glyphBrand: ["Brand mark", "品牌標誌"],
  previewLabel: ["Preview", "預覽"],
  resetAppearanceBtn: ["Reset appearance", "還原外觀"],
  resetAppearanceExplain: [
    "Puts seed colour, theme, corner radius, app name and logo glyph back to their shipped defaults.",
    "將主色、主題、圓角幅度、App 名同標誌圖案還原做出廠設定。",
  ],

  // --- Infinite colour translator ------------------------------------------
  colorTranslatorTitle: ["Colour translator", "顏色轉換器"],
  colorTranslatorExplain: [
    "Drag inside the field or the hue strip, or type an exact value in any format — hex, RGB, HSL or OKLCH all stay in sync.",
    "喺色域度郁，或者掂色相條，又或者直接打個準確值——十六進制、RGB、HSL 定 OKLCH，全部都會同步。",
  ],
  fieldLabel: ["Saturation and brightness", "飽和度同明度"],
  hueLabel: ["Hue", "色相"],
  hexFieldLabel: ["Hex", "十六進制"],
  rgbFieldLabel: ["RGB", "RGB"],
  hslFieldLabel: ["HSL", "HSL"],
  oklchFieldLabel: ["OKLCH", "OKLCH"],
  activeSpaceLabel: ["Editing in", "而家用緊"],
  contrastLabel: ["Contrast", "對比度"],
  contrastVsWhite: ["vs. white text", "同白色文字對比"],
  contrastVsBlack: ["vs. black text", "同黑色文字對比"],
  contrastPass: ["Passes WCAG AA (4.5:1)", "過到 WCAG AA（4.5:1）"],
  contrastFail: ["Fails WCAG AA (4.5:1)", "未過 WCAG AA（4.5:1）"],
  useAsSeedBtn: ["Use as seed colour", "設做主色"],
  rChannel: ["R", "R"],
  gChannel: ["G", "G"],
  bChannel: ["B", "B"],
  hChannel: ["H", "H"],
  sChannel: ["S", "S"],
  lChannel: ["L", "L"],

  // --- Data & privacy card -------------------------------------------------
  dataPrivacyTitle: ["Data & privacy", "資料同私隱"],
  dataPrivacySub: [
    "Everything on this screen is stored locally on this machine. Nothing here is sent anywhere else.",
    "呢版嘅嘢全部都係喺呢部機本機儲存，唔會送去第度。",
  ],
  localOnlyLabel: ["Local-only storage", "淨係本機儲存"],
  localOnlyExplain: [
    "Preferences are saved to this app's own local database and read back through its own API — no analytics, no telemetry, no cloud sync of settings.",
    "設定會儲喺呢個 app 自己嘅本機資料庫，透過自己嘅 API 讀返嚟——冇分析、冇遙測，設定都唔會雲端同步。",
  ],
  exportLabel: ["Export preferences", "匯出設定"],
  exportExplain: [
    "Downloads every preference on this screen as one JSON file, so you can inspect or back it up.",
    "將呢版所有設定匯出做一個 JSON 檔案，俾你查閱或者備份。",
  ],
  exportBtn: ["Export as JSON", "匯出做 JSON"],
  exportedFact: ["Exported.", "匯出咗喇。"],
  resetAllLabel: ["Reset everything", "全部還原"],
  resetAllExplain: [
    "Puts every preference on this screen — language, appearance, narrator, School mode, schedules, all of it — back to its shipped default. This does not touch model location, network exposure, auto-update or context length; use General's own reset for those.",
    "將呢版所有設定——語言、外觀、讀嘢功能、校園模式、時間表，全部——還原做出廠設定。呢個唔會影響模型位置、網絡開放、自動更新或者上下文長度；嗰啲用返「一般」自己嗰個還原掣。",
  ],
  resetAllBtn: ["Reset everything", "全部還原"],

  // --- Advanced card / scheduled settings -----------------------------------
  advancedTitle: ["Advanced", "進階"],
  advancedSub: [
    "Scheduled settings changes and endpoint status.",
    "定時設定變更同伺服器狀態。",
  ],
  scheduleLabel: ["Scheduled settings", "定時設定"],
  scheduleExplain: [
    "Automatically apply a setting at a time you choose — for example, switch to dark theme every evening.",
    "揀個時間，自動幫你套用某個設定——譬如話，每晚自動轉做深色主題。",
  ],
  scheduleTimeLabel: ["Time", "時間"],
  scheduleKindLabel: ["Action", "動作"],
  scheduleKindDark: ["Switch to dark theme", "轉做深色主題"],
  scheduleKindLight: ["Switch to light theme", "轉做淺色主題"],
  scheduleKindSchoolOn: ["Turn School mode on", "開校園模式"],
  scheduleAddBtn: ["Add rule", "加條規則"],
  scheduleRemoveBtn: ["Remove rule", "刪走規則"],
  scheduleEmpty: [
    "No scheduled rules yet.",
    "仲未有定時規則。",
  ],
  scheduleRuleFact: ["At", "喺"],
  endpointsLabel: ["Configured endpoints", "已設定伺服器"],
  endpointsExplain: [
    "The Ollama-compatible servers this app knows about, and which one is active. Managed elsewhere — shown here read-only.",
    "呢個 app 識嘅 Ollama 相容伺服器，同邊個而家用緊。呢度淨係顯示，唔係度改。",
  ],
  endpointsEmpty: [
    "Only the default local Ollama server is configured.",
    "淨係設定咗預設嘅本機 Ollama 伺服器。",
  ],
  endpointActiveFact: ["active", "用緊"],
} as const)

declare module "../../uh/dict/registry" {
  interface DictRegistry {
    settingsUi: (typeof settingsUiDict)["dict"]
  }
}
