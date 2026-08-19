import { defineDict } from "@/uh"

/**
 * The for-fun toy lock system's bilingual strings. Colocated here (rather
 * than under src/uh/dict/**) because this lane's allowed paths don't reach
 * that directory -- the same accepted shape RegexBuilder.tsx already
 * documents for itself. Any component in this folder that calls
 * `useT("locks")` must first `import "./locks.dict"` (or import anything
 * from this module) so the namespace is registered before the hook reads
 * it; module evaluation order guarantees that as long as the import
 * appears at the top of the file, before render ever runs.
 *
 * The `dish*` keys must stay in sync with `DISH_KEYS` in
 * `../../uh/locksLadder.ts` -- that module only ever hands back the KEY
 * (never translated text), so the dim-sum rung's presentation layer
 * (`UnlockLadder.tsx`) is what turns a key into bilingual text via this
 * dictionary. Dish names are rendered through Txt's `label` channel (never
 * `copy`), matching the shared instructions' "the dish's names stay
 * factual at every funny level... humour styles the copy around the code
 * name, never the dish itself".
 */
export const locksDict = defineDict("locks", {
  // Context menu
  lockThisElement: ["Lock this element…", "鎖住呢樣嘢…"],
  unlockElement: ["Unlock…", "解鎖…"],
  removeLock: ["Remove lock…", "拆咗個鎖…"],
  lockedBadge: ["Locked", "鎖住咗"],

  // Wizard
  // `t()` never interpolates -- see ../../uh/t.ts, it hands back exactly
  // the stored en/yue string, nothing more. So a dynamic element label
  // never lives inside a dict string; instead the label-bearing surfaces
  // below render this verb alone, then the real label as its own
  // `<Txt channel="fact">` sibling (see LockWizard.tsx / UnlockPrompt.tsx).
  wizardTitleLock: ["Lock", "鎖住"],
  toyDisclaimer: [
    "This is just for fun — not security, not encryption, and no protection from anyone else with this computer.",
    "呢個純粹玩吓啫——唔係保安,唔係加密,亦都擋唔到用緊呢部機嘅其他人。",
  ],
  toyRecoveryNote: [
    "Forget it and you recover by deleting this app's local data folder:",
    "唔記得咗嘅話,刪咗呢個 app 嘅本機資料夾就得:",
  ],
  presetsHeading: ["Or start from a preset", "又或者揀個現成款"],
  presetQuickPassword: ["Quick password lock", "快手密碼鎖"],
  presetQuickPasswordDetail: [
    "Sets method: password, duration: while this stays open.",
    "設定方式：密碼,時限：呢版面開住嗰陣。",
  ],
  presetSessionTotp: ["Session code lock", "本次登入驗證碼鎖"],
  presetSessionTotpDetail: [
    "Sets method: authenticator code, duration: until this app closes.",
    "設定方式：驗證碼,時限：直至個 app 閂咗。",
  ],
  presetTimedPassword: ["15-minute password lock", "15 分鐘密碼鎖"],
  presetTimedPasswordDetail: [
    "Sets method: password, duration: 15 minutes.",
    "設定方式：密碼,時限：15 分鐘。",
  ],
  methodLabel: ["Method", "方式"],
  methodPassword: ["Password", "密碼"],
  methodTotp: ["Authenticator code", "驗證碼"],
  passwordLabel: ["Password", "密碼"],
  passwordConfirmLabel: ["Confirm password", "確認密碼"],
  passwordMismatch: ["Those two don’t match.", "兩次打嘅唔一樣喎。"],
  passwordTooShort: ["Needs at least 4 characters.", "起碼要4個字。"],
  totpSecretLabel: ["Pairing secret (for your own records)", "配對密碼（自己記低）"],
  totpSecretNote: [
    "This is stored on this machine so the code can be checked locally. Copy it to your own authenticator app if you also want it there.",
    "呢個存喺呢部機到,方便本機驗證。想喺自己嘅驗證器 app 都用得,就自己抄低啦。",
  ],
  durationLabel: ["Unlock duration", "解鎖時限"],
  durationSurface: ["While this stays open", "呢版面開住嗰陣"],
  durationMinutes: ["For 15 minutes", "15 分鐘"],
  durationUntilClose: ["Until this app closes", "直至個 app 閂咗"],
  createButton: ["Create lock", "整個鎖"],
  cancelButton: ["Cancel", "算數"],

  // Unlock prompt
  unlockTitleUnlock: ["Unlock", "解鎖"],
  passwordFieldLabel: ["Password", "密碼"],
  codeFieldLabel: ["6-digit code", "6位數字碼"],
  unlockButton: ["Unlock", "解鎖"],
  wrongCredential: ["That didn’t match.", "唔啱喎。"],
  waitingBody: ["Too many wrong tries. Waiting it out — or play a bit instead.", "試錯太多次,要等陣——又或者玩吓先。"],
  playInstead: ["Play instead of waiting", "玩吓等，唔使死等"],
  clockRemaining: ["Time left", "仲有"],

  // Ladder
  ladderIntro: [
    "Winning clears the wait, not the lock — you’ll still need the real password or code after.",
    "贏咗淨係唔使再等,個鎖自己係要用返真密碼或者驗證碼解嘅。",
  ],
  dimsumQuestionLabel: ["Which dish is this?", "呢款係咩點心？"],
  sumsQuestionLabel: ["Ten easy sums — get every one right.", "十條簡單加減——全部要啱先過關。"],
  sumsSubmit: ["Check answers", "睇吓啱唔啱"],
  moleIntroLabel: ["Whack the moles before time’s up.", "計時內快啲打田鼠。"],
  moleTargetLabel: ["Target hits", "目標次數"],
  moleScoreLabel: ["Hits", "打中"],
  clockOnlyBody: [
    "No more games this round — just the clock now.",
    "呢輪冇得玩喇——淨係計時等。",
  ],
  ladderWrongTryAgain: ["Not quite — try the next one.", "唔啱呀——玩多鋪。"],
  ladderBudgetExhausted: [
    "Played through the wait limit for this hour — the clock is the only way through now.",
    "呢個鐘頭嘅遊戲次數用晒喇——而家淨係可以等。",
  ],
  ladderCleared: [
    "Wait cleared! Now enter the real password or code.",
    "唔使等喇！而家打返真密碼或者驗證碼。",
  ],

  // Lock manager
  manageLocksTitle: ["Locks", "啲鎖"],
  searchLabel: ["Search locks", "搵鎖"],
  searchPlaceholder: ["Search by name…", "打個名搵吓…"],
  emptyState: ["No locks yet — right-click anything and lock it, just for fun.", "重未有鎖——右掣揀樣嘢鎖住,純粹玩吓。"],
  selectAllLabel: ["Select all unlocked", "揀晒未鎖嗰啲"],
  bulkRemoveButton: ["Remove selected", "拆咗揀咗嗰啲"],
  bulkRemoveConfirmTitle: ["Remove these locks?", "拆咗呢啲鎖？"],
  bulkRemoveConfirmBody: [
    "This removes the toy lock from every selected element. It only removes locks you’ve already unlocked.",
    "呢個會拆晒揀咗嗰啲元素嘅玩具鎖,不過只限已經解咗鎖嗰啲。",
  ],
  columnElement: ["Element", "元素"],
  columnMethod: ["Method", "方式"],
  columnStatus: ["Status", "狀態"],
  statusLocked: ["Locked", "鎖住咗"],
  statusUnlocked: ["Unlocked", "已解鎖"],
  statusWaiting: ["Waiting out a lockout", "喺度等緊"],
  removeOneButton: ["Remove", "拆咗"],
  historyHeading: ["Lock history", "鎖嘅歷史"],
  historyEmpty: ["Nothing recorded yet.", "重未有紀錄。"],
  historySearchLabel: ["Search history", "搵歷史"],
  exportHistoryButton: ["Export as text", "匯出做文字"],
  historyActionCreated: ["created", "整咗"],
  historyActionRemoved: ["removed", "拆咗"],
  historyActionUnlocked: ["unlocked", "解咗鎖"],
  historyActionFailedAttempt: ["wrong try", "試錯"],
  historyActionLadderCleared: ["played through wait", "玩到唔使等"],

  // Dim-sum rung dish names -- keys must exactly match `DISH_KEYS` in
  // ../../uh/locksLadder.ts. Rendered via Txt's `label` channel (never
  // `copy`): a dish's own name stays factual at every funny level, per
  // this repository's shared dim-sum instructions.
  dishHarGow: ["Har gow", "蝦餃"],
  dishSiuMai: ["Siu mai", "燒賣"],
  dishCharSiuBao: ["Char siu bao", "叉燒包"],
  dishEggTart: ["Egg tart", "蛋撻"],
  dishTurnipCake: ["Turnip cake", "蘿蔔糕"],
  dishRiceRoll: ["Rice roll", "腸粉"],
  dishSpringRoll: ["Spring roll", "春卷"],
  dishCustardBun: ["Custard bun", "奶皇包"],
} as const)

declare module "@/uh/dict/registry" {
  interface DictRegistry {
    locks: (typeof locksDict)["dict"]
  }
}
