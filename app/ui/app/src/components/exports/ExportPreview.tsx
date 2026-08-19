import { useState } from "react"
import { Streamdown } from "streamdown"
import { IconButton } from "@/components/md3"
import { ScrollRegion, WideContentScroller } from "@/uh/a11yScrollRegion"
import { Txt, useT } from "@/uh"
import "./exports.dict"
import type { ExportResult } from "./exportFormats"

export interface ExportPreviewProps {
  readonly result: ExportResult
}

/**
 * "Provider-authored text is rendered, not printed": the export's own
 * generated Markdown and HTML content is shown as real formatted output
 * -- through Streamdown (this app's one shared markdown renderer, already
 * used for chat -- see components/StreamingMarkdownContent.tsx) for
 * Markdown, and through a fully sandboxed iframe (no scripts, no
 * same-origin, so it never runs with this app's own privileges) for HTML
 * -- rather than dumping either as raw source text in a <pre>. JSON,
 * JSONL, YAML, CSV, and TSV are the app's own generated DATA, not
 * provider-authored prose, so they render as labeled monospace text
 * instead -- there's no "rendered form" of a CSV row to render.
 *
 * Every format still offers a raw-source view, because a rendered preview
 * is for judging the shape of the export, not a substitute for reading
 * the literal bytes that will be written to disk.
 */
export function ExportPreview({ result }: ExportPreviewProps) {
  const t = useT("exports")
  const [showRaw, setShowRaw] = useState(false)
  const canRender = result.formatId === "markdown" || result.formatId === "html"

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wide text-on-surface-variant uppercase">
          <Txt ns="exports" k="previewLabel" channel="label" />
        </span>
        {canRender ? (
          <IconButton
            label={showRaw ? t("viewRendered") : t("viewRawSource")}
            icon={showRaw ? "check_circle" : "code"}
            size="sm"
            selected={showRaw}
            onClick={() => setShowRaw((current) => !current)}
          />
        ) : null}
      </div>

      <ScrollRegion ariaLabel={t("previewLabel")} maxHeightPx={320} className="rounded-[10px] border border-outline-variant bg-surface-low">
        {canRender && !showRaw ? (
          <RenderedPreview result={result} />
        ) : (
          // No `ariaLabel` here -- this container is nested inside the
          // already-labeled ScrollRegion above; a second same-named
          // landmark region right inside the first would be redundant,
          // not more accessible. It still gets the real `overflow-x:
          // auto` containment WideContentScroller exists to provide.
          <WideContentScroller>
            <pre className="min-w-max p-3 font-mono text-[11.5px] leading-[1.5] whitespace-pre text-on-surface">
              {result.content}
            </pre>
          </WideContentScroller>
        )}
      </ScrollRegion>
    </div>
  )
}

function RenderedPreview({ result }: { result: ExportResult }) {
  const t = useT("exports")
  if (result.formatId === "markdown") {
    return (
      <div className="prose prose-sm max-w-none p-3">
        <Streamdown>{result.content}</Streamdown>
      </div>
    )
  }
  // HTML: rendered through a fully sandboxed iframe (empty `sandbox`
  // attribute -- no scripts, no forms, no same-origin, no popups, no
  // top-navigation) so provider-authored/app-generated HTML is displayed
  // with none of this app's own privileges, exactly the way any other
  // untrusted-markup surface in this app must.
  return (
    <iframe
      title={t("htmlPreviewFrameTitle")}
      srcDoc={result.content}
      sandbox=""
      className="h-[320px] w-full border-0 bg-white"
    />
  )
}
