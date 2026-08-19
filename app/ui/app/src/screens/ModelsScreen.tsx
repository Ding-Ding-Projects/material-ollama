import { useMemo, useState } from "react"
import { SearchField } from "@/components/md3"
import { useModelStore } from "@/hooks/useModelStore"
import { Txt, useT } from "@/uh"
import { CatalogSection } from "./models/CatalogSection"
import { HardwareFitBar } from "./models/HardwareFitBar"
import { ModelCard } from "./models/ModelCard"
import { PullQueueCard } from "./models/PullQueueCard"
import type { InstalledModel, RunningModel } from "./models/types"
import "./models/modelsUi.dict"
// (also transitively imported by every child below, but every direct
// consumer of the "modelsUi" namespace registers it explicitly — the same
// convention PlaceholderScreen follows for "shell" — rather than relying
// on import order through a sibling module.)

function matchesQuery(model: InstalledModel, query: string, regex: boolean): boolean {
  const trimmed = query.trim()
  if (!trimmed) return true
  const haystack = `${model.name} ${model.model}`.toLowerCase()
  if (!regex) return haystack.includes(trimmed.toLowerCase())
  try {
    return new RegExp(trimmed, "i").test(haystack)
  } catch {
    // An unfinished/invalid pattern is a normal thing to be mid-typing —
    // treat it as "no matches" rather than throwing through the render.
    return false
  }
}

/**
 * The new home screen: real hardware detection, real installed/running
 * models, a real live pull queue, and an honest empty state where a
 * catalog browser would go (there is no catalog service yet — see
 * CatalogSection). Nothing here is simulated; every control is wired to
 * the routes registered in app/ui/hardware.go and app/ui/models.go via
 * useModelStore.
 */
export default function ModelsScreen() {
  const t = useT("models")
  const tUi = useT("modelsUi")
  const store = useModelStore()

  const [query, setQuery] = useState("")
  const [regex, setRegex] = useState(false)

  const runningByModel = useMemo(() => {
    const map = new Map<string, RunningModel>()
    for (const proc of store.running) map.set(proc.model, proc)
    return map
  }, [store.running])

  const filteredInstalled = useMemo(
    () => store.installed.filter((model) => matchesQuery(model, query, regex)),
    [store.installed, query, regex],
  )

  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-4 p-7">
      <div className="flex flex-wrap items-end gap-3.5">
        <div className="min-w-[220px] flex-1">
          <h1 className="text-2xl font-semibold text-on-surface">
            <Txt ns="models" k="modelStore" />
          </h1>
          <p className="mt-1 text-[13px] text-on-surface-variant">
            <Txt ns="models" k="modelStoreSub" channel="copy" />
          </p>
        </div>
        <SearchField
          value={query}
          onChange={setQuery}
          label={t("searchModels")}
          placeholder={t("searchModels")}
          regex={regex}
          onToggleRegex={() => setRegex((current) => !current)}
          className="w-[240px]"
        />
      </div>

      <HardwareFitBar hardware={store.hardware} isLoading={store.hardwareLoading} />

      <PullQueueCard
        items={store.queue}
        busyIds={store.busyPullIds}
        onPause={store.pause}
        onResume={store.resume}
        onCancel={store.cancel}
      />

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold">
            <Txt ns="modelsUi" k="installedSectionTitle" />
          </span>
          <span className="rounded-full bg-surface-high px-2 py-0.5 text-[10.5px] font-semibold text-on-surface-variant">
            {store.installed.length}
          </span>
        </div>

        {!store.installedLoading && store.installed.length === 0 ? (
          <p className="text-[12.5px] text-on-surface-variant">{tUi("installedEmpty")}</p>
        ) : filteredInstalled.length === 0 && store.installed.length > 0 ? (
          <p className="text-[12.5px] text-on-surface-variant">{tUi("noSearchMatches")}</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-3">
            {filteredInstalled.map((model) => (
              <ModelCard
                key={model.digest || model.model}
                model={model}
                running={runningByModel.get(model.model)}
                removing={store.removingNames.has(model.model)}
                onRemove={store.remove}
              />
            ))}
          </div>
        )}
      </div>

      <CatalogSection onPull={store.pull} pulling={store.pullingNew} />
    </div>
  )
}
