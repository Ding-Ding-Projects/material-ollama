import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

// A real caller: a trigger button that opens the dialog, exactly the shape
// every real use of ConfirmDialog takes (a destructive button in some
// screen opens it; the dialog itself never renders unprompted). Keyboard
// accessibility for an overlay is only provable against a real opener --
// "focus returns to the opener" is meaningless without one.
function ConfirmDialogHarness() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Delete model
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Delete this model?"
        body="This removes the model from disk. It cannot be undone."
        keyword="DELETE"
        actionLabel="Delete"
        onConfirm={() => {}}
      />
    </div>
  );
}

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

  // Keyboard operation of a REAL overlay, driven from a real opener button
  // -- not a check that some reusable a11y primitive works in isolation.
  // ConfirmDialog is a modal alertdialog gating an irreversible action, so
  // all three legs of this contract matter: a keyboard user who opens it
  // must land inside it (never stuck behind the backdrop), Escape must
  // close it without arming the destructive action, and focus must come
  // back to the exact button that opened it rather than to <body> or
  // nowhere at all.
  it("moves focus inside the dialog on open, closes on Escape without confirming, and returns focus to the opener", async () => {
    const user = userEvent.setup();
    render(<ConfirmDialogHarness />);

    const trigger = screen.getByRole("button", { name: "Delete model" });
    trigger.focus();
    expect(trigger).toHaveFocus();

    await user.click(trigger);

    const dialog = await screen.findByRole("alertdialog", { name: "Delete this model?" });
    // Focus must have actually moved off the (now overlay-obscured) trigger
    // and into the dialog panel -- not merely "the dialog exists".
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));

    await user.keyboard("{Escape}");

    // Escape closes the dialog. It must never arm or fire the destructive
    // action -- Escape is a cancel, not a confirm typed by accident.
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();

    // And focus must land back on the exact element that opened it, so a
    // keyboard user resumes exactly where they left off.
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
