// Thin re-export so routes/status.tsx's `import StatusScreen from
// "@/screens/StatusScreen"` keeps working unchanged. The real
// implementation -- release identity, changelog, local version history,
// support tickets, dim sum -- lives entirely under ./status/, this file's
// one allowed sibling path.
export { StatusScreen as default } from "./status/StatusScreen"
