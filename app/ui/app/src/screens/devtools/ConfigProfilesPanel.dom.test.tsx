import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SnackbarProvider } from "@/components/md3";
import { UhProvider } from "@/uh";
import type { ConfigurationOption } from "@/lib/cli-config";
import { ConfigProfilesPanel } from "./ConfigProfilesPanel";

// The configuration-profile manager: create/update/apply/delete all go
// through the real GET/POST/PUT/DELETE /api/v1/config/profiles endpoints
// via @tanstack/react-query mutations. This mocks fetch itself (the real
// api.ts functions, the real mutation, the real onSuccess snackbar) rather
// than mocking @/api, so a broken request shape or URL would fail here.
const CONFIGURATION: ConfigurationOption[] = [
  { name: "OLLAMA_HOST", type: "string", effectiveValue: "127.0.0.1:11434", source: "default", editable: true, restartRequired: true },
];

function installFetchMock() {
  const calls: { method: string; url: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, url, body });
      if (url.includes("/api/v1/config/profiles") && method === "POST") {
        return {
          ok: true,
          json: async () => ({
            id: "profile-1",
            name: body.name,
            description: body.description,
            values: body.values,
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
          }),
        } as Response;
      }
      throw new Error(`Unexpected fetch in test: ${method} ${url}`);
    }),
  );
  return calls;
}

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <UhProvider>
        <SnackbarProvider>
          <ConfigProfilesPanel configuration={CONFIGURATION} profiles={[]} />
        </SnackbarProvider>
      </UhProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ConfigProfilesPanel", () => {
  it("posts a real create-profile request with the typed name and shows the saved status", async () => {
    const user = userEvent.setup();
    const calls = installFetchMock();
    renderPanel();

    const nameField = screen.getByLabelText("Name");
    await user.type(nameField, "Local GPU profile");

    const createButton = screen.getByRole("button", { name: "Create profile" });
    expect(createButton).toBeEnabled();
    await user.click(createButton);

    await screen.findByText("Profile saved.");

    const postCall = calls.find((c) => c.method === "POST");
    expect(postCall).toBeDefined();
    expect(postCall?.url).toContain("/api/v1/config/profiles");
    expect((postCall?.body as { name: string }).name).toBe("Local GPU profile");
  });

  it("keeps the create button disabled until a name is entered", () => {
    installFetchMock();
    renderPanel();

    const createButton = screen.getByRole("button", { name: "Create profile" });
    expect(createButton).toBeDisabled();
  });

  it("filters the configuration override list by the search field", async () => {
    const user = userEvent.setup();
    installFetchMock();
    renderPanel();

    expect(screen.getByText("OLLAMA_HOST")).toBeInTheDocument();

    const search = screen.getByLabelText("Search configuration");
    await user.type(search, "xyzzy-nonexistent");

    expect(screen.getByText("No configuration options match.")).toBeInTheDocument();
    expect(screen.queryByText("OLLAMA_HOST")).not.toBeInTheDocument();
  });
});
