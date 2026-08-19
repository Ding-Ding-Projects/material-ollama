import clsx from "clsx"

export interface ProgressBarProps {
  /** Omit for an indeterminate bar (unknown duration); 0–100 for a
   * determinate one — the design's pull-queue progress. */
  value?: number
  height?: 5 | 6
  label?: string
  className?: string
}

const HEIGHT_CLASSES: Record<NonNullable<ProgressBarProps["height"]>, string> = {
  5: "h-[5px]",
  6: "h-1.5",
}

/**
 * Track = surface-highest, fill = primary, width transitions over 300ms —
 * exactly the pull-queue bar in the design. The indeterminate sweep uses a
 * component-scoped `<style>` keyframe (not a global stylesheet edit) since
 * this lane can't add rules to src/index.css.
 */
export function ProgressBar({ value, height = 6, label, className }: ProgressBarProps) {
  const determinate = typeof value === "number"
  const clamped = determinate ? Math.min(100, Math.max(0, value)) : 0

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={determinate ? Math.round(clamped) : undefined}
      aria-valuemin={0}
      aria-valuemax={100}
      className={clsx("w-full overflow-hidden rounded-full bg-surface-highest", HEIGHT_CLASSES[height], className)}
    >
      {determinate ? (
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${clamped}%` }}
        />
      ) : (
        <>
          <style>{`
            @keyframes md3ProgressIndeterminate {
              0% { transform: translateX(-60%); }
              100% { transform: translateX(160%); }
            }
          `}</style>
          <div
            className="h-full w-2/5 rounded-full bg-primary"
            style={{ animation: "md3ProgressIndeterminate 1.1s ease-in-out infinite" }}
          />
        </>
      )}
    </div>
  )
}
