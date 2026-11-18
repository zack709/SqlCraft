import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Database,
  Edit3,
  Eye,
  FileCode2,
  Folder,
  FolderOpen,
  Layers,
  ListOrdered,
  Loader2,
  Play,
  Plug,
  PowerOff,
  RefreshCw,
  Search,
  Sparkles,
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
import type { ConnectionProfile } from "../types/database";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";

interface ConnectionTreeProps {
  width: number;
}

const DB_BADGE: Record<ConnectionProfile["dbKind"], { label: string; color: string }> = {
  mysql: { label: "MySQL", color: "#2563eb" },
  mariadb: { label: "MariaDB", color: "#0d9488" },
  postgres: { label: "PG", color: "#4f46e5" },
};

export function ConnectionTree({ width }: ConnectionTreeProps) {
  const {
    profiles,
    connectionStates,
    databasesByProfile,
    schemasByDb,
    tablesByScope,
    viewsByScope,
    routinesByScope,
    sequencesByScope,
    savedQueries,
    loadingNodes,
    expandedNodes,
    selectedScope,
    treeFilter,
    setTreeFilter,
    connectProfile,
    disconnectProfile,
    openConnectionModal,
    deleteProfile,
    duplicateProfile,
    loadDatabases,
    loadSchemas,
    loadScopeObjects,
    setNodeExpanded,
    toggleNodeExpanded,
    selectScope,
    selectObject,
    openTableDataTab,
    openTableDesignTab,
    openQueryTab,
    openSavedQueryTab,
    deleteSavedQuery,
  } = useWorkbenchStore();

  const [menuState, setMenuState] = useState<{
    x: number;
    y: number;
    items: ContextMenuItem[];
  } | null>(null);

  const filterLower = treeFilter.trim().toLowerCase();

  const handleToggleConnection = async (profile: ConnectionProfile) => {
    const key = `conn:${profile.id}`;
    const status = connectionStates[profile.id] ?? "disconnected";
    if (status !== "connected" && status !== "demo") {
      const ok = await connectProfile(profile.id, false);
      if (!ok) return;
      return;
    }
    toggleNodeExpanded(key);
  };

  const handleToggleDatabase = async (profile: ConnectionProfile, dbName: string) => {
    const dbKey = makeDbKey(profile.id, dbName);
    const nodeKey = `db:${dbKey}`;
    const next = !expandedNodes[nodeKey];
    setNodeExpanded(nodeKey, next);

    if (next) {
      if (profile.dbKind === "postgres") {
        if (!schemasByDb[dbKey]) {
          await loadSchemas(profile.id, dbName);
        }
      } else {
        const sKey = makeScopeKey(profile.id, dbName, null);
        if (!tablesByScope[sKey]) {
          await loadScopeObjects(profile.id, dbName, null);
        }
        await selectScope({
          profileId: profile.id,
          database: dbName,
          schema: null,
          category: "tables",
        });
      }
    }
  };

  const handleToggleSchema = async (
    profile: ConnectionProfile,
    dbName: string,
    schemaName: string
  ) => {
    const sKey = makeScopeKey(profile.id, dbName, schemaName);
    const nodeKey = `schema:${sKey}`;
    const next = !expandedNodes[nodeKey];
    setNodeExpanded(nodeKey, next);

    if (next && !tablesByScope[sKey]) {
      await loadScopeObjects(profile.id, dbName, schemaName);
    }
    await selectScope({
      profileId: profile.id,
      database: dbName,
      schema: schemaName,
      category: "tables",
    });
  };

  const openConnectionMenu = (e: React.MouseEvent, profile: ConnectionProfile) => {
    e.preventDefault();
    e.stopPropagation();
    const status = connectionStates[profile.id] ?? "disconnected";
    const isActive = status === "connected" || status === "demo";

    setMenuState({
      x: e.clientX,
      y: e.clientY,
      items: [
        isActive
          ? {
              id: "close-conn",
              label: "關閉連線",
              icon: <PowerOff className="h-3.5 w-3.5" />,
              onClick: () => void disconnectProfile(profile.id),
            }
          : {
              id: "open-conn",
              label: "開啟連線",
              icon: <Plug className="h-3.5 w-3.5 text-[#16a34a]" />,
              onClick: () => void connectProfile(profile.id, false),
            },
        {
          id: "open-demo",
          label: "載入範例結構 (Demo)",
          icon: <Sparkles className="h-3.5 w-3.5 text-[#7c3aed]" />,
          onClick: () => void connectProfile(profile.id, true),
        },
        { id: "div-1", divider: true },
        {
          id: "new-query",
          label: "新增查詢",
          icon: <Terminal className="h-3.5 w-3.5 text-[#059669]" />,
          onClick: () => openQueryTab(profile.id, profile.initialDatabase ?? null, null),
        },
        {
          id: "refresh-conn",
          label: "重新整理資料庫",
          icon: <RefreshCw className="h-3.5 w-3.5" />,
          disabled: !isActive,
          onClick: () => void loadDatabases(profile.id),
        },
        { id: "div-2", divider: true },
        {
          id: "edit-conn",
          label: "編輯連線...",
          icon: <Edit3 className="h-3.5 w-3.5" />,
          onClick: () => openConnectionModal(profile),
        },
        {
          id: "dup-conn",
          label: "複製連線",
          icon: <Copy className="h-3.5 w-3.5" />,
          onClick: () => void duplicateProfile(profile),
        },
        { id: "div-3", divider: true },
        {
          id: "del-conn",
          label: "刪除連線",
          icon: <Trash2 className="h-3.5 w-3.5" />,
          danger: true,
          onClick: () => void deleteProfile(profile.id),
        },
      ],
    });
  };

  const renderCategoryChildren = (
    profile: ConnectionProfile,
    database: string,
    schema: string | null
  ) => {
    const scopeKey = makeScopeKey(profile.id, database, schema);
    const tables = tablesByScope[scopeKey] ?? [];
    const views = viewsByScope[scopeKey] ?? [];
    const routines = routinesByScope[scopeKey] ?? [];
    const sequences = sequencesByScope[scopeKey] ?? [];

    const categories: {
      id: ObjectCategory;
      label: string;
      count: number;
      icon: React.ReactNode;
      items: string[];
    }[] = [
      {
        id: "tables",
        label: "資料表",
        count: tables.length,
        icon: <Table2 className="h-3.5 w-3.5 text-[#2563eb]" />,
        items: tables.map((t) => t.name),
      },
      {
        id: "views",
        label: "檢視表",
        count: views.length,
        icon: <Eye className="h-3.5 w-3.5 text-[#0891b2]" />,
        items: views.map((v) => v.name),
      },
      {
        id: "routines",
        label: "函式",
        count: routines.length,
        icon: <FileCode2 className="h-3.5 w-3.5 text-[#7c3aed]" />,
        items: routines.map((r) => r.name),
      },
    ];

    if (profile.dbKind === "postgres") {
      categories.push({
        id: "sequences",
        label: "序列",
        count: sequences.length,
        icon: <ListOrdered className="h-3.5 w-3.5 text-[#d97706]" />,
        items: sequences.map((s) => s.name),
      });
    }

    const scopeSavedQueries = savedQueries.filter(
      (q) =>
        q.profileId === profile.id &&
        (!q.databaseName || q.databaseName === database) &&
        (!schema || !q.schemaName || q.schemaName === schema)
    );
    categories.push({
      id: "queries",
      label: "查詢",
      count: scopeSavedQueries.length,
      icon: <Terminal className="h-3.5 w-3.5 text-[#059669]" />,
      items: scopeSavedQueries.map((q) => q.title),
    });

    return categories.map((cat) => {
      const catNodeKey = `cat:${scopeKey}:${cat.id}`;
      const isCatExpanded = !!expandedNodes[catNodeKey];
      const isSelected =
        selectedScope?.profileId === profile.id &&
        selectedScope?.database === database &&
        (selectedScope?.schema || null) === (schema || null) &&
        selectedScope?.category === cat.id &&
        !selectedScope?.objectName;

      const filteredItems = filterLower
        ? cat.items.filter((name) => name.toLowerCase().includes(filterLower))
        : cat.items;

      return (
        <div key={catNodeKey}>
          <div
            onClick={() => {
              void selectScope({
                profileId: profile.id,
                database,
                schema,
                category: cat.id,
              });
              toggleNodeExpanded(catNodeKey);
            }}
            className={`flex cursor-pointer items-center gap-1 rounded px-1.5 py-1 text-[11px] ${
              isSelected ? "bg-[#dbeafe] text-[#1e3a8a] font-medium" : "hover:bg-[#eef2f7]"
            }`}
            style={{ paddingLeft: profile.dbKind === "postgres" ? 44 : 30 }}
          >
            {isCatExpanded ? (
              <ChevronDown className="h-3 w-3 text-[#64748b] flex-shrink-0" />
            ) : (
              <ChevronRight className="h-3 w-3 text-[#64748b] flex-shrink-0" />
            )}
            {cat.icon}
            <span className="truncate">{cat.label}</span>
            <span className="ml-auto text-[10px] text-[#94a3b8]">{cat.count}</span>
          </div>

          {isCatExpanded &&
            filteredItems.map((objName) => {
              const objSelected =
                selectedScope?.profileId === profile.id &&
                selectedScope?.database === database &&
                (selectedScope?.schema || null) === (schema || null) &&
                selectedScope?.category === cat.id &&
                selectedScope?.objectName === objName;

              return (
                <div
                  key={`${catNodeKey}:${objName}`}
                  onClick={() =>
                    void selectObject(profile.id, database, schema, cat.id, objName)
                  }
                  onDoubleClick={() => {
                    if (cat.id === "tables" || cat.id === "views") {
                      void openTableDataTab(profile.id, database, schema, objName);
                    } else if (cat.id === "queries") {
                      const found = scopeSavedQueries.find((q) => q.title === objName);
                      if (found) openSavedQueryTab(found);
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (cat.id === "queries") {
                      const found = scopeSavedQueries.find((q) => q.title === objName);
                      if (found) {
                        setMenuState({
                          x: e.clientX,
                          y: e.clientY,
                          items: [
                            {
                              id: "open-sq",
                              label: "開啟查詢",
                              icon: <Terminal className="h-3.5 w-3.5 text-[#059669]" />,
                              onClick: () => openSavedQueryTab(found),
                            },
                            {
                              id: "del-sq",
                              label: "刪除查詢",
                              icon: <Trash2 className="h-3.5 w-3.5" />,
                              danger: true,
                              onClick: () => void deleteSavedQuery(found.id),
                            },
                          ],
                        });
                      }
                      return;
                    }
                    if (cat.id === "tables") {
                      setMenuState({
                        x: e.clientX,
                        y: e.clientY,
                        items: [
                          {
                            id: "open-table",
                            label: "開啟資料表",
                            icon: <Table2 className="h-3.5 w-3.5 text-[#2563eb]" />,
                            onClick: () =>
                              void openTableDataTab(profile.id, database, schema, objName),
                          },
                          {
                            id: "design-table",
                            label: "設計資料表",
                            icon: <Edit3 className="h-3.5 w-3.5 text-[#d97706]" />,
                            onClick: () =>
                              void openTableDesignTab(profile.id, database, schema, objName),
                          },
                          {
                            id: "query-table",
                            label: "產生 SELECT 查詢",
                            icon: <Play className="h-3.5 w-3.5 text-[#16a34a]" />,
                            onClick: () =>
                              openQueryTab(
                                profile.id,
                                database,
                                schema,
                                profile.dbKind === "postgres"
                                  ? `SELECT * FROM "${schema || "public"}"."${objName}" LIMIT 100;`
                                  : `SELECT * FROM \`${database}\`.\`${objName}\` LIMIT 100;`
                              ),
                          },
                          { id: "div-t", divider: true },
                          {
                            id: "copy-name",
                            label: "複製名稱",
                            icon: <Copy className="h-3.5 w-3.5" />,
                            onClick: () => void navigator.clipboard?.writeText(objName),
                          },
                        ],
                      });
                    }
                  }}
                  className={`flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] ${
                    objSelected
                      ? "bg-[#dbeafe] text-[#1e3a8a] font-medium"
                      : "hover:bg-[#eef2f7]"
                  }`}
                  style={{ paddingLeft: profile.dbKind === "postgres" ? 60 : 46 }}
                >
                  {cat.icon}
                  <span className="truncate">{objName}</span>
                </div>
              );
            })}
        </div>
      );
    });
  };

  return (
    <aside
      style={{ width }}
      className="flex flex-shrink-0 flex-col border-r border-[#d4d8e0] bg-[#fbfcfd]"
    >
      {/* Header */}
      <div className="flex h-[28px] items-center justify-between border-b border-[#e5e7eb] px-2.5 text-[11px] font-semibold text-[#374151]">
        <span>連線導覽</span>
        <button
          type="button"
          onClick={() => openConnectionModal(null)}
          title="新建連線"
          className="rounded px-1.5 py-0.5 text-[10px] font-medium text-[#2563eb] hover:bg-[#eff6ff]"
        >
          + 新建
        </button>
      </div>

      {/* TVirtualStringTree equivalent */}
      <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1.5">
        {profiles
          .filter(
            (p) =>
              !filterLower ||
              p.name.toLowerCase().includes(filterLower) ||
              (databasesByProfile[p.id] ?? []).some((d) =>
                d.name.toLowerCase().includes(filterLower)
              ) ||
              !!expandedNodes[`conn:${p.id}`]
          )
          .map((profile) => {
            const connKey = `conn:${profile.id}`;
            const status = connectionStates[profile.id] ?? "disconnected";
            const isConnected = status === "connected" || status === "demo";
            const isConnecting = status === "connecting";
            const isExpanded = !!expandedNodes[connKey];
            const dbs = databasesByProfile[profile.id] ?? [];
            const badge = DB_BADGE[profile.dbKind];

            return (
              <div key={profile.id} className="mb-0.5">
                <div
                  onClick={() => {
                    if (isConnected) {
                      toggleNodeExpanded(connKey);
                    } else {
                      void selectScope({
                        profileId: profile.id,
                        category: "tables",
                      });
                    }
                  }}
                  onDoubleClick={() => void handleToggleConnection(profile)}
                  onContextMenu={(e) => openConnectionMenu(e, profile)}
                  className={`flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-[11px] ${
                    selectedScope?.profileId === profile.id && !selectedScope?.database
                      ? "bg-[#dbeafe] text-[#1e3a8a]"
                      : "hover:bg-[#eef2f7]"
                  }`}
                >
                  {isConnecting ? (
                    <Loader2 className="h-3 w-3 animate-spin text-[#2563eb] flex-shrink-0" />
                  ) : isExpanded ? (
                    <ChevronDown className="h-3 w-3 text-[#64748b] flex-shrink-0" />
                  ) : (
                    <ChevronRight className="h-3 w-3 text-[#64748b] flex-shrink-0" />
                  )}

                  <span className="relative flex-shrink-0">
                    <Database
                      className="h-3.5 w-3.5"
                      style={{ color: profile.color || badge.color }}
                    />
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-white ${
                        status === "connected"
                          ? "bg-[#16a34a]"
                          : status === "demo"
                          ? "bg-[#7c3aed]"
                          : status === "error"
                          ? "bg-[#dc2626]"
                          : "bg-[#9ca3af]"
                      }`}
                    />
                  </span>

                  <span
                    className={`truncate ${
                      isConnected ? "font-semibold text-[#111827]" : "text-[#4b5563]"
                    }`}
                  >
                    {profile.name}
                  </span>

                  <span className="ml-auto flex items-center gap-1 flex-shrink-0">
                    {status === "demo" && (
                      <span className="rounded bg-[#ede9fe] px-1 py-0 text-[9px] font-semibold text-[#6d28d9]">
                        DEMO
                      </span>
                    )}
                    <span
                      className="rounded px-1 text-[9px] font-semibold text-white"
                      style={{ backgroundColor: badge.color }}
                    >
                      {badge.label}
                    </span>
                  </span>
                </div>

                {/* Databases */}
                {isExpanded &&
                  isConnected &&
                  dbs.map((db) => {
                    const dbKey = makeDbKey(profile.id, db.name);
                    const dbNodeKey = `db:${dbKey}`;
                    const dbExpanded = !!expandedNodes[dbNodeKey];
                    const dbLoading = !!loadingNodes[dbNodeKey];
                    const schemas = schemasByDb[dbKey] ?? [];
                    const isDbSelected =
                      selectedScope?.profileId === profile.id &&
                      selectedScope?.database === db.name &&
                      !selectedScope?.schema;

                    return (
                      <div key={dbNodeKey}>
                        <div
                          onClick={() => void handleToggleDatabase(profile, db.name)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setMenuState({
                              x: e.clientX,
                              y: e.clientY,
                              items: [
                                {
                                  id: "db-query",
                                  label: `在 ${db.name} 新增查詢`,
                                  icon: <Terminal className="h-3.5 w-3.5 text-[#059669]" />,
                                  onClick: () => openQueryTab(profile.id, db.name, null),
                                },
                                {
                                  id: "db-refresh",
                                  label: "重新整理資料庫物件",
                                  icon: <RefreshCw className="h-3.5 w-3.5" />,
                                  onClick: () => {
                                    if (profile.dbKind === "postgres") {
                                      void loadSchemas(profile.id, db.name);
                                    } else {
                                      void loadScopeObjects(profile.id, db.name, null);
                                    }
                                  },
                                },
                              ],
                            });
                          }}
                          className={`flex cursor-pointer items-center gap-1 rounded px-1.5 py-1 text-[11px] ${
                            isDbSelected
                              ? "bg-[#dbeafe] text-[#1e3a8a] font-medium"
                              : "hover:bg-[#eef2f7]"
                          }`}
                          style={{ paddingLeft: 18 }}
                        >
                          {dbLoading ? (
                            <Loader2 className="h-3 w-3 animate-spin text-[#2563eb] flex-shrink-0" />
                          ) : dbExpanded ? (
                            <ChevronDown className="h-3 w-3 text-[#64748b] flex-shrink-0" />
                          ) : (
                            <ChevronRight className="h-3 w-3 text-[#64748b] flex-shrink-0" />
                          )}
                          {dbExpanded ? (
                            <FolderOpen className="h-3.5 w-3.5 text-[#eab308] flex-shrink-0" />
                          ) : (
                            <Folder className="h-3.5 w-3.5 text-[#eab308] flex-shrink-0" />
                          )}
                          <span className="truncate">{db.name}</span>
                        </div>

                        {dbExpanded &&
                          (profile.dbKind === "postgres"
                            ? schemas.map((sc) => {
                                const sKey = makeScopeKey(profile.id, db.name, sc.name);
                                const scNodeKey = `schema:${sKey}`;
                                const scExpanded = !!expandedNodes[scNodeKey];
                                const scSelected =
                                  selectedScope?.profileId === profile.id &&
                                  selectedScope?.database === db.name &&
                                  selectedScope?.schema === sc.name &&
                                  !selectedScope?.objectName;

                                return (
                                  <div key={scNodeKey}>
                                    <div
                                      onClick={() =>
                                        void handleToggleSchema(profile, db.name, sc.name)
                                      }
                                      onContextMenu={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setMenuState({
                                          x: e.clientX,
                                          y: e.clientY,
                                          items: [
                                            {
                                              id: "sc-query",
                                              label: `在 ${sc.name} 新增查詢`,
                                              icon: (
                                                <Terminal className="h-3.5 w-3.5 text-[#059669]" />
                                              ),
                                              onClick: () =>
                                                openQueryTab(profile.id, db.name, sc.name),
                                            },
                                            {
                                              id: "sc-refresh",
                                              label: "重新整理 Schema",
                                              icon: <RefreshCw className="h-3.5 w-3.5" />,
                                              onClick: () =>
                                                void loadScopeObjects(
                                                  profile.id,
                                                  db.name,
                                                  sc.name
                                                ),
                                            },
                                          ],
                                        });
                                      }}
                                      className={`flex cursor-pointer items-center gap-1 rounded px-1.5 py-1 text-[11px] ${
                                        scSelected
                                          ? "bg-[#dbeafe] text-[#1e3a8a] font-medium"
                                          : "hover:bg-[#eef2f7]"
                                      }`}
                                      style={{ paddingLeft: 32 }}
                                    >
                                      {scExpanded ? (
                                        <ChevronDown className="h-3 w-3 text-[#64748b] flex-shrink-0" />
                                      ) : (
                                        <ChevronRight className="h-3 w-3 text-[#64748b] flex-shrink-0" />
                                      )}
                                      <Layers className="h-3.5 w-3.5 text-[#6366f1] flex-shrink-0" />
                                      <span className="truncate">{sc.name}</span>
                                    </div>

                                    {scExpanded &&
                                      renderCategoryChildren(profile, db.name, sc.name)}
                                  </div>
                                );
                              })
                            : renderCategoryChildren(profile, db.name, null))}
                      </div>
                    );
                  })}
              </div>
            );
          })}
      </div>

      {/* Bottom plFilterControl (30px per navicat-ui-spec.md) */}
      <div className="flex h-[30px] items-center gap-1.5 border-t border-[#d4d8e0] bg-[#f8f9fb] px-2">
        <div className="flex h-[21px] flex-1 items-center gap-1 rounded border border-[#cbd5e1] bg-white px-1.5">
          <Search className="h-3.5 w-3.5 text-[#9ca3af] flex-shrink-0" />
          <input
            type="text"
            value={treeFilter}
            onChange={(e) => setTreeFilter(e.target.value)}
            placeholder="搜尋連線或物件..."
            className="w-full bg-transparent text-[11px] outline-none"
          />
        </div>
      </div>

      {menuState && (
        <ContextMenu
          x={menuState.x}
          y={menuState.y}
          items={menuState.items}
          onClose={() => setMenuState(null)}
        />
      )}
    </aside>
  );
}
