import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Edit3,
  FolderOpen,
  Layers,
  Loader2,
  Play,
  Plus,
  PowerOff,
  RefreshCw,
  Search,
  Server,
  Terminal,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { t } from "../lib/i18n";
import {
  makeDbKey,
  makeScopeKey,
  type ObjectCategory,
  useWorkbenchStore,
} from "../store/workbenchStore";
import type { ConnectionProfile } from "../types/database";
import { isMacOS } from "../utils/platform";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";
import { DbEngineIcon } from "./DbEngineIcon";

interface ConnectionTreeProps {
  width: number;
}

/** Navicat-style 3-tier Database Cylinder Icon (Green when opened, Gray when closed) */
function NavicatDbCylinderIcon({ opened }: { opened: boolean }) {
  const topColor = opened ? "#34d399" : "#cbd5e1";
  const tier1 = opened ? "#10b981" : "#94a3b8";
  const tier2 = opened ? "#059669" : "#64748b";
  const tier3 = opened ? "#047857" : "#475569";

  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0">
      {/* Bottom tier */}
      <path
        d="M3 12.2v3.1C3 16.8 6.13 18 10 18s7-1.2 7-2.7v-3.1c0 1.5-3.13 2.7-7 2.7s-7-1.2-7-2.7z"
        fill={tier3}
      />
      {/* Middle tier */}
      <path
        d="M3 8.4v3.1c0 1.5 3.13 2.7 7 2.7s7-1.2 7-2.7V8.4c0 1.5-3.13 2.7-7 2.7S3 9.9 3 8.4z"
        fill={tier2}
      />
      {/* Upper tier */}
      <path
        d="M3 4.7v3.1c0 1.5 3.13 2.7 7 2.7s7-1.2 7-2.7V4.7c0 1.5-3.13 2.7-7 2.7S3 6.2 3 4.7z"
        fill={tier1}
      />
      {/* Top cap */}
      <ellipse cx="10" cy="4.7" rx="7" ry="2.5" fill={topColor} />
    </svg>
  );
}

/** Navicat-style Blue Table Grid Icon */
function NavicatTableIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0">
      <rect x="2" y="2" width="16" height="16" rx="2.5" fill="#60a5fa" />
      <path
        d="M2 4.5C2 3.12 3.12 2 4.5 2h11C16.88 2 18 3.12 18 4.5V6H2V4.5z"
        fill="#1d4ed8"
      />
      {/* Grid cells */}
      <rect x="3.5" y="7.5" width="3.6" height="2.4" rx="0.4" fill="#dbeafe" />
      <rect x="8.2" y="7.5" width="3.6" height="2.4" rx="0.4" fill="#bfdbfe" />
      <rect x="12.9" y="7.5" width="3.6" height="2.4" rx="0.4" fill="#93c5fd" />
      <rect x="3.5" y="10.8" width="3.6" height="2.4" rx="0.4" fill="#bfdbfe" />
      <rect x="8.2" y="10.8" width="3.6" height="2.4" rx="0.4" fill="#dbeafe" />
      <rect x="12.9" y="10.8" width="3.6" height="2.4" rx="0.4" fill="#bfdbfe" />
      <rect x="3.5" y="14.1" width="3.6" height="2.4" rx="0.4" fill="#93c5fd" />
      <rect x="8.2" y="14.1" width="3.6" height="2.4" rx="0.4" fill="#bfdbfe" />
      <rect x="12.9" y="14.1" width="3.6" height="2.4" rx="0.4" fill="#dbeafe" />
    </svg>
  );
}

/** Navicat-style View Icon (Blue Grid + Glasses) */
function NavicatViewIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0">
      <rect x="2" y="2" width="15" height="14" rx="2.5" fill="#60a5fa" />
      <path
        d="M2 4.5C2 3.12 3.12 2 4.5 2h10C15.88 2 17 3.12 17 4.5V5.8H2V4.5z"
        fill="#2563eb"
      />
      <rect x="3.5" y="7" width="3.5" height="2.2" rx="0.4" fill="#dbeafe" />
      <rect x="8" y="7" width="3.5" height="2.2" rx="0.4" fill="#bfdbfe" />
      <rect x="3.5" y="10.2" width="3.5" height="2.2" rx="0.4" fill="#bfdbfe" />
      {/* Glasses overlay */}
      <circle cx="9.5" cy="15.2" r="2.8" fill="#1d4ed8" stroke="#eff6ff" strokeWidth="1.1" />
      <circle cx="15.5" cy="15.2" r="2.8" fill="#1d4ed8" stroke="#eff6ff" strokeWidth="1.1" />
      <line x1="12.1" y1="15.2" x2="12.9" y2="15.2" stroke="#eff6ff" strokeWidth="1.2" />
    </svg>
  );
}

/** Navicat-style Function (fx) Icon */
function NavicatFunctionIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0">
      <path
        d="M9.5 3.5c-1.8 0-2.7 1.1-3 2.9L5.8 10H3.8v1.8h1.7l-.7 4.2c-.2 1-.6 1.4-1.4 1.4-.4 0-.7-.1-1-.2l-.3 1.6c.4.2 1 .3 1.6.3 1.9 0 2.9-1.1 3.3-3.1l.7-4.2h2.4V10H8l.6-3.4c.2-1 .6-1.4 1.4-1.4.4 0 .8.1 1.1.2l.3-1.6c-.4-.2-1.1-.3-1.9-.3z"
        fill="#0ea5e9"
      />
      <path
        d="M12.2 11.2l2.1 2.9-2.2 2.9h1.9l1.3-1.8 1.3 1.8h1.9l-2.2-2.9 2.1-2.9h-1.9l-1.2 1.7-1.2-1.7h-1.9z"
        fill="#38bdf8"
      />
    </svg>
  );
}

/** Navicat-style Event (Green Clock) Icon */
function NavicatEventIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0">
      <circle cx="10" cy="10" r="8" fill="#22c55e" />
      <circle cx="10" cy="10" r="6" fill="#f0fdf4" />
      <line
        x1="10"
        y1="10"
        x2="10"
        y2="6.2"
        stroke="#15803d"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="10"
        y1="10"
        x2="6.8"
        y2="10"
        stroke="#15803d"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="10"
        y1="10"
        x2="13.2"
        y2="13.2"
        stroke="#f97316"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Navicat-style Query (Overlapping Orange & Blue Grids) Icon */
function NavicatQueryIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0">
      {/* Back orange grid */}
      <rect x="7" y="2" width="11" height="10" rx="2" fill="#fb923c" />
      <path
        d="M7 4C7 2.9 7.9 2 9 2h7c1.1 0 2 .9 2 2v1.2H7V4z"
        fill="#ea580c"
      />
      {/* Front blue grid */}
      <rect x="2" y="8" width="11" height="10" rx="2" fill="#60a5fa" />
      <path
        d="M2 10c0-1.1.9-2 2-2h7c1.1 0 2 .9 2 2v1.2H2V10z"
        fill="#2563eb"
      />
      <rect x="3.5" y="12.2" width="3.5" height="2" rx="0.3" fill="#dbeafe" />
      <rect x="8" y="12.2" width="3.5" height="2" rx="0.3" fill="#bfdbfe" />
      <rect x="3.5" y="15" width="3.5" height="2" rx="0.3" fill="#bfdbfe" />
      <rect x="8" y="15" width="3.5" height="2" rx="0.3" fill="#dbeafe" />
    </svg>
  );
}

export function ConnectionTree({ width }: ConnectionTreeProps) {
  const {
    sessionTabs,
    activeSessionTabId,
    openedDatabases,
    connectionStates,
    connectionErrors,
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
    theme,
    language,
    setTreeFilter,
    openConnectionModal,
    cancelConnection,
    loadDatabases,
    loadSchemas,
    loadScopeObjects,
    openDatabase,
    closeDatabase,
    setNodeExpanded,
    toggleNodeExpanded,
    selectScope,
    selectObject,
    openTableDataTab,
    openTableDesignTab,
    openNewTableDesignTab,
    openQueryTab,
    openSavedQueryTab,
    deleteSavedQuery,
    dropTable,
    truncateTable,
  } = useWorkbenchStore();

  const [menuState, setMenuState] = useState<{
    x: number;
    y: number;
    items: ContextMenuItem[];
  } | null>(null);
  const [focusedNodeKey, setFocusedNodeKey] = useState<string | null>(null);

  const isMac = isMacOS();
  const isDark = theme === "dark";
  const filterLower = treeFilter.trim().toLowerCase();

  // Active Site Session
  const activeSession =
    sessionTabs.find((s) => s.id === activeSessionTabId) ?? sessionTabs[0] ?? null;
  const activeProfile =
    useWorkbenchStore.getState().getProfileById(activeSession?.profileId) ??
    useWorkbenchStore.getState().getProfileById(selectedScope?.profileId) ??
    null;

  const isSiteConnected =
    activeProfile != null &&
    (connectionStates[activeProfile.id] === "connected" ||
      connectionStates[activeProfile.id] === "demo");

  const handleDoubleClickDatabase = async (
    profile: ConnectionProfile,
    dbName: string
  ) => {
    const dbKey = makeDbKey(profile.id, dbName);
    const isOpened = !!openedDatabases[dbKey];
    const nodeKey = `db:${dbKey}`;

    if (!isOpened) {
      await openDatabase(profile.id, dbName);
      return;
    }

    toggleNodeExpanded(nodeKey);
  };

  const handleSingleClickDatabase = (profile: ConnectionProfile, dbName: string) => {
    const dbKey = makeDbKey(profile.id, dbName);
    setFocusedNodeKey(`db:${dbKey}`);
    const isOpened = !!openedDatabases[dbKey];
    if (isOpened) {
      void selectScope({
        profileId: profile.id,
        database: dbName,
        schema: profile.dbKind === "postgres" ? "public" : null,
        category: selectedScope?.category ?? "tables",
        objectName: null,
      });
    } else {
      useWorkbenchStore.setState({
        selectedScope: {
          profileId: profile.id,
          database: dbName,
          schema: null,
          category: "tables",
          objectName: null,
        },
      });
    }
  };

  const handleToggleSchema = async (
    profile: ConnectionProfile,
    dbName: string,
    schemaName: string
  ) => {
    const sKey = makeScopeKey(profile.id, dbName, schemaName);
    const nodeKey = `schema:${sKey}`;
    setFocusedNodeKey(nodeKey);
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

  const renderCategoryChildren = (
    profile: ConnectionProfile,
    database: string,
    schema: string | null,
    baseIndent: number
  ) => {
    const scopeKey = makeScopeKey(profile.id, database, schema);
    const tables = tablesByScope[scopeKey] ?? [];
    const views = viewsByScope[scopeKey] ?? [];
    const routines = routinesByScope[scopeKey] ?? [];
    const sequences = sequencesByScope[scopeKey] ?? [];

    const scopeSavedQueries = savedQueries.filter(
      (q) =>
        q.profileId === profile.id &&
        (!q.databaseName || q.databaseName === database) &&
        (!schema || !q.schemaName || q.schemaName === schema)
    );

    const categories: {
      id: ObjectCategory;
      label: string;
      count: number;
      icon: React.ReactNode;
      itemIcon: React.ReactNode;
      items: string[];
    }[] = [
      {
        id: "tables",
        label: t(language, "tables"),
        count: tables.length,
        icon: <NavicatTableIcon />,
        itemIcon: <NavicatTableIcon />,
        items: tables.map((t) => t.name),
      },
      {
        id: "views",
        label: t(language, "views"),
        count: views.length,
        icon: <NavicatViewIcon />,
        itemIcon: <NavicatViewIcon />,
        items: views.map((v) => v.name),
      },
      {
        id: "routines",
        label: t(language, "routines"),
        count: routines.length,
        icon: <NavicatFunctionIcon />,
        itemIcon: <NavicatFunctionIcon />,
        items: routines.map((r) => r.name),
      },
      {
        id: "events",
        label: t(language, "events"),
        count: 0,
        icon: <NavicatEventIcon />,
        itemIcon: <NavicatEventIcon />,
        items: [],
      },
      {
        id: "queries",
        label: t(language, "queries"),
        count: scopeSavedQueries.length,
        icon: <NavicatQueryIcon />,
        itemIcon: <NavicatQueryIcon />,
        items: scopeSavedQueries.map((q) => q.title),
      },
    ];

    if (profile.dbKind === "postgres" && sequences.length > 0) {
      categories.splice(4, 0, {
        id: "sequences",
        label: t(language, "sequences"),
        count: sequences.length,
        icon: <NavicatEventIcon />,
        itemIcon: <NavicatEventIcon />,
        items: sequences.map((s) => s.name),
      });
    }

    return categories.map((cat) => {
      const catNodeKey = `cat:${scopeKey}:${cat.id}`;
      const isCatExpanded = !!expandedNodes[catNodeKey];
      const isSelected =
        focusedNodeKey === catNodeKey && !selectedScope?.objectName;

      const filteredItems = filterLower
        ? cat.items.filter((name) => name.toLowerCase().includes(filterLower))
        : cat.items;

      return (
        <div key={catNodeKey}>
          <div
            onClick={() => {
              setFocusedNodeKey(catNodeKey);
              void selectScope({
                profileId: profile.id,
                database,
                schema,
                category: cat.id,
                objectName: null,
              });
            }}
            onDoubleClick={() => toggleNodeExpanded(catNodeKey)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (cat.id === "tables") {
                setMenuState({
                  x: e.clientX,
                  y: e.clientY,
                  items: [
                    {
                      id: "new-table",
                      label: language === "en" ? "New Table..." : "新增資料表...",
                      icon: <Plus className="h-3.5 w-3.5 text-[#2563eb]" />,
                      onClick: () => openNewTableDesignTab(profile.id, database, schema),
                    },
                    {
                      id: "refresh-tables",
                      label: t(language, "refresh"),
                      icon: <RefreshCw className="h-3.5 w-3.5" />,
                      onClick: () => void loadScopeObjects(profile.id, database, schema),
                    },
                  ],
                });
              } else if (cat.id === "queries") {
                setMenuState({
                  x: e.clientX,
                  y: e.clientY,
                  items: [
                    {
                      id: "new-q",
                      label: language === "en" ? "New Query..." : "新增查詢...",
                      icon: <Terminal className="h-3.5 w-3.5 text-[#10b981]" />,
                      onClick: () => openQueryTab(profile.id, database, schema),
                    },
                  ],
                });
              }
            }}
            className={`flex cursor-pointer items-center gap-2 px-1.5 py-1 text-[12px] ${
              isMac ? "rounded-lg" : "rounded"
            } ${
              isSelected
                ? isDark
                  ? "bg-[#2563eb]/35 text-white font-medium"
                  : isMac
                  ? "bg-[#007aff]/14 text-[#0055d4] font-medium"
                  : "bg-[#dbeafe] text-[#1e3a8a] font-medium"
                : isDark
                ? "text-[#e4e4e7] hover:bg-white/8"
                : isMac
                ? "hover:bg-black/5"
                : "hover:bg-[#eef2f7]"
            }`}
            style={{ paddingLeft: baseIndent }}
          >
            <span
              onClick={(e) => {
                e.stopPropagation();
                toggleNodeExpanded(catNodeKey);
              }}
              className="flex shrink-0 items-center"
            >
              {isCatExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-[#64748b]" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-[#64748b]" />
              )}
            </span>
            {cat.icon}
            <span className="truncate">{cat.label}</span>
            {cat.count > 0 && (
              <span className="ml-auto text-[10px] text-[#94a3b8]">{cat.count}</span>
            )}
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
                    void selectObject(profile.id, database, schema, cat.id, objName);

                    if (cat.id === "queries") {
                      const found = scopeSavedQueries.find((q) => q.title === objName);
                      if (found) {
                        setMenuState({
                          x: e.clientX,
                          y: e.clientY,
                          items: [
                            {
                              id: "open-sq",
                              label: language === "en" ? "Open Query" : "開啟查詢",
                              icon: <Terminal className="h-3.5 w-3.5 text-[#059669]" />,
                              onClick: () => openSavedQueryTab(found),
                            },
                            {
                              id: "del-sq",
                              label: language === "en" ? "Delete Query" : "刪除查詢",
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
                            label: t(language, "openTable"),
                            icon: <NavicatTableIcon />,
                            onClick: () =>
                              void openTableDataTab(profile.id, database, schema, objName),
                          },
                          {
                            id: "design-table",
                            label: t(language, "designTable"),
                            icon: <Edit3 className="h-3.5 w-3.5 text-[#d97706]" />,
                            onClick: () =>
                              void openTableDesignTab(profile.id, database, schema, objName),
                          },
                          {
                            id: "new-table",
                            label: t(language, "newTable"),
                            icon: <Plus className="h-3.5 w-3.5 text-[#2563eb]" />,
                            onClick: () =>
                              openNewTableDesignTab(profile.id, database, schema),
                          },
                          {
                            id: "query-table",
                            label: language === "en" ? "Generate SELECT Query" : "產生 SELECT 查詢",
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
                          { id: "div-t1", divider: true },
                          {
                            id: "copy-name",
                            label: language === "en" ? "Copy Table Name" : "複製資料表名稱",
                            icon: <Copy className="h-3.5 w-3.5" />,
                            onClick: () => void navigator.clipboard?.writeText(objName),
                          },
                          { id: "div-t2", divider: true },
                          {
                            id: "truncate-table",
                            label: language === "en" ? "Truncate Table" : "清空資料表 (Truncate)",
                            icon: <Trash2 className="h-3.5 w-3.5 text-[#d97706]" />,
                            danger: true,
                            onClick: () =>
                              void truncateTable(profile.id, database, schema, objName),
                          },
                          {
                            id: "drop-table",
                            label: language === "en" ? "Drop Table" : "刪除資料表 (Drop)",
                            icon: <Trash2 className="h-3.5 w-3.5" />,
                            danger: true,
                            onClick: () =>
                              void dropTable(profile.id, database, schema, objName),
                          },
                        ],
                      });
                    }
                  }}
                  className={`flex cursor-pointer items-center gap-2 px-1.5 py-1 text-[11px] ${
                    isMac ? "rounded-lg" : "rounded"
                  } ${
                    objSelected
                      ? isDark
                        ? "bg-[#2563eb]/35 text-white font-medium"
                        : isMac
                        ? "bg-[#007aff]/14 text-[#0055d4] font-medium"
                        : "bg-[#dbeafe] text-[#1e3a8a] font-medium"
                      : isDark
                      ? "text-[#d4d4d8] hover:bg-white/8"
                      : isMac
                      ? "hover:bg-black/5"
                      : "hover:bg-[#eef2f7]"
                  }`}
                  style={{ paddingLeft: baseIndent + 18 }}
                >
                  {cat.itemIcon}
                  <span className="truncate">{objName}</span>
                </div>
              );
            })}
        </div>
      );
    });
  };

  const dbs = activeProfile ? databasesByProfile[activeProfile.id] ?? [] : [];
  const filteredDbs = filterLower
    ? dbs.filter((db) => {
        if (db.name.toLowerCase().includes(filterLower)) return true;
        const sKey = makeScopeKey(
          activeProfile!.id,
          db.name,
          activeProfile!.dbKind === "postgres" ? "public" : null
        );
        return (tablesByScope[sKey] ?? []).some((t) =>
          t.name.toLowerCase().includes(filterLower)
        );
      })
    : dbs;

  return (
    <aside
      style={{ width }}
      className={`flex flex-shrink-0 flex-col border-r select-none ${
        isMac
          ? isDark
            ? "border-white/10 bg-[#202023]"
            : "border-black/10 bg-[#f2f2f7]"
          : isDark
          ? "border-[#333336] bg-[#1e1e22]"
          : "border-[#d4d8e0] bg-[#fbfcfd]"
      }`}
    >
      {/* Sidebar Header: Active Site Name & Quick Actions */}
      <div
        className={`flex items-center justify-between border-b px-2.5 text-[11px] font-semibold ${
          isMac
            ? isDark
              ? "h-9 border-white/10 text-[#e4e4e7]"
              : "h-9 border-black/10 text-[#3a3a3c]"
            : isDark
            ? "h-[28px] border-[#333336] text-[#e4e4e7]"
            : "h-[28px] border-[#e5e7eb] text-[#374151]"
        }`}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          {activeProfile && isSiteConnected ? (
            <DbEngineIcon kind={activeProfile.dbKind} size={18} connected />
          ) : (
            <Server className="h-3.5 w-3.5 shrink-0 text-[#38bdf8]" />
          )}
          <span className="truncate">
            {activeProfile && isSiteConnected
              ? activeProfile.name
              : activeProfile
              ? activeProfile.name
              : t(language, "dbExplorer")}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {activeProfile && isSiteConnected && (
            <button
              type="button"
              onClick={() => void loadDatabases(activeProfile.id)}
              title={t(language, "refresh")}
              className="rounded p-1 opacity-75 hover:bg-black/10 hover:opacity-100"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Tree Body: Databases -> (Double-Click to Open) -> Tables / Views / Functions / Events / Queries */}
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
        {activeProfile && connectionStates[activeProfile.id] === "connecting" ? (
          <div className="flex h-full flex-col items-center justify-center p-4 text-center">
            <Loader2 className="h-7 w-7 animate-spin text-[#2563eb]" />
            <p
              className={`mt-3 text-xs font-semibold ${
                isDark ? "text-[#f4f4f5]" : "text-[#0f172a]"
              }`}
            >
              {t(language, "connectingTo")} {activeProfile.name}...
            </p>
            <p className="mt-1 text-[11px] text-[#64748b]">
              {t(language, "connectingHint")}
            </p>
            <button
              type="button"
              onClick={() => cancelConnection(activeProfile.id)}
              className={`mt-3.5 inline-flex items-center gap-1.5 border px-3 py-1.5 text-[11px] font-medium transition-colors ${
                isMac ? "rounded-lg" : "rounded"
              } ${
                isDark
                  ? "border-[#3f3f46] bg-[#27272a] text-[#f4f4f5] hover:bg-[#3f3f46]"
                  : "border-[#cbd5e1] bg-white text-[#1f2329] hover:bg-[#f1f5f9]"
              }`}
            >
              <X className="h-3.5 w-3.5 text-[#ef4444]" />
              <span>{t(language, "cancelConnection")}</span>
            </button>
          </div>
        ) : activeProfile && connectionStates[activeProfile.id] === "error" ? (
          <div className="flex h-full flex-col items-center justify-center p-4 text-center">
            <XCircle className="h-7 w-7 text-[#ef4444]" />
            <p className="mt-2.5 text-xs font-semibold text-[#ef4444]">
              {t(language, "connectionFailed")}
            </p>
            {connectionErrors[activeProfile.id] && (
              <p className="mt-1.5 max-h-28 overflow-y-auto break-all rounded border border-[#fecaca]/40 bg-[#ef4444]/10 p-2 text-[10px] font-mono text-[#fca5a5]">
                {connectionErrors[activeProfile.id]}
              </p>
            )}
            <button
              type="button"
              onClick={() => openConnectionModal(activeProfile)}
              className="mt-3 rounded-lg bg-[#2563eb] px-3 py-1.5 text-[11px] font-medium text-white hover:bg-[#1d4ed8]"
            >
              {t(language, "openSiteManager")}
            </button>
          </div>
        ) : !activeProfile || !isSiteConnected ? (
          <div className="flex h-full flex-col items-center justify-center p-4 text-center">
            <NavicatDbCylinderIcon opened={false} />
            <p className="mt-2 text-[11px] text-[#64748b]">
              {t(language, "notConnectedToSite")}
            </p>
            <button
              type="button"
              onClick={() => openConnectionModal(null)}
              className="mt-2.5 rounded-lg bg-[#2563eb] px-3 py-1.5 text-[11px] font-medium text-white hover:bg-[#1d4ed8]"
            >
              {t(language, "openSiteManager")}
            </button>
          </div>
        ) : (
          filteredDbs.map((db) => {
            const dbKey = makeDbKey(activeProfile.id, db.name);
            const dbNodeKey = `db:${dbKey}`;
            const isDbOpened = !!openedDatabases[dbKey];
            const isDbExpanded = isDbOpened && (!!expandedNodes[dbNodeKey] || Boolean(filterLower));
            const dbLoading = !!loadingNodes[dbNodeKey] || !!loadingNodes[`scope:${makeScopeKey(activeProfile.id, db.name, null)}`];
            const schemas = schemasByDb[dbKey] ?? [];
            const isDbSelected =
              focusedNodeKey === dbNodeKey && !selectedScope?.objectName;

            return (
              <div key={dbNodeKey} className="mb-0.5">
                <div
                  onClick={() => handleSingleClickDatabase(activeProfile, db.name)}
                  onDoubleClick={() =>
                    void handleDoubleClickDatabase(activeProfile, db.name)
                  }
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSingleClickDatabase(activeProfile, db.name);
                    setMenuState({
                      x: e.clientX,
                      y: e.clientY,
                      items: [
                        isDbOpened
                          ? {
                              id: "close-db",
                              label: language === "en" ? "Close Database" : "關閉資料庫 (Close Database)",
                              icon: <PowerOff className="h-3.5 w-3.5 text-[#dc2626]" />,
                              onClick: () => closeDatabase(activeProfile.id, db.name),
                            }
                          : {
                              id: "open-db",
                              label: language === "en" ? "Open Database" : "開啟資料庫 (Open Database)",
                              icon: <FolderOpen className="h-3.5 w-3.5 text-[#10b981]" />,
                              onClick: () =>
                                void openDatabase(activeProfile.id, db.name),
                            },
                        { id: "div-db1", divider: true },
                        {
                          id: "db-query",
                          label: language === "en" ? "New Query" : "新增查詢 (New Query)",
                          icon: <Terminal className="h-3.5 w-3.5 text-[#10b981]" />,
                          disabled: !isDbOpened,
                          onClick: () =>
                            openQueryTab(activeProfile.id, db.name, null),
                        },
                        {
                          id: "db-refresh",
                          label: language === "en" ? "Refresh" : "重新整理 (Refresh)",
                          icon: <RefreshCw className="h-3.5 w-3.5" />,
                          disabled: !isDbOpened,
                          onClick: () => {
                            if (activeProfile.dbKind === "postgres") {
                              void loadSchemas(activeProfile.id, db.name);
                            } else {
                              void loadScopeObjects(activeProfile.id, db.name, null);
                            }
                          },
                        },
                      ],
                    });
                  }}
                  className={`flex cursor-pointer items-center gap-2 px-1.5 py-1.5 text-[12px] ${
                    isMac ? "rounded-lg" : "rounded"
                  } ${
                    isDbSelected
                      ? isDark
                        ? "bg-[#2563eb]/35 text-white font-medium"
                        : isMac
                        ? "bg-[#007aff]/14 text-[#0055d4] font-medium"
                        : "bg-[#dbeafe] text-[#1e3a8a] font-medium"
                      : isDark
                      ? "text-[#f4f4f5] hover:bg-white/8"
                      : isMac
                      ? "hover:bg-black/5"
                      : "hover:bg-[#eef2f7]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDoubleClickDatabase(activeProfile, db.name);
                    }}
                    className="p-0.5 text-[#64748b] hover:text-[#111827]"
                  >
                    {dbLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#2563eb]" />
                    ) : isDbExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </button>

                  <NavicatDbCylinderIcon opened={isDbOpened} />

                  <span
                    className={`truncate ${
                      isDbOpened ? "font-semibold" : "opacity-80"
                    }`}
                  >
                    {db.name}
                  </span>
                </div>

                {/* Expanded Database Children (Navicat Tree) */}
                {isDbExpanded &&
                  (activeProfile.dbKind === "postgres"
                    ? schemas.map((sc) => {
                        const sKey = makeScopeKey(activeProfile.id, db.name, sc.name);
                        const scNodeKey = `schema:${sKey}`;
                        const scExpanded = !!expandedNodes[scNodeKey] || Boolean(filterLower);
                        const scSelected =
                          focusedNodeKey === scNodeKey && !selectedScope?.objectName;

                        return (
                          <div key={scNodeKey}>
                            <div
                              onClick={() =>
                                void handleToggleSchema(activeProfile, db.name, sc.name)
                              }
                              className={`flex cursor-pointer items-center gap-1.5 px-1.5 py-1 text-[11px] ${
                                isMac ? "rounded-lg" : "rounded"
                              } ${
                                scSelected
                                  ? isDark
                                    ? "bg-[#2563eb]/35 text-white font-medium"
                                    : "bg-[#dbeafe] text-[#1e3a8a] font-medium"
                                  : isDark
                                  ? "text-[#d4d4d8] hover:bg-white/8"
                                  : "hover:bg-[#eef2f7]"
                              }`}
                              style={{ paddingLeft: 24 }}
                            >
                              {scExpanded ? (
                                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#64748b]" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#64748b]" />
                              )}
                              <Layers className="h-3.5 w-3.5 shrink-0 text-[#6366f1]" />
                              <span className="truncate">{sc.name}</span>
                            </div>

                            {scExpanded &&
                              renderCategoryChildren(
                                activeProfile,
                                db.name,
                                sc.name,
                                40
                              )}
                          </div>
                        );
                      })
                    : renderCategoryChildren(activeProfile, db.name, null, 24))}
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Search Filter */}
      <div
        className={`flex items-center gap-1.5 border-t px-2 ${
          isMac
            ? isDark
              ? "h-[36px] border-white/10 bg-[#242426]"
              : "h-[36px] border-black/10 bg-[#ececed]"
            : isDark
            ? "h-[30px] border-[#333336] bg-[#202022]"
            : "h-[30px] border-[#d4d8e0] bg-[#f8f9fb]"
        }`}
      >
        <div
          className={`flex flex-1 items-center gap-1.5 border bg-white px-2 ${
            isMac
              ? "h-[24px] rounded-full border-black/10 shadow-2xs"
              : "h-[21px] rounded border-[#cbd5e1]"
          }`}
        >
          <Search className="h-3.5 w-3.5 text-[#9ca3af] flex-shrink-0" />
          <input
            type="text"
            value={treeFilter}
            onChange={(e) => setTreeFilter(e.target.value)}
            placeholder={t(language, "filterDbOrTable")}
            className="w-full bg-transparent text-[11px] outline-none"
          />
          {treeFilter && (
            <button
              type="button"
              onClick={() => setTreeFilter("")}
              className="opacity-65 hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          )}
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
