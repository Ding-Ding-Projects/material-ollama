import StreamingMarkdownContent from "@/components/StreamingMarkdownContent"
import { ProgressBar } from "@/components/md3"
import { Icon } from "@/components/md3/Icon"
import { Txt, useT } from "@/uh"
import type { DocsArticle } from "@/api"
import "./docs.dict"

export interface ArticlePaneProps {
  article: DocsArticle | undefined
  isLoading: boolean
  isError: boolean
  hasSelection: boolean
}

/**
 * The article body. Four real states, not one component that silently
 * papers over the difference between them: nothing selected yet; the
 * article is loading or failed to load; the article exists but is nothing
 * but its generated scaffold (`written: false` -- see docsIsScaffoldOnly in
 * app/ui/docs.go); or the article has real hand-written content, rendered
 * through the app's one shared isolated markdown renderer rather than a
 * second one built just for this screen.
 *
 * The scaffold-only case is the one this component exists to get right:
 * showing the generated TODO(...) body as though it were documentation
 * would let the app's own documentation browser overstate the app's own
 * completeness, on the exact screen whose job is reporting it honestly.
 */
export function ArticlePane({ article, isLoading, isError, hasSelection }: ArticlePaneProps) {
  const t = useT("docs")

  if (!hasSelection) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
        <Icon name="menu_book" size={30} className="text-on-surface-variant" />
        <p className="max-w-xs text-sm text-on-surface-variant">
          <Txt ns="docs" k="selectPrompt" channel="copy" />
        </p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 px-8">
        <ProgressBar height={5} label={t("loadingLabel")} className="w-56" />
      </div>
    )
  }

  if (isError || !article) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
        <Icon name="warning" size={26} className="text-error" />
        <p className="max-w-xs text-sm text-on-surface-variant">
          <Txt ns="docs" k="articleLoadError" channel="copy" />
        </p>
      </div>
    )
  }

  if (!article.written) {
    return (
      <div className="h-full flex-1 overflow-y-auto px-8 py-10">
        <h1 className="text-xl font-semibold text-on-surface">{article.title}</h1>
        <div className="mt-6 flex items-start gap-3 rounded-token border border-outline-variant bg-surface-low p-4">
          <Icon name="construction" size={20} className="mt-0.5 shrink-0 text-on-surface-variant" />
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-semibold text-on-surface">
              <Txt ns="docs" k="notWrittenTitle" channel="copy" />
            </p>
            <p className="text-[12.5px] leading-[1.55] text-on-surface-variant">
              <Txt ns="docs" k="notWrittenBody" channel="copy" />
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex-1 overflow-y-auto px-8 py-10">
      <StreamingMarkdownContent content={article.content} isStreaming={false} />
    </div>
  )
}
