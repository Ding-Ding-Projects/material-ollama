import { useMemo, useState } from "react"
import { IconButton, Popover, SearchField } from "@/components/md3"
import { Icon } from "@/components/md3/Icon"
import { RegexBuilder } from "@/components/md3/RegexBuilder"
import { useT } from "@/uh"
import { GeneralCard } from "./Settings/GeneralCard"
import { LanguageVoiceCard } from "./Settings/LanguageVoiceCard"
import { SchoolModeCard } from "./Settings/SchoolModeCard"
import { AppearanceCard } from "./Settings/AppearanceCard"
import { DataPrivacyCard } from "./Settings/DataPrivacyCard"
import { AdvancedCard } from "./Settings/AdvancedCard"
import { usePreferencesSync } from "./Settings/usePreferencesSync"
import "./Settings/settingsUi.dict"

function matchesQuery(haystack: string, query: string, regex: boolean): boolean {
  const trimmed = query.trim()
  if (!trimmed) return true
  const lower = haystack.toLowerCase()
  if (!regex) return lower.includes(trimmed.toLowerCase())
  try {
    return new RegExp(trimmed, "i").test(haystack)
  } catch {
    // An unfinished/invalid pattern is normal mid-typing — treat it as "no
    // matches" rather than throwing through the render, same convention
    // ModelsScreen's own search already uses.
    return false
  }
}

/**
 * The real Settings screen — replaces the pre-rewrite `components/Settings.tsx`.
 * Six searchable cards, every control genuinely wired: General and
 * Language & voice/School mode/Appearance/Data & privacy/Advanced all
 * read and write real state, either through the already-shipped
 * `/api/v1/settings` endpoint (General's model/network/update/context
 * fields) or through the newer `/api/v1/uh/preferences` blob via
 * `usePreferencesSync()`, which also mirrors every change into the
 * localStorage contract `src/uh/provider.tsx` reads — so language mode,
 * both funny-level sliders, the emoji toggle and School mode apply live,
 * everywhere in the app, the moment they change here.
 */
export default function SettingsScreen() {
  const t = useT("settingsUi")
  const [query, setQuery] = useState("")
  const [regex, setRegex] = useState(false)
  const [searchExpanded, setSearchExpanded] = useState(true)

  const { preferences, isLoading, loadFailed, patch } = usePreferencesSync()

  const cards = useMemo(
    () => [
      {
        id: "general",
        title: t("generalTitle"),
        sub: t("generalSub"),
        render: () => (
          <GeneralCard preferences={preferences} patchPreferences={patch} preferencesLoading={isLoading} />
        ),
      },
      {
        id: "languageVoice",
        title: t("langVoiceTitle"),
        sub: t("langVoiceSub"),
        render: () => (
          <LanguageVoiceCard preferences={preferences} patchPreferences={patch} preferencesLoading={isLoading} />
        ),
      },
      {
        id: "school",
        title: t("schoolTitle"),
        sub: t("schoolSub"),
        render: () => (
          <SchoolModeCard preferences={preferences} patchPreferences={patch} preferencesLoading={isLoading} />
        ),
      },
      {
        id: "appearance",
        title: t("appearanceTitle"),
        sub: t("appearanceSub"),
        render: () => (
          <AppearanceCard preferences={preferences} patchPreferences={patch} preferencesLoading={isLoading} />
        ),
      },
      {
        id: "dataPrivacy",
        title: t("dataPrivacyTitle"),
        sub: t("dataPrivacySub"),
        render: () => (
          <DataPrivacyCard preferences={preferences} patchPreferences={patch} preferencesLoading={isLoading} />
        ),
      },
      {
        id: "advanced",
        title: t("advancedTitle"),
        sub: t("advancedSub"),
        render: () => (
          <AdvancedCard preferences={preferences} patchPreferences={patch} preferencesLoading={isLoading} />
        ),
      },
    ],
    [t, preferences, patch, isLoading],
  )

  const visibleCards = useMemo(
    () => cards.filter((card) => matchesQuery(`${card.title} ${card.sub}`, query, regex)),
    [cards, query, regex],
  )

  const handleApplyRegex = (pattern: string) => {
    setQuery(pattern)
    setRegex(true)
  }

  return (
    <div
      className="mx-auto flex max-w-[880px] flex-col gap-5 p-7"
      data-capture-id="settings"
      data-capture-ready="true"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-[220px] flex-1">
          <h1 className="text-2xl font-semibold text-on-surface">{t("screenTitle")}</h1>
          <p className="mt-1 text-[13px] text-on-surface-variant">{t("screenSub")}</p>
          {loadFailed ? <p className="mt-1 text-[12px] text-error">{t("loadFailed")}</p> : null}
        </div>

        <div className="flex items-center gap-1.5">
          <IconButton
            icon="search"
            label={searchExpanded ? t("collapseSearch") : t("expandSearch")}
            selected={searchExpanded}
            aria-expanded={searchExpanded}
            onClick={() => setSearchExpanded((current) => !current)}
          />
          {searchExpanded ? (
            <>
              <SearchField
                value={query}
                onChange={setQuery}
                label={t("searchLabel")}
                placeholder={t("searchPlaceholder")}
                regex={regex}
                onToggleRegex={() => setRegex((current) => !current)}
                className="w-[240px]"
              />
              <Popover
                trigger={<Icon name="regular_expression" size={17} />}
                triggerLabel={t("regexBuilderTrigger")}
                anchor="bottom end"
              >
                <RegexBuilder
                  initialPattern={regex ? query : ""}
                  onApply={handleApplyRegex}
                  className="w-[360px]"
                />
              </Popover>
            </>
          ) : null}
        </div>
      </div>

      {visibleCards.length === 0 ? (
        <p className="rounded-[10px] border border-outline-variant bg-surface-low p-4 text-[12.5px] text-on-surface-variant">
          {t("noCardsMatch")}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {visibleCards.map((card) => (
            <div key={card.id}>{card.render()}</div>
          ))}
        </div>
      )}
    </div>
  )
}
