import type { ReactNode, RefObject } from "react"
import { ListItem } from "@/components/md3"
import { useRovingTabindex } from "@/uh/a11yRovingTabindex"
import { WideContentScroller } from "@/uh/a11yScrollRegion"
import type { Localized } from "@/uh"
import { BulkCheckbox } from "./BulkCheckbox"
import type { UseBulkSelectionResult } from "./useBulkSelection"

export interface BulkSelectableListProps<T> {
  readonly items: readonly T[]
  readonly getId: (item: T) => string
  readonly renderPrimary: (item: T) => ReactNode
  readonly renderSecondary?: (item: T) => ReactNode
  /**
   * A REAL, live control for this row -- the "rich controls" contract:
   * wherever a value is shown, prefer the actual control a user can
   * operate over a printout of it. Every value this renders must be
   * wired to the same state/validation/persistence the value's owning
   * surface uses; this list never invents a second, disconnected copy of
   * it. Omit for rows with nothing to control inline.
   */
  readonly renderRichControl?: (item: T) => ReactNode
  readonly selection: UseBulkSelectionResult
  readonly ariaLabel: Localized
  readonly rowAriaLabel: (item: T) => Localized
  readonly emptyState?: ReactNode
  readonly className?: string
}

/**
 * The generic, reusable bulk-selectable list this lane ships: real
 * multi-select via a genuine `<input type="checkbox">` per row (click
 * toggles it, Space/Enter toggle it while it's focused -- both native
 * browser behavior, nothing reimplemented), shift-click ranges, a
 * keyboard equivalent for moving between rows without excess Tabbing
 * (arrow keys roam via uh/a11yRovingTabindex.ts, landing focus on each
 * row's real checkbox rather than a second, separate focusable element
 * layered over the row), rich inline controls per row rather than
 * printed values, and wide rows scrolling in their own horizontal
 * container rather than the page (uh/a11yScrollRegion.tsx).
 *
 * A plain checkbox list (each row a labelled `<input type="checkbox">`),
 * not an ARIA `listbox`/`option` composite widget -- that avoids nesting
 * one interactive control (the checkbox) inside another ARIA role that
 * isn't specified to contain widgets, while still being a completely
 * ordinary, well-supported accessible pattern.
 *
 * Generic over `T` deliberately: it is proven against ordinary records
 * AND against notification-log-shaped and history-log-shaped data in
 * BulkSelectableList.logSurfaces.dom.test.tsx -- "it's just a log" is not
 * an exemption from bulk actions, and this is what makes that true for
 * whichever real notification-centre/history screen wires it in next
 * (this lane's allowed paths don't include components/shell/** or a real
 * history screen, so that wiring is this component's next integration
 * step, not something built here).
 */
export function BulkSelectableList<T>({
  items,
  getId,
  renderPrimary,
  renderSecondary,
  renderRichControl,
  selection,
  ariaLabel,
  rowAriaLabel,
  emptyState,
  className,
}: BulkSelectableListProps<T>) {
  const { containerRef, getItemProps } = useRovingTabindex({ count: items.length })

  if (items.length === 0) {
    return <div role="status">{emptyState}</div>
  }

  return (
    <WideContentScroller ariaLabel={ariaLabel} className={className}>
      <ul
        ref={containerRef as RefObject<HTMLUListElement>}
        aria-label={ariaLabel}
        className="flex min-w-max flex-col gap-1"
      >
        {items.map((item, index) => {
          const id = getId(item)
          const selected = selection.isSelected(id)
          const rovingProps = getItemProps(index)

          return (
            <li key={id}>
              <ListItem
                selected={selected}
                shape="rounded"
                leading={
                  <BulkCheckbox
                    checked={selected}
                    onChange={(_checked, event) => {
                      if (event.shiftKey) selection.toggleRange(id)
                      else selection.toggle(id)
                    }}
                    ariaLabel={rowAriaLabel(item)}
                    tabIndex={rovingProps.tabIndex}
                    onFocus={rovingProps.onFocus}
                    onKeyDown={rovingProps.onKeyDown}
                    data-roving-index={index}
                  />
                }
                title={renderPrimary(item)}
                supporting={renderSecondary?.(item)}
                trailing={renderRichControl?.(item)}
              />
            </li>
          )
        })}
      </ul>
    </WideContentScroller>
  )
}
