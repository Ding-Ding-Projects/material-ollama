import clsx from "clsx"
import { useMemo, useState } from "react"
import { Button, Dialog, IconButton, ListItem, TextField, ColorSwatch } from "@/components/md3"
import { Icon, type SymbolName } from "@/components/md3/Icon"
import { useT } from "@/uh"
import { TabSearchField } from "./TabSearchField"
import { EMPTY_TAB_SEARCH_QUERY, filterByTabQuery, type TabSearchQuery } from "./tabSearch"
import type { TabGroupDef } from "./useShellTabs"
import "./shell.dict"

const GROUP_COLOR_PALETTE = ["#7cb342", "#5c6bc0", "#ef6c00", "#ec407a", "#00897b", "#8e24aa", "#3949ab", "#c62828"]

export interface TabGroupsPanelMember {
  readonly id: string
  readonly label: string
  readonly icon: SymbolName
}

export interface TabGroupsPanelProps {
  open: boolean
  onClose: () => void
  groups: readonly TabGroupDef[]
  /** DestinationId-agnostic: the panel only ever needs a group's members
   * already resolved to {id, label, icon} — useShellTabs' tab ids plus the
   * caller's own localized destination labels. */
  membersByGroup: ReadonlyMap<string, readonly TabGroupsPanelMember[]>
  onCreateGroup: (name: string) => void
  onRenameGroup: (groupId: string, name: string) => void
  onSetGroupColor: (groupId: string, color: string) => void
  onToggleCollapsed: (groupId: string) => void
  onDeleteGroup: (groupId: string) => void
  onReorderGroup: (groupId: string, direction: "up" | "down") => void
  onRemoveTabFromGroup: (tabId: string) => void
  onActivateTab: (tabId: string) => void
}

/**
 * "Manage groups" — create/name/colour/collapse/reorder/delete a group,
 * and move a tab back out of one. Hosts two of the tab system's four
 * required discovery searches: filtering the groups list itself by name
 * (search #3), and, inside each expanded group, filtering that group's own
 * member tabs (search #2) — each with its own independent
 * RegexBuilder-backed TabSearchField and its own state, per the shared
 * contract every discovery search in this app follows.
 */
export function TabGroupsPanel({
  open,
  onClose,
  groups,
  membersByGroup,
  onCreateGroup,
  onRenameGroup,
  onSetGroupColor,
  onToggleCollapsed,
  onDeleteGroup,
  onReorderGroup,
  onRemoveTabFromGroup,
  onActivateTab,
}: TabGroupsPanelProps) {
  const t = useT("shell")
  const [groupQuery, setGroupQuery] = useState<TabSearchQuery>(EMPTY_TAB_SEARCH_QUERY)
  const [newGroupName, setNewGroupName] = useState("")
  const [memberQueries, setMemberQueries] = useState<Record<string, TabSearchQuery>>({})

  const groupsAsSearchable = useMemo(() => groups.map((g) => ({ ...g, label: g.name })), [groups])
  const filteredGroups = useMemo(() => filterByTabQuery(groupsAsSearchable, groupQuery), [groupsAsSearchable, groupQuery])

  function memberQueryFor(groupId: string): TabSearchQuery {
    return memberQueries[groupId] ?? EMPTY_TAB_SEARCH_QUERY
  }

  return (
    <Dialog open={open} onClose={onClose} size="lg" icon="folder" title={t("manageGroups")}>
      <div className="flex flex-col gap-4">
        <TabSearchField
          query={groupQuery}
          onQueryChange={setGroupQuery}
          label={t("searchGroupsLabel")}
          placeholder={t("searchGroupsPlaceholder")}
        />

        <div className="flex items-end gap-2">
          <TextField
            value={newGroupName}
            onChange={setNewGroupName}
            label={t("renameGroupLabel")}
            placeholder={t("newGroupPlaceholder")}
          />
          <Button
            variant="tonal"
            size="sm"
            icon="folder"
            disabled={!newGroupName.trim()}
            onClick={() => {
              onCreateGroup(newGroupName)
              setNewGroupName("")
            }}
          >
            {t("createGroup")}
          </Button>
        </div>

        {groups.length === 0 ? (
          <p className="px-1 py-3 text-[12.5px] text-on-surface-variant">{t("noGroupsYet")}</p>
        ) : (
          <div className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto">
            {filteredGroups.map((group) => {
              // Reorder bounds are computed against the REAL (unfiltered)
              // group order, never the filtered display list — a group
              // search narrowing what's on screen must never make an
              // available reorder look disabled, or a boundary reorder
              // look available, just because a sibling group is hidden.
              const realIndex = groups.findIndex((candidate) => candidate.id === group.id)
              const members = membersByGroup.get(group.id) ?? []
              const query = memberQueryFor(group.id)
              const filteredMembers = filterByTabQuery(members, query)
              return (
                <div key={group.id} className="flex flex-col gap-2 rounded-[14px] border border-outline-variant p-3">
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: group.color }}
                    />
                    <TextField
                      value={group.name}
                      onChange={(name) => onRenameGroup(group.id, name)}
                      className="min-w-0 flex-1"
                    />
                    <IconButton
                      label={t(group.collapsed ? "expandGroup" : "collapseGroup")}
                      icon="arrow_drop_down"
                      className={clsx("transition-transform", group.collapsed && "-rotate-90")}
                      onClick={() => onToggleCollapsed(group.id)}
                    />
                    <IconButton
                      label={t("moveGroupUp")}
                      icon="arrow_upward"
                      disabled={realIndex <= 0}
                      onClick={() => onReorderGroup(group.id, "up")}
                    />
                    <IconButton
                      label={t("moveGroupDown")}
                      icon="arrow_upward"
                      className="rotate-180"
                      disabled={realIndex === -1 || realIndex >= groups.length - 1}
                      onClick={() => onReorderGroup(group.id, "down")}
                    />
                    <IconButton label={t("deleteGroup")} icon="delete" danger onClick={() => onDeleteGroup(group.id)} />
                  </div>

                  <div className="flex items-center gap-1.5 pl-5">
                    <span className="text-[11px] text-on-surface-variant">{t("colorLabel")}</span>
                    {GROUP_COLOR_PALETTE.map((color) => (
                      <ColorSwatch
                        key={color}
                        color={color}
                        label={color}
                        size="sm"
                        selected={group.color === color}
                        onClick={() => onSetGroupColor(group.id, color)}
                      />
                    ))}
                  </div>

                  {!group.collapsed ? (
                    <div className="flex flex-col gap-1.5 pl-5">
                      <TabSearchField
                        query={query}
                        onQueryChange={(next) => setMemberQueries((current) => ({ ...current, [group.id]: next }))}
                        label={t("searchWithinGroupLabel")}
                        placeholder={t("searchWithinGroupPlaceholder")}
                      />
                      <div className="flex flex-col gap-0.5">
                        {filteredMembers.length === 0 ? (
                          <p className="px-2 py-2 text-[11.5px] text-on-surface-variant">{t("noGroupMatches")}</p>
                        ) : (
                          filteredMembers.map((member) => (
                            <ListItem
                              key={member.id}
                              shape="rounded"
                              leading={<Icon name={member.icon} size={16} className="text-on-surface-variant" />}
                              title={member.label}
                              onClick={() => onActivateTab(member.id)}
                              trailing={
                                <IconButton
                                  label={t("removeFromGroup")}
                                  icon="close"
                                  size="sm"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    onRemoveTabFromGroup(member.id)
                                  }}
                                />
                              }
                            />
                          ))
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Dialog>
  )
}
