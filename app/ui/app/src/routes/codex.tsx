import { createFileRoute } from "@tanstack/react-router";
import CodexScreen from "@/screens/CodexScreen";

export const Route = createFileRoute("/codex")({
  component: CodexScreen,
});
