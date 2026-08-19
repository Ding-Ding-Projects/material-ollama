/**
 * Worker entry point for the landing site.
 *
 * This file used to be a hardcoded stub that returned a 28-byte string for
 * every request. That was not merely a deploy-path placeholder: vinext's
 * Cloudflare integration shares one "rsc" Vite environment across `vinext
 * dev`, the standalone Node server in `dist/standalone/server.js`, and
 * `vinext deploy`. Because `site/vite.config.ts` points `main` here, the stub
 * replaced the app's real request handler in ALL THREE modes -- every route
 * returned the stub instead of its rendered page, while the pages themselves
 * were perfectly fine.
 *
 * The shape below is vinext's own generated App Router entry
 * (generateAppRouterWorkerEntry in vinext/dist/deploy.js), with the ISR
 * branches omitted because this project configures no KV cache binding. If
 * one is ever added, regenerate from that function rather than hand-editing
 * a cache handler in here.
 */
import {
  handleImageOptimization,
  DEFAULT_DEVICE_SIZES,
  DEFAULT_IMAGE_SIZES,
} from "vinext/server/image-optimization"
import handler from "vinext/server/app-router-entry"

interface Env {
  ASSETS: Fetcher
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>
      }
    }
  }
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void
  passThroughOnException(): void
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    // Image optimization via the Cloudflare Images binding. The validation
    // inside handleImageOptimization normalizes backslashes and checks the
    // origin has not changed, so this branch is not a bare proxy.
    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES]
      return handleImageOptimization(
        request,
        {
          fetchAsset: (path: string) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
          transformImage: async (
            body: ReadableStream,
            { width, format, quality }: { width: number; format: string; quality: number },
          ) => {
            const result = await env.IMAGES.input(body)
              .transform(width > 0 ? { width } : {})
              .output({ format, quality })
            return result.response()
          },
        },
        allowedWidths,
      )
    }

    // Everything else goes to the real app handler, forwarding ctx so
    // ctx.waitUntil() remains available for deferred work.
    return handler.fetch(request, env, ctx)
  },
}
