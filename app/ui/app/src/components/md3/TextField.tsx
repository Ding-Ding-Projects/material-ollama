import clsx from "clsx"
import { useId } from "react"
import { Icon } from "./Icon"
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
  leading?: string
  trailing?: string
  type?: string
  placeholder?: string
  disabled?: boolean
  className?: string
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
          type={type}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={hasError || undefined}
          aria-describedby={helper || error ? helperId : undefined}
          onChange={(event) => onChange(event.target.value)}
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
