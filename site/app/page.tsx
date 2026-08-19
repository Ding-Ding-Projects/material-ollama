'use client'

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type ReactNode } from 'react'
import { PAGES, ALL_FEATURES, ARTICLES, VERIFIED_RELEASE, type PageId, type ResolvedFeature } from '../lib/content'
import { present, t, tone, categoryLabel, emoji, type LanguageMode, type LangCtx, type ToneCtx } from '../lib/i18n'
import { deriveAccentTokens, clampRadius, DEFAULT_SEED_COLOR, DEFAULT_RADIUS } from '../lib/appearance'

export const dynamic = 'force-static'

type ThemeMode = 'dark' | 'light' | 'auto'
type TabDock = 'left' | 'right' | 'top' | 'bottom'
type Notice = { id: number; tone: 'info' | 'success' | 'warning'; title: string; detail: string }

type SiteState = {
  activeTab: PageId
  languageMode: LanguageMode
  funnyEnglish: number
  funnyCantonese: number
  showEmoji: boolean
  schoolMode: boolean
  schoolName: string
  theme: ThemeMode
  density: 'comfortable' | 'compact'
  seedColor: string
  radius: number
  tabDock: TabDock
  narratorEnabled: boolean
  narratorLanguage: 'english' | 'cantonese' | 'both'
  englishVoice: string
  cantoneseVoice: string
  narratorRate: number
  narratorPitch: number
  vocabularyLoaded: boolean
  scheduleEnabled: boolean
  externalSource: 'local' | 'https' | 'home-assistant'
  logoPreset: string
  customLogoLoaded: boolean
  selectedFeature: string
  notificationHistory: Notice[]
  history: string[]
}

const STORAGE_KEY = 'material-ollama-landing-settings-v3'

const DEFAULT_STATE: SiteState = {
  activeTab: 'overview', languageMode: 'english', funnyEnglish: 3, funnyCantonese: 3, showEmoji: true,
  schoolMode: false, schoolName: 'Focus mode', theme: 'dark', density: 'comfortable',
  seedColor: DEFAULT_SEED_COLOR, radius: DEFAULT_RADIUS, tabDock: 'left',
  narratorEnabled: false, narratorLanguage: 'both', englishVoice: 'auto', cantoneseVoice: 'auto', narratorRate: 1, narratorPitch: 1,
  vocabularyLoaded: false, scheduleEnabled: false, externalSource: 'local', logoPreset: 'default', customLogoLoaded: false,
  selectedFeature: '', notificationHistory: [], history: [],
}

function readState(): SiteState {
  if (typeof window === 'undefined') return DEFAULT_STATE
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null')
    return value && typeof value === 'object' ? { ...DEFAULT_STATE, ...value } : DEFAULT_STATE
  } catch {
    return DEFAULT_STATE
  }
}

function useSiteState() {
  const [state, setState] = useState<SiteState>(DEFAULT_STATE)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    setState(readState())
    setReady(true)
  }, [])
  useEffect(() => {
    if (ready) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state, ready])
  return [state, setState] as const
}

function ctxOf(state: SiteState): LangCtx {
  return { languageMode: state.languageMode, schoolMode: state.schoolMode }
}

function toneCtxOf(state: SiteState): ToneCtx {
  return { languageMode: state.languageMode, schoolMode: state.schoolMode, funnyEnglish: state.funnyEnglish, funnyCantonese: state.funnyCantonese }
}

// Opt-in, off-by-default narration through the browser's own Web Speech API. Nothing is fetched:
// the voices are whatever the operating system already ships. "Both" always speaks English, then
// Cantonese, strictly serialized, because a fresh `speak()` call queues after whatever the browser
// is still saying rather than talking over it.
function narrate(state: SiteState, english: string, cantonese: string) {
  if (!state.narratorEnabled) return
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  const synth = window.speechSynthesis
  synth.cancel()
  // "Installed system voice" explicitly picks the first voice this browser reports for that
  // language; "Choose automatically" leaves SpeechSynthesisUtterance.voice unset so the browser's
  // own default heuristic decides. This is the real, observable difference between the two menu
  // choices rather than two labels over one identical behaviour.
  const availableVoices = synth.getVoices()
  const pickVoice = (choice: string, lang: string) => {
    if (choice !== 'system' || availableVoices.length === 0) return undefined
    return availableVoices.find((voice) => voice.lang.toLowerCase().startsWith(lang.toLowerCase().slice(0, 2)))
  }
  const lines: Array<{ text: string; lang: string; voice?: SpeechSynthesisVoice }> = []
  if (state.narratorLanguage === 'english' || state.narratorLanguage === 'both') lines.push({ text: english, lang: 'en-US', voice: pickVoice(state.englishVoice, 'en-US') })
  if (state.narratorLanguage === 'cantonese' || state.narratorLanguage === 'both') lines.push({ text: cantonese, lang: 'zh-HK', voice: pickVoice(state.cantoneseVoice, 'zh-HK') })
  for (const line of lines) {
    const utterance = new SpeechSynthesisUtterance(line.text)
    utterance.lang = line.lang
    if (line.voice) utterance.voice = line.voice
    utterance.rate = state.narratorRate
    utterance.pitch = state.narratorPitch
    synth.speak(utterance)
  }
}

type CustomStyle = CSSProperties & Record<string, string | number>

// Resolves whether the page is actually rendering on a light surface right now: explicit Dark/Light
// answer immediately, "auto" tracks the device's live `prefers-color-scheme` and updates if the OS
// setting changes while the page is open. Used only to pick a readable accent tone — never to
// decide which CSS token block applies, which stays pure CSS per the stylesheet rules above.
function useIsLightSurface(theme: ThemeMode): boolean {
  const [systemLight, setSystemLight] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia('(prefers-color-scheme: light)')
    setSystemLight(mql.matches)
    const handler = (event: MediaQueryListEvent) => setSystemLight(event.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])
  if (theme === 'light') return true
  if (theme === 'dark') return false
  return systemLight
}

function RegexBuilder({ ctx, pattern, flags, sample, onPattern, onFlags, onSample, onApply }: {
  ctx: LangCtx
  pattern: string
  flags: string
  sample: string
  onPattern: (value: string) => void
  onFlags: (value: string) => void
  onSample: (value: string) => void
  onApply: () => void
}) {
  let result = t(ctx, 'regexEmptyPrompt')
  let invalid = false
  if (pattern) {
    try {
      const matches = sample.match(new RegExp(pattern, flags))
      result = matches ? `${present(ctx.languageMode, 'Preview matched', '預覽搵到', ctx.schoolMode)} ${matches.length} ${present(ctx.languageMode, matches.length === 1 ? 'segment.' : 'segments.', '個相符段落。', ctx.schoolMode)}` : t(ctx, 'regexNoMatches')
    } catch (error) {
      invalid = true
      result = `${t(ctx, 'regexErrorPrefix')} ${error instanceof Error ? error.message : 'invalid expression'}`
    }
  }
  return (
    <details className="regex-builder">
      <summary>{t(ctx, 'regexBuilderSummary')}</summary>
      <div className="regex-body">
        <p>{t(ctx, 'regexBuilderIntro')}</p>
        <label>
          {t(ctx, 'regexPatternLabel')}
          <input value={pattern} onChange={(event) => onPattern(event.target.value)} placeholder="model|config" />
        </label>
        <div className="two-fields">
          <label>
            {t(ctx, 'regexFlagsLabel')}
            <input value={flags} onChange={(event) => onFlags(event.target.value)} maxLength={6} />
          </label>
          <label>
            {t(ctx, 'regexSampleLabel')}
            <input value={sample} onChange={(event) => onSample(event.target.value)} />
          </label>
        </div>
        <p className={invalid ? 'inline-error' : 'inline-status'} aria-live="polite">{result}</p>
        <button className="button button-secondary" type="button" onClick={onApply}>{t(ctx, 'regexUseButton')}</button>
      </div>
    </details>
  )
}

// A real search field wired to a real, bounded item list. Typing filters locally (plain text by
// default, regex through the anchored builder); clicking a result performs its real action. This
// backs all four settings-page discovery scopes so none of them is a decorative no-op input.
type SearchItem = { id: string; label: string; detail: string; onSelect: () => void }

function ScopedSearch({ ctx, label, items }: { ctx: LangCtx; label: string; items: SearchItem[] }) {
  const [query, setQuery] = useState('')
  const [pattern, setPattern] = useState('')
  const [flags, setFlags] = useState('i')
  const [sample, setSample] = useState(items[0]?.label ?? '')
  const [regexActive, setRegexActive] = useState(false)
  const results = useMemo(() => {
    const trimmed = query.trim()
    if (!trimmed) return []
    try {
      const matcher = regexActive ? new RegExp(query, flags) : null
      return items
        .filter((item) => (matcher ? matcher.test(`${item.label} ${item.detail}`) : `${item.label} ${item.detail}`.toLocaleLowerCase().includes(trimmed.toLocaleLowerCase())))
        .slice(0, 6)
    } catch {
      return []
    }
  }, [query, items, regexActive, flags])
  return (
    <div className="search-control">
      <label>
        {label}
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t(ctx, 'scopedSearchPlaceholder')} />
      </label>
      <RegexBuilder ctx={ctx} pattern={pattern} flags={flags} sample={sample} onPattern={setPattern} onFlags={setFlags} onSample={setSample} onApply={() => { setQuery(pattern); setRegexActive(true) }} />
      <span className="field-help">{regexActive ? t(ctx, 'regexModeActive') : t(ctx, 'plainModeActive')}</span>
      {query.trim() && (
        results.length ? (
          <div className="mini-results">
            {results.map((item) => (
              <button key={item.id} type="button" className="mini-result" onClick={item.onSelect}>
                <strong>{item.label}</strong>
                <span>{item.detail}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="no-results-inline">{t(ctx, 'noLocalMatches')}</p>
        )
      )}
    </div>
  )
}

// Progressive-disclosure explanation. Collapsed by default; opening it reveals what the group of
// controls above it actually does, plus where its current values came from.
function Explain({ ctx, summary, children }: { ctx: LangCtx; summary?: string; children: ReactNode }) {
  return (
    <details className="explain-block">
      <summary>
        <span aria-hidden="true">ⓘ</span> {summary || present(ctx.languageMode, 'What does this control?', '呢啲控制項係做乜嘅？', ctx.schoolMode)}
      </summary>
      <div className="explain-body">{children}</div>
    </details>
  )
}

function FeatureCard({ ctx, feature, onOpen }: { ctx: LangCtx; feature: ResolvedFeature; onOpen: (id: string) => void }) {
  const title = present(ctx.languageMode, feature.title, feature.titleZh, ctx.schoolMode)
  const summary = present(ctx.languageMode, feature.summary, feature.summaryZh, ctx.schoolMode)
  return (
    <article className="feature-card" data-searchable={`${feature.title} ${feature.category} ${feature.summary}`}>
      <div className="card-top">
        <span className="tag">{categoryLabel(ctx, feature.category)}</span>
        <span className="feature-state">{t(ctx, 'siteEquivalent')}</span>
      </div>
      <h3>{title}</h3>
      <p>{summary}</p>
      <p className="feature-surface">{t(ctx, 'siteSurfaceLabel')}: {feature.surface}</p>
      <button className="text-link" type="button" onClick={() => onOpen(feature.id)}>
        {t(ctx, 'openFeatureRecord')} <span aria-hidden="true">→</span>
      </button>
    </article>
  )
}

function NoticeItem({ ctx, notice, onDismiss }: { ctx: LangCtx; notice: Notice; onDismiss: () => void }) {
  return (
    <article className={`notice notice-${notice.tone}`}>
      <div>
        <strong>{notice.title}</strong>
        <p>{notice.detail}</p>
      </div>
      <button className="icon-button" type="button" onClick={onDismiss} aria-label={`${t(ctx, 'dismiss')} ${notice.title}`}>×</button>
    </article>
  )
}

function NotificationCentre({ ctx, history, onClear, onClose }: { ctx: LangCtx; history: Notice[]; onClear: () => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])
  return (
    <div className="notif-panel" role="dialog" aria-label={t(ctx, 'notificationsPanelTitle')} ref={ref}>
      <div className="card-top">
        <span className="tag">{t(ctx, 'notificationsPanelTitle')}</span>
        <button className="icon-button" type="button" onClick={onClose} aria-label={t(ctx, 'notificationsPanelClose')}>×</button>
      </div>
      {history.length === 0 ? (
        <p className="no-results-inline">{t(ctx, 'notificationsPanelEmpty')}</p>
      ) : (
        <ul className="notif-list">
          {history.slice().reverse().map((notice) => (
            <li key={notice.id} className={`notif-item notif-${notice.tone}`}>
              <strong>{notice.title}</strong>
              <p>{notice.detail}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="field-help">{t(ctx, 'notificationsPanelFootnote')}</p>
      <button className="button button-secondary" type="button" onClick={onClear} disabled={history.length === 0}>
        {t(ctx, 'notificationsPanelClear')}
      </button>
    </div>
  )
}

function Header({ state, customLogoPreview, notifOpen, onToggleNotif, onClearNotifications, onPalette, onTab }: {
  state: SiteState
  customLogoPreview: string | null
  notifOpen: boolean
  onToggleNotif: () => void
  onClearNotifications: () => void
  onPalette: () => void
  onTab: (tab: PageId) => void
}) {
  const ctx = ctxOf(state)
  const count = state.notificationHistory.length
  return (
    <header className="topbar">
      <button className="brand" type="button" onClick={() => onTab('overview')}>
        {customLogoPreview && state.customLogoLoaded ? (
          <img src={customLogoPreview} width="38" height="38" alt="" className="brand-mark" />
        ) : (
          <img src="/mark.svg" width="38" height="38" alt="" className={`brand-mark brand-mark-${state.logoPreset}`} />
        )}
        <span>Material Ollama</span>
      </button>
      <div className="top-actions">
        <span className="surface-badge">{t(ctx, 'brandBadge')}</span>
        <span className="status-chip status-good">{state.schoolMode ? state.schoolName : t(ctx, 'statusReleaseVerified')}</span>
        <div className="notif-anchor">
          <button className="button button-quiet notif-bell" type="button" onClick={onToggleNotif} aria-haspopup="dialog" aria-expanded={notifOpen} aria-label={count > 0 ? `${t(ctx, 'notificationsBell')} (${count})` : t(ctx, 'notificationsBellEmpty')}>
            <span aria-hidden="true">🔔</span>
            {count > 0 && <span className="notif-badge" aria-hidden="true">{count > 99 ? '99+' : count}</span>}
          </button>
          {notifOpen && <NotificationCentre ctx={ctx} history={state.notificationHistory} onClear={onClearNotifications} onClose={onToggleNotif} />}
        </div>
        <button className="button button-quiet" type="button" onClick={onPalette}>Ctrl+Shift+F <span className="sr-only">{t(ctx, 'paletteHint')}</span></button>
      </div>
    </header>
  )
}

function Navigation({ state, onTab, search, setSearch, regexPattern, setRegexPattern, regexFlags, setRegexFlags, regexSample, setRegexSample, onRegex }: {
  state: SiteState
  onTab: (tab: PageId) => void
  search: string
  setSearch: (value: string) => void
  regexPattern: string
  setRegexPattern: (value: string) => void
  regexFlags: string
  setRegexFlags: (value: string) => void
  regexSample: string
  setRegexSample: (value: string) => void
  onRegex: () => void
}) {
  const ctx = ctxOf(state)
  const vertical = state.tabDock === 'left' || state.tabDock === 'right'
  return (
    <aside className="navigation">
      <div className="nav-intro">
        <p className="eyebrow">{t(ctx, 'navIntroEyebrow')}</p>
        <p>{t(ctx, 'navIntroBody')}</p>
      </div>
      <nav className="tab-list" role="tablist" aria-orientation={vertical ? 'vertical' : 'horizontal'} aria-label="Landing page sections">
        {PAGES.map((page) => (
          <button key={page.id} className={`tab-button ${state.activeTab === page.id ? 'is-active' : ''}`} type="button" role="tab" aria-selected={state.activeTab === page.id} onClick={() => onTab(page.id)}>
            <span aria-hidden="true">{page.icon}</span>
            <span>{present(state.languageMode, page.label, page.labelZh, state.schoolMode)}</span>
          </button>
        ))}
      </nav>
      <div className="global-search">
        <label htmlFor="site-search">{t(ctx, 'searchThisSite')}</label>
        <input id="site-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t(ctx, 'searchPlaceholder')} />
        <RegexBuilder ctx={ctx} pattern={regexPattern} flags={regexFlags} sample={regexSample} onPattern={setRegexPattern} onFlags={setRegexFlags} onSample={setRegexSample} onApply={onRegex} />
        <p className="field-help" aria-live="polite">{t(ctx, 'searchPlainDefault')}</p>
      </div>
      <p className="nav-footnote"><span className="status-dot" aria-hidden="true" /> {t(ctx, 'navFootnote')}</p>
    </aside>
  )
}

function Overview({ state, onTab, onOpenFeature }: { state: SiteState; onTab: (tab: PageId) => void; onOpenFeature: (id: string) => void }) {
  const ctx = ctxOf(state)
  const toneCtx = toneCtxOf(state)
  const featured = ALL_FEATURES.slice(0, 6)
  return (
    <section className="page-panel">
      <div className="hero-grid">
        <div>
          <p className="eyebrow">{t(ctx, 'overviewEyebrow')}</p>
          <h1>{t(ctx, 'overviewTitle')}</h1>
          <p className="hero-lede">{tone(toneCtx, 'heroLede')}</p>
          <div className="boundary">
            <strong>{t(ctx, 'boundaryTitle')}</strong>
            <p>{tone(toneCtx, 'boundaryNote')}</p>
          </div>
          <div className="hero-actions">
            <button className="button button-primary" type="button" onClick={() => onTab('status')}>{t(ctx, 'viewReleaseEvidence')}</button>
            <button className="button button-secondary" type="button" onClick={() => onTab('docs')}>{t(ctx, 'readDocumentation')}</button>
          </div>
          <div className="hero-meta">
            <span className="status-chip status-good">✅ {present(ctx.languageMode, 'Release', '版本', ctx.schoolMode)}: {VERIFIED_RELEASE.tag} {present(ctx.languageMode, 'verified', '已核實', ctx.schoolMode)}</span>
            <span className="status-chip">⌁ {t(ctx, 'stateStaysHere')}</span>
          </div>
        </div>
        <div className="preview-card" aria-label="Product preview illustration">
          <div className="preview-chrome"><i /><i /><i /><strong>Material Ollama</strong></div>
          <div className="preview-body">
            <div className="preview-rail"><b /><b /><b /><b /></div>
            <div className="preview-main">
              <p className="eyebrow">{present(ctx.languageMode, 'Local workspace', '本地工作區', ctx.schoolMode)}</p>
              <h2>{present(ctx.languageMode, 'Choose a model, then make it yours.', '揀個模型，變成你自己嘅工具。', ctx.schoolMode)}</h2>
              <div className="preview-lines"><i /><i /><i /></div>
              <span className="preview-footer">● {present(ctx.languageMode, 'Ollama service · ready to inspect', 'Ollama服務 · 隨時可以檢視', ctx.schoolMode)}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="section-heading">
        <div>
          <p className="eyebrow">{t(ctx, 'surfaceMapEyebrow')}</p>
          <h2>{t(ctx, 'surfaceMapTitle')}</h2>
        </div>
        <p>{t(ctx, 'surfaceMapBody')}</p>
      </div>
      <div className="callout callout-info">
        <strong>{t(ctx, 'verifiedReleaseHeading')} {VERIFIED_RELEASE.codeName} · {VERIFIED_RELEASE.dishId}</strong>
        <p>
          <a className="text-link" href={VERIFIED_RELEASE.releaseUrl} target="_blank" rel="noreferrer">{t(ctx, 'viewReleaseNotes', { tag: VERIFIED_RELEASE.tag })}</a> ·{' '}
          <a className="text-link" href={VERIFIED_RELEASE.installerUrl} target="_blank" rel="noreferrer">{t(ctx, 'downloadInstaller')}</a> ·{' '}
          {VERIFIED_RELEASE.installerSize} · SHA-256 <code>{VERIFIED_RELEASE.installerSha256}</code>. {t(ctx, 'unsignedWarning')}{' '}
          <a className="text-link" href={VERIFIED_RELEASE.photoUrl} target="_blank" rel="noreferrer">{t(ctx, 'viewDishPhoto')}</a>.
        </p>
      </div>
      <div className="card-grid three-up">
        {featured.map((feature) => <FeatureCard key={feature.id} ctx={ctx} feature={feature} onOpen={onOpenFeature} />)}
      </div>
      <div className="callout callout-info">
        <strong>{state.schoolMode ? state.schoolName : t(ctx, 'visitorStateHeading')}</strong>
        <p>{tone(toneCtx, 'visitorStateNote')}</p>
      </div>
    </section>
  )
}

function Features({ state, selected, onOpen }: { state: SiteState; selected: string; onOpen: (id: string) => void }) {
  const ctx = ctxOf(state)
  const [filter, setFilter] = useState('')
  const [pattern, setPattern] = useState('')
  const [flags, setFlags] = useState('i')
  const [sample, setSample] = useState('chat, settings, accessibility')
  const [regexActive, setRegexActive] = useState(false)
  const categories = [...new Set(ALL_FEATURES.map((feature) => feature.category))]
  const matches = useMemo(() => {
    try {
      const matcher = regexActive && filter ? new RegExp(filter, flags) : null
      return ALL_FEATURES.filter((feature) => {
        const haystack = `${feature.title} ${feature.category} ${feature.summary}`
        return matcher ? matcher.test(haystack) : haystack.toLocaleLowerCase().includes(filter.toLocaleLowerCase())
      })
    } catch {
      return []
    }
  }, [filter, regexActive, flags])
  const chosen = ALL_FEATURES.find((feature) => feature.id === selected)
  return (
    <section className="page-panel">
      <div className="page-heading">
        <p className="eyebrow">{t(ctx, 'featuresEyebrow')}</p>
        <h1>{t(ctx, 'featuresTitle')}</h1>
        <p>{t(ctx, 'featuresBody')}</p>
      </div>
      <div className="toolbar">
        <label>
          {t(ctx, 'filterFeatureRecords')}
          <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={t(ctx, 'filterFeaturePlaceholder')} />
          <RegexBuilder ctx={ctx} pattern={pattern} flags={flags} sample={sample} onPattern={setPattern} onFlags={setFlags} onSample={setSample} onApply={() => { setFilter(pattern); setRegexActive(true) }} />
        </label>
        <span className="status-chip">{t(ctx, 'matchesOfTotal', { matches: matches.length, total: ALL_FEATURES.length })}</span>
      </div>
      {state.schoolMode && (
        <div className="callout callout-warning">
          <strong>{t(ctx, 'schoolModeActiveHeading', { name: state.schoolName })}</strong>
          <p>{t(ctx, 'schoolModeActiveBody')}</p>
        </div>
      )}
      <div className="category-strip">
        {categories.map((category) => <span key={category} className="tag">{categoryLabel(ctx, category)}</span>)}
      </div>
      {matches.length === 0 ? (
        <p className="no-results">{t(ctx, 'noFeatureMatches')}</p>
      ) : (
        <div className="feature-grid">
          {matches.map((feature) => <FeatureCard key={feature.id} ctx={ctx} feature={feature} onOpen={onOpen} />)}
        </div>
      )}
      {chosen && (
        <div className="detail-card" tabIndex={-1}>
          <div className="card-top">
            <span className="tag">{categoryLabel(ctx, chosen.category)}</span>
            <button className="icon-button" type="button" onClick={() => onOpen('')} aria-label={t(ctx, 'closeFeatureRecord')}>×</button>
          </div>
          <h2>{present(ctx.languageMode, chosen.title, chosen.titleZh, ctx.schoolMode)}</h2>
          <p>{present(ctx.languageMode, chosen.summary, chosen.summaryZh, ctx.schoolMode)}</p>
          <dl>
            <div><dt>{t(ctx, 'siteSurfaceLabel')}</dt><dd>{chosen.surface}</dd></div>
            <div><dt>{t(ctx, 'stateLabel')}</dt><dd>{t(ctx, 'stateValue')}</dd></div>
            <div><dt>{t(ctx, 'privacyLabel')}</dt><dd>{t(ctx, 'privacyValue')}</dd></div>
          </dl>
        </div>
      )}
    </section>
  )
}

function Docs({ state }: { state: SiteState }) {
  const ctx = ctxOf(state)
  const toneCtx = toneCtxOf(state)
  const [article, setArticle] = useState<string>('')
  const selected = ARTICLES.find((item) => item.id === article)
  return (
    <section className="page-panel">
      <div className="page-heading">
        <p className="eyebrow">{t(ctx, 'docsEyebrow')}</p>
        <h1>{t(ctx, 'docsTitle')}</h1>
        <p>{t(ctx, 'docsBody')}</p>
      </div>
      <div className="article-list">
        {ARTICLES.map((item) => (
          <article className="article-card" key={item.id}>
            <div className="article-index">{item.category.slice(0, 2).toUpperCase()}</div>
            <div>
              <div className="card-top">
                <span className="tag">{categoryLabel(ctx, item.category)}</span>
                <span className="feature-state">{t(ctx, 'articleCommitLinked')}</span>
              </div>
              <h2>{present(ctx.languageMode, item.title, item.titleZh, ctx.schoolMode)}</h2>
              <p>{present(ctx.languageMode, item.summary, item.summaryZh, ctx.schoolMode)}</p>
              <button className="text-link" type="button" onClick={() => setArticle(item.id)}>{t(ctx, 'readArticle')} <span aria-hidden="true">→</span></button>
            </div>
          </article>
        ))}
      </div>
      {selected && (
        <article className="detail-card article-detail">
          <div className="card-top">
            <span className="tag">{categoryLabel(ctx, selected.category)}</span>
            <button className="icon-button" type="button" onClick={() => setArticle('')} aria-label={t(ctx, 'closeArticle')}>×</button>
          </div>
          <h2>{present(ctx.languageMode, selected.title, selected.titleZh, ctx.schoolMode)}</h2>
          <p>{present(ctx.languageMode, selected.summary, selected.summaryZh, ctx.schoolMode)}</p>
          <p>{selected.id === 'boundary' ? tone(toneCtx, 'boundaryNote') : t(ctx, 'articleBoilerplate')}</p>
          <a className="text-link" href={`https://github.com/Ding-Ding-Projects/material-ollama/commit/${selected.commit}`} target="_blank" rel="noreferrer">{t(ctx, 'openSourceCommit')} <span aria-hidden="true">↗</span></a>
          <p className="suggested">{t(ctx, 'suggestedArticles')} {ARTICLES.filter((item) => item.id !== selected.id).slice(0, 2).map((item) => present(ctx.languageMode, item.title, item.titleZh, ctx.schoolMode)).join(' · ')}</p>
        </article>
      )}
    </section>
  )
}

function Status({ state, notices, onNotice }: { state: SiteState; notices: Notice[]; onNotice: (notice: Omit<Notice, 'id'>) => void }) {
  const ctx = ctxOf(state)
  const [heartbeat, setHeartbeat] = useState('')
  useEffect(() => {
    const update = () => setHeartbeat(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    update()
    const id = window.setInterval(update, 1000)
    return () => window.clearInterval(id)
  }, [])
  const evidenceRows: Array<[string, string, string]> = [
    [present(ctx.languageMode, 'Landing source', 'Landing source', ctx.schoolMode), present(ctx.languageMode, 'Available', '已具備', ctx.schoolMode), present(ctx.languageMode, 'The site source is present and has a dedicated build entry point.', '網站source已經存在，仲有自己專屬嘅build入口。', ctx.schoolMode)],
    [present(ctx.languageMode, 'Desktop installer', '桌面安裝程式', ctx.schoolMode), present(ctx.languageMode, 'Verified', '已核實', ctx.schoolMode), `${present(ctx.languageMode, 'Immutable', '冇得改嘅', ctx.schoolMode)} ${VERIFIED_RELEASE.tag} ${present(ctx.languageMode, 'asset with a verified size and SHA-256.', '資源，大細同SHA-256都已核實。', ctx.schoolMode)}`],
    [present(ctx.languageMode, 'Release metadata', '版本Metadata', ctx.schoolMode), present(ctx.languageMode, 'Verified', '已核實', ctx.schoolMode), `${VERIFIED_RELEASE.codeName} ${present(ctx.languageMode, 'is linked to the public catalog image.', '已經連結去公開目錄嘅圖片。', ctx.schoolMode)}`],
    [present(ctx.languageMode, 'Ollama service', 'Ollama服務', ctx.schoolMode), present(ctx.languageMode, 'Not connected', '未連接', ctx.schoolMode), present(ctx.languageMode, 'The site never pretends to inspect a machine-local service.', '呢個網站永遠唔會扮緊檢視緊機器本地嘅服務。', ctx.schoolMode)],
    [present(ctx.languageMode, 'Capture matrix', '截圖矩陣', ctx.schoolMode), present(ctx.languageMode, 'Pending', '待處理', ctx.schoolMode), present(ctx.languageMode, 'Real built-artifact captures are a separate delivery responsibility.', '真正建置成品嘅截圖係另一項獨立交付責任。', ctx.schoolMode)],
  ]
  return (
    <section className="page-panel">
      <div className="page-heading">
        <p className="eyebrow">{t(ctx, 'statusEyebrow')}</p>
        <h1>{t(ctx, 'statusTitle')}</h1>
        <p>{t(ctx, 'statusBody')}</p>
      </div>
      <div className="status-grid">
        <div className="status-card">
          <span className="status-label">{t(ctx, 'statusReleaseLabel')}</span>
          <strong className="status-value good">✅ {VERIFIED_RELEASE.tag}</strong>
          <p>{present(ctx.languageMode, 'Verified against commit', '對照commit已核實', ctx.schoolMode)} <code>{VERIFIED_RELEASE.commit}</code>. <a className="text-link" href={VERIFIED_RELEASE.releaseUrl} target="_blank" rel="noreferrer">{t(ctx, 'viewReleaseNotesPlain')}</a>.</p>
        </div>
        <div className="status-card">
          <span className="status-label">{t(ctx, 'statusInstallerLabel')}</span>
          <strong className="status-value good">● {t(ctx, 'statusInstallerValue')}</strong>
          <p>{VERIFIED_RELEASE.installerSize} · SHA-256 <code>{VERIFIED_RELEASE.installerSha256}</code>.</p>
        </div>
        <div className="status-card">
          <span className="status-label">{t(ctx, 'statusLandingAccessLabel')}</span>
          <strong className="status-value good">● {t(ctx, 'statusLandingAccessValue')}</strong>
          <p><a className="text-link" href={VERIFIED_RELEASE.landingUrl} target="_blank" rel="noreferrer">{t(ctx, 'openVerifiedLandingUrl')}</a>; {t(ctx, 'anonymousAccessBounded')}</p>
        </div>
        <div className="status-card">
          <span className="status-label">{t(ctx, 'statusHeartbeatLabel')}</span>
          <strong className="status-value">{heartbeat || '—'}</strong>
          <p>{t(ctx, 'statusHeartbeatBody')}</p>
        </div>
      </div>
      <div className="callout callout-info">
        <strong>{VERIFIED_RELEASE.codeName} · {VERIFIED_RELEASE.dishId}</strong>
        <p><a className="button button-primary" href={VERIFIED_RELEASE.installerUrl} target="_blank" rel="noreferrer">{t(ctx, 'downloadWindowsInstaller')}</a></p>
        <p>{t(ctx, 'unsignedWarning')} {t(ctx, 'duplicatePhotoNote')} <a className="text-link" href={VERIFIED_RELEASE.photoUrl} target="_blank" rel="noreferrer">{present(ctx.languageMode, 'the catalog photo', '目錄相', ctx.schoolMode)}</a>{t(ctx, 'noDuplicateImage')}</p>
      </div>
      <div className="evidence-table">
        <div className="evidence-head">
          <span>{t(ctx, 'evidenceItemHeader')}</span>
          <span>{t(ctx, 'evidenceStateHeader')}</span>
          <span>{t(ctx, 'evidenceMeaningHeader')}</span>
        </div>
        {evidenceRows.map(([name, stateValue, meaning]) => (
          <div className="evidence-row" key={name}>
            <span data-label={t(ctx, 'evidenceItemHeader')}>{name}</span>
            <span data-label={t(ctx, 'evidenceStateHeader')} className={stateValue.includes('Available') || stateValue.includes('已具備') || stateValue.includes('Verified') || stateValue.includes('已核實') ? 'good' : 'pending'}>{stateValue}</span>
            <span data-label={t(ctx, 'evidenceMeaningHeader')}>{meaning}</span>
          </div>
        ))}
      </div>
      <div className="inline-actions">
        <button className="button button-secondary" type="button" onClick={() => onNotice({ tone: 'info', title: `${emoji(state.showEmoji, 'ℹ️')}${present(ctx.languageMode, 'No live service connected', '未連接任何實時服務', ctx.schoolMode)}`, detail: present(ctx.languageMode, 'This landing surface keeps the service boundary honest.', '呢個landing介面老老實實咁保持住同服務嘅界線。', ctx.schoolMode) })}>
          {t(ctx, 'createLocalStatusNotice')}
        </button>
        {notices.length > 0 && (
          <span className="field-help">{notices.length} {present(ctx.languageMode, notices.length === 1 ? t(ctx, 'noticeSingular') : t(ctx, 'noticePlural'), t(ctx, 'noticePlural'), ctx.schoolMode)} {t(ctx, 'noticeCountSuffix')}</span>
        )}
      </div>
    </section>
  )
}

function Settings({ state, update, onReset, onNotice, customLogoPreview, onCustomLogoPreview }: {
  state: SiteState
  update: (patch: Partial<SiteState>, message?: string) => void
  onReset: () => void
  onNotice: (notice: Omit<Notice, 'id'>) => void
  customLogoPreview: string | null
  onCustomLogoPreview: (dataUrl: string | null) => void
}) {
  const ctx = ctxOf(state)
  const [status, setStatus] = useState(t(ctx, 'changesStoredLocally'))
  const updateSetting = (patch: Partial<SiteState>, message = t(ctx, 'savedLocally')) => {
    update(patch, message)
    setStatus(message)
  }
  const handleVocabulary = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.size > 256 * 1024) {
      setStatus(present(ctx.languageMode, 'File refused: the local vocabulary limit is 256 KiB.', '檔案被拒：本地詞彙上限係256 KiB。', ctx.schoolMode))
      return
    }
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      try {
        const parsed = JSON.parse(String(reader.result || ''))
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('the root value must be an object')
        updateSetting({ vocabularyLoaded: true }, present(ctx.languageMode, 'A valid vocabulary file is active locally. Its contents are not exported.', '一個有效嘅詞彙檔案已喺本地生效，佢嘅內容唔會出現喺export度。', ctx.schoolMode))
      } catch (error) {
        setStatus(`${present(ctx.languageMode, 'File refused:', '檔案被拒：', ctx.schoolMode)} ${error instanceof Error ? error.message : 'invalid JSON'}.`)
      }
    })
    reader.readAsText(file)
    event.target.value = ''
  }
  const exportState = () => {
    const safe = { ...state, vocabularyLoaded: Boolean(state.vocabularyLoaded), notificationHistory: state.notificationHistory.map(({ id: _id, ...notice }) => notice), history: state.history }
    const blob = new Blob([JSON.stringify({ schemaVersion: 3, omitted: ['vocabularyFileContents'], settings: safe }, null, 2)], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'material-ollama-site-settings.json'
    link.click()
    URL.revokeObjectURL(link.href)
    setStatus(present(ctx.languageMode, 'Settings exported. Private file contents were omitted.', '設定已匯出。私隱檔案內容已經漏低冇帶埋。', ctx.schoolMode))
  }
  const isLightSurface = useIsLightSurface(state.theme)
  const accent = deriveAccentTokens(state.seedColor, isLightSurface)

  const pageItems: SearchItem[] = PAGES.map((page) => ({
    id: page.id,
    label: present(ctx.languageMode, page.label, page.labelZh, ctx.schoolMode),
    detail: present(ctx.languageMode, page.summary, page.summaryZh, ctx.schoolMode),
    onSelect: () => update({ activeTab: page.id }, `${t(ctx, 'jumpTo')} ${page.label}.`),
  }))
  const categories = [...new Set(ALL_FEATURES.map((feature) => feature.category))]
  const categoryItems: SearchItem[] = categories.map((category) => ({
    id: category,
    label: categoryLabel(ctx, category),
    detail: `${ALL_FEATURES.filter((feature) => feature.category === category).length} ${present(ctx.languageMode, 'feature records', '項功能紀錄', ctx.schoolMode)}`,
    onSelect: () => update({ activeTab: 'features', selectedFeature: '' }, `${t(ctx, 'jumpTo')} ${category}.`),
  }))
  const masterItems: SearchItem[] = [
    ...pageItems,
    ...ALL_FEATURES.map((feature) => ({
      id: `feature-${feature.id}`,
      label: present(ctx.languageMode, feature.title, feature.titleZh, ctx.schoolMode),
      detail: present(ctx.languageMode, feature.summary, feature.summaryZh, ctx.schoolMode),
      onSelect: () => update({ activeTab: 'features', selectedFeature: feature.id }, `${t(ctx, 'jumpTo')} ${feature.title}.`),
    })),
    ...ARTICLES.map((item) => ({
      id: `article-${item.id}`,
      label: present(ctx.languageMode, item.title, item.titleZh, ctx.schoolMode),
      detail: present(ctx.languageMode, item.summary, item.summaryZh, ctx.schoolMode),
      onSelect: () => update({ activeTab: 'docs' }, `${t(ctx, 'jumpTo')} ${item.title}.`),
    })),
  ]

  return (
    <section className="page-panel">
      <div className="page-heading">
        <p className="eyebrow">{t(ctx, 'settingsEyebrow')}</p>
        <h1>{t(ctx, 'settingsTitle')}</h1>
        <p>{tone(toneCtxOf(state), 'settingsIntro')}</p>
      </div>
      <div className="settings-tabs">
        <ScopedSearch ctx={ctx} label={t(ctx, 'currentTabStripSearch')} items={pageItems} />
        <ScopedSearch ctx={ctx} label={t(ctx, 'tabGroupSearch')} items={categoryItems} />
        <ScopedSearch ctx={ctx} label={t(ctx, 'tabGroupNamesSearch')} items={categoryItems} />
        <ScopedSearch ctx={ctx} label={t(ctx, 'masterTabSearch')} items={masterItems} />
      </div>
      <div className="settings-grid">
        <div className="settings-card">
          <div className="card-top">
            <span className="tag">{t(ctx, 'languageTag')}</span>
            <span className="feature-state">{t(ctx, 'persistedTag')}</span>
          </div>
          <h2>{t(ctx, 'presentationHeading')}</h2>
          <label>
            {t(ctx, 'languageModeLabel')}
            <select value={state.languageMode} onChange={(event) => updateSetting({ languageMode: event.target.value as LanguageMode })}>
              <option value="english">{t(ctx, 'languageModeEnglish')}</option>
              <option value="cantonese">{t(ctx, 'languageModeCantonese')}</option>
              <option value="bilingual">{t(ctx, 'languageModeBilingual')}</option>
            </select>
          </label>
          <label className="range-label">
            {t(ctx, 'englishToneLabel')} <output>{state.funnyEnglish}</output>
            <input type="range" min="1" max="5" value={state.funnyEnglish} onChange={(event) => updateSetting({ funnyEnglish: Number(event.target.value) })} />
          </label>
          <label className="range-label">
            {t(ctx, 'cantoneseToneLabel')} <output>{state.funnyCantonese}</output>
            <input type="range" min="1" max="5" value={state.funnyCantonese} onChange={(event) => updateSetting({ funnyCantonese: Number(event.target.value) })} />
          </label>
          <label className="check-field">
            <input type="checkbox" checked={state.showEmoji} onChange={(event) => updateSetting({ showEmoji: event.target.checked })} /> {t(ctx, 'showEmojiLabel')}
          </label>
          <p className="setting-provenance">{present(ctx.languageMode, "Current values came from this browser's local settings record.", '目前數值嚟自呢個瀏覽器嘅本地設定紀錄。', ctx.schoolMode)}</p>
          <Explain ctx={ctx}>{t(ctx, 'presentationExplain')}</Explain>
        </div>

        <div className="settings-card">
          <div className="card-top">
            <span className="tag">{t(ctx, 'focusAccessTag')}</span>
            <span className="feature-state">{t(ctx, 'localOnlyTag')}</span>
          </div>
          <h2>{t(ctx, 'focusModeHeading')}</h2>
          <label className="check-field">
            <input type="checkbox" checked={state.schoolMode} onChange={(event) => updateSetting({ schoolMode: event.target.checked })} /> {t(ctx, 'enableFocusMode')}
          </label>
          <label>
            {t(ctx, 'focusModeNameLabel')}
            <input value={state.schoolName} onChange={(event) => updateSetting({ schoolName: event.target.value || 'Focus mode' })} />
          </label>
          <label className="check-field">
            <input type="checkbox" checked={state.narratorEnabled} onChange={(event) => updateSetting({ narratorEnabled: event.target.checked })} /> {t(ctx, 'enableNarrator')}
          </label>
          <label>
            {t(ctx, 'narratedLanguageLabel')}
            <select value={state.narratorLanguage} onChange={(event) => updateSetting({ narratorLanguage: event.target.value as SiteState['narratorLanguage'] })}>
              <option value="both">{t(ctx, 'narratedBoth')}</option>
              <option value="english">{t(ctx, 'languageModeEnglish')}</option>
              <option value="cantonese">{present(ctx.languageMode, 'Cantonese', '廣東話', ctx.schoolMode)}</option>
            </select>
          </label>
          <div className="two-fields">
            <label>
              {t(ctx, 'englishVoiceLabel')}
              <select value={state.englishVoice} onChange={(event) => updateSetting({ englishVoice: event.target.value })}>
                <option value="auto">{t(ctx, 'chooseAutomatically')}</option>
                <option value="system">{t(ctx, 'installedSystemVoice')}</option>
              </select>
            </label>
            <label>
              {t(ctx, 'cantoneseVoiceLabel')}
              <select value={state.cantoneseVoice} onChange={(event) => updateSetting({ cantoneseVoice: event.target.value })}>
                <option value="auto">{t(ctx, 'chooseAutomatically')}</option>
                <option value="system">{t(ctx, 'installedSystemVoice')}</option>
              </select>
            </label>
          </div>
          <div className="two-fields">
            <label className="range-label">
              {present(ctx.languageMode, 'Narrator rate', '旁述速度', ctx.schoolMode)} <output>{state.narratorRate.toFixed(1)}×</output>
              <input type="range" min="0.5" max="2" step="0.1" value={state.narratorRate} onChange={(event) => updateSetting({ narratorRate: Number(event.target.value) })} />
            </label>
            <label className="range-label">
              {present(ctx.languageMode, 'Narrator pitch', '旁述音調', ctx.schoolMode)} <output>{state.narratorPitch.toFixed(1)}</output>
              <input type="range" min="0.5" max="2" step="0.1" value={state.narratorPitch} onChange={(event) => updateSetting({ narratorPitch: Number(event.target.value) })} />
            </label>
          </div>
          <p className="setting-provenance">{t(ctx, 'voiceProvenance')}</p>
          <Explain ctx={ctx}>{t(ctx, 'focusExplain')}</Explain>
        </div>

        <div className="settings-card">
          <div className="card-top">
            <span className="tag">{t(ctx, 'appearanceTag')}</span>
            <span className="feature-state">{t(ctx, 'livePreviewTag')}</span>
          </div>
          <h2>{t(ctx, 'siteAppearanceHeading')}</h2>
          <label>
            {t(ctx, 'themeLabel')}
            <select value={state.theme} onChange={(event) => updateSetting({ theme: event.target.value as ThemeMode })}>
              <option value="dark">{t(ctx, 'themeDark')}</option>
              <option value="light">{t(ctx, 'themeLight')}</option>
              <option value="auto">{t(ctx, 'themeAuto')}</option>
            </select>
          </label>
          <label>
            {t(ctx, 'densityLabel')}
            <select value={state.density} onChange={(event) => updateSetting({ density: event.target.value as SiteState['density'] })}>
              <option value="comfortable">{t(ctx, 'densityComfortable')}</option>
              <option value="compact">{t(ctx, 'densityCompact')}</option>
            </select>
          </label>
          <label>
            {t(ctx, 'tabDockLabel')}
            <select value={state.tabDock} onChange={(event) => updateSetting({ tabDock: event.target.value as TabDock })}>
              <option value="left">{t(ctx, 'dockLeft')}</option>
              <option value="right">{t(ctx, 'dockRight')}</option>
              <option value="top">{t(ctx, 'dockTop')}</option>
              <option value="bottom">{t(ctx, 'dockBottom')}</option>
            </select>
          </label>
          <div className="two-fields">
            <label className="color-field">
              {t(ctx, 'accentColorLabel')}
              <span className="color-row">
                <input type="color" value={state.seedColor} onChange={(event) => updateSetting({ seedColor: event.target.value })} aria-label={t(ctx, 'accentColorLabel')} />
                <code>{state.seedColor}</code>
              </span>
              <span className="field-help">
                {present(ctx.languageMode, 'Rendered as', '實際渲染為', ctx.schoolMode)} <span className="swatch-dot" style={{ background: accent.accent } as CSSProperties} aria-hidden="true" /> <code>{accent.accent}</code> {present(ctx.languageMode, 'on this theme', '喺呢個主題下', ctx.schoolMode)} · {present(ctx.languageMode, 'contrast against its own ink colour', '同自己文字色嘅對比度', ctx.schoolMode)} {accent.contrastReadout}
              </span>
            </label>
            <label className="range-label">
              {t(ctx, 'cornerRadiusLabel')} <output>{state.radius}px</output>
              <input type="range" min="2" max="32" value={state.radius} onChange={(event) => updateSetting({ radius: clampRadius(Number(event.target.value)) })} />
            </label>
          </div>
          <button className="text-link" type="button" onClick={() => updateSetting({ seedColor: DEFAULT_SEED_COLOR, radius: DEFAULT_RADIUS }, t(ctx, 'accentColorReset'))}>{t(ctx, 'accentColorReset')}</button>
          <label>
            {t(ctx, 'logoPresetLabel')}
            <select value={state.logoPreset} onChange={(event) => updateSetting({ logoPreset: event.target.value })} disabled={Boolean(customLogoPreview && state.customLogoLoaded)}>
              <option value="default">{t(ctx, 'logoDefault')}</option>
              <option value="soft">{t(ctx, 'logoSoft')}</option>
              <option value="mono">{t(ctx, 'logoMono')}</option>
            </select>
          </label>
          {customLogoPreview && state.customLogoLoaded && (
            <p className="field-help">{present(ctx.languageMode, 'A custom logo is active in the header, so the preset above is not applied.', '而家個header用緊自訂logo，所以上面嘅樣式暫時唔會生效。', ctx.schoolMode)}</p>
          )}
          <label className="file-button">
            {t(ctx, 'uploadCustomLogo')}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (!file) return
                if (file.size > 512 * 1024) {
                  setStatus(present(ctx.languageMode, 'File refused: the local logo limit is 512 KiB.', '檔案被拒：本地logo上限係512 KiB。', ctx.schoolMode))
                  event.target.value = ''
                  return
                }
                const reader = new FileReader()
                reader.addEventListener('load', () => {
                  onCustomLogoPreview(String(reader.result || ''))
                  updateSetting({ customLogoLoaded: true }, present(ctx.languageMode, 'Custom logo decoded and shown in the header for this browser session.', '自訂logo已喺本地解碼，並喺呢個瀏覽器session度顯示喺header。', ctx.schoolMode))
                })
                reader.readAsDataURL(file)
                event.target.value = ''
              }}
            />
          </label>
          {state.customLogoLoaded && !customLogoPreview && (
            <p className="field-help">{present(ctx.languageMode, 'A custom logo was chosen in an earlier session. Re-select the file to preview it again in this tab — the decoded image itself was never kept.', '之前個session揀過自訂logo。因為解碼圖片本身冇儲低，想再喺呢個分頁睇返就要重新揀一次檔案。', ctx.schoolMode)}</p>
          )}
          {state.customLogoLoaded && (
            <button className="text-link" type="button" onClick={() => { onCustomLogoPreview(null); updateSetting({ customLogoLoaded: false }, present(ctx.languageMode, 'Custom logo removed; the shipped mark is back.', '已移除自訂logo；返返去出廠標誌。', ctx.schoolMode)) }}>
              {present(ctx.languageMode, 'Remove custom logo', '移除自訂logo', ctx.schoolMode)}
            </button>
          )}
          <p className="setting-provenance">{t(ctx, 'logoFallbackNote')} {present(ctx.languageMode, 'A decoded preview is kept only in this tab’s memory for this session; it is never written to local storage or included in an export.', '已解碼嘅預覽淨係喺呢個分頁嘅記憶體度保留返呢個session，永遠唔會寫落local storage或者出現喺export度。', ctx.schoolMode)}</p>
          <Explain ctx={ctx}>{t(ctx, 'appearanceExplain')}</Explain>
        </div>

        <div className="settings-card">
          <div className="card-top">
            <span className="tag">{t(ctx, 'localDataTag')}</span>
            <span className="feature-state">{t(ctx, 'noNetworkTag')}</span>
          </div>
          <h2>{t(ctx, 'filesScheduleHeading')}</h2>
          <label className="file-button">
            {t(ctx, 'uploadPersonalVocabulary')}
            <input id="vocabulary-file" type="file" accept="application/json,.json" onChange={handleVocabulary} />
          </label>
          <p className="field-help">{state.vocabularyLoaded ? t(ctx, 'vocabularyLoadedHelp') : t(ctx, 'vocabularyEmptyHelp')}</p>
          <button className="button button-secondary" type="button" onClick={() => updateSetting({ vocabularyLoaded: false }, present(ctx.languageMode, 'Personal vocabulary state cleared.', '個人詞彙狀態已清除。', ctx.schoolMode))}>{t(ctx, 'clearVocabulary')}</button>
          <label className="check-field">
            <input type="checkbox" checked={state.scheduleEnabled} onChange={(event) => updateSetting({ scheduleEnabled: event.target.checked })} /> {t(ctx, 'enableScheduledSettings')}
          </label>
          <label>
            {t(ctx, 'scheduledValueSourceLabel')}
            <select value={state.externalSource} onChange={(event) => updateSetting({ externalSource: event.target.value as SiteState['externalSource'] })}>
              <option value="local">{t(ctx, 'sourceLocalData')}</option>
              <option value="https">{t(ctx, 'sourceHttps')}</option>
              <option value="home-assistant">{t(ctx, 'sourceHomeAssistant')}</option>
            </select>
          </label>
          <div className="inline-actions">
            <button className="button button-secondary" type="button" onClick={exportState}>{t(ctx, 'exportSettings')}</button>
            <label className="file-button button button-quiet">
              {t(ctx, 'importSettings')}
              <input type="file" accept="application/json,.json" onChange={(event) => { if (!event.target.files?.[0]) return; setStatus(present(ctx.languageMode, 'Import is bounded to the documented local schema. Private vocabulary remains cleared.', '匯入受限於已記錄嘅本地schema，個人詞彙依然保持清除。', ctx.schoolMode)) }} />
            </label>
            <button className="button button-danger" type="button" onClick={onReset}>{t(ctx, 'resetLocalState')}</button>
          </div>
          <p className="setting-status" role="status">{status}</p>
          <Explain ctx={ctx}>{t(ctx, 'filesExplain')}</Explain>
        </div>
      </div>
      <div className="callout callout-info">
        <strong>{emoji(state.showEmoji, '🎫')}{t(ctx, 'supportTicketsHeading')}</strong>
        <p>{t(ctx, 'supportTicketsBody')}</p>
        <button className="text-link" type="button" onClick={() => onNotice({ tone: 'info', title: `${emoji(state.showEmoji, 'ℹ️')}${t(ctx, 'supportNoticeTitle')}`, detail: present(ctx.languageMode, 'Nothing was sent. This notice exists only in this browser.', '乜嘢都冇發送過，呢個通知淨係存在喺呢個瀏覽器度。', ctx.schoolMode) })}>{t(ctx, 'createLocalTicketNotice')} →</button>
      </div>
    </section>
  )
}

function ResetDialog({ state, onCancel, onConfirm }: { state: SiteState; onCancel: () => void; onConfirm: () => void }) {
  const ctx = ctxOf(state)
  const [keyOne, setKeyOne] = useState(false)
  const [keyTwo, setKeyTwo] = useState(false)
  const [progress, setProgress] = useState(0)
  const ready = keyOne && keyTwo && progress === 100
  return (
    <div className="overlay" role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="reset-title">
        <div className="card-top">
          <span className="tag">{t(ctx, 'resetDialogTag')}</span>
          <button className="icon-button" type="button" onClick={onCancel} aria-label={t(ctx, 'emergencyExit')}>×</button>
        </div>
        <h2 id="reset-title">{emoji(state.showEmoji, '⚠️')}{t(ctx, 'resetDialogTitle')}</h2>
        <p>{tone(toneCtxOf(state), 'resetDialogIntro')}</p>
        <label className="check-field">
          <input type="checkbox" checked={keyOne} onChange={(event) => setKeyOne(event.target.checked)} /> {t(ctx, 'resetKeyOne')}
        </label>
        <label className="check-field">
          <input type="checkbox" checked={keyTwo} onChange={(event) => setKeyTwo(event.target.checked)} /> {t(ctx, 'resetKeyTwo')}
        </label>
        <label className="range-label">
          {t(ctx, 'resetSlideLabel')} <output>{progress}%</output>
          <input type="range" min="0" max="100" value={progress} onChange={(event) => setProgress(Number(event.target.value))} />
        </label>
        <div className="inline-actions">
          <button className="button button-danger" type="button" disabled={!ready} onClick={onConfirm}>{t(ctx, 'resetLocalState')}</button>
          <button className="button button-quiet" type="button" onClick={onCancel}>{t(ctx, 'emergencyExit')}</button>
        </div>
        <p className="field-help">{t(ctx, 'resetEscapeHint')}</p>
      </div>
    </div>
  )
}

function CommandPalette({ state, onClose, onOpen }: { state: SiteState; onClose: () => void; onOpen: (tab: PageId, feature?: string) => void }) {
  const ctx = ctxOf(state)
  const [query, setQuery] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.focus() }, [])
  const results = useMemo(() => {
    const pageResults = PAGES.map((page) => ({ key: page.id, label: present(ctx.languageMode, page.label, page.labelZh, ctx.schoolMode), detail: present(ctx.languageMode, page.summary, page.summaryZh, ctx.schoolMode), tab: page.id as PageId, feature: undefined as string | undefined }))
    const featureResults = ALL_FEATURES.map((feature) => ({ key: feature.id, label: present(ctx.languageMode, feature.title, feature.titleZh, ctx.schoolMode), detail: present(ctx.languageMode, feature.summary, feature.summaryZh, ctx.schoolMode), tab: 'features' as PageId, feature: feature.id }))
    return [...pageResults, ...featureResults]
      .filter((item) => `${item.label} ${item.detail}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
      .slice(0, 12)
  }, [query, ctx.languageMode, ctx.schoolMode])
  return (
    <div className="overlay" role="presentation">
      <div className="modal palette" role="dialog" aria-modal="true" aria-labelledby="palette-title">
        <div className="card-top">
          <span className="tag">{t(ctx, 'paletteTag')}</span>
          <button className="icon-button" type="button" onClick={onClose} aria-label={t(ctx, 'paletteClose')}>×</button>
        </div>
        <h2 id="palette-title">{t(ctx, 'paletteTitle')}</h2>
        <input ref={input} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t(ctx, 'paletteSearchPlaceholder')} aria-label={t(ctx, 'paletteSearchAria')} />
        <div className="palette-results" role="listbox">
          {results.length ? results.map((item) => (
            <button key={item.key} type="button" role="option" onClick={() => onOpen(item.tab, item.feature)}>
              <strong>{item.label}</strong>
              <span>{item.detail}</span>
            </button>
          )) : <p className="no-results">{t(ctx, 'paletteNoResults')}</p>}
        </div>
        <p className="field-help">{tone(toneCtxOf(state), 'paletteFootnote')}</p>
      </div>
    </div>
  )
}

export default function Home() {
  const [state, setState] = useSiteState()
  const [search, setSearch] = useState('')
  const [regexMode, setRegexMode] = useState(false)
  const [regexPattern, setRegexPattern] = useState('')
  const [regexFlags, setRegexFlags] = useState('i')
  const [regexSample, setRegexSample] = useState('models and configuration')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  // Session-only: a real decoded preview of the visitor's uploaded logo, held in memory rather
  // than localStorage so an image never bloats persisted state or an export. `customLogoLoaded`
  // (persisted) just remembers that a choice was made; this is what actually renders it.
  const [customLogoPreview, setCustomLogoPreview] = useState<string | null>(null)
  const [notices, setNotices] = useState<Notice[]>([])
  const ctx = ctxOf(state)

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        setPaletteOpen(true)
      }
      if (event.key === 'Escape') {
        setPaletteOpen(false)
        setResetOpen(false)
        setNotifOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (state.schoolMode) return
    if (Math.random() >= 0.1) return
    const title = `${emoji(state.showEmoji, '🥟')}${present(state.languageMode, 'A small local delight', '一個本地嘅小驚喜', state.schoolMode)}`
    const detail = tone(toneCtxOf(state), 'dimSumNoticeDetail')
    setNotices([{ id: Date.now(), tone: 'info', title, detail }])
    narrate(state, 'A small local delight is available.', '有一個本地嘅小驚喜。')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.schoolMode])

  const update = (patch: Partial<SiteState>, message = t(ctx, 'savedLocally')) =>
    setState((previous) => ({ ...previous, ...patch, history: [...previous.history, message].slice(-100) }))

  const addNotice = (notice: Omit<Notice, 'id'>) => {
    const value = { ...notice, id: Date.now() }
    setNotices((previous) => [...previous, value])
    setState((previous) => ({ ...previous, notificationHistory: [...previous.notificationHistory, value].slice(-50) }))
  }

  const openFeature = (id: string) => {
    update({ activeTab: 'features', selectedFeature: id }, present(state.languageMode, 'Opened a feature record.', '已打開一份功能紀錄。', state.schoolMode))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const onRegex = () => {
    try {
      new RegExp(regexPattern, regexFlags)
      setRegexMode(true)
    } catch {
      setRegexMode(false)
    }
  }

  const searchMatches = useMemo(() => {
    if (!search.trim()) return ALL_FEATURES
    try {
      const matcher = regexMode ? new RegExp(search, regexFlags) : null
      const query = search.toLocaleLowerCase()
      return ALL_FEATURES.filter((feature) => {
        const haystack = `${feature.title} ${feature.category} ${feature.summary}`
        return matcher ? matcher.test(haystack) : haystack.toLocaleLowerCase().includes(query)
      })
    } catch {
      return []
    }
  }, [search, regexMode, regexFlags])

  const reset = () => {
    setState(DEFAULT_STATE)
    setNotices([])
    setResetOpen(false)
  }

  const setTab = (tab: PageId) => {
    const page = PAGES.find((item) => item.id === tab)
    update({ activeTab: tab }, `${present(state.languageMode, 'Opened', '已打開', state.schoolMode)} ${tab}.`)
    if (page) narrate(state, `${page.label}. ${page.summary}`, `${page.labelZh}。${page.summaryZh}`)
  }

  const isLightSurface = useIsLightSurface(state.theme)
  const accent = deriveAccentTokens(state.seedColor, isLightSurface)
  // Corner roundness is a visitor-chosen token applied inline, which always outranks the
  // stylesheet's class selectors in the cascade — so compact density's usual smaller radius is
  // computed here instead of fighting the inline style from a CSS rule that could never win.
  const effectiveRadius = state.density === 'compact' ? Math.round(state.radius * 0.72) : state.radius
  const rootStyle: CustomStyle = {
    '--accent': accent.accent,
    '--accent-strong': accent.accentStrong,
    '--accent-ink': accent.accentInk,
    '--radius': `${effectiveRadius}px`,
  }

  return (
    <div className="site-root" data-theme={state.theme} data-density={state.density} data-dock={state.tabDock} style={rootStyle}>
      <Header
        state={state}
        customLogoPreview={customLogoPreview}
        notifOpen={notifOpen}
        onToggleNotif={() => setNotifOpen((value) => !value)}
        onClearNotifications={() => setState((previous) => ({ ...previous, notificationHistory: [] }))}
        onPalette={() => setPaletteOpen(true)}
        onTab={setTab}
      />
      <div className="site-layout">
        <Navigation
          state={state}
          onTab={setTab}
          search={search}
          setSearch={setSearch}
          regexPattern={regexPattern}
          setRegexPattern={setRegexPattern}
          regexFlags={regexFlags}
          setRegexFlags={setRegexFlags}
          regexSample={regexSample}
          setRegexSample={setRegexSample}
          onRegex={onRegex}
        />
        <main className="content" id="content" tabIndex={-1}>
          {search.trim() && (
            <div className="search-results callout callout-info">
              <strong>{regexMode ? present(state.languageMode, 'Regex search', 'Regex搜尋', state.schoolMode) : present(state.languageMode, 'Plain-text search', '純文字搜尋', state.schoolMode)}: {searchMatches.length} {present(state.languageMode, 'matching feature records', '項相符功能紀錄', state.schoolMode)}</strong>
              {searchMatches.length === 0 ? (
                <p className="no-results-inline">{t(ctx, 'noFeatureMatches')}</p>
              ) : (
                <div className="result-chips">
                  {searchMatches.slice(0, 8).map((feature) => (
                    <button key={feature.id} className="tag" type="button" onClick={() => openFeature(feature.id)}>{present(state.languageMode, feature.title, feature.titleZh, state.schoolMode)}</button>
                  ))}
                </div>
              )}
            </div>
          )}
          {state.activeTab === 'overview' && <Overview state={state} onTab={setTab} onOpenFeature={openFeature} />}
          {state.activeTab === 'features' && <Features state={state} selected={state.selectedFeature} onOpen={(id) => update({ selectedFeature: id }, id ? present(state.languageMode, 'Opened a feature record.', '已打開一份功能紀錄。', state.schoolMode) : present(state.languageMode, 'Closed a feature record.', '已關閉一份功能紀錄。', state.schoolMode))} />}
          {state.activeTab === 'docs' && <Docs state={state} />}
          {state.activeTab === 'status' && <Status state={state} notices={notices} onNotice={addNotice} />}
          {state.activeTab === 'settings' && <Settings state={state} update={update} onReset={() => setResetOpen(true)} onNotice={addNotice} customLogoPreview={customLogoPreview} onCustomLogoPreview={setCustomLogoPreview} />}
        </main>
      </div>
      <footer className="footer">
        <span>{tone(toneCtxOf(state), 'footerTagline')}</span>
        <span>{present(state.languageMode, 'Release', '版本', state.schoolMode)}: {VERIFIED_RELEASE.tag} {present(state.languageMode, 'verified', '已核實', state.schoolMode)} · {present(state.languageMode, 'Source', 'Source', state.schoolMode)}: {VERIFIED_RELEASE.commit.slice(0, 8)}</span>
      </footer>
      {notices.length > 0 && (
        <div className="notice-stack" aria-live="polite" aria-label="Local notifications">
          {notices.map((notice) => (
            <NoticeItem key={notice.id} ctx={ctx} notice={notice} onDismiss={() => setNotices((previous) => previous.filter((item) => item.id !== notice.id))} />
          ))}
        </div>
      )}
      {paletteOpen && (
        <CommandPalette
          state={state}
          onClose={() => setPaletteOpen(false)}
          onOpen={(tab, feature) => {
            setPaletteOpen(false)
            update({ activeTab: tab, selectedFeature: feature || '' }, present(state.languageMode, 'Used the command palette.', '用咗指令面板。', state.schoolMode))
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
        />
      )}
      {resetOpen && <ResetDialog state={state} onCancel={() => setResetOpen(false)} onConfirm={reset} />}
    </div>
  )
}
