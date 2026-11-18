import type { CellValue, ColumnInfo, DbKind } from "../types/database";

export type FilterOperator =
  | "="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="
  | "LIKE"
  | "NOT LIKE"
  | "IN"
  | "IS NULL"
  | "IS NOT NULL"
  | "IS EMPTY";

export interface FilterRule {
  id: string;
  enabled: boolean;
  logic: "AND" | "OR";
  column: string;
  operator: FilterOperator;
  value: string;
}

export interface SortRule {
  column: string;
  direction: "ASC" | "DESC";
}

export interface GridPendingEdit {
  rowIndex: number;
  columnName: string;
  originalValue: CellValue;
  newValue: CellValue;
}

export interface GridPendingInsert {
  tempId: string;
  values: Record<string, CellValue>;
}

export interface DesignerField {
  id: string;
  originalName?: string;
  name: string;
  dataType: string;
  length: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  isAutoIncrement: boolean;
  defaultValue: string;
  comment: string;
}

export interface DesignerIndex {
  id: string;
  originalName?: string;
  name: string;
  columns: string[];
  indexType: string;
  isUnique: boolean;
  comment: string;
}

export interface DesignerForeignKey {
  id: string;
  originalName?: string;
  name: string;
  columns: string[];
  referencedSchema: string;
  referencedTable: string;
  referencedColumns: string[];
  onDelete: string;
  onUpdate: string;
}

export interface DesignerTrigger {
  id: string;
  name: string;
  timing: "BEFORE" | "AFTER";
  event: "INSERT" | "UPDATE" | "DELETE";
  body: string;
}

export interface TableDesignDraft {
  database: string;
  schema: string | null;
  tableName: string;
  engine: string;
  charset: string;
  collation: string;
  tablespace: string;
  comment: string;
  fields: DesignerField[];
  indexes: DesignerIndex[];
  foreignKeys: DesignerForeignKey[];
  triggers: DesignerTrigger[];
}

export function quoteIdentifier(kind: DbKind, ident: string): string {
  if (kind === "postgres") {
    return `"${ident.replace(/"/g, '""')}"`;
  }
  return `\`${ident.replace(/`/g, "``")}\``;
}

export function formatQualifiedTable(
  kind: DbKind,
  database: string,
  schema: string | null | undefined,
  table: string
): string {
  if (kind === "postgres") {
    return `${quoteIdentifier(kind, schema || "public")}.${quoteIdentifier(kind, table)}`;
  }
  return `${quoteIdentifier(kind, database)}.${quoteIdentifier(kind, table)}`;
}

export function escapeSqlLiteral(val: CellValue | undefined): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number") return Number.isFinite(val) ? String(val) : "NULL";
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  if (typeof val === "object") {
    const json = JSON.stringify(val);
    return `'${json.replace(/'/g, "''")}'`;
  }
  const s = String(val);
  return `'${s.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

export function buildFilterWhereClause(kind: DbKind, rules: FilterRule[]): string {
  const active = rules.filter((r) => r.enabled && r.column.trim());
  if (active.length === 0) return "";

  const parts: string[] = [];
  for (let i = 0; i < active.length; i++) {
    const r = active[i];
    const col = quoteIdentifier(kind, r.column);
    let expr = "";

    switch (r.operator) {
      case "IS NULL":
        expr = `${col} IS NULL`;
        break;
      case "IS NOT NULL":
        expr = `${col} IS NOT NULL`;
        break;
      case "IS EMPTY":
        expr =
          kind === "postgres"
            ? `(${col}::text = '')`
            : `(${col} = '')`;
        break;
      case "IN": {
        const items = r.value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
          .map((item) => escapeSqlLiteral(item));
        expr = items.length > 0 ? `${col} IN (${items.join(", ")})` : "1=1";
        break;
      }
      case "LIKE":
      case "NOT LIKE":
        expr = `${col} ${r.operator} ${escapeSqlLiteral(r.value)}`;
        break;
      default: {
        const trimmed = r.value.trim();
        const isNumeric = trimmed !== "" && !Number.isNaN(Number(trimmed));
        const lit = isNumeric ? trimmed : escapeSqlLiteral(r.value);
        expr = `${col} ${r.operator} ${lit}`;
      }
    }

    if (i === 0) {
      parts.push(expr);
    } else {
      parts.push(`${r.logic} ${expr}`);
    }
  }

  return `WHERE ${parts.join(" ")}`;
}

export function buildOrderByClause(kind: DbKind, sorts: SortRule[]): string {
  const valid = sorts.filter((s) => s.column.trim());
  if (valid.length === 0) return "";
  return (
    "ORDER BY " +
    valid.map((s) => `${quoteIdentifier(kind, s.column)} ${s.direction}`).join(", ")
  );
}

export function buildSelectPageSql(params: {
  kind: DbKind;
  database: string;
  schema?: string | null;
  tableName: string;
  filters: FilterRule[];
  sorts: SortRule[];
  page: number;
  pageSize: number;
}): string {
  const target = formatQualifiedTable(
    params.kind,
    params.database,
    params.schema,
    params.tableName
  );
  const where = buildFilterWhereClause(params.kind, params.filters);
  const order = buildOrderByClause(params.kind, params.sorts);
  const offset = Math.max(0, (params.page - 1) * params.pageSize);
  const parts = [`SELECT * FROM ${target}`];
  if (where) parts.push(where);
  if (order) parts.push(order);
  parts.push(`LIMIT ${params.pageSize} OFFSET ${offset}`);
  return parts.join(" ");
}

function buildRowWhereCondition(
  kind: DbKind,
  columns: ColumnInfo[],
  rowColumns: string[],
  rowValues: CellValue[]
): { whereSql: string; usedPrimaryKey: boolean } {
  const pkCols = columns.filter((c) => c.isPrimaryKey).map((c) => c.name);
  const anchorNames = pkCols.length > 0 ? pkCols : rowColumns;
  const usedPrimaryKey = pkCols.length > 0;

  const predicates = anchorNames
    .map((name) => {
      const idx = rowColumns.indexOf(name);
      if (idx < 0) return null;
      const val = rowValues[idx];
      const qCol = quoteIdentifier(kind, name);
      if (val === null || val === undefined) {
        return `${qCol} IS NULL`;
      }
      return `${qCol} = ${escapeSqlLiteral(val)}`;
    })
    .filter((p): p is string => Boolean(p));

  return {
    whereSql: predicates.join(" AND "),
    usedPrimaryKey,
  };
}

export function buildChangeSetSql(params: {
  kind: DbKind;
  database: string;
  schema?: string | null;
  tableName: string;
  tableColumns: ColumnInfo[];
  gridColumnNames: string[];
  originalRows: CellValue[][];
  editedCells: Record<string, CellValue>; // key: `${rowIdx}::${colName}`
  deletedRowIndices: number[];
  insertedRows: GridPendingInsert[];
}): { statements: string[]; hasPrimaryKey: boolean; warning?: string } {
  const target = formatQualifiedTable(
    params.kind,
    params.database,
    params.schema,
    params.tableName
  );
  const statements: string[] = [];
  let hasPrimaryKey = params.tableColumns.some((c) => c.isPrimaryKey);

  // 1. Deletes (descending order doesn't matter for SQL WHERE)
  const deletedSet = new Set(params.deletedRowIndices);
  for (const rowIdx of deletedSet) {
    const origRow = params.originalRows[rowIdx];
    if (!origRow) continue;
    const { whereSql, usedPrimaryKey } = buildRowWhereCondition(
      params.kind,
      params.tableColumns,
      params.gridColumnNames,
      origRow
    );
    if (!usedPrimaryKey) hasPrimaryKey = false;
    if (whereSql) {
      const limitClause = params.kind === "postgres" ? "" : " LIMIT 1";
      statements.push(`DELETE FROM ${target} WHERE ${whereSql}${limitClause};`);
    }
  }

  // 2. Updates grouped by rowIdx
  const editsByRow = new Map<number, { col: string; val: CellValue }[]>();
  for (const [key, val] of Object.entries(params.editedCells)) {
    const sep = key.indexOf("::");
    if (sep < 0) continue;
    const rowIdx = Number(key.slice(0, sep));
    const colName = key.slice(sep + 2);
    if (deletedSet.has(rowIdx)) continue;
    const list = editsByRow.get(rowIdx) ?? [];
    list.push({ col: colName, val });
    editsByRow.set(rowIdx, list);
  }

  for (const [rowIdx, changes] of editsByRow.entries()) {
    const origRow = params.originalRows[rowIdx];
    if (!origRow || changes.length === 0) continue;
    const setSql = changes
      .map((c) => `${quoteIdentifier(params.kind, c.col)} = ${escapeSqlLiteral(c.val)}`)
      .join(", ");
    const { whereSql, usedPrimaryKey } = buildRowWhereCondition(
      params.kind,
      params.tableColumns,
      params.gridColumnNames,
      origRow
    );
    if (!usedPrimaryKey) hasPrimaryKey = false;
    if (whereSql) {
      const limitClause = params.kind === "postgres" ? "" : " LIMIT 1";
      statements.push(`UPDATE ${target} SET ${setSql} WHERE ${whereSql}${limitClause};`);
    }
  }

  // 3. Inserts
  for (const ins of params.insertedRows) {
    const cols: string[] = [];
    const vals: string[] = [];
    for (const colName of params.gridColumnNames) {
      const v = ins.values[colName];
      if (v === undefined) continue;
      cols.push(quoteIdentifier(params.kind, colName));
      vals.push(escapeSqlLiteral(v));
    }
    if (cols.length > 0) {
      statements.push(
        `INSERT INTO ${target} (${cols.join(", ")}) VALUES (${vals.join(", ")});`
      );
    }
  }

  const warning = !hasPrimaryKey
    ? "注意：此資料表無主鍵 (Primary Key)，系統將使用所有欄位值作為 WHERE 條件以確保精確定位。"
    : undefined;

  return { statements, hasPrimaryKey, warning };
}

export function buildRowAsInsertSql(
  kind: DbKind,
  database: string,
  schema: string | null | undefined,
  tableName: string,
  columnNames: string[],
  row: CellValue[]
): string {
  const target = formatQualifiedTable(kind, database, schema, tableName);
  const cols = columnNames.map((c) => quoteIdentifier(kind, c)).join(", ");
  const vals = row.map((v) => escapeSqlLiteral(v)).join(", ");
  return `INSERT INTO ${target} (${cols}) VALUES (${vals});`;
}

function formatFieldTypeClause(kind: DbKind, field: DesignerField): string {
  const rawType = field.dataType.trim() || (kind === "postgres" ? "text" : "varchar");
  if (
    field.length.trim() &&
    !rawType.includes("(") &&
    !["text", "json", "jsonb", "uuid", "boolean", "bool", "date", "timestamp", "timestamptz", "serial", "bigserial"].includes(
      rawType.toLowerCase()
    )
  ) {
    return `${rawType}(${field.length.trim()})`;
  }
  return rawType;
}

function buildFieldDefSql(kind: DbKind, field: DesignerField): string {
  const qName = quoteIdentifier(kind, field.name);
  let typeSql = formatFieldTypeClause(kind, field);

  if (kind === "postgres" && field.isAutoIncrement) {
    if (typeSql.toLowerCase() === "bigint" || typeSql.toLowerCase() === "int8") {
      typeSql = "BIGSERIAL";
    } else if (!typeSql.toLowerCase().includes("serial")) {
      typeSql = "SERIAL";
    }
  }

  const parts = [qName, typeSql];
  if (!field.nullable) parts.push("NOT NULL");
  if (field.defaultValue.trim() && !(kind === "postgres" && field.isAutoIncrement)) {
    parts.push(`DEFAULT ${field.defaultValue.trim()}`);
  }
  if (kind !== "postgres") {
    if (field.isAutoIncrement) parts.push("AUTO_INCREMENT");
    if (field.comment.trim()) {
      parts.push(`COMMENT ${escapeSqlLiteral(field.comment.trim())}`);
    }
  }
  return parts.join(" ");
}

export function generateCreateTableSql(kind: DbKind, draft: TableDesignDraft): string {
  const target = formatQualifiedTable(
    kind,
    draft.database,
    draft.schema,
    draft.tableName || "new_table"
  );

  const validFields = draft.fields.filter((f) => f.name.trim());
  const defs: string[] = validFields.map((f) => `  ${buildFieldDefSql(kind, f)}`);

  const pkCols = validFields
    .filter((f) => f.isPrimaryKey)
    .map((f) => quoteIdentifier(kind, f.name));
  if (pkCols.length > 0) {
    defs.push(`  PRIMARY KEY (${pkCols.join(", ")})`);
  }

  if (kind !== "postgres") {
    for (const idx of draft.indexes.filter((i) => i.name.trim() && i.columns.length > 0)) {
      const prefix = idx.isUnique ? "UNIQUE KEY" : "KEY";
      const cols = idx.columns.map((c) => quoteIdentifier(kind, c)).join(", ");
      const usingClause = idx.indexType ? ` USING ${idx.indexType}` : "";
      defs.push(`  ${prefix} ${quoteIdentifier(kind, idx.name)} (${cols})${usingClause}`);
    }
  }

  for (const fk of draft.foreignKeys.filter(
    (k) => k.name.trim() && k.columns.length > 0 && k.referencedTable.trim()
  )) {
    const srcCols = fk.columns.map((c) => quoteIdentifier(kind, c)).join(", ");
    const refTable =
      kind === "postgres" && fk.referencedSchema.trim()
        ? `${quoteIdentifier(kind, fk.referencedSchema)}.${quoteIdentifier(kind, fk.referencedTable)}`
        : quoteIdentifier(kind, fk.referencedTable);
    const refCols = fk.referencedColumns.map((c) => quoteIdentifier(kind, c)).join(", ");
    let line = `  CONSTRAINT ${quoteIdentifier(kind, fk.name)} FOREIGN KEY (${srcCols}) REFERENCES ${refTable} (${refCols})`;
    if (fk.onDelete) line += ` ON DELETE ${fk.onDelete}`;
    if (fk.onUpdate) line += ` ON UPDATE ${fk.onUpdate}`;
    defs.push(line);
  }

  let sql = `CREATE TABLE ${target} (\n${defs.join(",\n")}\n)`;
  if (kind !== "postgres") {
    const opts: string[] = [];
    if (draft.engine.trim()) opts.push(`ENGINE=${draft.engine.trim()}`);
    if (draft.charset.trim()) opts.push(`DEFAULT CHARSET=${draft.charset.trim()}`);
    if (draft.collation.trim()) opts.push(`COLLATE=${draft.collation.trim()}`);
    if (draft.comment.trim()) opts.push(`COMMENT=${escapeSqlLiteral(draft.comment.trim())}`);
    if (opts.length > 0) sql += ` ${opts.join(" ")}`;
  }
  sql += ";";

  const extraStmts: string[] = [sql];

  if (kind === "postgres") {
    for (const idx of draft.indexes.filter((i) => i.name.trim() && i.columns.length > 0)) {
      const uniq = idx.isUnique ? "UNIQUE " : "";
      const cols = idx.columns.map((c) => quoteIdentifier(kind, c)).join(", ");
      const method = idx.indexType ? ` USING ${idx.indexType}` : "";
      extraStmts.push(
        `CREATE ${uniq}INDEX ${quoteIdentifier(kind, idx.name)} ON ${target}${method} (${cols});`
      );
    }
    if (draft.comment.trim()) {
      extraStmts.push(
        `COMMENT ON TABLE ${target} IS ${escapeSqlLiteral(draft.comment.trim())};`
      );
    }
    for (const f of validFields) {
      if (f.comment.trim()) {
        extraStmts.push(
          `COMMENT ON COLUMN ${target}.${quoteIdentifier(kind, f.name)} IS ${escapeSqlLiteral(f.comment.trim())};`
        );
      }
    }
  }

  for (const trg of draft.triggers.filter((t) => t.name.trim() && t.body.trim())) {
    if (kind === "postgres") {
      extraStmts.push(
        `-- PostgreSQL trigger requires a trigger function:\nCREATE TRIGGER ${quoteIdentifier(kind, trg.name)} ${trg.timing} ${trg.event} ON ${target} FOR EACH ROW EXECUTE FUNCTION ${trg.body.trim()};`
      );
    } else {
      extraStmts.push(
        `CREATE TRIGGER ${quoteIdentifier(kind, trg.name)} ${trg.timing} ${trg.event} ON ${target} FOR EACH ROW ${trg.body.trim()};`
      );
    }
  }

  return extraStmts.join("\n\n");
}

export function generateAlterTableSql(
  kind: DbKind,
  original: TableDesignDraft,
  current: TableDesignDraft
): string {
  const target = formatQualifiedTable(
    kind,
    current.database,
    current.schema,
    original.tableName
  );
  const stmts: string[] = [];

  if (original.tableName !== current.tableName && current.tableName.trim()) {
    if (kind === "postgres") {
      stmts.push(
        `ALTER TABLE ${target} RENAME TO ${quoteIdentifier(kind, current.tableName.trim())};`
      );
    } else {
      const nextTarget = formatQualifiedTable(
        kind,
        current.database,
        current.schema,
        current.tableName.trim()
      );
      stmts.push(`RENAME TABLE ${target} TO ${nextTarget};`);
    }
  }

  const origByName = new Map(
    original.fields.map((f) => [f.originalName || f.name, f])
  );
  const currOriginals = new Set(
    current.fields.map((f) => f.originalName).filter((n): n is string => Boolean(n))
  );

  // Dropped columns
  for (const orig of original.fields) {
    if (!currOriginals.has(orig.name)) {
      stmts.push(
        `ALTER TABLE ${target} DROP COLUMN ${quoteIdentifier(kind, orig.name)};`
      );
    }
  }

  // Added or modified columns
  for (const field of current.fields.filter((f) => f.name.trim())) {
    if (!field.originalName) {
      stmts.push(
        `ALTER TABLE ${target} ADD COLUMN ${buildFieldDefSql(kind, field)};`
      );
      continue;
    }

    const orig = origByName.get(field.originalName);
    if (!orig) continue;

    if (field.originalName !== field.name) {
      if (kind === "postgres") {
        stmts.push(
          `ALTER TABLE ${target} RENAME COLUMN ${quoteIdentifier(kind, field.originalName)} TO ${quoteIdentifier(kind, field.name)};`
        );
      } else {
        stmts.push(
          `ALTER TABLE ${target} CHANGE COLUMN ${quoteIdentifier(kind, field.originalName)} ${buildFieldDefSql(kind, field)};`
        );
        continue;
      }
    }

    const changed =
      orig.dataType !== field.dataType ||
      orig.length !== field.length ||
      orig.nullable !== field.nullable ||
      orig.defaultValue !== field.defaultValue ||
      orig.isAutoIncrement !== field.isAutoIncrement ||
      orig.comment !== field.comment;

    if (changed) {
      if (kind === "postgres") {
        const qCol = quoteIdentifier(kind, field.name);
        if (orig.dataType !== field.dataType || orig.length !== field.length) {
          stmts.push(
            `ALTER TABLE ${target} ALTER COLUMN ${qCol} TYPE ${formatFieldTypeClause(kind, field)};`
          );
        }
        if (orig.nullable !== field.nullable) {
          stmts.push(
            `ALTER TABLE ${target} ALTER COLUMN ${qCol} ${field.nullable ? "DROP NOT NULL" : "SET NOT NULL"};`
          );
        }
        if (orig.defaultValue !== field.defaultValue) {
          if (field.defaultValue.trim()) {
            stmts.push(
              `ALTER TABLE ${target} ALTER COLUMN ${qCol} SET DEFAULT ${field.defaultValue.trim()};`
            );
          } else {
            stmts.push(`ALTER TABLE ${target} ALTER COLUMN ${qCol} DROP DEFAULT;`);
          }
        }
        if (orig.comment !== field.comment) {
          stmts.push(
            `COMMENT ON COLUMN ${target}.${qCol} IS ${escapeSqlLiteral(field.comment.trim())};`
          );
        }
      } else {
        stmts.push(
          `ALTER TABLE ${target} MODIFY COLUMN ${buildFieldDefSql(kind, field)};`
        );
      }
    }
  }

  // New indexes
  const origIdxNames = new Set(original.indexes.map((i) => i.name));
  for (const idx of current.indexes.filter(
    (i) => i.name.trim() && i.columns.length > 0 && !origIdxNames.has(i.name)
  )) {
    const cols = idx.columns.map((c) => quoteIdentifier(kind, c)).join(", ");
    const uniq = idx.isUnique ? "UNIQUE " : "";
    if (kind === "postgres") {
      const method = idx.indexType ? ` USING ${idx.indexType}` : "";
      stmts.push(
        `CREATE ${uniq}INDEX ${quoteIdentifier(kind, idx.name)} ON ${target}${method} (${cols});`
      );
    } else {
      stmts.push(
        `CREATE ${uniq}INDEX ${quoteIdentifier(kind, idx.name)} ON ${target} (${cols});`
      );
    }
  }

  // Dropped indexes
  const currIdxNames = new Set(current.indexes.map((i) => i.originalName || i.name));
  for (const origIdx of original.indexes) {
    if (!currIdxNames.has(origIdx.name) && origIdx.name.toUpperCase() !== "PRIMARY") {
      if (kind === "postgres") {
        stmts.push(`DROP INDEX IF EXISTS ${quoteIdentifier(kind, origIdx.name)};`);
      } else {
        stmts.push(
          `ALTER TABLE ${target} DROP INDEX ${quoteIdentifier(kind, origIdx.name)};`
        );
      }
    }
  }

  // New triggers
  for (const trg of current.triggers.filter((t) => t.name.trim() && t.body.trim())) {
    stmts.push(
      `CREATE TRIGGER ${quoteIdentifier(kind, trg.name)} ${trg.timing} ${trg.event} ON ${target} FOR EACH ROW ${trg.body.trim()};`
    );
  }

  if (original.comment !== current.comment) {
    if (kind === "postgres") {
      stmts.push(
        `COMMENT ON TABLE ${target} IS ${escapeSqlLiteral(current.comment.trim())};`
      );
    } else {
      stmts.push(
        `ALTER TABLE ${target} COMMENT = ${escapeSqlLiteral(current.comment.trim())};`
      );
    }
  }

  return stmts.length > 0 ? stmts.join("\n") : "-- 尚無結構變更";
}
