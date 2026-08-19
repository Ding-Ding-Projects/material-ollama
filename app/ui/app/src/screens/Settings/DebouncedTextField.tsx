import { useEffect, useRef, useState } from "react"
import { TextField, type TextFieldProps } from "@/components/md3"

export interface DebouncedTextFieldProps extends Omit<TextFieldProps, "value" | "onChange"> {
  value: string
  /** Fires `delayMs` after the user stops typing — not on every keystroke,
   * so renaming the app or School mode doesn't fire a PATCH per
   * character. Resyncs from `value` whenever it changes externally (a
   * server round-trip landing, a reset action), so it never diverges from
   * the source of truth once the user stops typing. */
  onCommit: (value: string) => void
  delayMs?: number
}

export function DebouncedTextField({ value, onCommit, delayMs = 600, ...rest }: DebouncedTextFieldProps) {
  const [draft, setDraft] = useState(value)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setDraft(value)
  }, [value])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleChange = (next: string) => {
    setDraft(next)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => onCommit(next), delayMs)
  }

  return <TextField value={draft} onChange={handleChange} {...rest} />
}
