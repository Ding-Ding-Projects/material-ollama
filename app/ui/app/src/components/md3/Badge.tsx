import clsx from "clsx"
import type { ReactNode } from "react"
import { TONE_CLASSES, type Tone } from "./tokens"

type BadgeCommon = {
  tone?: Tone
  className?: string
}

export type BadgeProps =
  | (BadgeCommon & { variant: "dot"; label: string })
  | (BadgeCommon & { variant: "count"; count: number; max?: number; label?: string })
  | (BadgeCommon & { variant: "label"; children: ReactNode })

/** The small status marks scattered across the design: the unread-notification
 * dot, an overflow count, and the tonal fit/capability text pills. */
export function Badge(props: BadgeProps) {
  const tone = props.tone ?? "error"

  if (props.variant === "dot") {
    return (
      <span
        role="status"
        aria-label={props.label}
        className={clsx("inline-block h-2 w-2 rounded-full", TONE_CLASSES[tone].split(" ")[0], props.className)}
      />
    )
  }

  if (props.variant === "count") {
    const max = props.max ?? 99
    const text = props.count > max ? `${max}+` : String(props.count)
    return (
      <span
        role="status"
        aria-label={props.label ?? `${props.count}`}
        className={clsx(
          "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-semibold",
          TONE_CLASSES[tone],
          props.className,
        )}
      >
        {text}
      </span>
    )
  }

  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold whitespace-nowrap",
        TONE_CLASSES[tone],
        props.className,
      )}
    >
      {props.children}
    </span>
  )
}
