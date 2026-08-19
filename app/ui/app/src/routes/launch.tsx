import { createFileRoute } from "@tanstack/react-router";
import LaunchScreen from "@/screens/LaunchScreen";

export const Route = createFileRoute("/launch")({
  component: LaunchScreen,
});
