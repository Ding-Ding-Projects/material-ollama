import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SnackbarProvider, useSnackbar } from "./Snackbar";

// "Every notify() call in the design routes through a single bottom-center
// inverse-surface toast. Calls queue rather than stack: only one snackbar
// is ever visible at a time." -- this exercises the queueing and
// auto-dismiss timer for real, rather than just rendering the provider.
function Trigger() {
  const snackbar = useSnackbar();
  return (
    <button
      type="button"
      onClick={() => {
        snackbar.show("First message", 1000);
        snackbar.show("Second message", 1000);
      }}
    >
      Fire two
    </button>
  );
}

function renderProvider() {
  return render(
    <SnackbarProvider>
      <Trigger />
    </SnackbarProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SnackbarProvider", () => {
  it("shows two queued messages one at a time, not stacked together", async () => {
    const { getByRole } = renderProvider();

    await act(async () => {
      getByRole("button", { name: "Fire two" }).click();
    });

    // Only the first message is visible -- the second is queued, not
    // rendered alongside it.
    expect(screen.getByRole("status")).toHaveTextContent("First message");
    expect(screen.queryByText("Second message")).not.toBeInTheDocument();

    // Advance past the first toast's own duration; the queue should now
    // dequeue and show the second message in the same status region.
    await act(async () => {
      vi.advanceTimersByTime(1001);
    });

    expect(screen.getByRole("status")).toHaveTextContent("Second message");
  });

  it("auto-dismisses the last queued message after its duration elapses", async () => {
    const { getByRole } = renderProvider();

    await act(async () => {
      getByRole("button", { name: "Fire two" }).click();
    });
    await act(async () => {
      vi.advanceTimersByTime(1001); // first dismisses, second shows
    });
    await act(async () => {
      vi.advanceTimersByTime(1001); // second dismisses, queue empty
    });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
