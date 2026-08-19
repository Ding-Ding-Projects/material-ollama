import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UhProvider } from "@/uh";
import { NotificationCenter } from "./NotificationCenter";
import type { ShellEvent } from "./useShellEvents";

// "The bell's popover: real events, a real (if small) 'Clear all' bulk
// action, and an honest empty state when there is genuinely nothing yet."
// This exercises exactly those three claims through the real HeadlessUI
// Popover trigger, not a pre-opened/forced-visible panel.
const EVENTS: ShellEvent[] = [
  { id: "evt-2", icon: "push_pin", text: "Pinned the Models tab", time: Date.now() },
  { id: "evt-1", icon: "close", text: "Closed the Chat tab", time: Date.now() - 60_000 },
];

function renderCenter(props: Partial<Parameters<typeof NotificationCenter>[0]> = {}) {
  const onClearAll = vi.fn();
  render(
    <UhProvider>
      <NotificationCenter events={[]} hasUnread={false} onClearAll={onClearAll} {...props} />
    </UhProvider>,
  );
  return { onClearAll };
}

describe("NotificationCenter", () => {
  it("shows the honest empty state when there are genuinely no events yet", async () => {
    const user = userEvent.setup();
    renderCenter();

    await user.click(screen.getByRole("button", { name: "Notifications" }));

    expect(await screen.findByText("Nothing here yet. Quiet llama.")).toBeInTheDocument();
  });

  it("lists real recorded events and calls onClearAll from the real button", async () => {
    const user = userEvent.setup();
    const { onClearAll } = renderCenter({ events: EVENTS, hasUnread: true });

    await user.click(screen.getByRole("button", { name: "Notifications" }));

    expect(await screen.findByText("Pinned the Models tab")).toBeInTheDocument();
    expect(screen.getByText("Closed the Chat tab")).toBeInTheDocument();
    expect(screen.queryByText("Nothing here yet. Quiet llama.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear all" }));
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });
});
