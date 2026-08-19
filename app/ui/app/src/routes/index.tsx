import { createFileRoute, redirect } from "@tanstack/react-router";
import { getSettings } from "@/api";

export const Route = createFileRoute("/")({
  beforeLoad: async ({ context }) => {
    const settingsData = await context.queryClient.ensureQueryData({
      queryKey: ["settings"],
      queryFn: getSettings,
    });

    // "chat" keeps landing straight on a fresh chat, unchanged. Every other
    // (including unset) LastHomeView now defaults to /models, the new home
    // — it used to fall through to the internal /c/launch screen instead.
    if (settingsData?.settings?.LastHomeView === "chat") {
      throw redirect({
        to: "/c/$chatId",
        params: { chatId: "new" },
        mask: {
          to: "/",
        },
      });
    }

    throw redirect({
      to: "/models",
      mask: {
        to: "/",
      },
    });
  },
});
