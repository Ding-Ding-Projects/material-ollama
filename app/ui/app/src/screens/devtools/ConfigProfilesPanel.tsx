import { useEffect, useMemo, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  ListItem,
  SearchField,
  Surface,
  Switch,
  TextField,
  useSnackbar,
} from "@/components/md3"
import { Icon } from "@/components/md3/Icon"
import { Txt, fact, useT } from "@/uh"
import {
  applyConfigProfile,
  createConfigProfile,
  deleteConfigProfile,
  updateConfigProfile,
} from "@/api"
import type { ConfigProfile, ConfigProfileRequest, ConfigurationOption } from "@/lib/cli-config"
import { SOURCE_DICT_KEY, SOURCE_TONE, useTextFilter } from "./lib"
import "./devtools.dict"

export interface ConfigProfilesPanelProps {
  configuration: ConfigurationOption[]
  profiles: ConfigProfile[]
  activeProfile?: string
}

/**
 * The configuration-profile manager: list existing profiles (with the
 * currently active one badged), build or edit one against a guided,
 * per-key override picker sourced from the same ConfigurationOption
 * catalog the provenance panel renders, apply one (which restarts the
 * managed service -- stated plainly on the control and again in the
 * confirmation before it happens), and delete one behind the shared
 * ConfirmDialog's typed-DELETE gate.
 */
export function ConfigProfilesPanel({ configuration, profiles, activeProfile }: ConfigProfilesPanelProps) {
  const t = useT("devtools")
  const snackbar = useSnackbar()
  const queryClient = useQueryClient()

  const [selectedId, setSelectedId] = useState("")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [configQuery, setConfigQuery] = useState("")
  const [configRegex, setConfigRegex] = useState(false)
  const [applyOpen, setApplyOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedId),
    [profiles, selectedId],
  )

  useEffect(() => {
    if (!selectedId) {
      setName("")
      setDescription("")
      setOverrides({})
      return
    }
    if (selectedProfile) {
      setName(selectedProfile.name)
      setDescription(selectedProfile.description ?? "")
      setOverrides({ ...selectedProfile.values })
    }
    // Deliberately react only to a fresh selection landing, not to every
    // in-place edit of the currently selected profile's fields below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const filter = useTextFilter(configQuery, configRegex)
  const filteredConfig = useMemo(
    () => configuration.filter((option) => filter.test(`${option.name} ${option.description ?? ""}`)),
    [configuration, filter],
  )

  function resetFeedback() {
    setFormError(null)
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const trimmedName = name.trim()
      const request: ConfigProfileRequest = { name: trimmedName, description: description.trim(), values: overrides }
      return selectedId ? updateConfigProfile(selectedId, request) : createConfigProfile(request)
    },
    onSuccess: (profile) => {
      setSelectedId(profile.id)
      resetFeedback()
      snackbar.show(t("statusSaved"))
      void queryClient.invalidateQueries({ queryKey: ["configProfiles"] })
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : "Profile save failed.")
    },
  })

  const applyMutation = useMutation({
    mutationFn: () => applyConfigProfile(selectedId),
    onSuccess: () => {
      resetFeedback()
      snackbar.show(t("statusApplied"))
      void queryClient.invalidateQueries({ queryKey: ["configProfiles"] })
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : "Profile apply failed.")
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteConfigProfile(selectedId),
    onSuccess: () => {
      setSelectedId("")
      resetFeedback()
      snackbar.show(t("statusDeleted"))
      void queryClient.invalidateQueries({ queryKey: ["configProfiles"] })
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : "Profile delete failed.")
    },
  })

  function toggleOverride(option: ConfigurationOption, include: boolean) {
    setOverrides((current) => {
      const next = { ...current }
      if (include) {
        next[option.name] = option.effectiveValue ?? ""
      } else {
        delete next[option.name]
      }
      return next
    })
  }

  function setOverrideValue(name: string, value: string) {
    setOverrides((current) => ({ ...current, [name]: value }))
  }

  const overrideCount = Object.keys(overrides).length
  const canSave = name.trim().length > 0 && !saveMutation.isPending
  const canApply = Boolean(selectedId) && !applyMutation.isPending
  const canDelete = Boolean(selectedId) && !deleteMutation.isPending

  return (
    <Surface tier="low" outlined radius="lg" className="flex flex-col gap-5 p-5">
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-base font-semibold text-on-surface">
          <Icon name="deployed_code" size={19} className="text-primary" />
          {t("profilesHeading")}
        </h2>
        <p className="max-w-2xl text-[12.5px] text-on-surface-variant">
          <Txt ns="devtools" k="profilesIntro" channel="copy" />
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-on-surface-variant">{t("profileListLabel")}</span>
        <ul className="flex flex-col gap-1">
          <ListItem
            shape="rounded"
            leading={<Icon name="edit_square" size={18} />}
            title={t("newProfileOption")}
            selected={selectedId === ""}
            onClick={() => setSelectedId("")}
          />
          {profiles.map((profile) => (
            <ListItem
              key={profile.id}
              shape="rounded"
              leading={<Icon name="deployed_code" size={18} />}
              title={<Txt channel="fact" value={profile.name} kind="command" />}
              supporting={
                profile.description ? <Txt channel="fact" value={profile.description} kind="command" /> : undefined
              }
              trailing={
                profile.id === activeProfile ? (
                  <Badge variant="label" tone="primary">
                    {t("activeSuffix")}
                  </Badge>
                ) : undefined
              }
              selected={selectedId === profile.id}
              onClick={() => setSelectedId(profile.id)}
            />
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <TextField
          value={name}
          onChange={setName}
          label={t("profileNameLabel")}
          placeholder={t("profileNamePlaceholder")}
          className="flex-1"
        />
        <TextField
          value={description}
          onChange={setDescription}
          label={t("profileDescLabel")}
          placeholder={t("profileDescPlaceholder")}
          className="flex-1"
        />
      </div>

      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-[13px] font-semibold text-on-surface">
            {t("overridesHeading")}
            <Badge variant="label" tone="secondary">
              <Txt channel="fact" value={overrideCount} kind="count" />
            </Badge>
          </h3>
        </div>
        <p className="text-[11.5px] text-on-surface-variant">
          <Txt ns="devtools" k="overridesIntro" channel="copy" />
        </p>

        <SearchField
          value={configQuery}
          onChange={setConfigQuery}
          placeholder={t("searchConfigPlaceholder")}
          label={t("searchConfigLabel")}
          regex={configRegex}
          onToggleRegex={() => setConfigRegex((current) => !current)}
        />
        {filter.error ? (
          <p className="text-[11px] text-error">
            <Txt ns="devtools" k="invalidPattern" channel="copy" />
          </p>
        ) : null}

        {filteredConfig.length === 0 ? (
          <p className="py-4 text-center text-[12px] text-on-surface-variant">
            <Txt ns="devtools" k="noConfigMatch" channel="copy" />
          </p>
        ) : (
          <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto pr-1">
            {filteredConfig.map((option) => (
              <OverrideRow
                key={option.name}
                option={option}
                value={overrides[option.name]}
                onToggle={(checked) => toggleOverride(option, checked)}
                onChange={(value) => setOverrideValue(option.name, value)}
              />
            ))}
          </ul>
        )}
      </section>

      {formError ? (
        <p className="text-[12px] text-error">
          <Txt channel="fact" value={formError} kind="command" />
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="filled"
          icon="check_circle"
          disabled={!canSave}
          loading={saveMutation.isPending}
          onClick={() => {
            resetFeedback()
            saveMutation.mutate()
          }}
        >
          {selectedId ? t("saveProfile") : t("createProfile")}
        </Button>
        <Button
          variant="tonal"
          icon="restart_alt"
          disabled={!canApply}
          loading={applyMutation.isPending}
          onClick={() => setApplyOpen(true)}
        >
          {t("applyProfile")}
        </Button>
        <Button
          variant="outlined"
          icon="delete"
          disabled={!canDelete}
          loading={deleteMutation.isPending}
          onClick={() => setDeleteOpen(true)}
        >
          {t("deleteProfile")}
        </Button>
      </div>
      <p className="flex items-center gap-1.5 text-[11px] text-on-surface-variant">
        <Icon name="restart_alt" size={12} className="shrink-0" />
        <Txt ns="devtools" k="applyNotice" channel="copy" />
      </p>

      <Dialog
        open={applyOpen}
        onClose={() => setApplyOpen(false)}
        icon="restart_alt"
        title={t("applyDialogTitle")}
        actions={
          <>
            <Button variant="text" onClick={() => setApplyOpen(false)}>
              {t("applyCancel")}
            </Button>
            <Button
              variant="filled"
              icon="restart_alt"
              onClick={() => {
                setApplyOpen(false)
                resetFeedback()
                applyMutation.mutate()
              }}
            >
              {t("applyConfirmLabel")}
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-[1.55] text-on-surface-variant">
          <Txt ns="devtools" k="applyDialogBody" channel="copy" />
        </p>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={t("deleteDialogTitle")}
        body={t("deleteDialogBody")}
        keyword="DELETE"
        actionLabel={t("deleteConfirmLabel")}
        onConfirm={() => {
          resetFeedback()
          deleteMutation.mutate()
        }}
      />
    </Surface>
  )
}

interface OverrideRowProps {
  option: ConfigurationOption
  value: string | undefined
  onToggle: (checked: boolean) => void
  onChange: (value: string) => void
}

function OverrideRow({ option, value, onToggle, onChange }: OverrideRowProps) {
  const t = useT("devtools")
  const included = value !== undefined

  return (
    <li className="flex flex-col gap-2 rounded-token border border-outline-variant bg-surface-lowest px-3.5 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Txt
            channel="fact"
            value={option.name}
            kind="command"
            as="span"
            className="block truncate font-mono text-[12.5px] font-semibold text-on-surface"
          />
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10.5px] text-on-surface-variant">
            <span>{t("effectiveValueLabel")}:</span>
            {option.effectiveValue ? (
              <Txt channel="fact" value={option.effectiveValue} kind="command" as="span" className="font-mono" />
            ) : (
              <Txt ns="devtools" k="emptyValue" channel="label" as="span" className="italic" />
            )}
            <Badge variant="label" tone={SOURCE_TONE[option.source]}>
              {t(SOURCE_DICT_KEY[option.source])}
            </Badge>
          </div>
        </div>
        <Switch checked={included} onChange={onToggle} label={t("overrideToggle")} />
      </div>
      {included ? (
        <OverrideValueControl option={option} value={value} onChange={onChange} />
      ) : null}
    </li>
  )
}

function OverrideValueControl({
  option,
  value,
  onChange,
}: {
  option: ConfigurationOption
  value: string
  onChange: (value: string) => void
}) {
  const t = useT("devtools")

  if (option.type === "boolean") {
    return (
      <Switch
        checked={value === "true"}
        onChange={(checked) => onChange(checked ? "true" : "false")}
        label={t("overrideValueLabel")}
      />
    )
  }

  return (
    <TextField
      value={value}
      onChange={onChange}
      mono
      label={t("overrideValueLabel")}
      helper={option.type === "list" ? t("listHelper") : (fact(option.description ?? "", "command") || undefined)}
      placeholder={option.effectiveValue || undefined}
    />
  )
}
