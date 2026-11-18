import { useState } from "react";
import { t } from "../lib/i18n";
import {
  Copy,
  Edit3,
  Eye,
  FileCode2,
  LayoutGrid,
  List,
  Play,
  Plus,
  RefreshCw,
  Search,
  Table2,
  Terminal,
  Trash2,
} from "lucide-react";
import {
  makeDbKey,
  makeScopeKey,
  type ObjectCategory,
  useWorkbenchStore,
} from "../store/workbenchStore";
import { isMacOS } from "../utils/platform";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";

function formatBytes(bytes?: number | null): string {
  if (bytes == null) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function ObjectListPane() {
  const {
    sessionTabs,
    activeSessionTabId,
    openedDatabases,
    databasesByProfile,
    connectionStates,
    connectionErrors,
    tablesByScope,
    viewsByScope,
    routinesByScope,
    sequencesByScope,
    savedQueries,
    selectedScope,
    objectFilter,
    objectViewMode,
    setObjectFilter,
    setObjectViewMode,
    selectScope,
    selectObject,
    loadScopeObjects,
    openDatabase,
    openConnectionModal,
    language,
    openTableDataTab,
    openTableDesignTab,
    openNewTableDesignTab,
    openQueryTab,
    openSavedQueryTab,
    deleteSavedQuery,
    dropTable,
    truncateTable,
    renameTable,
    getTableDdl,
  } = useWorkbenchStore();

  const [menuState, setMenuState] = useState<{
    x: number;
    y: number;
    items: ContextMenuItem[];
  } | null>(null);
  const [dumpDdl, setDumpDdl] = useState<{ title: string; sql: string } | null>(null);
  const [renameTarget, setRenameTarget] = useState<{
    oldName: string;
    newName: string;
  } | null>(null);

  const activeSession =
    sessionTabs.find((s) => s.id === activeSessionTabId) ?? sessionTabs[0] ?? null;
  const profile =
    useWorkbenchStore
      .getState()
      .getProfileById(selectedScope?.profileId ?? activeSession?.profileId) ?? null;
  const database = selectedScope?.database ?? null;
  const schema = selectedScope?.schema ?? null;
  const category: ObjectCategory = selectedScope?.category ?? "tables";
  const connStatus = profile ? connectionStates[profile.id] ?? "disconnected" : "disconnected";
  const connError = profile ? connectionErrors[profile.id] : "";
  const isDbOpened =
    profile && database ? !!openedDatabases[makeDbKey(profile.id, database)] : false;

  const scopeKey =
    profile && database ? makeScopeKey(profile.id, database, schema) : null;

  const tables = scopeKey ? tablesByScope[scopeKey] ?? [] : [];
  const views = scopeKey ? viewsByScope[scopeKey] ?? [] : [];
  const routines = scopeKey ? routinesByScope[scopeKey] ?? [] : [];
  const sequences = scopeKey ? sequencesByScope[scopeKey] ?? [] : [];

  const filterLower = objectFilter.trim().toLowerCase();
  const isMac = isMacOS();

  if (connStatus === "connecting") {
    return (
      <div
        className={`flex flex-1 ${isMac ? "bg-[#f5f5f7]" : "bg-[#f8fafc]"}`}
      />
    );
  }

  // 1) When no site is connected yet -> Show Site Manager prompt
  if (!profile || (connStatus !== "connected" && connStatus !== "demo")) {
    return (
      <div
        className={`flex flex-1 flex-col items-center justify-center p-8 text-center ${
          isMac ? "bg-[#f5f5f7]" : "bg-[#f8fafc]"
        }`}
      >
        <div
          className={`max-w-md border bg-white p-6 ${
            isMac
              ? "rounded-2xl border-black/10 shadow-md"
              : "rounded-lg border-[#e2e8f0] shadow-sm"
          }`}
        >
          <Table2
            className={`mx-auto h-10 w-10 ${isMac ? "text-[#007aff]" : "text-[#2563eb]"}`}
          />
          {profile && (
            <h2 className="mt-3 text-sm font-semibold text-[#0f172a]">
              {profile.name}
            </h2>
          )}

          {connError && (
            <div className="mt-3 rounded border border-[#fecaca] bg-[#fef2f2] p-2.5 text-left font-mono text-[10px] text-[#991b1b]">
              {connError}
            </div>
          )}

          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => openConnectionModal(profile)}
              className={`px-3.5 py-1.5 text-[11px] font-medium text-white ${
                isMac
                  ? "rounded-lg bg-[#007aff] hover:bg-[#0066cc]"
                  : "rounded bg-[#2563eb] hover:bg-[#1d4ed8]"
              }`}
            >
              {t(language, "openSiteManager")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2) Site is connected, but no Database has been double-clicked/opened yet -> Show Navicat Database list!
  if (!database || !isDbOpened) {
    const dbs = databasesByProfile[profile.id] ?? [];
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-white p-4">
        <div className="mb-3 flex items-center justify-between border-b border-[#e2e8f0] pb-2">
          <div>
            <h3 className="text-xs font-semibold text-[#111827]">
              {language === "en"
                ? `${profile.name} — Databases (${dbs.length})`
                : `${profile.name} — 資料庫清單（共 ${dbs.length} 個資料庫）`}
            </h3>
            <p className="mt-0.5 text-[11px] text-[#64748b]">
              {t(language, "selectDbPrompt")}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2.5 overflow-y-auto">
          {dbs.map((db) => {
            const opened = !!openedDatabases[makeDbKey(profile.id, db.name)];
            const selected = database === db.name;
            return (
              <div
                key={db.name}
                onClick={() =>
                  useWorkbenchStore.setState({
                    selectedScope: {
                      profileId: profile.id,
                      database: db.name,
                      schema: null,
                      category: "tables",
                      objectName: null,
                    },
                  })
                }
                onDoubleClick={() => void openDatabase(profile.id, db.name)}
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 transition ${
                  selected
                    ? "border-[#2563eb] bg-[#eff6ff]"
                    : "border-[#e2e8f0] bg-[#f8fafc] hover:border-[#93c5fd]"
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white ${
                    opened ? "bg-[#10b981]" : "bg-[#94a3b8]"
                  }`}
                >
                  <Table2 className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-[#111827]">{db.name}</div>
                  <div className="truncate text-[10px] text-[#64748b]">
                    {db.charset || "UTF-8"} ·{" "}
                    {language === "en" ? "Double-click to open" : "點兩下開啟資料庫"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const isPg = profile.dbKind === "postgres";

  const handleObjectContextMenu = (
    e: React.MouseEvent,
    objName: string,
    objCategory: ObjectCategory
  ) => {
    e.preventDefault();
    e.stopPropagation();
    void selectObject(profile.id, database, schema, objCategory, objName);

    if (objCategory === "tables") {
      setMenuState({
        x: e.clientX,
        y: e.clientY,
        items: [
          {
            id: "open",
            label: "開啟資料表",
            icon: <Table2 className="h-3.5 w-3.5 text-[#2563eb]" />,
            onClick: () => void openTableDataTab(profile.id, database, schema, objName),
          },
          {
            id: "design",
            label: "設計資料表",
            icon: <Edit3 className="h-3.5 w-3.5 text-[#d97706]" />,
            onClick: () => void openTableDesignTab(profile.id, database, schema, objName),
          },
          {
            id: "query",
            label: "新建 SELECT 查詢",
            icon: <Play className="h-3.5 w-3.5 text-[#16a34a]" />,
            onClick: () =>
              openQueryTab(
                profile.id,
                database,
                schema,
                isPg
                  ? `SELECT * FROM "${schema || "public"}"."${objName}" LIMIT 100;`
                  : `SELECT * FROM \`${database}\`.\`${objName}\` LIMIT 100;`
              ),
          },
          { id: "div1", divider: true },
          {
            id: "rename",
            label: "重新命名...",
            icon: <Edit3 className="h-3.5 w-3.5" />,
            onClick: () => setRenameTarget({ oldName: objName, newName: objName }),
          },
          {
            id: "dump",
            label: "檢視 / 匯出 DDL (Dump SQL)",
            icon: <FileCode2 className="h-3.5 w-3.5 text-[#7c3aed]" />,
            onClick: async () => {
              const ddl = await getTableDdl(profile.id, database, schema, "TABLE", objName);
              setDumpDdl({ title: `${objName} — DDL`, sql: ddl });
            },
          },
          {
            id: "copy",
            label: "複製名稱",
            icon: <Copy className="h-3.5 w-3.5" />,
            onClick: () => void navigator.clipboard?.writeText(objName),
          },
          { id: "div2", divider: true },
          {
            id: "truncate",
            label: "清空資料表 (TRUNCATE)",
            icon: <Trash2 className="h-3.5 w-3.5" />,
            danger: true,
            onClick: () => void truncateTable(profile.id, database, schema, objName),
          },
          {
            id: "drop",
            label: "刪除資料表 (DROP)",
            icon: <Trash2 className="h-3.5 w-3.5" />,
            danger: true,
            onClick: () => void dropTable(profile.id, database, schema, objName),
          },
        ],
      });
    } else {
      setMenuState({
        x: e.clientX,
        y: e.clientY,
        items: [
          ...(objCategory === "views"
            ? [
                {
                  id: "open-view",
                  label: "開啟檢視表資料",
                  icon: <Eye className="h-3.5 w-3.5 text-[#0891b2]" />,
                  onClick: () =>
                    void openTableDataTab(profile.id, database, schema, objName),
                },
              ]
            : []),
          {
            id: "copy-obj",
            label: "複製名稱",
            icon: <Copy className="h-3.5 w-3.5" />,
            onClick: () => void navigator.clipboard?.writeText(objName),
          },
        ],
      });
    }
  };

  const filteredTables = tables.filter((t) =>
    t.name.toLowerCase().includes(filterLower)
  );
  const filteredViews = views.filter((v) =>
    v.name.toLowerCase().includes(filterLower)
  );
  const filteredRoutines = routines.filter((r) =>
    r.name.toLowerCase().includes(filterLower)
  );
  const filteredSequences = sequences.filter((s) =>
    s.name.toLowerCase().includes(filterLower)
  );
  const filteredQueries = savedQueries.filter(
    (q) =>
      q.profileId === profile.id &&
      (!q.databaseName || q.databaseName === database) &&
      (!schema || !q.schemaName || q.schemaName === schema) &&
      q.title.toLowerCase().includes(filterLower)
  );

  const selectedObjName = selectedScope?.objectName ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      {/* ActionToolBar2 */}
      <div
        className={`flex items-center justify-between border-b px-2.5 text-[11px] ${
          isMac
            ? "h-[32px] border-black/10 bg-[#f5f5f7]"
            : "h-[26px] border-[#dcdfe6] bg-[#f8f9fb] px-2"
        }`}
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={!selectedObjName || category !== "tables"}
            onClick={() =>
              selectedObjName &&
              void openTableDataTab(profile.id, database, schema, selectedObjName)
            }
            className={`flex items-center gap-1 px-2 py-0.5 disabled:opacity-40 ${
              isMac ? "rounded-md hover:bg-black/6" : "rounded hover:bg-[#e2e8f0]"
            }`}
          >
            <Table2 className="h-3 w-3 text-[#2563eb]" />
            <span>{t(language, "openTable")}</span>
          </button>
          <button
            type="button"
            disabled={!selectedObjName || category !== "tables"}
            onClick={() =>
              selectedObjName &&
              void openTableDesignTab(profile.id, database, schema, selectedObjName)
            }
            className={`flex items-center gap-1 px-2 py-0.5 disabled:opacity-40 ${
              isMac ? "rounded-md hover:bg-black/6" : "rounded hover:bg-[#e2e8f0]"
            }`}
          >
            <Edit3 className="h-3 w-3 text-[#d97706]" />
            <span>{t(language, "designTable")}</span>
          </button>
          <button
            type="button"
            onClick={() => openNewTableDesignTab(profile.id, database, schema)}
            className={`flex items-center gap-1 px-2 py-0.5 ${
              isMac ? "rounded-md hover:bg-black/6" : "rounded hover:bg-[#e2e8f0]"
            }`}
          >
            <Plus className="h-3 w-3 text-[#2563eb]" />
            <span>{t(language, "newTable")}</span>
          </button>
          <button
            type="button"
            onClick={() => openQueryTab(profile.id, database, schema)}
            className={`flex items-center gap-1 px-2 py-0.5 ${
              isMac ? "rounded-md hover:bg-black/6" : "rounded hover:bg-[#e2e8f0]"
            }`}
          >
            <Plus className="h-3 w-3 text-[#16a34a]" />
            <span>{t(language, "newQuery")}</span>
          </button>
          <button
            type="button"
            onClick={() => void loadScopeObjects(profile.id, database, schema)}
            className={`flex items-center gap-1 px-2 py-0.5 ${
              isMac ? "rounded-md hover:bg-black/6" : "rounded hover:bg-[#e2e8f0]"
            }`}
          >
            <RefreshCw className="h-3 w-3 text-[#475569]" />
            <span>{t(language, "refresh")}</span>
          </button>

          <span className="mx-1 h-3.5 border-l border-[#cbd5e1]" />

          {/* Category Switcher */}
          {(
            [
              { id: "tables", label: t(language, "tables") },
              { id: "views", label: t(language, "views") },
              { id: "routines", label: t(language, "routines") },
              ...(isPg ? [{ id: "sequences", label: t(language, "sequences") }] : []),
              { id: "queries", label: t(language, "queries") },
            ] as { id: ObjectCategory; label: string }[]
          ).map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() =>
                void selectScope({
                  profileId: profile.id,
                  database,
                  schema,
                  category: cat.id,
                })
              }
              className={`px-2 py-0.5 text-[11px] ${
                isMac ? "rounded-md" : "rounded"
              } ${
                category === cat.id
                  ? isMac
                    ? "bg-white font-semibold text-[#0066cc] shadow-sm ring-1 ring-black/8"
                    : "bg-[#dbeafe] font-semibold text-[#1d4ed8]"
                  : isMac
                  ? "text-[#48484a] hover:bg-black/6"
                  : "text-[#475569] hover:bg-[#e2e8f0]"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Search + ViewMode toggle */}
        <div className="flex items-center gap-1.5">
          <div
            className={`flex w-40 items-center gap-1 border bg-white px-2 ${
              isMac
                ? "h-[22px] rounded-full border-black/10"
                : "h-[20px] rounded border-[#cbd5e1] px-1.5"
            }`}
          >
            <Search className="h-3 w-3 text-[#9ca3af]" />
            <input
              type="text"
              value={objectFilter}
              onChange={(e) => setObjectFilter(e.target.value)}
              placeholder={t(language, "filterObjects")}
              className="w-full bg-transparent text-[10px] outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() =>
              setObjectViewMode(objectViewMode === "list" ? "grid" : "list")
            }
            title={language === "en" ? "Toggle List / Grid View" : "切換清單 / 圖示檢視"}
            className={`flex w-[24px] items-center justify-center border bg-white ${
              isMac
                ? "h-[22px] rounded-md border-black/10 hover:bg-black/4"
                : "h-[20px] rounded border-[#cbd5e1] hover:bg-[#f1f5f9]"
            }`}
          >
            {objectViewMode === "list" ? (
              <LayoutGrid className="h-3 w-3 text-[#475569]" />
            ) : (
              <List className="h-3 w-3 text-[#475569]" />
            )}
          </button>
        </div>
      </div>

      {/* Main TListView DataGrid / Grid */}
      <div className="min-h-0 flex-1 overflow-auto">
        {objectViewMode === "grid" && category === "tables" ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2 p-3">
            {filteredTables.map((tbl) => {
              const selected = selectedObjName === tbl.name;
              return (
                <div
                  key={tbl.name}
                  onClick={() =>
                    void selectObject(profile.id, database, schema, "tables", tbl.name)
                  }
                  onDoubleClick={() =>
                    void openTableDataTab(profile.id, database, schema, tbl.name)
                  }
                  onContextMenu={(e) => handleObjectContextMenu(e, tbl.name, "tables")}
                  className={`flex cursor-pointer flex-col items-center rounded border p-3 text-center text-[11px] ${
                    selected
                      ? "border-[#2563eb] bg-[#eff6ff] text-[#1e3a8a]"
                      : "border-[#e2e8f0] hover:bg-[#f8fafc]"
                  }`}
                >
                  <Table2 className="h-7 w-7 text-[#2563eb]" />
                  <span className="mt-1.5 w-full truncate font-medium">{tbl.name}</span>
                  <span className="text-[10px] text-[#64748b]">
                    {tbl.rowsEstimate ?? 0} {language === "en" ? "rows" : "列"}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <table className="w-full border-collapse text-left text-[11px]">
            <thead className="sticky top-0 z-10 h-[24px] border-b border-[#d4d8e0] bg-[#f4f6f9] text-[#475569]">
              {category === "tables" && (
                <tr>
                  <th className="w-[242px] border-r border-[#e2e8f0] px-2.5 font-medium">
                    {language === "en" ? "Name" : "名稱"}
                  </th>
                  <th className="w-[84px] border-r border-[#e2e8f0] px-2.5 font-medium">
                    {language === "en" ? "Rows" : "列"}
                  </th>
                  <th className="w-[98px] border-r border-[#e2e8f0] px-2.5 font-medium">
                    {language === "en" ? "Data Length" : "資料長度"}
                  </th>
                  <th className="w-[96px] border-r border-[#e2e8f0] px-2.5 font-medium">
                    {isPg
                      ? language === "en"
                        ? "Tablespace"
                        : "資料表空間"
                      : language === "en"
                      ? "Engine"
                      : "引擎"}
                  </th>
                  <th className="w-[136px] border-r border-[#e2e8f0] px-2.5 font-medium">
                    {isPg
                      ? language === "en"
                        ? "Owner"
                        : "擁有者"
                      : language === "en"
                      ? "Modified"
                      : "修改日期"}
                  </th>
                  <th className="px-2.5 font-medium">
                    {language === "en" ? "Comment" : "註解"}
                  </th>
                </tr>
              )}
              {category === "views" && (
                <tr>
                  <th className="w-[260px] border-r border-[#e2e8f0] px-2.5 font-medium">
                    檢視表名稱
                  </th>
                  <th className="w-[160px] border-r border-[#e2e8f0] px-2.5 font-medium">
                    定義者 / 擁有者
                  </th>
                  <th className="w-[100px] border-r border-[#e2e8f0] px-2.5 font-medium">
                    可更新
                  </th>
                  <th className="px-2.5 font-medium">註解</th>
                </tr>
              )}
              {category === "routines" && (
                <tr>
                  <th className="w-[240px] border-r border-[#e2e8f0] px-2.5 font-medium">
                    名稱
                  </th>
                  <th className="w-[100px] border-r border-[#e2e8f0] px-2.5 font-medium">
                    類型
                  </th>
                  <th className="w-[140px] border-r border-[#e2e8f0] px-2.5 font-medium">
                    回傳型別
                  </th>
                  <th className="w-[140px] border-r border-[#e2e8f0] px-2.5 font-medium">
                    定義者
                  </th>
                  <th className="px-2.5 font-medium">註解</th>
                </tr>
              )}
              {category === "sequences" && (
                <tr>
                  <th className="w-[260px] border-r border-[#e2e8f0] px-2.5 font-medium">
                    序列名稱
                  </th>
                  <th className="w-[120px] border-r border-[#e2e8f0] px-2.5 font-medium">
                    資料型別
                  </th>
                  <th className="px-2.5 font-medium">目前數值</th>
                </tr>
              )}
              {category === "queries" && (
                <tr>
                  <th className="w-[240px] border-r border-[#e2e8f0] px-2.5 font-medium">
                    查詢名稱
                  </th>
                  <th className="w-[160px] border-r border-[#e2e8f0] px-2.5 font-medium">
                    修改日期
                  </th>
                  <th className="px-2.5 font-medium">SQL 預覽</th>
                </tr>
              )}
            </thead>

            <tbody>
              {category === "tables" &&
                filteredTables.map((tbl) => {
                  const selected = selectedObjName === tbl.name;
                  return (
                    <tr
                      key={tbl.name}
                      onClick={() =>
                        void selectObject(profile.id, database, schema, "tables", tbl.name)
                      }
                      onDoubleClick={() =>
                        void openTableDataTab(profile.id, database, schema, tbl.name)
                      }
                      onContextMenu={(e) => handleObjectContextMenu(e, tbl.name, "tables")}
                      className={`h-[24px] cursor-pointer border-b border-[#f1f5f9] ${
                        selected
                          ? "bg-[#dbeafe] text-[#1e3a8a]"
                          : "hover:bg-[#f8fafc]"
                      }`}
                    >
                      <td className="px-2.5 font-medium">
                        <span className="flex items-center gap-1.5">
                          <Table2 className="h-3.5 w-3.5 text-[#2563eb] flex-shrink-0" />
                          <span className="truncate">{tbl.name}</span>
                        </span>
                      </td>
                      <td className="px-2.5 font-mono text-[#475569]">
                        {tbl.rowsEstimate != null
                          ? tbl.rowsEstimate.toLocaleString()
                          : "-"}
                      </td>
                      <td className="px-2.5 font-mono text-[#475569]">
                        {formatBytes(tbl.dataLengthBytes)}
                      </td>
                      <td className="px-2.5 text-[#475569]">
                        {isPg ? tbl.tablespace ?? "-" : tbl.engine ?? "-"}
                      </td>
                      <td className="px-2.5 font-mono text-[#475569]">
                        {isPg ? tbl.owner ?? "-" : tbl.modifiedAt ?? "-"}
                      </td>
                      <td className="px-2.5 text-[#64748b] truncate">
                        {tbl.comment ?? ""}
                      </td>
                    </tr>
                  );
                })}

              {category === "views" &&
                filteredViews.map((v) => (
                  <tr
                    key={v.name}
                    onClick={() =>
                      void selectObject(profile.id, database, schema, "views", v.name)
                    }
                    onDoubleClick={() =>
                      void openTableDataTab(profile.id, database, schema, v.name)
                    }
                    onContextMenu={(e) => handleObjectContextMenu(e, v.name, "views")}
                    className={`h-[24px] cursor-pointer border-b border-[#f1f5f9] ${
                      selectedObjName === v.name
                        ? "bg-[#dbeafe] text-[#1e3a8a]"
                        : "hover:bg-[#f8fafc]"
                    }`}
                  >
                    <td className="px-2.5 font-medium">
                      <span className="flex items-center gap-1.5">
                        <Eye className="h-3.5 w-3.5 text-[#0891b2]" />
                        <span>{v.name}</span>
                      </span>
                    </td>
                    <td className="px-2.5 font-mono text-[#475569]">
                      {v.owner ?? "-"}
                    </td>
                    <td className="px-2.5 text-[#475569]">
                      {v.isUpdatable == null ? "-" : v.isUpdatable ? "YES" : "NO"}
                    </td>
                    <td className="px-2.5 text-[#64748b]">{v.comment ?? ""}</td>
                  </tr>
                ))}

              {category === "routines" &&
                filteredRoutines.map((r) => (
                  <tr
                    key={r.name}
                    onClick={() =>
                      void selectObject(profile.id, database, schema, "routines", r.name)
                    }
                    onContextMenu={(e) => handleObjectContextMenu(e, r.name, "routines")}
                    className={`h-[24px] cursor-pointer border-b border-[#f1f5f9] ${
                      selectedObjName === r.name
                        ? "bg-[#dbeafe] text-[#1e3a8a]"
                        : "hover:bg-[#f8fafc]"
                    }`}
                  >
                    <td className="px-2.5 font-medium">
                      <span className="flex items-center gap-1.5">
                        <FileCode2 className="h-3.5 w-3.5 text-[#7c3aed]" />
                        <span>{r.name}</span>
                      </span>
                    </td>
                    <td className="px-2.5 font-mono text-[#475569]">{r.routineType}</td>
                    <td className="px-2.5 font-mono text-[#475569]">
                      {r.returnType ?? "-"}
                    </td>
                    <td className="px-2.5 font-mono text-[#475569]">
                      {r.definer ?? "-"}
                    </td>
                    <td className="px-2.5 text-[#64748b]">{r.comment ?? ""}</td>
                  </tr>
                ))}

              {category === "sequences" &&
                filteredSequences.map((s) => (
                  <tr
                    key={s.name}
                    onClick={() =>
                      void selectObject(profile.id, database, schema, "sequences", s.name)
                    }
                    className={`h-[24px] cursor-pointer border-b border-[#f1f5f9] ${
                      selectedObjName === s.name
                        ? "bg-[#dbeafe] text-[#1e3a8a]"
                        : "hover:bg-[#f8fafc]"
                    }`}
                  >
                    <td className="px-2.5 font-medium">{s.name}</td>
                    <td className="px-2.5 font-mono text-[#475569]">
                      {s.dataType ?? "-"}
                    </td>
                    <td className="px-2.5 font-mono text-[#475569]">
                      {s.lastValue ?? "-"}
                    </td>
                  </tr>
                ))}

              {category === "queries" &&
                filteredQueries.map((q) => (
                  <tr
                    key={q.id}
                    onDoubleClick={() => openSavedQueryTab(q)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setMenuState({
                        x: e.clientX,
                        y: e.clientY,
                        items: [
                          {
                            id: "open-sq",
                            label: "開啟查詢",
                            icon: <Terminal className="h-3.5 w-3.5 text-[#059669]" />,
                            onClick: () => openSavedQueryTab(q),
                          },
                          {
                            id: "del-sq",
                            label: "刪除查詢",
                            icon: <Trash2 className="h-3.5 w-3.5" />,
                            danger: true,
                            onClick: () => void deleteSavedQuery(q.id),
                          },
                        ],
                      });
                    }}
                    className="h-[24px] cursor-pointer border-b border-[#f1f5f9] hover:bg-[#f8fafc]"
                  >
                    <td className="px-2.5 font-medium">
                      <span className="flex items-center gap-1.5">
                        <Terminal className="h-3.5 w-3.5 text-[#059669]" />
                        <span>{q.title}</span>
                      </span>
                    </td>
                    <td className="px-2.5 font-mono text-[#475569]">
                      {q.updatedAt.slice(0, 19).replace("T", " ")}
                    </td>
                    <td className="px-2.5 font-mono text-[#64748b] truncate max-w-[420px]">
                      {q.sqlText.replace(/\s+/g, " ").trim()}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>

      {menuState && (
        <ContextMenu
          x={menuState.x}
          y={menuState.y}
          items={menuState.items}
          onClose={() => setMenuState(null)}
        />
      )}

      {/* Rename Modal */}
      {renameTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await renameTable(
                profile.id,
                database,
                schema,
                renameTarget.oldName,
                renameTarget.newName
              );
              setRenameTarget(null);
            }}
            className="w-80 rounded border border-[#cbd5e1] bg-white p-4 shadow-xl text-xs"
          >
            <h3 className="font-semibold text-[#0f172a]">重新命名資料表</h3>
            <input
              autoFocus
              type="text"
              value={renameTarget.newName}
              onChange={(e) =>
                setRenameTarget({ ...renameTarget, newName: e.target.value })
              }
              className="mt-3 h-7 w-full rounded border border-[#cbd5e1] px-2 font-mono outline-none focus:border-[#2563eb]"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenameTarget(null)}
                className="rounded border border-[#cbd5e1] px-3 py-1 hover:bg-[#f1f5f9]"
              >
                取消
              </button>
              <button
                type="submit"
                className="rounded bg-[#2563eb] px-3 py-1 text-white hover:bg-[#1d4ed8]"
              >
                確定
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Dump SQL Modal */}
      {dumpDdl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
          <div className="flex w-full max-w-2xl flex-col rounded border border-[#cbd5e1] bg-white shadow-xl text-xs">
            <div className="flex items-center justify-between border-b border-[#e2e8f0] px-4 py-2.5 font-semibold">
              <span className="flex items-center gap-1.5">
                <Terminal className="h-4 w-4 text-[#7c3aed]" />
                {dumpDdl.title}
              </span>
              <button
                type="button"
                onClick={() => setDumpDdl(null)}
                className="rounded px-2 py-0.5 text-[#64748b] hover:bg-[#f1f5f9]"
              >
                關閉
              </button>
            </div>
            <pre className="max-h-96 overflow-auto bg-[#0f172a] p-4 font-mono text-[11px] text-[#e2e8f0]">
              {dumpDdl.sql}
            </pre>
            <div className="flex justify-end gap-2 border-t border-[#e2e8f0] px-4 py-2">
              <button
                type="button"
                onClick={() => void navigator.clipboard?.writeText(dumpDdl.sql)}
                className="rounded bg-[#2563eb] px-3 py-1 text-white hover:bg-[#1d4ed8]"
              >
                複製 SQL
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
