import { createFileRoute } from "@tanstack/react-router";
import ModelsScreen from "@/screens/ModelsScreen";

export const Route = createFileRoute("/models")({
  component: ModelsScreen,
});
