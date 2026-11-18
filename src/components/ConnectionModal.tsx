import { useEffect, useState } from "react";
import { CheckCircle2, Database, Loader2, Shield, Terminal, X, XCircle } from "lucide-react";
import { tauriApi } from "../lib/tauri-api";
import type {
  ConnectionProfile,
  ConnectionTestResult,
  DbKind,
  SshAuthMethod,
  SslMode,
} from "../types/database";

interface ConnectionModalProps {
  open: boolean;
  editingProfile: ConnectionProfile | null;
  defaultDbKind?: DbKind;
  onClose: () => void;
  onSave: (profile: ConnectionProfile) => Promise<void>;
}

type ModalTab = "general" | "advanced" | "databases" | "ssl" | "ssh" | "http";

const COLOR_PRESETS = [
  "#2563eb",
  "#0d9488",
  "#4f46e5",
  "#16a34a",
  "#d97706",
  "#dc2626",
  "#9333ea",
  "#475569",
];

function createEmptyProfile(kind: DbKind): ConnectionProfile {
  const now = new Date().toISOString();
  const isPg = kind === "postgres";
  return {
    id: `conn-${Date.now()}`,
    name:
      kind === "mysql"
        ? "MySQL 連線"
        : kind === "mariadb"
        ? "MariaDB 連線"
        : "PostgreSQL 連線",
    groupName: "Local",
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
  onSave,
}: ConnectionModalProps) {
  const [activeTab, setActiveTab] = useState<ModalTab>("general");
  const [draft, setDraft] = useState<ConnectionProfile>(() =>
    createEmptyProfile(defaultDbKind)
  );
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setActiveTab("general");
    setTestResult(null);
    if (editingProfile) {
      setDraft({ ...editingProfile });
    } else {
      setDraft(createEmptyProfile(defaultDbKind));
    }
  }, [open, editingProfile, defaultDbKind]);

  if (!open) return null;

  const handleDbKindChange = (nextKind: DbKind) => {
    const prevIsPg = draft.dbKind === "postgres";
    const nextIsPg = nextKind === "postgres";
    setDraft((prev) => ({
      ...prev,
      dbKind: nextKind,
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim() || !draft.host.trim()) return;
    setSaving(true);
    try {
      await onSave(draft);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const tabItems: { id: ModalTab; label: string }[] = [
    { id: "general", label: "一般" },
    { id: "advanced", label: "進階" },
    { id: "databases", label: "資料庫" },
    { id: "ssl", label: "SSL" },
    { id: "ssh", label: "SSH" },
    { id: "http", label: "HTTP" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-[580px] flex-col overflow-hidden rounded-md border border-[#cbd5e1] bg-[#f8f9fb] shadow-2xl text-xs text-[#1f2329]"
      >
        {/* TitleBar */}
        <div className="flex h-9 items-center justify-between border-b border-[#dcdfe6] bg-white px-4">
          <div className="flex items-center gap-2 font-semibold text-[#111827]">
            <Database className="h-4 w-4 text-[#2563eb]" />
            <span>
              {editingProfile ? `編輯連線 — ${editingProfile.name}` : "新建連線"}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-[#6b7280] hover:bg-[#f1f5f9] hover:text-[#111827]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Engine Switcher */}
        <div className="flex items-center gap-2 border-b border-[#e2e8f0] bg-[#f1f5f9] px-4 py-2">
          <span className="text-[11px] font-medium text-[#475569]">資料庫類型：</span>
          {(["mysql", "mariadb", "postgres"] as DbKind[]).map((kind) => {
            const active = draft.dbKind === kind;
            const label =
              kind === "mysql"
                ? "MySQL"
                : kind === "mariadb"
                ? "MariaDB"
                : "PostgreSQL";
            return (
              <button
                key={kind}
                type="button"
                onClick={() => handleDbKindChange(kind)}
                className={`rounded px-3 py-1 text-[11px] font-semibold transition ${
                  active
                    ? "bg-[#2563eb] text-white shadow-sm"
                    : "bg-white text-[#334155] border border-[#cbd5e1] hover:bg-[#f8fafc]"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* 6 Navicat Tabs */}
        <div className="flex border-b border-[#d4d8e0] bg-[#eef2f6] px-4 pt-2">
          {tabItems.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`mr-1 rounded-t px-3 py-1.5 text-[11px] font-medium transition ${
                  active
                    ? "border border-b-white border-[#d4d8e0] bg-white text-[#1d4ed8] -mb-[1px]"
                    : "text-[#4b5563] hover:bg-white/60"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Body */}
        <div className="min-h-[290px] bg-white p-5 space-y-3">
          {activeTab === "general" && (
            <div className="grid grid-cols-[110px_1fr] items-center gap-y-2.5 gap-x-3">
              <label className="text-right text-[#475569]">連線名稱：</label>
              <input
                type="text"
                required
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="h-7 rounded border border-[#cbd5e1] px-2.5 outline-none focus:border-[#2563eb]"
              />

              <label className="text-right text-[#475569]">主機：</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  value={draft.host}
                  onChange={(e) => setDraft({ ...draft, host: e.target.value })}
                  className="h-7 flex-1 rounded border border-[#cbd5e1] px-2.5 font-mono outline-none focus:border-[#2563eb]"
                />
                <div className="flex items-center gap-1.5">
                  <span className="text-[#475569]">埠：</span>
                  <input
                    type="number"
                    required
                    min={1}
                    max={65535}
                    value={draft.port}
                    onChange={(e) =>
                      setDraft({ ...draft, port: Number(e.target.value) || 3306 })
                    }
                    className="h-7 w-20 rounded border border-[#cbd5e1] px-2 font-mono outline-none focus:border-[#2563eb]"
                  />
                </div>
              </div>

              <label className="text-right text-[#475569]">
                {draft.dbKind === "postgres" ? "初始資料庫：" : "預設資料庫："}
              </label>
              <input
                type="text"
                placeholder={draft.dbKind === "postgres" ? "postgres" : "(選填)"}
                value={draft.initialDatabase ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    initialDatabase: e.target.value.trim() ? e.target.value : null,
                  })
                }
                className="h-7 rounded border border-[#cbd5e1] px-2.5 font-mono outline-none focus:border-[#2563eb]"
              />

              <label className="text-right text-[#475569]">使用者名稱：</label>
              <input
                type="text"
                required
                value={draft.username}
                onChange={(e) => setDraft({ ...draft, username: e.target.value })}
                className="h-7 rounded border border-[#cbd5e1] px-2.5 font-mono outline-none focus:border-[#2563eb]"
              />

              <label className="text-right text-[#475569]">密碼：</label>
              <div className="flex items-center gap-3">
                <input
                  type="password"
                  value={draft.password ?? ""}
                  onChange={(e) => setDraft({ ...draft, password: e.target.value })}
                  className="h-7 flex-1 rounded border border-[#cbd5e1] px-2.5 font-mono outline-none focus:border-[#2563eb]"
                />
                <label className="flex items-center gap-1.5 text-[11px] text-[#334155]">
                  <input
                    type="checkbox"
                    checked={draft.savePassword}
                    onChange={(e) =>
                      setDraft({ ...draft, savePassword: e.target.checked })
                    }
                  />
                  儲存密碼
                </label>
              </div>
            </div>
          )}

          {activeTab === "advanced" && (
            <div className="grid grid-cols-[120px_1fr] items-center gap-y-2.5 gap-x-3">
              <label className="text-right text-[#475569]">分組資料夾：</label>
              <input
                type="text"
                value={draft.groupName ?? ""}
                placeholder="例如：Production / Local"
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    groupName: e.target.value.trim() ? e.target.value : null,
                  })
                }
                className="h-7 rounded border border-[#cbd5e1] px-2.5 outline-none focus:border-[#2563eb]"
              />

              <label className="text-right text-[#475569]">標籤顏色：</label>
              <div className="flex items-center gap-2">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setDraft({ ...draft, color: c })}
                    className={`h-5 w-5 rounded-full border-2 transition ${
                      draft.color === c ? "border-[#111827] scale-110" : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>

              <label className="text-right text-[#475569]">字元編碼：</label>
              <input
                type="text"
                value={draft.encoding ?? ""}
                onChange={(e) => setDraft({ ...draft, encoding: e.target.value })}
                className="h-7 rounded border border-[#cbd5e1] px-2.5 font-mono outline-none focus:border-[#2563eb]"
              />

              <label className="text-right text-[#475569]">保持連線 (秒)：</label>
              <input
                type="number"
                min={0}
                value={draft.keepaliveSecs}
                onChange={(e) =>
                  setDraft({ ...draft, keepaliveSecs: Number(e.target.value) || 60 })
                }
                className="h-7 w-28 rounded border border-[#cbd5e1] px-2.5 font-mono outline-none focus:border-[#2563eb]"
              />

              <label className="text-right text-[#475569]">連線逾時 (秒)：</label>
              <input
                type="number"
                min={1}
                value={draft.connectTimeoutSecs}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    connectTimeoutSecs: Number(e.target.value) || 10,
                  })
                }
                className="h-7 w-28 rounded border border-[#cbd5e1] px-2.5 font-mono outline-none focus:border-[#2563eb]"
              />

              <span />
              <label className="flex items-center gap-2 text-[#334155]">
                <input
                  type="checkbox"
                  checked={draft.autoConnect}
                  onChange={(e) =>
                    setDraft({ ...draft, autoConnect: e.target.checked })
                  }
                />
                啟動 SqlCraft 時自動連線
              </label>
            </div>
          )}

          {activeTab === "databases" && (
            <div className="space-y-3 text-[11px] text-[#475569]">
              <p>
                連線成功後，左側連線導覽樹會自動從伺服器列舉可存取的資料庫
                {draft.dbKind === "postgres" ? "與 Schema 階層" : ""}。
              </p>
              <div className="rounded border border-[#e2e8f0] bg-[#f8fafc] p-3 space-y-1.5">
                <div className="font-semibold text-[#1e293b]">
                  當前探索階層預覽（{draft.dbKind.toUpperCase()}）
                </div>
                {draft.dbKind === "postgres" ? (
                  <p className="font-mono text-[#334155]">
                    Connection → Database → Schema (public / custom) → Tables / Views / Functions / Sequences
                  </p>
                ) : (
                  <p className="font-mono text-[#334155]">
                    Connection → Database → Tables / Views / Functions / Events
                  </p>
                )}
              </div>
            </div>
          )}

          {activeTab === "ssl" && (
            <div className="space-y-3">
              <label className="flex items-center gap-2 font-medium text-[#1e293b]">
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
                <Shield className="h-3.5 w-3.5 text-[#059669]" />
                使用 SSL/TLS 加密連線
              </label>

              <div className="grid grid-cols-[120px_1fr] items-center gap-y-2.5 gap-x-3">
                <label className="text-right text-[#475569]">驗證模式：</label>
                <select
                  disabled={!draft.ssl.useSsl}
                  value={draft.ssl.mode}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      ssl: { ...draft.ssl, mode: e.target.value as SslMode },
                    })
                  }
                  className="h-7 rounded border border-[#cbd5e1] bg-white px-2 outline-none disabled:bg-[#f1f5f9]"
                >
                  <option value="prefer">Prefer (優先加密)</option>
                  <option value="require">Require (強制加密)</option>
                  <option value="verifyCa">Verify-CA (驗證 CA)</option>
                  <option value="verifyFull">Verify-Full (驗證主機名)</option>
                </select>

                <label className="text-right text-[#475569]">CA 憑證路徑：</label>
                <input
                  type="text"
                  disabled={!draft.ssl.useSsl}
                  placeholder="/path/to/ca.pem"
                  value={draft.ssl.caCertPath ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      ssl: { ...draft.ssl, caCertPath: e.target.value || null },
                    })
                  }
                  className="h-7 rounded border border-[#cbd5e1] px-2.5 font-mono outline-none disabled:bg-[#f1f5f9]"
                />

                <label className="text-right text-[#475569]">用戶端憑證：</label>
                <input
                  type="text"
                  disabled={!draft.ssl.useSsl}
                  placeholder="/path/to/client-cert.pem"
                  value={draft.ssl.clientCertPath ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      ssl: { ...draft.ssl, clientCertPath: e.target.value || null },
                    })
                  }
                  className="h-7 rounded border border-[#cbd5e1] px-2.5 font-mono outline-none disabled:bg-[#f1f5f9]"
                />

                <label className="text-right text-[#475569]">用戶端金鑰：</label>
                <input
                  type="text"
                  disabled={!draft.ssl.useSsl}
                  placeholder="/path/to/client-key.pem"
                  value={draft.ssl.clientKeyPath ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      ssl: { ...draft.ssl, clientKeyPath: e.target.value || null },
                    })
                  }
                  className="h-7 rounded border border-[#cbd5e1] px-2.5 font-mono outline-none disabled:bg-[#f1f5f9]"
                />
              </div>
            </div>
          )}

          {activeTab === "ssh" && (
            <div className="space-y-3">
              <label className="flex items-center gap-2 font-medium text-[#1e293b]">
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
                <Terminal className="h-3.5 w-3.5 text-[#2563eb]" />
                使用 SSH 通道 (Port Forwarding)
              </label>

              <div className="grid grid-cols-[120px_1fr] items-center gap-y-2.5 gap-x-3">
                <label className="text-right text-[#475569]">SSH 主機：</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    disabled={!draft.ssh.useSsh}
                    value={draft.ssh.host}
                    onChange={(e) =>
                      setDraft({ ...draft, ssh: { ...draft.ssh, host: e.target.value } })
                    }
                    className="h-7 flex-1 rounded border border-[#cbd5e1] px-2.5 font-mono outline-none disabled:bg-[#f1f5f9]"
                  />
                  <input
                    type="number"
                    disabled={!draft.ssh.useSsh}
                    value={draft.ssh.port}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        ssh: { ...draft.ssh, port: Number(e.target.value) || 22 },
                      })
                    }
                    className="h-7 w-20 rounded border border-[#cbd5e1] px-2 font-mono outline-none disabled:bg-[#f1f5f9]"
                  />
                </div>

                <label className="text-right text-[#475569]">SSH 使用者：</label>
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
                  className="h-7 rounded border border-[#cbd5e1] px-2.5 font-mono outline-none disabled:bg-[#f1f5f9]"
                />

                <label className="text-right text-[#475569]">驗證方式：</label>
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
                  className="h-7 rounded border border-[#cbd5e1] bg-white px-2 outline-none disabled:bg-[#f1f5f9]"
                >
                  <option value="privateKey">私鑰檔案 (Private Key)</option>
                  <option value="password">密碼 (Password)</option>
                </select>

                {draft.ssh.authMethod === "privateKey" ? (
                  <>
                    <label className="text-right text-[#475569]">私鑰路徑：</label>
                    <input
                      type="text"
                      disabled={!draft.ssh.useSsh}
                      placeholder="~/.ssh/id_ed25519"
                      value={draft.ssh.privateKeyPath ?? ""}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          ssh: {
                            ...draft.ssh,
                            privateKeyPath: e.target.value || null,
                          },
                        })
                      }
                      className="h-7 rounded border border-[#cbd5e1] px-2.5 font-mono outline-none disabled:bg-[#f1f5f9]"
                    />
                  </>
                ) : (
                  <>
                    <label className="text-right text-[#475569]">SSH 密碼：</label>
                    <input
                      type="password"
                      disabled={!draft.ssh.useSsh}
                      value={draft.ssh.password ?? ""}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          ssh: { ...draft.ssh, password: e.target.value || null },
                        })
                      }
                      className="h-7 rounded border border-[#cbd5e1] px-2.5 font-mono outline-none disabled:bg-[#f1f5f9]"
                    />
                  </>
                )}
              </div>
            </div>
          )}

          {activeTab === "http" && (
            <div className="space-y-3">
              <label className="flex items-center gap-2 font-medium text-[#1e293b]">
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
                使用 Navicat 相容 HTTP 通道 (`ntunnel_mysql.php` / `ntunnel_pgsql.php`)
              </label>

              <div className="grid grid-cols-[120px_1fr] items-center gap-y-2.5 gap-x-3">
                <label className="text-right text-[#475569]">通道網址：</label>
                <input
                  type="url"
                  disabled={!draft.httpTunnel.useHttpTunnel}
                  placeholder="https://example.com/ntunnel_mysql.php"
                  value={draft.httpTunnel.url}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      httpTunnel: { ...draft.httpTunnel, url: e.target.value },
                    })
                  }
                  className="h-7 rounded border border-[#cbd5e1] px-2.5 font-mono outline-none disabled:bg-[#f1f5f9]"
                />
                <span />
                <label className="flex items-center gap-2 text-[#334155]">
                  <input
                    type="checkbox"
                    disabled={!draft.httpTunnel.useHttpTunnel}
                    checked={draft.httpTunnel.encodeBase64}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        httpTunnel: {
                          ...draft.httpTunnel,
                          encodeBase64: e.target.checked,
                        },
                      })
                    }
                  />
                  使用 Base64 編碼傳輸查詢語句
                </label>
              </div>
            </div>
          )}

          {testResult && (
            <div
              className={`mt-3 flex items-start gap-2 rounded border p-2.5 text-[11px] ${
                testResult.success
                  ? "border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]"
                  : "border-[#fecaca] bg-[#fef2f2] text-[#991b1b]"
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="font-semibold">
                  {testResult.success ? "連線成功" : "連線檢查訊息"} ({testResult.latencyMs} ms)
                </div>
                <div className="mt-0.5 break-all font-mono">{testResult.message}</div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Buttons */}
        <div className="flex items-center justify-between border-t border-[#dcdfe6] bg-[#f8f9fb] px-4 py-2.5">
          <button
            type="button"
            disabled={testing}
            onClick={() => void handleTest()}
            className="flex items-center gap-1.5 rounded border border-[#cbd5e1] bg-white px-3 py-1.5 font-medium hover:bg-[#f1f5f9] disabled:opacity-50"
          >
            {testing && <Loader2 className="h-3.5 w-3.5 animate-spin text-[#2563eb]" />}
            <span>測試連線</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-[#cbd5e1] bg-white px-3.5 py-1.5 font-medium hover:bg-[#f1f5f9]"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-[#2563eb] px-4 py-1.5 font-medium text-white hover:bg-[#1d4ed8] disabled:opacity-50"
            >
              {saving ? "儲存中..." : "確定"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
