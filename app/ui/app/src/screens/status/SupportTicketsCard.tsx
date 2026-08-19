import { useState } from "react"
import { Badge, Button, ConfirmDialog, Select, Surface, useSnackbar } from "@/components/md3"
import { Icon } from "@/components/md3/Icon"
import { FOCUS_RING_WITHIN } from "@/components/md3/tokens"
import { Txt, useT } from "@/uh"
import type { SupportTicket } from "./useSupportTickets"
import { useSupportTickets } from "./useSupportTickets"
import "./status.dict"

/**
 * The real, checkable answer behind "Resolution opens the
 * application-data folder": every JSON-backed store in this project
 * (app/ui/catalog.go, codex.go, convert.go, docker.go, models.go,
 * totp.go, and app/store/store.go's SQLite database itself) resolves its
 * path as `filepath.Join(os.Getenv("LOCALAPPDATA"), "Ollama", ...)`. This
 * lane's allowed paths don't include a Go file or a webview bridge
 * (see app/cmd/app/webview.go's `wv.Bind(...)` calls -- no
 * "open folder"/"reveal in explorer" binding exists there, and adding
 * one is out of scope here), so there is no way to make the browser
 * launch a native Explorer window from this screen. What IS honestly
 * achievable -- and what "Copy folder path" actually does -- is put the
 * real, exact path on the clipboard and spell out how to use it, rather
 * than shipping a button labeled "Open folder" that silently does
 * nothing.
 */
const APP_DATA_FOLDER = "%LOCALAPPDATA%\\Ollama"

type CategoryKey = "lockedOut" | "confused" | "question"

const CATEGORY_LABEL_KEYS: Record<CategoryKey, "ticketCategoryLockedOut" | "ticketCategoryConfused" | "ticketCategoryQuestion"> = {
  lockedOut: "ticketCategoryLockedOut",
  confused: "ticketCategoryConfused",
  question: "ticketCategoryQuestion",
}

const MAX_DESCRIPTION_LENGTH = 500

export function SupportTicketsCard() {
  const t = useT("status")
  const snackbar = useSnackbar()
  const { tickets, create, resolve, clearAll } = useSupportTickets()

  const [category, setCategory] = useState<CategoryKey>("lockedOut")
  const [description, setDescription] = useState("")
  const [clearOpen, setClearOpen] = useState(false)

  const handleSubmit = () => {
    const trimmed = description.trim()
    if (!trimmed) return
    create(category, trimmed)
    setDescription("")
  }

  const handleCopyPath = async () => {
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable")
      await navigator.clipboard.writeText(APP_DATA_FOLDER)
      snackbar.show(t("ticketsCopiedToast"))
    } catch {
      snackbar.show(t("ticketsCopyFailed"))
    }
  }

  return (
    <Surface outlined radius="lg" className="flex flex-col gap-4 p-5" data-testid="support-tickets-card">
      <div className="flex items-center gap-2.5">
        <Icon name="confirmation_number" size={20} className="shrink-0 text-on-surface-variant" />
        <h2 className="text-base font-semibold text-on-surface">{t("ticketsHeading")}</h2>
      </div>
      <p className="text-[12.5px] text-on-surface-variant">
        <Txt ns="status" k="ticketsBody" channel="copy" />
      </p>

      {/* The unmissable, unstyled disclosure -- channel="label" skips
          funny() entirely (see uh/Txt.tsx's channel table), so this exact
          sentence renders identically at every funny-level setting. */}
      <div
        role="note"
        data-testid="tickets-disclosure"
        className="flex items-start gap-2.5 rounded-token border-2 border-error bg-error-container px-3.5 py-3 text-on-error-container"
      >
        <Icon name="warning" size={18} className="mt-0.5 shrink-0" />
        <p className="text-[12.5px] font-semibold">
          <Txt ns="status" k="ticketsDisclosure" channel="label" />
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-token bg-surface-low p-3.5">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium text-on-surface-variant">{t("ticketsCategoryLabel")}</span>
          <Select
            value={category}
            onChange={(value) => setCategory(value as CategoryKey)}
            ariaLabel={t("ticketsCategoryLabel")}
            options={(Object.keys(CATEGORY_LABEL_KEYS) as CategoryKey[]).map((key) => ({
              value: key,
              label: t(CATEGORY_LABEL_KEYS[key]),
            }))}
            className="w-full sm:w-64"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="status-ticket-description" className="text-[11px] font-medium text-on-surface-variant">
            {t("ticketsDescriptionLabel")}
          </label>
          <textarea
            id="status-ticket-description"
            value={description}
            onChange={(event) => setDescription(event.target.value.slice(0, MAX_DESCRIPTION_LENGTH))}
            placeholder={t("ticketsDescriptionPlaceholder")}
            rows={3}
            className={`w-full resize-y rounded-[10px] border border-outline-variant bg-surface px-3 py-2 text-[12.5px] outline-none placeholder:text-on-surface-variant ${FOCUS_RING_WITHIN}`}
          />
        </div>
        <div className="flex items-center justify-end">
          <Button
            variant="filled"
            size="sm"
            icon="confirmation_number"
            disabled={description.trim().length === 0}
            onClick={handleSubmit}
          >
            {t("ticketsSubmit")}
          </Button>
        </div>
      </div>

      {tickets.length > 0 ? (
        <div className="flex items-center justify-end">
          <Button variant="text" size="sm" icon="delete_sweep" onClick={() => setClearOpen(true)}>
            {t("ticketsClearAll")}
          </Button>
        </div>
      ) : null}

      {tickets.length === 0 ? (
        <p className="px-2 py-4 text-center text-[13px] text-on-surface-variant">
          <Txt ns="status" k="ticketsEmpty" channel="copy" />
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {tickets.map((ticket) => (
            <TicketRow key={ticket.id} ticket={ticket} onResolve={() => resolve(ticket.id)} onCopyPath={handleCopyPath} />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        title={t("ticketsClearTitle")}
        body={t("ticketsClearBody")}
        keyword="CLEAR"
        actionLabel={t("ticketsClearAll")}
        onConfirm={clearAll}
      />
    </Surface>
  )
}

function TicketRow({
  ticket,
  onResolve,
  onCopyPath,
}: {
  ticket: SupportTicket
  onResolve: () => void
  onCopyPath: () => void
}) {
  const t = useT("status")
  const categoryKey = (Object.keys(CATEGORY_LABEL_KEYS) as CategoryKey[]).find((key) => key === ticket.category)

  return (
    <li className="flex flex-col gap-2 rounded-token border border-outline-variant p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[12px] font-semibold text-on-surface">
          <Txt channel="fact" value={ticket.number} kind="tag" />
        </span>
        {categoryKey ? (
          <Badge variant="label" tone="neutral">
            {t(CATEGORY_LABEL_KEYS[categoryKey])}
          </Badge>
        ) : null}
        <Badge variant="label" tone={ticket.status === "resolved" ? "tertiary" : "primary"}>
          {ticket.status === "resolved" ? t("ticketsStatusResolved") : t("ticketsStatusOpen")}
        </Badge>
      </div>

      <p className="text-[13px] text-on-surface">
        <Txt channel="content">{ticket.description}</Txt>
      </p>

      <div className="flex items-start gap-2 rounded-token bg-surface-low px-3 py-2 text-[12px] text-on-surface-variant">
        <Icon name="forum" size={14} className="mt-0.5 shrink-0" />
        <span>
          <Txt ns="status" k="ticketsCannedResponse" channel="copy" />
        </span>
      </div>

      {ticket.status === "open" ? (
        <div className="flex justify-end">
          <Button variant="tonal" size="sm" icon="check_circle" onClick={onResolve}>
            {t("ticketsResolveButton")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 rounded-token bg-tertiary-container p-3 text-on-tertiary-container">
          <p className="text-[12.5px] font-semibold">{t("ticketsResolvedTitle")}</p>
          <p className="text-[12px]">
            <Txt ns="status" k="ticketsResolvedBody" channel="copy" />
          </p>
          <p className="text-[11px] font-medium opacity-85">{t("ticketsFolderPathLabel")}</p>
          <code className="rounded bg-surface px-2 py-1 font-mono text-[12px] text-on-surface">{APP_DATA_FOLDER}</code>
          <div className="flex justify-end">
            <Button variant="text" size="sm" icon="folder" onClick={onCopyPath}>
              {t("ticketsCopyPathButton")}
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}
