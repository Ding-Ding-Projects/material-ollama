import { useEffect, useState } from "react"
import { Icon } from "@/components/md3/Icon"
import { Txt, useShows, useT } from "@/uh"
import { rollDimSumSurprise } from "./dimSumSurprise"
import type { ReleaseCatalogDish } from "./types"
import { useReleaseInfo } from "./useReleaseInfo"
import "./status.dict"

/**
 * The ~10% dim-sum startup surprise, scoped to this screen: rolled once
 * per mount against this build's real embedded catalog snapshot (see
 * dimSumSurprise.ts). On the 90% of visits where it doesn't fire, or on a
 * development build with an empty catalog, this renders nothing at all --
 * not a "no surprise today" placeholder, which would turn a rare treat
 * into a permanent fixture nobody asked for. Hidden entirely, not
 * disabled, under School mode.
 */
export function DimSumSurpriseCard() {
  const t = useT("status")
  const release = useReleaseInfo()
  const showDimSum = useShows("dimsum")
  const [dish, setDish] = useState<ReleaseCatalogDish | null | undefined>(undefined)

  useEffect(() => {
    if (release.data && dish === undefined) {
      setDish(rollDimSumSurprise(release.data.catalog))
    }
  }, [release.data, dish])

  if (!showDimSum) return null
  if (!dish) return null

  return (
    <div
      className="flex items-center gap-3 rounded-token bg-tertiary-container p-4 text-on-tertiary-container"
      data-testid="dimsum-surprise-card"
    >
      <Icon name="bakery_dining" size={24} className="shrink-0" />
      <div className="min-w-0">
        <p className="text-[13px] font-semibold">{t("dimSumSurpriseHeading")}</p>
        <p className="truncate text-[13px]">
          <Txt channel="fact" value={dish.nameEn} kind="tag" /> · <Txt channel="fact" value={dish.nameZhHant} kind="tag" />
        </p>
        <p className="text-[11.5px] opacity-85">
          <Txt ns="app" k="dishNote" channel="copy" />
        </p>
      </div>
    </div>
  )
}
