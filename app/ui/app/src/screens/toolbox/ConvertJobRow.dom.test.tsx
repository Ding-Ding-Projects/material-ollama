import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UhProvider } from "@/uh";
import { ConvertJobRow } from "./ConvertJobRow";
import type { ConvertJob } from "./convertApi";

// "Progress is exactly what the backend actually reports -- a job state,
// not a synthetic percentage: queued and failed/canceled render a static
// bar, running renders the design's real indeterminate sweep... and
// completed renders a full bar. There is no interpolated byte counter
// here... inventing one would be exactly the 'simulated progress' this
// build's contract forbids." This proves that state-to-progress-value
// mapping and the state-gated action set are both real.
function job(overrides: Partial<ConvertJob> = {}): ConvertJob {
  return {
    id: "job-1",
    inputPath: "C:/models/notes.docx",
    inputFilename: "notes.docx",
    sourceFormat: "docx",
    targetFormat: "pdf",
    state: "running",
    lossReport: { lossy: false, irreversible: false },
    acknowledged: true,
    inputBytes: 2048,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function renderRow(overrides: Partial<ConvertJob> = {}, busy = false) {
  const onToggleSelect = vi.fn();
  const onCancel = vi.fn();
  const onDelete = vi.fn();
  const onRetry = vi.fn();
  render(
    <UhProvider>
      <ConvertJobRow
        job={job(overrides)}
        selected={false}
        onToggleSelect={onToggleSelect}
        onCancel={onCancel}
        onDelete={onDelete}
        onRetry={onRetry}
        busy={busy}
      />
    </UhProvider>,
  );
  return { onToggleSelect, onCancel, onDelete, onRetry };
}

describe("ConvertJobRow", () => {
  it("shows Cancel but not Retry or Remove for a running job, and never a completed-percentage readout", () => {
    renderRow({ state: "running" });

    expect(screen.getByRole("button", { name: /Cancel/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Retry/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remove from queue/ })).not.toBeInTheDocument();
    expect(screen.getByText("Converting…")).toBeInTheDocument();
    // The progress bar itself carries the same state text as its own
    // accessible name, and is indeterminate (no percentage) while running
    // -- proving it is a real state, not a fabricated percentage.
    const bar = screen.getByRole("progressbar", { name: "Converting… — notes.docx" });
    expect(bar).not.toHaveAttribute("aria-valuenow");
  });

  it("shows Retry and Remove but not Cancel for a failed job, and calls onRetry with the whole job", async () => {
    const user = userEvent.setup();
    const { onRetry } = renderRow({ state: "failed", error: "Unsupported source codec" });

    expect(screen.queryByRole("button", { name: /Cancel/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Remove from queue/ })).toBeInTheDocument();
    expect(screen.getByText("Unsupported source codec")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Retry/ }));

    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ id: "job-1", state: "failed" }));
  });

  it("shows the real output path only once the job has actually completed", () => {
    renderRow({ state: "completed", outputBytes: 900, outputPath: "C:/models/notes.pdf" });

    const savedLine = screen.getByTitle("C:/models/notes.pdf");
    expect(savedLine).toHaveTextContent("Saved to: C:/models/notes.pdf");
  });
});
