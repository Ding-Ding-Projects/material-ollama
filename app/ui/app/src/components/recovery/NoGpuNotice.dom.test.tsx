import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { UhProvider } from "@/uh"
import type { HardwareResponse } from "@/screens/models/types"
import { NoGpuNotice } from "./NoGpuNotice"

const EMPTY_DEVICES_HARDWARE: HardwareResponse = {
  detectedAt: "2026-08-19T00:00:00Z",
  devices: [],
  storage: { modelsDir: "C:\\models" },
  overrides: {},
  effective: { modelsDir: "C:\\models", contextLength: 4096, contextLengthSource: "assumed-default" },
}

const ONE_DEVICE_HARDWARE: HardwareResponse = {
  ...EMPTY_DEVICES_HARDWARE,
  devices: [
    {
      id: "0",
      name: "Test GPU",
      library: "cuda",
      variant: "v12",
      compute: "8.9",
      driver: "999.99",
    },
  ],
}

function installHardwareFetchMock(responses: HardwareResponse[]) {
  let i = 0
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (!url.includes("/api/v1/hardware")) {
      throw new Error(`Unexpected fetch in test: ${url}`)
    }
    const body = responses[Math.min(i, responses.length - 1)]
    i += 1
    return { ok: true, json: async () => body } as Response
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("NoGpuNotice", () => {
  it('says "not detected yet", never "no GPU", when the devices list is empty', () => {
    render(
      <UhProvider>
        <NoGpuNotice hardware={EMPTY_DEVICES_HARDWARE} />
      </UhProvider>,
    )

    const notice = screen.getByTestId("recovery-notice-no-gpu-yet")
    const rendered = notice.textContent ?? ""

    expect(rendered.toLowerCase()).toContain("not detected yet")
    expect(rendered.toLowerCase()).not.toContain("no gpu")
  })

  it("stays silent before a hardware snapshot has loaded (undefined is not the same as empty)", () => {
    render(
      <UhProvider>
        <NoGpuNotice hardware={undefined} />
      </UhProvider>,
    )

    expect(screen.queryByTestId("recovery-notice-no-gpu-yet")).not.toBeInTheDocument()
  })

  it("stays silent once a device is actually present", () => {
    render(
      <UhProvider>
        <NoGpuNotice hardware={ONE_DEVICE_HARDWARE} />
      </UhProvider>,
    )

    expect(screen.queryByTestId("recovery-notice-no-gpu-yet")).not.toBeInTheDocument()
  })

  it("Retry re-issues a real GET /api/v1/hardware and clears once a device shows up", async () => {
    const user = userEvent.setup()
    const fetchMock = installHardwareFetchMock([ONE_DEVICE_HARDWARE])

    render(
      <UhProvider>
        <NoGpuNotice hardware={EMPTY_DEVICES_HARDWARE} />
      </UhProvider>,
    )

    await screen.findByTestId("recovery-notice-no-gpu-yet")

    await user.click(screen.getByRole("button", { name: "Retry" }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/v1/hardware")

    await waitFor(() => {
      expect(screen.queryByTestId("recovery-notice-no-gpu-yet")).not.toBeInTheDocument()
    })
  })
})
