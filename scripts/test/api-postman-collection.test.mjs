#!/usr/bin/env node
// scripts/test/api-postman-collection.test.mjs
//
// Proves the committed Postman collection (docs/api/app-http-api.
// postman_collection.json) is a genuine, current, well-formed rendering
// of app/ui/ui.go's real mux.Handle(...) registrations -- not a
// hand-written approximation that can silently drift from the server.
//
// Run with: node --test scripts/test/api-postman-collection.test.mjs

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import assert from 'node:assert/strict'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const GENERATOR = path.join(REPO_ROOT, 'scripts', 'generate-postman-collection.mjs')
const COLLECTION_PATH = path.join(REPO_ROOT, 'docs', 'api', 'app-http-api.postman_collection.json')
const UI_GO_PATH = path.join(REPO_ROOT, 'app', 'ui', 'ui.go')

test('the committed collection is byte-identical to what the generator produces from app/ui/ui.go right now', () => {
  // --check re-derives the collection from the real source file on disk
  // and exits non-zero on any drift -- this is the same command a commit
  // hook or CI would run, so this test is proving the actual release-gate
  // command works, not a parallel reimplementation of it.
  const result = execFileSync('node', [GENERATOR, '--check'], { cwd: REPO_ROOT, encoding: 'utf8' })
  const parsed = JSON.parse(result)
  assert.equal(parsed.ok, true, `collection is stale: ${JSON.stringify(parsed)}`)
})

test('the collection contains exactly one request per real mux.Handle(...) registration in app/ui/ui.go', () => {
  const source = readFileSync(UI_GO_PATH, 'utf8')
  const registrationCount = (source.match(/mux\.(?:Handle|HandleFunc)\(/g) ?? []).length
  assert.ok(registrationCount > 0, 'found 0 mux.Handle(...) registrations -- the source file moved or was rewritten')

  const collection = JSON.parse(readFileSync(COLLECTION_PATH, 'utf8'))
  const requestCount = collection.item.reduce((sum, folder) => sum + folder.item.length, 0)
  assert.equal(
    requestCount,
    registrationCount,
    `collection has ${requestCount} requests but ui.go registers ${registrationCount} routes`,
  )
})

test('the collection is a structurally valid Postman v2.1 collection', () => {
  const collection = JSON.parse(readFileSync(COLLECTION_PATH, 'utf8'))
  assert.match(collection.info.schema, /schema\.getpostman\.com\/json\/collection\/v2\.1\.0/)
  assert.ok(Array.isArray(collection.item) && collection.item.length > 0, 'collection has no folders')
  assert.ok(
    collection.variable?.some((v) => v.key === 'baseUrl'),
    'collection is missing its {{baseUrl}} variable',
  )
  for (const folder of collection.item) {
    assert.ok(typeof folder.name === 'string' && folder.name.length > 0)
    assert.ok(Array.isArray(folder.item) && folder.item.length > 0, `folder '${folder.name}' has no requests`)
    for (const request of folder.item) {
      assert.ok(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'].includes(request.request.method))
      assert.ok(request.request.url.raw.startsWith('{{baseUrl}}'), `request '${request.name}' does not use {{baseUrl}}`)
    }
  }
})

test('every GET/HEAD/OPTIONS request carries no request body', () => {
  const collection = JSON.parse(readFileSync(COLLECTION_PATH, 'utf8'))
  for (const folder of collection.item) {
    for (const request of folder.item) {
      if (['GET', 'HEAD', 'OPTIONS'].includes(request.request.method)) {
        assert.equal(request.request.body, undefined, `${request.name} should not declare a request body`)
      }
    }
  }
})
