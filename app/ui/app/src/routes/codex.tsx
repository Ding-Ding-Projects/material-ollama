import { createFileRoute } from "@tanstack/react-router";
import CodexHarness from "@/components/CodexHarness";

export const Route = createFileRoute("/codex")({
  component: CodexHarness,
});
