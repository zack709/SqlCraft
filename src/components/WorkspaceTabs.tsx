import {
  Edit3,
  Table2,
  Terminal,
  X,
} from "lucide-react";
import { useWorkbenchStore } from "../store/workbenchStore";
import { DataViewerGrid } from "./DataViewerGrid";
import { ObjectListPane } from "./ObjectListPane";
import { QueryEditorPane } from "./QueryEditorPane";
import { TableDesigner } from "./TableDesigner";

export function WorkspaceTabs() {
  const {
    tabs,
    activeTabId,
    setActiveTab,
    closeTab,
  } = useWorkbenchStore();

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-white">
      {/* TNavicatRkSmartTabs (30px total: 26px tabs + 4px accent bar per navicat-ui-spec.md) */}
      <div className="flex h-[30px] items-end border-b-4 border-[#2563eb] bg-[#eef2f6] px-1.5 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab.id;
          return (
            <div
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`mr-1 flex h-[24px] max-w-[200px] cursor-pointer items-center gap-1.5 rounded-t px-2.5 text-[11px] transition ${
                isActive
                  ? "bg-[#2563eb] font-medium text-white"
                  : "bg-[#dde3ec] text-[#334155] hover:bg-[#cfd7e3]"
              }`}
            >
              {tab.kind === "objects" && <Table2 className="h-3 w-3 flex-shrink-0" />}
              {tab.kind === "table-data" && <Table2 className="h-3 w-3 flex-shrink-0" />}
              {tab.kind === "table-design" && <Edit3 className="h-3 w-3 flex-shrink-0" />}
              {tab.kind === "query" && <Terminal className="h-3 w-3 flex-shrink-0" />}
              <span className="truncate">{tab.title}</span>
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
