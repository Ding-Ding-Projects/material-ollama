// Setup for the "dom" Vitest project (jsdom environment). Runs once per
// test file in that project only — the "node" project never loads this.
//
// Filename note: this has to match `*.test.*` (not plain `setup-dom.ts`)
// for a real reason, not a style choice. `tsconfig.app.json` (out of this
// lane's allowed paths) excludes `src/**/*.test.*` from the app's
// `tsc -b` program — but that glob only checks the filename, not that it
// is an actual test. `@testing-library/jest-dom/vitest` does
// `import "vitest"`, and vitest's own types re-export from `vite`, whose
// `dist/node/index.d.ts` carries `/// <reference types="node" />`. That
// reference is honored regardless of this project's `"types": []` once
// the file is part of a `tsc` program, and the resulting global
// `NodeJS.Timeout` augmentation collides with `Settings.tsx` and
// `useQueryBatcher.ts`'s `number`-typed `setTimeout` handles — real,
// unrelated files break with `Type 'Timeout' is not assignable to type
// 'number'`. Verified: with a plain `setup-dom.ts` name (included in the
// app's tsc program), `npm run build` fails on those two files; with this
// name (excluded), it doesn't.
//
// Ending in `.test.mts` (not `.test.ts`) is the other half: Vitest's own
// "node" project include (`src/**/*.test.{ts,tsx}`) and "dom" project
// include (`src/**/*.dom.test.{ts,tsx}`) both require a literal `.ts`/
// `.tsx` extension, so a `.mts` file matches neither — it's loaded only
// because `vitest.config.ts` names it directly in `test.setupFiles`,
// never independently discovered and run as a suite with no tests in it.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library doesn't auto-cleanup outside of a supported test runner's
// global afterEach hook; wire it explicitly rather than relying on the
// implicit registration (which only fires for jest/expect globals it
// recognizes automatically in some setups).
afterEach(() => {
  cleanup();
});

// jsdom implements neither matchMedia nor ResizeObserver. Several
// components in this app read matchMedia (theme/appearance preference
// detection) or observe element size (layout-sensitive surfaces); without
// a stub, mounting them throws "matchMedia is not a function" /
// "ResizeObserver is not defined" long before the assertion under test
// ever runs.
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList => {
    return {
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  };
}

if (typeof window.ResizeObserver === "undefined") {
  class StubResizeObserver implements ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = StubResizeObserver as unknown as typeof ResizeObserver;
}
