#!/usr/bin/env node
// scripts/generate-postman-collection.mjs
//
// Generates a Postman Collection v2.1 JSON file for the desktop app's own
// local HTTP API -- the `/api/v1/*` (plus a handful of `/api/*` reverse-
// proxy passthrough) routes app/ui/ui.go's Server.Handler() registers on
// its `http.ServeMux`. This is a DIFFERENT API surface from docs/api.md
// and docs/openapi.yaml, which document the upstream Ollama server's own
// HTTP API (port 11434) -- see docs/features/uh-completeness/articles/
// api-documentation-and-collection.md for that distinction spelled out.
//
// Deliberately generated from the real registered routes rather than
// hand-written: every mux.Handle("METHOD /path", ...) call in
// app/ui/ui.go's Server.Handler() is parsed directly from the source
// file's real bytes, so this can never silently drift from what the
// server actually serves the way a hand-maintained collection would the
// first time a route is added, renamed, or removed.
//
// Usage: node scripts/generate-postman-collection.mjs
//   (writes docs/api/app-http-api.postman_collection.json)
//        node scripts/generate-postman-collection.mjs --check
//   (regenerates in memory and diffs against the committed file; exits 1
//    on drift -- this is what the guard test shells out to)

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const UI_GO_PATH = path.join(REPO_ROOT, 'app', 'ui', 'ui.go')
const OUTPUT_PATH = path.join(REPO_ROOT, 'docs', 'api', 'app-http-api.postman_collection.json')

// Route registration line shape, e.g.:
//   mux.Handle("GET /api/v1/chat/{id}", handle(s.getChat))
//   mux.Handle("GET /api/tags", ollamaProxy)
//   mux.Handle("OPTIONS /", handle(func(w http.ResponseWriter, r *http.Request) error {
// The third case (an inline func literal, used for the one CORS-preflight
// registration) spans multiple lines and never closes its parens on the
// registration line itself -- so METHOD/PATH are captured with no
// requirement that the rest of the call closes on the same line; the
// handler name is derived separately (see extractRoutes below) with an
// explicit fallback for exactly this inline-literal shape.
const ROUTE_LINE_RE = /mux\.(?:Handle|HandleFunc)\(\s*"([A-Z]+) ([^"]+)"\s*,\s*(.*)$/

/** Read app/ui/ui.go and extract every real registered route in source
 * order (source order matters for a ServeMux: this DOES NOT re-derive
 * routing precedence, it only reflects the order routes were declared,
 * which is also the order this collection's folders read top-to-bottom
 * in, matching the file a maintainer would actually read). */
function extractRoutes() {
  const source = readFileSync(UI_GO_PATH, 'utf8')
  const lines = source.split(/\r\n|\r|\n/)
  const routes = []
  for (const [i, line] of lines.entries()) {
    const m = line.match(ROUTE_LINE_RE)
    if (!m) continue
    const [, method, routePath, handlerExpr] = m
    const handled = handlerExpr.match(/handle\(s\.(\w+)\)\)?\s*$/)
    let handlerName
    if (handled) {
      handlerName = handled[1]
    } else if (/handle\(func\(/.test(handlerExpr)) {
      // The one inline-func-literal registration (CORS preflight for
      // "OPTIONS /"): give it a stable descriptive name rather than
      // dumping the raw (multi-line, unparseable-as-one-expression) Go
      // source into the collection.
      handlerName = 'corsPreflight'
    } else {
      handlerName = handlerExpr.replace(/\)+\s*$/, '').trim()
    }
    routes.push({ method, path: routePath, handler: handlerName, sourceLine: i + 1 })
  }
  return routes
}

/** Group routes into Postman folders by their first meaningful path
 * segment after /api(/v1)? -- "chat", "models", "settings", "uh",
 * "codex", "docker", "convert", "docs", "config", "launch", "history",
 * or "root" for the bare "/" static/preflight routes and "ollama-proxy"
 * for the handful of routes forwarded to the real Ollama server rather
 * than handled directly by this process. */
function folderNameFor(route) {
  if (route.path === '/') return 'root'
  const withoutApiV1 = route.path.replace(/^\/api\/v1\//, '').replace(/^\/api\//, '')
  if (route.handler === 'ollamaProxy') return 'ollama-proxy'
  const firstSegment = withoutApiV1.split('/')[0]
  return firstSegment || 'root'
}

function toPostmanUrl(routePath) {
  // {id} -> :id (Postman's own path-variable syntax), and split into a
  // `path` segment array as Postman's schema expects.
  const withPostmanVars = routePath.replace(/\{(\w+)\}/g, ':$1')
  const segments = withPostmanVars.split('/').filter(Boolean)
  const variables = [...routePath.matchAll(/\{(\w+)\}/g)].map((m) => ({
    key: m[1],
    value: '',
    description: `Path parameter: ${m[1]}`,
  }))
  return {
    raw: `{{baseUrl}}${withPostmanVars}`,
    host: ['{{baseUrl}}'],
    path: segments,
    ...(variables.length > 0 ? { variable: variables } : {}),
  }
}

function methodWantsBody(method) {
  return method === 'POST' || method === 'PUT' || method === 'PATCH'
}

function toPostmanRequestItem(route) {
  const item = {
    name: `${route.method} ${route.path}`,
    request: {
      method: route.method,
      header: [{ key: 'Content-Type', value: 'application/json', type: 'text' }],
      url: toPostmanUrl(route.path),
      description:
        route.handler === 'ollamaProxy'
          ? `Forwarded verbatim to the real Ollama server's own HTTP API -- see docs/api.md for its request/response shape. Handled by ui.go's ollamaProxy reverse proxy (source line ${route.sourceLine}).`
          : `Handled by app/ui/ui.go's Server.${route.handler} (registered at source line ${route.sourceLine}). Requires the app's own \`token\` cookie unless the server is running in Dev mode -- see this folder's auth note.`,
    },
  }
  if (methodWantsBody(route.method) && route.handler !== 'ollamaProxy') {
    item.request.body = {
      mode: 'raw',
      raw: '{}',
      options: { raw: { language: 'json' } },
    }
  }
  return item
}

function buildCollection(routes) {
  const folders = new Map()
  for (const route of routes) {
    const folderName = folderNameFor(route)
    if (!folders.has(folderName)) folders.set(folderName, [])
    folders.get(folderName).push(route)
  }

  const items = [...folders.entries()].map(([folderName, folderRoutes]) => ({
    name: folderName,
    item: folderRoutes.map(toPostmanRequestItem),
  }))

  return {
    info: {
      name: 'Material Ollama -- Desktop App Local HTTP API',
      description:
        'Generated from the real mux.Handle(...) registrations in app/ui/ui.go\'s ' +
        'Server.Handler() -- run `node scripts/generate-postman-collection.mjs` to ' +
        'regenerate after a route changes. This is the desktop app\'s OWN local API ' +
        '(served by the app process itself, on an OS-assigned loopback port -- see ' +
        '{{baseUrl}} below), distinct from the upstream Ollama server API documented ' +
        'in docs/api.md and docs/openapi.yaml, which most `ollama-proxy` folder routes ' +
        'here simply forward to unchanged.\n\n' +
        'Authentication: every route except the `root`, `ollama-proxy`, and OPTIONS ' +
        'preflight routes requires the app\'s own session `token` cookie (set by the ' +
        'running app; there is no login endpoint -- the app process itself owns the ' +
        'token and only accepts requests carrying it) unless the server is started in ' +
        'Dev mode (`-dev`), which skips the check entirely for local development.\n\n' +
        `Base URL: the app binds 127.0.0.1:0 (an OS-assigned ephemeral port), so ` +
        '{{baseUrl}} has no fixed default -- set it to `http://127.0.0.1:<port>` for ' +
        'the port the running instance actually bound (discoverable the same way ' +
        'scripts/capture/lib.mjs\'s discoverListeningPort() does: inspect the running ' +
        'process\'s own listening TCP sockets).',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    variable: [{ key: 'baseUrl', value: 'http://127.0.0.1:PORT', type: 'string' }],
    item: items,
  }
}

function main() {
  const routes = extractRoutes()
  if (routes.length === 0) {
    throw new Error(`generate-postman-collection.mjs: found 0 routes in ${UI_GO_PATH} -- parser is broken`)
  }
  const collection = buildCollection(routes)
  const json = `${JSON.stringify(collection, null, 2)}\n`

  const checkMode = process.argv.includes('--check')
  if (checkMode) {
    let existing
    try {
      existing = readFileSync(OUTPUT_PATH, 'utf8')
    } catch {
      console.log(JSON.stringify({ ok: false, reason: `missing ${path.relative(REPO_ROOT, OUTPUT_PATH)}` }))
      process.exit(1)
    }
    if (existing !== json) {
      console.log(
        JSON.stringify({
          ok: false,
          reason:
            'committed Postman collection is stale relative to app/ui/ui.go -- ' +
            're-run `node scripts/generate-postman-collection.mjs` and commit the result',
          routeCount: routes.length,
        }),
      )
      process.exit(1)
    }
    console.log(JSON.stringify({ ok: true, routeCount: routes.length }))
    return
  }

  writeFileSync(OUTPUT_PATH, json)
  console.log(
    JSON.stringify(
      {
        ok: true,
        routeCount: routes.length,
        folders: [...new Set(routes.map(folderNameFor))].sort(),
        output: path.relative(REPO_ROOT, OUTPUT_PATH),
      },
      null,
      2,
    ),
  )
}

main()
