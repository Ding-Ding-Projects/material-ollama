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

export async function createDesignFetchHandler({ client, assets = undefined } = {}) {
  if (!client || typeof client.send !== 'function') throw new TypeError('a CDP client with send(command, params) is required');
  const requestMap = assets ?? await loadDesignAssetMap();
  const patterns = [{ urlPattern: '*', requestStage: 'Request' }];
  await client.send('Fetch.enable', { patterns });

  async function handleRequestPaused(event) {
    const requestId = event?.requestId;
    const sourceUrl = event?.request?.url;
    if (typeof requestId !== 'string' || typeof sourceUrl !== 'string') throw new TypeError('Fetch.requestPaused event is missing requestId or request.url');
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

  return { requestMap, patterns, handleRequestPaused, disable };
}

if (process.argv[1] && new URL(import.meta.url).pathname.endsWith(process.argv[1].replaceAll('\\', '/')) && process.argv.includes('--check')) {
  const { requestMap, patterns } = await createDesignFetchHandler({ client: { send: async () => {} } });
  console.log(JSON.stringify({ status: 'ready', entries: requestMap.size, patterns, unknownPolicy: 'Fetch.failRequest/BlockedByClient' }, null, 2));
}
