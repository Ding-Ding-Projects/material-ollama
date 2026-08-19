import { useEffect, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  cancelModelPull,
  deleteInstalledModel,
  enqueueModelPull,
  getHardware,
  getInstalledModels,
  getPullQueue,
  getRunningModels,
  pauseModelPull,
  resumeModelPull,
  subscribeModelPullEvents,
} from "@/api"
import { useSnackbar } from "@/components/md3"
import { useT } from "@/uh"
import type {
  FitVerdict,
  HardwareResponse,
  InstalledModel,
  PullQueueItem,
  PullQueueItemWithFit,
  PullState,
  RunningModel,
} from "@/screens/models/types"
import "@/screens/models/modelsUi.dict"

/**
 * Live-streams the pull queue over SSE (GET /api/v1/models/pull/events).
 * The first event is always "snapshot" (fit attached to every item whose
 * size is already known); every later "queue" event is bare
 * PullQueueItem[] with NO fit field (see models.go's attachFitVerdicts
 * comment — recomputing it on every 250ms progress tick would mean an
 * extra hardware+ListRunning round trip server-side on every tick). This
 * hook carries a previously-seen fit forward per item id across those
 * fit-less updates; it never computes one itself.
 *
 * Seeded with one REST call to GET /api/v1/models/pull/queue so the queue
 * paints immediately rather than waiting on the SSE round trip, and falls
 * back to that same REST snapshot if the EventSource errors out (e.g. a
 * dev-server proxy hiccup) — reflected in `connected` so the UI can be
 * honest about a degraded (polling-only) state rather than pretending it's
 * live.
 */
function usePullQueueStream() {
  const [streamed, setStreamed] = useState<PullQueueItemWithFit[] | null>(null)
  const [connected, setConnected] = useState(false)
  const fitById = useRef(new Map<string, FitVerdict>())

  const seedQuery = useQuery({
    queryKey: ["models", "pullQueue"],
    queryFn: getPullQueue,
    staleTime: 5_000,
    // Only actually polls while the SSE connection is down — a healthy
    // stream is the sole source of truth once it's delivered a snapshot.
    refetchInterval: connected ? false : 4_000,
  })

  useEffect(() => {
    const unsubscribe = subscribeModelPullEvents({
      onSnapshot: (data: PullQueueItemWithFit[]) => {
        fitById.current = new Map(
          data.filter((item): item is PullQueueItemWithFit & { fit: FitVerdict } => Boolean(item.fit)).map((item) => [item.id, item.fit]),
        )
        setStreamed(data)
        setConnected(true)
      },
      onQueue: (data: PullQueueItem[]) => {
        const merged = data.map((item) => ({ ...item, fit: fitById.current.get(item.id) }))
        setStreamed(merged)
        setConnected(true)
      },
      onError: () => setConnected(false),
    })
    return unsubscribe
  }, [])

  return { items: streamed ?? seedQuery.data ?? [], connected }
}

const REST_ONLY_TRANSITION = new Set<PullState>(["completed", "failed"])

export interface UseModelStore {
  hardware: HardwareResponse | undefined
  hardwareLoading: boolean
  installed: InstalledModel[]
  installedLoading: boolean
  running: RunningModel[]
  queue: PullQueueItemWithFit[]
  queueLive: boolean
  busyPullIds: ReadonlySet<string>
  removingNames: ReadonlySet<string>
  pullingNew: boolean
  pull: (model: string) => void
  pause: (id: string) => void
  resume: (id: string) => void
  cancel: (id: string, deleteData: boolean) => void
  remove: (name: string) => void
}

/**
 * The one data/mutation surface the Models screen is built from. Every
 * value here is either the real server response or a locally-tracked
 * in-flight flag for disabling a button mid-request — nothing is
 * simulated, and no fit verdict is ever computed client-side.
 */
export function useModelStore(): UseModelStore {
  const queryClient = useQueryClient()
  const snackbar = useSnackbar()
  const t = useT("modelsUi")

  const hardwareQuery = useQuery({
    queryKey: ["models", "hardware"],
    queryFn: getHardware,
    staleTime: 20_000,
    refetchInterval: 30_000,
  })

  const installedQuery = useQuery({
    queryKey: ["models", "installed"],
    queryFn: getInstalledModels,
    staleTime: 8_000,
    refetchInterval: 20_000,
  })

  const runningQuery = useQuery({
    queryKey: ["models", "running"],
    queryFn: getRunningModels,
    staleTime: 3_000,
    refetchInterval: 8_000,
  })

  const { items: queue, connected: queueLive } = usePullQueueStream()

  // Notice completed/failed transitions straight off the server's own
  // `state` field (never inferred from progress math), refresh the
  // installed list once a pull actually finishes, and surface a toast.
  // Skips the very first observation of any id so a page load full of
  // already-finished history doesn't fire a wall of toasts.
  const previousStates = useRef(new Map<string, PullState>())
  useEffect(() => {
    let sawTransition = false
    for (const item of queue) {
      const prev = previousStates.current.get(item.id)
      if (prev === item.state) continue
      previousStates.current.set(item.id, item.state)
      if (prev === undefined) continue
      if (!REST_ONLY_TRANSITION.has(item.state)) continue
      sawTransition = true
      if (item.state === "completed") {
        snackbar.show(`${item.model} ${t("pullCompleteToast")}`)
      } else if (item.state === "failed") {
        const detail = item.error ? `: ${item.error}` : ""
        snackbar.show(`${item.model} ${t("pullFailedToast")}${detail}`)
      }
    }
    if (sawTransition) {
      queryClient.invalidateQueries({ queryKey: ["models", "installed"] })
    }
  }, [queue, queryClient, snackbar, t])

  const [busyPullIds, setBusyPullIds] = useState<ReadonlySet<string>>(new Set())
  const [removingNames, setRemovingNames] = useState<ReadonlySet<string>>(new Set())
  const [pullingNew, setPullingNew] = useState(false)

  // Uses the functional setState form throughout (never a captured
  // snapshot of the tracker set) so two concurrent in-flight actions on
  // different ids never clobber each other's busy flag.
  function runBusy(
    id: string,
    setTracker: (updater: (prev: ReadonlySet<string>) => ReadonlySet<string>) => void,
    action: () => Promise<unknown>,
  ) {
    setTracker((prev) => new Set(prev).add(id))
    action()
      .catch((error: unknown) => {
        snackbar.show(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        setTracker((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      })
  }

  function pause(id: string) {
    runBusy(id, setBusyPullIds, () => pauseModelPull(id))
  }

  function resume(id: string) {
    runBusy(id, setBusyPullIds, () => resumeModelPull(id))
  }

  function cancel(id: string, deleteData: boolean) {
    runBusy(id, setBusyPullIds, () => cancelModelPull(id, deleteData))
  }

  function pull(model: string) {
    setPullingNew(true)
    enqueueModelPull(model)
      .then(() => snackbar.show(`${model} ${t("pullQueuedToast")}`))
      .catch((error: unknown) => snackbar.show(error instanceof Error ? error.message : String(error)))
      .finally(() => setPullingNew(false))
  }

  function remove(name: string) {
    runBusy(name, setRemovingNames, () =>
      deleteInstalledModel(name).then(() => {
        queryClient.invalidateQueries({ queryKey: ["models", "installed"] })
        snackbar.show(`${name} ${t("modelRemovedToast")}`)
      }),
    )
  }

  return {
    hardware: hardwareQuery.data,
    hardwareLoading: hardwareQuery.isLoading,
    installed: installedQuery.data ?? [],
    installedLoading: installedQuery.isLoading,
    running: runningQuery.data ?? [],
    queue,
    queueLive,
    busyPullIds,
    removingNames,
    pullingNew,
    pull,
    pause,
    resume,
    cancel,
    remove,
  }
}
