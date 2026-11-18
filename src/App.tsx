import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Database,
  Eye,
  FileCode2,
  ListOrdered,
  PanelRight,
  Plus,
  RefreshCw,
  Sparkles,
  Table2,
  Terminal,
} from "lucide-react";
import { ConnectionModal } from "./components/ConnectionModal";
import { ConnectionTree } from "./components/ConnectionTree";
import { RightInspectorPane } from "./components/RightInspectorPane";
import { WorkspaceTabs } from "./components/WorkspaceTabs";
import { isTauriRuntime } from "./lib/tauri-api";
import { useWorkbenchStore } from "./store/workbenchStore";
import type { DbKind } from "./types/database";

export default function App() {
  const {
    profiles,
    connectionStates,
    selectedScope,
    rightPaneOpen,
    connectionModalOpen,
    editingProfile,
    statusMessage,
    lastLatencyMs,
    loadProfiles,
    openConnectionModal,
    closeConnectionModal,
    saveProfile,
    connectProfile,
    selectScope,
    openQueryTab,
    loadScopeObjects,
    setRightPaneOpen,
  } = useWorkbenchStore();

  const [leftWidth, setLeftWidth] = useState(300);
  const [rightWidth, setRightWidth] = useState(300);
  const [connDropdownOpen, setConnDropdownOpen] = useState(false);
  const [defaultModalKind, setDefaultModalKind] = useState<DbKind>("mysql");

  const draggingRef = useRef<"left" | "right" | null>(null);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      if (draggingRef.current === "left") {
        setLeftWidth(Math.max(200, Math.min(520, e.clientX)));
      } else {
        setRightWidth(Math.max(220, Math.min(520, window.innerWidth - e.clientX)));
      }
    };
    const handleMouseUp = () => {
      draggingRef.current = null;
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const selectedProfile =
    profiles.find((p) => p.id === selectedScope?.profileId) ?? profiles[0] ?? null;

  const activeCount = Object.values(connectionStates).filter(
    (s) => s === "connected" || s === "demo"
  ).length;

  const openNewConnection = (kind: DbKind) => {
    setDefaultModalKind(kind);
    setConnDropdownOpen(false);
    openConnectionModal(null);
  };

  return (
    <div className="flex h-screen w-screen flex-col bg-[#f5f6f8] text-[#1f2329] text-xs">
      {/* Top MenuBar (25px per navicat-ui-spec.md) */}
      <header className="flex h-[25px] items-center gap-4 border-b border-[#dcdfe6] bg-[#f8f9fb] px-3 text-[11px] text-[#3c4043]">
        <span className="font-semibold text-[#111827]">SqlCraft</span>
        <button
          type="button"
          onClick={() => openNewConnection("mysql")}
          className="hover:text-[#1d4ed8]"
        >
          檔案
        </button>
        <button
          type="button"
          onClick={() => setRightPaneOpen(!rightPaneOpen)}
          className="hover:text-[#1d4ed8]"
        >
          檢視
        </button>
        <button
          type="button"
          onClick={() => openNewConnection("postgres")}
          className="hover:text-[#1d4ed8]"
        >
          連線
        </button>
        <span className="text-[#94a3b8]">收藏</span>
        <button
          type="button"
          onClick={() => openQueryTab()}
          className="hover:text-[#1d4ed8]"
        >
          工具
        </button>
        <span className="text-[#94a3b8]">視窗</span>
        <span className="text-[#94a3b8]">說明</span>

        <span className="ml-auto rounded bg-[#e8eefc] px-2 py-0.5 text-[10px] font-medium text-[#1d4ed8]">
          {isTauriRuntime() ? "Tauri 2.0 Native" : "Web Preview"}
        </span>
      </header>

      {/* Main ActionToolBar (63px total = 62px body + 1px bottom border per navicat-ui-spec.md) */}
      <div className="flex h-[63px] items-center justify-between border-b border-[#d4d8e0] bg-white px-2.5">
        {/* Left Primary ActionToolBar */}
        <div className="flex items-center gap-1">
          <div className="relative">
            <button
              type="button"
              onClick={() => setConnDropdownOpen((o) => !o)}
              className="flex items-center gap-1 rounded px-2.5 py-1.5 hover:bg-[#eef2f8]"
            >
              <span className="flex flex-col items-center">
                <Plus className="h-5 w-5 text-[#2563eb]" />
                <span className="mt-1 text-[11px]">連線</span>
              </span>
              <ChevronDown className="h-3 w-3 text-[#64748b]" />
            </button>

            {connDropdownOpen && (
              <div className="absolute left-0 top-full z-40 mt-1 w-44 rounded border border-[#cbd5e1] bg-white py-1 shadow-lg text-[11px]">
                <button
                  type="button"
                  onClick={() => openNewConnection("mysql")}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#eff6ff]"
                >
                  <Database className="h-3.5 w-3.5 text-[#2563eb]" />
                  <span>MySQL...</span>
                </button>
                <button
                  type="button"
                  onClick={() => openNewConnection("mariadb")}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#eff6ff]"
                >
                  <Database className="h-3.5 w-3.5 text-[#0d9488]" />
                  <span>MariaDB...</span>
                </button>
                <button
                  type="button"
                  onClick={() => openNewConnection("postgres")}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#eff6ff]"
                >
                  <Database className="h-3.5 w-3.5 text-[#4f46e5]" />
                  <span>PostgreSQL...</span>
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => openQueryTab()}
            className="flex flex-col items-center rounded px-3 py-1.5 hover:bg-[#eef2f8]"
          >
            <Terminal className="h-5 w-5 text-[#059669]" />
            <span className="mt-1 text-[11px]">新增查詢</span>
          </button>

          <button
            type="button"
            disabled={!selectedScope?.database}
            onClick={() =>
              selectedScope &&
              void selectScope({ ...selectedScope, category: "tables", objectName: null })
            }
            className="flex flex-col items-center rounded px-3 py-1.5 hover:bg-[#eef2f8] disabled:opacity-40"
          >
            <Table2 className="h-5 w-5 text-[#2563eb]" />
            <span className="mt-1 text-[11px]">資料表</span>
          </button>

          <button
            type="button"
            disabled={!selectedScope?.database}
            onClick={() =>
              selectedScope &&
              void selectScope({ ...selectedScope, category: "views", objectName: null })
            }
            className="flex flex-col items-center rounded px-3 py-1.5 hover:bg-[#eef2f8] disabled:opacity-40"
          >
            <Eye className="h-5 w-5 text-[#0891b2]" />
            <span className="mt-1 text-[11px]">檢視</span>
          </button>

          <button
            type="button"
            disabled={!selectedScope?.database}
            onClick={() =>
              selectedScope &&
              void selectScope({ ...selectedScope, category: "routines", objectName: null })
            }
            className="flex flex-col items-center rounded px-3 py-1.5 hover:bg-[#eef2f8] disabled:opacity-40"
          >
            <FileCode2 className="h-5 w-5 text-[#7c3aed]" />
            <span className="mt-1 text-[11px]">函式</span>
          </button>

          <button
            type="button"
            disabled={!selectedScope?.database || selectedProfile?.dbKind !== "postgres"}
            onClick={() =>
              selectedScope &&
              void selectScope({ ...selectedScope, category: "sequences", objectName: null })
            }
            className="flex flex-col items-center rounded px-3 py-1.5 hover:bg-[#eef2f8] disabled:opacity-40"
          >
            <ListOrdered className="h-5 w-5 text-[#d97706]" />
            <span className="mt-1 text-[11px]">序列</span>
          </button>

          <button
            type="button"
            disabled={!selectedScope?.database}
            onClick={() =>
              selectedScope?.database &&
              void loadScopeObjects(
                selectedScope.profileId,
                selectedScope.database,
                selectedScope.schema
              )
            }
            className="flex flex-col items-center rounded px-3 py-1.5 hover:bg-[#eef2f8] disabled:opacity-40"
          >
            <RefreshCw className="h-5 w-5 text-[#475569]" />
            <span className="mt-1 text-[11px]">重新整理</span>
          </button>
        </div>

        {/* Right 160px Auxiliary Toolbar Area (72px + 88px per navicat-ui-spec.md) */}
        <div className="flex w-[160px] items-center justify-end gap-1.5">
          <button
            type="button"
            disabled={!selectedProfile}
            onClick={() =>
              selectedProfile && void connectProfile(selectedProfile.id, true)
            }
            title="以離線範例結構開啟選取連線"
            className="flex h-9 w-[72px] flex-col items-center justify-center rounded border border-[#e9d5ff] bg-[#faf5ff] text-[10px] font-medium text-[#6d28d9] hover:bg-[#f3e8ff] disabled:opacity-40"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>範例預覽</span>
          </button>

          <button
            type="button"
            onClick={() => setRightPaneOpen(!rightPaneOpen)}
            title="切換右側物件資訊面板"
            className={`flex h-9 w-[80px] flex-col items-center justify-center rounded border text-[10px] font-medium ${
              rightPaneOpen
                ? "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]"
                : "border-[#cbd5e1] bg-white text-[#475569]"
            }`}
          >
            <PanelRight className="h-3.5 w-3.5" />
            <span>資訊面板</span>
          </button>
        </div>
      </div>

      {/* Main 3-Column Body with 3px Splitters */}
      <div className="flex min-h-0 flex-1">
        <ConnectionTree width={leftWidth} />

        {/* Left 3px Splitter */}
        <div
          onMouseDown={() => {
            draggingRef.current = "left";
          }}
          className="w-[3px] flex-shrink-0 cursor-col-resize bg-[#e2e8f0] hover:bg-[#60a5fa] transition-colors"
        />

        <WorkspaceTabs />

        {rightPaneOpen && (
          <>
            {/* Right 3px Splitter */}
            <div
              onMouseDown={() => {
                draggingRef.current = "right";
              }}
              className="w-[3px] flex-shrink-0 cursor-col-resize bg-[#e2e8f0] hover:bg-[#60a5fa] transition-colors"
            />
            <RightInspectorPane width={rightWidth} />
          </>
        )}
      </div>

      {/* Bottom StatusBar (22px, 4 panes matching navicat-ui-spec.md) */}
      <footer className="flex h-[22px] items-center border-t border-[#d4d8e0] bg-[#f1f3f6] text-[10px] text-[#4b5563]">
        <div
          style={{ width: leftWidth }}
          className="flex-shrink-0 border-r border-[#d4d8e0] px-2 truncate"
        >
          連線：{profiles.length} 筆（作用中 {activeCount}）
        </div>
        <div className="min-w-0 flex-1 border-r border-[#d4d8e0] px-2 truncate">
          {statusMessage}
        </div>
        <div className="w-[69px] flex-shrink-0 border-r border-[#d4d8e0] px-2 text-center font-mono">
          {lastLatencyMs != null ? `${lastLatencyMs}ms` : "-"}
        </div>
        <div className="w-[52px] flex-shrink-0 px-2 text-center">
          {selectedProfile?.encoding || "UTF-8"}
        </div>
      </footer>

      <ConnectionModal
        open={connectionModalOpen}
        editingProfile={editingProfile}
        defaultDbKind={defaultModalKind}
        onClose={closeConnectionModal}
        onSave={async (profile) => {
          await saveProfile(profile);
        }}
      />
    </div>
  );
}
