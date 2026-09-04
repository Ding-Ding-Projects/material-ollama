import { forwardRef } from "react"
import { Chip } from "@/components/md3"
import { useT } from "@/uh"
import "./chat/chat.dict"

interface WebSearchButtonProps {
  isVisible?: boolean
  isActive: boolean
  onToggle: () => void
}

/**
 * The composer's web-search toggle.
 *
 * The design shows this as a labelled filter chip beside the model selector
 * and Think, not as an icon-only circle. It was previously a raw <button>
 * with an inline hand-drawn globe SVG and hard-coded colours (bg-white,
 * text-[rgba(0,115,255,1)], focus:ring-blue-500) that answered to no design
 * token and inverted incorrectly in dark mode.
 *
 * Now a real Material chip: the kit supplies the selected state, the tonal
 * fill, the focus ring and the icon from the shared symbol set.
 */
export const WebSearchButton = forwardRef<HTMLButtonElement, WebSearchButtonProps>(
  function WebSearchButton({ isVisible, isActive, onToggle }, ref) {
    const t = useT("chat")
    if (!isVisible) return null

    return (
      <Chip
        ref={ref}
        icon="language"
        selected={isActive}
        onClick={onToggle}
        aria-pressed={isActive}
        aria-label={isActive ? t("webSearchOn") : t("webSearchOff")}
      >
        {t("webSearch")}
      </Chip>
    )
  },
)
