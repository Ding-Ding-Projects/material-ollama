import { useT } from "@/uh"
import type { HardwareResponse } from "@/screens/models/types"
import { RecoveryNotice } from "./RecoveryNotice"
import { useHardwareRecheck } from "./useHardwareRecheck"
import "./recovery.dict"

export interface NoGpuNoticeProps {
  hardware: HardwareResponse | undefined
}

/**
 * Renders only once a hardware snapshot has genuinely loaded with an
 * empty devices array -- never while `hardware` is still undefined
 * (that's "haven't asked yet", not "found nothing"). Says "not detected
 * yet", never "no GPU": an empty Devices slice means not known yet, per
 * hardware.go's own HardwareDevice doc comment -- this exact wording is
 * asserted by a test.
 */
export function NoGpuNotice({ hardware }: NoGpuNoticeProps) {
  const t = useT("recovery")
  const { hardware: current, rechecking, recheck } = useHardwareRecheck(hardware)

  if (!current || current.devices.length > 0) return null

  return (
    <RecoveryNotice
      state="no-gpu-yet"
      severity="warning"
      icon="memory"
      title={t("noGpuTitle")}
      explanation={t("noGpuBody")}
      onRetry={recheck}
      retrying={rechecking}
    />
  )
}
