export type DbKind = "mysql" | "mariadb" | "postgres";

export type SslMode =
  | "disable"
  | "prefer"
  | "require"
  | "verifyCa"
  | "verifyFull";

export type SshAuthMethod = "password" | "privateKey";

export interface SslConfig {
  useSsl: boolean;
  mode: SslMode;
  caCertPath?: string | null;
  clientCertPath?: string | null;
  clientKeyPath?: string | null;
}

export interface SshTunnelConfig {
  useSsh: boolean;
  host: string;
  port: number;
  username: string;
  authMethod: SshAuthMethod;
  password?: string | null;
  privateKeyPath?: string | null;
  passphrase?: string | null;
}

export interface HttpTunnelConfig {
  useHttpTunnel: boolean;
  url: string;
  encodeBase64: boolean;
}

export interface ConnectionProfile {
  id: string;
  name: string;
  groupName?: string | null;
  dbKind: DbKind;
  host: string;
  port: number;
  initialDatabase?: string | null;
  username: string;
  password?: string | null;
  savePassword: boolean;
  color?: string | null;
  encoding?: string | null;
  keepaliveSecs: number;
  connectTimeoutSecs: number;
  autoConnect: boolean;
  ssl: SslConfig;
  ssh: SshTunnelConfig;
  httpTunnel: HttpTunnelConfig;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectionTestResult {
  success: boolean;
  dbKind: DbKind;
  serverVersion?: string | null;
  latencyMs: number;
  message: string;
}

export interface DatabaseInfo {
  name: string;
  charset?: string | null;
  collation?: string | null;
  owner?: string | null;
  sizeBytes?: number | null;
}

export interface SchemaInfo {
  database: string;
  name: string;
  owner?: string | null;
}

export interface TableInfo {
  database: string;
  schema?: string | null;
  name: string;
  rowsEstimate?: number | null;
  dataLengthBytes?: number | null;
  engine?: string | null;
  tablespace?: string | null;
  owner?: string | null;
  modifiedAt?: string | null;
  comment?: string | null;
}

export interface ViewInfo {
  database: string;
  schema?: string | null;
  name: string;
  owner?: string | null;
  isUpdatable?: boolean | null;
  comment?: string | null;
}

export interface ColumnInfo {
  name: string;
  ordinalPosition: number;
  dataType: string;
  columnType: string;
  nullable: boolean;
  defaultValue?: string | null;
  isPrimaryKey: boolean;
  isAutoIncrement: boolean;
  characterSet?: string | null;
  collation?: string | null;
  comment?: string | null;
}

export interface IndexInfo {
  name: string;
  columns: string[];
  isUnique: boolean;
  isPrimary: boolean;
  indexType?: string | null;
  comment?: string | null;
}

export interface ForeignKeyInfo {
  name: string;
  columns: string[];
  referencedSchema?: string | null;
  referencedTable: string;
  referencedColumns: string[];
  onUpdate?: string | null;
  onDelete?: string | null;
}

export interface RoutineInfo {
  database: string;
  schema?: string | null;
  name: string;
  routineType: string;
  returnType?: string | null;
  definer?: string | null;
  comment?: string | null;
}

export interface SequenceInfo {
  database: string;
  schema: string;
  name: string;
  dataType?: string | null;
  lastValue?: number | null;
}

export interface QueryColumn {
  name: string;
  dataType: string;
}

export type CellValue = string | number | boolean | null | Record<string, unknown> | unknown[];

export interface QueryResultSet {
  columns: QueryColumn[];
  rows: CellValue[][];
  affectedRows: number;
  executionMs: number;
  truncated: boolean;
  warning?: string | null;
}

export interface StatementExecutionSummary {
  index: number;
  sqlPreview: string;
  success: boolean;
  affectedRows: number;
  executionMs: number;
  error?: string | null;
  resultSet?: QueryResultSet | null;
}

export interface BatchQueryResponse {
  statements: StatementExecutionSummary[];
  totalExecutionMs: number;
}

export interface SavedQuery {
  id: string;
  profileId: string;
  databaseName?: string | null;
  schemaName?: string | null;
  title: string;
  sqlText: string;
  createdAt: string;
  updatedAt: string;
}
