import type {
  ConnectionProfile,
  DbKind,
  SshAuthMethod,
  SslMode,
} from "../types/database";

export interface SqlCraftYamlBundle {
  version: number;
  folders: string[];
  sites: ConnectionProfile[];
}

function yamlScalar(val: string | number | boolean | null | undefined): string {
  if (val === null || val === undefined || val === "") return '""';
  if (typeof val === "boolean" || typeof val === "number") return String(val);
  const str = String(val);
  if (/^[a-zA-Z0-9._/-]+$/.test(str) && !/^(true|false|null|~)$/i.test(str)) {
    return str;
  }
  return JSON.stringify(str);
}

/**
 * Serializes folders and connection profiles to clean YAML format (passwords stripped for safety).
 */
export function exportSitesToYaml(
  profiles: ConnectionProfile[],
  folders: string[]
): string {
  const folderSet = new Set<string>();
  for (const f of folders) {
    const trimmed = f.trim();
    if (trimmed) folderSet.add(trimmed);
  }
  for (const p of profiles) {
    const g = p.groupName?.trim();
    if (g) folderSet.add(g);
  }

  const sortedFolders = [...folderSet].sort((a, b) => a.localeCompare(b));
  const lines: string[] = [];
  lines.push("version: 1");

  if (sortedFolders.length === 0) {
    lines.push("folders: []");
  } else {
    lines.push("folders:");
    for (const f of sortedFolders) {
      lines.push(`  - ${yamlScalar(f)}`);
    }
  }

  if (profiles.length === 0) {
    lines.push("sites: []");
  } else {
    lines.push("sites:");
    for (const p of profiles) {
      lines.push(`  - id: ${yamlScalar(p.id)}`);
      lines.push(`    name: ${yamlScalar(p.name)}`);
      lines.push(`    folder: ${yamlScalar(p.groupName ?? "")}`);
      lines.push(`    dbKind: ${yamlScalar(p.dbKind)}`);
      lines.push(`    host: ${yamlScalar(p.host)}`);
      lines.push(`    port: ${p.port}`);
      lines.push(`    username: ${yamlScalar(p.username)}`);
      lines.push(`    initialDatabase: ${yamlScalar(p.initialDatabase ?? "")}`);
      lines.push(`    encoding: ${yamlScalar(p.encoding ?? "utf8mb4")}`);
      lines.push(`    color: ${yamlScalar(p.color ?? "#2563eb")}`);
      lines.push(`    keepaliveSecs: ${p.keepaliveSecs ?? 60}`);
      lines.push(`    connectTimeoutSecs: ${p.connectTimeoutSecs ?? 10}`);
      lines.push(`    useSsl: ${Boolean(p.ssl?.useSsl)}`);
      lines.push(`    sslMode: ${yamlScalar(p.ssl?.mode ?? "prefer")}`);
      lines.push(`    useSsh: ${Boolean(p.ssh?.useSsh)}`);
      if (p.ssh?.useSsh) {
        lines.push(`    sshHost: ${yamlScalar(p.ssh.host)}`);
        lines.push(`    sshPort: ${p.ssh.port ?? 22}`);
        lines.push(`    sshUsername: ${yamlScalar(p.ssh.username)}`);
        lines.push(`    sshAuthMethod: ${yamlScalar(p.ssh.authMethod ?? "password")}`);
      }
      lines.push(`    useHttpTunnel: ${Boolean(p.httpTunnel?.useHttpTunnel)}`);
      if (p.httpTunnel?.useHttpTunnel) {
        lines.push(`    httpTunnelUrl: ${yamlScalar(p.httpTunnel.url)}`);
      }
    }
  }

  return lines.join("\n") + "\n";
}

function unquoteYamlValue(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "~" || trimmed === "null") return "";
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    try {
      if (trimmed.startsWith('"')) {
        return JSON.parse(trimmed) as string;
      }
      return trimmed.slice(1, -1).replace(/''/g, "'");
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

/**
 * Parses a YAML string into folders and ConnectionProfile items.
 */
export function parseSitesFromYaml(yamlText: string): SqlCraftYamlBundle {
  const rawLines = yamlText.replace(/\r\n/g, "\n").split("\n");
  const folders: string[] = [];
  const rawSites: Record<string, string>[] = [];

  let section: "none" | "folders" | "sites" = "none";
  let currentSite: Record<string, string> | null = null;

  for (const rawLine of rawLines) {
    const commentStripped = rawLine.replace(/^\s*#.*$/, "");
    if (!commentStripped.trim()) continue;

    const trimmed = commentStripped.trim();

    if (/^version\s*:/.test(trimmed)) {
      continue;
    }
    if (/^folders\s*:/.test(trimmed)) {
      if (currentSite) {
        rawSites.push(currentSite);
        currentSite = null;
      }
      section = "folders";
      continue;
    }
    if (/^sites\s*:/.test(trimmed)) {
      if (currentSite) {
        rawSites.push(currentSite);
        currentSite = null;
      }
      section = "sites";
      continue;
    }

    if (section === "folders") {
      const m = trimmed.match(/^-\s*(.+)$/);
      if (m) {
        const f = unquoteYamlValue(m[1]).trim().replace(/^\/+|\/+$/g, "");
        if (f && !folders.includes(f)) {
          folders.push(f);
        }
      }
      continue;
    }

    if (section === "sites" || section === "none") {
      const itemStart = trimmed.match(/^-\s*([a-zA-Z0-9_]+)\s*:\s*(.*)$/);
      if (itemStart) {
        if (currentSite) rawSites.push(currentSite);
        currentSite = {
          [itemStart[1]]: unquoteYamlValue(itemStart[2]),
        };
        section = "sites";
        continue;
      }
      const propMatch = trimmed.match(/^([a-zA-Z0-9_]+)\s*:\s*(.*)$/);
      if (propMatch && currentSite) {
        currentSite[propMatch[1]] = unquoteYamlValue(propMatch[2]);
      }
    }
  }

  if (currentSite) {
    rawSites.push(currentSite);
  }

  if (rawSites.length === 0 && folders.length === 0) {
    throw new Error("YAML 內容未包含有效的 sites 或 folders 欄位");
  }

  const now = new Date().toISOString();
  const sites: ConnectionProfile[] = rawSites.map((item, idx) => {
    const rawKind = (item.dbKind || item.protocol || "mysql").toLowerCase();
    const dbKind: DbKind =
      rawKind === "mariadb"
        ? "mariadb"
        : rawKind === "postgres" || rawKind === "postgresql"
        ? "postgres"
        : "mysql";
    const defaultPort = dbKind === "postgres" ? 5432 : 3306;
    const port = Number(item.port || item.portNumber) || defaultPort;
    const folder = (item.folder || item.groupName || "").trim().replace(/^\/+|\/+$/g, "") || null;
    if (folder && !folders.includes(folder)) {
      folders.push(folder);
    }
    const host = item.host || item.hostName || "127.0.0.1";
    const username = item.username || item.userName || (dbKind === "postgres" ? "postgres" : "root");
    const name = item.name || `${username}@${host}`;

    return {
      id: item.id || `site-${Date.now()}-${idx}`,
      name,
      groupName: folder,
      dbKind,
      host,
      port,
      initialDatabase: item.initialDatabase || null,
      username,
      password: "",
      savePassword: false,
      color:
        item.color ||
        (dbKind === "mysql" ? "#2563eb" : dbKind === "mariadb" ? "#0d9488" : "#4f46e5"),
      encoding: item.encoding || (dbKind === "postgres" ? "UTF8" : "utf8mb4"),
      keepaliveSecs: Number(item.keepaliveSecs) || 60,
      connectTimeoutSecs: Number(item.connectTimeoutSecs) || 10,
      autoConnect: false,
      ssl: {
        useSsl: item.useSsl === "true",
        mode: ((item.sslMode as SslMode) || "prefer"),
        caCertPath: null,
        clientCertPath: null,
        clientKeyPath: null,
      },
      ssh: {
        useSsh: item.useSsh === "true",
        host: item.sshHost || "",
        port: Number(item.sshPort) || 22,
        username: item.sshUsername || "",
        authMethod: ((item.sshAuthMethod as SshAuthMethod) || "password"),
        password: null,
        privateKeyPath: null,
        passphrase: null,
      },
      httpTunnel: {
        useHttpTunnel: item.useHttpTunnel === "true",
        url: item.httpTunnelUrl || "",
        encodeBase64: true,
      },
      createdAt: now,
      updatedAt: now,
    };
  });

  return {
    version: 1,
    folders,
    sites,
  };
}
