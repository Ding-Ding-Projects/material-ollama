import { useMemo, useState } from "react"
import { Icon } from "@/components/md3/Icon"
import { Txt } from "@/uh"
import { ArticlePane } from "./ArticlePane"
import { DocsDrawer } from "./DocsDrawer"
import { useDocsArticle, useDocsInventory } from "./useDocs"
import "./docs.dict"

/**
 * The offline documentation browser: a 300px drawer (search + A-Z grouped
 * list of all 85 shared-contract features, each with a real written/
 * scaffold status) beside an article pane. Everything renders from
 * app/ui/docs.go's embedded, staged bundle -- see
 * scripts/check-docs-bundle.mjs -- so this screen works fully offline, per
 * the offline-documentation-browser contract.
 */
export function DocsBrowser() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [regexMode, setRegexMode] = useState(false)

  const inventory = useDocsInventory()
  const article = useDocsArticle(selectedId)
  const features = useMemo(() => inventory.data ?? [], [inventory.data])

  if (inventory.isError) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
        <Icon name="warning" size={26} className="text-error" />
        <p className="max-w-xs text-sm text-on-surface-variant">
          <Txt ns="docs" k="loadError" channel="copy" />
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      <DocsDrawer
        features={features}
        selectedId={selectedId}
        onSelect={setSelectedId}
        query={query}
        onQueryChange={setQuery}
        regexMode={regexMode}
        onToggleRegex={() => setRegexMode((current) => !current)}
      />
      <ArticlePane
        article={article.data}
        isLoading={selectedId !== null && article.isLoading}
        isError={selectedId !== null && article.isError}
        hasSelection={selectedId !== null}
      />
    </div>
  )
}
