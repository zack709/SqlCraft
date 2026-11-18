import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  Play,
  PlayCircle,
  Save,
  Sparkles,
  Square,
  Wand2,
  XCircle,
} from "lucide-react";
import { getDemoTableMeta } from "../lib/demo-data";
import { extractStatementAtOffset, formatSql } from "../lib/sql-formatter";
import {
  makeDbKey,
  makeScopeKey,
  useWorkbenchStore,
  type WorkspaceTab,
} from "../store/workbenchStore";
import type { QueryResultSet } from "../types/database";
import { ExportModal } from "./ExportModal";
import { MonacoSqlEditor, type SchemaCompletionTable } from "./MonacoSqlEditor";

type QueryTab = Extract<WorkspaceTab, { kind: "query" }>;

interface QueryEditorPaneProps {
  tab: QueryTab;
}

function renderCellValue(val: unknown): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

export function QueryEditorPane({ tab }: QueryEditorPaneProps) {
  const {
    profiles,
    connectionStates,
    databasesByProfile,
    schemasByDb,
    tablesByScope,
    viewsByScope,
    routinesByScope,
    updateQueryTabSql,
    updateQueryTabContext,
    runQueryInTab,
    explainQueryInTab,
    cancelQueryInTab,
    saveQueryTab,
  } = useWorkbenchStore();

  const [editorHeight, setEditorHeight] = useState(260);
  const [selectedText, setSelectedText] = useState("");
  const [cursorOffset, setCursorOffset] = useState(0);
  const [bottomTab, setBottomTab] = useState<string>("message");
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState(tab.title);
  const [exportOpen, setExportOpen] = useState(false);

  const draggingSplitRef = useRef(false);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingSplitRef.current) return;
      setEditorHeight((prev) => Math.max(120, Math.min(540, prev + e.movementY)));
    };
    const onUp = () => {
      draggingSplitRef.current = false;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const profile = profiles.find((p) => p.id === tab.profileId) ?? profiles[0] ?? null;
  const dbKind = profile?.dbKind ?? "mysql";
  const dbs = profile ? databasesByProfile[profile.id] ?? [] : [];
  const schemas =
    profile && tab.database && dbKind === "postgres"
      ? schemasByDb[makeDbKey(profile.id, tab.database)] ?? []
      : [];

  const scopeKey =
    profile && tab.database
      ? makeScopeKey(profile.id, tab.database, tab.schema)
      : null;

  const isDemo = profile ? connectionStates[profile.id] === "demo" : false;

  const completionTables: SchemaCompletionTable[] = useMemo(() => {
    if (!scopeKey || !profile || !tab.database) return [];
    const list = tablesByScope[scopeKey] ?? [];
    return list.map((t) => {
      if (isDemo) {
        const meta = getDemoTableMeta(dbKind, tab.database!, tab.schema, t.name);
        return {
          name: t.name,
          comment: t.comment,
          columns: meta?.columns.map((c) => ({
            name: c.name,
            columnType: c.columnType,
          })),
        };
      }
      return { name: t.name, comment: t.comment };
    });
  }, [scopeKey, profile, tab.database, tab.schema, tablesByScope, isDemo, dbKind]);

  const completionViews = useMemo(
    () => (scopeKey ? (viewsByScope[scopeKey] ?? []).map((v) => v.name) : []),
    [scopeKey, viewsByScope]
  );

  const completionRoutines = useMemo(
    () => (scopeKey ? (routinesByScope[scopeKey] ?? []).map((r) => r.name) : []),
    [scopeKey, routinesByScope]
  );

  // Collect result sets from batch statements
  const resultTabs = useMemo(() => {
    if (!tab.response) return [];
    return tab.response.statements
      .filter((s) => s.resultSet && s.resultSet.columns.length > 0)
      .map((s, idx) => ({
        id: `result-${s.index}`,
        label: `結果 ${idx + 1}`,
        statement: s,
        resultSet: s.resultSet!,
      }));
  }, [tab.response]);

  // Auto-switch to first Result tab when results arrive
  useEffect(() => {
    if (resultTabs.length > 0 && bottomTab === "message") {
      setBottomTab(resultTabs[0].id);
    } else if (tab.response && resultTabs.length === 0) {
      setBottomTab("message");
    }
  }, [tab.response]);

  const activeExportResult: QueryResultSet | null = useMemo(() => {
    const matched = resultTabs.find((r) => r.id === bottomTab);
    return matched?.resultSet ?? resultTabs[0]?.resultSet ?? null;
  }, [resultTabs, bottomTab]);

  const handleRunSelectionOrCurrent = (sel: string, offset: number) => {
    const picked = sel.trim() || extractStatementAtOffset(tab.sql, offset);
    if (!picked) return;
    void runQueryInTab(tab.id, picked);
  };

  const handleExplain = () => {
    const picked =
      selectedText.trim() || extractStatementAtOffset(tab.sql, cursorOffset) || tab.sql;
    if (!picked.trim()) return;
    setBottomTab("explain");
    void explainQueryInTab(tab.id, picked);
  };

  const handleFormat = () => {
    const formatted = formatSql(tab.sql, dbKind);
    updateQueryTabSql(tab.id, formatted);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white text-[11px]">
      {/* Query Context & Action Toolbar */}
      <div className="flex h-[32px] items-center justify-between border-b border-[#dcdfe6] bg-[#f8f9fb] px-2.5 gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <select
            value={tab.profileId}
            onChange={(e) =>
              updateQueryTabContext(tab.id, {
                profileId: e.target.value,
                database: null,
                schema: null,
              })
            }
            className="h-6 max-w-[160px] rounded border border-[#cbd5e1] bg-white px-1.5 font-medium"
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <select
            value={tab.database ?? ""}
            onChange={(e) =>
              updateQueryTabContext(tab.id, {
                database: e.target.value || null,
                schema: null,
              })
            }
            className="h-6 max-w-[140px] rounded border border-[#cbd5e1] bg-white px-1.5 font-mono"
          >
            <option value="">(預設資料庫)</option>
            {dbs.map((d) => (
              <option key={d.name} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>

          {dbKind === "postgres" && (
            <select
              value={tab.schema ?? ""}
              onChange={(e) =>
                updateQueryTabContext(tab.id, {
                  schema: e.target.value || null,
                })
              }
              className="h-6 max-w-[120px] rounded border border-[#cbd5e1] bg-white px-1.5 font-mono"
            >
              <option value="">public</option>
              {schemas.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          )}

          <span className="mx-1 h-4 border-l border-[#cbd5e1]" />

          <button
            type="button"
            disabled={tab.running}
            onClick={() => void runQueryInTab(tab.id)}
            title="執行全部 (Run All)"
            className="flex h-6 items-center gap-1 rounded bg-[#16a34a] px-2.5 font-medium text-white hover:bg-[#15803d] disabled:opacity-50"
          >
            {tab.running ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Play className="h-3 w-3" />
            )}
            <span>執行</span>
          </button>

          <button
            type="button"
            disabled={tab.running}
            onClick={() => handleRunSelectionOrCurrent(selectedText, cursorOffset)}
            title="執行選取或游標所在語句 (Ctrl+Enter)"
            className="flex h-6 items-center gap-1 rounded border border-[#cbd5e1] bg-white px-2 hover:bg-[#eff6ff] disabled:opacity-50"
          >
            <PlayCircle className="h-3 w-3 text-[#2563eb]" />
            <span>{selectedText.trim() ? "執行選取" : "執行當前"}</span>
          </button>

          {tab.running && (
            <button
              type="button"
              onClick={() => void cancelQueryInTab(tab.id)}
              className="flex h-6 items-center gap-1 rounded bg-[#dc2626] px-2 text-white hover:bg-[#b91c1c]"
            >
              <Square className="h-3 w-3" />
              <span>停止</span>
            </button>
          )}

          <button
            type="button"
            disabled={tab.running}
            onClick={handleExplain}
            className="flex h-6 items-center gap-1 rounded border border-[#cbd5e1] bg-white px-2 hover:bg-[#faf5ff]"
          >
            <Sparkles className="h-3 w-3 text-[#7c3aed]" />
            <span>解釋</span>
          </button>

          <button
            type="button"
            onClick={handleFormat}
            title="美化 SQL (Ctrl+Shift+F)"
            className="flex h-6 items-center gap-1 rounded border border-[#cbd5e1] bg-white px-2 hover:bg-[#f1f5f9]"
          >
            <Wand2 className="h-3 w-3 text-[#475569]" />
            <span>美化</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            type="button"
            onClick={() => {
              setSaveTitle(tab.title);
              setSaveModalOpen(true);
            }}
            className="flex h-6 items-center gap-1 rounded border border-[#cbd5e1] bg-white px-2 hover:bg-[#eff6ff]"
          >
            <Save className="h-3 w-3 text-[#2563eb]" />
            <span>儲存</span>
          </button>

          <button
            type="button"
            disabled={!activeExportResult || activeExportResult.rows.length === 0}
            onClick={() => setExportOpen(true)}
            className="flex h-6 items-center gap-1 rounded border border-[#cbd5e1] bg-white px-2 hover:bg-[#ecfdf5] disabled:opacity-40"
          >
            <Download className="h-3 w-3 text-[#059669]" />
            <span>匯出</span>
          </button>
        </div>
      </div>

      {/* Top Monaco SQL Editor */}
      <div style={{ height: editorHeight }} className="w-full flex-shrink-0">
        <MonacoSqlEditor
          value={tab.sql}
          dbKind={dbKind}
          tables={completionTables}
          views={completionViews}
          routines={completionRoutines}
          onChange={(next) => updateQueryTabSql(tab.id, next)}
          onRunAll={() => void runQueryInTab(tab.id)}
          onRunSelection={handleRunSelectionOrCurrent}
          onFormat={handleFormat}
          onSelectionChange={(sel, off) => {
            setSelectedText(sel);
            setCursorOffset(off);
          }}
        />
      </div>

      {/* Horizontal Resize Splitter */}
      <div
        onMouseDown={() => {
          draggingSplitRef.current = true;
        }}
        className="h-[4px] w-full flex-shrink-0 cursor-row-resize border-y border-[#d4d8e0] bg-[#eef2f6] hover:bg-[#60a5fa]"
      />

      {/* Bottom Tabbed Results (Message / Result 1..N / Explain) */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex h-[26px] items-center gap-1 border-b border-[#d4d8e0] bg-[#f8f9fb] px-2">
          <button
            type="button"
            onClick={() => setBottomTab("message")}
            className={`rounded px-2.5 py-0.5 text-[11px] font-medium ${
              bottomTab === "message"
                ? "bg-white text-[#1d4ed8] shadow-sm border border-[#cbd5e1]"
                : "text-[#475569] hover:bg-[#e2e8f0]"
            }`}
          >
            訊息
          </button>

          {resultTabs.map((rt) => (
            <button
              key={rt.id}
              type="button"
              onClick={() => setBottomTab(rt.id)}
              className={`rounded px-2.5 py-0.5 text-[11px] font-medium ${
                bottomTab === rt.id
                  ? "bg-white text-[#1d4ed8] shadow-sm border border-[#cbd5e1]"
                  : "text-[#475569] hover:bg-[#e2e8f0]"
              }`}
            >
              {rt.label} ({rt.resultSet.rows.length})
            </button>
          ))}

          <button
            type="button"
            onClick={() => setBottomTab("explain")}
            className={`rounded px-2.5 py-0.5 text-[11px] font-medium ${
              bottomTab === "explain"
                ? "bg-white text-[#7c3aed] shadow-sm border border-[#cbd5e1]"
                : "text-[#475569] hover:bg-[#e2e8f0]"
            }`}
          >
            解釋 (Explain)
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {tab.error && (
            <div className="m-3 rounded border border-[#fecaca] bg-[#fef2f2] p-3 font-mono text-[#991b1b]">
              {tab.error}
            </div>
          )}

          {bottomTab === "message" && (
            <div className="p-3 space-y-2">
              {!tab.response ? (
                <div className="text-[#94a3b8]">
                  按「執行」或 `Ctrl+Enter` 執行 SQL 查詢。
                </div>
              ) : (
                <>
                  <div className="text-[11px] text-[#475569]">
                    共執行 <strong>{tab.response.statements.length}</strong> 條語句 ·
                    總耗時 <strong className="font-mono">{tab.response.totalExecutionMs} ms</strong>
                  </div>
                  {tab.response.statements.map((s) => (
                    <div
                      key={s.index}
                      className={`rounded border p-2.5 ${
                        s.success
                          ? "border-[#bbf7d0] bg-[#f0fdf4]"
                          : "border-[#fecaca] bg-[#fef2f2]"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 font-mono font-medium">
                          {s.success ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-[#16a34a]" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-[#dc2626]" />
                          )}
                          <span>
                            #{s.index + 1} {s.sqlPreview}
                          </span>
                        </span>
                        <span className="font-mono text-[10px] text-[#475569]">
                          {s.executionMs} ms · 影響 {s.affectedRows} 列
                          {s.resultSet ? ` · 回傳 ${s.resultSet.rows.length} 列` : ""}
                        </span>
                      </div>
                      {s.error && (
                        <div className="mt-1.5 font-mono text-[10px] text-[#991b1b]">
                          {s.error}
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {resultTabs.map((rt) => {
            if (bottomTab !== rt.id) return null;
            const rs = rt.resultSet;
            return (
              <div key={rt.id} className="h-full overflow-auto">
                {rs.warning && (
                  <div className="border-b border-[#fde68a] bg-[#fef3c7] px-3 py-1 text-[10px] text-[#92400e]">
                    {rs.warning}
                  </div>
                )}
                <table className="w-full border-collapse text-left text-[11px]">
                  <thead className="sticky top-0 z-10 h-[24px] border-b border-[#d4d8e0] bg-[#f4f6f9]">
                    <tr>
                      <th className="w-10 border-r border-[#e2e8f0] px-2 text-center font-normal text-[#94a3b8]">
                        #
                      </th>
                      {rs.columns.map((c) => (
                        <th
                          key={c.name}
                          className="border-r border-[#e2e8f0] px-2.5 font-medium text-[#334155]"
                        >
                          <span>{c.name}</span>
                          <span className="ml-1.5 text-[9px] font-normal text-[#94a3b8]">
                            {c.dataType}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rs.rows.map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        className="h-[24px] border-b border-[#f1f5f9] hover:bg-[#f8fafc]"
                      >
                        <td className="border-r border-[#f1f5f9] bg-[#f8fafc] px-2 text-center font-mono text-[10px] text-[#94a3b8]">
                          {rIdx + 1}
                        </td>
                        {row.map((val, cIdx) => {
                          const isNull = val === null || val === undefined;
                          return (
                            <td
                              key={cIdx}
                              className={`max-w-[360px] truncate border-r border-[#f1f5f9] px-2.5 font-mono ${
                                isNull ? "italic text-[#94a3b8]" : "text-[#1f2329]"
                              }`}
                            >
                              {renderCellValue(val)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}

          {bottomTab === "explain" && (
            <div className="p-3 space-y-2">
              {!tab.explainResponse ? (
                <div className="text-[#94a3b8]">
                  點擊上方「解釋」可分析目前語句的執行計畫 (`EXPLAIN`)。
                </div>
              ) : (
                tab.explainResponse.statements.map((stmt) => (
                  <div key={stmt.index} className="space-y-2">
                    <div className="font-mono text-[10px] text-[#475569]">
                      {stmt.sqlPreview} ({stmt.executionMs} ms)
                    </div>
                    {stmt.error ? (
                      <div className="rounded border border-[#fecaca] bg-[#fef2f2] p-2 font-mono text-[#991b1b]">
                        {stmt.error}
                      </div>
                    ) : (
                      stmt.resultSet && (
                        <div className="overflow-auto rounded border border-[#e2e8f0]">
                          <table className="w-full border-collapse text-left text-[11px]">
                            <thead className="bg-[#f4f6f9] border-b border-[#e2e8f0]">
                              <tr>
                                {stmt.resultSet.columns.map((c) => (
                                  <th
                                    key={c.name}
                                    className="border-r border-[#e2e8f0] px-2.5 py-1 font-medium"
                                  >
                                    {c.name}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {stmt.resultSet.rows.map((row, rIdx) => {
                                const rowText = row.map(renderCellValue).join(" ");
                                const hasScanWarning =
                                  /\bALL\b/.test(rowText) || /Seq Scan/.test(rowText);
                                return (
                                  <tr
                                    key={rIdx}
                                    className={`border-b border-[#f1f5f9] ${
                                      hasScanWarning ? "bg-[#fffbeb]" : ""
                                    }`}
                                  >
                                    {row.map((val, cIdx) => (
                                      <td
                                        key={cIdx}
                                        className="border-r border-[#f1f5f9] px-2.5 py-1 font-mono"
                                      >
                                        {cIdx === 0 && hasScanWarning && (
                                          <AlertTriangle className="mr-1 inline h-3 w-3 text-[#d97706]" />
                                        )}
                                        {renderCellValue(val)}
                                      </td>
                                    ))}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Save Query Modal */}
      {saveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await saveQueryTab(tab.id, saveTitle);
              setSaveModalOpen(false);
            }}
            className="w-80 rounded border border-[#cbd5e1] bg-white p-4 shadow-xl text-xs"
          >
            <h3 className="font-semibold text-[#0f172a]">儲存 SQL 查詢</h3>
            <input
              autoFocus
              type="text"
              required
              value={saveTitle}
              onChange={(e) => setSaveTitle(e.target.value)}
              placeholder="查詢名稱"
              className="mt-3 h-7 w-full rounded border border-[#cbd5e1] px-2 outline-none focus:border-[#2563eb]"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSaveModalOpen(false)}
                className="rounded border border-[#cbd5e1] px-3 py-1 hover:bg-[#f1f5f9]"
              >
                取消
              </button>
              <button
                type="submit"
                className="rounded bg-[#2563eb] px-3 py-1 text-white hover:bg-[#1d4ed8]"
              >
                儲存
              </button>
            </div>
          </form>
        </div>
      )}

      <ExportModal
        open={exportOpen}
        result={activeExportResult}
        dbKind={dbKind}
        database={tab.database}
        schema={tab.schema}
        defaultTableName={tab.title}
        onClose={() => setExportOpen(false)}
      />
    </div>
  );
}
