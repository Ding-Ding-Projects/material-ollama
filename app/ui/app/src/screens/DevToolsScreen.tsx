import { useT } from "@/uh"
import { PlaceholderScreen } from "./PlaceholderScreen"

export default function DevToolsScreen() {
  const t = useT("app")
  return <PlaceholderScreen icon="construction" heading={t("devtools")} />
}
