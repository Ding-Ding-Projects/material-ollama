import { useState } from "react"
import { Button, Surface, TextField } from "@/components/md3"
import { Icon } from "@/components/md3/Icon"
import { Txt, useT } from "@/uh"
import "./modelsUi.dict"

export interface CatalogSectionProps {
  onPull: (model: string) => void
  pulling: boolean
}

/**
 * The honest replacement for a catalog browser: there is no catalog
 * service yet (per the brief), so this never invents a model list. It
 * says so plainly and offers the one thing that's actually true — you can
 * queue a pull for an exact model reference you already know.
 */
export function CatalogSection({ onPull, pulling }: CatalogSectionProps) {
  const t = useT("modelsUi")
  const [value, setValue] = useState("")

  const trimmed = value.trim()
  const submit = () => {
    if (!trimmed || pulling) return
    onPull(trimmed)
    setValue("")
  }

  return (
    <Surface tier="lowest" outlined radius="token" className="flex flex-col gap-3 p-5">
      <div className="flex items-center gap-2">
        <Icon name="storefront" size={19} className="shrink-0 text-on-surface-variant" />
        <span className="text-[13px] font-semibold">
          <Txt ns="modelsUi" k="catalogTitle" />
        </span>
      </div>
      <div className="flex items-start gap-2.5 rounded-lg bg-surface-high px-3 py-2.5">
        <Icon name="warning" size={16} className="mt-0.5 shrink-0 text-on-surface-variant" />
        <div className="flex flex-col gap-0.5">
          <span className="text-[12.5px] font-medium">
            <Txt ns="modelsUi" k="catalogNotDownloaded" />
          </span>
          <span className="text-[12px] leading-[1.5] text-on-surface-variant">
            <Txt ns="modelsUi" k="catalogNotDownloadedBody" channel="copy" />
          </span>
        </div>
      </div>
      <div className="flex items-end gap-2">
        <TextField
          value={value}
          onChange={setValue}
          mono
          label={t("quickPullLabel")}
          placeholder={t("quickPullPlaceholder")}
          leading="download"
          disabled={pulling}
          className="flex-1"
        />
        <Button
          variant="filled"
          icon="download"
          disabled={!trimmed || pulling}
          loading={pulling}
          onClick={submit}
        >
          <Txt ns="modelsUi" k="quickPullButton" />
        </Button>
      </div>
    </Surface>
  )
}
