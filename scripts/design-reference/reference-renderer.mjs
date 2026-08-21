#!/usr/bin/env node
/**
 * Serve the checked-in design reference without reimplementing it.
 *
 * The renderer deliberately reads the HTML and support runtime from design/
 * on every request. A capture harness can therefore point a hidden browser at
 * a stable route while preserving the reference's original source bytes.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..');
const designDir = join(repoRoot, 'design');
const referenceFile = join(designDir, 'Material Ollama.dc.html');
const runtimeFile = join(designDir, 'support.js');
const route = '/reference/material-ollama/';

export async function readReferenceSource() {
  const [html, runtime] = await Promise.all([
    readFile(referenceFile),
    readFile(runtimeFile),
  ]);
  if (!html.includes(Buffer.from('<script src="./support.js"></script>'))) {
    throw new Error('design reference does not load its committed support.js runtime');
  }
  return { html, runtime };
}

export function startReferenceServer({ port = 0, host = '127.0.0.1' } = {}) {
  const server = createServer(async (request, response) => {
    try {
      const requestPath = new URL(request.url ?? '/', `http://${host}`).pathname;
      const { html, runtime } = await readReferenceSource();
      if (requestPath === route || requestPath === `${route}index.html`) {
        response.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          'content-length': html.length,
        });
        response.end(html);
        return;
      }
      if (requestPath === `${route}support.js`) {
        response.writeHead(200, {
          'content-type': 'text/javascript; charset=utf-8',
          'cache-control': 'no-store',
          'content-length': runtime.length,
        });
        response.end(runtime);
        return;
      }
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    } catch (error) {
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(error instanceof Error ? error.message : String(error));
    }
  });
  return new Promise((resolveServer, reject) => {
    server.once('error', reject);
    server.listen(port, host, async () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('reference server did not expose a TCP address'));
        return;
      }
      await stat(referenceFile);
      resolveServer({ server, host, port: address.port, route });
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = new Set(process.argv.slice(2));
  if (args.has('--check')) {
    const { html, runtime } = await readReferenceSource();
    console.log(JSON.stringify({
      referenceFile,
      runtimeFile,
      htmlBytes: html.length,
      runtimeBytes: runtime.length,
      route,
    }, null, 2));
  } else {
    const { port, route: serverRoute } = await startReferenceServer();
    console.log(`reference-url=http://127.0.0.1:${port}${serverRoute}`);
  }
}
