import { useT } from "@/uh"
import { PlaceholderScreen } from "./PlaceholderScreen"

export default function ToolboxScreen() {
  const t = useT("tools")
  return <PlaceholderScreen icon="home_repair_service" heading={t("toolboxTitle")} subheading={t("toolboxSub")} />
}
