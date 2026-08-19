import clsx from "clsx"
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react"
import { Button } from "./Button"
import { Chip } from "./Chip"
import { Icon } from "./Icon"
import { ProgressBar } from "./ProgressBar"
import { FOCUS_RING_WITHIN } from "./tokens"
import { defineDict, Txt, useT } from "@/uh"

/**
 * The one regex builder every search field, filter dropdown and context
 * menu in the app opens (see `SearchField`'s `onOpenBuilder` and
 * `ContextMenu`'s `onOpenRegexBuilder`) — build/test/apply, entirely
 * client-side, nothing sent anywhere. This lane ships the primitive and
 * demonstrates it on the Toolbox screen; wiring it into every other call
 * site is later lanes' job.
 *
 * A content-heavy primitive is unusual in `components/md3/` — every
 * sibling here stays English-only chrome (see `SearchField`'s hardcoded
 * "Regex builder" title, `Chip`'s default "Remove"). This one owns real
 * bilingual copy instead, following the same "*.dict.ts colocated outside
 * `src/uh/**`" pattern `src/components/shell/shell.dict.ts` already
 * established for the shell — just inlined into this single file, since
 * this lane's allowed paths don't include a place to put a sibling
 * `*.dict.ts` next to `src/components/md3/`.
 */

const regexBuilderDict = defineDict("regexBuilder", {
  patternLabel: ["Pattern", "圖案"],
  patternPlaceholder: ["e.g. colou?r", "例如 colou?r"],
  flagsLabel: ["Flags", "旗仔"],
  flagGlobal: ["Global — find every match, not just the first", "Global——搵晒所有配對，唔係淨係頭一個"],
  flagIgnoreCase: ["Ignore case", "唔理大小寫"],
  flagMultiline: ["Multiline — ^ and $ match line boundaries", "Multiline——^ 同 $ 配行嘅頭尾"],
  flagDotAll: ["Dot-all — . also matches newlines", "Dot-all——. 都配到換行"],
  flagUnicode: ["Unicode — required for \\p{…} property escapes", "Unicode——用 \\p{…} 一定要開"],
  insertLabel: ["Insert a construct", "插個構件"],
  tokAnyChar: ["Any character .", "任何字符 ."],
  tokDigit: ["Digit \\d", "數字 \\d"],
  tokNonDigit: ["Non-digit \\D", "非數字 \\D"],
  tokWord: ["Word char \\w", "文字字符 \\w"],
  tokNonWord: ["Non-word \\W", "非文字字符 \\W"],
  tokWhitespace: ["Whitespace \\s", "空白 \\s"],
  tokNonWhitespace: ["Non-space \\S", "非空白 \\S"],
  tokCharClass: ["Character class [ ]", "字符類 [ ]"],
  tokNegClass: ["Negated class [^ ]", "反轉字符類 [^ ]"],
  tokStart: ["Start ^", "開頭 ^"],
  tokEnd: ["End $", "結尾 $"],
  tokWordBoundary: ["Word boundary \\b", "詞界 \\b"],
  tokNonWordBoundary: ["Non-boundary \\B", "非詞界 \\B"],
  tokGroup: ["Group ( )", "分組 ( )"],
  tokNonCapGroup: ["Non-capturing (?: )", "非捕獲組 (?: )"],
  tokNamedGroup: ["Named group (?<name> )", "命名組 (?<name> )"],
  tokAlternation: ["Alternation |", "或 |"],
  tokZeroOrMore: ["Zero or more *", "零次或以上 *"],
  tokOneOrMore: ["One or more +", "一次或以上 +"],
  tokOptional: ["Optional ?", "可有可無 ?"],
  tokRange: ["Repeat {n,m}", "重複 {n,m}"],
  tokLookahead: ["Lookahead (?= )", "前瞻 (?= )"],
  tokNegLookahead: ["Neg. lookahead (?! )", "反前瞻 (?! )"],
  tokLookbehind: ["Lookbehind (?<= )", "後顧 (?<= )"],
  tokNegLookbehind: ["Neg. lookbehind (?<! )", "反後顧 (?<! )"],
  tokHanScript: ["Han script \\p{Script=Han}", "漢字 \\p{Script=Han}"],
  sampleLabel: ["Test text", "測試文字"],
  samplePlaceholder: ["Paste or type text to test against…", "貼啲文字嚟試吓…"],
  evaluatingLabel: ["Evaluating…", "計緊…"],
  matchesLabel: ["Matches", "配對"],
  noMatches: ["No matches in the test text.", "測試文字度冇配對到。"],
  emptyMatch: ["(empty match)", "（冇嘢嘅配對）"],
  truncatedPrefix: ["Showing the first", "淨係顯示頭"],
  truncatedSuffix: ["matches.", "個配對。"],
  invalidPatternPrefix: ["Invalid pattern: ", "圖案有錯："],
  timeoutPrefix: ["Evaluation aborted after", "評估做咗"],
  timeoutSuffix: [
    "ms — this pattern is backtracking too hard against the current test text. Try a shorter sample or a tighter pattern.",
    "毫秒都未搞掂——呢個圖案同而家嘅測試文字撞埋一齊，回溯緊太耐。試吓縮短啲測試文字，或者揸實個圖案。",
  ],
  boundsPrefix: ["Pattern capped at", "圖案上限"],
  boundsMid1: ["characters, test text at", "個字，測試文字上限"],
  boundsMid2: ["characters, matches shown capped at", "個字，配對顯示上限"],
  boundsMid3: [". Evaluation aborts after", "個。評估喺"],
  boundsSuffix: ["ms to guard against runaway backtracking.", "毫秒後中止，咪俾回溯拖死呢個分頁。"],
  applyLabel: ["Apply to search", "用喺搜尋"],
  resetLabel: ["Reset", "重設"],
} as const)

declare module "../../uh/dict/registry" {
  interface DictRegistry {
    regexBuilder: (typeof regexBuilderDict)["dict"]
  }
}

type RegexBuilderDictKey = keyof (typeof regexBuilderDict)["dict"]

export type RegexFlagLetter = "g" | "i" | "m" | "s" | "u"

const FLAG_LETTERS: readonly RegexFlagLetter[] = ["g", "i", "m", "s", "u"]

const FLAG_LABEL_KEYS: Record<RegexFlagLetter, RegexBuilderDictKey> = {
  g: "flagGlobal",
  i: "flagIgnoreCase",
  m: "flagMultiline",
  s: "flagDotAll",
  u: "flagUnicode",
}

/** Bounds this lab enforces — pattern length, sample length, how many
 * matches it will ever render, and the wall-clock budget a single
 * evaluation gets before the worker running it is killed. All four are
 * shown in the UI (see `boundsPrefix`/`boundsMid1..3`/`boundsSuffix`
 * above) via `fact()`, not hand-typed into the translated sentence, so the
 * copy and the enforcement can never drift apart. */
export const REGEX_PATTERN_MAX_LENGTH = 200
export const REGEX_SAMPLE_MAX_LENGTH = 5000
export const REGEX_MAX_MATCHES = 500
export const REGEX_EVAL_TIMEOUT_MS = 300
const DEBOUNCE_MS = 150

interface InsertToken {
  id: string
  labelKey: RegexBuilderDictKey
  insert: string
  /** Selection range left active after inserting, relative to the
   * insertion point — lets a placeholder like "name" or "n,m" be typed
   * over immediately. Defaults to a caret at the end of the insert. */
  selectFrom?: number
  selectTo?: number
  requiresFlags?: RegexFlagLetter[]
}

const INSERT_TOKENS: readonly InsertToken[] = [
  { id: "any", labelKey: "tokAnyChar", insert: "." },
  { id: "digit", labelKey: "tokDigit", insert: "\\d" },
  { id: "nonDigit", labelKey: "tokNonDigit", insert: "\\D" },
  { id: "word", labelKey: "tokWord", insert: "\\w" },
  { id: "nonWord", labelKey: "tokNonWord", insert: "\\W" },
  { id: "whitespace", labelKey: "tokWhitespace", insert: "\\s" },
  { id: "nonWhitespace", labelKey: "tokNonWhitespace", insert: "\\S" },
  { id: "charClass", labelKey: "tokCharClass", insert: "[]", selectFrom: 1, selectTo: 1 },
  { id: "negClass", labelKey: "tokNegClass", insert: "[^]", selectFrom: 2, selectTo: 2 },
  { id: "start", labelKey: "tokStart", insert: "^" },
  { id: "end", labelKey: "tokEnd", insert: "$" },
  { id: "wordBoundary", labelKey: "tokWordBoundary", insert: "\\b" },
  { id: "nonWordBoundary", labelKey: "tokNonWordBoundary", insert: "\\B" },
  { id: "group", labelKey: "tokGroup", insert: "()", selectFrom: 1, selectTo: 1 },
  { id: "nonCapGroup", labelKey: "tokNonCapGroup", insert: "(?:)", selectFrom: 3, selectTo: 3 },
  { id: "namedGroup", labelKey: "tokNamedGroup", insert: "(?<name>)", selectFrom: 3, selectTo: 7 },
  { id: "alternation", labelKey: "tokAlternation", insert: "|" },
  { id: "zeroOrMore", labelKey: "tokZeroOrMore", insert: "*" },
  { id: "oneOrMore", labelKey: "tokOneOrMore", insert: "+" },
  { id: "optional", labelKey: "tokOptional", insert: "?" },
  { id: "range", labelKey: "tokRange", insert: "{n,m}", selectFrom: 1, selectTo: 4 },
  { id: "lookahead", labelKey: "tokLookahead", insert: "(?=)", selectFrom: 3, selectTo: 3 },
  { id: "negLookahead", labelKey: "tokNegLookahead", insert: "(?!)", selectFrom: 3, selectTo: 3 },
  { id: "lookbehind", labelKey: "tokLookbehind", insert: "(?<=)", selectFrom: 4, selectTo: 4 },
  { id: "negLookbehind", labelKey: "tokNegLookbehind", insert: "(?<!)", selectFrom: 4, selectTo: 4 },
  { id: "hanScript", labelKey: "tokHanScript", insert: "\\p{Script=Han}", requiresFlags: ["u"] },
]

interface RegexMatch {
  text: string
  index: number
  groups: (string | undefined)[]
}

type WorkerOutcome =
  | { ok: true; matches: RegexMatch[]; truncated: boolean }
  | { ok: false; message: string }

type EvalState =
  | { kind: "idle" }
  | { kind: "evaluating" }
  | { kind: "ok"; matches: RegexMatch[]; truncated: boolean }
  | { kind: "error"; message: string }
  | { kind: "timeout" }

// Runs entirely inside a Web Worker so a pasted catastrophic-backtracking
// pattern can never hang this tab: constructing a RegExp is always safe
// (it never runs the matching engine), but a single `.exec()` call is a
// synchronous native call the calling thread cannot interrupt once it has
// started — only `Worker#terminate()` from the OUTSIDE can recover from
// that. Zero backslashes in this source (pattern/flags/sample all arrive
// at runtime via postMessage), so it carries none of the string-escaping
// traps that bite hand-authored regex source.
const WORKER_SOURCE = `
self.onmessage = (event) => {
  const { pattern, flags, sample, maxMatches } = event.data
  try {
    const re = new RegExp(pattern, flags)
    const matches = []
    if (flags.includes("g")) {
      let match
      let guard = 0
      const guardLimit = maxMatches * 4 + 16
      while ((match = re.exec(sample)) !== null) {
        matches.push({ text: match[0], index: match.index, groups: Array.prototype.slice.call(match, 1) })
        if (match[0].length === 0) re.lastIndex += 1
        guard += 1
        if (matches.length >= maxMatches || guard >= guardLimit) break
      }
    } else {
      const single = re.exec(sample)
      if (single) matches.push({ text: single[0], index: single.index, groups: Array.prototype.slice.call(single, 1) })
    }
    self.postMessage({ ok: true, matches, truncated: matches.length >= maxMatches })
  } catch (err) {
    self.postMessage({ ok: false, message: err && err.message ? String(err.message) : String(err) })
  }
}
`

function runOnMainThread(pattern: string, flags: string, sample: string, maxMatches: number): WorkerOutcome {
  try {
    const re = new RegExp(pattern, flags)
    const matches: RegexMatch[] = []
    if (flags.includes("g")) {
      let match: RegExpExecArray | null
      let guard = 0
      const guardLimit = maxMatches * 4 + 16
      while ((match = re.exec(sample)) !== null) {
        matches.push({ text: match[0], index: match.index, groups: Array.from(match).slice(1) })
        if (match[0].length === 0) re.lastIndex += 1
        guard += 1
        if (matches.length >= maxMatches || guard >= guardLimit) break
      }
    } else {
      const single = re.exec(sample)
      if (single) matches.push({ text: single[0], index: single.index, groups: Array.from(single).slice(1) })
    }
    return { ok: true, matches, truncated: matches.length >= maxMatches }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Evaluates `pattern` against `sample` inside a fresh Blob-backed Worker,
 * with a hard wall-clock backstop: if the worker hasn't answered within
 * `timeoutMs` it is forcibly terminated and `"timeout"` is resolved. Falls
 * back to a bounded main-thread evaluator (no wall-clock backstop, only
 * the iteration guard) if `Worker` construction itself throws — a locked
 * -down environment losing the timeout protection is safer than the lab
 * simply not working at all.
 */
function runInWorker(
  pattern: string,
  flags: string,
  sample: string,
  maxMatches: number,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<WorkerOutcome | "timeout" | "aborted"> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (result: WorkerOutcome | "timeout" | "aborted") => {
      if (settled) return
      settled = true
      resolve(result)
    }

    let worker: Worker | null = null
    let url: string | null = null
    const cleanupWorker = () => {
      worker?.terminate()
      if (url) URL.revokeObjectURL(url)
    }
    const onAbort = () => {
      cleanupWorker()
      finish("aborted")
    }
    signal.addEventListener("abort", onAbort)

    try {
      const blob = new Blob([WORKER_SOURCE], { type: "application/javascript" })
      url = URL.createObjectURL(blob)
      worker = new Worker(url)

      const timer = window.setTimeout(() => {
        cleanupWorker()
        signal.removeEventListener("abort", onAbort)
        finish("timeout")
      }, timeoutMs)

      worker.onmessage = (event: MessageEvent<WorkerOutcome>) => {
        window.clearTimeout(timer)
        signal.removeEventListener("abort", onAbort)
        cleanupWorker()
        finish(event.data)
      }
      worker.onerror = (event: ErrorEvent) => {
        window.clearTimeout(timer)
        signal.removeEventListener("abort", onAbort)
        cleanupWorker()
        finish({ ok: false, message: event.message || "Worker evaluation failed." })
      }
      worker.postMessage({ pattern, flags, sample, maxMatches })
    } catch {
      signal.removeEventListener("abort", onAbort)
      finish(runOnMainThread(pattern, flags, sample, maxMatches))
    }
  })
}

export interface RegexBuilderProps {
  initialPattern?: string
  initialFlags?: string
  initialSample?: string
  /** Hands the built pattern and flags back to whatever opened this
   * builder. Required, never optional — a builder whose Apply action does
   * nothing is exactly the inert-control defect this project forbids, so
   * every consumer must wire a real destination. */
  onApply: (pattern: string, flags: string) => void
  className?: string
}

export interface RegexBuilderHandle {
  /** Scrolls the pattern field into view and focuses it — what a search
   * field's `.* ` affordance calls when it "opens the builder" and the
   * builder is already inline on the page rather than in an overlay. */
  focusPattern: () => void
}

export const RegexBuilder = forwardRef<RegexBuilderHandle, RegexBuilderProps>(function RegexBuilder(
  { initialPattern = "", initialFlags = "", initialSample = "", onApply, className },
  ref,
) {
  const t = useT("regexBuilder")
  const [pattern, setPattern] = useState(() => initialPattern.slice(0, REGEX_PATTERN_MAX_LENGTH))
  const [flags, setFlags] = useState(initialFlags)
  const [sample, setSample] = useState(() => initialSample.slice(0, REGEX_SAMPLE_MAX_LENGTH))
  const [state, setState] = useState<EvalState>({ kind: "idle" })

  const patternInputRef = useRef<HTMLInputElement>(null)
  const requestIdRef = useRef(0)
  const patternId = useId()
  const sampleId = useId()
  const statusId = useId()

  useImperativeHandle(
    ref,
    () => ({
      focusPattern: () => {
        patternInputRef.current?.scrollIntoView({ block: "center", behavior: "smooth" })
        patternInputRef.current?.focus()
      },
    }),
    [],
  )

  // Constructing a RegExp never runs the matching engine, so this is
  // always cheap and safe to do synchronously on every render — it is
  // what makes the Apply button's enabled state and the error line
  // instant, with no debounce lag, independent of the (debounced,
  // worker-backed) match evaluation below.
  const patternError = useMemo(() => {
    if (!pattern) return null
    try {
      // eslint-disable-next-line no-new
      new RegExp(pattern, flags)
      return null
    } catch (err) {
      return err instanceof Error ? err.message : String(err)
    }
  }, [pattern, flags])

  useEffect(() => {
    if (!pattern) {
      setState({ kind: "idle" })
      return
    }
    if (patternError) {
      setState({ kind: "error", message: patternError })
      return
    }
    const requestId = ++requestIdRef.current
    setState({ kind: "evaluating" })
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void runInWorker(pattern, flags, sample, REGEX_MAX_MATCHES, REGEX_EVAL_TIMEOUT_MS, controller.signal).then(
        (outcome) => {
          if (requestIdRef.current !== requestId) return
          if (outcome === "aborted") return
          if (outcome === "timeout") {
            setState({ kind: "timeout" })
            return
          }
          if (!outcome.ok) {
            setState({ kind: "error", message: outcome.message })
            return
          }
          setState({ kind: "ok", matches: outcome.matches, truncated: outcome.truncated })
        },
      )
    }, DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [pattern, flags, sample, patternError])

  const toggleFlag = useCallback((flag: RegexFlagLetter) => {
    setFlags((current) => (current.includes(flag) ? current.replace(flag, "") : current + flag))
  }, [])

  const insertToken = useCallback((token: InsertToken) => {
    const el = patternInputRef.current
    setPattern((current) => {
      const start = el?.selectionStart ?? current.length
      const end = el?.selectionEnd ?? current.length
      const next = (current.slice(0, start) + token.insert + current.slice(end)).slice(0, REGEX_PATTERN_MAX_LENGTH)
      const selFrom = Math.min(start + (token.selectFrom ?? token.insert.length), REGEX_PATTERN_MAX_LENGTH)
      const selTo = Math.min(start + (token.selectTo ?? token.insert.length), REGEX_PATTERN_MAX_LENGTH)
      requestAnimationFrame(() => {
        el?.focus()
        el?.setSelectionRange(selFrom, selTo)
      })
      return next
    })
    if (token.requiresFlags?.length) {
      setFlags((current) => {
        const set = new Set(current.split(""))
        for (const flag of token.requiresFlags ?? []) set.add(flag)
        return FLAG_LETTERS.filter((flag) => set.has(flag)).join("")
      })
    }
  }, [])

  const handleReset = useCallback(() => {
    setPattern("")
    setFlags("")
    setSample("")
    setState({ kind: "idle" })
    patternInputRef.current?.focus()
  }, [])

  const canApply = pattern.length > 0 && !patternError

  const handleApply = useCallback(() => {
    if (!canApply) return
    onApply(pattern, flags)
  }, [canApply, onApply, pattern, flags])

  function matchTitle(match: RegexMatch, position: number): string {
    const base = `#${position + 1} · index ${match.index}`
    if (match.groups.length === 0) return base
    const groups = match.groups.map((group) => (group === undefined ? "∅" : group)).join(", ")
    return `${base} · groups: ${groups}`
  }

  return (
    <div className={clsx("flex flex-col gap-4", className)}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={patternId} className="text-xs font-medium text-on-surface">
          {t("patternLabel")}
        </label>
        <div
          className={clsx(
            "flex items-center gap-1 rounded-[10px] border bg-surface-low px-3 py-2",
            patternError ? "border-error" : "border-outline-variant",
            FOCUS_RING_WITHIN,
          )}
        >
          <span aria-hidden="true" className="shrink-0 font-mono text-sm text-on-surface-variant">
            /
          </span>
          <input
            id={patternId}
            ref={patternInputRef}
            type="text"
            value={pattern}
            onChange={(event) => setPattern(event.target.value.slice(0, REGEX_PATTERN_MAX_LENGTH))}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            placeholder={t("patternPlaceholder")}
            aria-invalid={Boolean(patternError) || undefined}
            aria-describedby={statusId}
            className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-on-surface-variant"
          />
          <span aria-hidden="true" className="shrink-0 font-mono text-sm text-on-surface-variant">
            /{flags}
          </span>
        </div>
        <div role="group" aria-label={t("flagsLabel")} className="flex flex-wrap items-center gap-1.5">
          {FLAG_LETTERS.map((flag) => (
            <Chip
              key={flag}
              as="button"
              mono
              selected={flags.includes(flag)}
              onClick={() => toggleFlag(flag)}
              aria-label={t(FLAG_LABEL_KEYS[flag])}
              title={t(FLAG_LABEL_KEYS[flag])}
            >
              {flag}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-on-surface">{t("insertLabel")}</span>
        <div className="flex flex-wrap gap-1.5">
          {INSERT_TOKENS.map((token) => (
            <Chip key={token.id} as="button" mono onClick={() => insertToken(token)}>
              {t(token.labelKey)}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <label htmlFor={sampleId} className="text-xs font-medium text-on-surface">
            {t("sampleLabel")}
          </label>
          <span className="text-[11px] text-on-surface-variant">
            <Txt channel="fact" value={sample.length} kind="count" />/
            <Txt channel="fact" value={REGEX_SAMPLE_MAX_LENGTH} kind="count" />
          </span>
        </div>
        <textarea
          id={sampleId}
          value={sample}
          onChange={(event) => setSample(event.target.value.slice(0, REGEX_SAMPLE_MAX_LENGTH))}
          rows={4}
          spellCheck={false}
          placeholder={t("samplePlaceholder")}
          className={clsx(
            "min-h-[92px] w-full resize-y rounded-[10px] border border-outline-variant bg-surface-low px-3 py-2",
            "font-mono text-[13px] outline-none placeholder:text-on-surface-variant",
            FOCUS_RING_WITHIN,
          )}
        />
      </div>

      <div id={statusId} aria-live="polite" className="flex flex-col gap-2">
        {state.kind === "evaluating" ? <ProgressBar height={5} label={t("evaluatingLabel")} /> : null}

        {state.kind === "error" ? (
          <p className="rounded-[10px] bg-error-container px-3 py-2 text-[12.5px] text-on-error-container">
            <Icon name="error" size={14} className="mr-1 inline-block shrink-0 align-text-bottom" />
            <span className="font-medium">{t("invalidPatternPrefix")}</span>
            <Txt channel="fact" value={state.message} kind="user-input" />
          </p>
        ) : null}

        {state.kind === "timeout" ? (
          <p className="rounded-[10px] bg-error-container px-3 py-2 text-[12.5px] text-on-error-container">
            <Icon name="warning" size={14} className="mr-1 inline-block shrink-0 align-text-bottom" />
            {t("timeoutPrefix")} <Txt channel="fact" value={REGEX_EVAL_TIMEOUT_MS} kind="count" /> {t("timeoutSuffix")}
          </p>
        ) : null}

        {state.kind === "ok" ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-on-surface-variant">
              <Icon name="check_circle" size={14} className="shrink-0 text-primary" />
              <span>{t("matchesLabel")}</span>
              <Txt channel="fact" value={state.matches.length} kind="count" />
              {state.truncated ? (
                <span className="text-on-surface-variant">
                  · {t("truncatedPrefix")} <Txt channel="fact" value={REGEX_MAX_MATCHES} kind="count" />{" "}
                  {t("truncatedSuffix")}
                </span>
              ) : null}
            </div>
            {state.matches.length === 0 ? (
              <p className="text-[12.5px] text-on-surface-variant">
                <Txt ns="regexBuilder" k="noMatches" channel="copy" />
              </p>
            ) : (
              <div className="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto">
                {state.matches.map((match, index) => (
                  <Chip
                    key={`${match.index}-${index}`}
                    as="span"
                    mono
                    selected
                    tone="tertiary"
                    title={matchTitle(match, index)}
                    aria-label={matchTitle(match, index)}
                  >
                    {match.text.length > 0 ? <Txt channel="content">{match.text}</Txt> : t("emptyMatch")}
                  </Chip>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>

      <p className="text-[11px] text-on-surface-variant">
        {t("boundsPrefix")} <Txt channel="fact" value={REGEX_PATTERN_MAX_LENGTH} kind="count" /> {t("boundsMid1")}{" "}
        <Txt channel="fact" value={REGEX_SAMPLE_MAX_LENGTH} kind="count" /> {t("boundsMid2")}{" "}
        <Txt channel="fact" value={REGEX_MAX_MATCHES} kind="count" />
        {t("boundsMid3")} <Txt channel="fact" value={REGEX_EVAL_TIMEOUT_MS} kind="count" /> {t("boundsSuffix")}
      </p>

      <div className="flex items-center justify-end gap-2">
        <Button variant="text" size="sm" icon="restart_alt" onClick={handleReset}>
          {t("resetLabel")}
        </Button>
        <Button variant="filled" size="sm" icon="check_circle" disabled={!canApply} onClick={handleApply}>
          {t("applyLabel")}
        </Button>
      </div>
    </div>
  )
})
