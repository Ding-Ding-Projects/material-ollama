import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { buildSync } from "esbuild";

import { resolve } from "path";

/**
 * Bundles src/theme/boot.ts standalone (via esbuild, NOT Vite's own module
 * graph -- see the comment at the top of boot.ts for why that separation
 * matters) into a minified IIFE, then injects it as a classic,
 * non-deferred <script> at head-prepend.
 *
 * Injected at head-prepend rather than left as a <script type="module">
 * because module scripts are always deferred and run after the browser
 * has already scheduled first paint; a classic script injected ahead of
 * everything else in <head> runs synchronously before that paint, which
 * is the whole point -- it is what keeps the resolved seed/theme from
 * flashing the tokens.css light-mode defaults before React mounts.
 *
 * This is the one and only place boot.ts's source is read. Do not
 * hand-copy the OKLCH tables it pulls in from scheme.ts/oklch.ts into
 * index.html "for speed" -- that creates a second copy of the maths that
 * WILL drift from the real one.
 */
function themeBoot(): Plugin {
  return {
    name: "mo-theme-boot",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        const result = buildSync({
          entryPoints: [resolve(__dirname, "src/theme/boot.ts")],
          bundle: true,
          minify: true,
          write: false,
          format: "iife",
          target: "es2017",
          platform: "browser",
        });
        const code = result.outputFiles[0].text;
        return {
          html,
          tags: [
            {
              tag: "script",
              injectTo: "head-prepend",
              children: code,
            },
          ],
        };
      },
    },
  };
}

export default defineConfig(() => ({
  base: "/",

  plugins: [
    TanStackRouterVite({ target: "react" }),
    react(),
    tailwindcss(),
    tsconfigPaths({ root: __dirname, projects: [resolve(__dirname, "tsconfig.app.json")] }),
    themeBoot(),
  ],

  resolve: {
    alias: {
      "@/gotypes": resolve(__dirname, "codegen/gotypes.gen.ts"),
      "@": resolve(__dirname, "src"),
      "micromark-extension-math": "micromark-extension-llm-math",
    },
  },

  // No postcss-preset-env. It targeted "Safari >= 14", which this app never
  // ships to: the host is WebView2 (evergreen Chromium) on Windows, and the
  // macOS bundle declares LSMinimumSystemVersion 14.0 -> WebKit 17. Tailwind v4
  // itself baselines Chrome 111 / Safari 16.4, so the plugin was compensating
  // for engines the framework already refuses to support.
  //
  // It was also actively destructive, and silently so:
  //   - oklab-function REPLACED oklch() rather than preserving it, so the
  //     runtime-generated colour system shipped as gamut-clipped rgb;
  //   - the cascade-layers polyfill removed @layer and emulated it with
  //     :not(#\#) selectors carrying ID-level specificity, which makes
  //     hand-written CSS lose to Tailwind's own preflight;
  //   - custom-properties froze a build-time snapshot of every token ahead of
  //     the var(), doubling colour declarations for a value that is not known
  //     until JS writes it.
  // Meanwhile color-mix(in oklab, ...) passed through untouched 678 times --
  // same support baseline as oklch -- so the downlevel protected nothing.
  //
  // scripts/check-ui-css.mjs reads the emitted stylesheet and fails if any of
  // this comes back. Run it against a broken build and watch it go red before
  // trusting it; none of this is visible from here or from index.css.

  build: {
    target: "es2017",
  },

  esbuild: {
    target: "es2017",
  },
}));
