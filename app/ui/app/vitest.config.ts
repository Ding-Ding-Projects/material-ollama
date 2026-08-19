import { defineConfig, mergeConfig } from "vite";
import { configDefaults } from "vitest/config";
import path from "path";
import baseConfig from "./vite.config";

// Two Vitest 3 `test.projects`, replacing the previous single `environment:
// "node"` config. Both `extends: true` so they inherit this file's
// `resolve.alias` and the base Vite config's plugins — only `test.*` is
// overridden per project.
//
// - "node": everything the four pre-existing test files depend on
//   (StreamingMarkdownContent.test.tsx renders via `react-dom/server`,
//   clipboard.test.ts and fileValidation.test.ts hand-mock
//   document/navigator/FileReader). Excludes the new DOM suite so a jsdom
//   global never leaks into a test written for the node environment.
// - "dom": real jsdom + Testing Library, for `*.dom.test.{ts,tsx}` files
//   only, with the DOM-specific setup file.
export default defineConfig((configEnv) =>
  mergeConfig(
    baseConfig(configEnv),
    defineConfig({
      resolve: {
        alias: {
          "@": path.resolve(__dirname, "./src"),
          "@/gotypes": path.resolve(__dirname, "./codegen/gotypes.gen.ts"),
        },
      },
      test: {
        globals: true,
        projects: [
          {
            extends: true,
            test: {
              name: "node",
              environment: "node",
              include: ["src/**/*.test.{ts,tsx}"],
              exclude: [...configDefaults.exclude, "src/**/*.dom.test.{ts,tsx}"],
            },
          },
          {
            extends: true,
            test: {
              name: "dom",
              environment: "jsdom",
              include: ["src/**/*.dom.test.{ts,tsx}"],
              exclude: configDefaults.exclude,
              // ".test.mts", not ".ts" — see the comment atop that file for
              // why the extension and the "*.test.*" name both matter.
              setupFiles: ["./src/test/setup-dom.test.mts"],
            },
          },
        ],
      },
    }),
  ),
);
