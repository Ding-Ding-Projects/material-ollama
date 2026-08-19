import { useT } from "@/uh"
import { PlaceholderScreen } from "./PlaceholderScreen"

export default function DocsScreen() {
  const t = useT("tools")
  return <PlaceholderScreen icon="menu_book" heading={t("docsTitle")} subheading={t("docsOffline")} />
}
