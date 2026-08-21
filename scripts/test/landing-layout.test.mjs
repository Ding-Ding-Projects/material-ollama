#!/usr/bin/env node
// Focused source checks for the static Pages overview layout.
// Run with: node --test scripts/test/landing-layout.test.mjs

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import assert from 'node:assert/strict'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const LANDING_HTML_PATH = path.join(REPO_ROOT, 'docs', 'landing-site', 'index.html')
const LANDING_CSS_PATH = path.join(REPO_ROOT, 'docs', 'landing-site', 'styles.css')

function assertOverviewLayout(html, css) {
  const calloutStart = html.indexOf('<div class="callout callout-info" data-searchable="verified release scallop har gow installer image">')
  assert.notEqual(calloutStart, -1, 'overview release callout must remain present')
  const calloutEnd = html.indexOf('<div class="feature-section">', calloutStart)
  assert.notEqual(calloutEnd, -1, 'overview release callout must remain before the surface map')
  const callout = html.slice(calloutStart, calloutEnd)
  const bodyStart = callout.indexOf('<div class="callout-body">')
  assert.notEqual(bodyStart, -1, 'overview release callout must wrap its heading and paragraphs in one body')
  const bodyEnd = callout.lastIndexOf('</div>')
  assert.ok(bodyEnd > bodyStart, 'overview release callout body must close inside the callout')
  const body = callout.slice(bodyStart, bodyEnd)
  assert.match(body, /<div class="callout-body">\s*<strong>/)
  assert.equal((body.match(/<p\b/g) ?? []).length, 2, 'release evidence must keep both paragraphs in the body')
  assert.doesNotMatch(callout, /callout-info">\s*<strong>/, 'release heading must not be a sibling flex item')

  assert.match(css, /\.callout\s*\{[^}]*display:\s*flex;[^}]*min-width:\s*0;/s)
  assert.match(css, /\.callout-body\s*\{[^}]*flex:\s*1 1 auto;[^}]*min-width:\s*0;/s)
  assert.match(css, /\.callout code\s*\{[^}]*overflow-wrap:\s*anywhere;[^}]*word-break:\s*break-word;/s)
  assert.match(css, /@media\s*\(max-width:\s*800px\)[\s\S]*?\.tab-list\s*\{[^}]*overflow-x:\s*auto;/s,
    'mobile tab navigation must retain intentional horizontal scrolling')

  assert.match(html, /<label for="site-search-input">Search this site<\/label>/)
  assert.doesNotMatch(html, /id="site-search-input"[^>]*aria-label=/,
    'the search input is already labelled by its native label and needs no duplicate aria-label')
}

test('overview release callout stays contained at desktop and mobile widths', () => {
  const html = readFileSync(LANDING_HTML_PATH, 'utf8')
  const css = readFileSync(LANDING_CSS_PATH, 'utf8')
  assertOverviewLayout(html, css)
})

test('layout contract turns red for body, wrapping, and tab-overflow mutations', () => {
  const html = readFileSync(LANDING_HTML_PATH, 'utf8')
  const css = readFileSync(LANDING_CSS_PATH, 'utf8')
  assertOverviewLayout(html, css)

  assert.throws(
    () => assertOverviewLayout(html.replace('<div class="callout-body">', ''), css),
    /callout-body|wrap its heading/,
    'removing the body wrapper must be detected',
  )
  assert.throws(
    () => assertOverviewLayout(html, css.replace('overflow-wrap: anywhere;', 'overflow-wrap: normal;')),
    /overflow-wrap|\.callout code/,
    'removing safe long-code wrapping must be detected',
  )
  assert.throws(
    () => assertOverviewLayout(html, css.replace('overflow-x: auto;', 'overflow-x: visible;')),
    /horizontal scrolling|\.tab-list/,
    'removing intentional tab-list overflow must be detected',
  )
})
