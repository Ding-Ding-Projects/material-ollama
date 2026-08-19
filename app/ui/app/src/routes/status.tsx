import { createFileRoute } from "@tanstack/react-router";
import StatusScreen from "@/screens/StatusScreen";

export const Route = createFileRoute("/status")({
  component: StatusScreen,
});
