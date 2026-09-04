import { useSyncExternalStore } from "react"

// Only occupancy is shared. Message text, attachments and paths stay in the composer.
const drafts = new Set<symbol>()
const listeners = new Set<() => void>()

export function setComposerUnsavedWork(owner: symbol, present: boolean): void {
  const previous = drafts.has(owner)
  if (present) drafts.add(owner)
  else drafts.delete(owner)
  if (previous !== present) for (const listener of listeners) listener()
}

export function hasComposerUnsavedWork(): boolean { return drafts.size > 0 }

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function useComposerUnsavedWork(): boolean {
  return useSyncExternalStore(subscribe, hasComposerUnsavedWork, () => false)
}
