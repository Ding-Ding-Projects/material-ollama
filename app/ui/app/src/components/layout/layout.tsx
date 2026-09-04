import { Link } from "@tanstack/react-router";
import { ChatIcon } from "@/components/ChatIcon";
import { isWindowsPlatform } from "@/lib/platform";
import { useState } from "react";
import { IconButton } from "@/components/md3";

let sessionSidebarOpen = false;

export function SidebarLayout({
  sidebar,
  title,
  children,
}: React.PropsWithChildren<{
  sidebar: React.ReactNode;
  title?: string;
}>) {
  const [sidebarOpen, setSidebarOpen] = useState(sessionSidebarOpen);
  const isWindows = isWindowsPlatform();

  const toggleSidebar = () => {
    sessionSidebarOpen = !sidebarOpen;
    setSidebarOpen(sessionSidebarOpen);
  };

  return (
    <div className="flex h-screen w-full overflow-hidden dark:bg-neutral-900">
      <div
        className={`absolute flex mx-2 py-2 z-20 items-center transition-[left] duration-375 text-neutral-500 dark:text-neutral-400 ${sidebarOpen ? (isWindows ? "left-2" : "left-[140px]") : isWindows ? "left-2" : "left-20"}`}
      >
        {/* Was a raw <button> wrapping a bespoke inline SVG with hardcoded
            neutral-100/700 hover colours -- so it ignored the seed colour and
            both themes. The sprite had no sidebar glyph, which is why it stayed
            raw; the generator picks one up from source now, so it uses the real
            Material Symbols mark. */}
        <IconButton
          icon={sidebarOpen ? "left_panel_close" : "dock_to_left"}
          label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          onClick={toggleSidebar}
          onMouseDown={(e) => {
            e.stopPropagation();
          }}
        />
        {!title && (
          <Link
            to="/c/$chatId"
            params={{ chatId: "new" }}
            title="New chat"
            className={`flex ml-1 items-center justify-center rounded-full transition-opacity duration-375 h-9 w-9 hover:bg-neutral-100 dark:hover:bg-neutral-700 ${
              sidebarOpen ? "opacity-0 pointer-events-none" : "opacity-100"
            }`}
          >
            <ChatIcon />
          </Link>
        )}
      </div>
      <div
        className={`flex max-h-screen flex-col transition-[width] duration-300 ${
          sidebarOpen
            ? "w-48 border-r border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950/40"
            : "w-0"
        }`}
      >
        <div
          onDoubleClick={() => window.doubleClick && window.doubleClick()}
          onMouseDown={() => window.drag && window.drag()}
          className="flex-none h-13 w-full"
        ></div>
        {sidebarOpen && sidebar}
      </div>
      <main className="flex min-w-0 flex-1 flex-col transition-all duration-300">
        <div
          className={`h-13 z-10 flex w-full flex-none items-center bg-white dark:bg-neutral-900 ${title ? "" : isWindows ? "xl:hidden" : "xl:fixed xl:bg-transparent xl:dark:bg-transparent"}`}
          onDoubleClick={() => window.doubleClick && window.doubleClick()}
          onMouseDown={() => window.drag && window.drag()}
        >
          {title && (
            <h1
              className={`${sidebarOpen ? "pl-6" : isWindows ? "pl-16" : "pl-36"} transition-[padding-left] duration-300 font-rounded text-md font-medium dark:text-white`}
            >
              {title}
            </h1>
          )}
        </div>
        {children}
      </main>
    </div>
  );
}
