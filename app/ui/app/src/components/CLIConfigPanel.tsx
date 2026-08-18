import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  applyConfigProfile,
  createConfigProfile,
  deleteConfigProfile,
  getCapabilityRegistry,
  getConfigProfiles,
  updateConfigProfile,
} from "@/api";
import { Button } from "@/components/ui/button";
import { Description, Field, Label } from "@/components/ui/fieldset";
import { Input } from "@/components/ui/input";
import type { ConfigProfileRequest } from "@/lib/cli-config";

function parseProfileValues(raw: string): Record<string, string> {
  const parsed: unknown = JSON.parse(raw.trim() || "{}");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Profile values must be a JSON object.");
  }

  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== "string") {
      throw new Error(`The value for ${key} must be a string.`);
    }
    values[key] = value;
  }
  return values;
}

export default function CLIConfigPanel() {
  const queryClient = useQueryClient();
  const registryQuery = useQuery({
    queryKey: ["cliCapabilities"],
    queryFn: getCapabilityRegistry,
  });
  const profilesQuery = useQuery({
    queryKey: ["configProfiles"],
    queryFn: getConfigProfiles,
  });

  const profiles = profilesQuery.data?.profiles ?? [];
  const [selectedId, setSelectedId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [valuesJSON, setValuesJSON] = useState("{}");
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedId),
    [profiles, selectedId],
  );

  useEffect(() => {
    if (!selectedId) {
      setName("");
      setDescription("");
      setValuesJSON("{}");
      return;
    }
    if (selectedProfile) {
      setName(selectedProfile.name);
      setDescription(selectedProfile.description ?? "");
      setValuesJSON(JSON.stringify(selectedProfile.values, null, 2));
    }
  }, [selectedId, selectedProfile]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const values = parseProfileValues(valuesJSON);
      const request: ConfigProfileRequest = { name, description, values };
      return selectedId
        ? updateConfigProfile(selectedId, request)
        : createConfigProfile(request);
    },
    onSuccess: (profile) => {
      setSelectedId(profile.id);
      setFormError(null);
      setStatus("Profile saved. Apply it to restart the managed service.");
      void queryClient.invalidateQueries({ queryKey: ["configProfiles"] });
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : "Profile save failed");
      setStatus(null);
    },
  });

  const applyMutation = useMutation({
    mutationFn: () => applyConfigProfile(selectedId),
    onSuccess: () => {
      setFormError(null);
      setStatus("Profile applied. The managed service restart was requested.");
      void queryClient.invalidateQueries({ queryKey: ["configProfiles"] });
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : "Profile apply failed");
      setStatus(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteConfigProfile(selectedId),
    onSuccess: () => {
      setSelectedId("");
      setFormError(null);
      setStatus("Profile deleted. The managed service was restored to its baseline configuration.");
      void queryClient.invalidateQueries({ queryKey: ["configProfiles"] });
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : "Profile delete failed");
      setStatus(null);
    },
  });

  const hiddenCount = registryQuery.data?.commands.filter((command) => command.hidden).length ?? 0;

  return (
    <section className="overflow-hidden rounded-xl bg-white dark:bg-neutral-800">
      <div className="space-y-5 p-4">
        <Field>
          <Label>CLI and service configuration</Label>
          <Description>
            The GUI inventory is derived from the same commands, flags, aliases,
            and environment settings used by the Ollama CLI. Profiles apply only
            to the service managed by this app and require an explicit restart.
          </Description>
        </Field>

        {registryQuery.isLoading || profilesQuery.isLoading ? (
          <p className="text-base/6 text-zinc-500 data-disabled:opacity-50 sm:text-sm/6 dark:text-zinc-400">
            Loading command and configuration inventory…
          </p>
        ) : registryQuery.error || profilesQuery.error ? (
          <p className="text-base/6 text-zinc-500 data-disabled:opacity-50 sm:text-sm/6 dark:text-zinc-400 text-red-600 dark:text-red-400">
            Unable to load the CLI configuration inventory.
          </p>
        ) : (
          <>
            <div className="rounded-lg bg-neutral-50 p-3 text-sm dark:bg-neutral-900">
              <div className="font-medium text-neutral-900 dark:text-neutral-100">
                {registryQuery.data?.commands.length ?? 0} CLI commands registered
              </div>
              <div className="text-neutral-600 dark:text-neutral-400">
                {hiddenCount} hidden commands are included for Developer Tools parity · {registryQuery.data?.configuration.length ?? 0} configuration options
              </div>
            </div>

            <Field>
              <Label>Configuration profile</Label>
              <select
                value={selectedId}
                onChange={(event) => {
                  setSelectedId(event.target.value);
                  setFormError(null);
                  setStatus(null);
                }}
                className="mt-2 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
              >
                <option value="">New profile</option>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                    {profile.id === profilesQuery.data?.activeProfile ? " (active)" : ""}
                  </option>
                ))}
              </select>
            </Field>

            <Field>
              <Label htmlFor="cli-profile-name">Profile name</Label>
              <Input
                id="cli-profile-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Local GPU profile"
              />
            </Field>

            <Field>
              <Label htmlFor="cli-profile-description">Description</Label>
              <Input
                id="cli-profile-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Describe when this profile should be used"
              />
            </Field>

            <Field>
              <Label htmlFor="cli-profile-values">Environment overrides (JSON)</Label>
              <Description>
                Use supported environment names as keys and string values. Values
                supplied by the process owner remain visible but cannot be overridden.
              </Description>
              <textarea
                id="cli-profile-values"
                value={valuesJSON}
                onChange={(event) => setValuesJSON(event.target.value)}
                spellCheck={false}
                rows={7}
                className="mt-2 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 font-mono text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              />
            </Field>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                color="white"
                disabled={!name.trim() || saveMutation.isPending}
                onClick={() => {
                  setFormError(null);
                  setStatus(null);
                  saveMutation.mutate();
                }}
              >
                {selectedId ? "Save profile" : "Create profile"}
              </Button>
              <Button
                type="button"
                color="dark"
                disabled={!selectedId || applyMutation.isPending}
                onClick={() => {
                  setFormError(null);
                  setStatus(null);
                  applyMutation.mutate();
                }}
              >
                Apply and restart service
              </Button>
              <Button
                type="button"
                color="zinc"
                disabled={!selectedId || deleteMutation.isPending}
                onClick={() => deleteMutation.mutate()}
              >
                Delete profile
              </Button>
            </div>

            {formError && (
              <Description className="text-red-600 dark:text-red-400">
                {formError}
              </Description>
            )}
            {status && <Description>{status}</Description>}

            <details>
              <summary className="cursor-pointer text-sm font-medium text-neutral-900 dark:text-neutral-100">
                Registered commands and flags
              </summary>
              <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
                {registryQuery.data?.commands.map((command) => (
                  <details key={command.id} className="rounded-lg border border-neutral-200 p-2 dark:border-neutral-700">
                    <summary className="cursor-pointer text-xs font-medium text-neutral-900 dark:text-neutral-100">
                      {command.use}
                      {command.hidden ? " · hidden" : ""}
                    </summary>
                    <div className="mt-1 space-y-1 text-xs text-neutral-600 dark:text-neutral-400">
                      <div>{command.description || "No description provided."}</div>
                      <div>GUI route: {command.guiRoute}</div>
                      {command.aliases && command.aliases.length > 0 && (
                        <div>Aliases: {command.aliases.join(", ")}</div>
                      )}
                      {command.flags && command.flags.length > 0 && (
                        <div>Flags: {command.flags.map((flag) => `--${flag.name}`).join(", ")}</div>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            </details>

            <details>
              <summary className="cursor-pointer text-sm font-medium text-neutral-900 dark:text-neutral-100">
                Effective configuration
              </summary>
              <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
                {profilesQuery.data?.configuration.map((option) => (
                  <div key={option.name} className="rounded-lg border border-neutral-200 p-2 text-xs dark:border-neutral-700">
                    <div className="font-mono text-neutral-900 dark:text-neutral-100">{option.name}</div>
                    <div className="text-neutral-600 dark:text-neutral-400">
                      {option.description} · source: {option.source} · value: {option.effectiveValue || "(empty)"}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          </>
        )}
      </div>
    </section>
  );
}
