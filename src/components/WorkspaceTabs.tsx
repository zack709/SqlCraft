import {
  Edit3,
  Table2,
  Terminal,
  X,
} from "lucide-react";
import { useWorkbenchStore } from "../store/workbenchStore";
import { isMacOS } from "../utils/platform";
import { DataViewerGrid } from "./DataViewerGrid";
import { ObjectListPane } from "./ObjectListPane";
import { QueryEditorPane } from "./QueryEditorPane";
import { TableDesigner } from "./TableDesigner";

export function WorkspaceTabs() {
  const {
    tabs,
    activeTabId,
    theme,
    language,
    setActiveTab,
    closeTab,
  } = useWorkbenchStore();

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  if (!activeTab) return null;

  const isMac = isMacOS();
  const isDark = theme === "dark";

  return (
    <main className={`flex min-w-0 flex-1 flex-col ${isDark ? "bg-[#1e1e20]" : "bg-white"}`}>
      {/* Tab Strip: macOS pill tabs vs Windows/Linux Navicat smart tabs */}
      <div
        className={
          isMac
            ? `flex h-9 items-center gap-1.5 overflow-x-auto border-b px-3 select-none ${
                isDark
                  ? "border-white/10 bg-[#1c1c1e]"
                  : "border-black/10 bg-[#f2f2f7]"
              }`
            : `flex h-[30px] items-end overflow-x-auto border-b-4 border-[#2563eb] px-1.5 select-none ${
                isDark ? "bg-[#1b1b1e]" : "bg-[#eef2f6]"
              }`
        }
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab.id;
          if (isMac) {
            return (
              <div
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`group flex max-w-[210px] cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1 text-[11px] transition-all ${
                  isActive
                    ? isDark
                      ? "bg-[#2c2c2e] font-medium text-white shadow-sm ring-1 ring-white/12"
                      : "bg-white font-medium text-[#1d1d1f] shadow-sm ring-1 ring-black/8"
                    : isDark
                    ? "text-[#98989d] hover:bg-white/8 hover:text-white"
                    : "text-[#6e6e73] hover:bg-black/5 hover:text-[#1d1d1f]"
                }`}
              >
                {tab.kind === "objects" && (
                  <Table2
                    className={`h-3 w-3 flex-shrink-0 ${
                      isActive ? (isDark ? "text-[#38bdf8]" : "text-[#007aff]") : ""
                    }`}
                  />
                )}
                {tab.kind === "table-data" && (
                  <Table2
                    className={`h-3 w-3 flex-shrink-0 ${
                      isActive ? (isDark ? "text-[#38bdf8]" : "text-[#007aff]") : ""
                    }`}
                  />
                )}
                {tab.kind === "table-design" && (
                  <Edit3
                    className={`h-3 w-3 flex-shrink-0 ${
                      isActive ? "text-[#f59e0b]" : ""
                    }`}
                  />
                )}
                {tab.kind === "query" && (
                  <Terminal
                    className={`h-3 w-3 flex-shrink-0 ${
                      isActive ? "text-[#10b981]" : ""
                    }`}
                  />
                )}
                <span className="truncate">
                  {tab.kind === "objects"
                    ? language === "en"
                      ? "Objects"
                      : "物件"
                    : tab.title}
                </span>
                {tab.closable && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.id);
                    }}
                    className={`ml-0.5 rounded-full p-0.5 opacity-55 hover:opacity-100 ${
                      isDark ? "hover:bg-white/15" : "hover:bg-black/10"
                    }`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          }

          return (
            <div
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`mr-1 flex h-[24px] max-w-[200px] cursor-pointer items-center gap-1.5 rounded-t px-2.5 text-[11px] transition ${
                isActive
                  ? "bg-[#2563eb] font-medium text-white"
                  : isDark
                  ? "bg-[#27272a] text-[#a1a1aa] hover:bg-[#3f3f46] hover:text-white"
                  : "bg-[#dde3ec] text-[#334155] hover:bg-[#cfd7e3]"
              }`}
            >
              {tab.kind === "objects" && <Table2 className="h-3 w-3 flex-shrink-0" />}
              {tab.kind === "table-data" && <Table2 className="h-3 w-3 flex-shrink-0" />}
              {tab.kind === "table-design" && <Edit3 className="h-3 w-3 flex-shrink-0" />}
              {tab.kind === "query" && <Terminal className="h-3 w-3 flex-shrink-0" />}
              <span className="truncate">
                {tab.kind === "objects"
                  ? language === "en"
                    ? "Objects"
                    : "物件"
                  : tab.title}
              </span>
              {tab.closable && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  className={`ml-1 rounded p-0.5 ${
                    isActive ? "hover:bg-white/20" : "hover:bg-black/10"
                  }`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* PanelDockHost */}
      <div className="flex min-h-0 flex-1 flex-col">
        {activeTab.kind === "objects" && <ObjectListPane />}

        {activeTab.kind === "table-data" && <DataViewerGrid tab={activeTab} />}

        {activeTab.kind === "table-design" && <TableDesigner tab={activeTab} />}

        {activeTab.kind === "query" && <QueryEditorPane tab={activeTab} />}
      </div>
    </main>
  );
}
