import React, { useEffect, useRef, useState } from "react"

import { Button, IconButton } from "./md3"

interface CopyButtonProps {
  content: string
  copyRef?: React.RefObject<HTMLElement | null>
  removeClasses?: string[]
  size?: "sm" | "md"
  showLabels?: boolean
  className?: string
  title?: string
  onCopy?: () => void
}

/**
 * Copy-to-clipboard, as a real Material Design 3 control.
 *
 * This was upstream's own button: a bare <button> with heroicons and hardcoded
 * neutral-100/neutral-800 hover colours, which ignored the seed colour, the
 * user's corner radius and both themes. Under the strict conformance rule a
 * lookalike is a defect rather than an accepted approximation, so it routes
 * through Button/IconButton like every other affordance in chrome.
 *
 * The copied state is deliberately announced rather than only drawn: the icon
 * swap is invisible to a screen reader, and "did that work?" is the entire
 * question a copy button exists to answer.
 */
const CopyButton: React.FC<CopyButtonProps> = ({
  content,
  copyRef,
  removeClasses = [],
  size = "sm",
  showLabels = false,
  className = "",
  title = "",
  onCopy,
}) => {
  const [isCopied, setIsCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // The original left this timer running. Copying and then navigating away
  // sets state on an unmounted component, which is a warning in development
  // and a leak in every build.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const markCopied = () => {
    setIsCopied(true)
    onCopy?.()
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setIsCopied(false), 2000)
  }

  const handleCopy = async () => {
    try {
      if (copyRef?.current) {
        // Rich copy: clone the rendered message and strip the classes the
        // caller does not want travelling with it.
        const cloned = copyRef.current.cloneNode(true) as HTMLElement
        removeClasses.forEach((name) => {
          cloned.querySelectorAll(`.${name}`).forEach((element) => element.remove())
        })
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([cloned.innerHTML], { type: "text/html" }),
            "text/plain": new Blob([content], { type: "text/plain" }),
          }),
        ])
      } else {
        await navigator.clipboard.writeText(content)
      }
      markCopied()
    } catch (error) {
      // ClipboardItem and the rich path are not universally available; plain
      // text is. Fall back rather than leaving the user with a dead control.
      console.error("Clipboard write failed, falling back to plain text", error)
      try {
        await navigator.clipboard.writeText(content)
        markCopied()
      } catch (fallbackError) {
        console.error("Fallback copy also failed:", fallbackError)
      }
    }
  }

  const label = isCopied ? "Copied" : title || "Copy"

  return (
    <>
      {showLabels ? (
        <Button
          variant="text"
          size={size === "sm" ? "sm" : "md"}
          icon={isCopied ? "check" : "content_copy"}
          onClick={handleCopy}
          className={className}
        >
          {isCopied ? "Copied" : "Copy"}
        </Button>
      ) : (
        <IconButton
          label={label}
          icon={isCopied ? "check" : "content_copy"}
          size={size === "sm" ? "sm" : "md"}
          onClick={handleCopy}
          className={className}
        />
      )}
      {/* The icon change says nothing to assistive technology. */}
      <span aria-live="polite" className="sr-only">
        {isCopied ? "Copied to clipboard" : ""}
      </span>
    </>
  )
}

export default CopyButton
