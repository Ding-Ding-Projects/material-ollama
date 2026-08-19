// Guided-recovery barrel: the reusable RecoveryNotice presentational
// component, one hook per real backend state it can represent, and one
// self-contained wrapper component per state that a screen can drop in
// with zero prop plumbing (PullRecoveryNotice/NoGpuNotice are the two
// exceptions -- they need data the Models screen already holds).
export {
  RecoveryNotice,
  type RecoverySeverity,
  type RecoveryNoticeAction,
  type RecoveryNoticeProps,
} from "./RecoveryNotice"

export { OllamaHealthNotice } from "./OllamaHealthNotice"
export { NoGpuNotice, type NoGpuNoticeProps } from "./NoGpuNotice"
export { CatalogRecoveryNotice } from "./CatalogRecoveryNotice"
export { DockerGpuNotice } from "./DockerGpuNotice"
export { PullRecoveryNotice, type PullRecoveryNoticeProps } from "./PullRecoveryNotice"

export {
  useOllamaHealthRecovery,
  type UseOllamaHealthRecovery,
  type OllamaHealthStatus,
} from "./useOllamaHealthRecovery"
export { useHardwareRecheck, type UseHardwareRecheck } from "./useHardwareRecheck"
export { useCatalogRecovery, type UseCatalogRecovery } from "./useCatalogRecovery"
export { useDockerGpuRecovery, type UseDockerGpuRecovery } from "./useDockerGpuRecovery"
export { usePullRecovery, type UsePullRecovery, isDiskPreflightRefusal } from "./usePullRecovery"

export * from "./types"
export * from "./api"
