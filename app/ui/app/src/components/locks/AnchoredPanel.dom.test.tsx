import { useEffect, useRef, useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnchoredPanel } from "./AnchoredPanel";

// The one non-modal anchored overlay primitive every locks/ surface builds
// on (the wizard, the unlock prompt, the ladder). This exercises the real
// "overlays paint their own surface... bounded by the viewport" contract
// from the shared instructions: it never opens off-screen, it closes on
// Escape and on an outside click, and a click inside it never bubbles out
// to the outside-click handler.
function Harness({ open, onClose }: { open: boolean; onClose: () => void }) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  useEffect(() => setAnchorEl(anchorRef.current), []);
  return (
    <div>
      <button ref={anchorRef} type="button">
        Anchor
      </button>
      <AnchoredPanel open={open} onClose={onClose} anchorEl={anchorEl} label="Test panel">
        <p>Panel content</p>
      </AnchoredPanel>
    </div>
  );
}

beforeEach(() => {
  vi.stubGlobal("innerWidth", 400);
  vi.stubGlobal("innerHeight", 300);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AnchoredPanel", () => {
  it("renders nothing at all while closed", () => {
    render(<Harness open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("clamps its position inside the viewport rather than opening off-screen", async () => {
    // The panel itself reports a 360x200 box; the anchor sits far enough
    // right/down that an unclamped position would place the panel's
    // right/bottom edge outside the 400x300 stubbed viewport.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      const base = { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON() {} };
      if (this.getAttribute("role") === "dialog") {
        return { ...base, width: 360, height: 200 } as DOMRect;
      }
      // The anchor button.
      return { ...base, left: 390, top: 290, bottom: 300, right: 400, width: 10, height: 10 } as DOMRect;
    });

    render(<Harness open onClose={vi.fn()} />);

    const panel = await screen.findByRole("dialog");
    await waitFor(() => {
      const left = parseFloat(panel.style.left);
      const top = parseFloat(panel.style.top);
      // margin (8) <= left <= innerWidth - width - margin (400-360-8=32)
      expect(left).toBeGreaterThanOrEqual(8);
      expect(left).toBeLessThanOrEqual(32);
      expect(top).toBeGreaterThanOrEqual(8);
      expect(top).toBeLessThanOrEqual(300 - 200 - 8);
    });
  });

  it("closes on Escape and on an outside click, but not on a click inside the panel", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);

    const panel = await screen.findByRole("dialog");
    await user.click(screen.getByText("Panel content"));
    expect(onClose).not.toHaveBeenCalled();

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);

    // Outside click: the backdrop is the panel's own parent fixed layer.
    const backdrop = panel.parentElement as HTMLElement;
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("marks itself non-modal", async () => {
    render(<Harness open onClose={vi.fn()} />);
    const panel = await screen.findByRole("dialog");
    expect(panel).toHaveAttribute("aria-modal", "false");
    expect(panel).toHaveAttribute("aria-label", "Test panel");
  });
});
