import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

import { resolve } from "path";

export default defineConfig(() => ({
  base: "/",

  plugins: [
    TanStackRouterVite({ target: "react" }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
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
