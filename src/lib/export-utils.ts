import type { CellValue, DbKind, QueryResultSet } from "../types/database";
import { escapeSqlLiteral, formatQualifiedTable, quoteIdentifier } from "./sql-builder";

export interface CsvExportOptions {
  delimiter: string;
  includeHeaders: boolean;
  nullText: string;
}

export interface SqlExportOptions {
  kind: DbKind;
  database?: string | null;
  schema?: string | null;
  tableName: string;
  multiRowBatch: boolean;
}

function cellToString(val: CellValue | undefined, nullText: string): string {
  if (val === null || val === undefined) return nullText;
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

function escapeCsvCell(value: string, delimiter: string): string {
  if (
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function exportToCsv(result: QueryResultSet, opts: CsvExportOptions): string {
  const lines: string[] = [];
  if (opts.includeHeaders) {
    lines.push(
      result.columns.map((c) => escapeCsvCell(c.name, opts.delimiter)).join(opts.delimiter)
    );
  }
  for (const row of result.rows) {
    lines.push(
      result.columns
        .map((_, idx) =>
          escapeCsvCell(cellToString(row[idx], opts.nullText), opts.delimiter)
        )
        .join(opts.delimiter)
    );
  }
  return lines.join("\r\n");
}

export function exportToJson(result: QueryResultSet, pretty: boolean): string {
  const records = result.rows.map((row) => {
    const obj: Record<string, CellValue> = {};
    result.columns.forEach((col, idx) => {
      obj[col.name] = row[idx] ?? null;
    });
    return obj;
  });
  return JSON.stringify(records, null, pretty ? 2 : undefined);
}

export function exportToSqlInsert(
  result: QueryResultSet,
  opts: SqlExportOptions
): string {
  const tableTarget = opts.database
    ? formatQualifiedTable(opts.kind, opts.database, opts.schema, opts.tableName || "exported_table")
    : quoteIdentifier(opts.kind, opts.tableName || "exported_table");

  const colList = result.columns
    .map((c) => quoteIdentifier(opts.kind, c.name))
    .join(", ");

  if (result.rows.length === 0) {
    return `-- 無資料列可匯出 (${tableTarget})`;
  }

  const tupleSqls = result.rows.map(
    (row) =>
      `(${result.columns
        .map((_, idx) => escapeSqlLiteral(row[idx]))
        .join(", ")})`
  );

  if (opts.multiRowBatch) {
    const chunkSize = 200;
    const chunks: string[] = [];
    for (let i = 0; i < tupleSqls.length; i += chunkSize) {
      const slice = tupleSqls.slice(i, i + chunkSize);
      chunks.push(`INSERT INTO ${tableTarget} (${colList}) VALUES\n  ${slice.join(",\n  ")};`);
    }
    return chunks.join("\n\n");
  }

  return tupleSqls
    .map((tuple) => `INSERT INTO ${tableTarget} (${colList}) VALUES ${tuple};`)
    .join("\n");
}

export function triggerFileDownload(
  filename: string,
  content: string,
  mimeType: string
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
