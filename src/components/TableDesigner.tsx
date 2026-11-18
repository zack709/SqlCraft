import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  FileCode2,
  KeyRound,
  Loader2,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import {
  generateAlterTableSql,
  generateCreateTableSql,
  type DesignerField,
  type DesignerForeignKey,
  type DesignerIndex,
  type DesignerTrigger,
  type TableDesignDraft,
} from "../lib/sql-builder";
import { useWorkbenchStore, type WorkspaceTab } from "../store/workbenchStore";
import type { ColumnInfo, DbKind, ForeignKeyInfo, IndexInfo } from "../types/database";

type TableDesignTab = Extract<WorkspaceTab, { kind: "table-design" }>;
type DesignerSubTab = "fields" | "indexes" | "fks" | "triggers" | "options" | "sql";

interface TableDesignerProps {
  tab: TableDesignTab;
}

const MYSQL_TYPES = [
  "bigint",
  "int",
  "smallint",
  "tinyint",
  "varchar",
  "char",
  "text",
  "longtext",
  "decimal",
  "double",
  "boolean",
  "date",
  "datetime",
  "timestamp",
  "json",
  "blob",
];

const PG_TYPES = [
  "bigint",
  "integer",
  "smallint",
  "text",
  "varchar",
  "char",
  "numeric",
  "double precision",
  "boolean",
  "uuid",
  "date",
  "timestamp",
  "timestamptz",
  "jsonb",
  "bytea",
];

function splitTypeAndLength(columnType: string, dataType: string): {
  base: string;
  len: string;
} {
  const m = columnType.match(/^([a-zA-Z0-9_ ]+)\(([^)]+)\)/);
  if (m) {
    return { base: m[1].trim(), len: m[2].trim() };
  }
  return { base: dataType || columnType, len: "" };
}

function tabToDraft(tab: TableDesignTab, kind: DbKind): TableDesignDraft {
  const fields: DesignerField[] = tab.columns.map((c, idx) => {
    const parsed = splitTypeAndLength(c.columnType, c.dataType);
    return {
      id: `fld-${idx}-${c.name}`,
      originalName: tab.isNew ? undefined : c.name,
      name: c.name,
      dataType: parsed.base,
      length: parsed.len,
      nullable: c.nullable,
      isPrimaryKey: c.isPrimaryKey,
      isAutoIncrement: c.isAutoIncrement,
      defaultValue: c.defaultValue ?? "",
      comment: c.comment ?? "",
    };
  });

  const indexes: DesignerIndex[] = tab.indexes
    .filter((i) => !i.isPrimary)
    .map((i, idx) => ({
      id: `idx-${idx}-${i.name}`,
      originalName: i.name,
      name: i.name,
      columns: i.columns,
      indexType: i.indexType ?? (kind === "postgres" ? "btree" : "BTREE"),
      isUnique: i.isUnique,
      comment: i.comment ?? "",
    }));

  const foreignKeys: DesignerForeignKey[] = tab.foreignKeys.map((fk, idx) => ({
    id: `fk-${idx}-${fk.name}`,
    originalName: fk.name,
    name: fk.name,
    columns: fk.columns,
    referencedSchema: fk.referencedSchema ?? (tab.schema || ""),
    referencedTable: fk.referencedTable,
    referencedColumns: fk.referencedColumns,
    onDelete: fk.onDelete ?? "RESTRICT",
    onUpdate: fk.onUpdate ?? "CASCADE",
  }));

  return {
    database: tab.database,
    schema: tab.schema ?? null,
    tableName: tab.tableName,
    engine: kind === "postgres" ? "" : "InnoDB",
    charset: kind === "postgres" ? "UTF8" : "utf8mb4",
    collation: kind === "postgres" ? "" : "utf8mb4_unicode_ci",
    tablespace: kind === "postgres" ? "pg_default" : "",
    comment: "",
    fields,
    indexes,
    foreignKeys,
    triggers: [],
  };
}

export function TableDesigner({ tab }: TableDesignerProps) {
  const { applyTableDesignSql, getProfileById, language } = useWorkbenchStore();
  const isEn = language === "en";
  const profile = getProfileById(tab.profileId);
  const kind: DbKind = profile?.dbKind ?? "mysql";

  const [subTab, setSubTab] = useState<DesignerSubTab>("fields");
  const [originalDraft, setOriginalDraft] = useState<TableDesignDraft>(() =>
    tabToDraft(tab, kind)
  );
  const [draft, setDraft] = useState<TableDesignDraft>(() => tabToDraft(tab, kind));
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const next = tabToDraft(tab, kind);
    setOriginalDraft(next);
    setDraft(next);
    setSelectedRowId(next.fields[0]?.id ?? null);
    setErrorMsg(null);
  }, [tab.id, tab.loading, tab.columns, tab.indexes, tab.foreignKeys, tab.isNew, kind]);

  const generatedSql = useMemo(() => {
    if (tab.isNew) {
      return generateCreateTableSql(kind, draft);
    }
    return generateAlterTableSql(kind, originalDraft, draft);
  }, [tab.isNew, kind, originalDraft, draft]);

  const typeChoices = kind === "postgres" ? PG_TYPES : MYSQL_TYPES;

  const handleAddItem = () => {
    if (subTab === "fields") {
      const nextId = `fld-${Date.now()}`;
      setDraft((d) => ({
        ...d,
        fields: [
          ...d.fields,
          {
            id: nextId,
            name: `col_${d.fields.length + 1}`,
            dataType: kind === "postgres" ? "text" : "varchar",
            length: kind === "postgres" ? "" : "100",
            nullable: true,
            isPrimaryKey: false,
            isAutoIncrement: false,
            defaultValue: "",
            comment: "",
          },
        ],
      }));
      setSelectedRowId(nextId);
    } else if (subTab === "indexes") {
      const nextId = `idx-${Date.now()}`;
      setDraft((d) => ({
        ...d,
        indexes: [
          ...d.indexes,
          {
            id: nextId,
            name: `idx_${d.tableName}_${d.indexes.length + 1}`,
            columns: d.fields[0] ? [d.fields[0].name] : [],
            indexType: kind === "postgres" ? "btree" : "BTREE",
            isUnique: false,
            comment: "",
          },
        ],
      }));
      setSelectedRowId(nextId);
    } else if (subTab === "fks") {
      const nextId = `fk-${Date.now()}`;
      setDraft((d) => ({
        ...d,
        foreignKeys: [
          ...d.foreignKeys,
          {
            id: nextId,
            name: `fk_${d.tableName}_${d.foreignKeys.length + 1}`,
            columns: d.fields[0] ? [d.fields[0].name] : [],
            referencedSchema: d.schema ?? d.database,
            referencedTable: "",
            referencedColumns: ["id"],
            onDelete: "RESTRICT",
            onUpdate: "CASCADE",
          },
        ],
      }));
      setSelectedRowId(nextId);
    } else if (subTab === "triggers") {
      const nextId = `trg-${Date.now()}`;
      const newTrg: DesignerTrigger = {
        id: nextId,
        name: `trg_${draft.tableName}_bi`,
        timing: "BEFORE",
        event: "INSERT",
        body: kind === "postgres" ? "audit_trigger_fn()" : "BEGIN\n  -- SQL\nEND",
      };
      setDraft((d) => ({ ...d, triggers: [...d.triggers, newTrg] }));
      setSelectedRowId(nextId);
    }
  };

  const handleDeleteSelected = () => {
    if (!selectedRowId) return;
    if (subTab === "fields") {
      setDraft((d) => ({
        ...d,
        fields: d.fields.filter((f) => f.id !== selectedRowId),
      }));
    } else if (subTab === "indexes") {
      setDraft((d) => ({
        ...d,
        indexes: d.indexes.filter((i) => i.id !== selectedRowId),
      }));
    } else if (subTab === "fks") {
      setDraft((d) => ({
        ...d,
        foreignKeys: d.foreignKeys.filter((k) => k.id !== selectedRowId),
      }));
    } else if (subTab === "triggers") {
      setDraft((d) => ({
        ...d,
        triggers: d.triggers.filter((t) => t.id !== selectedRowId),
      }));
    }
    setSelectedRowId(null);
  };

  const moveField = (delta: -1 | 1) => {
    if (subTab !== "fields" || !selectedRowId) return;
    setDraft((d) => {
      const idx = d.fields.findIndex((f) => f.id === selectedRowId);
      const nextIdx = idx + delta;
      if (idx < 0 || nextIdx < 0 || nextIdx >= d.fields.length) return d;
      const copy = [...d.fields];
      const [item] = copy.splice(idx, 1);
      copy.splice(nextIdx, 0, item);
      return { ...d, fields: copy };
    });
  };

  const handleSave = async () => {
    if (!draft.tableName.trim()) {
      setErrorMsg(isEn ? "Please enter a table name" : "請輸入資料表名稱");
      return;
    }
    if (generatedSql.startsWith("-- 尚無結構變更") || generatedSql.startsWith("-- No schema changes")) return;

    setSaving(true);
    setErrorMsg(null);
    try {
      const demoCols: ColumnInfo[] = draft.fields.map((f, i) => ({
        name: f.name,
        ordinalPosition: i + 1,
        dataType: f.dataType,
        columnType: f.length ? `${f.dataType}(${f.length})` : f.dataType,
        nullable: f.nullable,
        defaultValue: f.defaultValue || null,
        isPrimaryKey: f.isPrimaryKey,
        isAutoIncrement: f.isAutoIncrement,
        characterSet: draft.charset || null,
        collation: draft.collation || null,
        comment: f.comment || null,
      }));
      const demoIdxs: IndexInfo[] = draft.indexes.map((idx) => ({
        name: idx.name,
        columns: idx.columns,
        isUnique: idx.isUnique,
        isPrimary: false,
        indexType: idx.indexType,
        comment: idx.comment || null,
      }));
      const demoFks: ForeignKeyInfo[] = draft.foreignKeys.map((fk) => ({
        name: fk.name,
        columns: fk.columns,
        referencedSchema: fk.referencedSchema || null,
        referencedTable: fk.referencedTable,
        referencedColumns: fk.referencedColumns,
        onDelete: fk.onDelete,
        onUpdate: fk.onUpdate,
      }));

      await applyTableDesignSql(
        tab.id,
        generatedSql,
        draft.tableName.trim(),
        Boolean(tab.isNew),
        {
          columns: demoCols,
          indexes: demoIdxs,
          foreignKeys: demoFks,
          ddl: generatedSql,
        }
      );
    } catch (err) {
      setErrorMsg(String(err));
    } finally {
      setSaving(false);
    }
  };

  if (tab.loading) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-[#64748b] text-xs">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>{isEn ? "Loading table structure..." : "正在讀取資料表結構..."}</span>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white text-[11px]">
      {/* Designer Toolbar */}
      <div className="flex h-[32px] items-center justify-between border-b border-[#dcdfe6] bg-[#f8f9fb] px-2.5">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="flex items-center gap-1 rounded bg-[#2563eb] px-2.5 py-1 font-medium text-white hover:bg-[#1d4ed8] disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            <span>
              {saving
                ? isEn
                  ? "Applying..."
                  : "套用中..."
                : isEn
                ? "Save Structure"
                : "儲存結構"}
            </span>
          </button>

          <div className="flex items-center gap-1 ml-2">
            <span className="text-[#64748b]">{isEn ? "Table Name:" : "資料表名稱："}</span>
            <input
              type="text"
              value={draft.tableName}
              onChange={(e) => setDraft({ ...draft, tableName: e.target.value })}
              className="h-6 w-44 rounded border border-[#cbd5e1] bg-white px-2 font-mono font-semibold outline-none focus:border-[#2563eb]"
            />
          </div>

          {["fields", "indexes", "fks", "triggers"].includes(subTab) && (
            <>
              <span className="mx-1 h-4 border-l border-[#cbd5e1]" />
              <button
                type="button"
                onClick={handleAddItem}
                className="flex items-center gap-1 rounded border border-[#cbd5e1] bg-white px-2 py-0.5 hover:bg-[#eff6ff]"
              >
                <Plus className="h-3 w-3 text-[#16a34a]" />
                <span>{isEn ? "Add" : "新增"}</span>
              </button>
              <button
                type="button"
                disabled={!selectedRowId}
                onClick={handleDeleteSelected}
                className="flex items-center gap-1 rounded border border-[#cbd5e1] bg-white px-2 py-0.5 hover:bg-[#fef2f2] disabled:opacity-40"
              >
                <Trash2 className="h-3 w-3 text-[#dc2626]" />
                <span>{isEn ? "Delete" : "刪除"}</span>
              </button>
            </>
          )}

          {subTab === "fields" && (
            <>
              <button
                type="button"
                disabled={!selectedRowId}
                onClick={() => moveField(-1)}
                title={isEn ? "Move Field Up" : "上移欄位"}
                className="rounded border border-[#cbd5e1] bg-white p-1 hover:bg-[#f1f5f9] disabled:opacity-40"
              >
                <ArrowUp className="h-3 w-3" />
              </button>
              <button
                type="button"
                disabled={!selectedRowId}
                onClick={() => moveField(1)}
                title={isEn ? "Move Field Down" : "下移欄位"}
                className="rounded border border-[#cbd5e1] bg-white p-1 hover:bg-[#f1f5f9] disabled:opacity-40"
              >
                <ArrowDown className="h-3 w-3" />
              </button>
            </>
          )}
        </div>

        <span className="text-[10px] font-mono text-[#64748b]">
          {tab.database}
          {tab.schema ? `.${tab.schema}` : ""} ({kind.toUpperCase()})
        </span>
      </div>

      {/* 6 Navicat Designer Sub-tabs */}
      <div className="flex border-b border-[#d4d8e0] bg-[#eef2f6] px-2.5 pt-1.5">
        {(
          [
            { id: "fields", label: `${isEn ? "Fields" : "欄位"} (${draft.fields.length})` },
            { id: "indexes", label: `${isEn ? "Indexes" : "索引"} (${draft.indexes.length})` },
            { id: "fks", label: `${isEn ? "Foreign Keys" : "外鍵"} (${draft.foreignKeys.length})` },
            { id: "triggers", label: `${isEn ? "Triggers" : "觸發器"} (${draft.triggers.length})` },
            { id: "options", label: isEn ? "Options & Comment" : "選項與註解" },
            { id: "sql", label: isEn ? "SQL Preview" : "SQL 預覽" },
          ] as { id: DesignerSubTab; label: string }[]
        ).map((st) => (
          <button
            key={st.id}
            type="button"
            onClick={() => setSubTab(st.id)}
            className={`mr-1 rounded-t px-3 py-1 font-medium transition ${
              subTab === st.id
                ? "border border-b-white border-[#d4d8e0] bg-white text-[#1d4ed8] -mb-[1px]"
                : "text-[#475569] hover:bg-white/60"
            }`}
          >
            {st.label}
          </button>
        ))}
      </div>

      {errorMsg && (
        <div className="border-b border-[#fecaca] bg-[#fef2f2] px-3 py-1.5 font-mono text-[10px] text-[#991b1b]">
          {errorMsg}
        </div>
      )}

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <datalist id={`types-${tab.id}`}>
          {typeChoices.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>

        {subTab === "fields" && (
          <table className="w-full border-collapse border border-[#e2e8f0] text-left">
            <thead className="bg-[#f4f6f9] text-[#475569]">
              <tr className="h-[26px] border-b border-[#d4d8e0]">
                <th className="w-40 border-r border-[#e2e8f0] px-2 font-medium">
                  {isEn ? "Name" : "名稱"}
                </th>
                <th className="w-32 border-r border-[#e2e8f0] px-2 font-medium">
                  {isEn ? "Type" : "類型"}
                </th>
                <th className="w-20 border-r border-[#e2e8f0] px-2 font-medium">
                  {isEn ? "Length" : "長度"}
                </th>
                <th className="w-16 border-r border-[#e2e8f0] px-2 text-center font-medium">
                  {isEn ? "Nullable" : "允許 Null"}
                </th>
                <th className="w-14 border-r border-[#e2e8f0] px-2 text-center font-medium">
                  {isEn ? "Primary" : "主鍵"}
                </th>
                <th className="w-16 border-r border-[#e2e8f0] px-2 text-center font-medium">
                  {isEn ? "Auto Inc" : "自動遞增"}
                </th>
                <th className="w-36 border-r border-[#e2e8f0] px-2 font-medium">
                  {isEn ? "Default" : "預設值"}
                </th>
                <th className="px-2 font-medium">{isEn ? "Comment" : "註解"}</th>
              </tr>
            </thead>
            <tbody>
              {draft.fields.map((f) => {
                const selected = selectedRowId === f.id;
                const updateField = (patch: Partial<DesignerField>) =>
                  setDraft((d) => ({
                    ...d,
                    fields: d.fields.map((item) =>
                      item.id === f.id ? { ...item, ...patch } : item
                    ),
                  }));
                return (
                  <tr
                    key={f.id}
                    onClick={() => setSelectedRowId(f.id)}
                    className={`h-[26px] border-b border-[#f1f5f9] ${
                      selected ? "bg-[#eff6ff]" : "hover:bg-[#f8fafc]"
                    }`}
                  >
                    <td className="border-r border-[#f1f5f9] p-0.5">
                      <input
                        type="text"
                        value={f.name}
                        onChange={(e) => updateField({ name: e.target.value })}
                        className="h-6 w-full bg-transparent px-1.5 font-mono outline-none focus:bg-white"
                      />
                    </td>
                    <td className="border-r border-[#f1f5f9] p-0.5">
                      <input
                        type="text"
                        list={`types-${tab.id}`}
                        value={f.dataType}
                        onChange={(e) => updateField({ dataType: e.target.value })}
                        className="h-6 w-full bg-transparent px-1.5 font-mono outline-none focus:bg-white"
                      />
                    </td>
                    <td className="border-r border-[#f1f5f9] p-0.5">
                      <input
                        type="text"
                        value={f.length}
                        onChange={(e) => updateField({ length: e.target.value })}
                        className="h-6 w-full bg-transparent px-1.5 font-mono outline-none focus:bg-white"
                      />
                    </td>
                    <td className="border-r border-[#f1f5f9] text-center">
                      <input
                        type="checkbox"
                        checked={f.nullable}
                        onChange={(e) => updateField({ nullable: e.target.checked })}
                      />
                    </td>
                    <td className="border-r border-[#f1f5f9] text-center">
                      <button
                        type="button"
                        onClick={() =>
                          updateField({
                            isPrimaryKey: !f.isPrimaryKey,
                            nullable: !f.isPrimaryKey ? false : f.nullable,
                          })
                        }
                        className={`rounded p-0.5 ${
                          f.isPrimaryKey ? "text-[#d97706]" : "text-[#cbd5e1]"
                        }`}
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                      </button>
                    </td>
                    <td className="border-r border-[#f1f5f9] text-center">
                      <input
                        type="checkbox"
                        checked={f.isAutoIncrement}
                        onChange={(e) =>
                          updateField({ isAutoIncrement: e.target.checked })
                        }
                      />
                    </td>
                    <td className="border-r border-[#f1f5f9] p-0.5">
                      <input
                        type="text"
                        value={f.defaultValue}
                        onChange={(e) => updateField({ defaultValue: e.target.value })}
                        className="h-6 w-full bg-transparent px-1.5 font-mono outline-none focus:bg-white"
                      />
                    </td>
                    <td className="p-0.5">
                      <input
                        type="text"
                        value={f.comment}
                        onChange={(e) => updateField({ comment: e.target.value })}
                        className="h-6 w-full bg-transparent px-1.5 outline-none focus:bg-white"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {subTab === "indexes" && (
          <table className="w-full border-collapse border border-[#e2e8f0] text-left">
            <thead className="bg-[#f4f6f9] text-[#475569]">
              <tr className="h-[26px] border-b border-[#d4d8e0]">
                <th className="w-48 border-r border-[#e2e8f0] px-2 font-medium">
                  {isEn ? "Index Name" : "索引名稱"}
                </th>
                <th className="w-56 border-r border-[#e2e8f0] px-2 font-medium">
                  {isEn ? "Columns (comma-separated)" : "欄位（逗號分隔）"}
                </th>
                <th className="w-28 border-r border-[#e2e8f0] px-2 font-medium">
                  {isEn ? "Method" : "索引方法"}
                </th>
                <th className="w-20 border-r border-[#e2e8f0] px-2 text-center font-medium">
                  {isEn ? "Unique" : "唯一 (Unique)"}
                </th>
                <th className="px-2 font-medium">{isEn ? "Comment" : "註解"}</th>
              </tr>
            </thead>
            <tbody>
              {draft.indexes.map((idx) => (
                <tr
                  key={idx.id}
                  onClick={() => setSelectedRowId(idx.id)}
                  className={`h-[26px] border-b border-[#f1f5f9] ${
                    selectedRowId === idx.id ? "bg-[#eff6ff]" : "hover:bg-[#f8fafc]"
                  }`}
                >
                  <td className="border-r border-[#f1f5f9] p-0.5">
                    <input
                      type="text"
                      value={idx.name}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          indexes: d.indexes.map((x) =>
                            x.id === idx.id ? { ...x, name: e.target.value } : x
                          ),
                        }))
                      }
                      className="h-6 w-full bg-transparent px-1.5 font-mono outline-none"
                    />
                  </td>
                  <td className="border-r border-[#f1f5f9] p-0.5">
                    <input
                      type="text"
                      value={idx.columns.join(", ")}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          indexes: d.indexes.map((x) =>
                            x.id === idx.id
                              ? {
                                  ...x,
                                  columns: e.target.value
                                    .split(",")
                                    .map((s) => s.trim())
                                    .filter(Boolean),
                                }
                              : x
                          ),
                        }))
                      }
                      className="h-6 w-full bg-transparent px-1.5 font-mono outline-none"
                    />
                  </td>
                  <td className="border-r border-[#f1f5f9] p-0.5">
                    <select
                      value={idx.indexType}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          indexes: d.indexes.map((x) =>
                            x.id === idx.id ? { ...x, indexType: e.target.value } : x
                          ),
                        }))
                      }
                      className="h-6 w-full bg-transparent px-1 font-mono outline-none"
                    >
                      {kind === "postgres" ? (
                        <>
                          <option value="btree">btree</option>
                          <option value="hash">hash</option>
                          <option value="gin">gin</option>
                          <option value="gist">gist</option>
                        </>
                      ) : (
                        <>
                          <option value="BTREE">BTREE</option>
                          <option value="HASH">HASH</option>
                          <option value="FULLTEXT">FULLTEXT</option>
                        </>
                      )}
                    </select>
                  </td>
                  <td className="border-r border-[#f1f5f9] text-center">
                    <input
                      type="checkbox"
                      checked={idx.isUnique}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          indexes: d.indexes.map((x) =>
                            x.id === idx.id ? { ...x, isUnique: e.target.checked } : x
                          ),
                        }))
                      }
                    />
                  </td>
                  <td className="p-0.5">
                    <input
                      type="text"
                      value={idx.comment}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          indexes: d.indexes.map((x) =>
                            x.id === idx.id ? { ...x, comment: e.target.value } : x
                          ),
                        }))
                      }
                      className="h-6 w-full bg-transparent px-1.5 outline-none"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {subTab === "fks" && (
          <table className="w-full border-collapse border border-[#e2e8f0] text-left">
            <thead className="bg-[#f4f6f9] text-[#475569]">
              <tr className="h-[26px] border-b border-[#d4d8e0]">
                <th className="w-40 border-r border-[#e2e8f0] px-2 font-medium">
                  {isEn ? "FK Name" : "外鍵名稱"}
                </th>
                <th className="w-36 border-r border-[#e2e8f0] px-2 font-medium">
                  {isEn ? "Source Column" : "來源欄位"}
                </th>
                <th className="w-32 border-r border-[#e2e8f0] px-2 font-medium">
                  {isEn ? "Ref Schema" : "參照 Schema"}
                </th>
                <th className="w-36 border-r border-[#e2e8f0] px-2 font-medium">
                  {isEn ? "Ref Table" : "參照資料表"}
                </th>
                <th className="w-36 border-r border-[#e2e8f0] px-2 font-medium">
                  {isEn ? "Ref Column" : "參照欄位"}
                </th>
                <th className="w-28 border-r border-[#e2e8f0] px-2 font-medium">ON DELETE</th>
                <th className="w-28 px-2 font-medium">ON UPDATE</th>
              </tr>
            </thead>
            <tbody>
              {draft.foreignKeys.map((fk) => (
                <tr
                  key={fk.id}
                  onClick={() => setSelectedRowId(fk.id)}
                  className={`h-[26px] border-b border-[#f1f5f9] ${
                    selectedRowId === fk.id ? "bg-[#eff6ff]" : "hover:bg-[#f8fafc]"
                  }`}
                >
                  <td className="border-r border-[#f1f5f9] p-0.5">
                    <input
                      type="text"
                      value={fk.name}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          foreignKeys: d.foreignKeys.map((x) =>
                            x.id === fk.id ? { ...x, name: e.target.value } : x
                          ),
                        }))
                      }
                      className="h-6 w-full bg-transparent px-1.5 font-mono outline-none"
                    />
                  </td>
                  <td className="border-r border-[#f1f5f9] p-0.5">
                    <input
                      type="text"
                      value={fk.columns.join(", ")}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          foreignKeys: d.foreignKeys.map((x) =>
                            x.id === fk.id
                              ? {
                                  ...x,
                                  columns: e.target.value
                                    .split(",")
                                    .map((s) => s.trim())
                                    .filter(Boolean),
                                }
                              : x
                          ),
                        }))
                      }
                      className="h-6 w-full bg-transparent px-1.5 font-mono outline-none"
                    />
                  </td>
                  <td className="border-r border-[#f1f5f9] p-0.5">
                    <input
                      type="text"
                      value={fk.referencedSchema}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          foreignKeys: d.foreignKeys.map((x) =>
                            x.id === fk.id
                              ? { ...x, referencedSchema: e.target.value }
                              : x
                          ),
                        }))
                      }
                      className="h-6 w-full bg-transparent px-1.5 font-mono outline-none"
                    />
                  </td>
                  <td className="border-r border-[#f1f5f9] p-0.5">
                    <input
                      type="text"
                      value={fk.referencedTable}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          foreignKeys: d.foreignKeys.map((x) =>
                            x.id === fk.id
                              ? { ...x, referencedTable: e.target.value }
                              : x
                          ),
                        }))
                      }
                      className="h-6 w-full bg-transparent px-1.5 font-mono outline-none"
                    />
                  </td>
                  <td className="border-r border-[#f1f5f9] p-0.5">
                    <input
                      type="text"
                      value={fk.referencedColumns.join(", ")}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          foreignKeys: d.foreignKeys.map((x) =>
                            x.id === fk.id
                              ? {
                                  ...x,
                                  referencedColumns: e.target.value
                                    .split(",")
                                    .map((s) => s.trim())
                                    .filter(Boolean),
                                }
                              : x
                          ),
                        }))
                      }
                      className="h-6 w-full bg-transparent px-1.5 font-mono outline-none"
                    />
                  </td>
                  <td className="border-r border-[#f1f5f9] p-0.5">
                    <select
                      value={fk.onDelete}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          foreignKeys: d.foreignKeys.map((x) =>
                            x.id === fk.id ? { ...x, onDelete: e.target.value } : x
                          ),
                        }))
                      }
                      className="h-6 w-full bg-transparent px-1 font-mono outline-none"
                    >
                      <option value="RESTRICT">RESTRICT</option>
                      <option value="CASCADE">CASCADE</option>
                      <option value="SET NULL">SET NULL</option>
                      <option value="NO ACTION">NO ACTION</option>
                    </select>
                  </td>
                  <td className="p-0.5">
                    <select
                      value={fk.onUpdate}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          foreignKeys: d.foreignKeys.map((x) =>
                            x.id === fk.id ? { ...x, onUpdate: e.target.value } : x
                          ),
                        }))
                      }
                      className="h-6 w-full bg-transparent px-1 font-mono outline-none"
                    >
                      <option value="CASCADE">CASCADE</option>
                      <option value="RESTRICT">RESTRICT</option>
                      <option value="SET NULL">SET NULL</option>
                      <option value="NO ACTION">NO ACTION</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {subTab === "triggers" && (
          <div className="space-y-3">
            {draft.triggers.length === 0 ? (
              <div className="rounded border border-dashed border-[#cbd5e1] p-6 text-center text-[#64748b]">
                {isEn
                  ? "No triggers yet; click \"+ Add\" above to create one."
                  : "尚無觸發器；點選上方「+ 新增」建立觸發器定義。"}
              </div>
            ) : (
              draft.triggers.map((trg) => (
                <div
                  key={trg.id}
                  onClick={() => setSelectedRowId(trg.id)}
                  className={`rounded border p-3 space-y-2 ${
                    selectedRowId === trg.id
                      ? "border-[#2563eb] bg-[#f8fafc]"
                      : "border-[#e2e8f0]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={trg.name}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          triggers: d.triggers.map((x) =>
                            x.id === trg.id ? { ...x, name: e.target.value } : x
                          ),
                        }))
                      }
                      className="h-6 w-52 rounded border border-[#cbd5e1] px-2 font-mono"
                    />
                    <select
                      value={trg.timing}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          triggers: d.triggers.map((x) =>
                            x.id === trg.id
                              ? { ...x, timing: e.target.value as "BEFORE" | "AFTER" }
                              : x
                          ),
                        }))
                      }
                      className="h-6 rounded border border-[#cbd5e1] bg-white px-2 font-mono"
                    >
                      <option value="BEFORE">BEFORE</option>
                      <option value="AFTER">AFTER</option>
                    </select>
                    <select
                      value={trg.event}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          triggers: d.triggers.map((x) =>
                            x.id === trg.id
                              ? {
                                  ...x,
                                  event: e.target.value as "INSERT" | "UPDATE" | "DELETE",
                                }
                              : x
                          ),
                        }))
                      }
                      className="h-6 rounded border border-[#cbd5e1] bg-white px-2 font-mono"
                    >
                      <option value="INSERT">INSERT</option>
                      <option value="UPDATE">UPDATE</option>
                      <option value="DELETE">DELETE</option>
                    </select>
                  </div>
                  <textarea
                    value={trg.body}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        triggers: d.triggers.map((x) =>
                          x.id === trg.id ? { ...x, body: e.target.value } : x
                        ),
                      }))
                    }
                    rows={3}
                    className="w-full rounded border border-[#cbd5e1] bg-white p-2 font-mono text-[11px] outline-none"
                  />
                </div>
              ))
            )}
          </div>
        )}

        {subTab === "options" && (
          <div className="max-w-lg grid grid-cols-[120px_1fr] items-center gap-y-3 gap-x-3">
            {kind !== "postgres" ? (
              <>
                <label className="text-right text-[#475569]">
                  {isEn ? "Storage Engine:" : "儲存引擎："}
                </label>
                <input
                  type="text"
                  value={draft.engine}
                  onChange={(e) => setDraft({ ...draft, engine: e.target.value })}
                  className="h-7 rounded border border-[#cbd5e1] px-2 font-mono"
                />
                <label className="text-right text-[#475569]">
                  {isEn ? "Charset:" : "字元集："}
                </label>
                <input
                  type="text"
                  value={draft.charset}
                  onChange={(e) => setDraft({ ...draft, charset: e.target.value })}
                  className="h-7 rounded border border-[#cbd5e1] px-2 font-mono"
                />
                <label className="text-right text-[#475569]">
                  {isEn ? "Collation:" : "定序 (Collation)："}
                </label>
                <input
                  type="text"
                  value={draft.collation}
                  onChange={(e) => setDraft({ ...draft, collation: e.target.value })}
                  className="h-7 rounded border border-[#cbd5e1] px-2 font-mono"
                />
              </>
            ) : (
              <>
                <label className="text-right text-[#475569]">
                  {isEn ? "Tablespace:" : "資料表空間："}
                </label>
                <input
                  type="text"
                  value={draft.tablespace}
                  onChange={(e) => setDraft({ ...draft, tablespace: e.target.value })}
                  className="h-7 rounded border border-[#cbd5e1] px-2 font-mono"
                />
              </>
            )}

            <label className="text-right text-[#475569]">
              {isEn ? "Table Comment:" : "資料表註解："}
            </label>
            <textarea
              rows={3}
              value={draft.comment}
              onChange={(e) => setDraft({ ...draft, comment: e.target.value })}
              className="rounded border border-[#cbd5e1] p-2 outline-none"
            />
          </div>
        )}

        {subTab === "sql" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-semibold text-[#334155]">
                <FileCode2 className="h-3.5 w-3.5 text-[#7c3aed]" />
                {tab.isNew
                  ? isEn
                    ? "CREATE TABLE DDL Preview"
                    : "CREATE TABLE DDL 預覽"
                  : isEn
                  ? "ALTER TABLE DDL Diff Preview"
                  : "ALTER TABLE DDL 差異預覽"}
              </span>
              <button
                type="button"
                onClick={() => void navigator.clipboard?.writeText(generatedSql)}
                className="flex items-center gap-1 rounded border border-[#cbd5e1] bg-white px-2.5 py-1 hover:bg-[#f1f5f9]"
              >
                <Copy className="h-3 w-3" />
                <span>{isEn ? "Copy SQL" : "複製 SQL"}</span>
              </button>
            </div>
            <pre className="overflow-auto rounded border border-[#cbd5e1] bg-[#0f172a] p-4 font-mono text-[11px] leading-relaxed text-[#e2e8f0]">
              {generatedSql}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
