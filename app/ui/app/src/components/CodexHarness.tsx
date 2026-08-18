import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  cancelCodexSession,
  deleteCodexProfile,
  getCodexDiscovery,
  getCodexProfiles,
  getCodexSessions,
  openCodexEditor,
  preflightCodex,
  rollbackCodexSession,
  saveCodexProfile,
  startCodexSession,
  subscribeCodexSession,
} from "@/api";
import type {
  CodexDiscovery,
  CodexEnvVar,
  CodexPreflight,
  CodexProfile,
  CodexSession,
} from "@/api";

const emptyProfile = (executable = ""): CodexProfile => ({
  name: "Codex local",
  executable,
  arguments: ["exec"],
  environment: [],
  workingDirectory: "",
  timeoutSeconds: 900,
});

function profileFromForm(
  profile: CodexProfile,
  argumentText: string,
  environment: CodexEnvVar[],
): CodexProfile {
  return {
    ...profile,
    arguments: argumentText
      .split(/\r?\n/)
      .map((argument) => argument.trim())
      .filter(Boolean),
    environment,
  };
}

export default function CodexHarness() {
  const navigate = useNavigate();
  const [discovery, setDiscovery] = useState<CodexDiscovery | null>(null);
  const [profiles, setProfiles] = useState<CodexProfile[]>([]);
  const [profile, setProfile] = useState<CodexProfile>(emptyProfile());
  const [argumentText, setArgumentText] = useState("exec");
  const [environment, setEnvironment] = useState<CodexEnvVar[]>([]);
  const [prompt, setPrompt] = useState("");
  const [preflight, setPreflight] = useState<CodexPreflight | null>(null);
  const [sessions, setSessions] = useState<CodexSession[]>([]);
  const [activeSession, setActiveSession] = useState<CodexSession | null>(null);
  const [output, setOutput] = useState<Array<{ stream: string; line: string }>>([]);
  const [status, setStatus] = useState("Ready");
  const [busy, setBusy] = useState(false);
  const [rollbackOnFailure, setRollbackOnFailure] = useState(true);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const currentProfile = useMemo(
    () => profileFromForm(profile, argumentText, environment),
    [profile, argumentText, environment],
  );

  const refresh = async (force = false) => {
    const [nextDiscovery, nextProfiles, nextSessions] = await Promise.all([
      getCodexDiscovery(force),
      getCodexProfiles(),
      getCodexSessions(),
    ]);
    setDiscovery(nextDiscovery);
    setProfiles(nextProfiles);
    setSessions(nextSessions);
    if (!profile.id && nextProfiles.length > 0) {
      selectProfile(nextProfiles[0]);
    } else if (!profile.executable && nextDiscovery.executable) {
      const next = emptyProfile(nextDiscovery.executable);
      setProfile(next);
      setArgumentText(next.arguments.join("\n"));
    }
  };

  useEffect(() => {
    refresh().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : "Codex discovery failed");
    });
    return () => unsubscribeRef.current?.();
    // The harness refreshes once on entry; user actions refresh explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectProfile = (next: CodexProfile) => {
    setProfile({ ...next, arguments: [...next.arguments], environment: [...next.environment] });
    setArgumentText(next.arguments.join("\n"));
    setEnvironment(next.environment.map((entry) => ({ ...entry })));
    setPreflight(null);
    setStatus(`Loaded ${next.name}`);
  };

  const handleSave = async () => {
    setBusy(true);
    try {
      const saved = await saveCodexProfile(currentProfile);
      const local = { ...saved, environment: environment.map((entry) => ({ ...entry })) };
      setProfile(local);
      setProfiles((previous) => {
        const found = previous.some((item) => item.id === saved.id);
        return found
          ? previous.map((item) => (item.id === saved.id ? local : item))
          : [...previous, local];
      });
      setStatus("Profile saved locally; secret values stay in this run only");
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : "Profile save failed");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!profile.id || !window.confirm("Remove this Codex profile?")) return;
    setBusy(true);
    try {
      await deleteCodexProfile(profile.id);
      const nextProfiles = profiles.filter((item) => item.id !== profile.id);
      setProfiles(nextProfiles);
      const next = nextProfiles[0] || emptyProfile(discovery?.executable || "");
      selectProfile(next);
      setStatus("Profile removed");
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : "Profile removal failed");
    } finally {
      setBusy(false);
    }
  };

  const handlePreflight = async () => {
    setBusy(true);
    try {
      const next = await preflightCodex(currentProfile, prompt);
      setPreflight(next);
      setStatus("Preflight ready for review");
    } catch (error: unknown) {
      setPreflight(null);
      setStatus(error instanceof Error ? error.message : "Preflight failed");
    } finally {
      setBusy(false);
    }
  };

  const handleRun = async () => {
    setBusy(true);
    setOutput([]);
    try {
      const started = await startCodexSession(
        currentProfile,
        prompt,
        rollbackOnFailure,
      );
      setPreflight(started.preflight);
      setActiveSession(started.session);
      setStatus("Codex session queued");
      unsubscribeRef.current?.();
      unsubscribeRef.current = subscribeCodexSession(started.session.id, {
        onState: (state) => {
          setStatus(state.state);
          setActiveSession((previous) =>
            previous ? { ...previous, state: state.state, exitCode: state.exitCode, error: state.error } : previous,
          );
        },
        onOutput: (stream, line) => {
          setOutput((previous) => [...previous.slice(-1999), { stream, line }]);
        },
        onDone: (session) => {
          setActiveSession(session);
          setSessions((previous) => [session, ...previous.filter((item) => item.id !== session.id)]);
          setStatus(session.state);
          setBusy(false);
        },
        onError: () => setStatus("Session stream disconnected; history remains available"),
      });
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : "Codex session failed to start");
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!activeSession) return;
    try {
      await cancelCodexSession(activeSession.id);
      setStatus("Cancellation requested");
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : "Cancellation failed");
    }
  };

  const handleRollback = async () => {
    if (!activeSession || !window.confirm("Restore the app-managed profile snapshot?")) return;
    try {
      const restored = await rollbackCodexSession(activeSession.id);
      setActiveSession(restored);
      setStatus("Profile snapshot restored; workspace files were not reset");
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : "Rollback failed");
    }
  };

  const handleEditor = async () => {
    try {
      const result = await openCodexEditor("code", profile.workingDirectory || ".");
      setStatus(`Opened ${result.path} in ${result.editor}`);
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : "Editor handoff failed");
    }
  };

  const updateEnvironment = (index: number, patch: Partial<CodexEnvVar>) => {
    setEnvironment((previous) => previous.map((entry, entryIndex) => entryIndex === index ? { ...entry, ...patch } : entry));
  };

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="flex h-14 items-center justify-between border-b border-neutral-200 px-5 dark:border-neutral-800">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="rounded-lg px-3 py-2 text-sm hover:bg-neutral-200 dark:hover:bg-neutral-800"
            onClick={() => navigate({ to: "/c/$chatId", params: { chatId: "launch" } })}
          >
            Back
          </button>
          <h1 className="text-base font-semibold">Codex CLI Harness</h1>
        </div>
        <span className="text-xs text-neutral-500">{status}</span>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 p-5 xl:grid-cols-[18rem_1fr]">
        <aside className="space-y-4 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Profiles</h2>
            <button type="button" className="text-xs underline" onClick={() => selectProfile(emptyProfile(discovery?.executable || ""))}>New</button>
          </div>
          {profiles.length === 0 && <p className="text-sm text-neutral-500">No saved profiles yet.</p>}
          <div className="space-y-1">
            {profiles.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => selectProfile(item)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm ${item.id === profile.id ? "bg-neutral-200 dark:bg-neutral-800" : "hover:bg-neutral-100 dark:hover:bg-neutral-800/60"}`}
              >
                <span className="block truncate">{item.name}</span>
                <span className="block truncate text-xs text-neutral-500">{item.executable || "Codex not discovered"}</span>
              </button>
            ))}
          </div>
          <div className="border-t border-neutral-200 pt-4 text-xs dark:border-neutral-800">
            <p className="font-medium">Discovery</p>
            <p className="mt-1 break-all text-neutral-500">{discovery?.executable || discovery?.error || "Checking for codex…"}</p>
            {discovery?.version && <p className="mt-1 text-neutral-500">{discovery.version}</p>}
            <button type="button" className="mt-2 underline" onClick={() => refresh(true).catch(() => setStatus("Discovery refresh failed"))}>Refresh command catalog</button>
          </div>
        </aside>

        <section className="space-y-5">
          <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Guided invocation</h2>
                <p className="mt-1 max-w-2xl text-sm text-neutral-500">Arguments are passed as individual tokens. Shell concatenation and environment expansion are rejected.</p>
              </div>
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={handleSave} className="rounded-lg bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900">Save profile</button>
                {profile.id && <button type="button" disabled={busy} onClick={handleDelete} className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700 disabled:opacity-50 dark:border-red-800 dark:text-red-300">Remove</button>}
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm">Profile name<input value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} className="mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 dark:border-neutral-700" /></label>
              <label className="text-sm">Codex executable<input value={profile.executable} onChange={(event) => setProfile({ ...profile, executable: event.target.value })} placeholder={discovery?.executable || "codex"} className="mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 dark:border-neutral-700" /></label>
              <label className="text-sm md:col-span-2">Working directory<input value={profile.workingDirectory} onChange={(event) => setProfile({ ...profile, workingDirectory: event.target.value })} placeholder="Current directory" className="mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 dark:border-neutral-700" /></label>
              <label className="text-sm">Timeout (seconds)<input type="number" min={1} max={3600} value={profile.timeoutSeconds} onChange={(event) => setProfile({ ...profile, timeoutSeconds: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 dark:border-neutral-700" /></label>
              <label className="text-sm">Prompt<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Optional prompt appended to argv" className="mt-1 min-h-24 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 dark:border-neutral-700" /></label>
              <label className="text-sm md:col-span-2">Arguments (one token per line)<textarea value={argumentText} onChange={(event) => setArgumentText(event.target.value)} className="mt-1 min-h-24 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 font-mono text-xs dark:border-neutral-700" /></label>
            </div>

            <div className="mt-5 border-t border-neutral-200 pt-4 dark:border-neutral-800">
              <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-medium">Explicit environment</h3><button type="button" className="text-xs underline" onClick={() => setEnvironment((previous) => [...previous, { name: "", value: "" }])}>Add variable</button></div>
              <div className="space-y-2">
                {environment.map((entry, index) => (
                  <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto_auto]" key={`${index}-${entry.name}`}>
                    <input aria-label="Environment variable name" value={entry.name} onChange={(event) => updateEnvironment(index, { name: event.target.value })} placeholder="NAME" className="rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700" />
                    <input aria-label="Environment variable value" type={entry.secret ? "password" : "text"} value={entry.value || ""} onChange={(event) => updateEnvironment(index, { value: event.target.value, configured: event.target.value.length > 0 })} placeholder={entry.secret ? "Secret for this run" : "Value"} className="rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700" />
                    <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={Boolean(entry.secret)} onChange={(event) => updateEnvironment(index, { secret: event.target.checked })} />Secret</label>
                    <button type="button" className="text-xs text-red-700" onClick={() => setEnvironment((previous) => previous.filter((_, entryIndex) => entryIndex !== index))}>Remove</button>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-neutral-500">Secret values are masked in previews and history and are not persisted in a profile file.</p>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button type="button" disabled={busy} onClick={handlePreflight} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-neutral-700">Review preflight</button>
              <button type="button" disabled={busy || !discovery?.available} onClick={handleRun} className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50">Run Codex</button>
              <label className="ml-auto flex items-center gap-2 text-xs"><input type="checkbox" checked={rollbackOnFailure} onChange={(event) => setRollbackOnFailure(event.target.checked)} />Restore app profile after launch failure</label>
            </div>
          </div>

          {preflight && <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-900 dark:bg-blue-950/30"><h2 className="font-medium">Reviewable preflight</h2><pre className="mt-3 overflow-auto rounded-lg bg-black p-3 text-xs text-green-200">{preflight.commandPreview}</pre><p className="mt-3 text-sm">Directory: <code>{preflight.workingDirectory}</code> · Timeout: {preflight.timeoutSeconds}s</p>{preflight.environment.length > 0 && <p className="mt-1 text-sm">Environment: {preflight.environment.map((entry) => `${entry.name}=${entry.secret ? "•••" : entry.value || ""}`).join(", ")}</p>}{preflight.warnings?.map((warning) => <p className="mt-2 text-xs text-amber-800 dark:text-amber-200" key={warning}>⚠ {warning}</p>)}</div>}

          <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-medium">Live session</h2><div className="flex gap-2">{activeSession && activeSession.state === "running" && <button type="button" onClick={handleCancel} className="rounded-lg border border-amber-300 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:text-amber-200">Cancel</button>}{activeSession && activeSession.rollbackState === "available" && <button type="button" onClick={handleRollback} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700">Rollback profile</button>}<button type="button" onClick={handleEditor} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700">Open directory in VS Code</button></div></div>
            {activeSession ? <><p className="mt-2 text-sm">State: <strong>{activeSession.state}</strong> · Rollback: {activeSession.rollbackState}</p><pre className="mt-3 max-h-96 min-h-24 overflow-auto rounded-lg bg-neutral-950 p-3 text-xs text-neutral-100">{output.map((item, index) => <span className={item.stream === "stderr" ? "text-red-300" : "text-neutral-100"} key={`${index}-${item.line}`}>{`[${item.stream}] ${item.line}\n`}</span>)}</pre>{activeSession.error && <p className="mt-2 text-sm text-red-700 dark:text-red-300">{activeSession.error}</p>}</> : <p className="mt-2 text-sm text-neutral-500">No active session. Preflight before starting so the exact argv and working directory are visible.</p>}
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900"><h2 className="font-medium">Local session history</h2><div className="mt-3 space-y-2">{sessions.length === 0 && <p className="text-sm text-neutral-500">No Codex sessions recorded yet.</p>}{sessions.map((session) => <details key={session.id} className="rounded-lg border border-neutral-200 p-3 text-sm dark:border-neutral-800"><summary className="cursor-pointer">{session.profileName || "Codex"} · {session.state} · {new Date(session.startedAt).toLocaleString()}</summary><p className="mt-2 break-all text-xs text-neutral-500">{session.commandPreview}</p>{session.error && <p className="mt-1 text-xs text-red-700 dark:text-red-300">{session.error}</p>}<pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs">{session.stdout || session.stderr || "No output"}</pre></details>)}</div></div>

          {discovery?.commands && <details className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900"><summary className="cursor-pointer font-medium">Discovered Codex command and flag catalog ({discovery.commands.length} commands)</summary><div className="mt-3 grid gap-2 md:grid-cols-2">{discovery.commands.map((command) => <div className="rounded-lg bg-neutral-50 p-3 text-sm dark:bg-neutral-800/60" key={command.name}><code>{command.name}</code>{command.aliases && command.aliases.length > 0 && <span className="ml-2 text-xs text-neutral-500">aliases: {command.aliases.join(", ")}</span>}<p className="mt-1 text-xs text-neutral-500">{command.description}</p>{command.flags && command.flags.length > 0 && <p className="mt-1 break-words text-xs text-neutral-500">flags: {command.flags.join(", ")}</p>}</div>)}</div>{discovery.flags && discovery.flags.length > 0 && <p className="mt-4 text-xs text-neutral-500">Global flags: {discovery.flags.map((flag) => flag.name).join(", ")}</p>}</details>}
        </section>
      </div>
    </main>
  );
}
