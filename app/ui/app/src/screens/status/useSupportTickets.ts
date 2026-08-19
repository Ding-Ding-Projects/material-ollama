import { useCallback, useState } from "react"

/**
 * The Support Tickets desk's only real datum. "Fully local" per the
 * contract means genuinely local -- browser `localStorage`, never a
 * network request, never the Go-backed SQLite store (this feature isn't
 * append-only history, it's disposable comedy the user can delete at
 * will, which localStorage's own semantics already match).
 */
const STORAGE_KEY = "material-ollama:status:support-tickets"

export type TicketStatus = "open" | "resolved"

export interface SupportTicket {
  id: string
  number: string
  category: string
  description: string
  status: TicketStatus
  createdAt: string
  resolvedAt: string | null
}

function isTicketLike(value: unknown): value is SupportTicket {
  if (!value || typeof value !== "object") return false
  const t = value as Record<string, unknown>
  return (
    typeof t.id === "string" &&
    typeof t.number === "string" &&
    typeof t.category === "string" &&
    typeof t.description === "string" &&
    (t.status === "open" || t.status === "resolved") &&
    typeof t.createdAt === "string"
  )
}

function readTickets(): SupportTicket[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isTicketLike)
  } catch {
    return []
  }
}

function writeTickets(tickets: SupportTicket[]): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets))
  } catch {
    // A full or unavailable localStorage quota shouldn't crash the
    // screen -- the in-memory state still reflects what the user just
    // did for the rest of this session, it just won't survive a reload.
  }
}

function randomTicketNumber(): string {
  const n = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0")
  return `MO-${n}`
}

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function useSupportTickets() {
  const [tickets, setTickets] = useState<SupportTicket[]>(() => readTickets())

  const create = useCallback((category: string, description: string): SupportTicket => {
    const ticket: SupportTicket = {
      id: randomId(),
      number: randomTicketNumber(),
      category,
      description,
      status: "open",
      createdAt: new Date().toISOString(),
      resolvedAt: null,
    }
    setTickets((current) => {
      const next = [ticket, ...current]
      writeTickets(next)
      return next
    })
    return ticket
  }, [])

  const resolve = useCallback((id: string) => {
    setTickets((current) => {
      const next = current.map((ticket) =>
        ticket.id === id && ticket.status === "open"
          ? { ...ticket, status: "resolved" as const, resolvedAt: new Date().toISOString() }
          : ticket,
      )
      writeTickets(next)
      return next
    })
  }, [])

  const clearAll = useCallback(() => {
    setTickets([])
    writeTickets([])
  }, [])

  return { tickets, create, resolve, clearAll }
}
