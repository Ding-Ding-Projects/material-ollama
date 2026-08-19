import type { ReactNode } from "react"
import { Badge, ProgressBar, Surface } from "@/components/md3"
import { Icon } from "@/components/md3/Icon"
import { Txt, useShows, useT } from "@/uh"
import { useReleaseInfo } from "./useReleaseInfo"
import "./status.dict"

function FactRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-medium text-on-surface-variant">{label}</span>
      <span className="font-mono text-[12.5px] text-on-surface">{children}</span>
    </div>
  )
}

/**
 * The release-identity card: real version/commit/code-name from GET
 * /api/v1/release, an honest "development build" state when
 * `isDevBuild` is true (never a borrowed dish name), and the
 * unsigned-by-policy fact cited against the exact CI assertion that
 * backs it (see app/ui/release.go's `unsignedEvidence`). The dim-sum
 * code name is School-mode gated -- it's part of the same "dim-sum
 * capabilities" family the surprise card and the catalog card belong
 * to, per the shared instructions' School-mode contract.
 */
export function ReleaseCard() {
  const t = useT("status")
  const release = useReleaseInfo()
  const showDimSum = useShows("dimsum")

  if (release.isLoading) {
    return (
      <Surface outlined radius="lg" className="flex flex-col gap-3 p-5">
        <ProgressBar label={t("loadingRelease")} className="max-w-xs" />
      </Surface>
    )
  }

  if (release.isError || !release.data) {
    return (
      <Surface outlined radius="lg" className="flex flex-col items-center gap-2 p-5 text-center">
        <Icon name="error" size={22} className="text-error" />
        <p className="text-[13px] text-on-surface">
          <Txt ns="status" k="loadErrorRelease" channel="copy" />
        </p>
      </Surface>
    )
  }

  const info = release.data

  return (
    <Surface outlined radius="lg" className="flex flex-col gap-4 p-5" data-testid="release-card">
      <div className="flex items-center gap-2.5">
        <Icon name="rocket_launch" size={20} className="shrink-0 text-on-surface-variant" />
        <h2 className="text-base font-semibold text-on-surface">{t("releaseHeading")}</h2>
        {info.isDevBuild ? (
          <Badge variant="label" tone="neutral">
            <Txt ns="status" k="devBuildBadge" channel="label" />
          </Badge>
        ) : null}
      </div>

      {info.isDevBuild ? (
        <div className="rounded-token bg-surface-low px-3.5 py-3">
          <p className="text-[13px] font-semibold text-on-surface">
            <Txt ns="status" k="devBuildTitle" channel="label" />
          </p>
          <p className="mt-1 text-[12px] text-on-surface-variant">
            <Txt ns="status" k="devBuildBody" channel="copy" />
          </p>
        </div>
      ) : showDimSum && info.codeName ? (
        <div className="flex items-center gap-2 rounded-token bg-tertiary-container px-3.5 py-2.5 text-on-tertiary-container">
          <Icon name="bakery_dining" size={18} className="shrink-0" />
          <div className="min-w-0">
            <span className="block text-[11px] font-medium opacity-80">{t("codeNameLabel")}</span>
            {/* codeName already IS "English · 中文" (see
                scripts/release-metadata.mjs, which builds it as the dish's
                English name plus its Traditional Chinese name), so this
                renders it once rather than re-appending
                dishNameEn/dishNameZhHant beside an already-combined
                string. */}
            <span className="block truncate text-[13px] font-semibold">
              <Txt channel="fact" value={info.codeName} kind="tag" />
            </span>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <FactRow label={t("versionLabel")}>
          <Txt channel="fact" value={info.version} kind="tag" />
        </FactRow>
        <FactRow label={t("commitLabel")}>
          {info.shortCommit ? <Txt channel="fact" value={info.shortCommit} kind="digest" /> : "—"}
        </FactRow>
        <FactRow label={t("workflowRunLabel")}>
          {info.workflowRunNumber !== null ? (
            <Txt channel="fact" value={info.workflowRunNumber} kind="count" />
          ) : (
            "—"
          )}
        </FactRow>
        <FactRow label={t("builtAtLabel")}>
          {info.builtAt ? <Txt channel="fact" value={info.builtAt} kind="timestamp" /> : "—"}
        </FactRow>
      </div>

      <div className="h-px bg-outline-variant" />

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <Icon name="lock_open" size={17} className="shrink-0 text-on-surface-variant" />
          <h3 className="text-[13px] font-semibold text-on-surface">{t("unsignedHeading")}</h3>
        </div>
        <p className="text-[12px] text-on-surface-variant">
          <Txt ns="status" k="unsignedBody" channel="copy" />
        </p>
        <p className="text-[11px] text-on-surface-variant">
          <span className="font-medium">{t("unsignedEvidenceLabel")}: </span>
          <Txt channel="fact" value={info.unsignedEvidence} kind="command" />
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-on-surface-variant">
          {t("assetManifestUnavailableHeading")}
        </span>
        <p className="text-[11.5px] text-on-surface-variant">
          <Txt ns="status" k="assetManifestUnavailable" channel="copy" />
          {info.assetManifest.reason ? (
            <>
              {" "}
              <Txt channel="fact" value={info.assetManifest.reason} kind="user-input" />
            </>
          ) : null}
        </p>
      </div>
    </Surface>
  )
}
