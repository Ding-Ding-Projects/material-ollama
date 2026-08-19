'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { SiteChrome } from '@/content/shared/SiteChrome'
import docsData from '@/content/docs-articles.json'
import { ArticleMarkdown } from './markdown'
import { RegexBuilder } from './RegexBuilder'

type Section = { id: string; heading: string; text: string; isTodo: boolean }
type Article = {
  id: string
  title: string
  category: string
  sourcePath: string
  isScaffoldOnly: boolean
  sections: Section[]
}
type Category = { id: string; name: string; count: number }
type DocsData = { schemaVersion: number; sourceInventory: string; articleCount: number; categories: Category[]; articles: Article[] }

const data = docsData as DocsData
const SOURCE_BASE_URL = 'https://github.com/Ding-Ding-Projects/material-ollama/blob/main/'

function articleHaystack(article: Article) {
  const written = article.sections.filter((section) => !section.isTodo).map((section) => section.text)
  return [article.title, ...written].join('\n').toLowerCase()
}

function readInitialArticleId(): string {
  if (typeof window === 'undefined') return data.articles[0]?.id ?? ''
  const params = new URLSearchParams(window.location.search)
  const requested = params.get('article')
  if (requested && data.articles.some((article) => article.id === requested)) return requested
  return data.articles[0]?.id ?? ''
}

export default function DocsClient() {
  const [query, setQuery] = useState('')
  const [regexActive, setRegexActive] = useState(false)
  const [pattern, setPattern] = useState('')
  const [flags, setFlags] = useState('i')
  const [sample, setSample] = useState('tab groups and the regex builder')
  const [selectedId, setSelectedId] = useState('')
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())
  const articleRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setSelectedId(readInitialArticleId())
  }, [])

  const selectArticle = (id: string) => {
    setSelectedId(id)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.set('article', id)
      window.history.replaceState(null, '', url)
    }
    articleRef.current?.focus()
  }

  const regexError = useMemo(() => {
    if (!regexActive) return null
    try {
      // eslint-disable-next-line no-new
      new RegExp(pattern, flags)
      return null
    } catch (error) {
      return error instanceof Error ? error.message : 'Invalid pattern'
    }
  }, [regexActive, pattern, flags])

  const matches = useMemo(() => {
    const trimmed = query.trim()
    if (!trimmed) return data.articles
    if (regexActive) {
      if (regexError) return []
      const regex = new RegExp(pattern, flags.includes('g') ? flags : `${flags}g`)
      return data.articles.filter((article) => regex.test(articleHaystack(article)))
    }
    const needle = trimmed.toLowerCase()
    return data.articles.filter((article) => articleHaystack(article).includes(needle))
  }, [query, regexActive, pattern, flags, regexError])

  const matchIds = useMemo(() => new Set(matches.map((article) => article.id)), [matches])

  const grouped = useMemo(() => {
    return data.categories.map((category) => ({
      category,
      articles: data.articles.filter((article) => article.category === category.id),
    }))
  }, [])

  const selected = data.articles.find((article) => article.id === selectedId) || data.articles[0]

  const toggleCategory = (id: string) => {
    setCollapsedCategories((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <SiteChrome activeHref="/docs">
      <style>{`
        @media (max-width: 760px) {
          .docs-layout { grid-template-columns: 1fr !important; }
        }
        .docs-drawer .feature-state.pending { margin-left: .5rem; }
      `}</style>
      <section className="page-panel">
        <div className="page-heading">
          <p className="eyebrow">Offline documentation</p>
          <h1>All {data.articleCount} feature articles, in one place.</h1>
          <p>
            Every article below is bundled into this build -- nothing here is fetched over the network. Search filters
            the drawer locally, in plain text by default or with a real regular expression through the builder.
          </p>
        </div>

        <div className="toolbar">
          <label htmlFor="docs-search">Search articles</label>
          <input
            id="docs-search"
            type="search"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setRegexActive(false) }}
            placeholder="Search titles and written sections"
          />
        </div>
        <RegexBuilder
          pattern={pattern}
          flags={flags}
          sample={sample}
          onPattern={setPattern}
          onFlags={setFlags}
          onSample={setSample}
          onApply={() => { setQuery(pattern); setRegexActive(true) }}
        />
        <p className="field-help" aria-live="polite">
          {regexActive
            ? (regexError ? `Regex search: pattern error -- ${regexError}` : `Regex search: ${matches.length} of ${data.articleCount} articles match.`)
            : query.trim()
              ? `Plain-text search: ${matches.length} of ${data.articleCount} articles match.`
              : `Showing all ${data.articleCount} articles across ${data.categories.length} groups.`}
        </p>

        <div className="docs-layout" style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: 'minmax(220px, 300px) minmax(0, 1fr)', marginTop: '1.2rem', alignItems: 'start' }}>
          <nav aria-label="Feature articles, grouped by topic" className="docs-drawer" style={{ display: 'grid', gap: '.6rem' }}>
            {grouped.map(({ category, articles }) => {
              const visible = articles.filter((article) => matchIds.has(article.id))
              if (visible.length === 0) return null
              const collapsed = collapsedCategories.has(category.id)
              return (
                <div key={category.id} className="settings-card" style={{ padding: '.8rem' }}>
                  <button
                    type="button"
                    className="tab-button"
                    aria-expanded={!collapsed}
                    onClick={() => toggleCategory(category.id)}
                    style={{ fontWeight: 800 }}
                  >
                    <span aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
                    <span>{category.name} ({visible.length})</span>
                  </button>
                  {!collapsed && (
                    <ul style={{ listStyle: 'none', margin: '.3rem 0 0', padding: 0, display: 'grid', gap: '.2rem' }}>
                      {visible.map((article) => (
                        <li key={article.id}>
                          <button
                            type="button"
                            className={`tab-button ${selected?.id === article.id ? 'is-active' : ''}`}
                            aria-current={selected?.id === article.id ? 'page' : undefined}
                            onClick={() => selectArticle(article.id)}
                            style={{ paddingLeft: '1.6rem', minHeight: '38px' }}
                          >
                            <span>{article.title}</span>
                            {article.isScaffoldOnly && <span className="feature-state pending">not yet written</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
            {matches.length === 0 && <p className="no-results">No articles match this search.</p>}
          </nav>

          <div className="article-detail detail-card" ref={articleRef} tabIndex={-1} aria-live="polite">
            {selected ? <ArticleView article={selected} /> : <p>No article selected.</p>}
          </div>
        </div>
      </section>
    </SiteChrome>
  )
}

function ArticleView({ article }: { article: Article }) {
  if (article.isScaffoldOnly) {
    return (
      <>
        <p className="eyebrow">{article.category}</p>
        <h2>{article.title}</h2>
        <div className="callout callout-warning">
          <strong>Article not yet written</strong>
          <p>
            This feature is registered in the canonical inventory but its documentation article is still an
            unwritten scaffold. Rendering the generated placeholder text here would look like real documentation
            when it is not, so this page says so plainly instead.
          </p>
        </div>
      </>
    )
  }

  return (
    <>
      <p className="eyebrow">{article.category}</p>
      <h2>{article.title}</h2>
      {article.sections.map((section) => (
        <div key={section.id} style={{ marginTop: '1.1rem' }}>
          <h3 style={{ fontSize: '1.02rem', margin: '0 0 .4rem' }}>{section.heading}</h3>
          {section.isTodo ? (
            <p className="field-help" style={{ fontStyle: 'italic' }}>Not yet documented.</p>
          ) : (
            <ArticleMarkdown text={section.text} />
          )}
        </div>
      ))}
      <div className="suggested">
        <a className="text-link" href={`${SOURCE_BASE_URL}${article.sourcePath}`} target="_blank" rel="noreferrer">
          View the source article on GitHub
        </a>
      </div>
    </>
  )
}
