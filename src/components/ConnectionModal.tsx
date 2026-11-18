import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Database,
  Download,
  Edit3,
  Eye,
  EyeOff,
  Folder,
  FolderOpen,
  FolderPlus,
  Loader2,
  LogIn,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { t } from "../lib/i18n";
import { tauriApi } from "../lib/tauri-api";
import { useWorkbenchStore } from "../store/workbenchStore";
import type {
  ConnectionProfile,
  ConnectionTestResult,
  DbKind,
  SshAuthMethod,
  SslMode,
} from "../types/database";
import { isMacOS } from "../utils/platform";
import { DB_ENGINE_META, DbEngineIcon } from "./DbEngineIcon";

interface ConnectionModalProps {
  open: boolean;
  editingProfile: ConnectionProfile | null;
  defaultDbKind?: DbKind;
  onClose: () => void;
  onSave: (profile: ConnectionProfile) => Promise<void>;
}

type ModalTab = "general" | "ssl" | "ssh" | "http" | "advanced";

type TreeSelection =
  | { kind: "newSite" }
  | { kind: "folder"; folder: string }
  | { kind: "site"; siteId: string };

type SubPromptState =
  | null
  | { kind: "newFolder"; name: string; assignToDraft?: boolean }
  | { kind: "rename"; name: string }
  | { kind: "saveAs"; name: string; folder: string }
  | { kind: "importYaml"; text: string }
  | { kind: "exportYaml"; text: string };

type ContextMenuState =
  | null
  | {
      x: number;
      y: number;
      target:
        | { kind: "site"; site: ConnectionProfile }
        | { kind: "folder"; folder: string }
        | { kind: "empty" };
    };

const DB_BADGE: Record<DbKind, { label: string; color: string }> = {
  mysql: { label: "MySQL", color: "#2563eb" },
  mariadb: { label: "MariaDB", color: "#0d9488" },
  postgres: { label: "PG", color: "#4f46e5" },
};

function createEmptyProfile(kind: DbKind, folder: string | null = null): ConnectionProfile {
  const now = new Date().toISOString();
  const isPg = kind === "postgres";
  return {
    id: `conn-${Date.now()}`,
    name:
      kind === "mysql"
        ? "New MySQL Site"
        : kind === "mariadb"
        ? "New MariaDB Site"
        : "New PostgreSQL Site",
    groupName: folder,
    dbKind: kind,
    host: "127.0.0.1",
    port: isPg ? 5432 : 3306,
    initialDatabase: isPg ? "postgres" : null,
    username: isPg ? "postgres" : "root",
    password: "",
    savePassword: true,
    color: kind === "mysql" ? "#2563eb" : kind === "mariadb" ? "#0d9488" : "#4f46e5",
    encoding: isPg ? "UTF8" : "utf8mb4",
    keepaliveSecs: 60,
    connectTimeoutSecs: 10,
    autoConnect: false,
    ssl: {
      useSsl: false,
      mode: "prefer",
      caCertPath: null,
      clientCertPath: null,
      clientKeyPath: null,
    },
    ssh: {
      useSsh: false,
      host: "",
      port: 22,
      username: "",
      authMethod: "password",
      password: null,
      privateKeyPath: null,
      passphrase: null,
    },
    httpTunnel: {
      useHttpTunnel: false,
      url: "",
      encodeBase64: true,
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function ConnectionModal({
  open,
  editingProfile,
  defaultDbKind = "mysql",
  onClose,
}: ConnectionModalProps) {
  const {
    profiles,
    folders,
    theme,
    language,
    showSiteManagerOnStartup,
    setShowSiteManagerOnStartup,
    saveProfile,
    deleteProfile,
    duplicateProfile,
    connectProfile,
    createFolder,
    deleteFolder,
    moveProfileToFolder,
    importSitesFromYaml,
    exportSitesToYamlText,
  } = useWorkbenchStore();

  const [selection, setSelection] = useState<TreeSelection>({ kind: "newSite" });
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    Local: true,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<ModalTab>("general");
  const [draft, setDraft] = useState<ConnectionProfile>(() =>
    createEmptyProfile(defaultDbKind)
  );
  const [showPassword, setShowPassword] = useState(false);

  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [notice, setNotice] = useState<{ type: "info" | "error"; text: string } | null>(
    null
  );

  const [toolsOpen, setToolsOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [engineMenuOpen, setEngineMenuOpen] = useState(false);
  const [saveSshSecret, setSaveSshSecret] = useState(true);
  const [subPrompt, setSubPrompt] = useState<SubPromptState>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const sshKeyInputRef = useRef<HTMLInputElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const manageRef = useRef<HTMLDivElement>(null);
  const engineMenuRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const isMac = isMacOS();
  const isDark = theme === "dark";

  // Initialize selection when Site Manager opens
  useEffect(() => {
    if (!open) return;
    setTestResult(null);
    setNotice(null);
    setActiveTab("general");

    const nextExpanded: Record<string, boolean> = {};
    for (const f of folders) nextExpanded[f] = true;
    for (const p of profiles) {
      if (p.groupName) nextExpanded[p.groupName] = true;
    }
    setExpandedFolders(nextExpanded);

    if (editingProfile) {
      setSelection({ kind: "site", siteId: editingProfile.id });
      setDraft({ ...editingProfile });
    } else if (profiles.length > 0) {
      const first = profiles[0];
      setSelection({ kind: "site", siteId: first.id });
      setDraft({ ...first });
    } else {
      setSelection({ kind: "newSite" });
      setDraft(createEmptyProfile(defaultDbKind, folders[0] ?? null));
    }
  }, [open, editingProfile, defaultDbKind]);

  // Close dropdowns on outside click
  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (toolsRef.current && !toolsRef.current.contains(target)) setToolsOpen(false);
      if (manageRef.current && !manageRef.current.contains(target)) setManageOpen(false);
      if (engineMenuRef.current && !engineMenuRef.current.contains(target)) setEngineMenuOpen(false);
      if (contextMenuRef.current && !contextMenuRef.current.contains(target)) {
        setContextMenu(null);
      }
    };
    window.addEventListener("mousedown", handleOutside);
    return () => window.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const allFolders = useMemo(() => {
    const set = new Set<string>(folders);
    for (const p of profiles) {
      if (p.groupName?.trim()) set.add(p.groupName.trim());
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [folders, profiles]);

  const filteredProfiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.host.toLowerCase().includes(q) ||
        p.username.toLowerCase().includes(q) ||
        p.dbKind.toLowerCase().includes(q) ||
        (p.groupName?.toLowerCase().includes(q) ?? false)
    );
  }, [profiles, searchQuery]);

  const rootSites = useMemo(
    () => filteredProfiles.filter((p) => !p.groupName || !p.groupName.trim()),
    [filteredProfiles]
  );

  const folderChildren = useMemo(() => {
    if (selection.kind !== "folder") return [];
    return profiles.filter((p) => (p.groupName ?? "") === selection.folder);
  }, [profiles, selection]);

  if (!open) return null;

  const isSavedSite = selection.kind === "site";

  const selectSiteById = (siteId: string) => {
    const found = profiles.find((p) => p.id === siteId);
    if (!found) return;
    setSelection({ kind: "site", siteId: found.id });
    setDraft({ ...found });
    setTestResult(null);
    setNotice(null);
  };

  const selectNewSiteInFolder = (folder: string | null = draft.groupName ?? null) => {
    setSelection({ kind: "newSite" });
    setDraft(createEmptyProfile(defaultDbKind, folder));
    setTestResult(null);
    setNotice(null);
  };

  const handleDbKindChange = (nextKind: DbKind) => {
    const prevIsPg = draft.dbKind === "postgres";
    const nextIsPg = nextKind === "postgres";
    setDraft((prev) => ({
      ...prev,
      dbKind: nextKind,
      color:
        nextKind === "mysql"
          ? "#2563eb"
          : nextKind === "mariadb"
          ? "#0d9488"
          : "#4f46e5",
      port:
        prev.port === (prevIsPg ? 5432 : 3306)
          ? nextIsPg
            ? 5432
            : 3306
          : prev.port,
      username:
        prev.username === (prevIsPg ? "postgres" : "root")
          ? nextIsPg
            ? "postgres"
            : "root"
          : prev.username,
      initialDatabase:
        prevIsPg && !nextIsPg && prev.initialDatabase === "postgres"
          ? null
          : !prevIsPg && nextIsPg && !prev.initialDatabase
          ? "postgres"
          : prev.initialDatabase,
      encoding: nextIsPg ? "UTF8" : "utf8mb4",
    }));
  };

  const handleSaveDraft = async (opts?: {
    nameOverride?: string;
    folderOverride?: string | null;
    asNew?: boolean;
  }): Promise<ConnectionProfile | null> => {
    const name = (opts?.nameOverride ?? draft.name).trim() || `${draft.username}@${draft.host}`;
    const groupName =
      opts?.folderOverride !== undefined
        ? opts.folderOverride
        : draft.groupName?.trim() || null;

    if (!draft.host.trim()) {
      setNotice({
        type: "error",
        text: language === "en" ? "Please enter host or IP address" : "請輸入主機名稱或 IP 位址",
      });
      return null;
    }

    setSaving(true);
    try {
      if (groupName) createFolder(groupName);
      const payload: ConnectionProfile = {
        ...draft,
        id:
          opts?.asNew || selection.kind === "newSite"
            ? `conn-${Date.now()}`
            : draft.id,
        name,
        groupName,
      };
      const saved = await saveProfile(payload);
      setSelection({ kind: "site", siteId: saved.id });
      setDraft({ ...saved });
      setNotice({
        type: "info",
        text: language === "en" ? `Saved site "${saved.name}"` : `已儲存站台「${saved.name}」`,
      });
      return saved;
    } catch (err) {
      setNotice({
        type: "error",
        text: language === "en" ? `Save failed: ${String(err)}` : `儲存失敗：${String(err)}`,
      });
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleConnect = (useDemo: boolean) => {
    setNotice(null);
    const targetId =
      selection.kind === "newSite" ? `adhoc-${Date.now()}` : draft.id;
    const fallbackName =
      draft.name.trim() ||
      (draft.host.trim() ? `${draft.host.trim()}:${draft.port}` : "Untitled");
    const payload: ConnectionProfile = {
      ...draft,
      id: targetId,
      name: fallbackName,
      groupName: draft.groupName?.trim() || null,
    };
    onClose();
    void connectProfile(payload.id, useDemo, payload);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await tauriApi.testConnection(draft);
      setTestResult(res);
    } catch (err) {
      setTestResult({
        success: false,
        dbKind: draft.dbKind,
        serverVersion: null,
        latencyMs: 0,
        message: String(err),
      });
    } finally {
      setTesting(false);
    }
  };

  const handleDeleteCurrentSite = async () => {
    if (selection.kind !== "site") return;
    const targetId = selection.siteId;
    await deleteProfile(targetId);
    const remaining = useWorkbenchStore.getState().profiles;
    if (remaining.length > 0) {
      setSelection({ kind: "site", siteId: remaining[0].id });
      setDraft({ ...remaining[0] });
    } else {
      selectNewSiteInFolder(null);
    }
    setNotice({
      type: "info",
      text: language === "en" ? "Site deleted" : "已刪除站台",
    });
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const count = await importSitesFromYaml(text);
      setNotice({
        type: "info",
        text:
          language === "en"
            ? `Imported ${count} site(s) from ${file.name}!`
            : `成功從 ${file.name} 匯入 ${count} 個站台！`,
      });
    } catch (err) {
      setNotice({
        type: "error",
        text:
          language === "en"
            ? `YAML import failed: ${String(err)}`
            : `YAML 匯入失敗：${String(err)}`,
      });
    }
  };

  const baseInputCls = `${
    isMac ? "h-[30px] px-2.5 rounded-md" : "h-[26px] px-2 rounded"
  } border text-xs outline-none ${
    isDark
      ? "bg-[#1c1c1e] border-[#3f3f46] text-[#f4f4f5] focus:border-[#38bdf8]"
      : "bg-white border-[#cbd5e1] text-[#1f2329] focus:border-[#2563eb]"
  }`;

  const inputCls = `w-full ${baseInputCls}`;

  const dialogBtnCls = `${
    isMac ? "h-[30px] px-3 rounded-lg" : "h-[26px] px-2.5 rounded"
  } border text-xs whitespace-nowrap inline-flex items-center justify-center gap-1.5 transition-colors ${
    isDark
      ? "bg-[#2c2c30] border-[#45454a] text-[#e4e4e7] hover:bg-[#3a3a40] disabled:opacity-45"
      : "bg-white border-[#cbd5e1] text-[#1f2329] hover:bg-[#eff6ff] hover:border-[#93c5fd] disabled:opacity-45"
  }`;

  const tabItems: { id: ModalTab; label: string }[] = [
    { id: "general", label: t(language, "tabGeneral") },
    { id: "ssl", label: t(language, "tabSsl") },
    { id: "ssh", label: t(language, "tabSsh") },
    { id: "http", label: t(language, "tabHttp") },
    { id: "advanced", label: t(language, "tabAdvanced") },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[1px] select-none">
      <div
        className={`flex w-[860px] max-w-full flex-col overflow-hidden border shadow-2xl text-xs ${
          isMac ? "rounded-xl" : "rounded-md"
        } ${
          isDark
            ? "border-[#3f3f46] bg-[#242427] text-[#f4f4f5]"
            : "border-[#cbd5e1] bg-[#f1f5f9] text-[#1f2329]"
        }`}
      >
        {/* Top Title Bar */}
        <div
          className={`flex items-center justify-between border-b px-3.5 py-2 ${
            isDark
              ? "border-[#333338] bg-[#1c1c1f]"
              : isMac
              ? "border-black/10 bg-[#ececed]"
              : "border-[#dcdfe6] bg-white"
          }`}
        >
          <div className="flex items-center gap-2 font-semibold">
            <Database
              className={`h-4 w-4 ${
                isDark ? "text-[#38bdf8]" : isMac ? "text-[#007aff]" : "text-[#2563eb]"
              }`}
            />
            <span>{t(language, "siteManagerTitle")} — SqlCraft</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`p-1 opacity-70 hover:opacity-100 ${
              isMac ? "rounded-full hover:bg-black/10" : "rounded hover:bg-black/10"
            }`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Hidden File Input for YAML Import */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".yml,.yaml"
          className="hidden"
          onChange={handleFileImport}
        />

        {/* Dual-Pane Body: Left Folder/Site Tree + Right Site Settings */}
        <div className="flex h-[480px] min-h-0 gap-3 p-3">
          {/* LEFT PANE: Folders & Sites Tree */}
          <div className="flex w-[268px] shrink-0 flex-col min-h-0">
            <div
              className={`flex flex-1 flex-col min-h-0 overflow-hidden border ${
                isMac ? "rounded-lg" : "rounded"
              } ${
                isDark ? "border-[#3f3f46] bg-[#1c1c1e]" : "border-[#cbd5e1] bg-white"
              }`}
            >
              {/* Top New Site + New Folder Bar */}
              <div
                className={`flex items-center gap-1 border-b p-1.5 ${
                  isDark ? "border-[#2c2c30] bg-[#222225]" : "border-[#e2e8f0] bg-[#f8fafc]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => selectNewSiteInFolder(draft.groupName ?? null)}
                  className={`flex flex-1 items-center gap-1.5 px-2 py-1 text-left font-medium ${
                    isMac ? "rounded-md" : "rounded"
                  } ${
                    selection.kind === "newSite"
                      ? "bg-[#2563eb] text-white"
                      : isDark
                      ? "text-[#e4e4e7] hover:bg-white/10"
                      : "text-[#1f2329] hover:bg-[#eff6ff]"
                  }`}
                >
                  <Plus className="h-3.5 w-3.5 text-[#38bdf8]" />
                  <span className="truncate">{t(language, "newSite")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSubPrompt({ kind: "newFolder", name: "" })}
                  title={t(language, "newFolder")}
                  className={`border px-2 py-1 ${
                    isMac ? "rounded-md" : "rounded"
                  } ${
                    isDark
                      ? "border-[#3f3f46] text-[#eab308] hover:bg-white/10"
                      : "border-[#cbd5e1] text-[#d97706] hover:bg-[#eff6ff]"
                  }`}
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Scrollable Folder & Site Tree */}
              <div
                className="flex-1 overflow-y-auto p-1.5 space-y-0.5"
                onContextMenu={(e) => {
                  if (e.target === e.currentTarget) {
                    e.preventDefault();
                    setContextMenu({
                      x: e.clientX,
                      y: e.clientY,
                      target: { kind: "empty" },
                    });
                  }
                }}
              >
                {allFolders.map((folder) => {
                  const expanded =
                    expandedFolders[folder] ?? Boolean(searchQuery.trim());
                  const isFolderSelected =
                    selection.kind === "folder" && selection.folder === folder;
                  const children = filteredProfiles.filter(
                    (p) => (p.groupName ?? "") === folder
                  );

                  return (
                    <div key={folder}>
                      <div
                        onClick={() => setSelection({ kind: "folder", folder })}
                        onDoubleClick={() =>
                          setExpandedFolders((prev) => ({
                            ...prev,
                            [folder]: !expanded,
                          }))
                        }
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSelection({ kind: "folder", folder });
                          setContextMenu({
                            x: e.clientX,
                            y: e.clientY,
                            target: { kind: "folder", folder },
                          });
                        }}
                        className={`flex cursor-pointer items-center gap-1 px-1.5 py-1 ${
                          isMac ? "rounded-md" : "rounded"
                        } ${
                          isFolderSelected
                            ? "bg-[#2563eb] text-white font-medium"
                            : isDark
                            ? "text-[#e4e4e7] hover:bg-white/8"
                            : "text-[#1f2329] hover:bg-[#eff6ff]"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedFolders((prev) => ({
                              ...prev,
                              [folder]: !expanded,
                            }));
                          }}
                          className="p-0.5 opacity-80 hover:opacity-100"
                        >
                          {expanded ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronRight className="h-3 w-3" />
                          )}
                        </button>
                        {expanded ? (
                          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[#eab308]" />
                        ) : (
                          <Folder className="h-3.5 w-3.5 shrink-0 text-[#eab308]" />
                        )}
                        <span className="flex-1 truncate">{folder}</span>
                        <span className="text-[10px] opacity-65">({children.length})</span>
                      </div>

                      {expanded && (
                        <div
                          className={`ml-3.5 mt-0.5 space-y-0.5 border-l pl-2 ${
                            isDark ? "border-[#3f3f46]" : "border-[#cbd5e1]"
                          }`}
                        >
                          {children.map((site) => {
                            const selected =
                              selection.kind === "site" && selection.siteId === site.id;
                            return (
                              <div
                                key={site.id}
                                onClick={() => selectSiteById(site.id)}
                                onDoubleClick={() => {
                                  selectSiteById(site.id);
                                  void connectProfile(site.id, false).then((ok) => {
                                    if (ok) onClose();
                                  });
                                }}
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  selectSiteById(site.id);
                                  setContextMenu({
                                    x: e.clientX,
                                    y: e.clientY,
                                    target: { kind: "site", site },
                                  });
                                }}
                                className={`flex cursor-pointer items-center gap-1.5 px-2 py-1 ${
                                  isMac ? "rounded-md" : "rounded"
                                } ${
                                  selected
                                    ? "bg-[#2563eb] text-white font-medium"
                                    : isDark
                                    ? "text-[#d4d4d8] hover:bg-white/8"
                                    : "text-[#334155] hover:bg-[#eff6ff]"
                                }`}
                              >
                                <DbEngineIcon kind={site.dbKind} size={16} />
                                <span className="flex-1 truncate">{site.name}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Root Sites (no folder) */}
                {rootSites.map((site) => {
                  const selected =
                    selection.kind === "site" && selection.siteId === site.id;
                  return (
                    <div
                      key={site.id}
                      onClick={() => selectSiteById(site.id)}
                      onDoubleClick={() => {
                        selectSiteById(site.id);
                        void connectProfile(site.id, false).then((ok) => {
                          if (ok) onClose();
                        });
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        selectSiteById(site.id);
                        setContextMenu({
                          x: e.clientX,
                          y: e.clientY,
                          target: { kind: "site", site },
                        });
                      }}
                      className={`flex cursor-pointer items-center gap-1.5 px-2 py-1 ${
                        isMac ? "rounded-md" : "rounded"
                      } ${
                        selected
                          ? "bg-[#2563eb] text-white font-medium"
                          : isDark
                          ? "text-[#d4d4d8] hover:bg-white/8"
                          : "text-[#334155] hover:bg-[#eff6ff]"
                      }`}
                    >
                      <DbEngineIcon kind={site.dbKind} size={16} />
                      <span className="flex-1 truncate">{site.name}</span>
                    </div>
                  );
                })}
              </div>

              {/* Search Bar at Bottom of Tree */}
              <div
                className={`flex items-center gap-1.5 border-t px-2 py-1.5 ${
                  isDark ? "border-[#2c2c30] bg-[#222225]" : "border-[#e2e8f0] bg-[#f8fafc]"
                }`}
              >
                <Search className="h-3.5 w-3.5 text-[#94a3b8] shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={language === "en" ? "Search site or host..." : "搜尋站台名稱或主機..."}
                  className="w-full bg-transparent text-[11px] outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="opacity-65 hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Bottom Left Buttons: Tools (YAML Import/Export) & Manage */}
            <div className="mt-2 flex items-center gap-2">
              <div ref={toolsRef} className="relative flex-1">
                <button
                  type="button"
                  onClick={() => setToolsOpen((v) => !v)}
                  className={`${dialogBtnCls} w-full justify-between`}
                >
                  <span>{language === "en" ? "Import / Export (YAML)" : "匯入 / 匯出 (YAML)"}</span>
                  <ChevronDown className="h-3 w-3 opacity-75" />
                </button>
                {toolsOpen && (
                  <div
                    className={`absolute bottom-full left-0 z-50 mb-1 w-60 border py-1 shadow-xl ${
                      isMac ? "rounded-lg" : "rounded"
                    } ${
                      isDark
                        ? "border-[#45454a] bg-[#252528] text-[#e4e4e7]"
                        : "border-[#cbd5e1] bg-white text-[#1f2329]"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setToolsOpen(false);
                        fileInputRef.current?.click();
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#eff6ff] hover:text-[#1d4ed8]"
                    >
                      <Upload className="h-3.5 w-3.5 text-[#0ea5e9]" />
                      <span>{language === "en" ? "Import from YAML (.yml)..." : "從 YAML 檔案匯入站台 (.yml)..."}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setToolsOpen(false);
                        setSubPrompt({ kind: "importYaml", text: "" });
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#eff6ff] hover:text-[#1d4ed8]"
                    >
                      <Plus className="h-3.5 w-3.5 text-[#10b981]" />
                      <span>{language === "en" ? "Paste YAML content..." : "貼上 YAML 內容匯入..."}</span>
                    </button>
                    <div className="my-1 border-t border-[#e2e8f0]" />
                    <button
                      type="button"
                      onClick={() => {
                        setToolsOpen(false);
                        setSubPrompt({
                          kind: "exportYaml",
                          text: exportSitesToYamlText(),
                        });
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#eff6ff] hover:text-[#1d4ed8]"
                    >
                      <Download className="h-3.5 w-3.5 text-[#2563eb]" />
                      <span>{language === "en" ? "Export all sites to YAML..." : "匯出全部站台為 YAML (.yml)..."}</span>
                    </button>
                  </div>
                )}
              </div>

              <div ref={manageRef} className="relative">
                <button
                  type="button"
                  onClick={() => setManageOpen((v) => !v)}
                  className={`${dialogBtnCls} justify-between`}
                >
                  <span>{language === "en" ? "Manage" : "管理"}</span>
                  <ChevronDown className="h-3 w-3 opacity-75" />
                </button>
                {manageOpen && (
                  <div
                    className={`absolute bottom-full right-0 z-50 mb-1 w-48 border py-1 shadow-xl ${
                      isMac ? "rounded-lg" : "rounded"
                    } ${
                      isDark
                        ? "border-[#45454a] bg-[#252528] text-[#e4e4e7]"
                        : "border-[#cbd5e1] bg-white text-[#1f2329]"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setManageOpen(false);
                        setSubPrompt({
                          kind: "saveAs",
                          name: draft.name || `${draft.username}@${draft.host}`,
                          folder: draft.groupName ?? "",
                        });
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#eff6ff]"
                    >
                      <span>{language === "en" ? "Save As New..." : "另存為新站台..."}</span>
                    </button>
                    <button
                      type="button"
                      disabled={!isSavedSite}
                      onClick={() => {
                        setManageOpen(false);
                        setSubPrompt({ kind: "rename", name: draft.name });
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#eff6ff] disabled:opacity-40"
                    >
                      <span>{language === "en" ? "Rename Site..." : "重新命名站台..."}</span>
                    </button>
                    <button
                      type="button"
                      disabled={!isSavedSite}
                      onClick={() => {
                        setManageOpen(false);
                        void duplicateProfile(draft);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#eff6ff] disabled:opacity-40"
                    >
                      <span>{language === "en" ? "Clone Site" : "複製站台 (Clone)"}</span>
                    </button>
                    <div className="my-1 border-t border-[#e2e8f0]" />
                    <button
                      type="button"
                      onClick={() => {
                        setManageOpen(false);
                        setSubPrompt({ kind: "newFolder", name: "" });
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#eff6ff]"
                    >
                      <span>{language === "en" ? "New Folder..." : "新增資料夾..."}</span>
                    </button>
                    <div className="my-1 border-t border-[#e2e8f0]" />
                    <button
                      type="button"
                      disabled={!isSavedSite}
                      onClick={() => {
                        setManageOpen(false);
                        void handleDeleteCurrentSite();
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[#dc2626] hover:bg-[#fef2f2] disabled:opacity-40"
                    >
                      <span>{language === "en" ? "Delete Selected Site" : "刪除選取站台"}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT PANE: Folder Overview OR Site Settings */}
          <div className="flex min-w-0 flex-1 flex-col min-h-0">
            {selection.kind === "folder" ? (
              <div
                className={`flex flex-1 flex-col border p-4 min-h-0 ${
                  isMac ? "rounded-lg" : "rounded"
                } ${
                  isDark ? "border-[#3f3f46] bg-[#1c1c1e]" : "border-[#cbd5e1] bg-white"
                }`}
              >
                <div className="mb-3 flex items-center justify-between border-b border-[#e2e8f0] pb-2.5">
                  <div className="flex items-center gap-2 font-semibold">
                    <FolderOpen className="h-4 w-4 text-[#eab308]" />
                    <span>
                      {language === "en" ? `Folder: ${selection.folder}` : `資料夾：${selection.folder}`}
                    </span>
                    <span className="text-[11px] font-normal text-[#64748b]">
                      {language === "en"
                        ? `(${folderChildren.length} sites)`
                        : `（共 ${folderChildren.length} 個站台）`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => selectNewSiteInFolder(selection.folder)}
                      className={dialogBtnCls}
                    >
                      <Plus className="h-3.5 w-3.5 text-[#2563eb]" />
                      <span>{language === "en" ? "New Site Here" : "在此新增站台"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const targetFolder = selection.folder;
                        void deleteFolder(targetFolder).then(() => {
                          selectNewSiteInFolder(null);
                        });
                      }}
                      className={`${dialogBtnCls} text-[#dc2626]`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>{language === "en" ? "Delete Folder" : "刪除資料夾"}</span>
                    </button>
                  </div>
                </div>

                <div className="grid flex-1 grid-cols-2 gap-2 overflow-y-auto content-start">
                  {folderChildren.length === 0 ? (
                    <div className="col-span-2 py-12 text-center text-[#94a3b8]">
                      {language === "en"
                        ? "No sites in this folder. Click \"New Site Here\" above."
                        : "此資料夾尚無站台，請點擊右上角「在此新增站台」。"}
                    </div>
                  ) : (
                    folderChildren.map((child) => {
                      const badge = DB_BADGE[child.dbKind] ?? DB_BADGE.mysql;
                      return (
                        <div
                          key={child.id}
                          onClick={() => selectSiteById(child.id)}
                          onDoubleClick={() => {
                            void connectProfile(child.id, false).then((ok) => {
                              if (ok) onClose();
                            });
                          }}
                          className={`flex cursor-pointer items-center gap-2.5 border p-2.5 transition ${
                            isMac ? "rounded-lg" : "rounded"
                          } ${
                            isDark
                              ? "border-[#3f3f46] bg-[#252528] hover:border-[#38bdf8]"
                              : "border-[#e2e8f0] bg-[#f8fafc] hover:border-[#2563eb]"
                          }`}
                        >
                          <DbEngineIcon kind={child.dbKind} size={24} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-semibold">{child.name}</div>
                            <div className="truncate font-mono text-[10px] text-[#64748b]">
                              {badge.label} · {child.username}@{child.host}:{child.port}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              <div
                className={`flex flex-1 flex-col overflow-hidden border min-h-0 ${
                  isMac ? "rounded-lg" : "rounded"
                } ${
                  isDark ? "border-[#3f3f46] bg-[#1c1c1e]" : "border-[#cbd5e1] bg-white"
                }`}
              >
                {/* Engine Switcher + Site Sub-Tabs Header */}
                <div
                  className={`flex items-center justify-between border-b px-3.5 py-2 ${
                    isDark ? "border-[#2c2c30] bg-[#222225]" : "border-[#e2e8f0] bg-[#f8fafc]"
                  }`}
                >
                  <div ref={engineMenuRef} className="relative flex items-center gap-2">
                    <span className="text-[11px] font-medium text-[#64748b]">{t(language, "engine")}:</span>
                    <button
                      type="button"
                      onClick={() => setEngineMenuOpen((v) => !v)}
                      className={`flex h-7 min-w-[164px] items-center justify-between gap-2 border px-2.5 text-xs font-semibold transition ${
                        isMac ? "rounded-md" : "rounded"
                      } ${
                        isDark
                          ? "border-[#3f3f46] bg-[#2c2c30] text-[#f4f4f5] hover:border-[#38bdf8]"
                          : "border-[#cbd5e1] bg-white text-[#1f2329] hover:border-[#2563eb]"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <DbEngineIcon kind={draft.dbKind} size={16} />
                        <span>{(DB_ENGINE_META[draft.dbKind] ?? DB_ENGINE_META.mysql).label}</span>
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                    </button>

                    {engineMenuOpen && (
                      <div
                        className={`absolute left-10 top-full z-50 mt-1 w-48 border py-1 shadow-xl text-xs ${
                          isMac ? "rounded-lg" : "rounded"
                        } ${
                          isDark
                            ? "border-[#45454a] bg-[#252528] text-[#f4f4f5]"
                            : "border-[#cbd5e1] bg-white text-[#1f2329]"
                        }`}
                      >
                        {(["mysql", "mariadb", "postgres"] as DbKind[]).map((kind) => {
                          const meta = DB_ENGINE_META[kind];
                          const active = draft.dbKind === kind;
                          return (
                            <button
                              key={kind}
                              type="button"
                              onClick={() => {
                                handleDbKindChange(kind);
                                setEngineMenuOpen(false);
                              }}
                              className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition ${
                                active
                                  ? "bg-[#2563eb] text-white font-semibold"
                                  : isDark
                                  ? "hover:bg-white/10"
                                  : "hover:bg-[#eff6ff]"
                              }`}
                            >
                              <DbEngineIcon kind={kind} size={16} />
                              <span className="flex-1">{meta.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Settings Sub-Tabs (一般連線 / SSL / SSH / HTTP / 進階) */}
                <div
                  className={`flex gap-1 border-b px-3.5 pt-1.5 ${
                    isDark ? "border-[#2c2c30] bg-[#202024]" : "border-[#e2e8f0] bg-[#eef2f6]"
                  }`}
                >
                  {tabItems.map((t) => {
                    const active = activeTab === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setActiveTab(t.id)}
                        className={`rounded-t px-3 py-1 text-[11px] font-medium transition ${
                          active
                            ? isDark
                              ? "border border-b-transparent border-[#3f3f46] bg-[#1c1c1e] text-[#38bdf8] -mb-[1px]"
                              : "border border-b-white border-[#cbd5e1] bg-white text-[#1d4ed8] -mb-[1px]"
                            : "text-[#64748b] hover:text-[#111827]"
                        }`}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>

                {/* Settings Form Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {activeTab === "general" && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-[1fr_190px] gap-3">
                        <div>
                          <label className="mb-1 block text-[11px] text-[#64748b]">
                            {t(language, "siteName")}
                          </label>
                          <input
                            type="text"
                            value={draft.name}
                            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                            placeholder="FoodCloud_Dev"
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] text-[#64748b]">
                            {t(language, "folder")}
                          </label>
                          <div className="flex items-center gap-1">
                            <select
                              value={draft.groupName ?? ""}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  groupName: e.target.value || null,
                                })
                              }
                              className={inputCls}
                            >
                              <option value="">{language === "en" ? "(Root / No Folder)" : "(根目錄 / 無資料夾)"}</option>
                              {allFolders.map((f) => (
                                <option key={f} value={f}>
                                  {f}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() =>
                                setSubPrompt({
                                  kind: "newFolder",
                                  name: "",
                                  assignToDraft: true,
                                })
                              }
                              title={t(language, "newFolder")}
                              className={`${dialogBtnCls} px-2 shrink-0`}
                            >
                              <FolderPlus className="h-3.5 w-3.5 text-[#eab308]" />
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-[1fr_110px] gap-3">
                        <div>
                          <label className="mb-1 block text-[11px] text-[#64748b]">
                            {t(language, "host")}
                          </label>
                          <input
                            type="text"
                            value={draft.host}
                            onChange={(e) => setDraft({ ...draft, host: e.target.value })}
                            placeholder="127.0.0.1"
                            className={`${inputCls} font-mono`}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] text-[#64748b]">
                            {t(language, "port")}
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={65535}
                            value={draft.port}
                            onChange={(e) =>
                              setDraft({ ...draft, port: Number(e.target.value) || 3306 })
                            }
                            className={`${inputCls} font-mono text-right`}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-[11px] text-[#64748b]">
                            {t(language, "username")}
                          </label>
                          <input
                            type="text"
                            value={draft.username}
                            onChange={(e) =>
                              setDraft({ ...draft, username: e.target.value })
                            }
                            className={`${inputCls} font-mono`}
                          />
                        </div>
                        <div>
                          <div className="mb-1 flex items-center justify-between text-[11px] text-[#64748b]">
                            <span>{t(language, "password")}</span>
                            <label className="flex items-center gap-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={draft.savePassword}
                                onChange={(e) =>
                                  setDraft({ ...draft, savePassword: e.target.checked })
                                }
                              />
                              <span>{t(language, "savePassword")}</span>
                            </label>
                          </div>
                          <div className="relative">
                            <input
                              type={showPassword ? "text" : "password"}
                              value={draft.password ?? ""}
                              onChange={(e) =>
                                setDraft({ ...draft, password: e.target.value })
                              }
                              placeholder="••••••••"
                              className={`${inputCls} pr-7`}
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword((v) => !v)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 opacity-60 hover:opacity-100"
                            >
                              {showPassword ? (
                                <EyeOff className="h-3.5 w-3.5" />
                              ) : (
                                <Eye className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="mb-1 block text-[11px] text-[#64748b]">
                          {t(language, "defaultDb")}
                        </label>
                        <input
                          type="text"
                          value={draft.initialDatabase ?? ""}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              initialDatabase: e.target.value.trim() || null,
                            })
                          }
                          placeholder={
                            draft.dbKind === "postgres" ? "postgres" : t(language, "leaveEmptyForAllDbs")
                          }
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                    </div>
                  )}

                  {activeTab === "ssl" && (
                    <div className="space-y-3">
                      <label className="flex items-center gap-2 font-medium">
                        <input
                          type="checkbox"
                          checked={draft.ssl.useSsl}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              ssl: { ...draft.ssl, useSsl: e.target.checked },
                            })
                          }
                        />
                        <span>
                          {language === "en"
                            ? "Enable SSL / TLS Encryption"
                            : "啟用 SSL / TLS 加密連線"}
                        </span>
                      </label>
                      <div className="grid grid-cols-[120px_1fr] items-center gap-2.5">
                        <span className="text-right text-[#64748b]">
                          {language === "en" ? "SSL Mode:" : "SSL 模式："}
                        </span>
                        <select
                          disabled={!draft.ssl.useSsl}
                          value={draft.ssl.mode}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              ssl: { ...draft.ssl, mode: e.target.value as SslMode },
                            })
                          }
                          className={inputCls}
                        >
                          <option value="disable">Disable</option>
                          <option value="prefer">Prefer</option>
                          <option value="require">Require</option>
                          <option value="verifyCa">Verify CA</option>
                          <option value="verifyFull">Verify Full</option>
                        </select>

                        <span className="text-right text-[#64748b]">
                          {language === "en" ? "CA Cert Path:" : "CA 憑證路徑："}
                        </span>
                        <input
                          type="text"
                          disabled={!draft.ssl.useSsl}
                          value={draft.ssl.caCertPath ?? ""}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              ssl: { ...draft.ssl, caCertPath: e.target.value || null },
                            })
                          }
                          placeholder="/path/to/ca-cert.pem"
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                    </div>
                  )}

                  {activeTab === "ssh" && (
                    <div className="space-y-4">
                      <label className="flex items-center gap-2 font-medium">
                        <input
                          type="checkbox"
                          checked={draft.ssh.useSsh}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              ssh: { ...draft.ssh, useSsh: e.target.checked },
                            })
                          }
                        />
                    <span>{t(language, "useSshTunnel")}</span>
                  </label>

                  <div className="grid grid-cols-[110px_1fr] items-center gap-x-3 gap-y-2.5">
                    <span className="text-right text-[#64748b]">{t(language, "sshHost")}：</span>
                        <input
                          type="text"
                          disabled={!draft.ssh.useSsh}
                          value={draft.ssh.host}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              ssh: { ...draft.ssh, host: e.target.value },
                            })
                          }
                          placeholder="52.187.189.200"
                          className={`${inputCls} font-mono disabled:opacity-50`}
                        />

                        <span className="text-right text-[#64748b]">{t(language, "sshPort")}：</span>
                        <input
                          type="number"
                          min={1}
                          max={65535}
                          disabled={!draft.ssh.useSsh}
                          value={draft.ssh.port}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              ssh: { ...draft.ssh, port: Number(e.target.value) || 22 },
                            })
                          }
                          className={`${baseInputCls} w-28 font-mono disabled:opacity-50`}
                        />

                        <span className="text-right text-[#64748b]">{t(language, "sshUsername")}：</span>
                        <input
                          type="text"
                          disabled={!draft.ssh.useSsh}
                          value={draft.ssh.username}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              ssh: { ...draft.ssh, username: e.target.value },
                            })
                          }
                          placeholder="azureuser"
                          className={`${inputCls} font-mono disabled:opacity-50`}
                        />

                        <span className="text-right text-[#64748b]">{t(language, "sshAuthMethod")}：</span>
                        <select
                          disabled={!draft.ssh.useSsh}
                          value={draft.ssh.authMethod}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              ssh: {
                                ...draft.ssh,
                                authMethod: e.target.value as SshAuthMethod,
                              },
                            })
                          }
                          className={`${baseInputCls} w-44 disabled:opacity-50`}
                        >
                          <option value="password">{t(language, "sshAuthPassword")}</option>
                          <option value="privateKey">{t(language, "sshAuthPrivateKey")}</option>
                          <option value="passwordAndPrivateKey">{t(language, "sshAuthBoth")}</option>
                        </select>

                        {(draft.ssh.authMethod === "password" ||
                          draft.ssh.authMethod === "passwordAndPrivateKey") && (
                          <>
                            <span className="text-right text-[#64748b]">{t(language, "password")}：</span>
                            <input
                              type="password"
                              disabled={!draft.ssh.useSsh}
                              value={draft.ssh.password ?? ""}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  ssh: { ...draft.ssh, password: e.target.value },
                                })
                              }
                              placeholder="••••••••"
                              className={`${inputCls} font-mono disabled:opacity-50`}
                            />
                          </>
                        )}

                        {(draft.ssh.authMethod === "privateKey" ||
                          draft.ssh.authMethod === "passwordAndPrivateKey") && (
                          <>
                            <span className="text-right text-[#64748b]">{t(language, "sshPrivateKey")}：</span>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                disabled={!draft.ssh.useSsh}
                                value={draft.ssh.privateKeyPath ?? ""}
                                onChange={(e) =>
                                  setDraft({
                                    ...draft,
                                    ssh: {
                                      ...draft.ssh,
                                      privateKeyPath: e.target.value,
                                    },
                                  })
                                }
                                placeholder="/Users/zack/.ssh/id_ed25519"
                                className={`${inputCls} flex-1 font-mono disabled:opacity-50`}
                              />
                              <input
                                ref={sshKeyInputRef}
                                type="file"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    setDraft({
                                      ...draft,
                                      ssh: {
                                        ...draft.ssh,
                                        privateKeyPath:
                                          (file as File & { path?: string }).path ||
                                          `~/.ssh/${file.name}`,
                                      },
                                    });
                                  }
                                  e.target.value = "";
                                }}
                              />
                              <button
                                type="button"
                                disabled={!draft.ssh.useSsh}
                                onClick={() => sshKeyInputRef.current?.click()}
                                title={language === "en" ? "Choose private key file" : "選擇私密金鑰檔案"}
                                className={`${dialogBtnCls} px-2.5`}
                              >
                                ...
                              </button>
                            </div>

                            <span className="text-right text-[#64748b]">{t(language, "sshPassphrase")}：</span>
                            <input
                              type="password"
                              disabled={!draft.ssh.useSsh}
                              value={draft.ssh.passphrase ?? ""}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  ssh: { ...draft.ssh, passphrase: e.target.value },
                                })
                              }
                              placeholder="••••••••"
                              className={`${inputCls} font-mono disabled:opacity-50`}
                            />
                          </>
                        )}

                        <span />
                        <label className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            disabled={!draft.ssh.useSsh}
                            checked={saveSshSecret}
                            onChange={(e) => setSaveSshSecret(e.target.checked)}
                          />
                          <span>
                            {draft.ssh.authMethod === "password"
                              ? t(language, "savePassword")
                              : draft.ssh.authMethod === "privateKey"
                              ? t(language, "sshSavePassphrase")
                              : t(language, "sshSaveBoth")}
                          </span>
                        </label>
                      </div>
                    </div>
                  )}

                  {activeTab === "http" && (
                    <div className="space-y-3">
                      <label className="flex items-center gap-2 font-medium">
                        <input
                          type="checkbox"
                          checked={draft.httpTunnel.useHttpTunnel}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              httpTunnel: {
                                ...draft.httpTunnel,
                                useHttpTunnel: e.target.checked,
                              },
                            })
                          }
                        />
                        <span>
                          {language === "en"
                            ? "Use HTTP Tunnel (Navicat ntunnel compatible)"
                            : "使用 HTTP 通道 (Navicat ntunnel 相容)"}
                        </span>
                      </label>
                      <div>
                        <label className="mb-1 block text-[11px] text-[#64748b]">
                          {language === "en" ? "Tunnel URL:" : "通道網址 (Tunnel URL)："}
                        </label>
                        <input
                          type="text"
                          disabled={!draft.httpTunnel.useHttpTunnel}
                          value={draft.httpTunnel.url}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              httpTunnel: { ...draft.httpTunnel, url: e.target.value },
                            })
                          }
                          placeholder="https://example.com/ntunnel_mysql.php"
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                    </div>
                  )}

                  {activeTab === "advanced" && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-[11px] text-[#64748b]">
                          {language === "en" ? "Encoding" : "連線字元編碼 (Encoding)"}
                        </label>
                        <input
                          type="text"
                          value={draft.encoding ?? "utf8mb4"}
                          onChange={(e) =>
                            setDraft({ ...draft, encoding: e.target.value })
                          }
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] text-[#64748b]">
                          {language === "en" ? "Connect Timeout (sec)" : "連線逾時 (秒)"}
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={300}
                          value={draft.connectTimeoutSecs}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              connectTimeoutSecs: Number(e.target.value) || 10,
                            })
                          }
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] text-[#64748b]">
                          {language === "en" ? "Keepalive Interval (sec)" : "Keepalive 間隔 (秒)"}
                        </label>
                        <input
                          type="number"
                          min={5}
                          max={600}
                          value={draft.keepaliveSecs}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              keepaliveSecs: Number(e.target.value) || 60,
                            })
                          }
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                    </div>
                  )}

                  {activeTab === "general" && testResult && (
                    <div
                      className={`flex items-start gap-2 rounded border p-2.5 text-[11px] ${
                        testResult.success
                          ? "border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]"
                          : "border-[#fecaca] bg-[#fef2f2] text-[#991b1b]"
                      }`}
                    >
                      {testResult.success ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                      ) : (
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">
                          {testResult.success
                            ? language === "en"
                              ? "Connection Succeeded"
                              : "連線測試成功"
                            : language === "en"
                            ? "Connection Test Message"
                            : "連線測試訊息"}{" "}
                          ({testResult.latencyMs} ms)
                        </div>
                        <div className="mt-0.5 break-all font-mono">
                          {testResult.message}
                        </div>
                      </div>
                    </div>
                  )}

                  {notice && (
                    <div
                      className={`flex items-center justify-between rounded border px-2.5 py-1.5 text-[11px] ${
                        notice.type === "error"
                          ? "border-[#fecaca] bg-[#fef2f2] text-[#991b1b]"
                          : "border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]"
                      }`}
                    >
                      <span className="truncate">{notice.text}</span>
                      <button
                        type="button"
                        onClick={() => setNotice(null)}
                        className="opacity-70 hover:opacity-100"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Action Bar inside Right Pane */}
                <div
                  className={`flex items-center justify-between border-t px-3.5 py-2 ${
                    isDark ? "border-[#2c2c30] bg-[#222225]" : "border-[#e2e8f0] bg-[#f8fafc]"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void handleSaveDraft()}
                      className={`${dialogBtnCls} font-medium`}
                    >
                      <Edit3 className="h-3.5 w-3.5 text-[#2563eb]" />
                      <span>{saving ? "..." : t(language, "saveSite")}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSubPrompt({
                          kind: "saveAs",
                          name: draft.name || `${draft.username}@${draft.host}`,
                          folder: draft.groupName ?? "",
                        })
                      }
                      className={dialogBtnCls}
                    >
                      <span>{t(language, "saveAsNew")}</span>
                    </button>
                    {isSavedSite && (
                      <button
                        type="button"
                        onClick={() => void handleDeleteCurrentSite()}
                        className={`${dialogBtnCls} text-[#dc2626]`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>{t(language, "delete")}</span>
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={testing}
                    onClick={() => void handleTest()}
                    className={dialogBtnCls}
                  >
                    {testing && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#2563eb]" />
                    )}
                    <span>{testing ? t(language, "testingConnection") : t(language, "testConnection")}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Dialog Bar */}
        <div
          className={`flex items-center justify-between border-t px-4 py-2.5 ${
            isDark
              ? "border-[#333338] bg-[#1c1c1f]"
              : isMac
              ? "border-black/10 bg-[#ececed]"
              : "border-[#dcdfe6] bg-[#e8eef5]"
          }`}
        >
          <label className="flex items-center gap-2 text-[11px] cursor-pointer">
            <input
              type="checkbox"
              checked={showSiteManagerOnStartup}
              onChange={(e) => setShowSiteManagerOnStartup(e.target.checked)}
            />
            <span>{t(language, "showSiteManagerOnStartup")}</span>
          </label>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={selection.kind === "folder"}
              onClick={() => void handleConnect(false)}
              className={`inline-flex items-center gap-1.5 bg-[#2563eb] px-4 py-1.5 font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-45 ${
                isMac ? "rounded-lg" : "rounded"
              }`}
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>{t(language, "loginConnect")}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className={dialogBtnCls}
            >
              <span>{t(language, "close")}</span>
            </button>
          </div>
        </div>

        {/* Sub-Prompts (New Folder, Rename, Save As, YAML Import/Export) */}
        {subPrompt && (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setSubPrompt(null);
            }}
          >
            <div
              className={`w-[460px] max-w-full border p-4 shadow-2xl space-y-3 text-xs ${
                isMac ? "rounded-xl" : "rounded-md"
              } ${
                isDark
                  ? "border-[#45454a] bg-[#252528] text-[#f4f4f5]"
                  : "border-[#cbd5e1] bg-white text-[#1f2329]"
              }`}
            >
              {subPrompt.kind === "newFolder" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const trimmed = subPrompt.name.trim().replace(/^\/+|\/+$/g, "");
                    if (!trimmed) return;
                    createFolder(trimmed);
                    setExpandedFolders((prev) => ({ ...prev, [trimmed]: true }));
                    if (subPrompt.assignToDraft) {
                      setDraft((prev) => ({ ...prev, groupName: trimmed }));
                    } else {
                      setSelection({ kind: "folder", folder: trimmed });
                    }
                    setSubPrompt(null);
                  }}
                  className="space-y-3"
                >
                  <div className="flex items-center gap-2 font-semibold">
                    <FolderPlus className="h-4 w-4 text-[#eab308]" />
                    <span>{language === "en" ? "New Site Folder" : "新增站台資料夾"}</span>
                  </div>
                  <input
                    autoFocus
                    type="text"
                    value={subPrompt.name}
                    onChange={(e) =>
                      setSubPrompt({ ...subPrompt, name: e.target.value })
                    }
                    placeholder={
                      language === "en"
                        ? "e.g. Production / Staging / Local"
                        : "例如：Production / Staging / Local"
                    }
                    className={inputCls}
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setSubPrompt(null)}
                      className={dialogBtnCls}
                    >
                      {t(language, "cancel")}
                    </button>
                    <button
                      type="submit"
                      className="rounded bg-[#2563eb] px-4 py-1 text-white hover:bg-[#1d4ed8]"
                    >
                      {language === "en" ? "Create Folder" : "建立資料夾"}
                    </button>
                  </div>
                </form>
              )}

              {subPrompt.kind === "rename" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleSaveDraft({ nameOverride: subPrompt.name }).then(() =>
                      setSubPrompt(null)
                    );
                  }}
                  className="space-y-3"
                >
                  <div className="font-semibold">
                    {language === "en" ? "Rename Site" : "重新命名站台"}
                  </div>
                  <input
                    autoFocus
                    type="text"
                    value={subPrompt.name}
                    onChange={(e) =>
                      setSubPrompt({ ...subPrompt, name: e.target.value })
                    }
                    className={inputCls}
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setSubPrompt(null)}
                      className={dialogBtnCls}
                    >
                      {t(language, "cancel")}
                    </button>
                    <button
                      type="submit"
                      className="rounded bg-[#2563eb] px-4 py-1 text-white hover:bg-[#1d4ed8]"
                    >
                      {language === "en" ? "Confirm" : "確定"}
                    </button>
                  </div>
                </form>
              )}

              {subPrompt.kind === "saveAs" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleSaveDraft({
                      nameOverride: subPrompt.name,
                      folderOverride: subPrompt.folder.trim() || null,
                      asNew: true,
                    }).then(() => setSubPrompt(null));
                  }}
                  className="space-y-3"
                >
                  <div className="font-semibold">
                    {language === "en" ? "Save As New Site" : "另存為新站台"}
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-[#64748b]">
                      {t(language, "siteName")}
                    </label>
                    <input
                      autoFocus
                      type="text"
                      value={subPrompt.name}
                      onChange={(e) =>
                        setSubPrompt({ ...subPrompt, name: e.target.value })
                      }
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-[#64748b]">
                      {language === "en"
                        ? "Folder (or type a new folder name)"
                        : "所屬資料夾 (可輸入新資料夾名稱)"}
                    </label>
                    <input
                      type="text"
                      list="sqlcraft-folder-datalist"
                      value={subPrompt.folder}
                      onChange={(e) =>
                        setSubPrompt({ ...subPrompt, folder: e.target.value })
                      }
                      placeholder={
                        language === "en" ? "(Leave blank for root)" : "(留空代表根目錄)"
                      }
                      className={inputCls}
                    />
                    <datalist id="sqlcraft-folder-datalist">
                      {allFolders.map((f) => (
                        <option key={f} value={f} />
                      ))}
                    </datalist>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setSubPrompt(null)}
                      className={dialogBtnCls}
                    >
                      {t(language, "cancel")}
                    </button>
                    <button
                      type="submit"
                      className="rounded bg-[#2563eb] px-4 py-1 text-white hover:bg-[#1d4ed8]"
                    >
                      {t(language, "save")}
                    </button>
                  </div>
                </form>
              )}

              {subPrompt.kind === "importYaml" && (
                <div className="space-y-3">
                  <div className="font-semibold">
                    {language === "en" ? "Import Sites from YAML" : "從 YAML 匯入站台設定"}
                  </div>
                  <textarea
                    rows={9}
                    value={subPrompt.text}
                    onChange={(e) =>
                      setSubPrompt({ ...subPrompt, text: e.target.value })
                    }
                    placeholder={
                      "version: 1\nfolders:\n  - Production\nsites:\n  - name: FoodCloud_Dev\n    folder: Production\n    dbKind: mysql\n    host: 127.0.0.1\n    port: 3306\n    username: root"
                    }
                    className={`w-full rounded border p-2 font-mono text-[11px] outline-none ${
                      isDark
                        ? "border-[#3f3f46] bg-[#1c1c1e]"
                        : "border-[#cbd5e1] bg-[#f8fafc]"
                    }`}
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setSubPrompt(null)}
                      className={dialogBtnCls}
                    >
                      {t(language, "cancel")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void importSitesFromYaml(subPrompt.text)
                          .then((count) => {
                            setNotice({
                              type: "info",
                              text:
                                language === "en"
                                  ? `Imported ${count} site(s)!`
                                  : `已成功匯入 ${count} 個站台！`,
                            });
                            setSubPrompt(null);
                          })
                          .catch((err) => {
                            setNotice({
                              type: "error",
                              text:
                                language === "en"
                                  ? `Import failed: ${String(err)}`
                                  : `匯入失敗：${String(err)}`,
                            });
                          });
                      }}
                      className="rounded bg-[#2563eb] px-4 py-1 text-white hover:bg-[#1d4ed8]"
                    >
                      {language === "en" ? "Import" : "匯入"}
                    </button>
                  </div>
                </div>
              )}

              {subPrompt.kind === "exportYaml" && (
                <div className="space-y-3">
                  <div className="font-semibold">
                    {language === "en"
                      ? "Export Site Configuration (YAML)"
                      : "匯出站台設定檔 (YAML)"}
                  </div>
                  <p className="text-[11px] text-[#64748b]">
                    {language === "en"
                      ? "For security, exported YAML files do not include plaintext passwords."
                      : "基於安全性考量，匯出的 YAML 設定檔不會包含明文密碼。"}
                  </p>
                  <textarea
                    readOnly
                    rows={10}
                    value={subPrompt.text}
                    className={`w-full rounded border p-2 font-mono text-[11px] outline-none ${
                      isDark
                        ? "border-[#3f3f46] bg-[#1c1c1e]"
                        : "border-[#cbd5e1] bg-[#f8fafc]"
                    }`}
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const blob = new Blob([subPrompt.text], {
                          type: "text/yaml;charset=utf-8",
                        });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = "sqlcraft-sites.yml";
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className={dialogBtnCls}
                    >
                      <Download className="h-3.5 w-3.5 text-[#2563eb]" />
                      <span>
                        {language === "en" ? "Download sqlcraft-sites.yml" : "下載 sqlcraft-sites.yml"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void navigator.clipboard?.writeText(subPrompt.text)}
                      className={dialogBtnCls}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      <span>{language === "en" ? "Copy All" : "複製全部"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSubPrompt(null)}
                      className={dialogBtnCls}
                    >
                      {t(language, "close")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Right-Click Context Menu in Tree */}
        {contextMenu && (
          <div
            ref={contextMenuRef}
            style={{ left: contextMenu.x, top: contextMenu.y }}
            className={`fixed z-[65] min-w-[180px] border py-1 shadow-xl text-xs ${
              isMac ? "rounded-lg" : "rounded"
            } ${
              isDark
                ? "border-[#45454a] bg-[#252528] text-[#e4e4e7]"
                : "border-[#cbd5e1] bg-white text-[#1f2329]"
            }`}
          >
            {contextMenu.target.kind === "site" && (() => {
              const site = contextMenu.target.site;
              return (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setContextMenu(null);
                      void connectProfile(site.id, false).then((ok) => {
                        if (ok) onClose();
                      });
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-medium hover:bg-[#eff6ff]"
                  >
                    <LogIn className="h-3.5 w-3.5 text-[#2563eb]" />
                    <span>{t(language, "loginConnect")}</span>
                  </button>
                  <div className="my-1 border-t border-[#e2e8f0]" />
                  <button
                    type="button"
                    onClick={() => {
                      setContextMenu(null);
                      setSubPrompt({ kind: "rename", name: site.name });
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#eff6ff]"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    <span>{language === "en" ? "Rename..." : "重新命名..."}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setContextMenu(null);
                      void duplicateProfile(site);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#eff6ff]"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>{language === "en" ? "Clone Site" : "複製站台"}</span>
                  </button>
                  <div className="my-1 border-t border-[#e2e8f0]" />
                  <div className="px-3 py-1 text-[10px] text-[#94a3b8]">
                    {language === "en" ? "Move to Folder" : "移至資料夾"}
                  </div>
                  {site.groupName && (
                    <button
                      type="button"
                      onClick={() => {
                        setContextMenu(null);
                        void moveProfileToFolder(site.id, null);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1 text-left hover:bg-[#eff6ff]"
                    >
                      <span>{language === "en" ? "Move to Root" : "移至根目錄"}</span>
                    </button>
                  )}
                  {allFolders
                    .filter((f) => f !== (site.groupName ?? ""))
                    .map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => {
                          setContextMenu(null);
                          void moveProfileToFolder(site.id, f);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-1 text-left hover:bg-[#eff6ff]"
                      >
                        <Folder className="h-3.5 w-3.5 text-[#eab308]" />
                        <span className="truncate">{f}</span>
                      </button>
                    ))}
                  <div className="my-1 border-t border-[#e2e8f0]" />
                  <button
                    type="button"
                    onClick={() => {
                      setContextMenu(null);
                      void deleteProfile(site.id);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[#dc2626] hover:bg-[#fef2f2]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>{language === "en" ? "Delete Site" : "刪除站台"}</span>
                  </button>
                </>
              );
            })()}

            {contextMenu.target.kind === "folder" && (() => {
              const targetFolder = contextMenu.target.folder;
              return (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setContextMenu(null);
                      selectNewSiteInFolder(targetFolder);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#eff6ff]"
                  >
                    <Plus className="h-3.5 w-3.5 text-[#2563eb]" />
                    <span>{language === "en" ? "New Site Here" : "在此資料夾新增站台"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setContextMenu(null);
                      void deleteFolder(targetFolder);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[#dc2626] hover:bg-[#fef2f2]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>{language === "en" ? "Delete Folder" : "刪除資料夾"}</span>
                  </button>
                </>
              );
            })()}

            {contextMenu.target.kind === "empty" && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setContextMenu(null);
                    selectNewSiteInFolder(null);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#eff6ff]"
                >
                  <Plus className="h-3.5 w-3.5 text-[#2563eb]" />
                  <span>{t(language, "newSite")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setContextMenu(null);
                    setSubPrompt({ kind: "newFolder", name: "" });
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#eff6ff]"
                >
                  <FolderPlus className="h-3.5 w-3.5 text-[#eab308]" />
                  <span>{language === "en" ? "New Folder..." : "新增資料夾..."}</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
