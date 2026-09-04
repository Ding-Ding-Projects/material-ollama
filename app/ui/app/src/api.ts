import {
  ChatResponse,
  ChatsResponse,
  ChatEvent,
  DownloadEvent,
  ErrorEvent,
  InferenceComputeResponse,
  ModelCapabilitiesResponse,
  Model,
  ChatRequest,
  Settings,
  User,
  Message,
} from "@/gotypes";
import { parseJsonlFromResponse } from "./util/jsonl-parsing";
import { ollamaClient as ollama } from "./lib/ollama-client";
import type { ModelResponse } from "ollama/browser";
import { API_BASE, OLLAMA_DOT_COM } from "./lib/config";
import type {
  CapabilityRegistry,
  ConfigProfile,
  ConfigProfileApplyResponse,
  ConfigProfileRequest,
  ConfigProfilesResponse,
} from "./lib/cli-config";
import type {
  HardwareResponse,
  InstalledModel,
  PullQueueItem,
  PullQueueItemWithFit,
  RunningModel,
} from "./screens/models/types";

// Extend Model class with utility methods
declare module "@/gotypes" {
  interface Model {
    isCloud(): boolean;
  }
}

Model.prototype.isCloud = function (): boolean {
  return this.model.endsWith("cloud");
};

export type CloudStatusSource = "env" | "config" | "both" | "none";
export interface CloudStatusResponse {
  disabled: boolean;
  source: CloudStatusSource;
}
export interface SettingsResponse {
  settings: Settings;
  hasCompletedFirstRun: boolean;
}
// Helper function to convert Uint8Array to base64
function uint8ArrayToBase64(uint8Array: Uint8Array): string {
  const chunkSize = 0x8000; // 32KB chunks to avoid stack overflow
  let binary = "";

  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

export async function fetchUser(): Promise<User | null> {
  const response = await fetch(`${API_BASE}/api/me`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (response.ok) {
    const userData: User = await response.json();

    if (userData.avatarurl && !userData.avatarurl.startsWith("http")) {
      userData.avatarurl = `${OLLAMA_DOT_COM}${userData.avatarurl}`;
    }

    return userData;
  }

  if (response.status === 401 || response.status === 403) {
    return null;
  }

  throw new Error(`Failed to fetch user: ${response.status}`);
}

export async function fetchConnectUrl(): Promise<string> {
  const response = await fetch(`${API_BASE}/api/me`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (response.status === 401) {
    const data = await response.json();
    if (data.signin_url) {
      return data.signin_url;
    }
  }

  throw new Error("Failed to fetch connect URL");
}

export async function disconnectUser(): Promise<void> {
  const response = await fetch(`${API_BASE}/api/signout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Failed to disconnect user");
  }
}

export async function getChats(): Promise<ChatsResponse> {
  const response = await fetch(`${API_BASE}/api/v1/chats`);
  const data = await response.json();
  return new ChatsResponse(data);
}

export async function getChat(chatId: string): Promise<ChatResponse> {
  const response = await fetch(`${API_BASE}/api/v1/chat/${chatId}`);
  const data = await response.json();
  return new ChatResponse(data);
}

export async function getModels(query?: string): Promise<Model[]> {
  try {
    const { models: modelsResponse } = await ollama.list();

    let models: Model[] = modelsResponse
      .filter((m: ModelResponse) => {
        const families = m.details?.families;

        if (!families || families.length === 0) {
          return true;
        }

        const isBertOnly = families.every((family: string) =>
          family.toLowerCase().includes("bert"),
        );

        return !isBertOnly;
      })
      .map((m: ModelResponse) => {
        // Remove the latest tag from the returned model
        const modelName = m.name.replace(/:latest$/, "");

        return new Model({
          model: modelName,
          digest: m.digest,
          modified_at: m.modified_at ? new Date(m.modified_at) : undefined,
        });
      });

    // Filter by query if provided
    if (query) {
      const normalizedQuery = query.toLowerCase().trim();

      const filteredModels = models.filter((m: Model) => {
        return m.model.toLowerCase().startsWith(normalizedQuery);
      });

      let exactMatch = false;
      for (const m of filteredModels) {
        if (m.model.toLowerCase() === normalizedQuery) {
          exactMatch = true;
          break;
        }
      }

      // Add query if it's in the registry and not already in the list
      if (!exactMatch) {
        const result = await getModelUpstreamInfo(new Model({ model: query }));
        const existsUpstream = result.exists;
        if (existsUpstream) {
          filteredModels.push(new Model({ model: query }));
        }
      }

      models = filteredModels;
    }

    return models;
  } catch (err) {
    throw new Error(`Failed to fetch models: ${err}`);
  }
}

export async function getModelCapabilities(
  modelName: string,
): Promise<ModelCapabilitiesResponse> {
  try {
    const showResponse = await ollama.show({ model: modelName });

    return new ModelCapabilitiesResponse({
      capabilities: Array.isArray(showResponse.capabilities)
        ? showResponse.capabilities
        : [],
    });
  } catch (error) {
    // Model might not be downloaded yet, return empty capabilities
    console.error(`Failed to get capabilities for ${modelName}:`, error);
    return new ModelCapabilitiesResponse({ capabilities: [] });
  }
}

export type ChatEventUnion = ChatEvent | DownloadEvent | ErrorEvent;

export async function* sendMessage(
  chatId: string,
  message: string,
  model: Model,
  attachments?: Array<{ filename: string; data: Uint8Array }>,
  signal?: AbortSignal,
  index?: number,
  webSearch?: boolean,
  fileTools?: boolean,
  forceUpdate?: boolean,
  think?: boolean | string,
): AsyncGenerator<ChatEventUnion> {
  // Convert Uint8Array to base64 for JSON serialization
  const serializedAttachments = attachments?.map((att) => ({
    filename: att.filename,
    data: uint8ArrayToBase64(att.data),
  }));

  // Send think parameter when it's explicitly set (true, false, or a non-empty string).
  const shouldSendThink =
    think !== undefined &&
    (typeof think === "boolean" || (typeof think === "string" && think !== ""));

  const response = await fetch(`${API_BASE}/api/v1/chat/${chatId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      new ChatRequest({
        model: model.model,
        prompt: message,
        ...(index !== undefined ? { index } : {}),
        ...(serializedAttachments !== undefined
          ? { attachments: serializedAttachments }
          : {}),
        // Always send web_search as a boolean value (default to false)
        web_search: webSearch ?? false,
        file_tools: fileTools ?? false,
        ...(forceUpdate !== undefined ? { forceUpdate } : {}),
        ...(shouldSendThink ? { think } : {}),
      }),
    ),
    signal,
  });

  for await (const event of parseJsonlFromResponse<ChatEventUnion>(response)) {
    switch (event.eventName) {
      case "download":
        yield new DownloadEvent(event);
        break;
      case "error":
        yield new ErrorEvent(event);
        break;
      default:
        yield new ChatEvent(event);
        break;
    }
  }
}

export async function getSettings(): Promise<SettingsResponse> {
  const response = await fetch(`${API_BASE}/api/v1/settings`);
  if (!response.ok) {
    throw new Error("Failed to fetch settings");
  }
  const data = await response.json();
  return {
    settings: new Settings(data.settings),
    hasCompletedFirstRun: Boolean(data.hasCompletedFirstRun),
  };
}

export async function updateSettings(
  settings: Settings,
): Promise<SettingsResponse> {
  const response = await fetch(`${API_BASE}/api/v1/settings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(settings),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || "Failed to update settings");
  }
  const data = await response.json();
  return {
    settings: new Settings(data.settings),
    hasCompletedFirstRun: Boolean(data.hasCompletedFirstRun),
  };
}

export async function skipFirstRun(): Promise<void> {
  const response = await fetch(`${API_BASE}/api/v1/first-run/skip`, {
    method: "POST",
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || "Failed to skip first run");
  }
}

export async function runOllamaInTerminal(): Promise<void> {
  const response = await fetch(`${API_BASE}/api/v1/first-run/terminal`, {
    method: "POST",
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || "Failed to open terminal");
  }
}

export async function updateCloudSetting(
  enabled: boolean,
): Promise<CloudStatusResponse> {
  const response = await fetch(`${API_BASE}/api/v1/cloud`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ enabled }),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || "Failed to update cloud setting");
  }

  const data = await response.json();
  return {
    disabled: Boolean(data.disabled),
    source: (data.source as CloudStatusSource) || "none",
  };
}

export async function renameChat(chatId: string, title: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/v1/chat/${chatId}/rename`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title: title.trim() }),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || "Failed to rename chat");
  }
}

export async function deleteChat(chatId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/v1/chat/${chatId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || "Failed to delete chat");
  }
}

export async function updateChatMessage(
  chatId: string,
  index: number,
  content: string,
): Promise<{
  index: number;
  chatId: string;
  message: Message;
}> {
  const response = await fetch(
    `${API_BASE}/api/v1/chat/${chatId}/messages/${index}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content }),
    },
  );

  if (!response.ok) {
    const errorMessage = await response.text();
    throw new Error(errorMessage || "Failed to update message");
  }

  const data = await response.json();

  return {
    index: data.index,
    chatId: data.chatId,
    message: new Message(data.message),
  };
}

// Get upstream information for model staleness checking
export async function getModelUpstreamInfo(
  model: Model,
): Promise<{ stale: boolean; exists: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_BASE}/api/v1/model/upstream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model.model,
      }),
    });

    if (!response.ok) {
      console.warn(
        `Failed to check upstream for ${model.model}: ${response.status}`,
      );
      return { stale: false, exists: false };
    }

    const data = await response.json();

    if (data.error) {
      console.warn(`Upstream check: ${data.error}`);
      return { stale: false, exists: false, error: data.error };
    }

    return { stale: !!data.stale, exists: true };
  } catch (error) {
    console.warn(`Error checking model staleness:`, error);
    return { stale: false, exists: false };
  }
}

// NOTE: model pull/delete/queue management now lives behind the real
// server-owned routes registered in app/ui/models.go (POST
// /api/v1/models/pull enqueues a durable, resumable download; progress is
// read from the SSE stream at GET /api/v1/models/pull/events). The
// generator that used to live here POSTed to this same path expecting a
// streaming NDJSON response body, but no such route existed — the request
// fell through to the SPA catch-all and "parsed" index.html as if it were
// progress data. It had no callers. Removed rather than left as a trap for
// whichever UI lane wires up the model store next.

export interface ModelRecommendation {
  model: string;
  description: string;
  context_length?: number;
  max_output_tokens?: number;
  vram_bytes?: number;
}

export interface ModelRecommendationsResponse {
  recommendations: ModelRecommendation[];
}

export async function getModelRecommendations(): Promise<
  ModelRecommendation[]
> {
  const response = await fetch(
    `${API_BASE}/api/experimental/model-recommendations`,
  );
  if (!response.ok) {
    throw new Error(
      `Failed to fetch model recommendations: ${response.statusText}`,
    );
  }
  const data: ModelRecommendationsResponse = await response.json();
  return data.recommendations || [];
}

export async function getInferenceCompute(): Promise<InferenceComputeResponse> {
  const response = await fetch(`${API_BASE}/api/v1/inference-compute`);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch inference compute: ${response.statusText}`,
    );
  }

  const data = await response.json();
  return new InferenceComputeResponse(data);
}

export async function fetchHealth(): Promise<boolean> {
  try {
    // Use the /api/version endpoint as a health check
    const response = await fetch(`${API_BASE}/api/version`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      const data = await response.json();
      // If we get a version back, the server is healthy
      return !!data.version;
    }

    return false;
  } catch (error) {
    console.error("Error checking health:", error);
    return false;
  }
}

export async function getCloudStatus(): Promise<CloudStatusResponse | null> {
  const response = await fetch(`${API_BASE}/api/v1/cloud`);
  if (!response.ok) {
    throw new Error(`Failed to fetch cloud status: ${response.status}`);
  }

  const data = await response.json();
  return {
    disabled: Boolean(data.disabled),
    source: (data.source as CloudStatusSource) || "none",
  };
}

export async function getCapabilityRegistry(): Promise<CapabilityRegistry> {
  const response = await fetch(`${API_BASE}/api/v1/capabilities`);
  if (!response.ok) {
    throw new Error(`Failed to fetch CLI capabilities: ${response.statusText}`);
  }
  return (await response.json()) as CapabilityRegistry;
}

export async function getConfigProfiles(): Promise<ConfigProfilesResponse> {
  const response = await fetch(`${API_BASE}/api/v1/config/profiles`);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch configuration profiles: ${response.statusText}`,
    );
  }
  return (await response.json()) as ConfigProfilesResponse;
}

export async function createConfigProfile(
  request: ConfigProfileRequest,
): Promise<ConfigProfile> {
  const response = await fetch(`${API_BASE}/api/v1/config/profiles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as ConfigProfile;
}

export async function updateConfigProfile(
  id: string,
  request: ConfigProfileRequest,
): Promise<ConfigProfile> {
  const response = await fetch(`${API_BASE}/api/v1/config/profiles/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as ConfigProfile;
}

export async function applyConfigProfile(
  id: string,
): Promise<ConfigProfileApplyResponse> {
  const response = await fetch(
    `${API_BASE}/api/v1/config/profiles/${id}/apply`,
    {
      method: "POST",
    },
  );
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as ConfigProfileApplyResponse;
}

export async function deleteConfigProfile(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/v1/config/profiles/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
}

export interface CodexEnvVar {
  name: string;
  value?: string;
  secret?: boolean;
  configured?: boolean;
}

export interface CodexProfile {
  id?: string;
  name: string;
  executable: string;
  arguments: string[];
  environment: CodexEnvVar[];
  workingDirectory: string;
  timeoutSeconds: number;
  updatedAt?: string;
}

export interface CodexCommand {
  name: string;
  aliases?: string[];
  description?: string;
  flags?: string[];
}

export interface CodexFlag {
  name: string;
  value?: string;
  description?: string;
}

export interface CodexDiscovery {
  available: boolean;
  executable?: string;
  version?: string;
  commands?: CodexCommand[];
  flags?: CodexFlag[];
  checkedAt: string;
  error?: string;
}

export interface CodexPreflight {
  profile: CodexProfile;
  executable: string;
  arguments: string[];
  commandPreview: string;
  environment: CodexEnvVar[];
  workingDirectory: string;
  timeoutSeconds: number;
  warnings?: string[];
}

export interface CodexSession {
  id: string;
  profileId?: string;
  profileName?: string;
  commandPreview: string;
  workingDirectory: string;
  state: string;
  rollbackState: string;
  startedAt: string;
  endedAt?: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  error?: string;
}

async function codexJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Codex request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export function getCodexDiscovery(refresh = false): Promise<CodexDiscovery> {
  return codexJson<CodexDiscovery>(
    `/api/v1/codex/discovery${refresh ? "?refresh=1" : ""}`,
  );
}

export async function getCodexProfiles(): Promise<CodexProfile[]> {
  const data = await codexJson<{ profiles: CodexProfile[] }>(
    "/api/v1/codex/profiles",
  );
  return data.profiles || [];
}

export async function saveCodexProfile(
  profile: CodexProfile,
): Promise<CodexProfile> {
  return codexJson<CodexProfile>("/api/v1/codex/profiles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  });
}

export async function deleteCodexProfile(id: string): Promise<void> {
  await codexJson<unknown>(
    `/api/v1/codex/profiles?id=${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

export async function preflightCodex(
  profile: CodexProfile,
  prompt: string,
): Promise<CodexPreflight> {
  return codexJson<CodexPreflight>("/api/v1/codex/preflight", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile, prompt }),
  });
}

export async function startCodexSession(
  profile: CodexProfile,
  prompt: string,
  rollbackOnFailure: boolean,
): Promise<{ session: CodexSession; preflight: CodexPreflight }> {
  return codexJson<{ session: CodexSession; preflight: CodexPreflight }>(
    "/api/v1/codex/sessions",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile, prompt, rollbackOnFailure }),
    },
  );
}

export async function getCodexSessions(): Promise<CodexSession[]> {
  const data = await codexJson<{ sessions: CodexSession[] }>(
    "/api/v1/codex/sessions",
  );
  return data.sessions || [];
}

export async function cancelCodexSession(id: string): Promise<void> {
  await codexJson<unknown>(`/api/v1/codex/sessions/${id}/cancel`, {
    method: "POST",
  });
}

export async function rollbackCodexSession(
  id: string,
): Promise<CodexSession> {
  return codexJson<CodexSession>(`/api/v1/codex/sessions/${id}/rollback`, {
    method: "POST",
  });
}

export async function openCodexEditor(editor: string, path: string): Promise<{
  editor: string;
  path: string;
}> {
  return codexJson<{ editor: string; path: string }>("/api/v1/codex/editor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ editor, path }),
  });
}

export function subscribeCodexSession(
  id: string,
  handlers: {
    onState?: (data: { state: string; exitCode?: number; error?: string; rollbackState?: string }) => void;
    onOutput?: (stream: "stdout" | "stderr", line: string) => void;
    onDone?: (session: CodexSession) => void;
    onError?: (error: Event) => void;
  },
): () => void {
  const source = new EventSource(
    `${API_BASE}/api/v1/codex/sessions/${encodeURIComponent(id)}/events`,
  );
  source.addEventListener("state", (event) => {
    const data = JSON.parse((event as MessageEvent).data) as {
      state: string;
      exitCode?: number;
      error?: string;
      rollbackState?: string;
    };
    handlers.onState?.(data);
  });
  for (const stream of ["stdout", "stderr"] as const) {
    source.addEventListener(stream, (event) => {
      const data = JSON.parse((event as MessageEvent).data) as { line: string };
      handlers.onOutput?.(stream, data.line);
    });
  }
  source.addEventListener("done", (event) => {
    const data = JSON.parse((event as MessageEvent).data) as CodexSession;
    handlers.onDone?.(data);
    source.close();
  });
  source.onerror = (error) => handlers.onError?.(error);
  return () => source.close();
}

// --- Model store: hardware, installed/running models, pull queue --------
//
// These wrap the real, already-registered server routes in
// app/ui/hardware.go and app/ui/models.go. Every shape below is a
// transcription of that server's JSON (see src/screens/models/types.ts) —
// this file adds no client-side fit computation, no invented catalog, and
// no synthetic progress.

async function modelsJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = await response.clone().json();
      if (body && typeof body.error === "string" && body.error) {
        message = body.error;
      }
    } catch {
      const text = await response.text().catch(() => "");
      if (text) message = text;
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

// Launch screen -- app/ui/launch.go's reconciled intersection of
// cmd/launch's integration registry and app/store/database.go's
// validLaunchView allow-list. See that file's header comment for why the
// two disagree and which one wins; this client only ever sees the
// already-reconciled result.
export interface LaunchIntegration {
  id: string;
  homeView: string;
  name: string;
  description: string;
  command: string;
  installed: boolean;
  missingBinary?: string;
  installHint?: string;
}

export interface LaunchRunResult {
  integration: string;
  homeView: string;
  command: string;
  launched: boolean;
}

async function launchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Launch request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export function getHardware(): Promise<HardwareResponse> {
  return modelsJson<HardwareResponse>("/api/v1/hardware");
}

export async function getInstalledModels(): Promise<InstalledModel[]> {
  const data = await modelsJson<{ models: InstalledModel[] }>(
    "/api/v1/models/installed",
  );
  return data.models || [];
}

export async function getRunningModels(): Promise<RunningModel[]> {
  const data = await modelsJson<{ models: RunningModel[] }>(
    "/api/v1/models/running",
  );
  return data.models || [];
}

export function enqueueModelPull(model: string): Promise<PullQueueItem> {
  return modelsJson<PullQueueItem>("/api/v1/models/pull", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model }),
  });
}

export async function getPullQueue(): Promise<PullQueueItemWithFit[]> {
  const data = await modelsJson<{ items: PullQueueItemWithFit[] }>(
    "/api/v1/models/pull/queue",
  );
  return data.items || [];
}

export function pauseModelPull(id: string): Promise<{ state: string }> {
  return modelsJson<{ state: string }>(
    `/api/v1/models/pull/${encodeURIComponent(id)}/pause`,
    { method: "POST" },
  );
}

export function resumeModelPull(id: string): Promise<{ state: string }> {
  return modelsJson<{ state: string }>(
    `/api/v1/models/pull/${encodeURIComponent(id)}/resume`,
    { method: "POST" },
  );
}

/** `deleteData: true` actually deletes the on-disk "-partial-*" blobs;
 * `false` (the default the UI should offer first) keeps them so a future
 * pull of the same model resumes from where this one stopped — see the
 * brief's exact required copy for this choice. */
export function cancelModelPull(
  id: string,
  deleteData: boolean,
): Promise<{ state: string }> {
  return modelsJson<{ state: string }>(
    `/api/v1/models/pull/${encodeURIComponent(id)}/cancel`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deleteData }),
    },
  );
}

/** The confirmation keyword is fixed server-side (models.go re-checks it
 * regardless of what the UI sends), so it is hardcoded here rather than
 * threaded through as a parameter — the UI's job is to make the user type
 * it via ConfirmDialog before this is ever called, not to choose it. */
export function deleteInstalledModel(name: string): Promise<{ deleted: string }> {
  return modelsJson<{ deleted: string }>("/api/v1/models/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, confirm: "REMOVE" }),
  });
}

/** SSE subscription for the pull queue. The first event is always
 * "snapshot" (PullQueueItemWithFit[], fit attached); every subsequent
 * "queue" event is bare PullQueueItem[] with no fit (see models.go's
 * attachFitVerdicts comment) — callers must carry a previously-seen fit
 * forward themselves rather than treating its absence as "no verdict". */
export function subscribeModelPullEvents(handlers: {
  onSnapshot: (items: PullQueueItemWithFit[]) => void;
  onQueue: (items: PullQueueItem[]) => void;
  onError?: (error: Event) => void;
}): () => void {
  const source = new EventSource(`${API_BASE}/api/v1/models/pull/events`);
  source.addEventListener("snapshot", (event) => {
    const data = JSON.parse((event as MessageEvent).data) as PullQueueItemWithFit[];
    handlers.onSnapshot(data || []);
  });
  source.addEventListener("queue", (event) => {
    const data = JSON.parse((event as MessageEvent).data) as PullQueueItem[];
    handlers.onQueue(data || []);
  });
  source.onerror = (error) => handlers.onError?.(error);
  return () => source.close();
}
export async function getLaunchIntegrations(): Promise<LaunchIntegration[]> {
  const data = await launchJson<{ integrations: LaunchIntegration[] }>(
    "/api/v1/launch/integrations",
  );
  return data.integrations || [];
}

export function runLaunchIntegration(id: string): Promise<LaunchRunResult> {
  return launchJson<LaunchRunResult>("/api/v1/launch/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ integration: id }),
  });
}

// --- Offline documentation browser -----------------------------------
//
// Backed by app/ui/docs.go, which embeds articles staged from
// docs/features/uh-completeness/articles/ into app/ui/articles/ (see
// scripts/check-docs-bundle.mjs). `written` is false exactly when the
// article is nothing but its generated TODO(...) scaffold -- see
// docsIsScaffoldOnly in app/ui/docs.go -- and the docs screen renders an
// explicit "Article not yet written" state instead of that scaffold body
// rather than passing generated placeholder text off as documentation.

export interface DocsFeature {
  id: string;
  title: string;
  written: boolean;
}

export interface DocsArticle extends DocsFeature {
  content: string;
}

export async function getDocsInventory(): Promise<DocsFeature[]> {
  const response = await fetch(`${API_BASE}/api/v1/docs/inventory`);
  if (!response.ok) {
    throw new Error(`Failed to fetch docs inventory: ${response.status}`);
  }
  const data = (await response.json()) as { features: DocsFeature[] };
  return data.features;
}

export async function getDocsArticle(id: string): Promise<DocsArticle> {
  const response = await fetch(
    `${API_BASE}/api/v1/docs/article/${encodeURIComponent(id)}`,
  );
  if (response.status === 404) {
    throw new Error(`Documentation article not found: ${id}`);
  }
  if (!response.ok) {
    throw new Error(`Failed to fetch docs article "${id}": ${response.status}`);
  }
  return (await response.json()) as DocsArticle;
}
