import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UhProvider } from "@/uh";
import type { LaunchIntegration } from "@/api";
import { LaunchIntegrationCard } from "./LaunchIntegrationCard";

// One harness card: a Launch button that is only ever enabled when the
// backend actually detected the binary, with the disabled state naming the
// exact missing piece rather than reading as a broken control (the
// guided-forms "a disabled control always names its unmet condition"
// contract this card's own comment cites).
function integration(overrides: Partial<LaunchIntegration> = {}): LaunchIntegration {
  return {
    id: "claude-code",
    homeView: "launch",
    name: "Claude Code",
    description: "Anthropic's coding tool with subagents",
    command: "ollama launch claude-code",
    installed: true,
    ...overrides,
  };
}

function renderCard(props: Partial<Parameters<typeof LaunchIntegrationCard>[0]> = {}) {
  const onLaunch = vi.fn();
  const onCopy = vi.fn();
  render(
    <UhProvider>
      <LaunchIntegrationCard
        integration={integration()}
        launching={false}
        onLaunch={onLaunch}
        onCopy={onCopy}
        {...props}
      />
    </UhProvider>,
  );
  return { onLaunch, onCopy };
}

describe("LaunchIntegrationCard", () => {
  it("calls onLaunch with the integration when the Launch button is clicked on an installed harness", async () => {
    const user = userEvent.setup();
    const { onLaunch } = renderCard();

    const launchButton = screen.getByRole("button", { name: "Launch" });
    expect(launchButton).toBeEnabled();
    await user.click(launchButton);

    expect(onLaunch).toHaveBeenCalledTimes(1);
    expect(onLaunch).toHaveBeenCalledWith(expect.objectContaining({ id: "claude-code" }));
  });

  it("disables Launch and names the exact install hint for an uninstalled harness", () => {
    renderCard({
      integration: integration({
        installed: false,
        installHint: "Install from https://docs.anthropic.com/claude-code",
      }),
    });

    const launchButton = screen.getByRole("button", { name: "Launch" });
    expect(launchButton).toBeDisabled();
    expect(launchButton).toHaveAttribute(
      "title",
      "Install from https://docs.anthropic.com/claude-code",
    );
    expect(screen.getByText("Install hint:")).toBeInTheDocument();
    expect(
      screen.getByText("Install from https://docs.anthropic.com/claude-code"),
    ).toBeInTheDocument();
    expect(screen.getByText("Not installed")).toBeInTheDocument();
  });
});
