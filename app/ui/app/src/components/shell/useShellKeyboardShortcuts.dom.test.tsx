import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  useCloseActiveTabShortcutLabel,
  useShellCloseActiveTabShortcut,
} from "./useShellKeyboardShortcuts";

// "The tab system's one wired-and-real keyboard shortcut: Ctrl+W closes
// the active tab... only ever fires in that exact context" -- this
// dispatches real KeyboardEvents at window and asserts the handler fires
// only for the exact Ctrl+W combination, not a lookalike.
function fireKey(init: Partial<KeyboardEventInit> & { key: string }) {
  window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, ...init }));
}

describe("useShellCloseActiveTabShortcut", () => {
  it("calls the handler for Ctrl+W and prevents the browser's own default", () => {
    const onCloseActiveTab = vi.fn();
    renderHook(() => useShellCloseActiveTabShortcut(onCloseActiveTab));

    fireKey({ key: "w", ctrlKey: true });

    expect(onCloseActiveTab).toHaveBeenCalledTimes(1);
  });

  it("does not fire for Ctrl+Shift+W or for W alone", () => {
    const onCloseActiveTab = vi.fn();
    renderHook(() => useShellCloseActiveTabShortcut(onCloseActiveTab));

    fireKey({ key: "w", ctrlKey: true, shiftKey: true });
    fireKey({ key: "w" });

    expect(onCloseActiveTab).not.toHaveBeenCalled();
  });

  it("stops listening once the component unmounts", () => {
    const onCloseActiveTab = vi.fn();
    const { unmount } = renderHook(() => useShellCloseActiveTabShortcut(onCloseActiveTab));

    unmount();
    fireKey({ key: "w", ctrlKey: true });

    expect(onCloseActiveTab).not.toHaveBeenCalled();
  });
});

describe("useCloseActiveTabShortcutLabel", () => {
  it("shows the non-Mac Ctrl+W label under jsdom's default platform", () => {
    const { result } = renderHook(() => useCloseActiveTabShortcutLabel());
    expect(result.current).toBe("Ctrl+W");
  });
});
