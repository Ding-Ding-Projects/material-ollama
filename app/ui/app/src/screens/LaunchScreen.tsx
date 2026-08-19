import { useT } from "@/uh"
import { PlaceholderScreen } from "./PlaceholderScreen"

/**
 * The new top-level `/launch` destination from the nav rail. Distinct from
 * the pre-existing `/c/launch` (chatId "launch") screen that CodexHarness
 * and others still link to — that one keeps rendering LaunchCommands
 * unchanged. This is a fresh placeholder, per the lane brief.
 */
export default function LaunchScreen() {
  const t = useT("app")
  return <PlaceholderScreen icon="rocket_launch" heading={t("launchTitle")} subheading={t("launchSub")} />
}
