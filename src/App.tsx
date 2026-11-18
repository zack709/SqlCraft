import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  ChevronDown,
  Database,
  Eye,
  FileCode2,
  ListOrdered,
  Moon,
  PanelRight,
  RefreshCw,
  Settings,
  Sun,
  Table2,
  Terminal,
} from "lucide-react";
import { ConnectionModal } from "./components/ConnectionModal";
import { ConnectionTree } from "./components/ConnectionTree";
import { DbEngineIcon } from "./components/DbEngineIcon";
import { RightInspectorPane } from "./components/RightInspectorPane";
import { SessionTabsBar } from "./components/SessionTabsBar";
import { SettingsModal } from "./components/SettingsModal";
import { WorkspaceTabs } from "./components/WorkspaceTabs";
import { isTauriRuntime } from "./lib/tauri-api";
import { t } from "./lib/i18n";
import { useWorkbenchStore } from "./store/workbenchStore";
import type { DbKind } from "./types/database";
import { isMacOS } from "./utils/platform";

export default function App() {
  const {
    profiles,
    connectionStates,
    selectedScope,
    rightPaneOpen,
    connectionModalOpen,
    editingProfile,
    theme,
    language,
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
    toggleTheme,
    setSettingsModalOpen,
  } = useWorkbenchStore();

  const [leftWidth, setLeftWidth] = useState(300);
  const [rightWidth, setRightWidth] = useState(300);
  const [connDropdownOpen, setConnDropdownOpen] = useState(false);
  const [winMenuOpen, setWinMenuOpen] = useState<string | null>(null);
  const [defaultModalKind, setDefaultModalKind] = useState<DbKind>("mysql");

  const draggingRef = useRef<"left" | "right" | null>(null);
  const connDropdownRef = useRef<HTMLDivElement>(null);
  const winMenuRef = useRef<HTMLDivElement>(null);

  const isMac = isMacOS();
  const isDark = theme === "dark";

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  // Global keyboard shortcut for Preferences (Cmd+, / Ctrl+,)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        setSettingsModalOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setSettingsModalOpen]);

  // Listen for native OS menu bar events (e.g. macOS global menu)
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let unlisten: (() => void) | undefined;

    void listen<string>("menu://action", (event) => {
      const action = event.payload;
      const store = useWorkbenchStore.getState();
      const scope = store.selectedScope;
      const targetProfile =
        store.getProfileById(scope?.profileId) ?? store.profiles[0] ?? null;

      switch (action) {
        case "new_mysql":
          setDefaultModalKind("mysql");
          setConnDropdownOpen(false);
          store.openConnectionModal(null);
          break;
        case "new_mariadb":
          setDefaultModalKind("mariadb");
          setConnDropdownOpen(false);
          store.openConnectionModal(null);
          break;
        case "new_postgres":
          setDefaultModalKind("postgres");
          setConnDropdownOpen(false);
          store.openConnectionModal(null);
          break;
        case "new_query":
          store.openQueryTab(
            targetProfile?.id ?? null,
            scope?.database ?? targetProfile?.initialDatabase ?? null,
            scope?.schema ?? null
          );
          break;
        case "preferences":
          store.setSettingsModalOpen(true);
          break;
        case "toggle_theme":
          store.toggleTheme();
          break;
        case "view_tables":
          if (scope?.database) {
            void store.selectScope({ ...scope, category: "tables", objectName: null });
          }
          break;
        case "view_views":
          if (scope?.database) {
            void store.selectScope({ ...scope, category: "views", objectName: null });
          }
          break;
        case "view_routines":
          if (scope?.database) {
            void store.selectScope({ ...scope, category: "routines", objectName: null });
          }
          break;
        case "toggle_inspector":
          store.setRightPaneOpen(!store.rightPaneOpen);
          break;
        case "refresh":
          if (scope?.database) {
            void store.loadScopeObjects(scope.profileId, scope.database, scope.schema);
          } else if (targetProfile) {
            void store.loadDatabases(targetProfile.id);
          }
          break;
        case "connect_selected":
          if (targetProfile) {
            void store.connectProfile(targetProfile.id, false);
          }
          break;
        case "demo_selected":
          if (targetProfile) {
            void store.connectProfile(targetProfile.id, true);
          }
          break;
        default:
          break;
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, []);

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
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (connDropdownRef.current && !connDropdownRef.current.contains(target)) {
        setConnDropdownOpen(false);
      }
      if (winMenuRef.current && !winMenuRef.current.contains(target)) {
        setWinMenuOpen(null);
      }
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("mousedown", handleOutsideClick);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  const selectedProfile =
    useWorkbenchStore.getState().getProfileById(selectedScope?.profileId) ??
    profiles[0] ??
    null;

  const activeCount = Object.values(connectionStates).filter(
    (s) => s === "connected" || s === "demo"
  ).length;

  const openNewConnection = (kind: DbKind) => {
    setDefaultModalKind(kind);
    setConnDropdownOpen(false);
    setWinMenuOpen(null);
    openConnectionModal(null);
  };

  const scopeBadgeText = selectedProfile
    ? [
        selectedProfile.name,
        selectedScope?.database,
        selectedScope?.schema,
      ]
        .filter(Boolean)
        .join(" / ")
    : language === "en"
    ? "No connection selected"
    : "尚未選擇連線";

  const toolbarBtnCls = isMac
    ? `flex flex-col items-center rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40 ${
        isDark
          ? "text-[#e5e5ea] hover:bg-white/10 active:bg-white/15"
          : "text-[#1d1d1f] hover:bg-black/6 active:bg-black/10"
      }`
    : `flex flex-col items-center rounded px-3 py-1.5 disabled:opacity-40 ${
        isDark
          ? "text-[#e0e0e0] hover:bg-[#333337]"
          : "hover:bg-[#eef2f8]"
      }`;

  return (
    <div
      className={`flex h-screen w-screen flex-col text-xs ${
        isMac
          ? isDark
            ? "bg-[#1c1c1e] text-[#f5f5f7]"
            : "bg-[#f5f5f7] text-[#1d1d1f]"
          : isDark
          ? "bg-[#18181b] text-[#e4e4e7]"
          : "bg-[#f5f6f8] text-[#1f2329]"
      }`}
    >
      {/* Top Window Chrome: macOS Overlay TitleBar vs Windows/Linux MenuBar */}
      {isMac ? (
        <header
          data-tauri-drag-region
          className={`flex h-[38px] flex-shrink-0 items-center justify-between border-b pl-[78px] pr-3 select-none ${
            isDark
              ? "border-white/10 bg-[#242426] text-[#f5f5f7]"
              : "border-black/10 bg-[#ececed] text-[#1d1d1f]"
          }`}
        >
          <div data-tauri-drag-region className="flex items-center gap-2">
            <span
              className={`pointer-events-none flex items-center gap-1.5 text-sm font-semibold tracking-tight ${
                isDark ? "text-[#38bdf8]" : "text-[#0066cc]"
              }`}
            >
              <Database className="h-4 w-4" />
              SqlCraft
            </span>
          </div>

          <div
            data-tauri-drag-region
            className={`hidden sm:flex items-center gap-1.5 rounded-full px-3 py-0.5 text-[11px] ${
              isDark
                ? "bg-white/8 text-[#d1d1d6]"
                : "bg-black/5 text-[#48484a]"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                selectedProfile &&
                (connectionStates[selectedProfile.id] === "connected" ||
                  connectionStates[selectedProfile.id] === "demo")
                  ? "bg-[#30d158]"
                  : "bg-[#8e8e93]"
              }`}
            />
            <span className="pointer-events-none max-w-[320px] truncate font-medium">
              {scopeBadgeText}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setRightPaneOpen(!rightPaneOpen)}
              title="切換右側物件資訊面板 (⌘I)"
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-all ${
                rightPaneOpen
                  ? isDark
                    ? "bg-[#0a84ff] text-white shadow-sm"
                    : "bg-white text-[#0066cc] shadow-sm ring-1 ring-black/8"
                  : isDark
                  ? "bg-white/10 text-[#d1d1d6] hover:bg-white/15"
                  : "bg-black/6 text-[#3a3a3c] hover:bg-black/10"
              }`}
            >
              <PanelRight className="h-3.5 w-3.5" />
              <span>{t(language, "inspector")}</span>
            </button>

            <button
              type="button"
              onClick={() => setSettingsModalOpen(true)}
              title="偏好設定 (⌘,)"
              className={`rounded-md p-1.5 transition-colors ${
                isDark
                  ? "bg-white/10 text-[#d1d1d6] hover:bg-white/15 hover:text-white"
                  : "bg-black/6 text-[#3a3a3c] hover:bg-black/10 hover:text-[#1d1d1f]"
              }`}
            >
              <Settings className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              title={isDark ? "切換為淺色主題 (Light Mode)" : "切換為深色主題 (Dark Mode)"}
              className={`rounded-md p-1.5 transition-colors ${
                isDark
                  ? "bg-white/10 text-amber-300 hover:bg-white/15"
                  : "bg-black/6 text-slate-700 hover:bg-black/10"
              }`}
            >
              {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>
          </div>
        </header>
      ) : (
        <header
          ref={winMenuRef}
          className={`relative flex h-[30px] flex-shrink-0 items-center gap-1 border-b px-2.5 text-[11px] select-none ${
            isDark
              ? "border-[#333336] bg-[#202022] text-[#dcdcdc]"
              : "border-[#dcdfe6] bg-[#f8f9fb] text-[#3c4043]"
          }`}
        >
          <span
            className={`mr-2 flex items-center gap-1 font-semibold ${
              isDark ? "text-[#38bdf8]" : "text-[#111827]"
            }`}
          >
            <Database className="h-3.5 w-3.5 text-[#2563eb]" />
            SqlCraft
          </span>

          <div className="relative">
            <button
              type="button"
              onClick={() => setWinMenuOpen(winMenuOpen === "file" ? null : "file")}
              className={`rounded px-2 py-0.5 hover:bg-[#e8eefc] hover:text-[#1d4ed8] ${
                winMenuOpen === "file" ? "bg-[#dbeafe] text-[#1d4ed8]" : ""
              }`}
            >
              檔案
            </button>
            {winMenuOpen === "file" && (
              <div className="absolute left-0 top-full z-50 mt-0.5 w-48 rounded border border-[#cbd5e1] bg-white py-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => openNewConnection("mysql")}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-[#eff6ff]"
                >
                  <span>新增 MySQL 連線...</span>
                  <span className="text-[10px] text-[#94a3b8]">Ctrl+N</span>
                </button>
                <button
                  type="button"
                  onClick={() => openNewConnection("mariadb")}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-[#eff6ff]"
                >
                  <span>新增 MariaDB 連線...</span>
                </button>
                <button
                  type="button"
                  onClick={() => openNewConnection("postgres")}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-[#eff6ff]"
                >
                  <span>新增 PostgreSQL 連線...</span>
                </button>
                <div className="my-1 border-t border-[#e2e8f0]" />
                <button
                  type="button"
                  onClick={() => {
                    setWinMenuOpen(null);
                    openQueryTab();
                  }}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-[#eff6ff]"
                >
                  <span>新增查詢分頁</span>
                  <span className="text-[10px] text-[#94a3b8]">Ctrl+T</span>
                </button>
                <div className="my-1 border-t border-[#e2e8f0]" />
                <button
                  type="button"
                  onClick={() => {
                    setWinMenuOpen(null);
                    setSettingsModalOpen(true);
                  }}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-[#eff6ff]"
                >
                  <span>偏好設定...</span>
                  <span className="text-[10px] text-[#94a3b8]">Ctrl+,</span>
                </button>
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setWinMenuOpen(winMenuOpen === "edit" ? null : "edit")}
              className={`rounded px-2 py-0.5 hover:bg-[#e8eefc] hover:text-[#1d4ed8] ${
                winMenuOpen === "edit" ? "bg-[#dbeafe] text-[#1d4ed8]" : ""
              }`}
            >
              編輯
            </button>
            {winMenuOpen === "edit" && (
              <div className="absolute left-0 top-full z-50 mt-0.5 w-48 rounded border border-[#cbd5e1] bg-white py-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setWinMenuOpen(null);
                    document.execCommand("cut");
                  }}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-[#eff6ff]"
                >
                  <span>剪下</span>
                  <span className="text-[10px] text-[#94a3b8]">Ctrl+X</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWinMenuOpen(null);
                    document.execCommand("copy");
                  }}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-[#eff6ff]"
                >
                  <span>複製</span>
                  <span className="text-[10px] text-[#94a3b8]">Ctrl+C</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWinMenuOpen(null);
                    void navigator.clipboard?.readText().then((text) => {
                      if (text) document.execCommand("insertText", false, text);
                    }).catch(() => {
                      document.execCommand("paste");
                    });
                  }}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-[#eff6ff]"
                >
                  <span>貼上</span>
                  <span className="text-[10px] text-[#94a3b8]">Ctrl+V</span>
                </button>
                <div className="my-1 border-t border-[#e2e8f0]" />
                <button
                  type="button"
                  onClick={() => {
                    setWinMenuOpen(null);
                    document.execCommand("selectAll");
                  }}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-[#eff6ff]"
                >
                  <span>全選</span>
                  <span className="text-[10px] text-[#94a3b8]">Ctrl+A</span>
                </button>
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setWinMenuOpen(winMenuOpen === "view" ? null : "view")}
              className={`rounded px-2 py-0.5 hover:bg-[#e8eefc] hover:text-[#1d4ed8] ${
                winMenuOpen === "view" ? "bg-[#dbeafe] text-[#1d4ed8]" : ""
              }`}
            >
              檢視
            </button>
            {winMenuOpen === "view" && (
              <div className="absolute left-0 top-full z-50 mt-0.5 w-48 rounded border border-[#cbd5e1] bg-white py-1 shadow-lg">
                <button
                  type="button"
                  disabled={!selectedScope?.database}
                  onClick={() => {
                    setWinMenuOpen(null);
                    if (selectedScope) {
                      void selectScope({ ...selectedScope, category: "tables", objectName: null });
                    }
                  }}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-[#eff6ff] disabled:opacity-40"
                >
                  <span>資料表</span>
                </button>
                <button
                  type="button"
                  disabled={!selectedScope?.database}
                  onClick={() => {
                    setWinMenuOpen(null);
                    if (selectedScope) {
                      void selectScope({ ...selectedScope, category: "views", objectName: null });
                    }
                  }}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-[#eff6ff] disabled:opacity-40"
                >
                  <span>檢視表</span>
                </button>
                <button
                  type="button"
                  disabled={!selectedScope?.database}
                  onClick={() => {
                    setWinMenuOpen(null);
                    if (selectedScope) {
                      void selectScope({ ...selectedScope, category: "routines", objectName: null });
                    }
                  }}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-[#eff6ff] disabled:opacity-40"
                >
                  <span>函式與程序</span>
                </button>
                <div className="my-1 border-t border-[#e2e8f0]" />
                <button
                  type="button"
                  onClick={() => {
                    setWinMenuOpen(null);
                    setRightPaneOpen(!rightPaneOpen);
                  }}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-[#eff6ff]"
                >
                  <span>{rightPaneOpen ? "隱藏右側資訊面板" : "顯示右側資訊面板"}</span>
                  <span className="text-[10px] text-[#94a3b8]">Ctrl+I</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWinMenuOpen(null);
                    toggleTheme();
                  }}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-[#eff6ff]"
                >
                  <span>{isDark ? "切換為淺色主題" : "切換為深色主題"}</span>
                </button>
                <div className="my-1 border-t border-[#e2e8f0]" />
                <button
                  type="button"
                  disabled={!selectedScope?.database}
                  onClick={() => {
                    setWinMenuOpen(null);
                    if (selectedScope?.database) {
                      void loadScopeObjects(
                        selectedScope.profileId,
                        selectedScope.database,
                        selectedScope.schema
                      );
                    }
                  }}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-[#eff6ff] disabled:opacity-40"
                >
                  <span>重新整理物件</span>
                  <span className="text-[10px] text-[#94a3b8]">Ctrl+R</span>
                </button>
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setWinMenuOpen(winMenuOpen === "conn" ? null : "conn")}
              className={`rounded px-2 py-0.5 hover:bg-[#e8eefc] hover:text-[#1d4ed8] ${
                winMenuOpen === "conn" ? "bg-[#dbeafe] text-[#1d4ed8]" : ""
              }`}
            >
              {t(language, "connect")}
            </button>
            {winMenuOpen === "conn" && (
              <div className="absolute left-0 top-full z-50 mt-0.5 w-48 rounded border border-[#cbd5e1] bg-white py-1 shadow-lg">
                <button
                  type="button"
                  disabled={!selectedProfile}
                  onClick={() => {
                    setWinMenuOpen(null);
                    if (selectedProfile) void connectProfile(selectedProfile.id, false);
                  }}
                  className="flex w-full items-center px-3 py-1.5 text-left hover:bg-[#eff6ff] disabled:opacity-40"
                >
                  開啟選取連線
                </button>
                <button
                  type="button"
                  disabled={!selectedProfile}
                  onClick={() => {
                    setWinMenuOpen(null);
                    if (selectedProfile) void connectProfile(selectedProfile.id, true);
                  }}
                  className="flex w-full items-center px-3 py-1.5 text-left hover:bg-[#eff6ff] disabled:opacity-40"
                >
                  載入離線範例結構 (Demo)
                </button>
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setWinMenuOpen(winMenuOpen === "tools" ? null : "tools")}
              className={`rounded px-2 py-0.5 hover:bg-[#e8eefc] hover:text-[#1d4ed8] ${
                winMenuOpen === "tools" ? "bg-[#dbeafe] text-[#1d4ed8]" : ""
              }`}
            >
              工具
            </button>
            {winMenuOpen === "tools" && (
              <div className="absolute left-0 top-full z-50 mt-0.5 w-60 rounded border border-[#cbd5e1] bg-white py-1 shadow-lg">
                {[
                  { label: "資料傳輸..." },
                  { label: "資料產生..." },
                  { label: "資料遮罩..." },
                  { label: "資料字典..." },
                  { label: "資料同步..." },
                  { label: "結構同步..." },
                  { label: "命令列介面...", shortcut: "F6" },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    disabled
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left opacity-50 cursor-default"
                  >
                    <span>{item.label}</span>
                    {item.shortcut && (
                      <span className="text-[10px] text-[#94a3b8]">{item.shortcut}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setSettingsModalOpen(true)}
            className="rounded px-2 py-0.5 hover:bg-[#e8eefc] hover:text-[#1d4ed8]"
          >
            設定
          </button>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleTheme}
              title={isDark ? "切換為淺色主題" : "切換為深色主題"}
              className={`rounded border p-1 ${
                isDark
                  ? "border-[#3d3d42] text-amber-300 hover:bg-[#333337]"
                  : "border-[#cbd5e1] text-slate-700 hover:bg-[#e2e8f0]"
              }`}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </header>
      )}

      {/* Main ActionToolBar */}
      <div
        className={`flex items-center justify-between border-b select-none ${
          isMac
            ? isDark
              ? "h-[60px] border-white/10 bg-[#242426] px-3 py-1.5"
              : "h-[60px] border-black/10 bg-[#f5f5f7] px-3 py-1.5"
            : isDark
            ? "h-[63px] border-[#333336] bg-[#252528] px-2.5"
            : "h-[63px] border-[#d4d8e0] bg-white px-2.5"
        }`}
      >
        {/* Left Primary ActionToolBar */}
        <div className="flex items-center gap-1">
          <div ref={connDropdownRef} className="relative flex items-center">
            <button
              type="button"
              onClick={() => openConnectionModal(null)}
              className={toolbarBtnCls}
              title="開啟站台管理 (Site Manager)"
            >
              <Database
                className={`h-5 w-5 ${
                  isDark ? "text-[#38bdf8]" : isMac ? "text-[#007aff]" : "text-[#2563eb]"
                }`}
              />
              <span className="mt-1 text-[11px]">{t(language, "siteManager")}</span>
            </button>
            <button
              type="button"
              onClick={() => setConnDropdownOpen((o) => !o)}
              title="快速建立特定資料庫站台"
              className={`px-1 py-3 ${
                isMac
                  ? isDark
                    ? "rounded-lg text-[#98989d] hover:bg-white/10"
                    : "rounded-lg text-[#6e6e73] hover:bg-black/6"
                  : isDark
                  ? "rounded text-[#a1a1aa] hover:bg-[#333337]"
                  : "rounded text-[#64748b] hover:bg-[#eef2f8]"
              }`}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>

            {connDropdownOpen && (
              <div
                className={`absolute left-0 top-full z-40 mt-1 w-44 border bg-white py-1 shadow-lg text-[11px] ${
                  isMac
                    ? "rounded-xl border-black/10 shadow-xl"
                    : "rounded border-[#cbd5e1]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => openNewConnection("mysql")}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#eff6ff]"
                >
                  <DbEngineIcon kind="mysql" size={15} />
                  <span>MySQL...</span>
                </button>
                <button
                  type="button"
                  onClick={() => openNewConnection("mariadb")}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#eff6ff]"
                >
                  <DbEngineIcon kind="mariadb" size={15} />
                  <span>MariaDB...</span>
                </button>
                <button
                  type="button"
                  onClick={() => openNewConnection("postgres")}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#eff6ff]"
                >
                  <DbEngineIcon kind="postgres" size={15} />
                  <span>PostgreSQL...</span>
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => openQueryTab()}
            className={toolbarBtnCls}
          >
            <Terminal className="h-5 w-5 text-[#10b981]" />
            <span className="mt-1 text-[11px]">{t(language, "newQuery")}</span>
          </button>

          <button
            type="button"
            disabled={!selectedScope?.database}
            onClick={() =>
              selectedScope &&
              void selectScope({ ...selectedScope, category: "tables", objectName: null })
            }
            className={toolbarBtnCls}
          >
            <Table2
              className={`h-5 w-5 ${
                isDark ? "text-[#38bdf8]" : isMac ? "text-[#007aff]" : "text-[#2563eb]"
              }`}
            />
            <span className="mt-1 text-[11px]">{t(language, "tables")}</span>
          </button>

          <button
            type="button"
            disabled={!selectedScope?.database}
            onClick={() =>
              selectedScope &&
              void selectScope({ ...selectedScope, category: "views", objectName: null })
            }
            className={toolbarBtnCls}
          >
            <Eye className="h-5 w-5 text-[#06b6d4]" />
            <span className="mt-1 text-[11px]">{t(language, "views")}</span>
          </button>

          <button
            type="button"
            disabled={!selectedScope?.database}
            onClick={() =>
              selectedScope &&
              void selectScope({ ...selectedScope, category: "routines", objectName: null })
            }
            className={toolbarBtnCls}
          >
            <FileCode2 className="h-5 w-5 text-[#a855f7]" />
            <span className="mt-1 text-[11px]">{t(language, "routines")}</span>
          </button>

          <button
            type="button"
            disabled={!selectedScope?.database || selectedProfile?.dbKind !== "postgres"}
            onClick={() =>
              selectedScope &&
              void selectScope({ ...selectedScope, category: "sequences", objectName: null })
            }
            className={toolbarBtnCls}
          >
            <ListOrdered className="h-5 w-5 text-[#f59e0b]" />
            <span className="mt-1 text-[11px]">{t(language, "sequences")}</span>
          </button>

          <button
            type="button"
            onClick={() => setSettingsModalOpen(true)}
            title="偏好設定 (Ctrl+,)"
            className={toolbarBtnCls}
          >
            <Settings className={`h-5 w-5 ${isDark ? "text-[#94a3b8]" : "text-[#475569]"}`} />
            <span className="mt-1 text-[11px]">{t(language, "settings")}</span>
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
            className={toolbarBtnCls}
          >
            <RefreshCw className={`h-5 w-5 ${isDark ? "text-[#94a3b8]" : "text-[#475569]"}`} />
            <span className="mt-1 text-[11px]">{t(language, "refresh")}</span>
          </button>
        </div>

        {/* Right Auxiliary Toolbar Area (shown here on Windows/Linux; integrated in macOS TitleBar on Mac) */}
        {!isMac && (
          <div className="flex w-[160px] items-center justify-end gap-1.5">
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
              <span>{t(language, "inspector")}</span>
            </button>
          </div>
        )}
      </div>

      {/* ScpCraft-style Site Session Tabs Strip */}
      <SessionTabsBar />

      {/* Main 3-Column Body with Splitters */}
      <div className="flex min-h-0 flex-1">
        <ConnectionTree width={leftWidth} />

        {/* Left Splitter */}
        <div
          onMouseDown={() => {
            draggingRef.current = "left";
          }}
          className={
            isMac
              ? isDark
                ? "w-[4px] flex-shrink-0 cursor-col-resize bg-[#1c1c1e] transition-colors hover:bg-[#0a84ff]/70"
                : "w-[4px] flex-shrink-0 cursor-col-resize bg-[#e5e5ea] transition-colors hover:bg-[#007aff]/70"
              : isDark
              ? "w-[3px] flex-shrink-0 cursor-col-resize bg-[#2b2b2e] transition-colors hover:bg-[#38bdf8]"
              : "w-[3px] flex-shrink-0 cursor-col-resize bg-[#e2e8f0] transition-colors hover:bg-[#60a5fa]"
          }
        />

        <WorkspaceTabs />

        {rightPaneOpen && (
          <>
            {/* Right Splitter */}
            <div
              onMouseDown={() => {
                draggingRef.current = "right";
              }}
              className={
                isMac
                  ? isDark
                    ? "w-[4px] flex-shrink-0 cursor-col-resize bg-[#1c1c1e] transition-colors hover:bg-[#0a84ff]/70"
                    : "w-[4px] flex-shrink-0 cursor-col-resize bg-[#e5e5ea] transition-colors hover:bg-[#007aff]/70"
                  : isDark
                  ? "w-[3px] flex-shrink-0 cursor-col-resize bg-[#2b2b2e] transition-colors hover:bg-[#38bdf8]"
                  : "w-[3px] flex-shrink-0 cursor-col-resize bg-[#e2e8f0] transition-colors hover:bg-[#60a5fa]"
              }
            />
            <RightInspectorPane width={rightWidth} />
          </>
        )}
      </div>

      {/* Bottom StatusBar */}
      <footer
        className={`flex items-center border-t text-[10px] ${
          isMac
            ? isDark
              ? "h-[24px] border-white/10 bg-[#242426] text-[#98989d]"
              : "h-[24px] border-black/10 bg-[#ececed] text-[#6e6e73]"
            : isDark
            ? "h-[22px] border-[#333336] bg-[#202022] text-[#a1a1aa]"
            : "h-[22px] border-[#d4d8e0] bg-[#f1f3f6] text-[#4b5563]"
        }`}
      >
        <div
          style={{ width: leftWidth }}
          className={`flex-shrink-0 truncate border-r px-2 ${
            isMac
              ? isDark
                ? "border-white/10"
                : "border-black/10"
              : isDark
              ? "border-[#333336]"
              : "border-[#d4d8e0]"
          }`}
        >
          {language === "en"
            ? `Connections: ${profiles.length} (Active: ${activeCount})`
            : `連線：${profiles.length} 筆（作用中 ${activeCount}）`}
        </div>
        <div
          className={`min-w-0 flex-1 truncate border-r px-2 ${
            isMac
              ? isDark
                ? "border-white/10"
                : "border-black/10"
              : isDark
              ? "border-[#333336]"
              : "border-[#d4d8e0]"
          }`}
        >
          {statusMessage}
        </div>
        <div
          className={`w-[69px] flex-shrink-0 border-r px-2 text-center font-mono ${
            isMac
              ? isDark
                ? "border-white/10"
                : "border-black/10"
              : isDark
              ? "border-[#333336]"
              : "border-[#d4d8e0]"
          }`}
        >
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

      <SettingsModal />
    </div>
  );
}
