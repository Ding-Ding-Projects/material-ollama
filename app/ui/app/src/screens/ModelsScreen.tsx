import { useT } from "@/uh"
import { PlaceholderScreen } from "./PlaceholderScreen"

/**
 * The new home (`/`  now redirects here by default). A real Model Store
 * lane already has a backend (hardware fit, pull queue) and its own "models"
 * dictionary namespace ready — this screen only claims the route and the
 * honest not-built-yet state; building the real UI is that lane's job.
 */
export default function ModelsScreen() {
  const t = useT("models")
  return <PlaceholderScreen icon="storefront" heading={t("modelStore")} subheading={t("modelStoreSub")} />
}
