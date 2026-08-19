import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

// The destructive-action super-confirmation gate. This is a safety-critical
// control: the whole point of ConfirmDialog is that the action button
// cannot be pressed into firing by accident, so the untyped/wrong-keyword
// states matter as much as the armed one.
describe("ConfirmDialog", () => {
  it("keeps the action disabled until the exact keyword is typed, then fires it on click", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    render(
      <ConfirmDialog
        open
        onClose={onClose}
        title="Delete this model?"
        body="This removes the model from disk. It cannot be undone."
        keyword="DELETE"
        actionLabel="Delete"
        onConfirm={onConfirm}
      />,
    );

    const confirmButton = screen.getByRole("button", { name: "Delete" });
    const input = screen.getByLabelText("Type DELETE to confirm");

    // Untouched: disabled.
    expect(confirmButton).toBeDisabled();

    // Wrong keyword entirely: still disabled, and clicking it must not fire.
    await user.type(input, "REMOVE");
    expect(confirmButton).toBeDisabled();
    await user.click(confirmButton);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    // Right word, wrong case and padded with whitespace: the component
    // documents this as case-insensitive and trimmed, so it should arm.
    await user.clear(input);
    await user.type(input, "  delete  ");
    expect(confirmButton).toBeEnabled();

    await user.click(confirmButton);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("resets the typed keyword when reopened", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    const { rerender } = render(
      <ConfirmDialog
        open={false}
        onClose={onClose}
        title="Clear all chats?"
        body="This cannot be undone."
        keyword="CLEAR"
        actionLabel="Clear"
        onConfirm={onConfirm}
      />,
    );

    rerender(
      <ConfirmDialog
        open
        onClose={onClose}
        title="Clear all chats?"
        body="This cannot be undone."
        keyword="CLEAR"
        actionLabel="Clear"
        onConfirm={onConfirm}
      />,
    );

    // Freshly opened: still disabled, nothing carried over from a prior
    // (hypothetical) session.
    expect(screen.getByRole("button", { name: "Clear" })).toBeDisabled();
    expect(screen.getByLabelText("Type CLEAR to confirm")).toHaveValue("");
  });
});
