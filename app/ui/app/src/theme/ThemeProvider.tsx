import {
  createContext,
  useContext,
  useState,
  useMemo,
  useLayoutEffect,
  type ReactNode,
} from "react";
import {
  buildScheme,
  DEFAULT_APPEARANCE,
  APPEARANCE_STORAGE_KEY,
  type Appearance,
  type ThemeMode,
} from "./scheme";
import { applyScheme } from "./applyScheme";

/**
 * Note on boot.ts: that module is bundled standalone by vite.config.ts's
 * themeBoot() plugin and injected as a classic <script> so the scheme
 * applies before first paint. This provider deliberately does NOT import
 * boot.ts (that would run its top-level boot() call a second time, through
 * Vite's normal module graph) -- it re-reads the same persisted appearance
 * and re-resolves "auto" here instead. Both places import buildScheme /
 * applyScheme from the same modules, so the actual colour maths never
 * forks; only this handful of glue lines is intentionally duplicated.
 */

function readStoredAppearance(): Appearance {
  if (typeof window === "undefined") return DEFAULT_APPEARANCE;
  if (window.__MO_APPEARANCE__) {
    return { ...DEFAULT_APPEARANCE, ...window.__MO_APPEARANCE__ };
  }
  try {
    const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Appearance>;
      return { ...DEFAULT_APPEARANCE, ...parsed };
    }
  } catch {
    // Corrupt value or storage disabled -- fall through to defaults.
  }
  return DEFAULT_APPEARANCE;
}

function resolveMode(theme: Appearance["theme"]): ThemeMode {
  const dark =
    theme === "dark" ||
    (theme === "auto" &&
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  return dark ? "dark" : "light";
}

interface ThemeContextType {
  /** The persisted user setting (seed, theme incl. "auto", radius,
   * per-token overrides). */
  appearance: Appearance;
  /** "light" | "dark" -- what "auto" actually resolved to right now. */
  resolvedMode: ThemeMode;
  setSeed: (seed: string) => void;
  setTheme: (theme: Appearance["theme"]) => void;
  setRadius: (radius: number) => void;
  setOverrides: (overrides: Record<string, string>) => void;
  resetAppearance: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState<Appearance>(() =>
    readStoredAppearance(),
  );

  const resolvedMode = useMemo(
    () => resolveMode(appearance.theme),
    [appearance.theme],
  );

  useLayoutEffect(() => {
    let mql: MediaQueryList | null = null;
    let raf = 0;

    const apply = () => {
      const mode = resolveMode(appearance.theme);
      const tokens = buildScheme({
        seed: appearance.seed,
        mode,
        radius: appearance.radius,
        overrides: appearance.overrides,
        format:
          typeof CSS !== "undefined" &&
          typeof CSS.supports === "function" &&
          CSS.supports("color", "oklch(.5 .1 20)")
            ? "oklch"
            : "hex",
      });
      const root = document.documentElement;
      applyScheme(root, tokens);
      root.dataset.theme = mode;
      root.style.colorScheme = mode;
    };

    apply();

    try {
      window.localStorage.setItem(
        APPEARANCE_STORAGE_KEY,
        JSON.stringify(appearance),
      );
    } catch {
      // Storage disabled or full -- the in-memory setting still applies
      // for this session.
    }

    if (appearance.theme === "auto" && typeof window.matchMedia === "function") {
      mql = window.matchMedia("(prefers-color-scheme: dark)");
      const onChange = () => {
        // Re-apply on the next frame rather than synchronously inside the
        // media-query callback, matching how a resize/scheme change would
        // otherwise be batched.
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(apply);
      };
      mql.addEventListener("change", onChange);
      return () => {
        mql?.removeEventListener("change", onChange);
        cancelAnimationFrame(raf);
      };
    }

    return undefined;
  }, [
    appearance.seed,
    appearance.theme,
    appearance.radius,
    appearance.overrides,
  ]);

  const contextValue = useMemo<ThemeContextType>(
    () => ({
      appearance,
      resolvedMode,
      setSeed: (seed) => setAppearance((prev) => ({ ...prev, seed })),
      setTheme: (theme) => setAppearance((prev) => ({ ...prev, theme })),
      setRadius: (radius) => setAppearance((prev) => ({ ...prev, radius })),
      setOverrides: (overrides) =>
        setAppearance((prev) => ({ ...prev, overrides })),
      resetAppearance: () => setAppearance(DEFAULT_APPEARANCE),
    }),
    [appearance, resolvedMode],
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
