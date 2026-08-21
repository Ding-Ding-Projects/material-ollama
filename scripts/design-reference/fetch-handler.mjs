#!/usr/bin/env node
/**
 * CDP Fetch-domain driver for the checked-in design reference.
 *
 * A capture harness creates this driver with its CDP client, calls `enable`,
 * and dispatches every `Fetch.requestPaused` event to `handleRequestPaused`.
 * Known original source URLs are fulfilled from the exact request map. Every
 * other request is failed with `BlockedByClient`; there is intentionally no
 * network fallback.
 */
import { loadDesignAssetMap, resolveDesignRequest, toFetchFulfillRequest, DesignAssetRequestError } from './request-map.mjs';

function validateRendererOrigin(rendererOrigin) {
  let parsed;
  try { parsed = new URL(rendererOrigin); } catch { throw new TypeError('rendererOrigin must be an absolute loopback HTTP origin'); }
  if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsed.hostname) || !/^\d+$/.test(parsed.port) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new TypeError('rendererOrigin must be an absolute loopback HTTP origin with a numeric port and no path');
  }
  return parsed.origin;
}

export async function createDesignFetchHandler({ client, rendererOrigin } = {}) {
  if (!client || typeof client.send !== 'function') throw new TypeError('a CDP client with send(command, params) is required');
  const origin = validateRendererOrigin(rendererOrigin);
  const rendererRoutes = new Set([
    `${origin}/reference/material-ollama/`,
    `${origin}/reference/material-ollama/support.js`,
  ]);
  const requestMap = await loadDesignAssetMap();
  const patterns = [{ urlPattern: '*', requestStage: 'Request' }];
  await client.send('Fetch.enable', { patterns });

  async function handleRequestPaused(event) {
    const requestId = event?.requestId;
    const sourceUrl = event?.request?.url;
    if (typeof requestId !== 'string' || typeof sourceUrl !== 'string') throw new TypeError('Fetch.requestPaused event is missing requestId or request.url');
    if (rendererRoutes.has(sourceUrl)) {
      await client.send('Fetch.continueRequest', { requestId });
      return { status: 'continued', sourceUrl };
    }
    try {
      const response = resolveDesignRequest(requestMap, sourceUrl);
      await client.send('Fetch.fulfillRequest', { requestId, ...toFetchFulfillRequest(response) });
      return { status: 'fulfilled', sourceUrl };
    } catch (error) {
      if (!(error instanceof DesignAssetRequestError) || error.code !== 'UNKNOWN_DESIGN_ASSET') throw error;
      await client.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' });
      throw error;
    }
  }

  async function disable() {
    await client.send('Fetch.disable');
  }

  return { requestMap, patterns, rendererRoutes, handleRequestPaused, disable };
}

if (process.argv[1] && new URL(import.meta.url).pathname.endsWith(process.argv[1].replaceAll('\\', '/')) && process.argv.includes('--check')) {
  const { requestMap, patterns, rendererRoutes } = await createDesignFetchHandler({ client: { send: async () => {} }, rendererOrigin: 'http://127.0.0.1:1' });
  console.log(JSON.stringify({ status: 'ready', entries: requestMap.size, patterns, rendererRoutes: [...rendererRoutes], unknownPolicy: 'Fetch.failRequest/BlockedByClient' }, null, 2));
}
