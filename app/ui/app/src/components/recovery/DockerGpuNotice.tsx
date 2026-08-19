import { useT } from "@/uh"
import { RecoveryNotice, type RecoverySeverity } from "./RecoveryNotice"
import { useDockerGpuRecovery } from "./useDockerGpuRecovery"
import "./recovery.dict"

/**
 * The container-based GPU-passthrough capability app/ui/docker.go
 * already exposes (GET /status, POST /probe-gpu) with no frontend
 * consumer before this lane. Silent once Docker is present and the last
 * probe confirmed gpu-available; otherwise renders Docker's own
 * Reason/NextStep verbatim rather than re-describing WSL2/toolkit
 * detection with parallel copy here.
 */
export function DockerGpuNotice() {
  const t = useT("recovery")
  const { status, loading, probing, retry, probe } = useDockerGpuRecovery()

  if (loading || !status) return null

  const probeVerdict = status.lastGpuProbe?.verdict
  if (status.docker.present && probeVerdict === "gpu-available") return null

  const severity: RecoverySeverity = status.docker.present ? "warning" : "error"
  const title = status.docker.present ? t("dockerCpuOnlyTitle") : t("dockerUnavailableTitle")
  const explanation = status.docker.present ? t("dockerCpuOnlyBody") : t("dockerUnavailableBody")
  const reason = status.lastGpuProbe?.reason ?? status.docker.error
  const nextStep = status.lastGpuProbe?.nextStep

  return (
    <RecoveryNotice
      state="docker-gpu"
      severity={severity}
      icon="deployed_code"
      title={title}
      explanation={explanation}
      reason={reason}
      nextStep={nextStep}
      onRetry={retry}
      retrying={loading}
      action={{ label: t("probeGpu"), onClick: probe, loading: probing, icon: "bolt" }}
    />
  )
}
