// Shared MD3 class lookups. Every variant maps to a *complete literal string* —
// never build a class with a template literal (`bg-${tone}` emits no CSS, no
// error, no warning, and is the single most probable silent failure in a
// token-driven component set).

export type Tone =
  | "primary"
  | "tonal"
  | "secondary"
  | "tertiary"
  | "error"
  | "neutral"

export const TONE_CLASSES: Record<Tone, string> = {
  primary: "bg-primary text-on-primary",
  tonal: "bg-primary-container text-on-primary-container",
  secondary: "bg-secondary-container text-on-secondary-container",
  tertiary: "bg-tertiary-container text-on-tertiary-container",
  error: "bg-error-container text-on-error-container",
  neutral: "bg-surface-high text-on-surface-variant",
}

export type SurfaceTier = "lowest" | "low" | "base" | "high" | "highest"

export const SURFACE_TIER_CLASSES: Record<SurfaceTier, string> = {
  lowest: "bg-surface-lowest",
  low: "bg-surface-low",
  base: "bg-surface",
  high: "bg-surface-high",
  highest: "bg-surface-highest",
}

export type SurfaceRadius = "token" | "full" | "lg" | "none"

export const RADIUS_CLASSES: Record<SurfaceRadius, string> = {
  token: "rounded-token",
  full: "rounded-full",
  lg: "rounded-lg",
  none: "rounded-none",
}

export type Elevation = 0 | 1 | 2

export const ELEVATION_CLASSES: Record<Elevation, string> = {
  0: "",
  1: "elev-1",
  2: "elev-2",
}

export type ButtonVariant = "filled" | "tonal" | "outlined" | "text" | "danger"

// Solid `--err` has no matching `--on-err` token in the raw MD3 palette (only
// `--on-err-c`, for the container tone) — the design itself falls back to a
// literal white label on the armed destructive-confirm button, so we do too.
export const BUTTON_VARIANT_CLASSES: Record<ButtonVariant, string> = {
  filled: "bg-primary text-on-primary hover:opacity-90 active:opacity-80",
  tonal:
    "bg-primary-container text-on-primary-container hover:opacity-90 active:opacity-80",
  // The design's low-emphasis action buttons (editAppearance, openEditor,
  // exportSettings, …) are all border-outline-variant + primary-colored
  // label — never the stronger `outline` token, which this design reserves
  // for input fields.
  outlined:
    "border border-outline-variant text-primary bg-transparent hover:bg-surface-high",
  text: "text-primary bg-transparent hover:bg-surface-high",
  danger: "bg-error text-white hover:opacity-90 active:opacity-80",
}

export type ButtonSize = "sm" | "md"

// `base` sizes the visible pill; `touchBefore` extends the invisible hit area
// out to the 44px floor for sizes whose visual height falls short of it.
export const BUTTON_SIZE_CLASSES: Record<
  ButtonSize,
  { base: string; touchBefore: string }
> = {
  sm: {
    base: "h-9 px-4 text-[13px] gap-1.5",
    touchBefore: "before:content-[''] before:absolute before:-inset-1",
  },
  md: {
    base: "h-10 px-5 text-sm gap-2",
    touchBefore: "before:content-[''] before:absolute before:-inset-0.5",
  },
}

export type ButtonShape = "pill" | "token"

export const BUTTON_SHAPE_CLASSES: Record<ButtonShape, string> = {
  pill: "rounded-full",
  token: "rounded-token",
}

export type IconButtonVariant = "standard" | "filled" | "tonal"

export const ICON_BUTTON_VARIANT_CLASSES: Record<IconButtonVariant, string> = {
  standard: "bg-transparent text-on-surface-variant hover:bg-surface-high",
  filled: "bg-primary text-on-primary hover:opacity-90",
  tonal: "bg-primary-container text-on-primary-container hover:opacity-90",
}

// The danger treatment overrides the variant's resting colors but keeps its
// shape/size — it mirrors the mockup's "remove installed model" affordance:
// neutral at rest, error-container only on hover/focus.
export const ICON_BUTTON_DANGER_CLASSES =
  "text-on-surface-variant hover:bg-error-container hover:text-on-error-container"

export type IconButtonSize = "sm" | "md"

// box = the visual hit area; touchBefore = an invisible ::before that pads the
// hit area out to the 44px accessibility floor without inflating the visual.
export const ICON_BUTTON_SIZE_CLASSES: Record<
  IconButtonSize,
  { box: string; touchBefore: string; iconSize: number }
> = {
  sm: {
    box: "w-9 h-9",
    touchBefore:
      "before:content-[''] before:absolute before:-inset-1 before:rounded-full",
    iconSize: 18,
  },
  md: {
    box: "w-10 h-10",
    touchBefore:
      "before:content-[''] before:absolute before:-inset-0.5 before:rounded-full",
    iconSize: 20,
  },
}

// Focus is drawn with the raw `--p` custom property via an arbitrary value
// rather than a themed `outline-*` utility name, because no such utility name
// is in the guaranteed set the token layer publishes — the raw variable is
// guaranteed to exist on :root the moment the sibling lane lands, independent
// of which Tailwind color utilities get registered.
export const FOCUS_RING =
  "focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--p)]"

export const FOCUS_RING_INSET =
  "focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--p)]"

// For a non-focusable wrapper (e.g. a TextField's bordered container) that
// should ring when the *inner* input receives focus — `focus-visible:` never
// fires on an element that can't itself take focus.
export const FOCUS_RING_WITHIN =
  "focus-within:outline focus-within:outline-2 focus-within:outline-offset-[-2px] focus-within:outline-[var(--p)]"

// Overlay chrome (dialogs, menus, popovers, the snackbar) uses precise
// arbitrary-value radii lifted straight from the design rather than the four
// abstracted Surface buckets, because MD3 overlay corners are fixed sizes,
// not tied to the user's customizable corner-radius token.
export const OVERLAY_RADIUS = {
  menu: "rounded-[14px]",
  panel: "rounded-[20px]",
  dialog: "rounded-[28px]",
  dialogCompact: "rounded-[24px]",
  toast: "rounded-xl",
} as const

// Mirrors Headless UI's internal `AnchorProps` shape (not exported from its
// public entry point, so re-declared structurally here) for Menu/Popover
// anchor positioning — `"bottom start"`, `"top end"`, etc.
type AnchorAlign = "start" | "end"
type AnchorPlacement = "top" | "right" | "bottom" | "left"
type AnchorTo = `${AnchorPlacement}` | `${AnchorPlacement} ${AnchorAlign}`
export type AnchorPosition =
  | false
  | AnchorTo
  | Partial<{
      gap: number | string
      offset: number | string
      padding: number | string
      to: AnchorTo
    }>

export const OVERLAY_SURFACE = "bg-surface-lowest text-on-surface"

export const OVERLAY_BACKDROP = "fixed inset-0 bg-black/40 z-[70]"
