// Type-only stub for the sibling-owned `Icon.tsx`. This file intentionally
// carries NO runtime implementation — it exists only so `tsc -b` can resolve
// `./Icon` while that file doesn't exist yet in this worktree. TypeScript
// prefers a real .tsx implementation over a .d.ts when both are present, so
// once the sibling lane's real Icon.tsx lands in the same directory, imports
// resolve to it automatically and this stub becomes an inert leftover for
// integration to remove.
import type { ReactElement } from "react"

export interface IconProps {
  name: string
  size?: number
  fill?: boolean
  className?: string
}

export declare function Icon(props: IconProps): ReactElement
