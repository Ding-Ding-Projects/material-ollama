/**
 * Real changelog entries -- copied verbatim (full SHA, author date, and
 * exact commit subject) from `git log --no-merges --date=short` on this
 * repository. There is no changelog backend yet (no `.github/workflows`
 * release has shipped from this worktree, and app/ui/release.go's
 * ReleaseInfo carries release identity, not a commit list), and this
 * lane's allowed paths don't cover adding one. Rather than inventing
 * placeholder entries -- explicitly forbidden by the changelog-viewer
 * contract -- this hand-copies real, independently verifiable commits:
 * every `sha` here resolves with `git show <sha>` in this repository and
 * with GitHub's own commit view at `commitUrl()` below. Regenerate by
 * re-running `git log --no-merges --date=short --pretty=format:'%H|%ad|%s'`
 * and copying the output in, newest first.
 */

export const CHANGELOG_REPO_URL = "https://github.com/Ding-Ding-Projects/material-ollama"

/**
 * The repository's own GitHub "homepage" field (verified with
 * `gh repo view Ding-Ding-Projects/material-ollama --json homepageUrl`) --
 * the landing/documentation site this desktop app is a companion to. Kept
 * here rather than fetched at runtime: it is a stable project fact, not
 * something that changes between builds, and the release-card link this
 * backs must keep working even when the app is fully offline. See the
 * site-homepage-link contract article for why this link exists on the
 * desktop-app surface specifically.
 */
export const PROJECT_HOMEPAGE_URL = "https://material-ollama-day-teet-hui.halowbak123.chatgpt.site"

export interface ChangelogEntry {
  /** Full 40-character commit SHA. */
  sha: string
  /** ISO date (YYYY-MM-DD), the commit's author date. */
  date: string
  /** The commit's exact subject line -- never paraphrased or invented. */
  subject: string
}

/** Newest first, matching `git log`'s own order. */
export const CHANGELOG_ENTRIES: readonly ChangelogEntry[] = [
  { sha: "e9fe509c3a2906b80ae33561962e94194a9930b9", date: "2026-08-19", subject: "Scope the icon resource per architecture so the arm64 link stops failing" },
  { sha: "43e8b92db9d1bdb3bdda75d45a03a0eb76f0ae07", date: "2026-08-19", subject: "Give 32 of the 85 inventory rows real evidence instead of null; three earn it outright" },
  { sha: "057357d116655930c0a1a9644d463480e129ca3f", date: "2026-08-19", subject: "Give the README a real capture matrix instead of a \"pending\" IOU" },
  { sha: "bebb46595b1fe5b87e71e2d786f68a089bd77459", date: "2026-08-19", subject: "Fix two Pascal comments that terminated early and aborted the installer build" },
  { sha: "8fafd65e911c73969eddfc7754f9be6cbb0f9248", date: "2026-08-19", subject: "Close the two gaps between having an app icon and shipping one" },
  { sha: "fdc2746aff266543b798ade5028b1b56f2924586", date: "2026-08-19", subject: "Capture all 9 real screens, and fix a misattached comment + a process-tree race" },
  { sha: "6a7dedafee9bfc6a1b8d2eec8823a5607a735615", date: "2026-08-19", subject: "Add the capture harness -- a -route flag, nine markers, and a tray-icon race nobody ordered" },
  { sha: "d25855114dcf79ddb9cd67cf39d34b5446d9012d", date: "2026-08-19", subject: "Add the suite inventory nobody wanted to admit was mostly empty" },
  { sha: "6cf81ecf86cfe9873fb1156838cb0ab7243bc605", date: "2026-08-19", subject: "app: give this fork its own face -- original mark, real multi-res .ico" },
  { sha: "932bb6961959c8d82327f67a098072a007731799", date: "2026-08-19", subject: "Add a file converter that actually converts files" },
  { sha: "e5ec3c45e961ec28905675201af82cad34026654", date: "2026-08-19", subject: "Add the real model catalog, and print the two 404s that prove it's real" },
  { sha: "e640fe9307046f9c3584a08fc7e19f661ad04208", date: "2026-08-19", subject: "Build the real Developer Tools screen: CLI<->GUI parity, config provenance, profiles" },
  { sha: "27f6e621b0bfc02d9ba1cb611d43315fa9085069", date: "2026-08-19", subject: "Build offline docs browser: 85 scaffolds, staging guard, embed backend, drawer UI" },
  { sha: "93eca1c1838c51d1727cef258c0e73282418d4b6", date: "2026-08-19", subject: "Make the inventory gate actually resolve evidence on disk, not just check for non-empty strings" },
  { sha: "db35e4829016f2258c4ea7e992b2e4be2a346ece", date: "2026-08-19", subject: "Note why ModelsScreen re-imports modelsUi.dict despite its children doing it too" },
  { sha: "b62c66ea78bcf8f24bdec3702f5e806ae7637379", date: "2026-08-19", subject: "Toolbox: ship the regex laboratory for real, leave converter/authenticator honest" },
  { sha: "f726d2ad9d57f12586b350c4bbb2b29a0a9a05dd", date: "2026-08-19", subject: "Give the Status screen something true to say" },
  { sha: "a9c8ee5a01a11d7fa813e0d0c075f217e988c42e", date: "2026-08-19", subject: "Add the real Launch screen: reconciled registry cards, a genuine console pop" },
  { sha: "758a07180f931b7fd6184446e58435004b63f686", date: "2026-08-19", subject: "Build the real Models screen: live hardware, real pull queue, no fake catalog" },
  { sha: "36f442e40fd694db27757051d084f38708bce76b", date: "2026-08-19", subject: "Give the TOTP prototype a spine: secrets move out of localStorage and into the vault" },
  { sha: "2ec6b92ee6cc572d70cd61c68437083688d09722", date: "2026-08-19", subject: "Split Vitest into node/dom projects; add real DOM tests for 3 components" },
  { sha: "eb99b266b5101a8ef3bc603676168e1284b375a6", date: "2026-08-18", subject: "Correct the handoff for the two lanes that landed after it was written" },
  { sha: "d273a50e7e89daa59d9537c633dc812cb90513b2", date: "2026-08-18", subject: "Wire the app shell: title bar, tab strip, nav rail, palette, notifications" },
  { sha: "77c65d25d252f68eb1e6143e5e92c9b55f0aa305", date: "2026-08-18", subject: "Preserve in-progress app shell work" },
  { sha: "3733a92958b06e827bfb2d6098d8a9fffa05e0cc", date: "2026-08-18", subject: "Finish the Docker container manager lane: real docker CLI, real GPU probing, no silent CPU fallback" },
  { sha: "9a297472a6a7ffb0ea72ceba0883169c7afe279d", date: "2026-08-18", subject: "Preserve in-progress Docker container manager work" },
  { sha: "14513fcc5b536427b95bf81368b1579270483b95", date: "2026-08-18", subject: "Add a handoff that says what actually exists" },
  { sha: "d7b9cc33adb42213b16f78f219c4e737a719b7e9", date: "2026-08-18", subject: "Give the model store a real backend: hardware snapshot, fit verdicts, a resumable pull queue" },
  { sha: "2dee1ddbce48b5d81ff3ba47541aee065ef00cde", date: "2026-08-18", subject: "Make the MD3 primitives agree with the real Icon component" },
  { sha: "ff1cf06285f24ade3c60d602a894356eecfdec3b", date: "2026-08-18", subject: "Add MD3 primitive components (Button through Badge), zero call sites" },
  { sha: "8a181b4625a8299aa3b1bccb36556a2f3d65a02c", date: "2026-08-18", subject: "Vendor Roboto/Roboto Mono + ship a 74-icon SVG sprite instead of the 3600-glyph ligature font" },
  { sha: "29a42c459cef3704576f210f9098da37e54e8206", date: "2026-08-18", subject: "Add UIPreferences (schema v17), SecretStore, and dedicated /uh/preferences routes" },
  { sha: "7911c9fcf9701708de4814bdcb873aad95d55c58", date: "2026-08-18", subject: "Add uh/ localization layer: branded Localized type, Txt boundary, dict registry, and an ESLint rule that finally objects to <div>Hello</div>" },
  { sha: "ec332753d3502537045e1309a081540f875f2889", date: "2026-08-18", subject: "Wire the MD3 token layer: one place to declare colours, one to map them, zero places to fake the maths" },
  { sha: "0cb8b8a5170fc5344de62b429539ed7e832516ac", date: "2026-08-18", subject: "Let the installer reach system PATH and clean up after itself on uninstall" },
  { sha: "58ba7e87c62f65c741277aa8c5b9e6811e32cc07", date: "2026-08-18", subject: "Stop the build from eating every oklch() colour" },
  { sha: "745fd9bcaabf579a99ef6f6e418367f4cf0a2499", date: "2026-08-18", subject: "Refresh landing surfaces for verified build 9" },
  { sha: "c96ab2617c9b9dc56eff63b06bdcb15868719ed1", date: "2026-08-18", subject: "Fix release code-name reuse detection" },
  { sha: "e768a8017c91abad4b4316019b2e7af616db0108", date: "2026-08-18", subject: "Print release source SHA literally" },
  { sha: "361bdb732d0600c05daed39b9ff3327250468f4b", date: "2026-08-18", subject: "Keep release metadata filename literal" },
  { sha: "711f067a32adc6ffb9ca5d7d358c73464e354e40", date: "2026-08-18", subject: "Publish verified release facts on landing surfaces" },
  { sha: "2810db036a0952f52bd2af06646587bed5909f6f", date: "2026-08-18", subject: "Upload uniquely staged release assets" },
  { sha: "6bd873e3ff801857cd2570c5d7bac27626f8beb9", date: "2026-08-18", subject: "Fix Windows provenance path comparison" },
  { sha: "5b2bca8c306dcde8bfa8892c1d2248a0306ea217", date: "2026-08-18", subject: "Return success after Windows tool bootstrap" },
  { sha: "c579406242792550a9705a943b327e07b558ebcd", date: "2026-08-18", subject: "Fix CLI status copy semantics" },
  { sha: "ff74b5b1ed42d7958f1a4909803eb52d7ebf2f20", date: "2026-08-18", subject: "Fix CLI configuration field context" },
  { sha: "2abfe21203217a0c413970a5ec324ca6b7c46398", date: "2026-08-18", subject: "Publish catalog-backed dim sum metadata in releases" },
  { sha: "6ee26d093941ea28f407b498f1f41754ddbf2ce4", date: "2026-08-18", subject: "Fix Windows tool marker path comparison" },
  { sha: "2e7b56bd776f3d9e1c6c7175dd260f38fe6a1898", date: "2026-08-18", subject: "Repair user-scoped Windows tool discovery" },
  { sha: "1112979727bc393495c53b74bd62f91c28a9258e", date: "2026-08-18", subject: "Harden landing site dependency chain" },
  { sha: "b27ed768dfa148791f4a833a773e09ee5579f800", date: "2026-08-18", subject: "Reuse verified newer 7-Zip packages in Windows bootstrap" },
  { sha: "7a0bc85bcc4bf9861fc3f0172fbbb7ac68fbb99b", date: "2026-08-18", subject: "Make Windows releases unsigned and uniquely published" },
  { sha: "f6068e0617ea15ba93874234e41db6b3f3bc90c4", date: "2026-08-18", subject: "Add hosted Material Ollama landing source" },
  { sha: "9a7e59953a733e5b405feac46b613613b68bc5f7", date: "2026-08-18", subject: "Add a guarded Codex CLI harness to the desktop" },
  { sha: "f6c70318cf3ba367d172672eb4779a7dbde9368f", date: "2026-08-18", subject: "Make landing evidence rows explicit" },
  { sha: "499d4e32f379e37ee0043a96eecc61dab5467026", date: "2026-08-18", subject: "Add fail-closed desktop and landing feature inventory" },
  { sha: "2373225eca3af66689108f353bcbfa99727254eb", date: "2026-08-18", subject: "Pin upstream Ollama and Codex CLI source checkouts" },
  { sha: "8e1089f9c103364c8f27ecfea4366e6f447e129b", date: "2026-08-18", subject: "Expose CLI parity registry and managed profiles" },
  { sha: "4e910fccfd223b9034ca21f72eeffa19b4460974", date: "2026-08-18", subject: "Add local-first landing site shell" },
  { sha: "d67ad83426633195089509347ffd4fe795120198", date: "2026-08-15", subject: "mlx update (#17761)" },
] as const

/** Builds a real, resolvable GitHub commit URL -- the changelog-viewer
 * contract's "every entry links its commit". */
export function commitUrl(sha: string): string {
  return `${CHANGELOG_REPO_URL}/commit/${sha}`
}

export function shortSha(sha: string): string {
  return sha.slice(0, 8)
}
