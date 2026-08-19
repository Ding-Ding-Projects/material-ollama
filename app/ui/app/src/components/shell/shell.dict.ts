import { defineDict } from "@/uh"

/**
 * Shell-chrome strings the "app" dictionary doesn't carry yet: the command
 * palette's own title/search label, the notification bell's accessible
 * "unread" state, the honest "not built yet" copy every placeholder
 * screen shows, and the whole browser-style tab system (docking, groups,
 * the four discovery searches, bulk close, and the tab context menu's
 * shortcut column). Registered from outside src/uh/** (this lane's
 * boundary) using the same defineDict()/DictRegistry augmentation every
 * other *.dict.ts file uses — the namespace just lives here instead of
 * there.
 *
 * Importing this module anywhere runs `defineDict()` as a side effect,
 * which is what actually registers the "shell" namespace at runtime;
 * every consumer of `useT("shell")` in this lane imports it directly so
 * registration never depends on import order elsewhere.
 */
export const shellDict = defineDict("shell", {
  unread: ["Unread notifications", "有未讀通知"],
  commandPalette: ["Command palette", "指令面板"],
  commandSearch: ["Command search", "搵指令"],
  screenKind: ["Screen", "版面"],
  noMatches: ["No matches", "冇符合嘅"],
  notBuiltYet: ["Not built yet", "仲未起好"],
  notBuiltYetBody: [
    "This screen is wired into navigation so you can see where it will live. The chrome around it is real — the room inside is still empty.",
    "呢個畫面已經駁咗落導航度，等你睇吓佢擺喺邊。周圍嘅裝修係真㗎，不過入面間房仲係空嘅。",
  ],

  // --- Docking ---------------------------------------------------------
  dockLabel: ["Tab strip position", "分頁列擺位"],
  dockLeft: ["Left", "左邊"],
  dockRight: ["Right", "右邊"],
  dockTop: ["Top", "上邊"],
  dockBottom: ["Bottom", "下邊"],
  expandRail: ["Expand tab strip", "打開分頁列"],
  collapseRail: ["Collapse tab strip to icons", "縮成得返圖示"],

  // --- Groups ------------------------------------------------------------
  manageGroups: ["Manage groups", "管理組別"],
  addToGroup: ["Move… into group…", "搬去……某個組別……"],
  removeFromGroup: ["Remove from group", "退出組別"],
  createGroup: ["Create group", "開新組別"],
  newGroupPlaceholder: ["New group name…", "新組別叫咩名…"],
  noGroup: ["No group", "冇組別"],
  noGroupsYet: ["No groups yet — create one to start clustering tabs.", "仲未有組別，開個嚟開始砌埋一堆分頁啦。"],
  searchGroupsPlaceholder: ["Search groups by name…", "用名搵組別…"],
  searchGroupsLabel: ["Search groups", "搵組別"],
  searchWithinGroupPlaceholder: ["Search tabs in this group…", "喺呢個組搵分頁…"],
  searchWithinGroupLabel: ["Search within group", "組內搜尋"],
  noGroupMatches: ["No tabs in this group match.", "呢個組冇符合嘅分頁。"],
  collapseGroup: ["Collapse", "收埋"],
  expandGroup: ["Expand", "展開"],
  moveGroupUp: ["Move group up", "組別搬前啲"],
  moveGroupDown: ["Move group down", "組別搬後啲"],
  deleteGroup: ["Delete group", "刪除組別"],
  memberCount: ["tabs", "個分頁"],
  colorLabel: ["Colour", "顏色"],
  renameGroupLabel: ["Group name", "組別名"],
  newGroupOption: ["+ New group…", "+ 開新組別…"],

  // --- Discovery searches --------------------------------------------
  searchCurrentStripLabel: ["Search open tabs", "搵開緊嘅分頁"],
  searchCurrentStripPlaceholder: ["Search this tab strip…", "喺呢條分頁列搵…"],
  searchAllTabs: ["Search all tabs", "搜尋所有分頁"],
  searchAllTabsPlaceholder: ["Search every open tab…", "搵晒所有開緊嘅分頁…"],
  noOpenTabsMatch: ["No open tabs match.", "冇開緊嘅分頁符合。"],
  regexBuilderLabel: ["Regex builder", "Regex 搭建器"],
  applyRegex: ["Apply", "套用"],
  pinnedBadge: ["Pinned", "已釘住"],

  // --- Bulk close ---------------------------------------------------------
  bulkClose: ["Close tabs by text…", "用文字閂分頁…"],
  bulkCloseTitle: ["Close tabs by text", "用文字閂分頁"],
  bulkCloseContaining: ["Containing", "包含"],
  bulkCloseNotContaining: ["Not containing", "唔包含"],
  bulkCloseQueryLabel: ["Match text", "配對文字"],
  bulkCloseQueryPlaceholder: ["Type text to match tab titles…", "打啲文字嚟配對分頁標題…"],
  bulkCloseIncludePinned: ["Include pinned tabs", "包埋已釘住嘅分頁"],
  bulkClosePreviewNone: ["Nothing matches yet.", "而家未有符合嘅嘢。"],
  bulkCloseConfirm: ["Close matching tabs", "閂晒符合嘅分頁"],
  bulkCloseExcludedNote: ["pinned tab(s) kept — include pinned above to close them too", "有釘住嘅分頁冇閂 —— 想埋一齊閂就撳返上面「包埋已釘住嘅分頁」"],

  // --- Context menu shortcuts ----------------------------------------
  closeTabShortcut: ["Close tab", "閂呢個 tab"],
  moveTabUp: ["Move up in group", "組入面搬前啲"],
  moveTabDown: ["Move down in group", "組入面搬後啲"],

  // --- Notification-center event descriptions -------------------------
  dockChanged: ["Tab strip docked", "分頁列擺位改咗"],
  groupCreated: ["Group created", "開咗個新組別"],
  tabMoved: ["Tab moved to group", "分頁搬咗入組別"],
  tabUngrouped: ["Tab left its group", "分頁退咗組"],
  groupDeleted: ["Group deleted", "刪咗個組別"],
  bulkClosed: ["Tabs closed by text", "用文字閂咗啲分頁"],
} as const)

declare module "../../uh/dict/registry" {
  interface DictRegistry {
    shell: (typeof shellDict)["dict"]
  }
}
