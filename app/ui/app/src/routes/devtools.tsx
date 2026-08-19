import { createFileRoute } from "@tanstack/react-router";
import DevToolsScreen from "@/screens/DevToolsScreen";

export const Route = createFileRoute("/devtools")({
  component: DevToolsScreen,
});
