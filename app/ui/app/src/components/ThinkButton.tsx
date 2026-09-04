import type { Ref } from "react"
import { Chip, Menu } from "@/components/md3"
import { Icon } from "@/components/md3/Icon"
import { useT } from "@/uh"
import type { ThinkingLevel } from "./ChatForm"
import "./chat/chat.dict"

const THINKING_LEVELS = ["low", "medium", "high"] as const

interface ThinkButtonProps {
  mode: "think" | "thinkingLevel"
  isVisible?: boolean
  isActive?: boolean
  currentLevel?: ThinkingLevel
  onToggle?: () => void
  onLevelChange?: (level: ThinkingLevel) => void
  onDropdownToggle?: (isOpen: boolean) => void
  ref?: Ref<HTMLButtonElement>
}

/**
 * The composer's thinking control, in both of its shapes: a plain toggle, and
 * a level selector when the model exposes one.
 *
 * The design shows this as a labelled chip beside the model selector and web
 * search. It was two raw <button> elements sharing the same hard-coded colours
 * (bg-white, text-[rgba(0,115,255,1)], focus:ring-blue-500) and the same
 * 500-character lightbulb path pasted inline twice, plus a hand-rolled
 * dropdown with its own click-outside listener and a hard-coded panel.
 *
 * All of it is kit now. The chip supplies the selected state, tonal fill and
 * focus ring; the icon comes from the shared symbol set instead of a duplicated
 * SVG; and Menu supplies the anchored, keyboard-navigable dropdown, so the
 * click-outside handling and the panel styling are no longer this component's
 * problem to get right.
 */
export function ThinkButton({
  mode,
  isVisible,
  isActive,
  currentLevel,
  onToggle,
  onLevelChange,
  onDropdownToggle,
  ref,
}: ThinkButtonProps) {
  const t = useT("chat")
  if (!isVisible) return null

  if (mode === "think") {
    return (
      <Chip
        ref={ref}
        icon="lightbulb"
        selected={Boolean(isActive)}
        onClick={onToggle}
        aria-pressed={Boolean(isActive)}
        aria-label={isActive ? t("thinkOn") : t("thinkOff")}
      >
        {t("think")}
      </Chip>
    )
  }

  const levelLabel = (level: ThinkingLevel) =>
    level === "low" ? t("thinkLow") : level === "medium" ? t("thinkMedium") : t("thinkHigh")

  return (
    <Menu
      triggerLabel={t("thinkLevelLabel")}
      trigger={
        <>
          <Icon name="lightbulb" size={16} className="shrink-0" />
          <span className="truncate">{currentLevel ? levelLabel(currentLevel) : t("think")}</span>
          <Icon name="arrow_drop_down" size={16} className="shrink-0" />
        </>
      }
      triggerClassName="relative inline-flex select-none items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium bg-secondary-container text-on-secondary-container transition-colors duration-150"
      items={THINKING_LEVELS.map((level) => ({
        label: levelLabel(level),
        icon: currentLevel === level ? ("check" as const) : undefined,
        onClick: () => {
          onLevelChange?.(level)
          onDropdownToggle?.(false)
        },
      }))}
    />
  )
}
