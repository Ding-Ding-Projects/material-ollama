import { defineDict } from "@/uh"

/**
 * Strings for the shared bulk-selection system (BulkSelectableList,
 * BulkActionBar, BulkActionPreviewDialog). Registered from outside
 * src/uh/** (this lane's boundary), same pattern as
 * components/shell/shell.dict.ts.
 */
export const bulkDict = defineDict("bulk", {
  selectRow: ["Select row", "揀呢行"],
  selectAllOnPage: ["Select all on this page", "揀晒呢版嘅嘢"],
  selectAllMatching: ["Select all matching", "揀晒啱嘅嘢"],
  clearSelection: ["Clear selection", "清返啲揀嘅嘢"],
  invertSelection: ["Invert selection", "反轉揀嘅嘢"],
  selectedCountPage: ["selected on this page", "揀咗喺呢版"],
  selectedCountAll: ["selected across every match", "喺所有啱嘅嘢入面揀咗"],
  selectedCountPlain: ["selected", "揀咗"],
  previewHeading: ["This will affect", "呢個動作會影響"],
  itemsWillChange: ["will change", "會改變"],
  itemsSkipped: ["skipped (already in that state)", "跳過咗（本身已經係咁）"],
  confirmAction: ["Confirm", "確認"],
  runningAction: ["Working…", "搞緊…"],
  cancelRunning: ["Cancel", "取消"],
  partialOutcome: ["succeeded", "搞掂"],
  partialOutcomeFailed: ["failed", "搞唔掂"],
  notificationLog: ["Notifications", "通知"],
  historyLog: ["History", "歷史紀錄"],
  dismissSelected: ["Dismiss selected", "清走揀咗嘅"],
  exportSelected: ["Export selected", "匯出揀咗嘅"],
} as const)

declare module "@/uh/dict/registry" {
  interface DictRegistry {
    bulk: (typeof bulkDict)["dict"]
  }
}
