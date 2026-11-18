import { Activity, Columns3, FileCode2, Info, Loader2 } from "lucide-react";
import { useWorkbenchStore } from "../store/workbenchStore";

interface RightInspectorPaneProps {
  width: number;
}

export function RightInspectorPane({ width }: RightInspectorPaneProps) {
  const {
    profiles,
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
    setRightPaneTab,
  } = useWorkbenchStore();

  if (!rightPaneOpen) return null;

  const profile = profiles.find((p) => p.id === selectedScope?.profileId) ?? null;
  const status = profile ? connectionStates[profile.id] ?? "disconnected" : "disconnected";
  const serverVersion = profile ? serverVersions[profile.id] : null;

  const tabs: { id: "info" | "ddl" | "columns" | "log"; label: string; icon: React.ReactNode }[] = [
    { id: "info", label: "資訊", icon: <Info className="h-3 w-3" /> },
    { id: "ddl", label: "DDL", icon: <FileCode2 className="h-3 w-3" /> },
    { id: "columns", label: "欄位", icon: <Columns3 className="h-3 w-3" /> },
    { id: "log", label: "日誌", icon: <Activity className="h-3 w-3" /> },
  ];

  return (
    <aside
      style={{ width }}
      className="flex flex-shrink-0 flex-col border-l border-[#d4d8e0] bg-[#fbfcfd]"
    >
      {/* Top 40px header per navicat-ui-spec.md */}
      <div className="flex h-[40px] items-center justify-between border-b border-[#e5e7eb] bg-[#f8f9fb] px-2">
        <div className="flex items-center gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setRightPaneTab(t.id)}
              className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition ${
                rightPaneTab === t.id
                  ? "bg-white text-[#1d4ed8] shadow-sm border border-[#e2e8f0]"
                  : "text-[#4b5563] hover:bg-[#eef2f6]"
              }`}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 72px Object Summary Card per navicat-ui-spec.md */}
      <div className="flex h-[72px] flex-col justify-center border-b border-[#e5e7eb] bg-white px-3">
        <div className="truncate text-xs font-semibold text-[#111827]">
          {selectedScope?.objectName
            ? selectedScope.objectName
            : selectedScope?.database
            ? selectedScope.database
            : profile
            ? profile.name
            : "尚未選擇物件"}
        </div>
        <div className="mt-1 truncate text-[10px] text-[#64748b] font-mono">
          {profile
            ? `${profile.dbKind.toUpperCase()} · ${profile.host}:${profile.port}`
            : "請選擇左側連線或物件"}
        </div>
        <div className="mt-0.5 truncate text-[10px] text-[#94a3b8]">
          {serverVersion
            ? serverVersion
            : `狀態：${status}`}
        </div>
      </div>

      {/* Scrollable Inspector / SyncActivityLog Body */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3 text-[11px]">
        {inspectorLoading && (
          <div className="mb-2 flex items-center gap-1.5 text-[#2563eb]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>正在載入物件中繼資料...</span>
          </div>
        )}

        {rightPaneTab === "info" && (
          <div className="space-y-3">
            <div className="rounded border border-[#e2e8f0] bg-white p-2.5 space-y-1.5">
              <div className="font-semibold text-[#334155]">目標路徑</div>
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
                <div className="font-semibold text-[#334155]">結構統計</div>
                <div className="text-[#475569]">欄位數：{inspectorColumns.length}</div>
                <div className="text-[#475569]">索引數：{inspectorIndexes.length}</div>
                <div className="text-[#475569]">外鍵數：{inspectorForeignKeys.length}</div>
              </div>
            )}

            <div className="rounded border border-[#e2e8f0] bg-white p-2.5 space-y-1">
              <div className="font-semibold text-[#334155]">最近活動</div>
              {activityLogs.slice(0, 5).map((log) => (
                <div key={log.id} className="border-t border-[#f1f5f9] pt-1 text-[10px]">
                  <span className="font-mono text-[#94a3b8] mr-1.5">
                    {log.timestamp}
                  </span>
                  <span className="text-[#334155]">{log.message}</span>
                </div>
              ))}
              {activityLogs.length === 0 && (
                <div className="text-[10px] text-[#94a3b8]">尚無操作紀錄</div>
              )}
            </div>
          </div>
        )}

        {rightPaneTab === "ddl" && (
          <pre className="overflow-x-auto rounded border border-[#cbd5e1] bg-[#0f172a] p-2.5 font-mono text-[10px] leading-relaxed text-[#e2e8f0]">
            {inspectorDdl || "-- 點選資料表或檢視表以預覽 DDL"}
          </pre>
        )}

        {rightPaneTab === "columns" && (
          <div className="space-y-2">
            {inspectorColumns.length === 0 ? (
              <div className="text-[#94a3b8]">點選資料表後可檢視欄位與索引明細。</div>
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
              <div className="text-[#94a3b8]">尚無活動紀錄</div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
