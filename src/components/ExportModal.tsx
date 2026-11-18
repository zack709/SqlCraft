import { useMemo, useState } from "react";
import { Check, Copy, Download, FileSpreadsheet, X } from "lucide-react";
import {
  exportToCsv,
  exportToJson,
  exportToSqlInsert,
  triggerFileDownload,
} from "../lib/export-utils";
import type { DbKind, QueryResultSet } from "../types/database";

export type ExportFormat = "csv" | "json" | "sql";

interface ExportModalProps {
  open: boolean;
  result: QueryResultSet | null;
  dbKind: DbKind;
  database?: string | null;
  schema?: string | null;
  defaultTableName: string;
  onClose: () => void;
}

export function ExportModal({
  open,
  result,
  dbKind,
  database,
  schema,
  defaultTableName,
  onClose,
}: ExportModalProps) {
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [delimiter, setDelimiter] = useState(",");
  const [includeHeaders, setIncludeHeaders] = useState(true);
  const [nullText, setNullText] = useState("");
  const [prettyJson, setPrettyJson] = useState(true);
  const [tableName, setTableName] = useState(defaultTableName || "exported_table");
  const [multiRowBatch, setMultiRowBatch] = useState(true);
  const [copied, setCopied] = useState(false);

  const output = useMemo(() => {
    if (!result) return "";
    if (format === "csv") {
      return exportToCsv(result, { delimiter, includeHeaders, nullText });
    }
    if (format === "json") {
      return exportToJson(result, prettyJson);
    }
    return exportToSqlInsert(result, {
      kind: dbKind,
      database,
      schema,
      tableName: tableName.trim() || defaultTableName || "exported_table",
      multiRowBatch,
    });
  }, [
    result,
    format,
    delimiter,
    includeHeaders,
    nullText,
    prettyJson,
    dbKind,
    database,
    schema,
    tableName,
    defaultTableName,
    multiRowBatch,
  ]);

  if (!open || !result) return null;

  const previewText =
    output.length > 12000
      ? `${output.slice(0, 12000)}\n\n... (預覽截斷，完整檔案共 ${output.length.toLocaleString()} 字元)`
      : output;

  const handleDownload = () => {
    const base = (tableName.trim() || defaultTableName || "export").replace(
      /[^a-zA-Z0-9_-]/g,
      "_"
    );
    if (format === "csv") {
      triggerFileDownload(`${base}.csv`, `\uFEFF${output}`, "text/csv;charset=utf-8");
    } else if (format === "json") {
      triggerFileDownload(`${base}.json`, output, "application/json;charset=utf-8");
    } else {
      triggerFileDownload(`${base}.sql`, output, "application/sql;charset=utf-8");
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard?.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
      <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-md border border-[#cbd5e1] bg-white shadow-2xl text-xs">
        <div className="flex h-9 items-center justify-between border-b border-[#dcdfe6] bg-[#f8f9fb] px-4">
          <div className="flex items-center gap-2 font-semibold text-[#111827]">
            <FileSpreadsheet className="h-4 w-4 text-[#059669]" />
            <span>匯出精靈（共 {result.rows.length.toLocaleString()} 筆資料）</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-[#64748b] hover:bg-[#e2e8f0]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          {/* Format Tabs */}
          <div className="flex items-center gap-2">
            <span className="text-[#475569]">匯出格式：</span>
            {(
              [
                { id: "csv", label: "CSV (.csv)" },
                { id: "json", label: "JSON (.json)" },
                { id: "sql", label: "SQL INSERT (.sql)" },
              ] as { id: ExportFormat; label: string }[]
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setFormat(opt.id)}
                className={`rounded px-3 py-1 font-medium transition ${
                  format === opt.id
                    ? "bg-[#2563eb] text-white"
                    : "border border-[#cbd5e1] bg-[#f8fafc] text-[#334155] hover:bg-[#eef2f7]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Options */}
          <div className="flex flex-wrap items-center gap-4 rounded border border-[#e2e8f0] bg-[#f8fafc] p-2.5 text-[11px]">
            {format === "csv" && (
              <>
                <label className="flex items-center gap-1.5">
                  <span>分隔符號：</span>
                  <select
                    value={delimiter}
                    onChange={(e) => setDelimiter(e.target.value)}
                    className="h-6 rounded border border-[#cbd5e1] bg-white px-1.5 font-mono"
                  >
                    <option value=",">逗號 (,)</option>
                    <option value=";">分號 (;)</option>
                    <option value={"\t"}>Tab (\t)</option>
                  </select>
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={includeHeaders}
                    onChange={(e) => setIncludeHeaders(e.target.checked)}
                  />
                  <span>包含欄位表頭</span>
                </label>
                <label className="flex items-center gap-1.5">
                  <span>NULL 顯示：</span>
                  <input
                    type="text"
                    value={nullText}
                    placeholder="(空白)"
                    onChange={(e) => setNullText(e.target.value)}
                    className="h-6 w-20 rounded border border-[#cbd5e1] bg-white px-1.5 font-mono"
                  />
                </label>
              </>
            )}

            {format === "json" && (
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={prettyJson}
                  onChange={(e) => setPrettyJson(e.target.checked)}
                />
                <span>格式化縮排 (Pretty Print)</span>
              </label>
            )}

            {format === "sql" && (
              <>
                <label className="flex items-center gap-1.5">
                  <span>目標表名：</span>
                  <input
                    type="text"
                    value={tableName}
                    onChange={(e) => setTableName(e.target.value)}
                    className="h-6 w-44 rounded border border-[#cbd5e1] bg-white px-2 font-mono"
                  />
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={multiRowBatch}
                    onChange={(e) => setMultiRowBatch(e.target.checked)}
                  />
                  <span>合併多列 INSERT (每批 200 筆)</span>
                </label>
              </>
            )}
          </div>

          {/* Preview */}
          <pre className="h-64 overflow-auto rounded border border-[#cbd5e1] bg-[#0f172a] p-3 font-mono text-[11px] text-[#e2e8f0]">
            {previewText}
          </pre>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#dcdfe6] bg-[#f8f9fb] px-4 py-2.5">
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="flex items-center gap-1.5 rounded border border-[#cbd5e1] bg-white px-3 py-1.5 font-medium hover:bg-[#f1f5f9]"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-[#16a34a]" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            <span>{copied ? "已複製" : "複製全部"}</span>
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center gap-1.5 rounded bg-[#059669] px-3.5 py-1.5 font-medium text-white hover:bg-[#047857]"
          >
            <Download className="h-3.5 w-3.5" />
            <span>下載檔案</span>
          </button>
        </div>
      </div>
    </div>
  );
}
