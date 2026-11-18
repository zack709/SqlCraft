import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Columns3,
  Copy,
  Download,
  Eraser,
  FileCode2,
  Filter,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  buildChangeSetSql,
  buildRowAsInsertSql,
  type FilterOperator,
  type FilterRule,
  type GridPendingInsert,
  type SortRule,
} from "../lib/sql-builder";
import { useWorkbenchStore, type WorkspaceTab } from "../store/workbenchStore";
import type { CellValue } from "../types/database";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";
import { ExportModal } from "./ExportModal";

type TableDataTab = Extract<WorkspaceTab, { kind: "table-data" }>;

interface DataViewerGridProps {
  tab: TableDataTab;
}

const FILTER_OPERATORS: FilterOperator[] = [
  "=",
  "!=",
  "<",
  "<=",
  ">",
  ">=",
  "LIKE",
  "NOT LIKE",
  "IN",
  "IS NULL",
  "IS NOT NULL",
  "IS EMPTY",
];

function formatCellDisplay(val: CellValue | undefined): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

function parseCellInput(raw: string, original: CellValue | undefined): CellValue {
  if (typeof original === "number" && raw.trim() !== "" && !Number.isNaN(Number(raw))) {
    return Number(raw);
  }
  if (typeof original === "boolean") {
    if (raw.toLowerCase() === "true") return true;
    if (raw.toLowerCase() === "false") return false;
  }
  return raw;
}

export function DataViewerGrid({ tab }: DataViewerGridProps) {
  const { refreshTableDataTab, applyGridChangeSet, getProfileById } = useWorkbenchStore();
  const profile = getProfileById(tab.profileId);

  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [colPickerOpen, setColPickerOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [quickSearch, setQuickSearch] = useState("");

  const [draftFilters, setDraftFilters] = useState<FilterRule[]>(tab.filters ?? []);
  const [draftSorts, setDraftSorts] = useState<SortRule[]>(tab.sorts ?? []);

  const [hiddenCols, setHiddenCols] = useState<Record<string, boolean>>({});
  const [colWidths, setColWidths] = useState<Record<string, number>>({});

  // Inline editing & change set state
  const [selectedCell, setSelectedCell] = useState<{
    rowIdx: number;
    colName: string;
    isInsert?: boolean;
    insertTempId?: string;
  } | null>(null);
  const [editingCell, setEditingCell] = useState<{
    rowIdx: number;
    colName: string;
    draftValue: string;
    isInsert?: boolean;
    insertTempId?: string;
  } | null>(null);
  const [editedCells, setEditedCells] = useState<Record<string, CellValue>>({});
  const [deletedRowIndices, setDeletedRowIndices] = useState<number[]>([]);
  const [insertedRows, setInsertedRows] = useState<GridPendingInsert[]>([]);

  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [sqlPreviewModal, setSqlPreviewModal] = useState<{
    statements: string[];
    warning?: string;
  } | null>(null);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    items: ContextMenuItem[];
  } | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const resizingColRef = useRef<{
    colName: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  useEffect(() => {
    setDraftFilters(tab.filters ?? []);
    setDraftSorts(tab.sorts ?? []);
  }, [tab.id, tab.filters, tab.sorts]);

  // Clear pending edits whenever fresh rows arrive for this page
  useEffect(() => {
    setEditedCells({});
    setDeletedRowIndices([]);
    setInsertedRows([]);
    setEditingCell(null);
    setApplyError(null);
  }, [tab.result]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingColRef.current) return;
      const { colName, startX, startWidth } = resizingColRef.current;
      const next = Math.max(70, Math.min(600, startWidth + (e.clientX - startX)));
      setColWidths((prev) => ({ ...prev, [colName]: next }));
    };
    const onUp = () => {
      resizingColRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const resultCols = tab.result?.columns ?? [];
  const originalRows = tab.result?.rows ?? [];
  const gridColumnNames = useMemo(
    () => resultCols.map((c) => c.name),
    [resultCols]
  );

  const visibleColumns = useMemo(
    () => resultCols.filter((c) => !hiddenCols[c.name]),
    [resultCols, hiddenCols]
  );

  const pkSet = useMemo(
    () =>
      new Set(
        (tab.tableColumns ?? []).filter((c) => c.isPrimaryKey).map((c) => c.name)
      ),
    [tab.tableColumns]
  );

  // Combine loaded rows (filtered by quickSearch if active) + newly inserted rows
  const displayRows = useMemo(() => {
    const q = quickSearch.trim().toLowerCase();
    const mapped = originalRows
      .map((row, origIdx) => ({ kind: "existing" as const, origIdx, row }))
      .filter((entry) => {
        if (!q) return true;
        return entry.row.some((cell, idx) => {
          const editedKey = `${entry.origIdx}::${gridColumnNames[idx]}`;
          const effective =
            editedKey in editedCells ? editedCells[editedKey] : cell;
          return formatCellDisplay(effective).toLowerCase().includes(q);
        });
      });

    const added = insertedRows.map((ins, i) => ({
      kind: "insert" as const,
      insertIdx: i,
      insert: ins,
    }));

    return [...mapped, ...added];
  }, [originalRows, quickSearch, gridColumnNames, editedCells, insertedRows]);

  const rowVirtualizer = useVirtualizer({
    count: displayRows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 25,
    overscan: 16,
  });

  const pendingChangeCount =
    Object.keys(editedCells).length + deletedRowIndices.length + insertedRows.length;

  const commitInlineEdit = () => {
    if (!editingCell) return;
    const { rowIdx, colName, draftValue, isInsert, insertTempId } = editingCell;

    if (isInsert && insertTempId) {
      setInsertedRows((prev) =>
        prev.map((r) =>
          r.tempId === insertTempId
            ? { ...r, values: { ...r.values, [colName]: draftValue } }
            : r
        )
      );
      setEditingCell(null);
      return;
    }

    const colIdx = gridColumnNames.indexOf(colName);
    const origVal = colIdx >= 0 ? originalRows[rowIdx]?.[colIdx] : null;
    const parsed = parseCellInput(draftValue, origVal);
    const key = `${rowIdx}::${colName}`;

    if (parsed === origVal) {
      setEditedCells((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } else {
      setEditedCells((prev) => ({ ...prev, [key]: parsed }));
    }
    setEditingCell(null);
  };

  const handleHeaderSortClick = (colName: string) => {
    const existing = draftSorts.find((s) => s.column === colName);
    let nextSorts: SortRule[];
    if (!existing) {
      nextSorts = [{ column: colName, direction: "ASC" }];
    } else if (existing.direction === "ASC") {
      nextSorts = [{ column: colName, direction: "DESC" }];
    } else {
      nextSorts = [];
    }
    setDraftSorts(nextSorts);
    void refreshTableDataTab(tab.id, { page: 1, sorts: nextSorts });
  };

  const handleAddRow = () => {
    const values: Record<string, CellValue> = {};
    for (const col of gridColumnNames) {
      const meta = tab.tableColumns.find((c) => c.name === col);
      if (meta?.isAutoIncrement) continue;
      values[col] = meta?.nullable ? null : "";
    }
    setInsertedRows((prev) => [
      ...prev,
      { tempId: `ins-${Date.now()}-${prev.length}`, values },
    ]);
  };

  const handleDeleteSelectedRow = () => {
    if (!selectedCell) return;
    if (selectedCell.isInsert && selectedCell.insertTempId) {
      setInsertedRows((prev) =>
        prev.filter((r) => r.tempId !== selectedCell.insertTempId)
      );
      setSelectedCell(null);
      return;
    }
    const idx = selectedCell.rowIdx;
    setDeletedRowIndices((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
    );
  };

  const buildPendingChangeSet = () => {
    return buildChangeSetSql({
      kind: profile?.dbKind ?? "mysql",
      database: tab.database,
      schema: tab.schema,
      tableName: tab.tableName,
      tableColumns: tab.tableColumns,
      gridColumnNames,
      originalRows,
      editedCells,
      deletedRowIndices,
      insertedRows,
    });
  };

  const handleApplyChanges = async () => {
    if (pendingChangeCount === 0) return;
    const { statements } = buildPendingChangeSet();
    if (statements.length === 0) return;

    // Build updated rows snapshot for Demo mode
    const deletedSet = new Set(deletedRowIndices);
    const updatedDemoRows: CellValue[][] = [];
    originalRows.forEach((row, rIdx) => {
      if (deletedSet.has(rIdx)) return;
      const nextRow = row.map((cell, cIdx) => {
        const key = `${rIdx}::${gridColumnNames[cIdx]}`;
        return key in editedCells ? editedCells[key] : cell;
      });
      updatedDemoRows.push(nextRow);
    });
    for (const ins of insertedRows) {
      updatedDemoRows.push(
        gridColumnNames.map((colName) =>
          ins.values[colName] === undefined ? null : ins.values[colName]
        )
      );
    }

    setApplying(true);
    setApplyError(null);
    try {
      await applyGridChangeSet(tab.id, statements, updatedDemoRows);
    } catch (err) {
      setApplyError(String(err));
    } finally {
      setApplying(false);
    }
  };

  const handleDiscardChanges = () => {
    setEditedCells({});
    setDeletedRowIndices([]);
    setInsertedRows([]);
    setEditingCell(null);
    setApplyError(null);
  };

  const openCellMenu = (
    e: React.MouseEvent,
    rowIdx: number,
    colName: string,
    cellVal: CellValue | undefined,
    rowValues: CellValue[],
    isInsert: boolean,
    insertTempId?: string
  ) => {
    e.preventDefault();
    setSelectedCell({ rowIdx, colName, isInsert, insertTempId });
    const key = `${rowIdx}::${colName}`;
    const setCellTo = (val: CellValue) => {
      if (isInsert && insertTempId) {
        setInsertedRows((prev) =>
          prev.map((r) =>
            r.tempId === insertTempId
              ? { ...r, values: { ...r.values, [colName]: val } }
              : r
          )
        );
      } else {
        setEditedCells((prev) => ({ ...prev, [key]: val }));
      }
    };

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          id: "set-null",
          label: "設為 NULL",
          icon: <Eraser className="h-3.5 w-3.5 text-[#64748b]" />,
          onClick: () => setCellTo(null),
        },
        {
          id: "set-empty",
          label: "設為空字串 ('')",
          icon: <Eraser className="h-3.5 w-3.5 text-[#0891b2]" />,
          onClick: () => setCellTo(""),
        },
        ...(!isInsert && key in editedCells
          ? [
              {
                id: "revert-cell",
                label: "還原儲存格",
                icon: <RotateCcw className="h-3.5 w-3.5 text-[#d97706]" />,
                onClick: () =>
                  setEditedCells((prev) => {
                    const next = { ...prev };
                    delete next[key];
                    return next;
                  }),
              },
            ]
          : []),
        { id: "div-1", divider: true },
        {
          id: "copy-cell",
          label: "複製儲存格值",
          icon: <Copy className="h-3.5 w-3.5" />,
          onClick: () =>
            void navigator.clipboard?.writeText(formatCellDisplay(cellVal)),
        },
        {
          id: "copy-insert",
          label: "複製整列為 INSERT SQL",
          icon: <FileCode2 className="h-3.5 w-3.5 text-[#7c3aed]" />,
          onClick: () => {
            const sql = buildRowAsInsertSql(
              profile?.dbKind ?? "mysql",
              tab.database,
              tab.schema,
              tab.tableName,
              gridColumnNames,
              rowValues
            );
            void navigator.clipboard?.writeText(sql);
          },
        },
        {
          id: "copy-json",
          label: "複製整列為 JSON",
          icon: <Copy className="h-3.5 w-3.5 text-[#059669]" />,
          onClick: () => {
            const obj: Record<string, CellValue> = {};
            gridColumnNames.forEach((name, i) => {
              obj[name] = rowValues[i] ?? null;
            });
            void navigator.clipboard?.writeText(JSON.stringify(obj, null, 2));
          },
        },
        { id: "div-2", divider: true },
        {
          id: "delete-row",
          label:
            !isInsert && deletedRowIndices.includes(rowIdx)
              ? "取消標記刪除"
              : "標記刪除此列",
          icon: <Trash2 className="h-3.5 w-3.5" />,
          danger: true,
          onClick: () => {
            if (isInsert && insertTempId) {
              setInsertedRows((prev) => prev.filter((r) => r.tempId !== insertTempId));
            } else {
              setDeletedRowIndices((prev) =>
                prev.includes(rowIdx)
                  ? prev.filter((i) => i !== rowIdx)
                  : [...prev, rowIdx]
              );
            }
          },
        },
      ],
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white text-[11px]">
      {/* Top Toolbar */}
      <div className="flex h-[28px] items-center justify-between border-b border-[#dcdfe6] bg-[#f8f9fb] px-2.5">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-[#111827] mr-1">
            {tab.database}
            {tab.schema ? `.${tab.schema}` : ""}.{tab.tableName}
          </span>

          <button
            type="button"
            onClick={() => setFilterOpen((o) => !o)}
            className={`flex items-center gap-1 rounded px-2 py-0.5 border ${
              filterOpen || draftFilters.some((f) => f.enabled)
                ? "border-[#93c5fd] bg-[#eff6ff] text-[#1d4ed8]"
                : "border-transparent hover:bg-[#e2e8f0]"
            }`}
          >
            <Filter className="h-3 w-3" />
            <span>
              篩選 ({draftFilters.filter((f) => f.enabled).length})
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSortOpen((o) => !o)}
            className={`flex items-center gap-1 rounded px-2 py-0.5 border ${
              sortOpen || draftSorts.length > 0
                ? "border-[#93c5fd] bg-[#eff6ff] text-[#1d4ed8]"
                : "border-transparent hover:bg-[#e2e8f0]"
            }`}
          >
            <ArrowUpDown className="h-3 w-3" />
            <span>排序 ({draftSorts.length})</span>
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setColPickerOpen((o) => !o)}
              className={`flex items-center gap-1 rounded px-2 py-0.5 border ${
                colPickerOpen || Object.values(hiddenCols).some(Boolean)
                  ? "border-[#93c5fd] bg-[#eff6ff] text-[#1d4ed8]"
                  : "border-transparent hover:bg-[#e2e8f0]"
              }`}
            >
              <Columns3 className="h-3 w-3" />
              <span>欄位 ({visibleColumns.length}/{resultCols.length})</span>
            </button>

            {colPickerOpen && (
              <div className="absolute left-0 top-full z-40 mt-1 w-52 rounded border border-[#cbd5e1] bg-white p-2 shadow-lg">
                <div className="mb-1.5 flex items-center justify-between border-b border-[#e2e8f0] pb-1 text-[10px] font-semibold">
                  <span>顯示欄位</span>
                  <button
                    type="button"
                    onClick={() => {
                      setHiddenCols({});
                      setColWidths({});
                    }}
                    className="text-[#2563eb] hover:underline"
                  >
                    全部重設
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {resultCols.map((c) => (
                    <label
                      key={c.name}
                      className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 hover:bg-[#f1f5f9]"
                    >
                      <input
                        type="checkbox"
                        checked={!hiddenCols[c.name]}
                        onChange={(e) =>
                          setHiddenCols((prev) => ({
                            ...prev,
                            [c.name]: !e.target.checked,
                          }))
                        }
                      />
                      <span className="truncate font-mono">{c.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {tab.result?.warning && (
            <span className="rounded bg-[#fef3c7] px-1.5 py-0.5 text-[10px] text-[#92400e]">
              {tab.result.warning}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={!tab.result || tab.result.rows.length === 0}
            onClick={() => setExportOpen(true)}
            className="flex h-[20px] items-center gap-1 rounded border border-[#cbd5e1] bg-white px-2 text-[10px] hover:bg-[#eff6ff] disabled:opacity-40"
          >
            <Download className="h-3 w-3 text-[#059669]" />
            <span>匯出</span>
          </button>
          <div className="flex h-[20px] w-40 items-center gap-1 rounded border border-[#cbd5e1] bg-white px-1.5">
            <Search className="h-3 w-3 text-[#9ca3af]" />
            <input
              type="text"
              value={quickSearch}
              onChange={(e) => setQuickSearch(e.target.value)}
              placeholder="快速過濾本頁..."
              className="w-full bg-transparent text-[10px] outline-none"
            />
          </div>
        </div>
      </div>

      {/* Visual Filter Builder Panel */}
      {filterOpen && (
        <div className="border-b border-[#d4d8e0] bg-[#f8fafc] px-3 py-2 space-y-1.5">
          {draftFilters.map((rule, idx) => (
            <div key={rule.id} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={rule.enabled}
                onChange={(e) =>
                  setDraftFilters((prev) =>
                    prev.map((r) =>
                      r.id === rule.id ? { ...r, enabled: e.target.checked } : r
                    )
                  )
                }
              />
              {idx > 0 ? (
                <select
                  value={rule.logic}
                  onChange={(e) =>
                    setDraftFilters((prev) =>
                      prev.map((r) =>
                        r.id === rule.id
                          ? { ...r, logic: e.target.value as "AND" | "OR" }
                          : r
                      )
                    )
                  }
                  className="h-6 rounded border border-[#cbd5e1] bg-white px-1 text-[10px]"
                >
                  <option value="AND">AND</option>
                  <option value="OR">OR</option>
                </select>
              ) : (
                <span className="w-12 text-center text-[10px] font-semibold text-[#64748b]">
                  WHERE
                </span>
              )}

              <select
                value={rule.column}
                onChange={(e) =>
                  setDraftFilters((prev) =>
                    prev.map((r) =>
                      r.id === rule.id ? { ...r, column: e.target.value } : r
                    )
                  )
                }
                className="h-6 rounded border border-[#cbd5e1] bg-white px-1.5 font-mono"
              >
                {gridColumnNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>

              <select
                value={rule.operator}
                onChange={(e) =>
                  setDraftFilters((prev) =>
                    prev.map((r) =>
                      r.id === rule.id
                        ? { ...r, operator: e.target.value as FilterOperator }
                        : r
                    )
                  )
                }
                className="h-6 rounded border border-[#cbd5e1] bg-white px-1.5 font-mono"
              >
                {FILTER_OPERATORS.map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>

              {!["IS NULL", "IS NOT NULL", "IS EMPTY"].includes(rule.operator) && (
                <input
                  type="text"
                  value={rule.value}
                  placeholder={rule.operator === "IN" ? "a, b, c" : "條件值"}
                  onChange={(e) =>
                    setDraftFilters((prev) =>
                      prev.map((r) =>
                        r.id === rule.id ? { ...r, value: e.target.value } : r
                      )
                    )
                  }
                  className="h-6 w-48 rounded border border-[#cbd5e1] bg-white px-2 font-mono outline-none focus:border-[#2563eb]"
                />
              )}

              <button
                type="button"
                onClick={() =>
                  setDraftFilters((prev) => prev.filter((r) => r.id !== rule.id))
                }
                className="rounded p-1 text-[#dc2626] hover:bg-[#fee2e2]"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}

          <div className="flex items-center gap-2 pt-0.5">
            <button
              type="button"
              onClick={() =>
                setDraftFilters((prev) => [
                  ...prev,
                  {
                    id: `flt-${Date.now()}`,
                    enabled: true,
                    logic: "AND",
                    column: gridColumnNames[0] ?? "",
                    operator: "=",
                    value: "",
                  },
                ])
              }
              className="rounded border border-[#cbd5e1] bg-white px-2 py-0.5 hover:bg-[#f1f5f9]"
            >
              + 新增條件
            </button>
            <button
              type="button"
              onClick={() =>
                void refreshTableDataTab(tab.id, { page: 1, filters: draftFilters })
              }
              className="rounded bg-[#2563eb] px-2.5 py-0.5 font-medium text-white hover:bg-[#1d4ed8]"
            >
              套用篩選
            </button>
            {draftFilters.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setDraftFilters([]);
                  void refreshTableDataTab(tab.id, { page: 1, filters: [] });
                }}
                className="rounded px-2 py-0.5 text-[#64748b] hover:bg-[#e2e8f0]"
              >
                清除全部
              </button>
            )}
          </div>
        </div>
      )}

      {/* Multi-Column Sort Builder */}
      {sortOpen && (
        <div className="border-b border-[#d4d8e0] bg-[#f8fafc] px-3 py-2 space-y-1.5">
          {draftSorts.map((sort, idx) => (
            <div key={`${sort.column}-${idx}`} className="flex items-center gap-1.5">
              <span className="w-16 text-[10px] font-semibold text-[#64748b]">
                {idx === 0 ? "ORDER BY" : "THEN BY"}
              </span>
              <select
                value={sort.column}
                onChange={(e) =>
                  setDraftSorts((prev) =>
                    prev.map((s, i) =>
                      i === idx ? { ...s, column: e.target.value } : s
                    )
                  )
                }
                className="h-6 rounded border border-[#cbd5e1] bg-white px-1.5 font-mono"
              >
                {gridColumnNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                value={sort.direction}
                onChange={(e) =>
                  setDraftSorts((prev) =>
                    prev.map((s, i) =>
                      i === idx
                        ? { ...s, direction: e.target.value as "ASC" | "DESC" }
                        : s
                    )
                  )
                }
                className="h-6 rounded border border-[#cbd5e1] bg-white px-1.5 font-mono"
              >
                <option value="ASC">ASC (升冪)</option>
                <option value="DESC">DESC (降冪)</option>
              </select>
              <button
                type="button"
                onClick={() =>
                  setDraftSorts((prev) => prev.filter((_, i) => i !== idx))
                }
                className="rounded p-1 text-[#dc2626] hover:bg-[#fee2e2]"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-0.5">
            <button
              type="button"
              onClick={() =>
                setDraftSorts((prev) => [
                  ...prev,
                  { column: gridColumnNames[0] ?? "", direction: "ASC" },
                ])
              }
              className="rounded border border-[#cbd5e1] bg-white px-2 py-0.5 hover:bg-[#f1f5f9]"
            >
              + 新增排序欄位
            </button>
            <button
              type="button"
              onClick={() =>
                void refreshTableDataTab(tab.id, { page: 1, sorts: draftSorts })
              }
              className="rounded bg-[#2563eb] px-2.5 py-0.5 font-medium text-white hover:bg-[#1d4ed8]"
            >
              套用排序
            </button>
          </div>
        </div>
      )}

      {applyError && (
        <div className="flex items-center justify-between border-b border-[#fecaca] bg-[#fef2f2] px-3 py-1.5 font-mono text-[10px] text-[#991b1b]">
          <span>套用失敗：{applyError}</span>
          <button type="button" onClick={() => setApplyError(null)}>
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Main Virtualized Data Grid */}
      {tab.error ? (
        <div className="m-4 rounded border border-[#fecaca] bg-[#fef2f2] p-3 font-mono text-[#991b1b]">
          {tab.error}
        </div>
      ) : tab.loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-[#64748b]">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>載入資料列中...</span>
        </div>
      ) : (
        <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-auto relative">
          <div style={{ minWidth: "max-content" }}>
            {/* Sticky Header */}
            <div className="sticky top-0 z-20 flex h-[25px] border-b border-[#d4d8e0] bg-[#f4f6f9] text-[#334155]">
              <div className="w-11 flex-shrink-0 border-r border-[#e2e8f0] px-1.5 flex items-center justify-center text-[10px] text-[#94a3b8]">
                #
              </div>
              {visibleColumns.map((col) => {
                const w = colWidths[col.name] ?? 150;
                const activeSort = draftSorts.find((s) => s.column === col.name);
                return (
                  <div
                    key={col.name}
                    style={{ width: w }}
                    className="relative flex flex-shrink-0 items-center justify-between border-r border-[#e2e8f0] px-2 font-medium select-none"
                  >
                    <button
                      type="button"
                      onClick={() => handleHeaderSortClick(col.name)}
                      className="flex min-w-0 flex-1 items-center gap-1 text-left hover:text-[#1d4ed8]"
                      title={`${col.name} (${col.dataType}) — 點擊排序`}
                    >
                      {pkSet.has(col.name) && (
                        <span className="text-[10px]" title="Primary Key">
                          🔑
                        </span>
                      )}
                      <span className="truncate">{col.name}</span>
                      <span className="text-[9px] font-normal text-[#94a3b8] truncate">
                        {col.dataType}
                      </span>
                    </button>
                    {activeSort && (
                      <span className="ml-1 text-[#2563eb] flex-shrink-0">
                        {activeSort.direction === "ASC" ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : (
                          <ArrowDown className="h-3 w-3" />
                        )}
                      </span>
                    )}
                    {/* Column Resize Handle */}
                    <div
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        resizingColRef.current = {
                          colName: col.name,
                          startX: e.clientX,
                          startWidth: w,
                        };
                      }}
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-[#60a5fa]"
                    />
                  </div>
                );
              })}
            </div>

            {/* Virtualized Rows */}
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                position: "relative",
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const item = displayRows[virtualRow.index];
                if (!item) return null;

                const isInsert = item.kind === "insert";
                const origIdx = item.kind === "existing" ? item.origIdx : -1;
                const isDeleted =
                  item.kind === "existing" && deletedRowIndices.includes(origIdx);

                const effectiveRowValues =
                  item.kind === "existing"
                    ? gridColumnNames.map((name, i) => {
                        const k = `${origIdx}::${name}`;
                        return k in editedCells ? editedCells[k] : item.row[i];
                      })
                    : gridColumnNames.map((name) => item.insert.values[name] ?? null);

                return (
                  <div
                    key={
                      item.kind === "existing"
                        ? `row-${origIdx}`
                        : `ins-${item.insert.tempId}`
                    }
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className={`flex items-center border-b border-[#f1f5f9] ${
                      isInsert
                        ? "bg-[#ecfdf5]"
                        : isDeleted
                        ? "bg-[#fef2f2] line-through opacity-70"
                        : "hover:bg-[#f8fafc]"
                    }`}
                  >
                    <div className="flex h-full w-11 flex-shrink-0 items-center justify-center border-r border-[#f1f5f9] bg-[#f8fafc] font-mono text-[10px] text-[#94a3b8]">
                      {isInsert ? "+" : origIdx + 1}
                    </div>

                    {visibleColumns.map((col) => {
                      const w = colWidths[col.name] ?? 150;
                      const colPos = gridColumnNames.indexOf(col.name);
                      const cellVal = effectiveRowValues[colPos];
                      const editKey = `${origIdx}::${col.name}`;
                      const isEdited = !isInsert && editKey in editedCells;
                      const isSelected = isInsert
                        ? selectedCell?.isInsert &&
                          selectedCell.insertTempId === item.insert.tempId &&
                          selectedCell.colName === col.name
                        : selectedCell &&
                          !selectedCell.isInsert &&
                          selectedCell.rowIdx === origIdx &&
                          selectedCell.colName === col.name;
                      const isEditing = isInsert
                        ? editingCell?.isInsert &&
                          editingCell.insertTempId === item.insert.tempId &&
                          editingCell.colName === col.name
                        : editingCell &&
                          !editingCell.isInsert &&
                          editingCell.rowIdx === origIdx &&
                          editingCell.colName === col.name;

                      const isNull = cellVal === null || cellVal === undefined;

                      return (
                        <div
                          key={col.name}
                          style={{ width: w }}
                          onClick={() =>
                            setSelectedCell({
                              rowIdx: origIdx,
                              colName: col.name,
                              isInsert,
                              insertTempId: isInsert ? item.insert.tempId : undefined,
                            })
                          }
                          onDoubleClick={() =>
                            setEditingCell({
                              rowIdx: origIdx,
                              colName: col.name,
                              draftValue: isNull ? "" : formatCellDisplay(cellVal),
                              isInsert,
                              insertTempId: isInsert ? item.insert.tempId : undefined,
                            })
                          }
                          onContextMenu={(e) =>
                            openCellMenu(
                              e,
                              origIdx,
                              col.name,
                              cellVal,
                              effectiveRowValues,
                              isInsert,
                              isInsert ? item.insert.tempId : undefined
                            )
                          }
                          className={`flex h-full flex-shrink-0 items-center border-r border-[#f1f5f9] px-2 font-mono ${
                            isEdited ? "bg-[#fef3c7]" : ""
                          } ${
                            isSelected ? "ring-1 ring-inset ring-[#2563eb]" : ""
                          }`}
                        >
                          {isEditing && editingCell ? (
                            <input
                              autoFocus
                              type="text"
                              value={editingCell.draftValue}
                              onChange={(e) =>
                                setEditingCell((prev) =>
                                  prev ? { ...prev, draftValue: e.target.value } : null
                                )
                              }
                              onBlur={commitInlineEdit}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitInlineEdit();
                                if (e.key === "Escape") setEditingCell(null);
                              }}
                              className="h-full w-full bg-white px-1 font-mono text-[11px] outline-none"
                            />
                          ) : (
                            <span
                              className={`w-full truncate ${
                                isNull ? "italic text-[#94a3b8]" : "text-[#1f2329]"
                              }`}
                            >
                              {formatCellDisplay(cellVal)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Navicat Bottom Grid Control Bar */}
      <div className="flex h-[28px] items-center justify-between border-t border-[#d4d8e0] bg-[#f8f9fb] px-2 text-[11px]">
        {/* Left Inline CRUD Actions */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleAddRow}
            title="新增列 (+)"
            className="flex h-5 w-6 items-center justify-center rounded border border-[#cbd5e1] bg-white hover:bg-[#eff6ff]"
          >
            <Plus className="h-3.5 w-3.5 text-[#16a34a]" />
          </button>
          <button
            type="button"
            disabled={!selectedCell}
            onClick={handleDeleteSelectedRow}
            title="刪除選取列 (-)"
            className="flex h-5 w-6 items-center justify-center rounded border border-[#cbd5e1] bg-white hover:bg-[#fef2f2] disabled:opacity-40"
          >
            <Minus className="h-3.5 w-3.5 text-[#dc2626]" />
          </button>
          <button
            type="button"
            disabled={pendingChangeCount === 0 || applying}
            onClick={() => void handleApplyChanges()}
            title="套用變更 (Apply Changes)"
            className={`flex h-5 items-center gap-1 rounded border px-2 font-medium ${
              pendingChangeCount > 0
                ? "border-[#16a34a] bg-[#16a34a] text-white hover:bg-[#15803d]"
                : "border-[#cbd5e1] bg-white text-[#94a3b8]"
            }`}
          >
            <Check className="h-3 w-3" />
            <span>套用{pendingChangeCount > 0 ? ` (${pendingChangeCount})` : ""}</span>
          </button>
          <button
            type="button"
            disabled={pendingChangeCount === 0}
            onClick={handleDiscardChanges}
            title="放棄變更 (Discard)"
            className="flex h-5 items-center gap-1 rounded border border-[#cbd5e1] bg-white px-2 hover:bg-[#fef2f2] disabled:opacity-40"
          >
            <X className="h-3 w-3 text-[#dc2626]" />
            <span>放棄</span>
          </button>
          <button
            type="button"
            disabled={pendingChangeCount === 0}
            onClick={() => setSqlPreviewModal(buildPendingChangeSet())}
            className="flex h-5 items-center gap-1 rounded border border-[#cbd5e1] bg-white px-2 hover:bg-[#f1f5f9] disabled:opacity-40"
          >
            <FileCode2 className="h-3 w-3 text-[#7c3aed]" />
            <span>SQL 預覽</span>
          </button>
          <button
            type="button"
            onClick={() => void refreshTableDataTab(tab.id)}
            title="重新整理"
            className="flex h-5 w-6 items-center justify-center rounded border border-[#cbd5e1] bg-white hover:bg-[#f1f5f9]"
          >
            <RefreshCw className={`h-3 w-3 ${tab.loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Right Pagination Controls */}
        <div className="flex items-center gap-1.5 text-[10px] text-[#475569]">
          <span>本頁 {displayRows.length} 筆</span>
          <select
            value={tab.pageSize}
            onChange={(e) =>
              void refreshTableDataTab(tab.id, {
                page: 1,
                pageSize: Number(e.target.value),
              })
            }
            className="h-5 rounded border border-[#cbd5e1] bg-white px-1 font-mono"
          >
            <option value={100}>100 / 頁</option>
            <option value={500}>500 / 頁</option>
            <option value={1000}>1000 / 頁</option>
            <option value={5000}>5000 / 頁</option>
          </select>

          <button
            type="button"
            disabled={tab.page <= 1}
            onClick={() => void refreshTableDataTab(tab.id, { page: 1 })}
            className="rounded border border-[#cbd5e1] bg-white p-0.5 hover:bg-[#f1f5f9] disabled:opacity-40"
          >
            <ChevronsLeft className="h-3 w-3" />
          </button>
          <button
            type="button"
            disabled={tab.page <= 1}
            onClick={() => void refreshTableDataTab(tab.id, { page: tab.page - 1 })}
            className="rounded border border-[#cbd5e1] bg-white p-0.5 hover:bg-[#f1f5f9] disabled:opacity-40"
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
          <span className="px-1 font-mono">第 {tab.page} 頁</span>
          <button
            type="button"
            disabled={originalRows.length < tab.pageSize}
            onClick={() => void refreshTableDataTab(tab.id, { page: tab.page + 1 })}
            className="rounded border border-[#cbd5e1] bg-white p-0.5 hover:bg-[#f1f5f9] disabled:opacity-40"
          >
            <ChevronRight className="h-3 w-3" />
          </button>
          <button
            type="button"
            disabled={originalRows.length < tab.pageSize}
            onClick={() => void refreshTableDataTab(tab.id, { page: tab.page + 1 })}
            className="rounded border border-[#cbd5e1] bg-white p-0.5 hover:bg-[#f1f5f9] disabled:opacity-40"
          >
            <ChevronsRight className="h-3 w-3" />
          </button>
        </div>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}

      <ExportModal
        open={exportOpen}
        result={tab.result ?? null}
        dbKind={profile?.dbKind ?? "mysql"}
        database={tab.database}
        schema={tab.schema}
        defaultTableName={tab.tableName}
        onClose={() => setExportOpen(false)}
      />

      {sqlPreviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
          <div className="flex w-full max-w-2xl flex-col rounded border border-[#cbd5e1] bg-white shadow-xl text-xs">
            <div className="flex items-center justify-between border-b border-[#e2e8f0] px-4 py-2.5 font-semibold">
              <span>待套用變更 SQL 預覽（{sqlPreviewModal.statements.length} 句）</span>
              <button
                type="button"
                onClick={() => setSqlPreviewModal(null)}
                className="rounded px-2 py-0.5 text-[#64748b] hover:bg-[#f1f5f9]"
              >
                關閉
              </button>
            </div>
            {sqlPreviewModal.warning && (
              <div className="border-b border-[#fde68a] bg-[#fef3c7] px-4 py-2 text-[11px] text-[#92400e]">
                {sqlPreviewModal.warning}
              </div>
            )}
            <pre className="max-h-96 overflow-auto bg-[#0f172a] p-4 font-mono text-[11px] text-[#e2e8f0]">
              {sqlPreviewModal.statements.join("\n")}
            </pre>
            <div className="flex justify-end gap-2 border-t border-[#e2e8f0] px-4 py-2">
              <button
                type="button"
                onClick={() =>
                  void navigator.clipboard?.writeText(
                    sqlPreviewModal.statements.join("\n")
                  )
                }
                className="rounded border border-[#cbd5e1] px-3 py-1 hover:bg-[#f1f5f9]"
              >
                複製 SQL
              </button>
              <button
                type="button"
                onClick={() => {
                  setSqlPreviewModal(null);
                  void handleApplyChanges();
                }}
                className="rounded bg-[#16a34a] px-3 py-1 font-medium text-white hover:bg-[#15803d]"
              >
                確認執行
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
