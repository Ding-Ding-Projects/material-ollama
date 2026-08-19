import { Chip, Surface } from "@/components/md3"
import { Icon } from "@/components/md3/Icon"
import { Txt, fact, useShows, useT } from "@/uh"
import { useReleaseInfo } from "./useReleaseInfo"
import "./status.dict"

/**
 * The build-embedded dim-sum release catalog -- app/ui/release.go's
 * `catalog` field, a build-time snapshot of the public
 * Ding-Ding-Projects/dim-sum-photos catalog so this works fully offline.
 * Hidden entirely (not disabled) under School mode, per the "dimsum"
 * feature family `useShows()` covers -- names, code names and every
 * dim-sum reference are part of that family, not just the surprise toast.
 */
export function DimSumCatalogCard() {
  const t = useT("status")
  const release = useReleaseInfo()
  const showDimSum = useShows("dimsum")

  if (!showDimSum) return null
  if (!release.data) return null

  const catalog = release.data.catalog
  const countText = fact(t("dimSumCatalogCount").split("{n}").join(String(catalog.length)), "count")

  return (
    <Surface outlined radius="lg" className="flex flex-col gap-3 p-5" data-testid="dimsum-catalog-card">
      <div className="flex items-center gap-2.5">
        <Icon name="bakery_dining" size={20} className="shrink-0 text-on-surface-variant" />
        <h2 className="text-base font-semibold text-on-surface">{t("dimSumCatalogHeading")}</h2>
      </div>
      <p className="text-[12.5px] text-on-surface-variant">
        <Txt ns="status" k="dimSumCatalogBody" channel="copy" />
      </p>

      {catalog.length === 0 ? (
        <p className="rounded-token bg-surface-low px-3.5 py-3 text-[12.5px] text-on-surface-variant">
          <Txt ns="status" k="dimSumCatalogEmpty" channel="copy" />
        </p>
      ) : (
        <>
          <p className="text-[11px] text-on-surface-variant">{countText}</p>
          <div className="flex flex-wrap gap-1.5">
            {catalog.map((dish) => (
              <Chip key={dish.id} as="span" icon="bakery_dining">
                <Txt channel="fact" value={dish.nameEn} kind="tag" />
                {" · "}
                <Txt channel="fact" value={dish.nameZhHant} kind="tag" />
              </Chip>
            ))}
          </div>
        </>
      )}
    </Surface>
  )
}
