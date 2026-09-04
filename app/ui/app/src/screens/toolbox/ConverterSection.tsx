import { useCallback, useEffect, useState } from "react"
import { Button, Surface, Switch, useSnackbar } from "@/components/md3"
import { Icon } from "@/components/md3/Icon"
import { Txt, fact, useT } from "@/uh"
import { ConvertCategoryList } from "./ConvertCategoryList"
import { ConvertJobQueue } from "./ConvertJobQueue"
import {
  getConvertCatalog,
  pickConvertFile,
  probeConvertFile,
  type ConvertCategory,
  type ConvertJob,
  type ConvertLossReport,
} from "./convertApi"
import { useConvertQueue } from "./useConvertQueue"
import "./convert.dict"

interface PickedFile {
  path: string
  filename: string
  sourceFormat?: string
  sizeBytes?: number
}

/**
 * The Toolbox screen's real file converter: the categorized catalog
 * (Documents/PDF, Images, Audio, Video, Archives, Structured Data,
 * Code/Text, Binary Encodings) from GET /api/v1/convert/catalog, the
 * native OS picker for a source file, a real /probe-driven loss
 * disclosure before anything lossy runs, and the live SSE job queue --
 * every control here calls a real backend route; nothing is simulated.
 */
export function ConverterSection() {
  const t = useT("convert")
  const tTools = useT("tools")
  const snackbar = useSnackbar()

  const [catalog, setCatalog] = useState<ConvertCategory[] | null>(null)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [catalogLoading, setCatalogLoading] = useState(true)

  const [picked, setPicked] = useState<PickedFile | null>(null)
  const [pickError, setPickError] = useState<string | null>(null)
  const [detecting, setDetecting] = useState(false)

  const [targetFormatId, setTargetFormatId] = useState<string | null>(null)
  const [lossReport, setLossReport] = useState<ConvertLossReport | null>(null)
  const [lossCheckLoading, setLossCheckLoading] = useState(false)
  const [lossError, setLossError] = useState<string | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  const { jobs, createJob, cancelJob, deleteJob, busyIds } = useConvertQueue()

  const loadCatalog = useCallback(() => {
    setCatalogLoading(true)
    setCatalogError(null)
    getConvertCatalog()
      .then(setCatalog)
      .catch((e: unknown) => setCatalogError(e instanceof Error ? e.message : String(e)))
      .finally(() => setCatalogLoading(false))
  }, [])

  useEffect(() => {
    loadCatalog()
  }, [loadCatalog])

  const handlePick = async () => {
    setPickError(null)
    try {
      const result = await pickConvertFile()
      if (!result) return // user canceled -- not an error
      setPicked({ path: result.path, filename: result.filename })
      setTargetFormatId(null)
      setLossReport(null)
      setAcknowledged(false)
      setDetecting(true)
      try {
        const probe = await probeConvertFile(result.path)
        setPicked({ path: result.path, filename: result.filename, sourceFormat: probe.sourceFormat, sizeBytes: probe.sizeBytes })
      } catch (e) {
        setPickError(e instanceof Error ? e.message : String(e))
      } finally {
        setDetecting(false)
      }
    } catch (e) {
      setPickError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleSelectTarget = async (formatId: string) => {
    if (!picked) return
    setTargetFormatId(formatId)
    setLossReport(null)
    setAcknowledged(false)
    setLossError(null)
    setLossCheckLoading(true)
    try {
      const probe = await probeConvertFile(picked.path, formatId)
      setLossReport(probe.lossReport ?? { lossy: false, irreversible: false })
    } catch (e) {
      setLossError(e instanceof Error ? e.message : String(e))
    } finally {
      setLossCheckLoading(false)
    }
  }

  const handleConvert = async () => {
    if (!picked || !targetFormatId) return
    setStartError(null)
    setStarting(true)
    try {
      await createJob({
        path: picked.path,
        sourceFormat: picked.sourceFormat,
        targetFormat: targetFormatId,
        acknowledgeLossy: acknowledged,
      })
      snackbar.show(`${picked.filename} ${t("queuedToast")}`)
      setTargetFormatId(null)
      setLossReport(null)
      setAcknowledged(false)
    } catch (e) {
      setStartError(e instanceof Error ? e.message : String(e))
    } finally {
      setStarting(false)
    }
  }

  /** Re-queues a finished job's exact source/target pair -- the same
   * `createJob` the "Convert" button above uses, so a retried job appears
   * in the queue immediately rather than waiting on the next SSE tick. */
  const handleRetry = useCallback(
    (job: ConvertJob) => {
      createJob({
        path: job.inputPath,
        sourceFormat: job.sourceFormat,
        targetFormat: job.targetFormat,
        // The original acknowledgement already covered this exact
        // source/target pair; retrying doesn't re-ask for a disclosure
        // the user already accepted for the identical conversion.
        acknowledgeLossy: job.acknowledged,
      })
        .then(() => snackbar.show(`${job.inputFilename} ${t("requeuedToast")}`))
        .catch((e: unknown) => snackbar.show(e instanceof Error ? e.message : String(e)))
    },
    [createJob, snackbar, t],
  )

  const webviewAvailable = typeof window !== "undefined" && Boolean(window.webview?.selectFile)
  const needsAcknowledgement = Boolean(lossReport?.lossy) && !acknowledged

  return (
    <Surface outlined radius="lg" className="flex flex-col gap-4 p-5">
      <div className="flex items-center gap-2.5">
        <Icon name="sync_alt" size={20} className="shrink-0 text-on-surface-variant" />
        <h2 className="text-base font-semibold text-on-surface">{tTools("converter")}</h2>
      </div>
      <p className="text-[12.5px] text-on-surface-variant">
        <Txt ns="tools" k="converterHonest" channel="copy" />
      </p>

      {/* --- Source file --- */}
      <div className="flex flex-col gap-1.5">
        {picked ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-high px-3 py-2 text-[12.5px]">
            <Icon name="folder" size={16} className="shrink-0 text-on-surface-variant" />
            <span className="truncate font-medium" title={picked.filename}>
              {fact(picked.filename, "path")}
            </span>
            {detecting ? (
              <span className="text-[11px] text-on-surface-variant">{t("detecting")}</span>
            ) : picked.sourceFormat ? (
              <span className="text-[11px] text-on-surface-variant">
                {t("detectedSource")}: {fact(picked.sourceFormat, "user-input")}
              </span>
            ) : (
              <span className="text-[11px] text-error">{t("detectionFailed")}</span>
            )}
            <Button variant="text" size="sm" onClick={handlePick} className="ml-auto">
              {t("changeFile")}
            </Button>
          </div>
        ) : (
          <>
            <Button variant="outlined" size="sm" icon="folder" onClick={handlePick} disabled={!webviewAvailable}>
              {t("pickFile")}
            </Button>
            <p className="text-[11px] text-on-surface-variant">
              {webviewAvailable ? t("noFileSelected") : t("webviewUnavailable")}
            </p>
          </>
        )}
        <p className="text-[10.5px] text-on-surface-variant">{t("pickerLimitNotice")}</p>
        {pickError ? (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-error-container px-3 py-2 text-[11.5px] text-on-error-container">
            <span>{fact(pickError, "user-input")}</span>
            <Button variant="text" size="sm" onClick={handlePick}>
              {t("errorRetry")}
            </Button>
          </div>
        ) : null}
      </div>

      {/* --- Catalog --- */}
      {catalogLoading ? (
        <p className="text-[12.5px] text-on-surface-variant">{t("detecting")}</p>
      ) : catalogError ? (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-error-container px-3 py-2 text-[11.5px] text-on-error-container">
          <span>{fact(catalogError, "user-input")}</span>
          <Button variant="text" size="sm" onClick={loadCatalog}>
            {t("errorRetry")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {(catalog ?? []).map((category) => (
            <ConvertCategoryList
              key={category.id}
              category={category}
              onSelectFormat={handleSelectTarget}
              selectedFormatId={targetFormatId ?? undefined}
              sourceFormatId={picked?.sourceFormat}
              pickable={Boolean(picked?.sourceFormat)}
            />
          ))}
        </div>
      )}

      {/* --- Conversion preview / loss disclosure / convert action --- */}
      {targetFormatId ? (
        <div className="flex flex-col gap-2 rounded-lg border border-outline-variant p-3.5">
          {lossCheckLoading ? (
            <p className="text-[11.5px] text-on-surface-variant">{t("detecting")}</p>
          ) : lossError ? (
            <div className="flex items-center justify-between gap-2 text-[11.5px] text-error">
              <span>{fact(lossError, "user-input")}</span>
              <Button variant="text" size="sm" onClick={() => handleSelectTarget(targetFormatId)}>
                {t("errorRetry")}
              </Button>
            </div>
          ) : lossReport?.lossy ? (
            <div className="flex flex-col gap-2">
              <p className="flex items-start gap-1.5 text-[12px] font-semibold text-error">
                <Icon name="warning" size={15} className="mt-0.5 shrink-0" />
                {t("lossyTitle")}
              </p>
              <ul className="list-disc pl-5 text-[11.5px] text-on-surface-variant">
                {(lossReport.reasons ?? []).map((reason, i) => (
                  <li key={i}>{fact(reason, "user-input")}</li>
                ))}
              </ul>
              {lossReport.irreversible ? <p className="text-[11px] font-semibold text-error">{t("irreversibleNotice")}</p> : null}
              <Switch
                checked={acknowledged}
                onChange={setAcknowledged}
                label={t("acknowledgeLossy")}
              />
            </div>
          ) : null}

          {startError ? (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-error-container px-3 py-2 text-[11.5px] text-on-error-container">
              <span>{fact(startError, "user-input")}</span>
              <Button variant="text" size="sm" onClick={handleConvert}>
                {t("errorRetry")}
              </Button>
            </div>
          ) : null}

          <Button
            variant="filled"
            size="sm"
            icon="system_update_alt"
            loading={starting}
            disabled={needsAcknowledgement || lossCheckLoading}
            onClick={handleConvert}
            className="self-end"
          >
            {t("startConversion")}
          </Button>
        </div>
      ) : null}

      {/* --- Job queue --- */}
      <div className="h-px bg-outline-variant" />
      <h3 className="text-[13px] font-semibold text-on-surface">{tTools("queue")}</h3>
      <ConvertJobQueue
        jobs={jobs}
        busyIds={busyIds}
        onCancel={(id) => cancelJob(id).catch((e: unknown) => snackbar.show(e instanceof Error ? e.message : String(e)))}
        onDelete={(id) => deleteJob(id).catch((e: unknown) => snackbar.show(e instanceof Error ? e.message : String(e)))}
        onRetry={handleRetry}
      />
    </Surface>
  )
}
