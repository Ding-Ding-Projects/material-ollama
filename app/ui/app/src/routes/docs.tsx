import { createFileRoute } from "@tanstack/react-router";
import DocsScreen from "@/screens/DocsScreen";

export const Route = createFileRoute("/docs")({
  component: DocsScreen,
});
