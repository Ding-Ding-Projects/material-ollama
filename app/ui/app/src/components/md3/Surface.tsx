import clsx from "clsx"
import type { ComponentPropsWithoutRef, ElementType } from "react"
import {
  ELEVATION_CLASSES,
  RADIUS_CLASSES,
  SURFACE_TIER_CLASSES,
  type Elevation,
  type SurfaceRadius,
  type SurfaceTier,
} from "./tokens"

type SurfaceOwnProps = {
  tier?: SurfaceTier
  outlined?: boolean
  elevation?: Elevation
  radius?: SurfaceRadius
  className?: string
}

export type SurfaceProps<T extends ElementType = "div"> = SurfaceOwnProps & {
  as?: T
} & Omit<ComponentPropsWithoutRef<T>, keyof SurfaceOwnProps | "as">

/**
 * The one primitive every card, panel and container surface is built from.
 * Tier picks the surface elevation-tone bucket (lowest → highest), `outlined`
 * adds the design's ubiquitous 1px outline-variant border, `elevation` adds
 * real drop-shadow depth on top of the tonal tier, and `radius` follows the
 * user's customizable corner token by default.
 */
export function Surface<T extends ElementType = "div">({
  as,
  tier = "base",
  outlined = false,
  elevation = 0,
  radius = "token",
  className,
  ...rest
}: SurfaceProps<T>) {
  const Component = as ?? "div"
  return (
    <Component
      className={clsx(
        SURFACE_TIER_CLASSES[tier],
        RADIUS_CLASSES[radius],
        ELEVATION_CLASSES[elevation],
        outlined && "border border-outline-variant",
        className,
      )}
      {...rest}
    />
  )
}
