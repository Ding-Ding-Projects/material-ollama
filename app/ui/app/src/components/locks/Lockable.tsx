import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react"
import { ContextMenu, type MenuItemDef } from "@/components/md3"
import { Icon } from "@/components/md3/Icon"
import { Txt, useT } from "@/uh"
import "./locks.dict"
import { LockWizard } from "./LockWizard"
import { UnlockPrompt } from "./UnlockPrompt"
import {
  LOCKS_CHANGED_EVENT,
  findLock,
  isSessionUnlocked,
  removeLock,
  type LockRecord,
} from "@/uh/locksStore"
import { recordHistory } from "@/uh/locksHistory"

export interface LockableProps {
  /** Stable identifier for the wrapped element -- persists across
   * restarts (it is the lock's own key in local storage), so pick
   * something that will not change independently of the element it names
   * (a settings-path-shaped string like `"settings.dangerZone"` is the
   * pattern used throughout this feature's own tests). */
  id: string
  /** Human-readable name shown in the wizard, the unlock prompt, and the
   * enumerable lock list -- already localized by the caller. */
  label: string
  children: ReactNode
  className?: string
}

/**
 * Wraps any rendered element with the toy lock system: a "Lock this
 * element…" context-menu item that opens the anchored wizard, and — once
 * locked — replaces the real children with a genuinely inert-looking (but
 * fully functional) locked placeholder until the right credential is
 * supplied. This is the one place "nothing inert" actually matters most:
 * while locked, the real `children` are not mounted at all, so there is
 * no way to reach the underlying control by any route other than the
 * unlock flow.
 */
export function Lockable({ id, label, children, className }: LockableProps) {
  const t = useT("locks")
  const rootRef = useRef<HTMLDivElement>(null)
  const [lock, setLock] = useState<LockRecord | undefined>(() => findLock(id))
  const [, forceTick] = useState(0)
  const [surfaceUnlocked, setSurfaceUnlocked] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [unlockOpen, setUnlockOpen] = useState(false)

  useEffect(() => {
    const refresh = () => {
      setLock(findLock(id))
      forceTick((n) => n + 1)
    }
    window.addEventListener(LOCKS_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(LOCKS_CHANGED_EVENT, refresh)
  }, [id])

  // A "minutes" unlock has to visibly expire even if nothing else changes
  // in the meantime -- poll while genuinely time-bound so the placeholder
  // reappears the moment the window closes, rather than only on the next
  // unrelated re-render.
  useEffect(() => {
    if (!lock || lock.duration.kind !== "minutes") return
    const interval = window.setInterval(() => forceTick((n) => n + 1), 1000)
    return () => window.clearInterval(interval)
  }, [lock])

  const isUnlockedNow = lock
    ? lock.duration.kind === "surface"
      ? surfaceUnlocked
      : isSessionUnlocked(id)
    : true

  const showPlaceholder = Boolean(lock) && !isUnlockedNow

  function handleContextMenu(event: MouseEvent<HTMLDivElement>) {
    event.preventDefault()
    setContextMenu({ x: event.clientX, y: event.clientY })
  }

  const items: MenuItemDef[] = lock
    ? [
        { label: t("unlockElement"), icon: "lock_open", onClick: () => setUnlockOpen(true) },
        ...(isUnlockedNow
          ? [
              {
                label: t("removeLock"),
                icon: "delete" as const,
                danger: true,
                onClick: () => {
                  removeLock(id)
                  recordHistory({ lockId: id, label, action: "removed" })
                },
              },
            ]
          : []),
      ]
    : [{ label: t("lockThisElement"), icon: "lock", onClick: () => setWizardOpen(true) }]

  return (
    <div ref={rootRef} className={className} onContextMenu={handleContextMenu}>
      {showPlaceholder ? (
        <LockedPlaceholder label={label} onUnlock={() => setUnlockOpen(true)} />
      ) : (
        children
      )}

      {contextMenu ? (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} items={items} onClose={() => setContextMenu(null)} />
      ) : null}

      <LockWizard
        open={wizardOpen}
        anchorEl={rootRef.current}
        onClose={() => setWizardOpen(false)}
        elementId={id}
        label={label}
        onCreated={() => {
          setLock(findLock(id))
          setSurfaceUnlocked(false)
        }}
      />

      <UnlockPrompt
        open={unlockOpen}
        anchorEl={rootRef.current}
        onClose={() => setUnlockOpen(false)}
        lock={lock}
        label={label}
        onUnlocked={() => {
          if (lock?.duration.kind === "surface") setSurfaceUnlocked(true)
          setLock(findLock(id))
        }}
      />
    </div>
  )
}

function LockedPlaceholder({ label, onUnlock }: { label: string; onUnlock: () => void }) {
  return (
    <button
      type="button"
      onClick={onUnlock}
      className="flex w-full items-center gap-2 rounded-[10px] border border-dashed border-outline-variant bg-surface-low px-3 py-2.5 text-left hover:bg-surface-high"
    >
      <Icon name="lock" size={18} className="shrink-0 text-on-surface-variant" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[12.5px] font-medium">
          <Txt channel="fact" value={label} kind="tag" />
        </span>
        <span className="text-[11px] text-on-surface-variant">
          <Txt ns="locks" k="lockedBadge" />
        </span>
      </span>
    </button>
  )
}
