import { useT } from "@/uh"
import { PlaceholderScreen } from "./PlaceholderScreen"

export default function StatusScreen() {
  const t = useT("tools")
  return <PlaceholderScreen icon="monitor_heart" heading={t("statusTitle")} subheading={t("statusSub")} />
}
