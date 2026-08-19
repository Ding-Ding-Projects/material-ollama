import clsx from "clsx"
import type { ButtonHTMLAttributes } from "react"
import { Icon } from "./Icon"
import {
  FOCUS_RING,
  ICON_BUTTON_DANGER_CLASSES,
  ICON_BUTTON_SIZE_CLASSES,
  ICON_BUTTON_VARIANT_CLASSES,
  TONE_CLASSES,
  type IconButtonSize,
  type IconButtonVariant,
} from "./tokens"

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "aria-label"> {
  /** Required — an icon button carries no visible text, so this is its only
   * accessible name. It must describe the action, never repeat "icon". */
  label: string
  icon: string
  variant?: IconButtonVariant
  size?: IconButtonSize
  /** Toggle-pressed state (e.g. a pinned tab, an active filter). Forces the
   * tonal-container treatment regardless of `variant`, matching MD3's
   * selected-icon-button pattern, and sets aria-pressed. */
  selected?: boolean
  /** Neutral at rest, error-container on hover/focus — the "remove
   * installed model" affordance from the design, never a permanent red
   * icon button. */
  danger?: boolean
  className?: string
}

export function IconButton({
  label,
  icon,
  variant = "standard",
  size = "md",
  selected = false,
  danger = false,
  className,
  disabled,
  ...rest
}: IconButtonProps) {
  const sizing = ICON_BUTTON_SIZE_CLASSES[size]

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={selected}
      disabled={disabled}
      className={clsx(
        "relative inline-flex shrink-0 items-center justify-center rounded-full",
        "transition-colors duration-150",
        "disabled:opacity-38 disabled:pointer-events-none",
        sizing.box,
        sizing.touchBefore,
        selected ? TONE_CLASSES.tonal : ICON_BUTTON_VARIANT_CLASSES[variant],
        danger && !selected ? ICON_BUTTON_DANGER_CLASSES : null,
        FOCUS_RING,
        className,
      )}
      {...rest}
    >
      <Icon name={icon} size={sizing.iconSize} fill={selected} />
    </button>
  )
}
