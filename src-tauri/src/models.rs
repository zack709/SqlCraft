use serde::{Deserialize, Serialize};

/// Supported database engines in Phase 2 (extensible for SQLite, Redis, etc.).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DbKind {
    Mysql,
    #[serde(alias = "mariaDb")]
    MariaDb,
    #[serde(alias = "postgresql")]
    Postgres,
}

impl DbKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            DbKind::Mysql => "mysql",
            DbKind::MariaDb => "mariadb",
            DbKind::Postgres => "postgres",
        }
    }

    pub fn from_str(s: &str) -> Result<Self, String> {
        match s.to_ascii_lowercase().as_str() {
            "mysql" => Ok(DbKind::Mysql),
            "mariadb" => Ok(DbKind::MariaDb),
            "postgres" | "postgresql" => Ok(DbKind::Postgres),
            other => Err(format!("Unsupported database kind: {other}")),
        }
    }

    pub fn default_port(&self) -> u16 {
        match self {
            DbKind::Mysql | DbKind::MariaDb => 3306,
            DbKind::Postgres => 5432,
        }
    }

    pub fn quote_identifier(&self, ident: &str) -> String {
        match self {
            DbKind::Mysql | DbKind::MariaDb => {
                format!("`{}`", ident.replace('`', "``"))
            }
            DbKind::Postgres => {
                format!("\"{}\"", ident.replace('"', "\"\""))
            }
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SslMode {
    Disable,
    Prefer,
    Require,
    VerifyCa,
    VerifyFull,
}

impl Default for SslMode {
    fn default() -> Self {
        SslMode::Prefer
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SslConfig {
    pub use_ssl: bool,
    #[serde(default)]
    pub mode: SslMode,
    pub ca_cert_path: Option<String>,
    pub client_cert_path: Option<String>,
    pub client_key_path: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SshAuthMethod {
    Password,
    PrivateKey,
    PasswordAndPrivateKey,
}

impl Default for SshAuthMethod {
    fn default() -> Self {
        SshAuthMethod::Password
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshTunnelConfig {
    pub use_ssh: bool,
    pub host: String,
    pub port: u16,
    pub username: String,
    #[serde(default)]
    pub auth_method: SshAuthMethod,
    pub password: Option<String>,
    pub private_key_path: Option<String>,
    pub passphrase: Option<String>,
}

impl Default for SshTunnelConfig {
    fn default() -> Self {
        Self {
            use_ssh: false,
            host: String::new(),
            port: 22,
            username: String::new(),
            auth_method: SshAuthMethod::Password,
            password: None,
            private_key_path: None,
            passphrase: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpTunnelConfig {
    pub use_http_tunnel: bool,
    pub url: String,
    pub encode_base64: bool,
}

impl Default for HttpTunnelConfig {
    fn default() -> Self {
        Self {
            use_http_tunnel: false,
            url: String::new(),
            encode_base64: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionProfile {
    pub id: String,
    pub name: String,
    pub group_name: Option<String>,
    pub db_kind: DbKind,
    pub host: String,
    pub port: u16,
    pub initial_database: Option<String>,
    pub username: String,
    pub password: Option<String>,
    pub save_password: bool,
    pub color: Option<String>,
    pub encoding: Option<String>,
    pub keepalive_secs: u32,
    pub connect_timeout_secs: u32,
    pub auto_connect: bool,
    #[serde(default)]
    pub ssl: SslConfig,
    #[serde(default)]
    pub ssh: SshTunnelConfig,
    #[serde(default)]
    pub http_tunnel: HttpTunnelConfig,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionTestResult {
    pub success: bool,
    pub db_kind: DbKind,
    pub server_version: Option<String>,
    pub latency_ms: u64,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseInfo {
    pub name: String,
    pub charset: Option<String>,
    pub collation: Option<String>,
    pub owner: Option<String>,
    pub size_bytes: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaInfo {
    pub database: String,
    pub name: String,
    pub owner: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableInfo {
    pub database: String,
    pub schema: Option<String>,
    pub name: String,
    pub rows_estimate: Option<i64>,
    pub data_length_bytes: Option<i64>,
    pub engine: Option<String>,
    pub tablespace: Option<String>,
    pub owner: Option<String>,
    pub modified_at: Option<String>,
    pub comment: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewInfo {
    pub database: String,
    pub schema: Option<String>,
    pub name: String,
    pub owner: Option<String>,
    pub is_updatable: Option<bool>,
    pub comment: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnInfo {
    pub name: String,
    pub ordinal_position: i32,
    pub data_type: String,
    pub column_type: String,
    pub nullable: bool,
    pub default_value: Option<String>,
    pub is_primary_key: bool,
    pub is_auto_increment: bool,
    pub character_set: Option<String>,
    pub collation: Option<String>,
    pub comment: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexInfo {
    pub name: String,
    pub columns: Vec<String>,
    pub is_unique: bool,
    pub is_primary: bool,
    pub index_type: Option<String>,
    pub comment: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForeignKeyInfo {
    pub name: String,
    pub columns: Vec<String>,
    pub referenced_schema: Option<String>,
    pub referenced_table: String,
    pub referenced_columns: Vec<String>,
    pub on_update: Option<String>,
    pub on_delete: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutineInfo {
    pub database: String,
    pub schema: Option<String>,
    pub name: String,
    pub routine_type: String,
    pub return_type: Option<String>,
    pub definer: Option<String>,
    pub comment: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SequenceInfo {
    pub database: String,
    pub schema: String,
    pub name: String,
    pub data_type: Option<String>,
    pub last_value: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryColumn {
    pub name: String,
    pub data_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryResultSet {
    pub columns: Vec<QueryColumn>,
    pub rows: Vec<Vec<serde_json::Value>>,
    pub affected_rows: u64,
    pub execution_ms: u64,
    pub truncated: bool,
    pub warning: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatementExecutionSummary {
    pub index: usize,
    pub sql_preview: String,
    pub success: bool,
    pub affected_rows: u64,
    pub execution_ms: u64,
    pub error: Option<String>,
    pub result_set: Option<QueryResultSet>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchQueryResponse {
    pub statements: Vec<StatementExecutionSummary>,
    pub total_execution_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedQuery {
    pub id: String,
    pub profile_id: String,
    pub database_name: Option<String>,
    pub schema_name: Option<String>,
    pub title: String,
    pub sql_text: String,
    pub created_at: String,
    pub updated_at: String,
}

fn default_theme() -> String {
    "light".to_string()
}

fn default_language() -> String {
    "zh-TW".to_string()
}

fn default_editor_font_size() -> u16 {
    13
}

fn default_folders() -> Vec<String> {
    Vec::new()
}

fn default_show_site_manager_on_startup() -> bool {
    true
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_language")]
    pub language: String,
    #[serde(default = "default_editor_font_size")]
    pub editor_font_size: u16,
    #[serde(default = "default_folders")]
    pub folders: Vec<String>,
    #[serde(default = "default_show_site_manager_on_startup")]
    pub show_site_manager_on_startup: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            theme: default_theme(),
            language: default_language(),
            editor_font_size: default_editor_font_size(),
            folders: default_folders(),
            show_site_manager_on_startup: default_show_site_manager_on_startup(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn db_kind_serializes_lowercase_and_accepts_aliases() {
        assert_eq!(serde_json::to_string(&DbKind::Mysql).unwrap(), "\"mysql\"");
        assert_eq!(serde_json::to_string(&DbKind::MariaDb).unwrap(), "\"mariadb\"");
        assert_eq!(serde_json::to_string(&DbKind::Postgres).unwrap(), "\"postgres\"");

        assert_eq!(serde_json::from_str::<DbKind>("\"mysql\"").unwrap(), DbKind::Mysql);
        assert_eq!(serde_json::from_str::<DbKind>("\"mariadb\"").unwrap(), DbKind::MariaDb);
        assert_eq!(serde_json::from_str::<DbKind>("\"mariaDb\"").unwrap(), DbKind::MariaDb);
        assert_eq!(serde_json::from_str::<DbKind>("\"postgres\"").unwrap(), DbKind::Postgres);
        assert_eq!(serde_json::from_str::<DbKind>("\"postgresql\"").unwrap(), DbKind::Postgres);
    }
}
