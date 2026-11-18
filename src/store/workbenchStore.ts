import { create } from "zustand";
import { type AppLanguage } from "../lib/i18n";
import {
  getDemoDatabases,
  getDemoRoutines,
  getDemoSchemas,
  getDemoSequences,
  getDemoTableMeta,
  getDemoTables,
  getDemoViews,
  updateDemoTableRows,
  upsertDemoTable,
} from "../lib/demo-data";
import {
  buildSelectPageSql,
  formatQualifiedTable,
  quoteIdentifier,
  type FilterRule,
  type SortRule,
} from "../lib/sql-builder";
import { buildExplainSql } from "../lib/sql-formatter";
import { tauriApi } from "../lib/tauri-api";
import { exportSitesToYaml, parseSitesFromYaml } from "../lib/yaml-sites";
import type {
  BatchQueryResponse,
  CellValue,
  ColumnInfo,
  ConnectionProfile,
  DatabaseInfo,
  ForeignKeyInfo,
  IndexInfo,
  QueryResultSet,
  RoutineInfo,
  SavedQuery,
  SchemaInfo,
  SequenceInfo,
  TableInfo,
  ViewInfo,
} from "../types/database";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "demo" | "error";

export type ThemeMode = "light" | "dark";

export type ObjectCategory = "tables" | "views" | "routines" | "events" | "sequences" | "queries";

export interface SelectedScope {
  profileId: string;
  database?: string | null;
  schema?: string | null;
  category: ObjectCategory;
  objectName?: string | null;
}

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  level: "info" | "success" | "warn" | "error";
  profileName?: string;
  message: string;
  latencyMs?: number;
}

export type WorkspaceTab =
  | { id: "objects"; kind: "objects"; title: string; closable: false }
  | {
      id: string;
      kind: "table-data";
      title: string;
      closable: true;
      profileId: string;
      database: string;
      schema?: string | null;
      tableName: string;
      tableColumns: ColumnInfo[];
      page: number;
      pageSize: number;
      filters: FilterRule[];
      sorts: SortRule[];
      result?: QueryResultSet | null;
      loading?: boolean;
      error?: string | null;
    }
  | {
      id: string;
      kind: "table-design";
      title: string;
      closable: true;
      profileId: string;
      database: string;
      schema?: string | null;
      tableName: string;
      isNew?: boolean;
      columns: ColumnInfo[];
      indexes: IndexInfo[];
      foreignKeys: ForeignKeyInfo[];
      ddl: string;
      loading?: boolean;
    }
  | {
      id: string;
      kind: "query";
      title: string;
      closable: true;
      profileId: string;
      database?: string | null;
      schema?: string | null;
      sql: string;
      running?: boolean;
      response?: BatchQueryResponse | null;
      explainResponse?: BatchQueryResponse | null;
      savedQueryId?: string | null;
      error?: string | null;
    };

export function makeScopeKey(
  profileId: string,
  database: string,
  schema?: string | null
): string {
  return `${profileId}::${database}::${schema || ""}`;
}

export function makeDbKey(profileId: string, database: string): string {
  return `${profileId}::${database}`;
}

export interface SiteSessionTab {
  id: string;
  profileId: string;
  title: string;
  selectedScope: SelectedScope | null;
  tabs: WorkspaceTab[];
  activeTabId: string;
}

interface WorkbenchState {
  profiles: ConnectionProfile[];
  transientProfiles: Record<string, ConnectionProfile>;
  folders: string[];
  showSiteManagerOnStartup: boolean;
  sessionTabs: SiteSessionTab[];
  activeSessionTabId: string | null;
  openedDatabases: Record<string, boolean>;

  connectionStates: Record<string, ConnectionStatus>;
  connectionErrors: Record<string, string>;
  serverVersions: Record<string, string>;

  databasesByProfile: Record<string, DatabaseInfo[]>;
  schemasByDb: Record<string, SchemaInfo[]>;
  tablesByScope: Record<string, TableInfo[]>;
  viewsByScope: Record<string, ViewInfo[]>;
  routinesByScope: Record<string, RoutineInfo[]>;
  sequencesByScope: Record<string, SequenceInfo[]>;
  loadingNodes: Record<string, boolean>;

  expandedNodes: Record<string, boolean>;
  selectedScope: SelectedScope | null;

  treeFilter: string;
  objectFilter: string;
  objectViewMode: "list" | "grid";

  tabs: WorkspaceTab[];
  activeTabId: string;
  savedQueries: SavedQuery[];

  rightPaneOpen: boolean;
  rightPaneTab: "info" | "ddl" | "columns" | "log";
  inspectorLoading: boolean;
  inspectorDdl: string;
  inspectorColumns: ColumnInfo[];
  inspectorIndexes: IndexInfo[];
  inspectorForeignKeys: ForeignKeyInfo[];
  activityLogs: ActivityLogEntry[];

  connectionModalOpen: boolean;
  editingProfile: ConnectionProfile | null;

  theme: ThemeMode;
  language: AppLanguage;
  editorFontSize: number;
  settingsModalOpen: boolean;

  statusMessage: string;
  lastLatencyMs: number | null;

  // Actions
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setLanguage: (language: AppLanguage) => void;
  setEditorFontSize: (size: number) => void;
  setSettingsModalOpen: (open: boolean) => void;
  setShowSiteManagerOnStartup: (show: boolean) => void;
  createFolder: (folderName: string) => void;
  deleteFolder: (folderName: string) => Promise<void>;
  moveProfileToFolder: (profileId: string, folderName: string | null) => Promise<void>;
  importSitesFromYaml: (yamlText: string) => Promise<number>;
  exportSitesToYamlText: () => string;

  setActiveSessionTab: (sessionId: string) => void;
  closeSessionTab: (sessionId: string) => Promise<void>;
  openDatabase: (profileId: string, dbName: string) => Promise<void>;
  closeDatabase: (profileId: string, dbName: string) => void;

  appendLog: (entry: Omit<ActivityLogEntry, "id" | "timestamp">) => void;
  loadProfiles: () => Promise<void>;
  openConnectionModal: (profile?: ConnectionProfile | null) => void;
  closeConnectionModal: () => void;
  saveProfile: (profile: ConnectionProfile) => Promise<ConnectionProfile>;
  deleteProfile: (profileId: string) => Promise<void>;
  duplicateProfile: (profile: ConnectionProfile) => Promise<void>;

  connectProfile: (
    profileId: string,
    useDemo?: boolean,
    profileOverride?: ConnectionProfile
  ) => Promise<boolean>;
  getProfileById: (profileId: string | null | undefined) => ConnectionProfile | null;
  cancelConnection: (profileId: string) => void;
  disconnectProfile: (profileId: string) => Promise<void>;

  loadDatabases: (profileId: string) => Promise<void>;
  loadSchemas: (profileId: string, database: string) => Promise<void>;
  loadScopeObjects: (profileId: string, database: string, schema?: string | null) => Promise<void>;

  setNodeExpanded: (nodeKey: string, expanded: boolean) => void;
  toggleNodeExpanded: (nodeKey: string) => void;
  selectScope: (scope: SelectedScope) => Promise<void>;
  selectObject: (
    profileId: string,
    database: string,
    schema: string | null | undefined,
    category: ObjectCategory,
    objectName: string
  ) => Promise<void>;

  setTreeFilter: (value: string) => void;
  setObjectFilter: (value: string) => void;
  setObjectViewMode: (mode: "list" | "grid") => void;
  setRightPaneOpen: (open: boolean) => void;
  setRightPaneTab: (tab: "info" | "ddl" | "columns" | "log") => void;

  setActiveTab: (tabId: string) => void;
  closeTab: (tabId: string) => void;
  openTableDataTab: (
    profileId: string,
    database: string,
    schema: string | null | undefined,
    tableName: string
  ) => Promise<void>;
  refreshTableDataTab: (
    tabId: string,
    opts?: {
      page?: number;
      pageSize?: number;
      filters?: FilterRule[];
      sorts?: SortRule[];
    }
  ) => Promise<void>;
  applyGridChangeSet: (
    tabId: string,
    statements: string[],
    nextDemoRows?: CellValue[][]
  ) => Promise<void>;
  openTableDesignTab: (
    profileId: string,
    database: string,
    schema: string | null | undefined,
    tableName: string
  ) => Promise<void>;
  openNewTableDesignTab: (
    profileId: string,
    database: string,
    schema?: string | null
  ) => void;
  applyTableDesignSql: (
    tabId: string,
    sql: string,
    targetTableName: string,
    isNew: boolean,
    demoTableMeta?: {
      columns: ColumnInfo[];
      indexes: IndexInfo[];
      foreignKeys: ForeignKeyInfo[];
      ddl: string;
    }
  ) => Promise<void>;
  openQueryTab: (
    profileId?: string | null,
    database?: string | null,
    schema?: string | null,
    initialSql?: string,
    title?: string,
    savedQueryId?: string | null
  ) => void;
  openSavedQueryTab: (query: SavedQuery) => void;
  updateQueryTabSql: (tabId: string, sql: string) => void;
  updateQueryTabContext: (
    tabId: string,
    patch: { profileId?: string; database?: string | null; schema?: string | null }
  ) => void;
  runQueryInTab: (tabId: string, sqlOverride?: string) => Promise<void>;
  explainQueryInTab: (tabId: string, sqlOverride?: string) => Promise<void>;
  cancelQueryInTab: (tabId: string) => Promise<void>;
  loadSavedQueries: () => Promise<void>;
  saveQueryTab: (tabId: string, title: string) => Promise<SavedQuery | null>;
  deleteSavedQuery: (queryId: string) => Promise<void>;

  dropTable: (
    profileId: string,
    database: string,
    schema: string | null | undefined,
    tableName: string
  ) => Promise<void>;
  truncateTable: (
    profileId: string,
    database: string,
    schema: string | null | undefined,
    tableName: string
  ) => Promise<void>;
  renameTable: (
    profileId: string,
    database: string,
    schema: string | null | undefined,
    oldName: string,
    newName: string
  ) => Promise<void>;
  getTableDdl: (
    profileId: string,
    database: string,
    schema: string | null | undefined,
    objectType: string,
    objectName: string
  ) => Promise<string>;
}

let queryCounter = 1;

function readInitialTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem("sqlcraft.theme");
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    // ignore storage errors
  }
  return "light";
}

function readInitialLanguage(): AppLanguage {
  try {
    const saved = localStorage.getItem("sqlcraft.language");
    if (saved === "en" || saved === "zh-TW") return saved;
  } catch {
    // ignore storage errors
  }
  return "zh-TW";
}

const connectionAttemptSeq: Record<string, number> = {};

function readInitialFontSize(): number {
  try {
    const saved = Number(localStorage.getItem("sqlcraft.editorFontSize"));
    if (saved >= 11 && saved <= 20) return saved;
  } catch {
    // ignore storage errors
  }
  return 13;
}

function readInitialFolders(): string[] {
  try {
    const raw = localStorage.getItem("sqlcraft.folders");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
      }
    }
  } catch {
    // ignore
  }
  return ["Local"];
}

function writeFolders(folders: string[]): void {
  try {
    localStorage.setItem("sqlcraft.folders", JSON.stringify(folders));
  } catch {
    // ignore
  }
}

function readShowSiteManagerOnStartup(): boolean {
  try {
    const raw = localStorage.getItem("sqlcraft.showSiteManagerOnStartup");
    if (raw === "false") return false;
    if (raw === "true") return true;
  } catch {
    // ignore
  }
  return true;
}

let hasOpenedStartupModal = false;

export const useWorkbenchStore = create<WorkbenchState>((set, get) => ({
  profiles: [],
  transientProfiles: {},
  folders: readInitialFolders(),
  showSiteManagerOnStartup: readShowSiteManagerOnStartup(),
  sessionTabs: [],
  activeSessionTabId: null,
  openedDatabases: {},

  connectionStates: {},
  connectionErrors: {},
  serverVersions: {},

  databasesByProfile: {},
  schemasByDb: {},
  tablesByScope: {},
  viewsByScope: {},
  routinesByScope: {},
  sequencesByScope: {},
  loadingNodes: {},

  expandedNodes: {},
  selectedScope: null,

  treeFilter: "",
  objectFilter: "",
  objectViewMode: "list",

  tabs: [{ id: "objects", kind: "objects", title: "物件", closable: false }],
  activeTabId: "objects",
  savedQueries: [],

  rightPaneOpen: true,
  rightPaneTab: "info",
  inspectorLoading: false,
  inspectorDdl: "",
  inspectorColumns: [],
  inspectorIndexes: [],
  inspectorForeignKeys: [],
  activityLogs: [],

  connectionModalOpen: false,
  editingProfile: null,

  theme: readInitialTheme(),
  language: readInitialLanguage(),
  editorFontSize: readInitialFontSize(),
  settingsModalOpen: false,

  statusMessage: "就緒 — 請在左側雙擊連線，或右鍵使用範例結構模式探索",
  lastLatencyMs: null,

  setTheme: (theme) => {
    try {
      localStorage.setItem("sqlcraft.theme", theme);
    } catch {
      // ignore
    }
    set({ theme });
    const s = get();
    void tauriApi.saveAppConfig({
      theme,
      language: s.language,
      editorFontSize: s.editorFontSize,
      folders: s.folders,
      showSiteManagerOnStartup: s.showSiteManagerOnStartup,
    }).catch(() => {});
  },

  toggleTheme: () => {
    const next: ThemeMode = get().theme === "dark" ? "light" : "dark";
    get().setTheme(next);
  },

  setLanguage: (language) => {
    try {
      localStorage.setItem("sqlcraft.language", language);
    } catch {
      // ignore storage errors
    }
    set({ language });
    const s = get();
    void tauriApi.saveAppConfig({
      theme: s.theme,
      language,
      editorFontSize: s.editorFontSize,
      folders: s.folders,
      showSiteManagerOnStartup: s.showSiteManagerOnStartup,
    }).catch(() => {});
  },

  setEditorFontSize: (size) => {
    const clamped = Math.max(11, Math.min(20, size));
    try {
      localStorage.setItem("sqlcraft.editorFontSize", String(clamped));
    } catch {
      // ignore
    }
    set({ editorFontSize: clamped });
    const s = get();
    void tauriApi.saveAppConfig({
      theme: s.theme,
      language: s.language,
      editorFontSize: clamped,
      folders: s.folders,
      showSiteManagerOnStartup: s.showSiteManagerOnStartup,
    }).catch(() => {});
  },

  setSettingsModalOpen: (open) => set({ settingsModalOpen: open }),

  setShowSiteManagerOnStartup: (show) => {
    try {
      localStorage.setItem("sqlcraft.showSiteManagerOnStartup", String(show));
    } catch {
      // ignore
    }
    set({ showSiteManagerOnStartup: show });
    const s = get();
    void tauriApi.saveAppConfig({
      theme: s.theme,
      language: s.language,
      editorFontSize: s.editorFontSize,
      folders: s.folders,
      showSiteManagerOnStartup: show,
    }).catch(() => {});
  },

  createFolder: (folderName) => {
    const trimmed = folderName.trim().replace(/^\/+|\/+$/g, "");
    if (!trimmed) return;
    set((state) => {
      if (state.folders.includes(trimmed)) return state;
      const next = [...state.folders, trimmed].sort((a, b) => a.localeCompare(b));
      writeFolders(next);
      void tauriApi.saveAppConfig({
        theme: state.theme,
        language: state.language,
        editorFontSize: state.editorFontSize,
        folders: next,
        showSiteManagerOnStartup: state.showSiteManagerOnStartup,
      }).catch(() => {});
      return { folders: next };
    });
  },

  deleteFolder: async (folderName) => {
    const trimmed = folderName.trim();
    const affected = get().profiles.filter((p) => (p.groupName ?? "") === trimmed);
    for (const p of affected) {
      await tauriApi.saveProfile({ ...p, groupName: null });
    }
    set((state) => {
      const next = state.folders.filter((f) => f !== trimmed);
      writeFolders(next);
      void tauriApi.saveAppConfig({
        theme: state.theme,
        language: state.language,
        editorFontSize: state.editorFontSize,
        folders: next,
        showSiteManagerOnStartup: state.showSiteManagerOnStartup,
      }).catch(() => {});
      return { folders: next };
    });
    await get().loadProfiles();
  },

  moveProfileToFolder: async (profileId, folderName) => {
    const found = get().getProfileById(profileId);
    if (!found) return;
    const normalized = folderName?.trim().replace(/^\/+|\/+$/g, "") || null;
    if (normalized) {
      get().createFolder(normalized);
    }
    await get().saveProfile({ ...found, groupName: normalized });
  },

  importSitesFromYaml: async (yamlText) => {
    const bundle = parseSitesFromYaml(yamlText);
    for (const f of bundle.folders) {
      get().createFolder(f);
    }
    for (const site of bundle.sites) {
      await tauriApi.saveProfile(site);
    }
    await get().loadProfiles();
    get().appendLog({
      level: "info",
      message: `已從 YAML 匯入 ${bundle.sites.length} 個站台設定`,
    });
    return bundle.sites.length;
  },

  exportSitesToYamlText: () => {
    return exportSitesToYaml(get().profiles, get().folders);
  },

  setActiveSessionTab: (sessionId) => {
    set((state) => {
      const target = state.sessionTabs.find((s) => s.id === sessionId);
      if (!target || state.activeSessionTabId === sessionId) return state;

      const updatedSessions = state.sessionTabs.map((s) =>
        s.id === state.activeSessionTabId
          ? {
              ...s,
              selectedScope: state.selectedScope,
              tabs: state.tabs,
              activeTabId: state.activeTabId,
            }
          : s
      );

      return {
        sessionTabs: updatedSessions,
        activeSessionTabId: sessionId,
        selectedScope: target.selectedScope,
        tabs: target.tabs,
        activeTabId: target.activeTabId,
      };
    });
  },

  closeSessionTab: async (sessionId) => {
    const state = get();
    const closing = state.sessionTabs.find((s) => s.id === sessionId);
    if (!closing) return;

    const remaining = state.sessionTabs.filter((s) => s.id !== sessionId);
    const stillUsed = remaining.some((s) => s.profileId === closing.profileId);

    if (!stillUsed) {
      const status = state.connectionStates[closing.profileId];
      if (status === "connected") {
        await tauriApi.disconnectProfile(closing.profileId);
      }
      set((s) => ({
        connectionStates: { ...s.connectionStates, [closing.profileId]: "disconnected" },
      }));
    }

    if (remaining.length === 0) {
      const defaultObjTab: WorkspaceTab = {
        id: "objects",
        kind: "objects",
        title: "物件",
        closable: false,
      };
      set({
        sessionTabs: [],
        activeSessionTabId: null,
        selectedScope: null,
        tabs: [defaultObjTab],
        activeTabId: "objects",
        statusMessage: "已關閉站台分頁 — 請開啟站台管理連線至資料庫",
      });
      return;
    }

    if (state.activeSessionTabId === sessionId) {
      const nextSession = remaining[remaining.length - 1];
      set({
        sessionTabs: remaining,
        activeSessionTabId: nextSession.id,
        selectedScope: nextSession.selectedScope,
        tabs: nextSession.tabs,
        activeTabId: nextSession.activeTabId,
      });
    } else {
      set({ sessionTabs: remaining });
    }
  },

  openDatabase: async (profileId, dbName) => {
    const profile = get().getProfileById(profileId);
    if (!profile) return;
    const dbKey = makeDbKey(profileId, dbName);
    const nodeKey = `db:${dbKey}`;

    set((s) => ({
      openedDatabases: { ...s.openedDatabases, [dbKey]: true },
      expandedNodes: {
        ...s.expandedNodes,
        [nodeKey]: true,
      },
      statusMessage: `已開啟資料庫：${dbName}`,
    }));

    if (profile.dbKind === "postgres") {
      await get().loadSchemas(profileId, dbName);
      const schemas = get().schemasByDb[dbKey] ?? [];
      const targetSchema =
        schemas.find((s) => s.name === "public")?.name ?? schemas[0]?.name ?? "public";
      const sKey = makeScopeKey(profileId, dbName, targetSchema);
      set((s) => ({
        expandedNodes: { ...s.expandedNodes, [`schema:${sKey}`]: true },
      }));
      await get().loadScopeObjects(profileId, dbName, targetSchema);
      await get().selectScope({
        profileId,
        database: dbName,
        schema: targetSchema,
        category: "tables",
        objectName: null,
      });
    } else {
      await get().loadScopeObjects(profileId, dbName, null);
      await get().selectScope({
        profileId,
        database: dbName,
        schema: null,
        category: "tables",
        objectName: null,
      });
    }
  },

  closeDatabase: (profileId, dbName) => {
    const dbKey = makeDbKey(profileId, dbName);
    const nodeKey = `db:${dbKey}`;
    set((s) => ({
      openedDatabases: { ...s.openedDatabases, [dbKey]: false },
      expandedNodes: { ...s.expandedNodes, [nodeKey]: false },
      selectedScope:
        s.selectedScope?.profileId === profileId && s.selectedScope?.database === dbName
          ? { profileId, database: null, schema: null, category: "tables" }
          : s.selectedScope,
      statusMessage: `已關閉資料庫：${dbName}`,
    }));
  },

  appendLog: (entry) => {
    const now = new Date();
    const time = now.toTimeString().slice(0, 8);
    set((state) => ({
      activityLogs: [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestamp: time,
          ...entry,
        },
        ...state.activityLogs.slice(0, 99),
      ],
    }));
  },

  loadProfiles: async () => {
    const [items, savedQueries, appConfig] = await Promise.all([
      tauriApi.listProfiles(),
      tauriApi.listSavedQueries(null),
      tauriApi.getAppConfig().catch(() => null),
    ]);
    set((state) => {
      const nextTheme: ThemeMode = appConfig?.theme === "dark" ? "dark" : appConfig?.theme === "light" ? "light" : state.theme;
      const nextLanguage: AppLanguage = appConfig?.language === "en" ? "en" : appConfig?.language === "zh-TW" ? "zh-TW" : state.language;
      const nextFontSize =
        appConfig?.editorFontSize && appConfig.editorFontSize >= 11 && appConfig.editorFontSize <= 20
          ? appConfig.editorFontSize
          : state.editorFontSize;
      const nextShowStartup =
        appConfig != null ? appConfig.showSiteManagerOnStartup : state.showSiteManagerOnStartup;

      const nextStates = { ...state.connectionStates };
      const folderSet = new Set<string>(appConfig?.folders?.length ? appConfig.folders : state.folders);
      for (const p of items) {
        if (!nextStates[p.id]) nextStates[p.id] = "disconnected";
        const g = p.groupName?.trim();
        if (g) folderSet.add(g);
      }
      const mergedFolders = [...folderSet].sort((a, b) => a.localeCompare(b));
      writeFolders(mergedFolders);

      const shouldAutoOpen =
        !hasOpenedStartupModal &&
        nextShowStartup &&
        state.sessionTabs.length === 0;
      if (!hasOpenedStartupModal) {
        hasOpenedStartupModal = true;
      }

      return {
        profiles: items,
        folders: mergedFolders,
        theme: nextTheme,
        language: nextLanguage,
        editorFontSize: nextFontSize,
        showSiteManagerOnStartup: nextShowStartup,
        savedQueries,
        connectionStates: nextStates,
        connectionModalOpen: shouldAutoOpen ? true : state.connectionModalOpen,
      };
    });
  },

  openConnectionModal: (profile = null) => {
    set({ connectionModalOpen: true, editingProfile: profile });
  },

  closeConnectionModal: () => {
    set({ connectionModalOpen: false, editingProfile: null });
  },

  saveProfile: async (profile) => {
    const saved = await tauriApi.saveProfile(profile);
    await get().loadProfiles();
    get().appendLog({
      level: "info",
      profileName: saved.name,
      message: `已儲存連線設定：${saved.name} (${saved.host}:${saved.port})`,
    });
    return saved;
  },

  deleteProfile: async (profileId) => {
    const target = get().getProfileById(profileId);
    await tauriApi.deleteProfile(profileId);
    set((state) => {
      const nextSelected =
        state.selectedScope?.profileId === profileId ? null : state.selectedScope;
      return {
        profiles: state.profiles.filter((p) => p.id !== profileId),
        selectedScope: nextSelected,
      };
    });
    if (target) {
      get().appendLog({
        level: "warn",
        profileName: target.name,
        message: `已刪除連線：${target.name}`,
      });
    }
  },

  duplicateProfile: async (profile) => {
    const now = new Date().toISOString();
    const copy: ConnectionProfile = {
      ...profile,
      id: `conn-${Date.now()}`,
      name: `${profile.name} (複本)`,
      createdAt: now,
      updatedAt: now,
    };
    await get().saveProfile(copy);
  },

  getProfileById: (profileId) => {
    if (!profileId) return null;
    const state = get();
    return (
      state.profiles.find((p) => p.id === profileId) ??
      state.transientProfiles[profileId] ??
      null
    );
  },

  connectProfile: async (profileId, useDemo = false, profileOverride) => {
    const stateNow = get();
    const profile =
      profileOverride ??
      stateNow.profiles.find((p) => p.id === profileId) ??
      stateNow.transientProfiles[profileId];
    if (!profile) return false;

    if (profileOverride) {
      set((state) => ({
        transientProfiles: {
          ...state.transientProfiles,
          [profileOverride.id]: profileOverride,
        },
      }));
    }

    const activateOrCreateSessionForProfile = () => {
      set((state) => {
        const snapshotSessions = state.sessionTabs.map((s) =>
          s.id === state.activeSessionTabId
            ? {
                ...s,
                selectedScope: state.selectedScope,
                tabs: state.tabs,
                activeTabId: state.activeTabId,
              }
            : s
        );

        const existing = snapshotSessions.find((s) => s.profileId === profileId);
        if (existing) {
          return {
            sessionTabs: snapshotSessions,
            activeSessionTabId: existing.id,
            selectedScope: existing.selectedScope ?? {
              profileId,
              database: null,
              schema: null,
              category: "tables",
            },
            tabs: existing.tabs,
            activeTabId: existing.activeTabId,
            connectionModalOpen: false,
          };
        }

        const defaultObjTab: WorkspaceTab = {
          id: "objects",
          kind: "objects",
          title: "物件",
          closable: false,
        };
        const initialScope: SelectedScope = {
          profileId,
          database: null,
          schema: null,
          category: "tables",
        };
        const newSession: SiteSessionTab = {
          id: `session-${profileId}`,
          profileId,
          title: profile.name,
          selectedScope: initialScope,
          tabs: [defaultObjTab],
          activeTabId: "objects",
        };
        return {
          sessionTabs: [...snapshotSessions, newSession],
          activeSessionTabId: newSession.id,
          selectedScope: initialScope,
          tabs: [defaultObjTab],
          activeTabId: "objects",
          connectionModalOpen: false,
        };
      });
    };

    const myAttempt = (connectionAttemptSeq[profileId] ?? 0) + 1;
    connectionAttemptSeq[profileId] = myAttempt;

    activateOrCreateSessionForProfile();

    set((state) => ({
      connectionStates: { ...state.connectionStates, [profileId]: "connecting" },
      connectionErrors: { ...state.connectionErrors, [profileId]: "" },
      statusMessage: `正在連線至 ${profile.name} (${profile.host}:${profile.port})...`,
    }));

    if (useDemo) {
      const dbs = getDemoDatabases(profile.dbKind);
      set((state) => ({
        connectionStates: { ...state.connectionStates, [profileId]: "demo" },
        serverVersions: {
          ...state.serverVersions,
          [profileId]: `${profile.dbKind.toUpperCase()} Demo Sandbox`,
        },
        databasesByProfile: { ...state.databasesByProfile, [profileId]: dbs },
        expandedNodes: { ...state.expandedNodes, [`conn:${profileId}`]: true },
        statusMessage: `已開啟 ${profile.name} [DEMO 模式] — 請在左側雙擊資料庫開啟`,
        lastLatencyMs: 1,
      }));
      get().appendLog({
        level: "info",
        profileName: profile.name,
        message: `已載入離線範例結構 (DEMO 模式，共 ${dbs.length} 個資料庫)`,
        latencyMs: 1,
      });
      return true;
    }

    try {
      const res = profileOverride
        ? await tauriApi.connectAdhocProfile(profileOverride)
        : await tauriApi.connectProfile(profileId);
      if (connectionAttemptSeq[profileId] !== myAttempt) {
        void tauriApi.disconnectProfile(profileId);
        return false;
      }
      if (!res.success) {
        set((state) => ({
          connectionStates: { ...state.connectionStates, [profileId]: "error" },
          connectionErrors: { ...state.connectionErrors, [profileId]: res.message },
          statusMessage: `連線失敗：${res.message}`,
          lastLatencyMs: res.latencyMs,
        }));
        get().appendLog({
          level: "error",
          profileName: profile.name,
          message: res.message,
          latencyMs: res.latencyMs,
        });
        return false;
      }

      set((state) => ({
        connectionStates: { ...state.connectionStates, [profileId]: "connected" },
        serverVersions: {
          ...state.serverVersions,
          [profileId]: res.serverVersion || profile.dbKind,
        },
        expandedNodes: { ...state.expandedNodes, [`conn:${profileId}`]: true },
        statusMessage: `已連線：${profile.name} (${res.serverVersion ?? ""}) — 請在左側雙擊資料庫開啟`,
        lastLatencyMs: res.latencyMs,
      }));

      get().appendLog({
        level: "success",
        profileName: profile.name,
        message: res.message,
        latencyMs: res.latencyMs,
      });

      await get().loadDatabases(profileId);
      return true;
    } catch (err) {
      if (connectionAttemptSeq[profileId] !== myAttempt) {
        return false;
      }
      const msg = String(err);
      set((state) => ({
        connectionStates: { ...state.connectionStates, [profileId]: "error" },
        connectionErrors: { ...state.connectionErrors, [profileId]: msg },
        statusMessage: `連線錯誤：${msg}`,
      }));
      get().appendLog({
        level: "error",
        profileName: profile.name,
        message: msg,
      });
      return false;
    }
  },

  cancelConnection: (profileId) => {
    connectionAttemptSeq[profileId] = (connectionAttemptSeq[profileId] ?? 0) + 1;
    void tauriApi.disconnectProfile(profileId);
    const profile = get().getProfileById(profileId);
    set((state) => ({
      connectionStates: { ...state.connectionStates, [profileId]: "disconnected" },
      connectionErrors: { ...state.connectionErrors, [profileId]: "" },
      statusMessage: `已取消連線：${profile?.name ?? profileId}`,
    }));
    get().openConnectionModal(profile);
  },

  disconnectProfile: async (profileId) => {
    const profile = get().getProfileById(profileId);
    const status = get().connectionStates[profileId];
    if (status === "connected") {
      await tauriApi.disconnectProfile(profileId);
    }
    set((state) => ({
      connectionStates: { ...state.connectionStates, [profileId]: "disconnected" },
      expandedNodes: { ...state.expandedNodes, [`conn:${profileId}`]: false },
      statusMessage: `已關閉連線：${profile?.name ?? profileId}`,
    }));
    get().appendLog({
      level: "info",
      profileName: profile?.name,
      message: "已中斷資料庫連線",
    });
  },

  loadDatabases: async (profileId) => {
    const profile = get().getProfileById(profileId);
    if (!profile) return;
    const isDemo = get().connectionStates[profileId] === "demo";
    const key = `conn:${profileId}`;
    set((s) => ({ loadingNodes: { ...s.loadingNodes, [key]: true } }));
    try {
      const dbs = isDemo
        ? getDemoDatabases(profile.dbKind)
        : await tauriApi.listDatabases(profileId);
      set((s) => ({
        databasesByProfile: { ...s.databasesByProfile, [profileId]: dbs },
      }));
    } catch (err) {
      const msg = String(err);
      set({ statusMessage: `讀取資料庫清單失敗：${msg}` });
      get().appendLog({
        level: "error",
        profileName: profile.name,
        message: `讀取資料庫清單失敗：${msg}`,
      });
    } finally {
      set((s) => ({ loadingNodes: { ...s.loadingNodes, [key]: false } }));
    }
  },

  loadSchemas: async (profileId, database) => {
    const profile = get().getProfileById(profileId);
    if (!profile || profile.dbKind !== "postgres") return;
    const isDemo = get().connectionStates[profileId] === "demo";
    const dbKey = makeDbKey(profileId, database);
    const nodeKey = `db:${dbKey}`;
    set((s) => ({ loadingNodes: { ...s.loadingNodes, [nodeKey]: true } }));
    try {
      const schemas = isDemo
        ? getDemoSchemas(profile.dbKind, database)
        : await tauriApi.listSchemas(profileId, database);
      set((s) => ({
        schemasByDb: { ...s.schemasByDb, [dbKey]: schemas },
      }));
    } finally {
      set((s) => ({ loadingNodes: { ...s.loadingNodes, [nodeKey]: false } }));
    }
  },

  loadScopeObjects: async (profileId, database, schema = null) => {
    const profile = get().getProfileById(profileId);
    if (!profile) return;
    const isDemo = get().connectionStates[profileId] === "demo";
    const key = makeScopeKey(profileId, database, schema);
    set((s) => ({ loadingNodes: { ...s.loadingNodes, [`scope:${key}`]: true } }));
    try {
      if (isDemo) {
        const tables = getDemoTables(profile.dbKind, database, schema);
        const views = getDemoViews(profile.dbKind, database, schema);
        const routines = getDemoRoutines(profile.dbKind, database, schema);
        const sequences = getDemoSequences(profile.dbKind, database, schema);
        set((s) => ({
          tablesByScope: { ...s.tablesByScope, [key]: tables },
          viewsByScope: { ...s.viewsByScope, [key]: views },
          routinesByScope: { ...s.routinesByScope, [key]: routines },
          sequencesByScope: { ...s.sequencesByScope, [key]: sequences },
        }));
      } else {
        const [tables, views, routines, sequences] = await Promise.all([
          tauriApi.listTables(profileId, database, schema),
          tauriApi.listViews(profileId, database, schema),
          tauriApi.listRoutines(profileId, database, schema),
          profile.dbKind === "postgres"
            ? tauriApi.listSequences(profileId, database, schema)
            : Promise.resolve([]),
        ]);
        set((s) => ({
          tablesByScope: { ...s.tablesByScope, [key]: tables },
          viewsByScope: { ...s.viewsByScope, [key]: views },
          routinesByScope: { ...s.routinesByScope, [key]: routines },
          sequencesByScope: { ...s.sequencesByScope, [key]: sequences },
        }));
      }
    } catch (err) {
      get().appendLog({
        level: "error",
        profileName: profile.name,
        message: `載入物件清單失敗：${String(err)}`,
      });
    } finally {
      set((s) => ({ loadingNodes: { ...s.loadingNodes, [`scope:${key}`]: false } }));
    }
  },

  setNodeExpanded: (nodeKey, expanded) => {
    set((s) => ({
      expandedNodes: { ...s.expandedNodes, [nodeKey]: expanded },
    }));
  },

  toggleNodeExpanded: (nodeKey) => {
    set((s) => ({
      expandedNodes: { ...s.expandedNodes, [nodeKey]: !s.expandedNodes[nodeKey] },
    }));
  },

  selectScope: async (scope) => {
    set({ selectedScope: scope, activeTabId: "objects" });
    if (scope.database) {
      const key = makeScopeKey(scope.profileId, scope.database, scope.schema);
      if (!get().tablesByScope[key]) {
        await get().loadScopeObjects(scope.profileId, scope.database, scope.schema);
      }
    }
  },

  selectObject: async (profileId, database, schema, category, objectName) => {
    const profile = get().getProfileById(profileId);
    if (!profile) return;
    const isDemo = get().connectionStates[profileId] === "demo";

    set({
      selectedScope: {
        profileId,
        database,
        schema: schema ?? null,
        category,
        objectName,
      },
      inspectorLoading: true,
    });

    try {
      if (isDemo) {
        const meta = getDemoTableMeta(profile.dbKind, database, schema, objectName);
        set({
          inspectorColumns: meta?.columns ?? [],
          inspectorIndexes: meta?.indexes ?? [],
          inspectorForeignKeys: meta?.foreignKeys ?? [],
          inspectorDdl:
            meta?.ddl ??
            `-- ${objectName}\n-- (${category} definition preview in Demo mode)`,
          inspectorLoading: false,
        });
        return;
      }

      if (category === "tables") {
        const [columns, indexes, foreignKeys, ddl] = await Promise.all([
          tauriApi.listColumns(profileId, database, schema, objectName),
          tauriApi.listIndexes(profileId, database, schema, objectName),
          tauriApi.listForeignKeys(profileId, database, schema, objectName),
          tauriApi
            .getObjectDdl(profileId, database, schema, "TABLE", objectName)
            .catch((e) => `-- DDL unavailable: ${String(e)}`),
        ]);
        set({
          inspectorColumns: columns,
          inspectorIndexes: indexes,
          inspectorForeignKeys: foreignKeys,
          inspectorDdl: ddl,
          inspectorLoading: false,
        });
      } else {
        const objType =
          category === "views"
            ? "VIEW"
            : category === "routines"
            ? "FUNCTION"
            : category.toUpperCase();
        const ddl = await tauriApi
          .getObjectDdl(profileId, database, schema, objType, objectName)
          .catch((e) => `-- ${objectName}: ${String(e)}`);
        set({
          inspectorColumns: [],
          inspectorIndexes: [],
          inspectorForeignKeys: [],
          inspectorDdl: ddl,
          inspectorLoading: false,
        });
      }
    } catch {
      set({ inspectorLoading: false });
    }
  },

  setTreeFilter: (value) => set({ treeFilter: value }),
  setObjectFilter: (value) => set({ objectFilter: value }),
  setObjectViewMode: (mode) => set({ objectViewMode: mode }),
  setRightPaneOpen: (open) => set({ rightPaneOpen: open }),
  setRightPaneTab: (tab) => set({ rightPaneTab: tab }),

  setActiveTab: (tabId) => set({ activeTabId: tabId }),

  closeTab: (tabId) => {
    if (tabId === "objects") return;
    set((state) => {
      const idx = state.tabs.findIndex((t) => t.id === tabId);
      const nextTabs = state.tabs.filter((t) => t.id !== tabId);
      let nextActive = state.activeTabId;
      if (state.activeTabId === tabId) {
        const fallback = nextTabs[Math.max(0, idx - 1)] ?? nextTabs[0];
        nextActive = fallback.id;
      }
      return { tabs: nextTabs, activeTabId: nextActive };
    });
  },

  openTableDataTab: async (profileId, database, schema, tableName) => {
    const tabId = `data::${profileId}::${database}::${schema || ""}::${tableName}`;
    const existing = get().tabs.find((t) => t.id === tabId);
    if (existing) {
      set({ activeTabId: tabId });
      return;
    }

    set((state) => ({
      tabs: [
        ...state.tabs,
        {
          id: tabId,
          kind: "table-data",
          title: tableName,
          closable: true,
          profileId,
          database,
          schema: schema ?? null,
          tableName,
          tableColumns: [],
          page: 1,
          pageSize: 1000,
          filters: [],
          sorts: [],
          loading: true,
          result: null,
          error: null,
        },
      ],
      activeTabId: tabId,
    }));

    await get().refreshTableDataTab(tabId);
  },

  refreshTableDataTab: async (tabId, opts) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab || tab.kind !== "table-data") return;
    const profile = get().getProfileById(tab.profileId);
    if (!profile) return;

    const nextPage = opts?.page ?? tab.page ?? 1;
    const nextPageSize = opts?.pageSize ?? tab.pageSize ?? 1000;
    const nextFilters = opts?.filters ?? tab.filters ?? [];
    const nextSorts = opts?.sorts ?? tab.sorts ?? [];

    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId && t.kind === "table-data"
          ? {
              ...t,
              page: nextPage,
              pageSize: nextPageSize,
              filters: nextFilters,
              sorts: nextSorts,
              loading: true,
              error: null,
            }
          : t
      ),
    }));

    const isDemo = get().connectionStates[tab.profileId] === "demo";
    try {
      if (isDemo) {
        const meta = getDemoTableMeta(
          profile.dbKind,
          tab.database,
          tab.schema,
          tab.tableName
        );
        const allRows = meta?.sampleData.rows ?? [];
        const cols = meta?.columns ?? [];
        const colNames = cols.map((c) => c.name);

        // Apply in-memory Demo filter & sort for realistic offline UX
        let workingRows = [...allRows];
        const activeFilters = nextFilters.filter((f) => f.enabled && f.column);
        if (activeFilters.length > 0) {
          workingRows = workingRows.filter((row) => {
            let acc = true;
            activeFilters.forEach((f, idx) => {
              const cIdx = colNames.indexOf(f.column);
              const raw = cIdx >= 0 ? row[cIdx] : null;
              const strVal = raw == null ? "" : String(raw);
              let matched = true;
              switch (f.operator) {
                case "IS NULL":
                  matched = raw == null;
                  break;
                case "IS NOT NULL":
                  matched = raw != null;
                  break;
                case "IS EMPTY":
                  matched = raw === "";
                  break;
                case "LIKE":
                  matched = strVal
                    .toLowerCase()
                    .includes(f.value.replace(/%/g, "").toLowerCase());
                  break;
                case "NOT LIKE":
                  matched = !strVal
                    .toLowerCase()
                    .includes(f.value.replace(/%/g, "").toLowerCase());
                  break;
                case "!=":
                  matched = strVal !== f.value;
                  break;
                default:
                  matched = strVal === f.value;
              }
              acc = idx === 0 ? matched : f.logic === "AND" ? acc && matched : acc || matched;
            });
            return acc;
          });
        }

        if (nextSorts.length > 0) {
          workingRows.sort((a, b) => {
            for (const s of nextSorts) {
              const cIdx = colNames.indexOf(s.column);
              if (cIdx < 0) continue;
              const va = a[cIdx] == null ? "" : String(a[cIdx]);
              const vb = b[cIdx] == null ? "" : String(b[cIdx]);
              const cmp = va.localeCompare(vb, undefined, { numeric: true });
              if (cmp !== 0) return s.direction === "ASC" ? cmp : -cmp;
            }
            return 0;
          });
        }

        const start = (nextPage - 1) * nextPageSize;
        const pageRows = workingRows.slice(start, start + nextPageSize);
        const result: QueryResultSet = {
          columns:
            meta?.sampleData.columns ??
            cols.map((c) => ({ name: c.name, dataType: c.columnType })),
          rows: pageRows,
          affectedRows: 0,
          executionMs: 3,
          truncated: false,
          warning: meta ? "Demo 模式資料預覽（離線範例資料）" : "找不到範例資料表",
        };
        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === tabId && t.kind === "table-data"
              ? { ...t, loading: false, result, tableColumns: cols }
              : t
          ),
          statusMessage: `${tab.tableName}：第 ${nextPage} 頁，共 ${pageRows.length} 筆（Demo 模式）`,
          lastLatencyMs: result.executionMs,
        }));
        return;
      }

      const sql = buildSelectPageSql({
        kind: profile.dbKind,
        database: tab.database,
        schema: tab.schema,
        tableName: tab.tableName,
        filters: nextFilters,
        sorts: nextSorts,
        page: nextPage,
        pageSize: nextPageSize,
      });

      const [result, tableColumns] = await Promise.all([
        tauriApi.executeQuery(tab.profileId, tab.database, tab.schema, sql),
        tab.tableColumns.length > 0
          ? Promise.resolve(tab.tableColumns)
          : tauriApi.listColumns(tab.profileId, tab.database, tab.schema, tab.tableName),
      ]);

      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === tabId && t.kind === "table-data"
            ? { ...t, loading: false, result, tableColumns }
            : t
        ),
        statusMessage: `${tab.tableName}：第 ${nextPage} 頁載入 ${result.rows.length} 筆（${result.executionMs} ms）`,
        lastLatencyMs: result.executionMs,
      }));
    } catch (err) {
      const msg = String(err);
      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === tabId && t.kind === "table-data"
            ? { ...t, loading: false, error: msg }
            : t
        ),
        statusMessage: `讀取資料表失敗：${msg}`,
      }));
    }
  },

  applyGridChangeSet: async (tabId, statements, nextDemoRows) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab || tab.kind !== "table-data") return;
    const profile = get().getProfileById(tab.profileId);
    if (!profile) return;

    const isDemo = get().connectionStates[tab.profileId] === "demo";
    if (isDemo) {
      if (nextDemoRows) {
        updateDemoTableRows(
          profile.dbKind,
          tab.database,
          tab.schema,
          tab.tableName,
          nextDemoRows
        );
      }
      get().appendLog({
        level: "success",
        profileName: profile.name,
        message: `[DEMO] 已套用 ${statements.length} 筆資料異動至 ${tab.tableName}`,
      });
      await get().refreshTableDataTab(tabId);
      return;
    }

    const batchSql =
      profile.dbKind === "postgres"
        ? `BEGIN;\n${statements.join("\n")}\nCOMMIT;`
        : `START TRANSACTION;\n${statements.join("\n")}\nCOMMIT;`;

    const res = await tauriApi.executeBatch(
      tab.profileId,
      tab.database,
      tab.schema,
      batchSql
    );
    const failed = res.statements.find((s) => !s.success);
    if (failed) {
      await tauriApi
        .executeQuery(tab.profileId, tab.database, tab.schema, "ROLLBACK;")
        .catch(() => undefined);
      const errMsg = failed.error ?? "套用變更失敗並已回滾交易";
      get().appendLog({
        level: "error",
        profileName: profile.name,
        message: errMsg,
      });
      throw new Error(errMsg);
    }

    get().appendLog({
      level: "success",
      profileName: profile.name,
      message: `已成功套用 ${statements.length} 筆異動至 ${tab.tableName}`,
      latencyMs: res.totalExecutionMs,
    });
    await get().refreshTableDataTab(tabId);
  },

  openTableDesignTab: async (profileId, database, schema, tableName) => {
    const tabId = `design::${profileId}::${database}::${schema || ""}::${tableName}`;
    const existing = get().tabs.find((t) => t.id === tabId);
    if (existing) {
      set({ activeTabId: tabId });
      return;
    }

    set((state) => ({
      tabs: [
        ...state.tabs,
        {
          id: tabId,
          kind: "table-design",
          title: `設計 @ ${tableName}`,
          closable: true,
          profileId,
          database,
          schema: schema ?? null,
          tableName,
          isNew: false,
          columns: [],
          indexes: [],
          foreignKeys: [],
          ddl: "",
          loading: true,
        },
      ],
      activeTabId: tabId,
    }));

    const profile = get().getProfileById(profileId);
    if (!profile) return;
    const isDemo = get().connectionStates[profileId] === "demo";

    try {
      if (isDemo) {
        const meta = getDemoTableMeta(profile.dbKind, database, schema, tableName);
        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === tabId && t.kind === "table-design"
              ? {
                  ...t,
                  loading: false,
                  columns: meta?.columns ?? [],
                  indexes: meta?.indexes ?? [],
                  foreignKeys: meta?.foreignKeys ?? [],
                  ddl: meta?.ddl ?? "",
                }
              : t
          ),
        }));
        return;
      }

      const [columns, indexes, foreignKeys, ddl] = await Promise.all([
        tauriApi.listColumns(profileId, database, schema, tableName),
        tauriApi.listIndexes(profileId, database, schema, tableName),
        tauriApi.listForeignKeys(profileId, database, schema, tableName),
        tauriApi
          .getObjectDdl(profileId, database, schema, "TABLE", tableName)
          .catch((e) => `-- ${String(e)}`),
      ]);
      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === tabId && t.kind === "table-design"
            ? { ...t, loading: false, columns, indexes, foreignKeys, ddl }
            : t
        ),
      }));
    } catch {
      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === tabId && t.kind === "table-design" ? { ...t, loading: false } : t
        ),
      }));
    }
  },

  openNewTableDesignTab: (profileId, database, schema = null) => {
    const tabId = `design-new-${Date.now()}`;
    set((state) => ({
      tabs: [
        ...state.tabs,
        {
          id: tabId,
          kind: "table-design",
          title: "新建資料表",
          closable: true,
          profileId,
          database,
          schema: schema ?? null,
          tableName: "new_table",
          isNew: true,
          columns: [
            {
              name: "id",
              ordinalPosition: 1,
              dataType: "bigint",
              columnType: "bigint",
              nullable: false,
              defaultValue: null,
              isPrimaryKey: true,
              isAutoIncrement: true,
              characterSet: null,
              collation: null,
              comment: "主鍵 ID",
            },
          ],
          indexes: [],
          foreignKeys: [],
          ddl: "",
          loading: false,
        },
      ],
      activeTabId: tabId,
    }));
  },

  applyTableDesignSql: async (tabId, sql, targetTableName, isNew, demoTableMeta) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab || tab.kind !== "table-design") return;
    const profile = get().getProfileById(tab.profileId);
    if (!profile) return;

    const isDemo = get().connectionStates[tab.profileId] === "demo";
    if (isDemo) {
      if (demoTableMeta) {
        upsertDemoTable(
          profile.dbKind,
          tab.database,
          tab.schema,
          targetTableName,
          demoTableMeta
        );
      }
      await get().loadScopeObjects(tab.profileId, tab.database, tab.schema);
      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === tabId && t.kind === "table-design"
            ? {
                ...t,
                isNew: false,
                tableName: targetTableName,
                title: `設計 @ ${targetTableName}`,
                columns: demoTableMeta?.columns ?? t.columns,
                indexes: demoTableMeta?.indexes ?? t.indexes,
                foreignKeys: demoTableMeta?.foreignKeys ?? t.foreignKeys,
                ddl: demoTableMeta?.ddl ?? sql,
              }
            : t
        ),
        statusMessage: `[DEMO] 已儲存資料表結構：${targetTableName}`,
      }));
      get().appendLog({
        level: "success",
        profileName: profile.name,
        message: `[DEMO] ${isNew ? "建立" : "更新"}資料表 ${targetTableName}`,
      });
      return;
    }

    const res = await tauriApi.executeBatch(
      tab.profileId,
      tab.database,
      tab.schema,
      sql
    );
    const failed = res.statements.find((s) => !s.success);
    if (failed) {
      const msg = failed.error ?? "執行 DDL 失敗";
      get().appendLog({ level: "error", profileName: profile.name, message: msg });
      throw new Error(msg);
    }

    await get().loadScopeObjects(tab.profileId, tab.database, tab.schema);
    const [columns, indexes, foreignKeys, ddl] = await Promise.all([
      tauriApi.listColumns(tab.profileId, tab.database, tab.schema, targetTableName),
      tauriApi.listIndexes(tab.profileId, tab.database, tab.schema, targetTableName),
      tauriApi.listForeignKeys(tab.profileId, tab.database, tab.schema, targetTableName),
      tauriApi
        .getObjectDdl(tab.profileId, tab.database, tab.schema, "TABLE", targetTableName)
        .catch(() => sql),
    ]);

    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId && t.kind === "table-design"
          ? {
              ...t,
              isNew: false,
              tableName: targetTableName,
              title: `設計 @ ${targetTableName}`,
              columns,
              indexes,
              foreignKeys,
              ddl,
            }
          : t
      ),
      statusMessage: `已儲存資料表結構：${targetTableName} (${res.totalExecutionMs} ms)`,
      lastLatencyMs: res.totalExecutionMs,
    }));
    get().appendLog({
      level: "success",
      profileName: profile.name,
      message: `${isNew ? "建立" : "更新"}資料表 ${targetTableName}`,
      latencyMs: res.totalExecutionMs,
    });
  },

  openQueryTab: (
    profileId = null,
    database = null,
    schema = null,
    initialSql,
    customTitle,
    savedQueryId = null
  ) => {
    const selected = get().selectedScope;
    const targetProfileId =
      profileId ?? selected?.profileId ?? get().profiles[0]?.id ?? "";
    const targetDb = database ?? selected?.database ?? null;
    const targetSchema = schema ?? selected?.schema ?? null;
    const id = `query-${Date.now()}-${queryCounter}`;
    const title = customTitle?.trim() || `查詢 ${queryCounter++}`;
    const defaultSql =
      initialSql ??
      (targetDb
        ? `-- ${targetDb}${targetSchema ? `.${targetSchema}` : ""}\nSELECT 1 AS ok;`
        : "SELECT 1 AS ok;");

    set((state) => ({
      tabs: [
        ...state.tabs,
        {
          id,
          kind: "query",
          title,
          closable: true,
          profileId: targetProfileId,
          database: targetDb,
          schema: targetSchema,
          sql: defaultSql,
          running: false,
          response: null,
          explainResponse: null,
          savedQueryId,
          error: null,
        },
      ],
      activeTabId: id,
    }));
  },

  openSavedQueryTab: (query) => {
    const existing = get().tabs.find(
      (t) => t.kind === "query" && t.savedQueryId === query.id
    );
    if (existing) {
      set({ activeTabId: existing.id });
      return;
    }
    get().openQueryTab(
      query.profileId,
      query.databaseName ?? null,
      query.schemaName ?? null,
      query.sqlText,
      query.title,
      query.id
    );
  },

  updateQueryTabSql: (tabId, sql) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId && t.kind === "query" ? { ...t, sql } : t
      ),
    }));
  },

  updateQueryTabContext: (tabId, patch) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId && t.kind === "query" ? { ...t, ...patch } : t
      ),
    }));
  },

  runQueryInTab: async (tabId, sqlOverride) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab || tab.kind !== "query") return;
    const sqlToRun = (sqlOverride ?? tab.sql).trim();
    if (!sqlToRun) return;

    const profile = get().getProfileById(tab.profileId);
    const isDemo = get().connectionStates[tab.profileId] === "demo";

    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId && t.kind === "query"
          ? { ...t, running: true, error: null }
          : t
      ),
    }));

    if (isDemo) {
      const response: BatchQueryResponse = {
        totalExecutionMs: 3,
        statements: [
          {
            index: 0,
            sqlPreview: sqlToRun.slice(0, 72),
            success: true,
            affectedRows: 0,
            executionMs: 3,
            error: null,
            resultSet: {
              columns: [
                { name: "mode", dataType: "varchar" },
                { name: "executed_sql", dataType: "text" },
              ],
              rows: [["DEMO_SANDBOX", sqlToRun]],
              affectedRows: 0,
              executionMs: 3,
              truncated: false,
              warning: "目前為離線 DEMO 模式，實際資料庫執行請連接真實 MySQL/MariaDB/PostgreSQL。",
            },
          },
        ],
      };
      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === tabId && t.kind === "query"
            ? { ...t, running: false, response }
            : t
        ),
        statusMessage: `查詢執行完成 (DEMO, ${response.totalExecutionMs} ms)`,
        lastLatencyMs: response.totalExecutionMs,
      }));
      return;
    }

    try {
      const response = await tauriApi.executeBatch(
        tab.profileId,
        tab.database,
        tab.schema,
        sqlToRun,
        tabId
      );
      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === tabId && t.kind === "query"
            ? { ...t, running: false, response }
            : t
        ),
        statusMessage: `執行 ${response.statements.length} 句 SQL 完成（${response.totalExecutionMs} ms）`,
        lastLatencyMs: response.totalExecutionMs,
      }));
      get().appendLog({
        level: response.statements.every((s) => s.success) ? "success" : "warn",
        profileName: profile?.name,
        message: `執行 ${response.statements.length} 句查詢`,
        latencyMs: response.totalExecutionMs,
      });
    } catch (err) {
      const msg = String(err);
      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === tabId && t.kind === "query"
            ? { ...t, running: false, error: msg }
            : t
        ),
        statusMessage: `執行錯誤：${msg}`,
      }));
      get().appendLog({
        level: "error",
        profileName: profile?.name,
        message: msg,
      });
    }
  },

  explainQueryInTab: async (tabId, sqlOverride) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab || tab.kind !== "query") return;
    const profile = get().getProfileById(tab.profileId);
    const kind = profile?.dbKind ?? "mysql";
    const targetSql = (sqlOverride ?? tab.sql).trim();
    const explainSql = buildExplainSql(targetSql, kind);
    if (!explainSql) return;

    const isDemo = get().connectionStates[tab.profileId] === "demo";
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId && t.kind === "query"
          ? { ...t, running: true, error: null }
          : t
      ),
    }));

    if (isDemo) {
      const explainResponse: BatchQueryResponse = {
        totalExecutionMs: 2,
        statements: [
          {
            index: 0,
            sqlPreview: explainSql.slice(0, 72),
            success: true,
            affectedRows: 0,
            executionMs: 2,
            error: null,
            resultSet:
              kind === "postgres"
                ? {
                    columns: [{ name: "QUERY PLAN", dataType: "text" }],
                    rows: [
                      ["Seq Scan on accounts  (cost=0.00..25.40 rows=120 width=96)"],
                      ["  Filter: (plan_tier = 'enterprise'::text)"],
                    ],
                    affectedRows: 0,
                    executionMs: 2,
                    truncated: false,
                    warning: "Demo 模式 EXPLAIN 執行計畫預覽",
                  }
                : {
                    columns: [
                      { name: "id", dataType: "bigint" },
                      { name: "select_type", dataType: "varchar" },
                      { name: "table", dataType: "varchar" },
                      { name: "type", dataType: "varchar" },
                      { name: "possible_keys", dataType: "varchar" },
                      { name: "key", dataType: "varchar" },
                      { name: "rows", dataType: "bigint" },
                      { name: "Extra", dataType: "varchar" },
                    ],
                    rows: [[1, "SIMPLE", "users", "const", "PRIMARY", "PRIMARY", 1, null]],
                    affectedRows: 0,
                    executionMs: 2,
                    truncated: false,
                    warning: "Demo 模式 EXPLAIN 執行計畫預覽",
                  },
          },
        ],
      };
      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === tabId && t.kind === "query"
            ? { ...t, running: false, explainResponse }
            : t
        ),
        statusMessage: `EXPLAIN 計畫分析完成 (DEMO)`,
      }));
      return;
    }

    try {
      const explainResponse = await tauriApi.executeBatch(
        tab.profileId,
        tab.database,
        tab.schema,
        explainSql,
        tabId
      );
      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === tabId && t.kind === "query"
            ? { ...t, running: false, explainResponse }
            : t
        ),
        statusMessage: `EXPLAIN 完成（${explainResponse.totalExecutionMs} ms）`,
        lastLatencyMs: explainResponse.totalExecutionMs,
      }));
    } catch (err) {
      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === tabId && t.kind === "query"
            ? { ...t, running: false, error: String(err) }
            : t
        ),
      }));
    }
  },

  cancelQueryInTab: async (tabId) => {
    await tauriApi.cancelQuery(tabId);
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId && t.kind === "query" ? { ...t, running: false } : t
      ),
      statusMessage: "已送出查詢取消請求",
    }));
  },

  loadSavedQueries: async () => {
    const savedQueries = await tauriApi.listSavedQueries(null);
    set({ savedQueries });
  },

  saveQueryTab: async (tabId, title) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab || tab.kind !== "query" || !title.trim()) return null;
    const now = new Date().toISOString();
    const saved = await tauriApi.saveQuery({
      id: tab.savedQueryId || `sq-${Date.now()}`,
      profileId: tab.profileId,
      databaseName: tab.database ?? null,
      schemaName: tab.schema ?? null,
      title: title.trim(),
      sqlText: tab.sql,
      createdAt: now,
      updatedAt: now,
    });
    await get().loadSavedQueries();
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId && t.kind === "query"
          ? { ...t, title: saved.title, savedQueryId: saved.id }
          : t
      ),
      statusMessage: `已儲存查詢：${saved.title}`,
    }));
    get().appendLog({
      level: "info",
      message: `已儲存 SQL 查詢「${saved.title}」`,
    });
    return saved;
  },

  deleteSavedQuery: async (queryId) => {
    await tauriApi.deleteSavedQuery(queryId);
    await get().loadSavedQueries();
    get().appendLog({
      level: "warn",
      message: `已刪除已儲存的 SQL 查詢`,
    });
  },

  dropTable: async (profileId, database, schema, tableName) => {
    const profile = get().getProfileById(profileId);
    if (!profile) return;
    const isDemo = get().connectionStates[profileId] === "demo";
    const key = makeScopeKey(profileId, database, schema);

    if (isDemo) {
      set((s) => ({
        tablesByScope: {
          ...s.tablesByScope,
          [key]: (s.tablesByScope[key] ?? []).filter((t) => t.name !== tableName),
        },
      }));
      get().appendLog({
        level: "warn",
        profileName: profile.name,
        message: `[DEMO] 已刪除資料表 ${tableName}`,
      });
      return;
    }

    const target = formatQualifiedTable(profile.dbKind, database, schema, tableName);
    await tauriApi.executeQuery(profileId, database, schema, `DROP TABLE ${target}`);
    await get().loadScopeObjects(profileId, database, schema);
    get().appendLog({
      level: "warn",
      profileName: profile.name,
      message: `已刪除資料表 ${tableName}`,
    });
  },

  truncateTable: async (profileId, database, schema, tableName) => {
    const profile = get().getProfileById(profileId);
    if (!profile) return;
    const isDemo = get().connectionStates[profileId] === "demo";

    if (isDemo) {
      updateDemoTableRows(profile.dbKind, database, schema, tableName, []);
      get().appendLog({
        level: "warn",
        profileName: profile.name,
        message: `[DEMO] 已清空資料表 ${tableName}`,
      });
      return;
    }

    const target = formatQualifiedTable(profile.dbKind, database, schema, tableName);
    await tauriApi.executeQuery(profileId, database, schema, `TRUNCATE TABLE ${target}`);
    await get().loadScopeObjects(profileId, database, schema);
    get().appendLog({
      level: "warn",
      profileName: profile.name,
      message: `已清空資料表 ${tableName}`,
    });
  },

  renameTable: async (profileId, database, schema, oldName, newName) => {
    const profile = get().getProfileById(profileId);
    if (!profile || !newName.trim() || newName === oldName) return;
    const trimmed = newName.trim();
    const isDemo = get().connectionStates[profileId] === "demo";
    const key = makeScopeKey(profileId, database, schema);

    if (isDemo) {
      set((s) => ({
        tablesByScope: {
          ...s.tablesByScope,
          [key]: (s.tablesByScope[key] ?? []).map((t) =>
            t.name === oldName ? { ...t, name: trimmed } : t
          ),
        },
      }));
      get().appendLog({
        level: "info",
        profileName: profile.name,
        message: `[DEMO] 已重新命名 ${oldName} -> ${trimmed}`,
      });
      return;
    }

    const sql =
      profile.dbKind === "postgres"
        ? `ALTER TABLE ${formatQualifiedTable(profile.dbKind, database, schema, oldName)} RENAME TO ${quoteIdentifier(profile.dbKind, trimmed)}`
        : `RENAME TABLE ${formatQualifiedTable(profile.dbKind, database, schema, oldName)} TO ${formatQualifiedTable(profile.dbKind, database, schema, trimmed)}`;

    await tauriApi.executeQuery(profileId, database, schema, sql);
    await get().loadScopeObjects(profileId, database, schema);
    get().appendLog({
      level: "info",
      profileName: profile.name,
      message: `已重新命名 ${oldName} -> ${trimmed}`,
    });
  },

  getTableDdl: async (profileId, database, schema, objectType, objectName) => {
    const profile = get().getProfileById(profileId);
    if (!profile) return "";
    if (get().connectionStates[profileId] === "demo") {
      return (
        getDemoTableMeta(profile.dbKind, database, schema, objectName)?.ddl ??
        `-- ${objectName}`
      );
    }
    return tauriApi.getObjectDdl(profileId, database, schema, objectType, objectName);
  },
}));
