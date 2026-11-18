import { Activity, Columns3, FileCode2, Info, Loader2 } from "lucide-react";
import { t } from "../lib/i18n";
import { useWorkbenchStore } from "../store/workbenchStore";
import { isMacOS } from "../utils/platform";

interface RightInspectorPaneProps {
  width: number;
}

export function RightInspectorPane({ width }: RightInspectorPaneProps) {
  const {
    connectionStates,
    serverVersions,
    selectedScope,
    rightPaneOpen,
    rightPaneTab,
    inspectorLoading,
    inspectorDdl,
    inspectorColumns,
    inspectorIndexes,
    inspectorForeignKeys,
    activityLogs,
    language,
    setRightPaneTab,
  } = useWorkbenchStore();

  if (!rightPaneOpen) return null;

  const isMac = isMacOS();
  const profile =
    useWorkbenchStore.getState().getProfileById(selectedScope?.profileId) ?? null;
  const status = profile ? connectionStates[profile.id] ?? "disconnected" : "disconnected";
  const serverVersion = profile ? serverVersions[profile.id] : null;

  const tabs: { id: "info" | "ddl" | "columns" | "log"; label: string; icon: React.ReactNode }[] = [
    { id: "info", label: t(language, "info"), icon: <Info className="h-3 w-3" /> },
    { id: "ddl", label: t(language, "ddl"), icon: <FileCode2 className="h-3 w-3" /> },
    { id: "columns", label: t(language, "columns"), icon: <Columns3 className="h-3 w-3" /> },
    { id: "log", label: t(language, "logs"), icon: <Activity className="h-3 w-3" /> },
  ];

  return (
    <aside
      style={{ width }}
      className={`flex flex-shrink-0 flex-col border-l ${
        isMac
          ? "border-black/10 bg-[#f2f2f7]"
          : "border-[#d4d8e0] bg-[#fbfcfd]"
      }`}
    >
      {/* Top Header: macOS Segmented Control vs Windows/Linux Flat Tabs */}
      <div
        className={`flex items-center justify-between border-b px-2 ${
          isMac
            ? "h-9 border-black/10 bg-[#ececed]"
            : "h-[40px] border-[#e5e7eb] bg-[#f8f9fb]"
        }`}
      >
        <div
          className={
            isMac
              ? "flex w-full items-center gap-0.5 rounded-lg bg-black/8 p-0.5"
              : "flex items-center gap-1"
          }
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setRightPaneTab(t.id)}
              className={
                isMac
                  ? `flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all ${
                      rightPaneTab === t.id
                        ? "bg-white text-[#1d1d1f] shadow-sm"
                        : "text-[#6e6e73] hover:text-[#1d1d1f]"
                    }`
                  : `flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition ${
                      rightPaneTab === t.id
                        ? "bg-white text-[#1d4ed8] shadow-sm border border-[#e2e8f0]"
                        : "text-[#4b5563] hover:bg-[#eef2f6]"
                    }`
              }
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 72px Object Summary Card */}
      <div
        className={`flex h-[72px] flex-col justify-center border-b bg-white px-3 ${
          isMac ? "border-black/10" : "border-[#e5e7eb]"
        }`}
      >
        <div className="truncate text-xs font-semibold text-[#111827]">
          {selectedScope?.objectName
            ? selectedScope.objectName
            : selectedScope?.database
            ? selectedScope.database
            : profile
            ? profile.name
            : language === "en"
            ? "No object selected"
            : "尚未選擇物件"}
        </div>
        <div className="mt-1 truncate text-[10px] text-[#64748b] font-mono">
          {profile
            ? `${profile.dbKind.toUpperCase()} · ${profile.host}:${profile.port}`
            : language === "en"
            ? "Select a connection or object on the left"
            : "請選擇左側連線或物件"}
        </div>
        <div className="mt-0.5 truncate text-[10px] text-[#94a3b8]">
          {serverVersion
            ? serverVersion
            : language === "en"
            ? `Status: ${status}`
            : `狀態：${status}`}
        </div>
      </div>

      {/* Scrollable Inspector / SyncActivityLog Body */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3 text-[11px]">
        {inspectorLoading && (
          <div className="mb-2 flex items-center gap-1.5 text-[#2563eb]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>
              {language === "en" ? "Loading object metadata..." : "正在載入物件中繼資料..."}
            </span>
          </div>
        )}

        {rightPaneTab === "info" && (
          <div className="space-y-3">
            <div className="rounded border border-[#e2e8f0] bg-white p-2.5 space-y-1.5">
              <div className="font-semibold text-[#334155]">
                {language === "en" ? "Target Path" : "目標路徑"}
              </div>
              <div className="font-mono text-[10px] text-[#475569] break-all">
                {[
                  profile?.name,
                  selectedScope?.database,
                  selectedScope?.schema,
                  selectedScope?.objectName,
                ]
                  .filter(Boolean)
                  .join(" / ") || "-"}
              </div>
            </div>

            {inspectorColumns.length > 0 && (
              <div className="rounded border border-[#e2e8f0] bg-white p-2.5 space-y-1">
                <div className="font-semibold text-[#334155]">
                  {language === "en" ? "Structure Summary" : "結構統計"}
                </div>
                <div className="text-[#475569]">
                  {language === "en" ? "Columns" : "欄位數"}: {inspectorColumns.length}
                </div>
                <div className="text-[#475569]">
                  {language === "en" ? "Indexes" : "索引數"}: {inspectorIndexes.length}
                </div>
                <div className="text-[#475569]">
                  {language === "en" ? "Foreign Keys" : "外鍵數"}: {inspectorForeignKeys.length}
                </div>
              </div>
            )}

            <div className="rounded border border-[#e2e8f0] bg-white p-2.5 space-y-1">
              <div className="font-semibold text-[#334155]">
                {language === "en" ? "Recent Activity" : "最近活動"}
              </div>
              {activityLogs.slice(0, 5).map((log) => (
                <div key={log.id} className="border-t border-[#f1f5f9] pt-1 text-[10px]">
                  <span className="font-mono text-[#94a3b8] mr-1.5">
                    {log.timestamp}
                  </span>
                  <span className="text-[#334155]">{log.message}</span>
                </div>
              ))}
              {activityLogs.length === 0 && (
                <div className="text-[10px] text-[#94a3b8]">
                  {language === "en" ? "No activity recorded yet" : "尚無操作紀錄"}
                </div>
              )}
            </div>
          </div>
        )}

        {rightPaneTab === "ddl" && (
          <pre className="overflow-x-auto rounded border border-[#cbd5e1] bg-[#0f172a] p-2.5 font-mono text-[10px] leading-relaxed text-[#e2e8f0]">
            {inspectorDdl ||
              (language === "en"
                ? "-- Select a table or view to preview DDL"
                : "-- 點選資料表或檢視表以預覽 DDL")}
          </pre>
        )}

        {rightPaneTab === "columns" && (
          <div className="space-y-2">
            {inspectorColumns.length === 0 ? (
              <div className="text-[#94a3b8]">
                {language === "en"
                  ? "Select a table to inspect columns and indexes."
                  : "點選資料表後可檢視欄位與索引明細。"}
              </div>
            ) : (
              inspectorColumns.map((col) => (
                <div
                  key={col.name}
                  className="flex items-center justify-between rounded border border-[#e2e8f0] bg-white px-2.5 py-1.5"
                >
                  <span className="font-mono font-medium text-[#111827] truncate">
                    {col.isPrimaryKey ? "🔑 " : ""}
                    {col.name}
                  </span>
                  <span className="ml-2 font-mono text-[10px] text-[#64748b] flex-shrink-0">
                    {col.columnType}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {rightPaneTab === "log" && (
          <div className="space-y-1.5">
            {activityLogs.map((log) => (
              <div
                key={log.id}
                className="rounded border border-[#e2e8f0] bg-white p-2 text-[10px]"
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`font-semibold ${
                      log.level === "error"
                        ? "text-[#dc2626]"
                        : log.level === "warn"
                        ? "text-[#d97706]"
                        : log.level === "success"
                        ? "text-[#16a34a]"
                        : "text-[#2563eb]"
                    }`}
                  >
                    {log.profileName ?? "SqlCraft"}
                  </span>
                  <span className="font-mono text-[#94a3b8]">
                    {log.timestamp}
                    {log.latencyMs != null ? ` (${log.latencyMs}ms)` : ""}
                  </span>
                </div>
                <div className="mt-0.5 text-[#334155] break-words">{log.message}</div>
              </div>
            ))}
            {activityLogs.length === 0 && (
              <div className="text-[#94a3b8]">
                {language === "en" ? "No activity recorded" : "尚無活動紀錄"}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
