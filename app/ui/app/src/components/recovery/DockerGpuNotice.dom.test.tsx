import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { UhProvider } from "@/uh"
import { DockerGpuNotice } from "./DockerGpuNotice"

const DOCKER_MISSING_STATUS = {
  docker: { present: false, error: "docker executable not found on PATH", checkedAt: "now" },
  lastGpuProbe: null,
}

const CPU_ONLY_STATUS = {
  docker: { present: true, version: "27.0.0", backend: "wsl2", checkedAt: "now" },
  lastGpuProbe: {
    dockerPresent: true,
    backend: "wsl2",
    nvidiaRuntime: "no",
    toolkitDetected: "no",
    probeResult: "no-gpu-in-container",
    verdict: "cpu-only",
    reason: "the NVIDIA container toolkit was not detected",
    nextStep: "Install the NVIDIA Container Toolkit for WSL2, then probe again.",
    checkedAt: "now",
  },
}

const GPU_AVAILABLE_PROBE = {
  dockerPresent: true,
  backend: "wsl2",
  nvidiaRuntime: "yes",
  toolkitDetected: "yes",
  probeResult: "gpu-visible",
  verdict: "gpu-available",
  checkedAt: "now",
}

function installDockerFetchMock(opts: { status: object; probeResult?: object }) {
  const calls: Array<{ url: string; method: string }> = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = (init?.method ?? "GET").toUpperCase()
    calls.push({ url, method })
    if (url.includes("/api/v1/docker/probe-gpu") && method === "POST") {
      return {
        ok: true,
        json: async () => ({ gpu: opts.probeResult ?? GPU_AVAILABLE_PROBE, rocmSupported: false, rocmReason: "n/a" }),
      } as Response
    }
    if (url.includes("/api/v1/docker/status")) {
      return { ok: true, json: async () => opts.status } as Response
    }
    throw new Error(`Unexpected fetch in test: ${method} ${url}`)
  })
  vi.stubGlobal("fetch", fetchMock)
  return { fetchMock, calls }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("DockerGpuNotice", () => {
  it("renders Docker's own error when Docker isn't present at all", async () => {
    installDockerFetchMock({ status: DOCKER_MISSING_STATUS })

    render(
      <UhProvider>
        <DockerGpuNotice />
      </UhProvider>,
    )

    const notice = await screen.findByTestId("recovery-notice-docker-gpu")
    expect(notice).toHaveTextContent("docker executable not found on PATH")
  })

  it("renders the real probe's Reason and NextStep verbatim, and Probe GPU actually runs a real POST", async () => {
    const user = userEvent.setup()
    const { calls } = installDockerFetchMock({ status: CPU_ONLY_STATUS })

    render(
      <UhProvider>
        <DockerGpuNotice />
      </UhProvider>,
    )

    const notice = await screen.findByTestId("recovery-notice-docker-gpu")
    expect(notice).toHaveTextContent("the NVIDIA container toolkit was not detected")
    expect(notice).toHaveTextContent("Install the NVIDIA Container Toolkit for WSL2, then probe again.")

    await user.click(screen.getByRole("button", { name: "Probe GPU passthrough" }))

    await waitFor(() => {
      expect(calls.some((c) => c.url.includes("/probe-gpu") && c.method === "POST")).toBe(true)
    })

    // The real probe in this test reports gpu-available, which the
    // notice folds straight into its own state and clears on.
    await waitFor(() => {
      expect(screen.queryByTestId("recovery-notice-docker-gpu")).not.toBeInTheDocument()
    })
  })

  it("stays silent once Docker is present and the last probe already confirmed GPU passthrough", async () => {
    installDockerFetchMock({
      status: { docker: { present: true, version: "27.0.0", checkedAt: "now" }, lastGpuProbe: GPU_AVAILABLE_PROBE },
    })

    render(
      <UhProvider>
        <DockerGpuNotice />
      </UhProvider>,
    )

    await waitFor(() => {
      expect(screen.queryByTestId("recovery-notice-docker-gpu")).not.toBeInTheDocument()
    })
  })
})
