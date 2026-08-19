import { useMemo, useState } from "react"
import { Button, Dialog, ListItem, SearchField, TextField } from "@/components/md3"
import { useT } from "@/uh"
import type { TabGroupDef } from "./useShellTabs"
import "./shell.dict"

export interface TabMoveToGroupPickerProps {
  open: boolean
  onClose: () => void
  groups: readonly TabGroupDef[]
  /** The group the tab currently belongs to, if any — rendered selected so
   * "which group is this tab in right now" is never ambiguous. */
  currentGroupId: string | undefined
  memberCountByGroup: ReadonlyMap<string, number>
  onPick: (groupId: string | null) => void
  onCreateAndPick: (name: string) => void
}

/**
 * "Move… into group…" — a real picker with its own plain-text search over
 * the groups list, never one context-menu item per group (which would grow
 * without bound as the group count grows). Selecting "No group" ungroups
 * the tab; selecting an existing group moves it there; typing a new name
 * creates a group and moves the tab into it in one step.
 */
export function TabMoveToGroupPicker({
  open,
  onClose,
  groups,
  currentGroupId,
  memberCountByGroup,
  onPick,
  onCreateAndPick,
}: TabMoveToGroupPickerProps) {
  const t = useT("shell")
  const [query, setQuery] = useState("")
  const [newName, setNewName] = useState("")

  const filtered = useMemo(() => {
    if (!query.trim()) return groups
    const needle = query.toLowerCase()
    return groups.filter((group) => group.name.toLowerCase().includes(needle))
  }, [groups, query])

  return (
    <Dialog open={open} onClose={onClose} size="sm" icon="folder" title={t("addToGroup")}>
      <div className="flex flex-col gap-3">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder={t("searchGroupsPlaceholder")}
          label={t("searchGroupsLabel")}
        />
        <div className="flex max-h-[40vh] flex-col gap-0.5 overflow-y-auto">
          <ListItem
            shape="rounded"
            title={t("noGroup")}
            selected={currentGroupId === undefined}
            onClick={() => {
              onPick(null)
              onClose()
            }}
          />
          {filtered.map((group) => (
            <ListItem
              key={group.id}
              shape="rounded"
              selected={group.id === currentGroupId}
              leading={
                <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: group.color }} />
              }
              title={group.name}
              supporting={`${memberCountByGroup.get(group.id) ?? 0} ${t("memberCount")}`}
              onClick={() => {
                onPick(group.id)
                onClose()
              }}
            />
          ))}
        </div>
        <div className="flex items-end gap-2 border-t border-outline-variant pt-3">
          <TextField
            value={newName}
            onChange={setNewName}
            label={t("renameGroupLabel")}
            placeholder={t("newGroupPlaceholder")}
            className="min-w-0 flex-1"
          />
          <Button
            variant="tonal"
            size="sm"
            icon="folder"
            disabled={!newName.trim()}
            onClick={() => {
              onCreateAndPick(newName)
              setNewName("")
              onClose()
            }}
          >
            {t("createGroup")}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
