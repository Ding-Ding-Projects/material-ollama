import { useT } from "@/uh"
import { PlaceholderScreen } from "./PlaceholderScreen"

export default function StatusScreen() {
  const t = useT("tools")
  return (
    <div className="h-full" data-capture-id="status" data-capture-ready="true">
      <PlaceholderScreen icon="monitor_heart" heading={t("statusTitle")} subheading={t("statusSub")} />
    </div>
  )
}
