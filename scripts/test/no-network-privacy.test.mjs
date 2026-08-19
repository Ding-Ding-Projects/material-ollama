#!/usr/bin/env node
// scripts/test/no-network-privacy.test.mjs
//
// Unit-tests the pure URL-classification helpers scripts/capture/lib.mjs
// adds for the no-network-privacy contract (isLoopbackHostname,
// classifyRequestUrl, assertLoopbackOnly) directly, with synthetic URLs --
// no CDP connection, no running app, no headless desktop. This is the
// fast, always-runnable half of the evidence; the slow half (a real
// capture run recording the built app's own actual Network.
// requestWillBeSent events and asserting THOSE are loopback-only) is
// scripts/capture/audit-network.mjs, whose result is recorded in
// docs/features/uh-completeness/captures/manifest.json's `networkAudit`
// field -- see docs/features/uh-completeness/articles/
// no-network-privacy.md for how the two fit together.
//
// Run with: node --test scripts/test/no-network-privacy.test.mjs

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import assert from 'node:assert/strict'
import { isLoopbackHostname, classifyRequestUrl, assertLoopbackOnly } from '../capture/lib.mjs'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const MANIFEST_PATH = path.join(REPO_ROOT, 'docs', 'features', 'uh-completeness', 'captures', 'manifest.json')

test('isLoopbackHostname accepts localhost, the whole 127.0.0.0/8 block, and ::1', () => {
  assert.equal(isLoopbackHostname('localhost'), true)
  assert.equal(isLoopbackHostname('LOCALHOST'), true)
  assert.equal(isLoopbackHostname('127.0.0.1'), true)
  assert.equal(isLoopbackHostname('127.0.0.2'), true) // whole 127.0.0.0/8 block, not just .1
  assert.equal(isLoopbackHostname('127.255.255.255'), true)
  assert.equal(isLoopbackHostname('::1'), true)
  assert.equal(isLoopbackHostname('[::1]'), true)
})

test('isLoopbackHostname rejects a real external or private-network host', () => {
  assert.equal(isLoopbackHostname('example.com'), false)
  assert.equal(isLoopbackHostname('fonts.googleapis.com'), false)
  assert.equal(isLoopbackHostname('192.168.1.1'), false) // real LAN, not loopback
  assert.equal(isLoopbackHostname('10.0.0.1'), false)
  assert.equal(isLoopbackHostname('8.8.8.8'), false)
  assert.equal(isLoopbackHostname('1.127.0.0.1'), false) // not actually a 127.x address
})

test('classifyRequestUrl passes a loopback http(s) URL at any port', () => {
  assert.equal(classifyRequestUrl('http://127.0.0.1:54321/api/v1/hardware').ok, true)
  assert.equal(classifyRequestUrl('http://localhost:8080/').ok, true)
  assert.equal(classifyRequestUrl('https://127.0.0.1/x').ok, true)
})

test('classifyRequestUrl passes data: and blob: URLs unconditionally (never a network request)', () => {
  assert.equal(classifyRequestUrl('data:image/png;base64,iVBORw0KGgo=').ok, true)
  assert.equal(classifyRequestUrl('blob:http://127.0.0.1:1234/some-uuid').ok, true)
})

test('classifyRequestUrl fails a real external host', () => {
  const result = classifyRequestUrl('https://fonts.googleapis.com/css2?family=Roboto')
  assert.equal(result.ok, false)
  assert.match(result.reason, /non-loopback host/)
})

test('classifyRequestUrl fails a private-LAN host too, not only public internet hosts', () => {
  // A private 192.168.x.x/10.x.x.x address is still a REAL network hop
  // off this machine -- the no-network-privacy contract is "loopback
  // only," not "no public internet," so a LAN address must fail exactly
  // like a public one.
  const result = classifyRequestUrl('http://192.168.1.50:11434/api/tags')
  assert.equal(result.ok, false)
})

test('classifyRequestUrl reports (never throws on) an unparseable URL', () => {
  const result = classifyRequestUrl('not a url at all')
  assert.equal(result.ok, false)
  assert.match(result.reason, /not a parseable URL/)
})

test('assertLoopbackOnly is ok=true only when every single URL is loopback', () => {
  const allLocal = assertLoopbackOnly([
    'http://127.0.0.1:5555/api/v1/models/installed',
    'http://localhost:5555/favicon.ico',
    'data:image/svg+xml;base64,AAAA',
  ])
  assert.equal(allLocal.ok, true)
  assert.equal(allLocal.total, 3)
  assert.deepEqual(allLocal.offenders, [])
})

test('assertLoopbackOnly is ok=false and names every offender when even one request left the machine', () => {
  const mixed = assertLoopbackOnly([
    'http://127.0.0.1:5555/api/v1/models/installed',
    'https://fonts.gstatic.com/s/roboto/v1/font.woff2',
    'https://api.example.com/telemetry',
  ])
  assert.equal(mixed.ok, false)
  assert.equal(mixed.total, 3)
  assert.equal(mixed.offenders.length, 2)
  assert.ok(mixed.offenders.every((o) => !o.ok))
})

// The real built-artifact half of this contract's evidence: the recorded
// result of an actual run of scripts/capture/audit-network.mjs against
// the real dist/windows-ollama-app-amd64.exe. This test reads that
// already-produced record rather than re-running the (slow, headless-
// desktop-dependent) audit itself -- exactly the same relationship the
// screenshot captures have to drive.mjs. Skips (rather than fails) when
// no manifest exists yet, e.g. on a checkout that has never built the app.
test('the recorded network audit in the capture manifest found zero non-loopback requests', (t) => {
  if (!existsSync(MANIFEST_PATH)) {
    t.skip('no docs/features/uh-completeness/captures/manifest.json on this checkout yet -- run ' + 'scripts/capture/audit-network.mjs after building dist/windows-ollama-app-amd64.exe')
    return
  }
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
  if (!manifest.networkAudit) {
    t.skip('manifest.json has no networkAudit field yet -- run scripts/capture/audit-network.mjs')
    return
  }
  const audit = manifest.networkAudit
  // Two capture lanes wrote different field names for the same record; the
  // one that survived the merge reports allLoopback/offenderCount/
  // uniqueRequestCount. Read the shape that is actually on disk rather than
  // editing the evidence to match the test.
  assert.equal(audit.allLoopback, true, `network audit recorded offenders: ${JSON.stringify(audit.offenderCount)}`)
  assert.ok(audit.uniqueRequestCount > 0, 'expected the audit to have recorded at least one real request')
  assert.equal(audit.offenderCount, 0)
  // Re-classify every recorded URL independently, rather than trusting
  // the `ok` field alone -- this is the same assertLoopbackOnly() the
  // audit script itself used, run again here against the exact recorded
  // list, so a manifest hand-edited to say ok:true without the URLs
  // actually being loopback would still be caught.
  // The surviving record stores full request objects under uniqueRequests,
  // not a bare requestUrls list. assertLoopbackOnly accepts either shape.
  const reclassified = assertLoopbackOnly(audit.uniqueRequests)
  assert.equal(reclassified.ok, true)
  assert.deepEqual(reclassified.offenders, [])
})
