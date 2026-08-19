import { defineDict } from "@/uh"

/**
 * Copy for AuthenticatorSection, TotpAccountRow and PairingDialog --
 * everything `src/uh/dict/tools.dict.ts` (outside this lane's allowed
 * paths) doesn't already carry. That file's `authenticator`, `acctName`,
 * `acctSecret`, `pair`, and `totpHonest` keys are reused directly.
 */
export const authenticatorDict = defineDict("authenticator", {
  addAccount: ["Add account", "加個帳戶"],
  noAccounts: [
    "No paired accounts yet. Add one to see a real, live RFC 6238 code.",
    "未配對過帳戶。加一個就有真 TOTP code。",
  ],
  loadingAccounts: ["Loading accounts…", "讀緊帳戶…"],
  algorithmLabel: ["Algorithm", "演算法"],
  digitsLabel: ["Digits", "位數"],
  periodLabel: ["Period (seconds)", "週期（秒）"],
  previewPairing: ["Preview pairing", "預覽配對"],
  confirmPairing: ["Confirm & store secret", "確認同儲存秘密"],
  cancelPairing: ["Cancel", "取消"],
  pairingDialogTitle: ["Pair a new authenticator", "配對新驗證器"],
  pairingDialogIntro: [
    "Scan the QR with any RFC 6238 authenticator app, or copy the secret below by hand. This secret is shown once and is never written to disk in plain text — confirming stores it in this computer's own credential vault.",
    "用任何識 RFC 6238 嘅驗證器 App 掃呢個 QR，或者手打落面個秘密。呢個秘密淨係顯示一次，唔會以明文寫落硬碟——撳確認先會存入呢部電腦自己嘅密鑰庫。",
  ],
  revealSecret: ["Reveal secret", "顯示秘密"],
  hideSecret: ["Hide secret", "收埋秘密"],
  copySecret: ["Copy secret", "複製秘密"],
  copiedSecret: ["Secret copied to clipboard.", "秘密已複製。"],
  secretHiddenNotice: [
    "The secret stays hidden until you choose to reveal it, and this build never writes it to a log, an export, or history.",
    "秘密預設收埋，撳先顯示；呢個 build 唔會將佢寫落 log、匯出或歷史紀錄。",
  ],
  qrAltText: ["Scannable QR code pairing this authenticator secret", "可以掃嘅配對 QR code"],
  deleteAccountTitle: ["Remove this account?", "移除呢個帳戶？"],
  deleteAccountBody: [
    "This deletes the account and its secret from this computer's credential vault. If you haven't paired this authenticator with anything else, you will lose access to codes for it — do this only after removing it from wherever it was used.",
    "呢個會將帳戶同秘密由呢部機嘅密鑰庫度刪走。如果冇喺第二度都配過，就會攞唔返 code——做呢步之前，記得先喺用緊嗰邊移除。",
  ],
  deleteAccountAction: ["Remove account", "移除帳戶"],
  secretMissingWarning: [
    "This account's metadata survived without its stored secret. Remove it and pair again.",
    "呢個帳戶得返資料，冇咗秘密。移除再配過啦。",
  ],
  clockSkewWarning: [
    "This computer's clock looks off, which can make codes get rejected. Check the system date, time and timezone.",
    "呢部機個鐘好似唔準，code 可能會被拒。查吓系統日期、時間同時區。",
  ],
  secondsRemainingLabel: ["{n}s left", "重有 {n} 秒"],
  errorRetry: ["Try again", "再試一次"],
  nameFieldPlaceholder: ["e.g. GitHub, Google, work VPN…", "例如 GitHub、Google、公司 VPN…"],
  nameRequired: ["Account name is required.", "一定要打帳戶名。"],
  copyFailed: [
    "Could not copy automatically — select the secret text above and copy it by hand.",
    "自動複製唔到——揀返上面個秘密文字自己複製啦。",
  ],
} as const)

declare module "../../uh/dict/registry" {
  interface DictRegistry {
    authenticator: (typeof authenticatorDict)["dict"]
  }
}
