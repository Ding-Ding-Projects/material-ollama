import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UhProvider } from "@/uh";
import { PullQueueCard } from "./PullQueueCard";
import type { PullQueueItemWithFit } from "./types";

// "Every item whose state isn't 'completed'... drops out of this card
// rather than lingering as a 100% bar forever" -- and, per this
// inventory's evidence discipline, the card genuinely returns null when
// only completed items remain (the exact reason `models.png` was refused
// as capture evidence for this row: it was captured with an empty queue).
// This exercises the real state-driven pause/resume/cancel affordances,
// not just presence of the card.
function item(overrides: Partial<PullQueueItemWithFit> = {}): PullQueueItemWithFit {
  return {
    id: "pull-1",
    model: "llama3:8b",
    state: "downloading",
    totalBytes: 1000,
    completedBytes: 250,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function renderCard(items: PullQueueItemWithFit[]) {
  const onPause = vi.fn();
  const onResume = vi.fn();
  const onCancel = vi.fn();
  const { container } = render(
    <UhProvider>
      <PullQueueCard items={items} busyIds={new Set()} onPause={onPause} onResume={onResume} onCancel={onCancel} />
    </UhProvider>,
  );
  return { container, onPause, onResume, onCancel };
}

describe("PullQueueCard", () => {
  it("renders nothing at all once every item has completed", () => {
    const { container } = renderCard([item({ state: "completed" })]);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows Pause (not Resume) for a downloading item and calls onPause with its id", async () => {
    const user = userEvent.setup();
    const { onPause } = renderCard([item({ state: "downloading" })]);

    expect(screen.queryByRole("button", { name: /Resume/ })).not.toBeInTheDocument();
    const pauseButton = screen.getByRole("button", { name: /Pause/ });
    await user.click(pauseButton);

    expect(onPause).toHaveBeenCalledWith("pull-1");
  });

  it("shows Resume (not Pause) for a paused item and calls onResume with its id", async () => {
    const user = userEvent.setup();
    const { onResume } = renderCard([item({ state: "paused" })]);

    expect(screen.queryByRole("button", { name: /Pause/ })).not.toBeInTheDocument();
    const resumeButton = screen.getByRole("button", { name: /Resume/ });
    await user.click(resumeButton);

    expect(onResume).toHaveBeenCalledWith("pull-1");
  });

  it("calls onCancel with deleteData=true only from the delete-data menu entry, not the keep-data one", async () => {
    const user = userEvent.setup();
    const { onCancel } = renderCard([item({ state: "failed" })]);

    await user.click(screen.getByRole("button", { name: /Cancel/ }));
    await user.click(await screen.findByText("Cancel — keep partial data"));

    expect(onCancel).toHaveBeenCalledWith("pull-1", false);
    expect(onCancel).not.toHaveBeenCalledWith("pull-1", true);
  });
});
