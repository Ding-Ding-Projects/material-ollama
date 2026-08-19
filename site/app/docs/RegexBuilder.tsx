'use client'

// A real regex builder for the documentation search field: guided insertion for literals,
// character classes, anchors, groups, alternation, and quantifiers, plus a raw pattern editor,
// explicit per-flag toggles, sample text, live syntax feedback, and live matches with capture
// groups. Everything evaluates locally against the sample text only -- nothing here is sent
// anywhere, and the article corpus itself is only ever searched after "Use pattern" is pressed.
import { useMemo, useRef, useState, type ReactNode } from 'react'

const FLAG_OPTIONS: Array<{ flag: string; label: string }> = [
  { flag: 'g', label: 'Global (all matches)' },
  { flag: 'i', label: 'Case-insensitive' },
  { flag: 'm', label: 'Multiline (^/$ per line)' },
  { flag: 's', label: 'Dot matches newline' },
  { flag: 'u', label: 'Unicode' },
]

const QUANTIFIERS = [
  { insert: '*', label: '* (0 or more)' },
  { insert: '+', label: '+ (1 or more)' },
  { insert: '?', label: '? (0 or 1)' },
  { insert: '{2,4}', label: '{2,4} (range)' },
]
const ANCHORS = [
  { insert: '^', label: '^ start' },
  { insert: '$', label: '$ end' },
  { insert: '\\b', label: '\\b word boundary' },
]
const CLASSES = [
  { insert: '\\d', label: '\\d digit' },
  { insert: '\\w', label: '\\w word char' },
  { insert: '\\s', label: '\\s whitespace' },
  { insert: '.', label: '. any char' },
]
const GROUPS = [
  { insert: '(…)', label: '(…) capture group' },
  { insert: '(?:…)', label: '(?:…) non-capturing group' },
  { insert: '|', label: '| alternation' },
]

function escapeLiteral(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function RegexBuilder({
  pattern,
  flags,
  sample,
  onPattern,
  onFlags,
  onSample,
  onApply,
}: {
  pattern: string
  flags: string
  sample: string
  onPattern: (value: string) => void
  onFlags: (value: string) => void
  onSample: (value: string) => void
  onApply: () => void
}) {
  const patternRef = useRef<HTMLInputElement>(null)
  const [literalDraft, setLiteralDraft] = useState('')
  const [copied, setCopied] = useState(false)

  const insertAtCursor = (token: string) => {
    const input = patternRef.current
    const start = input?.selectionStart ?? pattern.length
    const end = input?.selectionEnd ?? pattern.length
    const next = pattern.slice(0, start) + token + pattern.slice(end)
    onPattern(next)
    // Restore focus and a sensible cursor position after the inserted token on the next tick,
    // once React has committed the new value.
    requestAnimationFrame(() => {
      input?.focus()
      const caret = start + token.length
      input?.setSelectionRange(caret, caret)
    })
  }

  const activeFlags = new Set(flags.split(''))
  const toggleFlag = (flag: string) => {
    const next = new Set(activeFlags)
    if (next.has(flag)) next.delete(flag)
    else next.add(flag)
    onFlags(FLAG_OPTIONS.filter((option) => next.has(option.flag)).map((option) => option.flag).join(''))
  }

  const preview = useMemo(() => {
    if (!pattern) return { status: 'idle' as const, message: 'Enter a pattern, or use a guided insert below, to preview it.' }
    try {
      const regex = new RegExp(pattern, flags.includes('g') ? flags : `${flags}g`)
      const matches = [...sample.matchAll(regex)].slice(0, 20)
      if (matches.length === 0) return { status: 'no-match' as const, message: 'No matches in the sample text.' }
      return {
        status: 'match' as const,
        message: `${matches.length} match${matches.length === 1 ? '' : 'es'} in the sample text.`,
        matches,
      }
    } catch (error) {
      return { status: 'error' as const, message: `Pattern error: ${error instanceof Error ? error.message : 'invalid expression'}` }
    }
  }, [pattern, flags, sample])

  const copyPattern = async () => {
    try {
      await navigator.clipboard.writeText(pattern)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <details className="regex-builder">
      <summary>.* Regex builder</summary>
      <div className="regex-body">
        <p>Plain text is the default for this search. Build a real pattern below, or type one directly, then press &ldquo;Use pattern&rdquo; to search the 85 articles with it.</p>

        <label htmlFor="docs-regex-pattern">Pattern</label>
        <input
          id="docs-regex-pattern"
          ref={patternRef}
          value={pattern}
          onChange={(event) => onPattern(event.target.value)}
          placeholder="tab(s)?\s+(group|search)"
        />

        <fieldset style={{ border: 0, margin: '.6rem 0 0', padding: 0 }}>
          <legend className="field-help" style={{ margin: '0 0 .3rem' }}>Flags</legend>
          <div className="hero-actions" role="group" aria-label="Regex flags">
            {FLAG_OPTIONS.map((option) => (
              <label key={option.flag} className="check-field">
                <input
                  type="checkbox"
                  checked={activeFlags.has(option.flag)}
                  onChange={() => toggleFlag(option.flag)}
                />
                <span>{option.flag} &mdash; {option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="two-fields" style={{ marginTop: '.65rem' }}>
          <label>
            Insert a literal (special characters escaped automatically)
            <input value={literalDraft} onChange={(event) => setLiteralDraft(event.target.value)} placeholder="e.g. tab.group" />
          </label>
          <div style={{ alignSelf: 'end' }}>
            <button
              type="button"
              className="button button-secondary"
              disabled={!literalDraft}
              onClick={() => { insertAtCursor(escapeLiteral(literalDraft)); setLiteralDraft('') }}
            >
              Insert literal
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gap: '.5rem', marginTop: '.75rem' }}>
          <div>
            <span className="field-help">Character classes</span>
            <div className="hero-actions">
              {CLASSES.map((item) => (
                <button key={item.insert} type="button" className="button button-quiet" onClick={() => insertAtCursor(item.insert)}>{item.label}</button>
              ))}
            </div>
          </div>
          <div>
            <span className="field-help">Anchors</span>
            <div className="hero-actions">
              {ANCHORS.map((item) => (
                <button key={item.insert} type="button" className="button button-quiet" onClick={() => insertAtCursor(item.insert)}>{item.label}</button>
              ))}
            </div>
          </div>
          <div>
            <span className="field-help">Groups &amp; alternation</span>
            <div className="hero-actions">
              {GROUPS.map((item) => (
                <button key={item.insert} type="button" className="button button-quiet" onClick={() => insertAtCursor(item.insert)}>{item.label}</button>
              ))}
            </div>
          </div>
          <div>
            <span className="field-help">Quantifiers</span>
            <div className="hero-actions">
              {QUANTIFIERS.map((item) => (
                <button key={item.insert} type="button" className="button button-quiet" onClick={() => insertAtCursor(item.insert)}>{item.label}</button>
              ))}
            </div>
          </div>
        </div>

        <label htmlFor="docs-regex-sample" style={{ marginTop: '.65rem', display: 'block' }}>Sample text</label>
        <input id="docs-regex-sample" value={sample} onChange={(event) => onSample(event.target.value)} />

        <p className={preview.status === 'error' ? 'inline-error' : 'inline-status'} aria-live="polite">{preview.message}</p>
        {preview.status === 'match' && (
          <ul style={{ margin: '.3rem 0 0', paddingLeft: '1.1rem' }}>
            {preview.matches.map((match, index) => (
              <li key={index} style={{ fontSize: '.78rem', color: 'var(--muted)' }}>
                <code>{match[0]}</code>
                {match.length > 1 && (
                  <span> &mdash; groups: {match.slice(1).map((group, groupIndex) => (
                    <code key={groupIndex}>{group ?? '∅'}</code>
                  )).reduce((acc: ReactNode[], node, i) => (i === 0 ? [node] : [...acc, ', ', node]), [] as ReactNode[])}</span>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="inline-actions">
          <button className="button button-primary" type="button" onClick={onApply} disabled={preview.status === 'error' || !pattern}>Use pattern</button>
          <button className="button button-secondary" type="button" onClick={copyPattern} disabled={!pattern}>{copied ? 'Copied' : 'Copy pattern'}</button>
        </div>
      </div>
    </details>
  )
}
