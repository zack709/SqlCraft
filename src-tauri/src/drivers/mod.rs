pub mod mysql;
pub mod postgres;

use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use tokio::sync::RwLock;
use tokio_util::sync::CancellationToken;

use crate::models::{
    BatchQueryResponse, ColumnInfo, ConnectionProfile, ConnectionTestResult, DatabaseInfo, DbKind,
    ForeignKeyInfo, IndexInfo, QueryResultSet, RoutineInfo, SchemaInfo, SequenceInfo, TableInfo,
    ViewInfo,
};
use crate::tunnel::SshTunnelManager;

pub const MAX_QUERY_ROWS: usize = 5000;

/// Unified cross-engine database driver abstraction.
#[async_trait]
pub trait DatabaseDriver: Send + Sync {
    fn db_kind(&self) -> DbKind;

    async fn test_connection(&self) -> Result<ConnectionTestResult, String>;

    async fn list_databases(&self) -> Result<Vec<DatabaseInfo>, String>;

    async fn list_schemas(&self, database: &str) -> Result<Vec<SchemaInfo>, String>;

    async fn list_tables(
        &self,
        database: &str,
        schema: Option<&str>,
    ) -> Result<Vec<TableInfo>, String>;

    async fn list_views(
        &self,
        database: &str,
        schema: Option<&str>,
    ) -> Result<Vec<ViewInfo>, String>;

    async fn list_columns(
        &self,
        database: &str,
        schema: Option<&str>,
        table: &str,
    ) -> Result<Vec<ColumnInfo>, String>;

    async fn list_indexes(
        &self,
        database: &str,
        schema: Option<&str>,
        table: &str,
    ) -> Result<Vec<IndexInfo>, String>;

    async fn list_foreign_keys(
        &self,
        database: &str,
        schema: Option<&str>,
        table: &str,
    ) -> Result<Vec<ForeignKeyInfo>, String>;

    async fn list_routines(
        &self,
        database: &str,
        schema: Option<&str>,
    ) -> Result<Vec<RoutineInfo>, String>;

    async fn list_sequences(
        &self,
        database: &str,
        schema: Option<&str>,
    ) -> Result<Vec<SequenceInfo>, String>;

    async fn get_object_ddl(
        &self,
        database: &str,
        schema: Option<&str>,
        object_type: &str,
        object_name: &str,
    ) -> Result<String, String>;

    async fn execute_query(
        &self,
        database: Option<&str>,
        schema: Option<&str>,
        sql: &str,
    ) -> Result<QueryResultSet, String>;

    async fn execute_batch(
        &self,
        database: Option<&str>,
        schema: Option<&str>,
        sql_batch: &str,
    ) -> Result<BatchQueryResponse, String>;

    async fn close(&self);
}

pub fn preview_sql(sql: &str) -> String {
    let single_line = sql.split_whitespace().collect::<Vec<_>>().join(" ");
    if single_line.chars().count() > 80 {
        let prefix: String = single_line.chars().take(77).collect();
        format!("{prefix}...")
    } else {
        single_line
    }
}

pub fn bytes_to_hex_preview(bytes: &[u8]) -> String {
    const MAX_PREVIEW_BYTES: usize = 256;
    let slice = &bytes[..bytes.len().min(MAX_PREVIEW_BYTES)];
    let mut out = String::with_capacity(2 + slice.len() * 2 + 16);
    out.push_str("0x");
    for b in slice {
        out.push_str(&format!("{b:02X}"));
    }
    if bytes.len() > MAX_PREVIEW_BYTES {
        out.push_str(&format!("... ({} bytes)", bytes.len()));
    }
    out
}

/// Split a SQL script into individual executable statements while respecting
/// single/double/backtick quotes, line comments (`--`, `#`), block comments (`/* */`),
/// and PostgreSQL dollar-quoted blocks (`$$...$$` or `$tag$...$tag$`).
pub fn split_sql_statements(sql: &str) -> Vec<String> {
    let bytes = sql.as_bytes();
    let len = bytes.len();
    let mut statements = Vec::new();
    let mut start = 0usize;
    let mut i = 0usize;

    let mut in_single = false;
    let mut in_double = false;
    let mut in_backtick = false;
    let mut in_line_comment = false;
    let mut in_block_comment = false;
    let mut dollar_tag: Option<String> = None;

    while i < len {
        let b = bytes[i];

        if in_line_comment {
            if b == b'\n' {
                in_line_comment = false;
            }
            i += 1;
            continue;
        }

        if in_block_comment {
            if b == b'*' && i + 1 < len && bytes[i + 1] == b'/' {
                in_block_comment = false;
                i += 2;
            } else {
                i += 1;
            }
            continue;
        }

        if let Some(ref tag) = dollar_tag {
            if b == b'$' && sql[i..].starts_with(tag.as_str()) {
                i += tag.len();
                dollar_tag = None;
                continue;
            }
            i += 1;
            continue;
        }

        if in_single {
            if b == b'\\' && i + 1 < len {
                i += 2;
                continue;
            }
            if b == b'\'' {
                if i + 1 < len && bytes[i + 1] == b'\'' {
                    i += 2;
                    continue;
                }
                in_single = false;
            }
            i += 1;
            continue;
        }

        if in_double {
            if b == b'\\' && i + 1 < len {
                i += 2;
                continue;
            }
            if b == b'"' {
                if i + 1 < len && bytes[i + 1] == b'"' {
                    i += 2;
                    continue;
                }
                in_double = false;
            }
            i += 1;
            continue;
        }

        if in_backtick {
            if b == b'`' {
                if i + 1 < len && bytes[i + 1] == b'`' {
                    i += 2;
                    continue;
                }
                in_backtick = false;
            }
            i += 1;
            continue;
        }

        // Outside all quotes/comments
        if b == b'-' && i + 1 < len && bytes[i + 1] == b'-' {
            in_line_comment = true;
            i += 2;
            continue;
        }
        if b == b'#' {
            in_line_comment = true;
            i += 1;
            continue;
        }
        if b == b'/' && i + 1 < len && bytes[i + 1] == b'*' {
            in_block_comment = true;
            i += 2;
            continue;
        }
        if b == b'\'' {
            in_single = true;
            i += 1;
            continue;
        }
        if b == b'"' {
            in_double = true;
            i += 1;
            continue;
        }
        if b == b'`' {
            in_backtick = true;
            i += 1;
            continue;
        }
        if b == b'$' {
            if let Some(tag) = parse_dollar_tag(&sql[i..]) {
                i += tag.len();
                dollar_tag = Some(tag);
                continue;
            }
        }
        if b == b';' {
            let chunk = sql[start..i].trim();
            if !chunk.is_empty() {
                statements.push(chunk.to_string());
            }
            start = i + 1;
        }

        i += 1;
    }

    let tail = sql[start..].trim();
    if !tail.is_empty() {
        statements.push(tail.to_string());
    }
    statements
}

fn parse_dollar_tag(rest: &str) -> Option<String> {
    let bytes = rest.as_bytes();
    if bytes.first().copied() != Some(b'$') {
        return None;
    }
    if bytes.get(1).copied() == Some(b'$') {
        return Some("$$".to_string());
    }
    let mut end = 1usize;
    while end < bytes.len() {
        let ch = bytes[end];
        if ch == b'$' {
            return Some(rest[..=end].to_string());
        }
        if !(ch.is_ascii_alphanumeric() || ch == b'_') {
            return None;
        }
        end += 1;
    }
    None
}

/// Central manager for active connection drivers, SSH tunnels, and cancellable queries.
pub struct ConnectionManager {
    drivers: RwLock<HashMap<String, Arc<dyn DatabaseDriver>>>,
    query_tokens: RwLock<HashMap<String, CancellationToken>>,
    ssh_tunnels: SshTunnelManager,
}

impl Default for ConnectionManager {
    fn default() -> Self {
        Self::new()
    }
}

impl ConnectionManager {
    pub fn new() -> Self {
        Self {
            drivers: RwLock::new(HashMap::new()),
            query_tokens: RwLock::new(HashMap::new()),
            ssh_tunnels: SshTunnelManager::new(),
        }
    }

    async fn build_driver_for_profile(
        &self,
        tunnel_id: &str,
        profile: &ConnectionProfile,
    ) -> Result<Arc<dyn DatabaseDriver>, String> {
        let mut effective = profile.clone();
        if profile.ssh.use_ssh {
            let local_port = self
                .ssh_tunnels
                .start_tunnel(tunnel_id, &profile.ssh, &profile.host, profile.port)
                .await?;
            effective.host = "127.0.0.1".to_string();
            effective.port = local_port;
        }

        if effective.http_tunnel.use_http_tunnel {
            return Err(
                "HTTP tunnel execution transport is scheduled for Phase 3+; direct TCP and SSH tunnels are active in Phase 2."
                    .to_string(),
            );
        }

        match effective.db_kind {
            DbKind::Mysql | DbKind::MariaDb => {
                let drv = mysql::MySqlDriver::connect(&effective).await?;
                Ok(Arc::new(drv))
            }
            DbKind::Postgres => {
                let drv = postgres::PostgresDriver::connect(&effective).await?;
                Ok(Arc::new(drv))
            }
        }
    }

    pub async fn test_connection(
        &self,
        profile: &ConnectionProfile,
    ) -> Result<ConnectionTestResult, String> {
        let temp_tunnel_id = format!("test-{}", uuid::Uuid::new_v4());
        let drv_res = self.build_driver_for_profile(&temp_tunnel_id, profile).await;
        let result = match drv_res {
            Ok(drv) => {
                let res = drv.test_connection().await;
                drv.close().await;
                res
            }
            Err(err) => Ok(ConnectionTestResult {
                success: false,
                db_kind: profile.db_kind,
                server_version: None,
                latency_ms: 0,
                message: err,
            }),
        };
        if profile.ssh.use_ssh {
            self.ssh_tunnels.stop_tunnel(&temp_tunnel_id).await;
        }
        result
    }

    pub async fn connect_profile(
        &self,
        profile: &ConnectionProfile,
    ) -> Result<ConnectionTestResult, String> {
        self.disconnect_profile(&profile.id).await;
        let drv = self.build_driver_for_profile(&profile.id, profile).await?;
        let test_res = drv.test_connection().await?;
        if !test_res.success {
            drv.close().await;
            if profile.ssh.use_ssh {
                self.ssh_tunnels.stop_tunnel(&profile.id).await;
            }
            return Ok(test_res);
        }
        let mut guard = self.drivers.write().await;
        guard.insert(profile.id.clone(), drv);
        Ok(test_res)
    }

    pub async fn disconnect_profile(&self, profile_id: &str) {
        let existing = {
            let mut guard = self.drivers.write().await;
            guard.remove(profile_id)
        };
        if let Some(drv) = existing {
            drv.close().await;
        }
        self.ssh_tunnels.stop_tunnel(profile_id).await;
    }

    pub async fn get_driver(&self, profile_id: &str) -> Result<Arc<dyn DatabaseDriver>, String> {
        let guard = self.drivers.read().await;
        guard
            .get(profile_id)
            .cloned()
            .ok_or_else(|| format!("Connection '{profile_id}' is not connected"))
    }

    pub async fn register_query_token(&self, query_id: &str) -> CancellationToken {
        let token = CancellationToken::new();
        let mut guard = self.query_tokens.write().await;
        guard.insert(query_id.to_string(), token.clone());
        token
    }

    pub async fn clear_query_token(&self, query_id: &str) {
        let mut guard = self.query_tokens.write().await;
        guard.remove(query_id);
    }

    pub async fn cancel_query(&self, query_id: &str) -> bool {
        let guard = self.query_tokens.read().await;
        if let Some(token) = guard.get(query_id) {
            token.cancel();
            true
        } else {
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_standard_and_quoted_statements() {
        let sql = r#"
            -- leading comment
            SELECT 'a;b' AS txt, `col;1` FROM `users`;
            INSERT INTO logs (msg) VALUES ('hello ''world''; ok');
            /* block ; comment */
            UPDATE counters SET val = val + 1 WHERE id = 2
        "#;
        let parts = split_sql_statements(sql);
        assert_eq!(parts.len(), 3);
        assert!(parts[0].contains("SELECT 'a;b'"));
        assert!(parts[1].starts_with("INSERT INTO logs"));
        assert!(parts[2].contains("UPDATE counters"));
    }

    #[test]
    fn splits_postgres_dollar_quoted_functions() {
        let sql = r#"
            CREATE OR REPLACE FUNCTION add_one(x INT) RETURNS INT AS $$
            BEGIN
                RETURN x + 1;
            END;
            $$ LANGUAGE plpgsql;
            SELECT add_one(41);
        "#;
        let parts = split_sql_statements(sql);
        assert_eq!(parts.len(), 2);
        assert!(parts[0].contains("RETURN x + 1;"));
        assert_eq!(parts[1], "SELECT add_one(41)");
    }
}
