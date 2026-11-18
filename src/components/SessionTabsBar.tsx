import { Plus, X } from "lucide-react";
import { t } from "../lib/i18n";
import { useWorkbenchStore } from "../store/workbenchStore";
import { isMacOS } from "../utils/platform";
import { DbEngineIcon } from "./DbEngineIcon";

export function SessionTabsBar() {
  const {
    sessionTabs,
    activeSessionTabId,
    profiles,
    connectionStates,
    theme,
    language,
    setActiveSessionTab,
    closeSessionTab,
    openConnectionModal,
  } = useWorkbenchStore();

  const isMac = isMacOS();
  const isDark = theme === "dark";

  return (
    <div
      className={`flex shrink-0 items-center overflow-x-auto border-b select-none ${
        isMac ? "h-9 gap-1.5 px-3" : "h-7 gap-1 px-1.5"
      } ${
        isMac
          ? isDark
            ? "border-white/10 bg-[#1c1c1e]"
            : "border-black/10 bg-[#f2f2f7]"
          : isDark
          ? "border-[#333336] bg-[#1b1b1e]"
          : "border-[#d4d8e0] bg-[#e8eef5]"
      }`}
    >
      {sessionTabs.map((session) => {
        const active = session.id === activeSessionTabId;
        const profile =
          profiles.find((p) => p.id === session.profileId) ??
          useWorkbenchStore.getState().transientProfiles[session.profileId];
        const status = connectionStates[session.profileId] ?? "disconnected";
        const displayTitle = profile ? profile.name : session.title;

        if (isMac) {
          return (
            <div
              key={session.id}
              onClick={() => setActiveSessionTab(session.id)}
              className={`group flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1 text-[11px] transition-all ${
                active
                  ? isDark
                    ? "bg-[#2c2c2e] font-medium text-white shadow-sm ring-1 ring-white/12"
                    : "bg-white font-medium text-[#1d1d1f] shadow-sm ring-1 ring-black/8"
                  : isDark
                  ? "text-[#98989d] hover:bg-white/8 hover:text-white"
                  : "text-[#6e6e73] hover:bg-black/5 hover:text-[#1d1d1f]"
              }`}
            >
              <DbEngineIcon
                kind={profile?.dbKind ?? "mysql"}
                size={15}
                connected={status === "connected" || status === "demo"}
              />
              <span className="max-w-[220px] truncate">{displayTitle}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void closeSessionTab(session.id);
                }}
                title={t(language, "disconnectAndCloseTab")}
                className={`rounded-full p-0.5 opacity-55 hover:opacity-100 ${
                  isDark ? "hover:bg-white/15" : "hover:bg-black/10"
                }`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        }

        return (
          <div
            key={session.id}
            onClick={() => setActiveSessionTab(session.id)}
            className={`group mt-[2px] flex h-[24px] cursor-pointer items-center gap-1.5 rounded-t border-t-2 px-2.5 text-[11px] transition-colors ${
              active
                ? isDark
                  ? "border-x border-[#3f3f46] bg-[#252528] font-medium text-white"
                  : "border-x border-[#cbd5e1] bg-white font-medium text-[#1e1e1e]"
                : isDark
                ? "border-transparent bg-[#222225] text-[#a1a1aa] hover:bg-[#2a2a2e]"
                : "border-transparent bg-[#dce3ed] text-[#475569] hover:bg-[#e2e8f0]"
            }`}
            style={{
              borderTopColor: active ? profile?.color || "#2563eb" : "transparent",
            }}
          >
            <DbEngineIcon
              kind={profile?.dbKind ?? "mysql"}
              size={14}
              connected={status === "connected" || status === "demo"}
            />
            <span className="max-w-[200px] truncate">{displayTitle}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void closeSessionTab(session.id);
              }}
              title={t(language, "disconnectAndCloseTab")}
              className="rounded p-0.5 opacity-60 hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => openConnectionModal(null)}
        title={t(language, "newOrSwitchSite")}
        className={
          isMac
            ? `flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] transition-colors ${
                isDark
                  ? "text-[#98989d] hover:bg-white/10 hover:text-white"
                  : "text-[#6e6e73] hover:bg-black/6 hover:text-[#1d1d1f]"
              }`
            : `mt-[2px] flex h-5 items-center gap-1 rounded-t px-2 text-[11px] ${
                isDark
                  ? "text-[#a1a1aa] hover:bg-[#2a2a2e] hover:text-white"
                  : "text-[#475569] hover:bg-[#dce3ed]"
              }`
        }
      >
        <Plus className={isMac ? "h-3.5 w-3.5" : "h-3 w-3"} />
        <span>{t(language, "newOrSwitchSite")}</span>
      </button>
    </div>
  );
}
