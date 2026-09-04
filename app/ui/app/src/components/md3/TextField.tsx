import clsx from "clsx"
import type {
  FocusEventHandler,
  InputHTMLAttributes,
  KeyboardEventHandler,
  Ref,
} from "react"
import { useId } from "react"
import { Icon, type SymbolName } from "./Icon"
import { FOCUS_RING_WITHIN } from "./tokens"

export interface TextFieldProps {
  value: string
  onChange: (value: string) => void
  variant?: "outlined" | "filled"
  /** Roboto Mono — used throughout Settings for paths, hex codes, model
   * names and other literal values. */
  mono?: boolean
  label?: string
  helper?: string
  error?: string
  leading?: SymbolName
  trailing?: SymbolName
  type?: string
  placeholder?: string
  disabled?: boolean
  className?: string
  /**
   * Everything below exists because a text field that cannot be focused
   * imperatively, cannot see a key press and cannot report a blur is not a
   * replacement for a raw <input> -- it is a smaller one. Three real call
   * sites (an inline rename that commits on Enter and cancels on Escape, a
   * numeric answer field, a filter that focuses on open) had to stay raw
   * for want of exactly these, so converting them would have silently
   * deleted their behaviour.
   */
  inputRef?: Ref<HTMLInputElement>
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>
  onBlur?: FocusEventHandler<HTMLInputElement>
  onFocus?: FocusEventHandler<HTMLInputElement>
  /** Numeric keypads on touch. `type="number"` alone does not get there on
   * every platform, and losing it is invisible on a desktop test run. */
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"]
  autoFocus?: boolean
  maxLength?: number
  /** For a field with no visible label -- an inline rename, say -- which
   * still needs an accessible name. Never a substitute for `label` when a
   * visible one belongs there. */
  ariaLabel?: string
}

/**
 * The design's labeled settings inputs — 1px outline-variant border,
 * surface-low fill, 10px corners — plus a tonal `filled` alternative for
 * denser rows. Every text input in the mockup uses this same fixed 10px
 * radius rather than the card-level --r token, so it's applied as a
 * precise arbitrary value here rather than through the Surface radius
 * vocabulary.
 */
export function TextField({
  value,
  onChange,
  variant = "outlined",
  mono = false,
  label,
  helper,
  error,
  leading,
  trailing,
  type = "text",
  placeholder,
  disabled = false,
  className,
  inputRef,
  onKeyDown,
  onBlur,
  onFocus,
  inputMode,
  autoFocus,
  maxLength,
  ariaLabel,
}: TextFieldProps) {
  const id = useId()
  const helperId = useId()
  const hasError = Boolean(error)

  return (
    <div className={clsx("flex flex-col gap-1", className)}>
      {label ? (
        <label htmlFor={id} className="text-xs font-medium">
          {label}
        </label>
      ) : null}
      <div
        className={clsx(
          "flex items-center gap-2 rounded-[10px] px-3 py-2",
          variant === "outlined"
            ? "border border-outline-variant bg-surface-low"
            : "border border-transparent bg-surface-high",
          hasError && "border-error",
          disabled && "opacity-38",
          FOCUS_RING_WITHIN,
        )}
      >
        {leading ? (
          <Icon name={leading} size={17} className="shrink-0 text-on-surface-variant" />
        ) : null}
        <input
          id={id}
          ref={inputRef}
          type={type}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          inputMode={inputMode}
          autoFocus={autoFocus}
          maxLength={maxLength}
          aria-label={label ? undefined : ariaLabel}
          aria-invalid={hasError || undefined}
          aria-describedby={helper || error ? helperId : undefined}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          onFocus={onFocus}
          className={clsx(
            "min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-on-surface-variant",
            mono && "font-mono",
          )}
        />
        {trailing ? (
          <Icon name={trailing} size={17} className="shrink-0 text-on-surface-variant" />
        ) : null}
      </div>
      {helper || error ? (
        <div id={helperId} className={clsx("text-[11px]", hasError ? "text-error" : "text-on-surface-variant")}>
          {error || helper}
        </div>
      ) : null}
    </div>
  )
}
