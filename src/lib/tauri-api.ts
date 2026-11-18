import { invoke } from "@tauri-apps/api/core";
import type {
  AppConfig,
  BatchQueryResponse,
  ColumnInfo,
  ConnectionProfile,
  ConnectionTestResult,
  DatabaseInfo,
  DbKind,
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

function normalizeDbKind(raw: unknown): DbKind {
  const s = String(raw || "mysql").toLowerCase();
  if (s === "mariadb") return "mariadb";
  if (s === "postgres" || s === "postgresql") return "postgres";
  return "mysql";
}

function normalizeProfile(profile: ConnectionProfile): ConnectionProfile {
  return {
    ...profile,
    dbKind: normalizeDbKind(profile.dbKind),
  };
}

const BROWSER_PROFILES_KEY = "sqlcraft.browser_preview_profiles";

export function isTauriRuntime(): boolean {
  return (
    typeof window !== "undefined" &&
    "__TAURI_INTERNALS__" in (window as unknown as Record<string, unknown>)
  );
}

function getDefaultBrowserProfiles(): ConnectionProfile[] {
  const now = new Date().toISOString();
  return [
    {
      id: "preview-mysql-local",
      name: "Local MySQL (3306)",
      groupName: "Local",
      dbKind: "mysql",
      host: "127.0.0.1",
      port: 3306,
      initialDatabase: null,
      username: "root",
      password: "",
      savePassword: false,
      color: "#2563eb",
      encoding: "utf8mb4",
      keepaliveSecs: 60,
      connectTimeoutSecs: 10,
      autoConnect: false,
      ssl: { useSsl: false, mode: "prefer" },
      ssh: {
        useSsh: false,
        host: "",
        port: 22,
        username: "",
        authMethod: "password",
      },
      httpTunnel: { useHttpTunnel: false, url: "", encodeBase64: true },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "preview-mariadb-local",
      name: "Local MariaDB (3306)",
      groupName: "Local",
      dbKind: "mariadb",
      host: "127.0.0.1",
      port: 3306,
      initialDatabase: null,
      username: "root",
      password: "",
      savePassword: false,
      color: "#0d9488",
      encoding: "utf8mb4",
      keepaliveSecs: 60,
      connectTimeoutSecs: 10,
      autoConnect: false,
      ssl: { useSsl: false, mode: "prefer" },
      ssh: {
        useSsh: false,
        host: "",
        port: 22,
        username: "",
        authMethod: "password",
      },
      httpTunnel: { useHttpTunnel: false, url: "", encodeBase64: true },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "preview-postgres-local",
      name: "Local PostgreSQL (5432)",
      groupName: "Local",
      dbKind: "postgres",
      host: "127.0.0.1",
      port: 5432,
      initialDatabase: "postgres",
      username: "postgres",
      password: "",
      savePassword: false,
      color: "#4f46e5",
      encoding: "UTF8",
      keepaliveSecs: 60,
      connectTimeoutSecs: 10,
      autoConnect: false,
      ssl: { useSsl: false, mode: "prefer" },
      ssh: {
        useSsh: false,
        host: "",
        port: 22,
        username: "",
        authMethod: "password",
      },
      httpTunnel: { useHttpTunnel: false, url: "", encodeBase64: true },
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function readBrowserProfiles(): ConnectionProfile[] {
  try {
    const raw = localStorage.getItem(BROWSER_PROFILES_KEY);
    if (!raw) {
      const defaults = getDefaultBrowserProfiles();
      localStorage.setItem(BROWSER_PROFILES_KEY, JSON.stringify(defaults));
      return defaults;
    }
    return JSON.parse(raw) as ConnectionProfile[];
  } catch {
    return getDefaultBrowserProfiles();
  }
}

function writeBrowserProfiles(profiles: ConnectionProfile[]): void {
  try {
    localStorage.setItem(BROWSER_PROFILES_KEY, JSON.stringify(profiles));
  } catch {
    // ignore storage errors in restricted browser previews
  }
}

const BROWSER_QUERIES_KEY = "sqlcraft.browser_saved_queries";

function readBrowserSavedQueries(): SavedQuery[] {
  try {
    const raw = localStorage.getItem(BROWSER_QUERIES_KEY);
    return raw ? (JSON.parse(raw) as SavedQuery[]) : [];
  } catch {
    return [];
  }
}

function writeBrowserSavedQueries(queries: SavedQuery[]): void {
  try {
    localStorage.setItem(BROWSER_QUERIES_KEY, JSON.stringify(queries));
  } catch {
    // ignore storage errors
  }
}

export const tauriApi = {
  async listProfiles(): Promise<ConnectionProfile[]> {
    if (!isTauriRuntime()) {
      return readBrowserProfiles().map(normalizeProfile);
    }
    const list = await invoke<ConnectionProfile[]>("list_profiles");
    return list.map(normalizeProfile);
  },

  async saveProfile(profile: ConnectionProfile): Promise<ConnectionProfile> {
    if (!isTauriRuntime()) {
      const current = readBrowserProfiles();
      const idx = current.findIndex((p) => p.id === profile.id);
      const updated = normalizeProfile({
        ...profile,
        updatedAt: new Date().toISOString(),
      });
      if (idx >= 0) {
        current[idx] = updated;
      } else {
        current.push(updated);
      }
      writeBrowserProfiles(current);
      return updated;
    }
    const saved = await invoke<ConnectionProfile>("save_profile", { profile });
    return normalizeProfile(saved);
  },

  async deleteProfile(profileId: string): Promise<void> {
    if (!isTauriRuntime()) {
      const next = readBrowserProfiles().filter((p) => p.id !== profileId);
      writeBrowserProfiles(next);
      return;
    }
    return invoke<void>("delete_profile", { profileId });
  },

  async testConnection(profile: ConnectionProfile): Promise<ConnectionTestResult> {
    if (!isTauriRuntime()) {
      return {
        success: false,
        dbKind: profile.dbKind,
        serverVersion: null,
        latencyMs: 0,
        message: "Browser preview mode: launch via `npm run tauri dev` to test live TCP/SSL/SSH database connections.",
      };
    }
    return invoke<ConnectionTestResult>("test_connection", { profile });
  },

  async connectProfile(profileId: string): Promise<ConnectionTestResult> {
    if (!isTauriRuntime()) {
      const profiles = readBrowserProfiles();
      const found = profiles.find((p) => p.id === profileId);
      return {
        success: false,
        dbKind: found?.dbKind ?? "mysql",
        serverVersion: null,
        latencyMs: 0,
        message: "Browser preview mode: launch via `npm run tauri dev` to connect to databases.",
      };
    }
    return invoke<ConnectionTestResult>("connect_profile", { profileId });
  },

  async connectAdhocProfile(profile: ConnectionProfile): Promise<ConnectionTestResult> {
    if (!isTauriRuntime()) {
      return {
        success: false,
        dbKind: profile.dbKind,
        serverVersion: null,
        latencyMs: 0,
        message: "Browser preview mode: launch via `npm run tauri dev` to connect to databases.",
      };
    }
    return invoke<ConnectionTestResult>("connect_adhoc_profile", { profile });
  },

  async disconnectProfile(profileId: string): Promise<void> {
    if (!isTauriRuntime()) return;
    return invoke<void>("disconnect_profile", { profileId });
  },

  async listDatabases(profileId: string): Promise<DatabaseInfo[]> {
    if (!isTauriRuntime()) return [];
    return invoke<DatabaseInfo[]>("list_databases", { profileId });
  },

  async listSchemas(profileId: string, database: string): Promise<SchemaInfo[]> {
    if (!isTauriRuntime()) return [];
    return invoke<SchemaInfo[]>("list_schemas", { profileId, database });
  },

  async listTables(
    profileId: string,
    database: string,
    schema?: string | null
  ): Promise<TableInfo[]> {
    if (!isTauriRuntime()) return [];
    return invoke<TableInfo[]>("list_tables", {
      profileId,
      database,
      schema: schema ?? null,
    });
  },

  async listViews(
    profileId: string,
    database: string,
    schema?: string | null
  ): Promise<ViewInfo[]> {
    if (!isTauriRuntime()) return [];
    return invoke<ViewInfo[]>("list_views", {
      profileId,
      database,
      schema: schema ?? null,
    });
  },

  async listColumns(
    profileId: string,
    database: string,
    schema: string | null | undefined,
    table: string
  ): Promise<ColumnInfo[]> {
    if (!isTauriRuntime()) return [];
    return invoke<ColumnInfo[]>("list_columns", {
      profileId,
      database,
      schema: schema ?? null,
      table,
    });
  },

  async listIndexes(
    profileId: string,
    database: string,
    schema: string | null | undefined,
    table: string
  ): Promise<IndexInfo[]> {
    if (!isTauriRuntime()) return [];
    return invoke<IndexInfo[]>("list_indexes", {
      profileId,
      database,
      schema: schema ?? null,
      table,
    });
  },

  async listForeignKeys(
    profileId: string,
    database: string,
    schema: string | null | undefined,
    table: string
  ): Promise<ForeignKeyInfo[]> {
    if (!isTauriRuntime()) return [];
    return invoke<ForeignKeyInfo[]>("list_foreign_keys", {
      profileId,
      database,
      schema: schema ?? null,
      table,
    });
  },

  async listRoutines(
    profileId: string,
    database: string,
    schema?: string | null
  ): Promise<RoutineInfo[]> {
    if (!isTauriRuntime()) return [];
    return invoke<RoutineInfo[]>("list_routines", {
      profileId,
      database,
      schema: schema ?? null,
    });
  },

  async listSequences(
    profileId: string,
    database: string,
    schema?: string | null
  ): Promise<SequenceInfo[]> {
    if (!isTauriRuntime()) return [];
    return invoke<SequenceInfo[]>("list_sequences", {
      profileId,
      database,
      schema: schema ?? null,
    });
  },

  async getObjectDdl(
    profileId: string,
    database: string,
    schema: string | null | undefined,
    objectType: string,
    objectName: string
  ): Promise<string> {
    if (!isTauriRuntime()) return "";
    return invoke<string>("get_object_ddl", {
      profileId,
      database,
      schema: schema ?? null,
      objectType,
      objectName,
    });
  },

  async executeQuery(
    profileId: string,
    database: string | null | undefined,
    schema: string | null | undefined,
    sql: string,
    queryId?: string
  ): Promise<QueryResultSet> {
    if (!isTauriRuntime()) {
      throw new Error("Query execution requires the Tauri Rust backend.");
    }
    return invoke<QueryResultSet>("execute_query", {
      profileId,
      database: database ?? null,
      schema: schema ?? null,
      sql,
      queryId: queryId ?? null,
    });
  },

  async executeBatch(
    profileId: string,
    database: string | null | undefined,
    schema: string | null | undefined,
    sqlBatch: string,
    queryId?: string
  ): Promise<BatchQueryResponse> {
    if (!isTauriRuntime()) {
      throw new Error("Batch query execution requires the Tauri Rust backend.");
    }
    return invoke<BatchQueryResponse>("execute_batch", {
      profileId,
      database: database ?? null,
      schema: schema ?? null,
      sqlBatch,
      queryId: queryId ?? null,
    });
  },

  async cancelQuery(queryId: string): Promise<boolean> {
    if (!isTauriRuntime()) return false;
    return invoke<boolean>("cancel_query", { queryId });
  },

  async listSavedQueries(profileId?: string | null): Promise<SavedQuery[]> {
    if (!isTauriRuntime()) {
      const all = readBrowserSavedQueries();
      return profileId ? all.filter((q) => q.profileId === profileId) : all;
    }
    return invoke<SavedQuery[]>("list_saved_queries", {
      profileId: profileId ?? null,
    });
  },

  async saveQuery(query: SavedQuery): Promise<SavedQuery> {
    if (!isTauriRuntime()) {
      const all = readBrowserSavedQueries();
      const now = new Date().toISOString();
      const next: SavedQuery = {
        ...query,
        id: query.id || `q-${Date.now()}`,
        createdAt: query.createdAt || now,
        updatedAt: now,
      };
      const idx = all.findIndex((q) => q.id === next.id);
      if (idx >= 0) all[idx] = next;
      else all.unshift(next);
      writeBrowserSavedQueries(all);
      return next;
    }
    return invoke<SavedQuery>("save_query", { query });
  },

  async deleteSavedQuery(queryId: string): Promise<void> {
    if (!isTauriRuntime()) {
      const next = readBrowserSavedQueries().filter((q) => q.id !== queryId);
      writeBrowserSavedQueries(next);
      return;
    }
    return invoke<void>("delete_saved_query", { queryId });
  },

  async getAppConfig(): Promise<AppConfig> {
    if (!isTauriRuntime()) {
      return {
        theme: localStorage.getItem("sqlcraft.theme") === "dark" ? "dark" : "light",
        language: localStorage.getItem("sqlcraft.language") === "en" ? "en" : "zh-TW",
        editorFontSize: Number(localStorage.getItem("sqlcraft.editorFontSize")) || 13,
        folders: (() => {
          try {
            const raw = localStorage.getItem("sqlcraft.folders");
            const parsed = raw ? JSON.parse(raw) : null;
            return Array.isArray(parsed) && parsed.length > 0 ? parsed : ["Local"];
          } catch {
            return ["Local"];
          }
        })(),
        showSiteManagerOnStartup:
          localStorage.getItem("sqlcraft.showSiteManagerOnStartup") !== "false",
      };
    }
    return invoke<AppConfig>("get_app_config");
  },

  async saveAppConfig(config: AppConfig): Promise<AppConfig> {
    if (!isTauriRuntime()) {
      localStorage.setItem("sqlcraft.theme", config.theme);
      localStorage.setItem("sqlcraft.language", config.language);
      localStorage.setItem("sqlcraft.editorFontSize", String(config.editorFontSize));
      localStorage.setItem("sqlcraft.folders", JSON.stringify(config.folders));
      localStorage.setItem(
        "sqlcraft.showSiteManagerOnStartup",
        String(config.showSiteManagerOnStartup)
      );
      return config;
    }
    return invoke<AppConfig>("save_app_config", { config });
  },
};
