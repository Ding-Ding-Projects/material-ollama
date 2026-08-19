import clsx from "clsx"
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react"
import { Icon } from "./Icon"
import { FOCUS_RING, TONE_CLASSES, type Tone } from "./tokens"

type ChipBaseProps = {
  /** Toggled/active state — filter chips, context-length chips, codex
   * profile chips, regex flag chips all live here. */
  selected?: boolean
  /** Fill tone when `selected`. Defaults to `secondary`, matching every
   * selected chip in the design (context length, language, theme, codex
   * profile, regex flags all use --sec-c / --on-sec-c). */
  tone?: Tone
  icon?: string
  trailingIcon?: string
  /** Roboto Mono label — used for model names, context sizes, regex
   * tokens. */
  mono?: boolean
  className?: string
  children: ReactNode
}

// `onRemove` only ever appears on the non-interactive `span` chip (a real
// nested <button> for the X) — the design never nests a remove button inside
// a clickable toggle chip, and neither should we: a <button> inside a
// <button> is invalid HTML and unreliable for assistive tech.
type ChipAsButton = ChipBaseProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & {
    as?: "button"
  }

type ChipAsSpan = ChipBaseProps &
  Omit<HTMLAttributes<HTMLSpanElement>, "className" | "children"> & {
    as: "span"
    onRemove?: () => void
    removeLabel?: string
  }

export type ChipProps = ChipAsButton | ChipAsSpan

function ChipInner({
  icon,
  trailingIcon,
  children,
}: Pick<ChipBaseProps, "icon" | "trailingIcon" | "children">) {
  return (
    <>
      {icon ? <Icon name={icon} size={16} className="shrink-0" /> : null}
      <span className="truncate">{children}</span>
      {trailingIcon ? <Icon name={trailingIcon} size={16} className="shrink-0" /> : null}
    </>
  )
}

export function Chip(props: ChipProps) {
  const selected = props.selected ?? false
  const tone = props.tone ?? "secondary"
  const mono = props.mono ?? false

  const toneClassName = selected
    ? TONE_CLASSES[tone]
    : "border border-outline-variant bg-transparent text-on-surface-variant"

  const sharedClassName = clsx(
    "relative inline-flex select-none items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium",
    "transition-colors duration-150",
    toneClassName,
    mono && "font-mono",
    props.className,
  )

  if (props.as === "span") {
    const {
      selected: _selected,
      tone: _tone,
      icon,
      trailingIcon,
      mono: _mono,
      className: _className,
      children,
      as: _as,
      onRemove,
      removeLabel = "Remove",
      ...spanRest
    } = props
    return (
      <span className={sharedClassName} {...spanRest}>
        <ChipInner icon={icon} trailingIcon={trailingIcon}>
          {children}
        </ChipInner>
        {onRemove ? (
          <button
            type="button"
            aria-label={removeLabel}
            title={removeLabel}
            onClick={onRemove}
            className={clsx(
              "relative -mr-1 ml-0.5 inline-flex shrink-0 items-center justify-center rounded-full p-0.5",
              "before:content-[''] before:absolute before:-inset-2",
              "text-current opacity-70 hover:opacity-100 hover:bg-surface-highest",
              FOCUS_RING,
            )}
          >
            <Icon name="close" size={14} />
          </button>
        ) : null}
      </span>
    )
  }

  const {
    selected: _selected,
    tone: _tone,
    icon,
    trailingIcon,
    mono: _mono,
    className: _className,
    children,
    as: _as,
    ...buttonRest
  } = props
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={clsx(
        sharedClassName,
        "before:content-[''] before:absolute before:-inset-1.5",
        FOCUS_RING,
      )}
      {...buttonRest}
    >
      <ChipInner icon={icon} trailingIcon={trailingIcon}>
        {children}
      </ChipInner>
    </button>
  )
}
