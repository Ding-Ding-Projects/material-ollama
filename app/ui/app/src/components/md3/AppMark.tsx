import clsx from "clsx"
import { useId } from "react"

export interface AppMarkProps {
  /** Pixel size for both width and height. Defaults to 20 -- the same
   * default `Icon` uses, since this is a drop-in replacement for the
   * `<Icon name="raven" size={20} .../>` placeholder currently rendered in
   * the title bar (see AppShell.tsx's APP_GLYPH constant). */
  size?: number
  /**
   * "brand" (default) renders the full two-tone mark: the indigo-to-violet
   * rounded-square badge with the white node glyph on top, matching
   * app/assets/material-ollama-mark.svg and the packaged app icon exactly.
   * Use this wherever the mark stands on its own -- the title bar, an About
   * screen, a favicon-equivalent context.
   *
   * "mono" renders only the glyph (the three connected nodes) as a single
   * `currentColor` shape with no background, for contexts that need one ink
   * colour rather than the badge's own fixed brand colours -- e.g. inline
   * beside body text, or composited onto a surface that already supplies a
   * background. This is the "monochrome-capable" fallback the master SVG's
   * own header comment describes.
   */
  variant?: "brand" | "mono"
  className?: string
  /**
   * Accessible name for the mark. Defaults to "Material Ollama". Ignored
   * (and the SVG is instead marked `aria-hidden`) when `decorative` is
   * true, which is the right choice whenever the mark sits directly next
   * to visible "Material Ollama" text -- exactly the title-bar case --
   * since a screen reader would otherwise announce the name twice.
   */
  title?: string
  /** True (the default) hides the mark from assistive technology because
   * adjacent visible text already names the app. Set to false when the
   * mark is the ONLY thing identifying the app in that spot (a bare
   * favicon-style usage with no neighbouring "Material Ollama" text). */
  decorative?: boolean
}

/**
 * The project's own mark -- see app/assets/material-ollama-mark.svg for the
 * authored vector source and scripts/build-app-icon.mjs for how the
 * packaged .ico and web favicons are generated from it. This component
 * renders the identical geometry inline as JSX so the app's own chrome (the
 * custom Material title bar in particular -- see AppShell.tsx) shows the
 * real project identity instead of a borrowed Material Symbols glyph.
 *
 * Not yet wired into AppShell.tsx itself: that file is outside this
 * change's scope. Swapping it in is a one-line change once it lands --
 * replace `<Icon name={APP_GLYPH} size={20} className="shrink-0 text-primary" />`
 * with `<AppMark size={20} className="shrink-0" />`.
 */
export function AppMark({ size = 20, variant = "brand", className, title = "Material Ollama", decorative = true }: AppMarkProps) {
  const gradientId = useId()
  const a11yProps = decorative ? { "aria-hidden": true as const } : { role: "img" as const, "aria-label": title }

  if (variant === "mono") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 256 256"
        fill="none"
        className={clsx("shrink-0", className)}
        {...a11yProps}
      >
        <g stroke="currentColor" strokeWidth={20} strokeLinecap="round">
          <line x1={128} y1={78} x2={75} y2={180} />
          <line x1={128} y1={78} x2={181} y2={180} />
        </g>
        <circle cx={128} cy={78} r={27} fill="currentColor" />
        <circle cx={75} cy={180} r={23} fill="currentColor" />
        <circle cx={181} cy={180} r={23} fill="currentColor" />
      </svg>
    )
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      className={clsx("shrink-0", className)}
      {...a11yProps}
    >
      <defs>
        <linearGradient id={gradientId} x1="8" y1="8" x2="248" y2="248" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4C57D6" />
          <stop offset="1" stopColor="#6A4FC0" />
        </linearGradient>
      </defs>
      <rect x={8} y={8} width={240} height={240} rx={54} fill={`url(#${gradientId})`} />
      <g fill="none" stroke="#FFFFFF" strokeWidth={20} strokeLinecap="round">
        <line x1={128} y1={78} x2={75} y2={180} />
        <line x1={128} y1={78} x2={181} y2={180} />
      </g>
      <circle cx={128} cy={78} r={27} fill="#FFFFFF" />
      <circle cx={75} cy={180} r={23} fill="#FFFFFF" />
      <circle cx={181} cy={180} r={23} fill="#FFFFFF" />
    </svg>
  )
}
