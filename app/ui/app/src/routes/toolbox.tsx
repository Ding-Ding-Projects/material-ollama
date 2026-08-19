import { createFileRoute } from "@tanstack/react-router";
import ToolboxScreen from "@/screens/ToolboxScreen";

export const Route = createFileRoute("/toolbox")({
  component: ToolboxScreen,
});
