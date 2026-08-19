import clsx from "clsx"
import { Icon } from "./Icon"
import { FOCUS_RING_WITHIN } from "./tokens"

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  ariaLabel: string
  disabled?: boolean
  className?: string
}

/** A styled native `<select>` — outline-variant border, surface-low fill,
 * the same 10px corner radius every form control in the design uses. */
export function Select({ value, onChange, options, ariaLabel, disabled = false, className }: SelectProps) {
  return (
    <div
      className={clsx(
        "relative inline-flex items-center rounded-[10px] border border-outline-variant bg-surface-low",
        disabled && "opacity-38",
        FOCUS_RING_WITHIN,
        className,
      )}
    >
      <select
        value={value}
        aria-label={ariaLabel}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="w-full appearance-none bg-transparent py-2 pr-8 pl-3 text-[12.5px] outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Icon
        name="arrow_drop_down"
        size={18}
        className="pointer-events-none absolute right-2 text-on-surface-variant"
      />
    </div>
  )
}
