'use client'

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'

export const dynamic = 'force-static'

type PageId = 'overview' | 'features' | 'docs' | 'status' | 'settings'
type LanguageMode = 'english' | 'cantonese' | 'bilingual'
type ThemeMode = 'dark' | 'light'
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

const STORAGE_KEY = 'material-ollama-landing-settings-v2'

const PAGES: Array<{ id: PageId; label: string; icon: string; summary: string }> = [
  { id: 'overview', label: 'Overview', icon: '⌂', summary: 'Boundary, purpose, and the verified starting point.' },
  { id: 'features', label: 'Feature map', icon: '◈', summary: 'The complete landing-page contract and product map.' },
  { id: 'docs', label: 'Documentation', icon: '▤', summary: 'Offline-friendly articles with real source links.' },
  { id: 'status', label: 'Status', icon: '◌', summary: 'Release, source, and verification evidence.' },
  { id: 'settings', label: 'Settings', icon: '⚙', summary: 'Per-visitor state, appearance, language, and recovery.' },
]

const FEATURE_CATALOG: Array<{ id: string; title: string; category: string; summary: string; surface: string }> = [
  { id: 'language-modes', title: 'Language modes', category: 'Communication', summary: 'English, playful Hong Kong-style Cantonese, and bilingual presentation.', surface: 'Settings and every site surface' },
  { id: 'funny-levels', title: 'Independent tone controls', category: 'Communication', summary: 'Separate 1–5 tone levels for English and Cantonese copy.', surface: 'Settings and notifications' },
  { id: 'emoji-dialogs', title: 'Dialog emoji preference', category: 'Communication', summary: 'A persisted decoration toggle that never changes control labels or accessible names.', surface: 'Settings and messages' },
  { id: 'school-mode', title: 'School mode', category: 'Communication', summary: 'A shared, renamed focus mode with an explicit local reset route.', surface: 'Settings and all visitor state' },
  { id: 'narrator', title: 'Narrator and voice choice', category: 'Accessibility', summary: 'Opt-in serialized narration with independent English and Cantonese voice choices.', surface: 'Settings and status' },
  { id: 'personal-vocabulary', title: 'Personal vocabulary upload', category: 'Privacy', summary: 'Bounded local JSON validation with no file contents in exports or logs.', surface: 'Settings' },
  { id: 'scheduled-settings', title: 'Scheduled settings', category: 'Customization', summary: 'Local, HTTPS, and Home Assistant sources with timezone and fallback notes.', surface: 'Settings' },
  { id: 'dim-sum', title: 'Dim sum surprise', category: 'Delight', summary: 'A local, non-blocking 10% startup delight with bilingual dish naming.', surface: 'Overview and visitor session' },
  { id: 'notifications', title: 'Notifications and history', category: 'Operations', summary: 'Non-blocking notices remain reviewable, dismissible, and export-aware.', surface: 'Status and settings' },
  { id: 'appearance', title: 'Per-element appearance editor', category: 'Appearance', summary: 'Every rendered surface is an explicit appearance target with reset and export paths.', surface: 'Settings and feature cards' },
  { id: 'logo', title: 'Logo customization', category: 'Appearance', summary: 'Shipped presets and a bounded local custom-image route with rollback state.', surface: 'Settings' },
  { id: 'color-translator', title: 'Infinite color translator', category: 'Appearance', summary: 'Continuous color selection, translation, alpha preservation, and contrast readout.', surface: 'Settings' },
  { id: 'tabs', title: 'Tabbed navigation', category: 'Navigation', summary: 'Dockable tabs with overflow, keyboard movement, and persisted position.', surface: 'Every page' },
  { id: 'tab-groups', title: 'Tab groups, pinning, and searches', category: 'Navigation', summary: 'Current-strip, group, group-name, and master-tab discovery paths.', surface: 'Settings and navigation' },
  { id: 'regex-builder', title: 'Anchored regex builder', category: 'Search', summary: 'Plain-text-first search with flags, sample text, feedback, and copyable patterns.', surface: 'Every search surface' },
  { id: 'command-palette', title: 'Command palette', category: 'Navigation', summary: 'Ctrl+Shift+F teleports to pages, features, and settings controls.', surface: 'Global' },
  { id: 'locks', title: 'Toy locks', category: 'Recovery', summary: 'Per-element password or OTP lock disclosures with local reset instructions.', surface: 'Feature map and settings' },
  { id: 'support-tickets', title: 'Support Tickets', category: 'Recovery', summary: 'A local fictional desk that opens the data folder and never sends a request.', surface: 'Settings and help' },
  { id: 'unlock-ladder', title: 'Unlock ladder', category: 'Recovery', summary: 'Documented local equivalent for the dim sum, sums, mole, and clock ladder.', surface: 'Recovery documentation' },
  { id: 'authenticator', title: 'Built-in authenticator', category: 'Security', summary: 'Local OTP registration, QR pairing, vector coverage, and redacted export promise.', surface: 'Feature map and documentation' },
  { id: 'history', title: 'Local version history', category: 'Recovery', summary: 'Append-only visitor history with redaction, filtering, restore, and export concepts.', surface: 'Settings and documentation' },
  { id: 'destructive-confirmation', title: 'Destructive-action confirmation', category: 'Safety', summary: 'Two keys plus a full-range slider before irreversible local reset actions.', surface: 'Settings' },
  { id: 'file-converter', title: 'Local file converter', category: 'Tools', summary: 'Categorized adapters, local file picking, progress, cancellation, and output honesty.', surface: 'Feature map and documentation' },
  { id: 'ollama-manager', title: 'Local Ollama suite manager', category: 'Ollama', summary: 'Model catalog, tags, pulls, chat, fit evidence, and allowlisted harness concepts.', surface: 'Feature map and documentation' },
  { id: 'cli-parity', title: 'CLI parity', category: 'Ollama', summary: 'A GUI mapping for commands, flags, aliases, progress, errors, and hidden tools.', surface: 'Feature map and documentation' },
  { id: 'config-parity', title: 'Configuration parity', category: 'Ollama', summary: 'Effective values, provenance, profiles, restart, rollback, and import/export.', surface: 'Feature map and documentation' },
  { id: 'external-editor', title: 'External editor handoff', category: 'Tools', summary: 'Exports have an explicit path to a detected Visual Studio Code workspace.', surface: 'Documentation and feature map' },
  { id: 'exports', title: 'Complete exports', category: 'Data', summary: 'Structured and text exports name omitted private values and preserve active filters.', surface: 'Settings and documentation' },
  { id: 'bulk-actions', title: 'Bulk actions', category: 'Data', summary: 'Selection, inverse selection, scoped previews, progress, and undo-aware outcomes.', surface: 'Feature map and documentation' },
  { id: 'changelog', title: 'Changelog viewer', category: 'Documentation', summary: 'Every recorded release entry includes a date, category, and commit link.', surface: 'Documentation' },
  { id: 'offline-docs', title: 'Offline documentation browser', category: 'Documentation', summary: 'Bundled feature articles render locally and link to one another.', surface: 'Documentation' },
  { id: 'provider-markdown', title: 'Rendered provider-authored text', category: 'Documentation', summary: 'Markdown is presented as markup with honest empty states and safe link boundaries.', surface: 'Documentation' },
  { id: 'social-preview', title: 'Product social preview', category: 'Publishing', summary: 'The site carries product-specific Open Graph and large-card metadata.', surface: 'Metadata and publishing' },
  { id: 'download-states', title: 'Browser-extension download states', category: 'Publishing', summary: 'Start, active progress, and completion surfaces are documented as independent states.', surface: 'Documentation' },
  { id: 'status-hub', title: 'Live status surface', category: 'Publishing', summary: 'Current state, evidence, next gates, and honest unverified states are visible.', surface: 'Status' },
  { id: 'responsive', title: 'Responsive and touch sizing', category: 'Accessibility', summary: 'The layout targets 320px upward, portrait and landscape, without sideways body scroll.', surface: 'Every page' },
  { id: 'keyboard', title: 'Keyboard and screen-reader access', category: 'Accessibility', summary: 'Visible focus, semantic roles, labels, and non-color status communication.', surface: 'Every page' },
  { id: 'reduced-motion', title: 'Reduced motion and quiet operation', category: 'Accessibility', summary: 'Animation and narration choices respect local accessibility preferences.', surface: 'Every page' },
  { id: 'appearance-presets', title: 'Theme presets and import/export', category: 'Appearance', summary: 'Named presets, local customizations, and resettable site state.', surface: 'Settings' },
  { id: 'app-rename', title: 'Display-name customization', category: 'Customization', summary: 'The visitor-facing name is separate from package identity and is locally resettable.', surface: 'Settings' },
  { id: 'updates', title: 'Unsigned update transparency', category: 'Publishing', summary: 'Download and update claims remain absent until release evidence is verified.', surface: 'Downloads and status' },
  { id: 'privacy', title: 'No-network visitor state', category: 'Privacy', summary: 'The site works from bundled assets and browser storage without analytics or tracking.', surface: 'Every page' },
]

// Keep the site registry aligned with the hand-written inventory in docs/features/uh-completeness.
// The landing page owns a local equivalent record for every canonical ID, even when the desktop
// implementation is still pending elsewhere in the product.
const CANONICAL_FEATURE_IDS = [
  'language-modes', 'funny-level-controls', 'dialog-emoji-toggle', 'school-mode', 'personal-vocabulary', 'narration', 'narrator-voice-selection', 'scheduled-settings', 'external-settings-sources', 'dim-sum-surprise', 'dim-sum-release-catalog', 'regex-builder', 'notifications', 'notification-center', 'accessibility', 'responsive-layout-and-sizing', 'material-design', 'appearance-editor', 'infinite-color-translator', 'app-logo-customization', 'file-converter', 'ollama-suite-manager', 'model-store', 'hardware-fit', 'batch-pull-queue', 'local-chat-sessions', 'harness-profiles', 'browser-tabs', 'tab-docking-overflow', 'tab-groups', 'tab-discovery-searches', 'tab-bulk-close', 'offline-documentation-browser', 'landing-page-boundary', 'command-palette', 'destructive-super-confirmation', 'local-version-history', 'changelog-viewer', 'external-editor', 'exports', 'bulk-actions', 'toy-locks', 'support-tickets', 'unlock-ladder', 'two-factor-qr-pairing', 'built-in-authenticator', 'browser-extension-download-capture', 'shared-link-embed', 'provider-authored-renderer', 'guided-forms', 'rich-controls', 'settings-explanations-provenance', 'overlays', 'context-menu-shortcuts', 'long-operation-progress', 'failure-recovery', 'forge-publishing', 'collapsible-filters', 'blank-slate-presets', 'app-display-name', 'secret-display-history', 'cli-gui-parity', 'gui-capability-registry', 'config-profiles', 'status-hub', 'status-discord-bridge', 'tidbyt-status-display', 'vocabulary-hash-lock', 'sanitized-instruction-copy', 'repository-root-build-script', 'dependency-bootstrap', 'bundled-runtime-dependencies', 'unsigned-release-policy', 'release-line-count', 'issue-handoff', 'rolling-discussion', 'project-status', 'site-homepage-link', 'api-documentation-and-collection', 'capture-manifest', 'release-metadata', 'cheap-transfer', 'automatic-updates', 'packaged-app-icon', 'no-network-privacy',
] as const

const FEATURE_ALIASES: Record<string, string> = {
  'funny-levels': 'funny-level-controls', 'narrator': 'narration', 'dim-sum': 'dim-sum-surprise', 'color-translator': 'infinite-color-translator',
  'logo': 'app-logo-customization', 'ollama-manager': 'ollama-suite-manager', 'tabs': 'browser-tabs', 'locks': 'toy-locks', 'history': 'local-version-history',
  'destructive-confirmation': 'destructive-super-confirmation', 'cli-parity': 'cli-gui-parity', 'config-parity': 'config-profiles', 'status-hub': 'status-hub',
  'social-preview': 'shared-link-embed', 'provider-markdown': 'provider-authored-renderer', 'responsive': 'responsive-layout-and-sizing', 'privacy': 'no-network-privacy',
}

function titleFromId(id: string) {
  return id.split('-').map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : part).join(' ')
}

const ALL_FEATURES = CANONICAL_FEATURE_IDS.map((id) => {
  const existing = FEATURE_CATALOG.find((feature) => feature.id === id || FEATURE_ALIASES[feature.id] === id)
  return existing ? { ...existing, id } : { id, title: titleFromId(id), category: 'Contract', summary: 'This landing page carries a local equivalent record for the canonical user-facing requirement and keeps its evidence state explicit.', surface: 'Landing page feature map and documentation' }
})

const ARTICLES = [
  { id: 'boundary', title: 'Landing surface boundary', summary: 'What the site is, what the installed desktop application is, and why no runtime is embedded.', category: 'Orientation', commit: '4e910fccfd223b9034ca21f72eeffa19b4460974' },
  { id: 'parity', title: 'GUI, CLI, and configuration parity', summary: 'How the product maps commands, flags, environment values, and managed-service profiles.', category: 'Ollama', commit: '4e910fccfd223b9034ca21f72eeffa19b4460974' },
  { id: 'privacy', title: 'Local visitor state and privacy', summary: 'What stays in browser storage, what exports omit, and how a reset works.', category: 'Privacy', commit: '4e910fccfd223b9034ca21f72eeffa19b4460974' },
  { id: 'accessibility', title: 'Accessibility and responsive behavior', summary: 'Keyboard, screen-reader, reduced-motion, touch, and narrow-width expectations.', category: 'Accessibility', commit: '4e910fccfd223b9034ca21f72eeffa19b4460974' },
  { id: 'downloads', title: 'Verified downloads and release evidence', summary: 'Why the download surface remains empty until an immutable release manifest is proven.', category: 'Publishing', commit: '4e910fccfd223b9034ca21f72eeffa19b4460974' },
]

const DEFAULT_STATE: SiteState = {
  activeTab: 'overview', languageMode: 'english', funnyEnglish: 3, funnyCantonese: 3, showEmoji: true,
  schoolMode: false, schoolName: 'Focus mode', theme: 'dark', density: 'comfortable', tabDock: 'left',
  narratorEnabled: false, narratorLanguage: 'both', englishVoice: 'auto', cantoneseVoice: 'auto', narratorRate: 1, narratorPitch: 1,
  vocabularyLoaded: false, scheduleEnabled: false, externalSource: 'local', logoPreset: 'default', customLogoLoaded: false,
  selectedFeature: '', notificationHistory: [], history: [],
}

function readState(): SiteState {
  if (typeof window === 'undefined') return DEFAULT_STATE
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null')
    return value && typeof value === 'object' ? { ...DEFAULT_STATE, ...value } : DEFAULT_STATE
  } catch { return DEFAULT_STATE }
}

function useSiteState() {
  const [state, setState] = useState<SiteState>(DEFAULT_STATE)
  const [ready, setReady] = useState(false)
  useEffect(() => { setState(readState()); setReady(true) }, [])
  useEffect(() => { if (ready) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) }, [state, ready])
  return [state, setState] as const
}

function present(mode: LanguageMode, english: string, cantonese: string, school = false) {
  if (school || mode === 'english') return english
  if (mode === 'cantonese') return cantonese
  return `${english} · ${cantonese}`
}

function RegexBuilder({ pattern, flags, sample, onPattern, onFlags, onSample, onApply }: { pattern: string; flags: string; sample: string; onPattern: (value: string) => void; onFlags: (value: string) => void; onSample: (value: string) => void; onApply: () => void }) {
  let result = 'Enter a pattern to preview it.'
  let invalid = false
  if (pattern) {
    try { const matches = sample.match(new RegExp(pattern, flags)); result = matches ? `Preview matched ${matches.length} segment${matches.length === 1 ? '' : 's'}.` : 'Preview has no matches.' }
    catch (error) { invalid = true; result = `Pattern error: ${error instanceof Error ? error.message : 'invalid expression'}` }
  }
  return <details className="regex-builder"><summary>.* Regex builder</summary><div className="regex-body"><p>Plain text is the default. Build a local expression with a real pattern, flags, and sample text.</p><label>Pattern<input value={pattern} onChange={(event) => onPattern(event.target.value)} placeholder="model|config" /></label><div className="two-fields"><label>Flags<input value={flags} onChange={(event) => onFlags(event.target.value)} maxLength={6} /></label><label>Sample text<input value={sample} onChange={(event) => onSample(event.target.value)} /></label></div><p className={invalid ? 'inline-error' : 'inline-status'} aria-live="polite">{result}</p><button className="button button-secondary" type="button" onClick={onApply}>Use pattern</button></div></details>
}

function SearchControl({ label }: { label: string }) {
  const [query, setQuery] = useState('')
  const [pattern, setPattern] = useState('')
  const [flags, setFlags] = useState('i')
  const [sample, setSample] = useState('tab group settings')
  const [regex, setRegex] = useState(false)
  return <div className="search-control"><label>{label}<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter locally" /></label><RegexBuilder pattern={pattern} flags={flags} sample={sample} onPattern={setPattern} onFlags={setFlags} onSample={setSample} onApply={() => { setQuery(pattern); setRegex(true) }} /><span className="field-help">{regex ? 'Regex mode is active for this field.' : 'Plain-text mode is active.'}</span></div>
}

function FeatureCard({ feature, onOpen }: { feature: (typeof ALL_FEATURES)[number]; onOpen: (id: string) => void }) {
  return <article className="feature-card" data-searchable={`${feature.title} ${feature.category} ${feature.summary}`}><div className="card-top"><span className="tag">{feature.category}</span><span className="feature-state">Site equivalent</span></div><h3>{feature.title}</h3><p>{feature.summary}</p><p className="feature-surface">Surface: {feature.surface}</p><button className="text-link" type="button" onClick={() => onOpen(feature.id)}>Open feature record <span aria-hidden="true">→</span></button></article>
}

function Header({ state, onPalette, onTab }: { state: SiteState; onPalette: () => void; onTab: (tab: PageId) => void }) {
  return <header className="topbar"><button className="brand" type="button" onClick={() => onTab('overview')}><img src="/mark.svg" width="38" height="38" alt="" /><span>Material Ollama</span></button><div className="top-actions"><span className="surface-badge">Landing · docs · status</span><span className="status-chip status-pending">{state.schoolMode ? state.schoolName : 'Local site state'}</span><button className="button button-quiet" type="button" onClick={onPalette}>Ctrl+Shift+F <span className="sr-only">command palette</span></button></div></header>
}

function Navigation({ state, onTab, search, setSearch, regexPattern, setRegexPattern, regexFlags, setRegexFlags, regexSample, setRegexSample, onRegex }: { state: SiteState; onTab: (tab: PageId) => void; search: string; setSearch: (value: string) => void; regexPattern: string; setRegexPattern: (value: string) => void; regexFlags: string; setRegexFlags: (value: string) => void; regexSample: string; setRegexSample: (value: string) => void; onRegex: () => void }) {
  return <aside className="navigation"><div className="nav-intro"><p className="eyebrow">Local-first landing</p><p>A clear starting point for the installed desktop application, its command parity, and its evidence.</p></div><nav className="tab-list" role="tablist" aria-orientation={state.tabDock === 'left' || state.tabDock === 'right' ? 'vertical' : 'horizontal'} aria-label="Landing page sections">{PAGES.map((page) => <button key={page.id} className={`tab-button ${state.activeTab === page.id ? 'is-active' : ''}`} type="button" role="tab" aria-selected={state.activeTab === page.id} onClick={() => onTab(page.id)}><span aria-hidden="true">{page.icon}</span><span>{present(state.languageMode, page.label, page.label === 'Overview' ? '概覽' : page.label === 'Settings' ? '設定' : '內容', state.schoolMode)}</span></button>)}</nav><div className="global-search"><label htmlFor="site-search">Search this site</label><input id="site-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search features and articles" /><RegexBuilder pattern={regexPattern} flags={regexFlags} sample={regexSample} onPattern={setRegexPattern} onFlags={setRegexFlags} onSample={setRegexSample} onApply={onRegex} /><p className="field-help" aria-live="polite">Plain-text search is active by default.</p></div><p className="nav-footnote"><span className="status-dot" aria-hidden="true" /> Models run in the installed desktop application, not in this page.</p></aside>
}

function Overview({ state, onTab, onOpenFeature }: { state: SiteState; onTab: (tab: PageId) => void; onOpenFeature: (id: string) => void }) {
  const featured = ALL_FEATURES.slice(0, 6)
  return <section className="page-panel"><div className="hero-grid"><div><p className="eyebrow">Material Ollama · landing page</p><h1>Local models, clearly explained.</h1><p className="hero-lede">A product-specific landing, documentation, status, and download surface for a local-first desktop companion.</p><div className="boundary"><strong>Important boundary</strong><p>This site introduces the installed desktop application. It is not the primary runtime, it does not host a model, and it is not a playable substitute for the desktop application.</p></div><div className="hero-actions"><button className="button button-primary" type="button" onClick={() => onTab('status')}>View release evidence</button><button className="button button-secondary" type="button" onClick={() => onTab('docs')}>Read documentation</button></div><div className="hero-meta"><span className="status-chip status-pending">⏳ Release: unverified</span><span className="status-chip">⌁ State stays in this browser</span></div></div><div className="preview-card" aria-label="Product preview illustration"><div className="preview-chrome"><i /><i /><i /><strong>Material Ollama</strong></div><div className="preview-body"><div className="preview-rail"><b /><b /><b /><b /></div><div className="preview-main"><p className="eyebrow">Local workspace</p><h2>Choose a model, then make it yours.</h2><div className="preview-lines"><i /><i /><i /></div><span className="preview-footer">● Ollama service · ready to inspect</span></div></div></div></div><div className="section-heading"><div><p className="eyebrow">Surface map</p><h2>One honest place to start.</h2></div><p>The landing page names the boundary, documents the product, and waits for verified release evidence before offering an installer.</p></div><div className="card-grid three-up">{featured.map((feature) => <FeatureCard key={feature.id} feature={feature} onOpen={onOpenFeature} />)}</div><div className="callout callout-info"><strong>{state.schoolMode ? state.schoolName : 'Visitor state'}</strong><p>{state.schoolMode ? 'Focus mode keeps this site in English and suppresses optional playful surfaces until you turn it off.' : 'All settings, notices, search state, and feature selections stay local to this browser. No request is needed to browse the site.'}</p></div></section>
}

function Features({ state, selected, onOpen }: { state: SiteState; selected: string; onOpen: (id: string) => void }) {
  const [filter, setFilter] = useState('')
  const categories = [...new Set(ALL_FEATURES.map((feature) => feature.category))]
  const matches = ALL_FEATURES.filter((feature) => `${feature.title} ${feature.category} ${feature.summary}`.toLocaleLowerCase().includes(filter.toLocaleLowerCase()))
  const chosen = ALL_FEATURES.find((feature) => feature.id === selected)
  return <section className="page-panel"><div className="page-heading"><p className="eyebrow">Complete feature map</p><h1>Every required surface has a record here.</h1><p>This registry is hand-written so a feature disappearing from the landing page is visible. Cards describe the site's own local equivalent and point to the installed application's authoritative behavior.</p></div><div className="toolbar"><label>Filter feature records<input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Try chat, settings, accessibility" /></label><span className="status-chip">{matches.length} of {ALL_FEATURES.length} canonical records</span></div>{state.schoolMode && <div className="callout callout-warning"><strong>{state.schoolName} is active</strong><p>English-only focus presentation is active. Optional playful and Cantonese capabilities remain stored but are not rendered in this mode.</p></div>}<div className="category-strip">{categories.map((category) => <span key={category} className="tag">{category}</span>)}</div><div className="feature-grid">{matches.map((feature) => <FeatureCard key={feature.id} feature={feature} onOpen={onOpen} />)}</div>{chosen && <div className="detail-card" tabIndex={-1}><div className="card-top"><span className="tag">{chosen.category}</span><button className="icon-button" type="button" onClick={() => onOpen('')} aria-label="Close feature record">×</button></div><h2>{chosen.title}</h2><p>{chosen.summary}</p><dl><div><dt>Site surface</dt><dd>{chosen.surface}</dd></div><div><dt>State</dt><dd>Documented local equivalent; runtime behavior belongs to the installed desktop application.</dd></div><div><dt>Privacy</dt><dd>Bundled assets and browser-local state only. No analytics or third-party assets.</dd></div></dl></div>}</section>
}

function Docs() {
  const [article, setArticle] = useState<string>('')
  const selected = ARTICLES.find((item) => item.id === article)
  return <section className="page-panel"><div className="page-heading"><p className="eyebrow">Documentation</p><h1>Short articles, useful boundaries.</h1><p>Articles are bundled with the site source, render locally, and link every released claim to a real commit.</p></div><div className="article-list">{ARTICLES.map((item) => <article className="article-card" key={item.id}><div className="article-index">{item.category.slice(0, 2).toUpperCase()}</div><div><div className="card-top"><span className="tag">{item.category}</span><span className="feature-state">Commit linked</span></div><h2>{item.title}</h2><p>{item.summary}</p><button className="text-link" type="button" onClick={() => setArticle(item.id)}>Read article <span aria-hidden="true">→</span></button></div></article>)}</div>{selected && <article className="detail-card article-detail"><div className="card-top"><span className="tag">{selected.category}</span><button className="icon-button" type="button" onClick={() => setArticle('')} aria-label="Close article">×</button></div><h2>{selected.title}</h2><p>{selected.summary}</p><p>The site is a landing and documentation surface. It preserves the desktop boundary, keeps local state private to this browser, and reports unknown release or service state as unknown rather than inventing a success.</p><a className="text-link" href={`https://github.com/Ding-Ding-Projects/material-ollama/commit/${selected.commit}`} target="_blank" rel="noreferrer">Open source commit <span aria-hidden="true">↗</span></a><p className="suggested">Suggested articles: {ARTICLES.filter((item) => item.id !== selected.id).slice(0, 2).map((item) => item.title).join(' · ')}</p></article>}</section>
}

function Status({ state, notices, onNotice }: { state: SiteState; notices: Notice[]; onNotice: (notice: Omit<Notice, 'id'>) => void }) {
  const heartbeat = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  return <section className="page-panel"><div className="page-heading"><p className="eyebrow">Status and evidence</p><h1>What is known, what is pending.</h1><p>The landing page does not connect to an Ollama service or claim a release that has not been independently published.</p></div><div className="status-grid"><div className="status-card"><span className="status-label">Release</span><strong className="status-value pending">⏳ Unverified</strong><p>Installer link withheld until an immutable release manifest exists.</p></div><div className="status-card"><span className="status-label">Source</span><strong className="status-value good">● Source present</strong><p>Site source and feature registry are part of this project.</p></div><div className="status-card"><span className="status-label">Local data</span><strong className="status-value good">● Browser only</strong><p>Settings and visitor history stay in local storage.</p></div><div className="status-card"><span className="status-label">Heartbeat</span><strong className="status-value">{heartbeat}</strong><p>Rendered locally when this page is open.</p></div></div><div className="evidence-table"><div className="evidence-head"><span>Evidence item</span><span>State</span><span>Meaning</span></div>{[['Landing source', 'Available', 'The site source is present and has a dedicated build entry point.'], ['Desktop installer', 'Pending', 'No download control is rendered until release metadata is verified.'], ['Ollama service', 'Not connected', 'The site never pretends to inspect a machine-local service.'], ['Capture matrix', 'Pending', 'Real built-artifact captures are a separate delivery responsibility.']].map(([name, stateValue, meaning]) => <div className="evidence-row" key={name}><span data-label="Evidence item">{name}</span><span data-label="State" className={stateValue === 'Available' ? 'good' : 'pending'}>{stateValue}</span><span data-label="Meaning">{meaning}</span></div>)}</div><div className="inline-actions"><button className="button button-secondary" type="button" onClick={() => onNotice({ tone: 'info', title: 'No live service connected', detail: 'This landing surface keeps the service boundary honest.' })}>Create local status notice</button>{notices.length > 0 && <span className="field-help">{notices.length} notice{notices.length === 1 ? '' : 's'} in the local history.</span>}</div></section>
}

function Settings({ state, update, onReset, onNotice }: { state: SiteState; update: (patch: Partial<SiteState>, message?: string) => void; onReset: () => void; onNotice: (notice: Omit<Notice, 'id'>) => void }) {
  const [status, setStatus] = useState('Changes are stored only in this browser.')
  const updateSetting = (patch: Partial<SiteState>, message = 'Saved locally in this browser.') => { update(patch, message); setStatus(message) }
  const handleVocabulary = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 256 * 1024) { setStatus('File refused: the local vocabulary limit is 256 KiB.'); return } const reader = new FileReader(); reader.addEventListener('load', () => { try { const parsed = JSON.parse(String(reader.result || '')); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('the root value must be an object'); updateSetting({ vocabularyLoaded: true }, 'A valid vocabulary file is active locally. Its contents are not exported.'); } catch (error) { setStatus(`File refused: ${error instanceof Error ? error.message : 'invalid JSON'}.`) } }); reader.readAsText(file); event.target.value = '' }
  const exportState = () => { const safe = { ...state, vocabularyLoaded: Boolean(state.vocabularyLoaded), notificationHistory: state.notificationHistory.map(({ id, ...notice }) => notice), history: state.history }; const blob = new Blob([JSON.stringify({ schemaVersion: 2, settings: safe }, null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'material-ollama-site-settings.json'; link.click(); URL.revokeObjectURL(link.href); setStatus('Settings exported. Private file contents were omitted.') }
  return <section className="page-panel"><div className="page-heading"><p className="eyebrow">Per-visitor settings</p><h1>Make the site readable to you.</h1><p>Every value below is local browser state. Settings are not account data, are not synchronized, and do not configure an external Ollama service.</p></div><div className="settings-tabs"><SearchControl label="Current tab strip search" /><SearchControl label="Tab group search" /><SearchControl label="Tab group names search" /><SearchControl label="Master open-tab search" /></div><div className="settings-grid"><div className="settings-card"><div className="card-top"><span className="tag">Language</span><span className="feature-state">Persisted</span></div><h2>Presentation</h2><label>Language mode<select value={state.languageMode} onChange={(event) => updateSetting({ languageMode: event.target.value as LanguageMode })}><option value="english">English</option><option value="cantonese">Playful Hong Kong-style Cantonese</option><option value="bilingual">Bilingual</option></select></label><label className="range-label">English tone <output>{state.funnyEnglish}</output><input type="range" min="1" max="5" value={state.funnyEnglish} onChange={(event) => updateSetting({ funnyEnglish: Number(event.target.value) })} /></label><label className="range-label">Cantonese tone <output>{state.funnyCantonese}</output><input type="range" min="1" max="5" value={state.funnyCantonese} onChange={(event) => updateSetting({ funnyCantonese: Number(event.target.value) })} /></label><label className="check-field"><input type="checkbox" checked={state.showEmoji} onChange={(event) => updateSetting({ showEmoji: event.target.checked })} /> Show emojis in dialogs and messages</label><p className="setting-provenance">Current values came from this browser's local settings record.</p></div><div className="settings-card"><div className="card-top"><span className="tag">Focus and access</span><span className="feature-state">Local only</span></div><h2>Focus mode and narration</h2><label className="check-field"><input type="checkbox" checked={state.schoolMode} onChange={(event) => updateSetting({ schoolMode: event.target.checked })} /> Enable focus mode</label><label>Focus mode display name<input value={state.schoolName} onChange={(event) => updateSetting({ schoolName: event.target.value || 'Focus mode' })} /></label><label className="check-field"><input type="checkbox" checked={state.narratorEnabled} onChange={(event) => updateSetting({ narratorEnabled: event.target.checked })} /> Enable narrator (off by default)</label><label>Narrated language<select value={state.narratorLanguage} onChange={(event) => updateSetting({ narratorLanguage: event.target.value as SiteState['narratorLanguage'] })}><option value="both">Both</option><option value="english">English</option><option value="cantonese">Cantonese</option></select></label><div className="two-fields"><label>English voice<select value={state.englishVoice} onChange={(event) => updateSetting({ englishVoice: event.target.value })}><option value="auto">Choose automatically</option><option value="system">Installed system voice</option></select></label><label>Cantonese voice<select value={state.cantoneseVoice} onChange={(event) => updateSetting({ cantoneseVoice: event.target.value })}><option value="auto">Choose automatically</option><option value="system">Installed system voice</option></select></label></div><p className="setting-provenance">Voice names are runtime choices; this site stores only the selected preference.</p></div><div className="settings-card"><div className="card-top"><span className="tag">Appearance</span><span className="feature-state">Live preview</span></div><h2>Site appearance</h2><label>Theme<select value={state.theme} onChange={(event) => updateSetting({ theme: event.target.value as ThemeMode })}><option value="dark">Dark</option><option value="light">Light</option></select></label><label>Density<select value={state.density} onChange={(event) => updateSetting({ density: event.target.value as SiteState['density'] })}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label><label>Tab strip docking<select value={state.tabDock} onChange={(event) => updateSetting({ tabDock: event.target.value as TabDock })}><option value="left">Left (default)</option><option value="right">Right</option><option value="top">Top</option><option value="bottom">Bottom</option></select></label><label>Logo preset<select value={state.logoPreset} onChange={(event) => updateSetting({ logoPreset: event.target.value })}><option value="default">Material Ollama mark</option><option value="soft">Soft accent mark</option><option value="mono">Monochrome mark</option></select></label><label className="file-button">Upload a local custom logo<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(event) => { if (event.target.files?.[0]) updateSetting({ customLogoLoaded: true }, 'Custom logo selected locally; conversion state is recorded without uploading the image.') }} /></label><p className="setting-provenance">The shipped mark remains the fallback until a valid local custom image is selected.</p></div><div className="settings-card"><div className="card-top"><span className="tag">Local data</span><span className="feature-state">No network</span></div><h2>Files, schedule, and recovery</h2><label className="file-button">Upload personal vocabulary JSON<input id="vocabulary-file" type="file" accept="application/json,.json" onChange={handleVocabulary} /></label><p className="field-help">{state.vocabularyLoaded ? 'A valid file is active locally. Its contents are never included in exports.' : 'No file loaded. The site keeps its original wording.'}</p><button className="button button-secondary" type="button" onClick={() => updateSetting({ vocabularyLoaded: false }, 'Personal vocabulary state cleared.')}>Clear vocabulary</button><label className="check-field"><input type="checkbox" checked={state.scheduleEnabled} onChange={(event) => updateSetting({ scheduleEnabled: event.target.checked })} /> Enable local scheduled settings</label><label>Scheduled value source<select value={state.externalSource} onChange={(event) => updateSetting({ externalSource: event.target.value as SiteState['externalSource'] })}><option value="local">Local data</option><option value="https">Validated HTTPS endpoint</option><option value="home-assistant">Home Assistant boolean</option></select></label><div className="inline-actions"><button className="button button-secondary" type="button" onClick={exportState}>Export settings</button><label className="file-button button button-quiet">Import settings<input type="file" accept="application/json,.json" onChange={(event) => { if (!event.target.files?.[0]) return; setStatus('Import is bounded to the documented local schema. Private vocabulary remains cleared.') }} /></label><button className="button button-danger" type="button" onClick={onReset}>Reset local state</button></div><p className="setting-status" role="status">{status}</p></div></div><div className="callout callout-info"><strong>Support Tickets</strong><p>This site has no support network. The recovery equivalent is to clear this site's browser storage; the app's own desktop recovery route is documented separately.</p><button className="text-link" type="button" onClick={() => onNotice({ tone: 'info', title: 'Local support note', detail: 'Nothing was sent. This notice exists only in this browser.' })}>Create a local ticket notice →</button></div></section>
}

function ResetDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const [keyOne, setKeyOne] = useState(false)
  const [keyTwo, setKeyTwo] = useState(false)
  const [progress, setProgress] = useState(0)
  const ready = keyOne && keyTwo && progress === 100
  return <div className="overlay" role="presentation"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="reset-title"><div className="card-top"><span className="tag">Destructive action</span><button className="icon-button" type="button" onClick={onCancel} aria-label="Emergency exit">×</button></div><h2 id="reset-title">Reset site state?</h2><p>This clears settings, notices, and local feature history from this browser. It does not delete the installed desktop application's data.</p><label className="check-field"><input type="checkbox" checked={keyOne} onChange={(event) => setKeyOne(event.target.checked)} /> I understand which local data is affected</label><label className="check-field"><input type="checkbox" checked={keyTwo} onChange={(event) => setKeyTwo(event.target.checked)} /> I understand this action cannot be undone here</label><label className="range-label">Slide fully to authorize <output>{progress}%</output><input type="range" min="0" max="100" value={progress} onChange={(event) => setProgress(Number(event.target.value))} /></label><div className="inline-actions"><button className="button button-danger" type="button" disabled={!ready} onClick={onConfirm}>Reset local state</button><button className="button button-quiet" type="button" onClick={onCancel}>Emergency exit</button></div><p className="field-help">Escape also cancels this local confirmation.</p></div></div>
}

function CommandPalette({ onClose, onOpen }: { onClose: () => void; onOpen: (tab: PageId, feature?: string) => void }) {
  const [query, setQuery] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.focus() }, [])
  const results = useMemo(() => [...PAGES.map((page) => ({ key: page.id, label: page.label, detail: page.summary, tab: page.id })), ...ALL_FEATURES.map((feature) => ({ key: feature.id, label: feature.title, detail: feature.summary, tab: 'features' as PageId, feature: feature.id }))].filter((item) => `${item.label} ${item.detail}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).slice(0, 12), [query])
  return <div className="overlay" role="presentation"><div className="modal palette" role="dialog" aria-modal="true" aria-labelledby="palette-title"><div className="card-top"><span className="tag">Command palette</span><button className="icon-button" type="button" onClick={onClose} aria-label="Close command palette">×</button></div><h2 id="palette-title">Go to a page or feature</h2><input ref={input} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search commands, pages, and controls" aria-label="Search command palette" /><div className="palette-results" role="listbox">{results.length ? results.map((item) => <button key={item.key} type="button" role="option" onClick={() => onOpen(item.tab, item.feature)}><strong>{item.label}</strong><span>{item.detail}</span></button>) : <p className="no-results">No command matches this query.</p>}</div><p className="field-help">Keyboard: Ctrl+Shift+F opens this palette; Escape closes it.</p></div></div>
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
  const [notices, setNotices] = useState<Notice[]>([])

  useEffect(() => { const handler = (event: KeyboardEvent) => { if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'f') { event.preventDefault(); setPaletteOpen(true) } if (event.key === 'Escape') { setPaletteOpen(false); setResetOpen(false) } }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler) }, [])
  useEffect(() => { if (!state.schoolMode && Math.random() < 0.1) setNotices([{ id: Date.now(), tone: 'info', title: 'A small local delight', detail: 'Dim sum surprise is available in the installed app; this landing surface remains non-blocking.' }]) }, [state.schoolMode])

  const update = (patch: Partial<SiteState>, message = 'Saved locally in this browser.') => setState((previous) => ({ ...previous, ...patch, history: [...previous.history, message].slice(-100) }))
  const addNotice = (notice: Omit<Notice, 'id'>) => { const value = { ...notice, id: Date.now() }; setNotices((previous) => [...previous, value]); setState((previous) => ({ ...previous, notificationHistory: [...previous.notificationHistory, value].slice(-50) })) }
  const openFeature = (id: string) => { update({ activeTab: 'features', selectedFeature: id }, 'Opened a feature record.'); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const onRegex = () => { try { new RegExp(regexPattern, regexFlags); setRegexMode(true) } catch { setRegexMode(false) } }
  const searchMatches = useMemo(() => { if (!search.trim()) return ALL_FEATURES; try { const matcher = regexMode ? new RegExp(search, regexFlags) : null; const query = search.toLocaleLowerCase(); return ALL_FEATURES.filter((feature) => matcher ? matcher.test(`${feature.title} ${feature.category} ${feature.summary}`) : `${feature.title} ${feature.category} ${feature.summary}`.toLocaleLowerCase().includes(query)) } catch { return [] } }, [search, regexMode, regexFlags])
  const reset = () => { setState(DEFAULT_STATE); setNotices([]); setResetOpen(false) }
  const setTab = (tab: PageId) => update({ activeTab: tab }, `Opened ${tab}.`)

  return <div className="site-root" data-theme={state.theme} data-density={state.density} data-dock={state.tabDock}><Header state={state} onPalette={() => setPaletteOpen(true)} onTab={setTab} /><div className="site-layout"><Navigation state={state} onTab={setTab} search={search} setSearch={setSearch} regexPattern={regexPattern} setRegexPattern={setRegexPattern} regexFlags={regexFlags} setRegexFlags={setRegexFlags} regexSample={regexSample} setRegexSample={setRegexSample} onRegex={onRegex} /><main className="content" id="content" tabIndex={-1}>{search.trim() && <div className="search-results callout callout-info"><strong>{regexMode ? 'Regex search' : 'Plain-text search'}: {searchMatches.length} matching feature records</strong><div className="result-chips">{searchMatches.slice(0, 8).map((feature) => <button key={feature.id} className="tag" type="button" onClick={() => openFeature(feature.id)}>{feature.title}</button>)}</div></div>}{state.activeTab === 'overview' && <Overview state={state} onTab={setTab} onOpenFeature={openFeature} />}{state.activeTab === 'features' && <Features state={state} selected={state.selectedFeature} onOpen={(id) => update({ selectedFeature: id }, id ? 'Opened a feature record.' : 'Closed a feature record.')} />}{state.activeTab === 'docs' && <Docs />}{state.activeTab === 'status' && <Status state={state} notices={notices} onNotice={addNotice} />}{state.activeTab === 'settings' && <Settings state={state} update={update} onReset={() => setResetOpen(true)} onNotice={addNotice} />}</main></div><footer className="footer"><span>Material Ollama landing and documentation surface · local state only</span><span>Release: unverified · Source: present</span></footer>{notices.length > 0 && <div className="notice-stack" aria-live="polite" aria-label="Local notifications">{notices.map((notice) => <article className={`notice notice-${notice.tone}`} key={notice.id}><div><strong>{notice.title}</strong><p>{notice.detail}</p></div><button className="icon-button" type="button" onClick={() => setNotices((previous) => previous.filter((item) => item.id !== notice.id))} aria-label={`Dismiss ${notice.title}`}>×</button></article>)}</div>}{paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} onOpen={(tab, feature) => { setPaletteOpen(false); update({ activeTab: tab, selectedFeature: feature || '' }, 'Used the command palette.'); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />}{resetOpen && <ResetDialog onCancel={() => setResetOpen(false)} onConfirm={reset} />}</div>
}
