import { defineDict } from "@/uh/dict/defineDict"

/**
 * Strings for RecoveryNotice and the state-specific notices built on it.
 * These are the plain-language explanation and generic control labels;
 * the Reason/NextStep facts a notice shows alongside them always come
 * straight from the server (Docker's Reason/NextStep, a catalog
 * snapshot's Reason, a pull preflight's exact refusal text) and are
 * rendered verbatim via fact() rather than duplicated here -- see the
 * brief's hard rule against parallel copy that can drift.
 */
export const recoveryDict = defineDict("recovery", {
  retry: ["Retry", "再試多次"],
  reasonLabel: ["Reason", "原因"],
  nextStepLabel: ["Next step", "下一步"],

  // Ollama runtime not responding (GET /api/version, proxied straight to
  // the real Ollama server -- see useOllamaHealthRecovery).
  ollamaDownTitle: ["Ollama isn't responding", "Ollama 冇回應"],
  ollamaDownBody: [
    "The app couldn't reach the local Ollama runtime just now. Make sure Ollama is installed and running, then retry.",
    "個app啱啱連唔到本機嘅 Ollama 服務。睇吓 Ollama 有冇裝好、有冇開緊，再撳「再試多次」。",
  ],

  // No compute device detected yet -- an empty Devices array means "not
  // detected yet", never a claim that the machine has none (see
  // hardware.go's HardwareDevice doc comment). The rendered copy
  // deliberately never spells out the phrase it's disclaiming -- a test
  // asserts this text contains "not detected yet" and never the phrase
  // "no GPU" anywhere, including inside a clarifying negation.
  noGpuTitle: ["Compute device not detected yet", "重未偵測到運算裝置"],
  noGpuBody: [
    "It usually clears up moments after the server starts -- recheck once Ollama has had a moment to report back.",
    "通常伺服器啱啱起身就會有返——等陣再檢查多次啦。",
  ],

  // Docker / container GPU passthrough (app/ui/docker.go).
  dockerUnavailableTitle: ["Docker isn't available", "用唔到 Docker"],
  dockerUnavailableBody: [
    "Docker couldn't be reached on this machine, so container-based GPU passthrough isn't available.",
    "喺呢部機度連唔到 Docker，所以用唔到靠容器嘅顯卡直通功能。",
  ],
  dockerCpuOnlyTitle: ["Containers are running CPU-only", "容器暫時淨係用緊 CPU"],
  dockerCpuOnlyBody: [
    "Docker is present, but the last GPU probe couldn't confirm passthrough, so new containers run CPU-only until it's re-checked.",
    "Docker 係度，但係上次試顯卡直通嗰陣未能確認得到，所以新開嘅容器暫時淨係用緊 CPU，直至重新檢查過。",
  ],
  probeGpu: ["Probe GPU passthrough", "試顯卡直通"],

  // Model catalog completeness (app/ui/catalog.go).
  catalogNeverFetchedTitle: ["Model catalog hasn't been fetched", "重未下載過模型目錄"],
  catalogNeverFetchedBody: [
    "No catalog has been fetched yet, so pull-by-name is the only way to get an exact model right now.",
    "重未下載過模型目錄，而家淨係可以打模型名直接拉。",
  ],
  catalogStaleTitle: ["Model catalog is incomplete", "模型目錄未夠齊全"],
  catalogStaleBody: [
    "The last catalog refresh didn't finish completely -- some models or tags may be missing from it.",
    "上次更新模型目錄冇做完全——目錄入面可能缺咗啲模型或者版本。",
  ],
  refreshCatalog: ["Refresh catalog", "更新目錄"],

  // Pull preflight refusal (models.go's pullEnqueue), most commonly the
  // disk-space floor.
  diskLowTitle: ["Not enough disk space to queue this pull", "磁碟位唔夠嚟排呢個下載"],
  diskLowBody: [
    "There isn't enough free space where models are stored to start this download. Free up space (or point OLLAMA_MODELS at a drive with more room), then retry.",
    "存放模型嘅位置剩返嘅磁碟位唔夠嚟開始呢個下載。清返啲位（或者將 OLLAMA_MODELS 指去一個仲有位嘅磁碟），再試多次。",
  ],
  pullFailedTitle: ["Couldn't queue this pull", "呢個下載排唔到隊"],
  pullFailedBody: [
    "The server refused to queue this pull just now.",
    "伺服器啱啱拒絕咗排呢個下載。",
  ],
} as const)

declare module "@/uh/dict/registry" {
  interface DictRegistry {
    recovery: (typeof recoveryDict)["dict"]
  }
}
