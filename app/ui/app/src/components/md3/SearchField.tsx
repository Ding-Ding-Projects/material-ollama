import clsx from "clsx"
import { Icon } from "./Icon"
import { FOCUS_RING_WITHIN } from "./tokens"

export interface SearchFieldProps {
  value: string
  onChange: (value: string) => void
  placeholder: string
  /** Accessible name for the field — every search bar in the design carries
   * one even where the placeholder duplicates it. */
  label: string
  /** Whether the query is currently interpreted as a regular expression.
   * Pass together with `onToggleRegex` to render an inline `.* ` mode
   * toggle (the Models-screen pattern); omit both to skip it. */
  regex?: boolean
  onToggleRegex?: () => void
  /** Opens the full anchored regex builder. When `onToggleRegex` is absent,
   * the `.* ` affordance itself triggers this directly — the pattern used
   * by chat search, settings search, dev-tools search and every context
   * menu filter field. */
  onOpenBuilder?: () => void
  disabled?: boolean
  className?: string
}

/**
 * The pill search field that appears seven times across the design: a
 * surface-highest capsule, borderless input, and a trailing Roboto Mono
 * `.* ` affordance that either toggles regex mode inline or opens the full
 * regex builder — every search bar in the app must offer this per the
 * regex-builder contract.
 */
export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  regex = false,
  onToggleRegex,
  onOpenBuilder,
  disabled = false,
  className,
}: SearchFieldProps) {
  const dotStarAction = onToggleRegex ?? onOpenBuilder
  const dotStarTitle = onToggleRegex ? "Regex search" : "Regex builder"

  return (
    <div
      className={clsx(
        "flex items-center gap-1.5 rounded-full bg-surface-highest py-0.5 pr-1.5 pl-3",
        disabled && "opacity-38",
        FOCUS_RING_WITHIN,
        className,
      )}
    >
      <Icon name="search" size={17} className="shrink-0 text-on-surface-variant" />
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        aria-label={label}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 bg-transparent px-2 py-2 text-[12.5px] outline-none placeholder:text-on-surface-variant"
      />
      {dotStarAction ? (
        <button
          type="button"
          onClick={dotStarAction}
          aria-pressed={onToggleRegex ? regex : undefined}
          title={dotStarTitle}
          aria-label={dotStarTitle}
          className={clsx(
            "relative shrink-0 rounded-lg px-2 py-1 font-mono text-[11px]",
            "before:content-[''] before:absolute before:-inset-1.5",
            onToggleRegex && regex
              ? "bg-secondary-container text-on-secondary-container"
              : "text-outline hover:text-on-surface",
          )}
        >
          .*
        </button>
      ) : null}
    </div>
  )
}
