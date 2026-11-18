use std::collections::BTreeMap;
use std::time::{Duration, Instant};

use async_trait::async_trait;
use futures_util::StreamExt;
use sqlx::mysql::{MySqlConnectOptions, MySqlPool, MySqlPoolOptions, MySqlRow, MySqlSslMode};
use sqlx::{Column, Either, Executor, Row, TypeInfo, ValueRef};

use crate::drivers::{bytes_to_hex_preview, preview_sql, split_sql_statements, DatabaseDriver, MAX_QUERY_ROWS};
use crate::models::{
    BatchQueryResponse, ColumnInfo, ConnectionProfile, ConnectionTestResult, DatabaseInfo, DbKind,
    ForeignKeyInfo, IndexInfo, QueryColumn, QueryResultSet, RoutineInfo, SchemaInfo, SequenceInfo,
    SslMode, StatementExecutionSummary, TableInfo, ViewInfo,
};

pub struct MySqlDriver {
    kind: DbKind,
    pool: MySqlPool,
}

impl MySqlDriver {
    pub async fn connect(profile: &ConnectionProfile) -> Result<Self, String> {
        let mut opts = MySqlConnectOptions::new()
            .host(&profile.host)
            .port(profile.port)
            .username(&profile.username)
            .password(profile.password.as_deref().unwrap_or(""));

        if let Some(db) = profile.initial_database.as_deref().filter(|s| !s.trim().is_empty()) {
            opts = opts.database(db.trim());
        }

        let ssl_mode = if !profile.ssl.use_ssl {
            MySqlSslMode::Preferred
        } else {
            match profile.ssl.mode {
                SslMode::Disable => MySqlSslMode::Disabled,
                SslMode::Prefer => MySqlSslMode::Preferred,
                SslMode::Require => MySqlSslMode::Required,
                SslMode::VerifyCa => MySqlSslMode::VerifyCa,
                SslMode::VerifyFull => MySqlSslMode::VerifyIdentity,
            }
        };
        opts = opts.ssl_mode(ssl_mode);

        if profile.ssl.use_ssl {
            if let Some(ca) = profile.ssl.ca_cert_path.as_deref().filter(|s| !s.trim().is_empty()) {
                opts = opts.ssl_ca(ca.trim());
            }
            if let Some(cert) = profile.ssl.client_cert_path.as_deref().filter(|s| !s.trim().is_empty()) {
                opts = opts.ssl_client_cert(cert.trim());
            }
            if let Some(key) = profile.ssl.client_key_path.as_deref().filter(|s| !s.trim().is_empty()) {
                opts = opts.ssl_client_key(key.trim());
            }
        }

        let timeout = Duration::from_secs(profile.connect_timeout_secs.max(3) as u64);
        let pool = MySqlPoolOptions::new()
            .max_connections(5)
            .acquire_timeout(timeout)
            .connect_with(opts)
            .await
            .map_err(|e| format!("MySQL/MariaDB connection failed: {e}"))?;

        Ok(Self {
            kind: profile.db_kind,
            pool,
        })
    }

    async fn run_single_on_conn(
        conn: &mut sqlx::MySqlConnection,
        sql: &str,
    ) -> Result<QueryResultSet, String> {
        let start = Instant::now();
        let mut columns: Vec<QueryColumn> = Vec::new();
        let mut rows: Vec<Vec<serde_json::Value>> = Vec::new();
        let mut affected_rows: u64 = 0;
        let mut truncated = false;

        {
            let mut stream = conn.fetch_many(sql);
            while let Some(item) = stream.next().await {
                match item {
                    Ok(Either::Left(res)) => {
                        affected_rows = affected_rows.saturating_add(res.rows_affected());
                    }
                    Ok(Either::Right(row)) => {
                        if columns.is_empty() {
                            columns = row
                                .columns()
                                .iter()
                                .map(|c| QueryColumn {
                                    name: c.name().to_string(),
                                    data_type: c.type_info().name().to_string(),
                                })
                                .collect();
                        }
                        if rows.len() < MAX_QUERY_ROWS {
                            let mut decoded = Vec::with_capacity(row.columns().len());
                            for idx in 0..row.columns().len() {
                                decoded.push(decode_mysql_cell(&row, idx));
                            }
                            rows.push(decoded);
                        } else {
                            truncated = true;
                        }
                    }
                    Err(e) => return Err(format!("Query execution error: {e}")),
                }
            }
        }

        let warning = if truncated {
            Some(format!(
                "Result truncated at {MAX_QUERY_ROWS} rows to preserve UI responsiveness."
            ))
        } else {
            None
        };

        Ok(QueryResultSet {
            columns,
            rows,
            affected_rows,
            execution_ms: start.elapsed().as_millis() as u64,
            truncated,
            warning,
        })
    }
}

#[async_trait]
impl DatabaseDriver for MySqlDriver {
    fn db_kind(&self) -> DbKind {
        self.kind
    }

    async fn test_connection(&self) -> Result<ConnectionTestResult, String> {
        let start = Instant::now();
        let row = sqlx::query("SELECT VERSION() AS ver")
            .fetch_one(&self.pool)
            .await
            .map_err(|e| format!("MySQL/MariaDB ping failed: {e}"))?;

        let version: String = row.try_get("ver").unwrap_or_else(|_| "unknown".to_string());
        let detected_kind = if version.to_ascii_lowercase().contains("mariadb") {
            DbKind::MariaDb
        } else {
            self.kind
        };

        Ok(ConnectionTestResult {
            success: true,
            db_kind: detected_kind,
            server_version: Some(version.clone()),
            latency_ms: start.elapsed().as_millis() as u64,
            message: format!("Connected successfully (Server version: {version})"),
        })
    }

    async fn list_databases(&self) -> Result<Vec<DatabaseInfo>, String> {
        let schemata_res = sqlx::query(
            r#"
            SELECT
                SCHEMA_NAME AS name,
                DEFAULT_CHARACTER_SET_NAME AS charset,
                DEFAULT_COLLATION_NAME AS collation
            FROM information_schema.SCHEMATA
            ORDER BY SCHEMA_NAME
            "#,
        )
        .fetch_all(&self.pool)
        .await;

        if let Ok(rows) = schemata_res {
            let list: Vec<DatabaseInfo> = rows
                .into_iter()
                .filter_map(|r| {
                    let name: String = r
                        .try_get::<String, _>("name")
                        .ok()
                        .or_else(|| {
                            r.try_get::<Vec<u8>, _>("name")
                                .ok()
                                .map(|b| String::from_utf8_lossy(&b).into_owned())
                        })?;
                    if name.is_empty() {
                        return None;
                    }
                    Some(DatabaseInfo {
                        name,
                        charset: r.try_get("charset").ok(),
                        collation: r.try_get("collation").ok(),
                        owner: None,
                        size_bytes: None,
                    })
                })
                .collect();
            if !list.is_empty() {
                return Ok(list);
            }
        }

        // Fallback to SHOW DATABASES for MariaDB/MySQL servers with restricted information_schema
        let rows = sqlx::query("SHOW DATABASES")
            .fetch_all(&self.pool)
            .await
            .map_err(|e| format!("Failed to list databases: {e}"))?;

        Ok(rows
            .into_iter()
            .filter_map(|r| {
                let name = r
                    .try_get::<String, _>(0)
                    .ok()
                    .or_else(|| {
                        r.try_get::<Vec<u8>, _>(0)
                            .ok()
                            .map(|b| String::from_utf8_lossy(&b).into_owned())
                    })?;
                if name.is_empty() {
                    return None;
                }
                Some(DatabaseInfo {
                    name,
                    charset: None,
                    collation: None,
                    owner: None,
                    size_bytes: None,
                })
            })
            .collect())
    }

    async fn list_schemas(&self, _database: &str) -> Result<Vec<SchemaInfo>, String> {
        // MySQL/MariaDB uses a 2-level Database -> Objects hierarchy without sub-schemas.
        Ok(Vec::new())
    }

    async fn list_tables(
        &self,
        database: &str,
        _schema: Option<&str>,
    ) -> Result<Vec<TableInfo>, String> {
        let rows = sqlx::query(
            r#"
            SELECT
                TABLE_NAME AS name,
                CAST(TABLE_ROWS AS SIGNED) AS rows_estimate,
                CAST(DATA_LENGTH AS SIGNED) AS data_length_bytes,
                ENGINE AS engine,
                DATE_FORMAT(UPDATE_TIME, '%Y-%m-%d %H:%i:%s') AS modified_at,
                TABLE_COMMENT AS comment
            FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
            ORDER BY TABLE_NAME
            "#,
        )
        .bind(database)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| format!("Failed to list tables: {e}"))?;

        Ok(rows
            .into_iter()
            .map(|r| TableInfo {
                database: database.to_string(),
                schema: None,
                name: r.try_get("name").unwrap_or_default(),
                rows_estimate: r.try_get("rows_estimate").ok(),
                data_length_bytes: r.try_get("data_length_bytes").ok(),
                engine: r.try_get("engine").ok(),
                tablespace: None,
                owner: None,
                modified_at: r.try_get("modified_at").ok(),
                comment: r.try_get("comment").ok(),
            })
            .collect())
    }

    async fn list_views(
        &self,
        database: &str,
        _schema: Option<&str>,
    ) -> Result<Vec<ViewInfo>, String> {
        let rows = sqlx::query(
            r#"
            SELECT
                TABLE_NAME AS name,
                DEFINER AS owner,
                IS_UPDATABLE AS is_updatable
            FROM information_schema.VIEWS
            WHERE TABLE_SCHEMA = ?
            ORDER BY TABLE_NAME
            "#,
        )
        .bind(database)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| format!("Failed to list views: {e}"))?;

        Ok(rows
            .into_iter()
            .map(|r| {
                let updatable: Option<String> = r.try_get("is_updatable").ok();
                ViewInfo {
                    database: database.to_string(),
                    schema: None,
                    name: r.try_get("name").unwrap_or_default(),
                    owner: r.try_get("owner").ok(),
                    is_updatable: updatable.map(|v| v.eq_ignore_ascii_case("YES")),
                    comment: None,
                }
            })
            .collect())
    }

    async fn list_columns(
        &self,
        database: &str,
        _schema: Option<&str>,
        table: &str,
    ) -> Result<Vec<ColumnInfo>, String> {
        let rows = sqlx::query(
            r#"
            SELECT
                COLUMN_NAME AS name,
                CAST(ORDINAL_POSITION AS SIGNED) AS ordinal_position,
                DATA_TYPE AS data_type,
                COLUMN_TYPE AS column_type,
                IS_NULLABLE AS is_nullable,
                COLUMN_DEFAULT AS default_value,
                COLUMN_KEY AS column_key,
                EXTRA AS extra,
                CHARACTER_SET_NAME AS character_set,
                COLLATION_NAME AS collation,
                COLUMN_COMMENT AS comment
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
            ORDER BY ORDINAL_POSITION
            "#,
        )
        .bind(database)
        .bind(table)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| format!("Failed to list columns: {e}"))?;

        Ok(rows
            .into_iter()
            .map(|r| {
                let nullable_str: String = r.try_get("is_nullable").unwrap_or_default();
                let col_key: String = r.try_get("column_key").unwrap_or_default();
                let extra: String = r.try_get("extra").unwrap_or_default();
                let pos: i64 = r.try_get("ordinal_position").unwrap_or(0);
                ColumnInfo {
                    name: r.try_get("name").unwrap_or_default(),
                    ordinal_position: pos as i32,
                    data_type: r.try_get("data_type").unwrap_or_default(),
                    column_type: r.try_get("column_type").unwrap_or_default(),
                    nullable: nullable_str.eq_ignore_ascii_case("YES"),
                    default_value: r.try_get("default_value").ok(),
                    is_primary_key: col_key.eq_ignore_ascii_case("PRI"),
                    is_auto_increment: extra.to_ascii_lowercase().contains("auto_increment"),
                    character_set: r.try_get("character_set").ok(),
                    collation: r.try_get("collation").ok(),
                    comment: r.try_get("comment").ok(),
                }
            })
            .collect())
    }

    async fn list_indexes(
        &self,
        database: &str,
        _schema: Option<&str>,
        table: &str,
    ) -> Result<Vec<IndexInfo>, String> {
        let rows = sqlx::query(
            r#"
            SELECT
                INDEX_NAME AS index_name,
                COLUMN_NAME AS column_name,
                CAST(NON_UNIQUE AS SIGNED) AS non_unique,
                INDEX_TYPE AS index_type,
                INDEX_COMMENT AS comment
            FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
            ORDER BY INDEX_NAME, SEQ_IN_INDEX
            "#,
        )
        .bind(database)
        .bind(table)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| format!("Failed to list indexes: {e}"))?;

        let mut grouped: BTreeMap<String, IndexInfo> = BTreeMap::new();
        for r in rows {
            let idx_name: String = r.try_get("index_name").unwrap_or_default();
            let col_name: String = r.try_get("column_name").unwrap_or_default();
            let non_unique: i64 = r.try_get("non_unique").unwrap_or(1);
            let index_type: Option<String> = r.try_get("index_type").ok();
            let comment: Option<String> = r.try_get("comment").ok();

            let entry = grouped.entry(idx_name.clone()).or_insert_with(|| IndexInfo {
                is_primary: idx_name.eq_ignore_ascii_case("PRIMARY"),
                is_unique: non_unique == 0,
                name: idx_name,
                columns: Vec::new(),
                index_type,
                comment,
            });
            entry.columns.push(col_name);
        }

        Ok(grouped.into_values().collect())
    }

    async fn list_foreign_keys(
        &self,
        database: &str,
        _schema: Option<&str>,
        table: &str,
    ) -> Result<Vec<ForeignKeyInfo>, String> {
        let rows = sqlx::query(
            r#"
            SELECT
                kcu.CONSTRAINT_NAME AS name,
                kcu.COLUMN_NAME AS column_name,
                kcu.REFERENCED_TABLE_SCHEMA AS ref_schema,
                kcu.REFERENCED_TABLE_NAME AS ref_table,
                kcu.REFERENCED_COLUMN_NAME AS ref_column,
                rc.UPDATE_RULE AS on_update,
                rc.DELETE_RULE AS on_delete
            FROM information_schema.KEY_COLUMN_USAGE kcu
            LEFT JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
                ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
                AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
            WHERE kcu.TABLE_SCHEMA = ?
                AND kcu.TABLE_NAME = ?
                AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
            ORDER BY kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION
            "#,
        )
        .bind(database)
        .bind(table)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| format!("Failed to list foreign keys: {e}"))?;

        let mut grouped: BTreeMap<String, ForeignKeyInfo> = BTreeMap::new();
        for r in rows {
            let fk_name: String = r.try_get("name").unwrap_or_default();
            let col: String = r.try_get("column_name").unwrap_or_default();
            let ref_schema: Option<String> = r.try_get("ref_schema").ok();
            let ref_table: String = r.try_get("ref_table").unwrap_or_default();
            let ref_col: String = r.try_get("ref_column").unwrap_or_default();
            let on_update: Option<String> = r.try_get("on_update").ok();
            let on_delete: Option<String> = r.try_get("on_delete").ok();

            let entry = grouped.entry(fk_name.clone()).or_insert_with(|| ForeignKeyInfo {
                name: fk_name,
                columns: Vec::new(),
                referenced_schema: ref_schema,
                referenced_table: ref_table,
                referenced_columns: Vec::new(),
                on_update,
                on_delete,
            });
            entry.columns.push(col);
            entry.referenced_columns.push(ref_col);
        }

        Ok(grouped.into_values().collect())
    }

    async fn list_routines(
        &self,
        database: &str,
        _schema: Option<&str>,
    ) -> Result<Vec<RoutineInfo>, String> {
        let rows = sqlx::query(
            r#"
            SELECT
                ROUTINE_NAME AS name,
                ROUTINE_TYPE AS routine_type,
                DTD_IDENTIFIER AS return_type,
                DEFINER AS definer,
                ROUTINE_COMMENT AS comment
            FROM information_schema.ROUTINES
            WHERE ROUTINE_SCHEMA = ?
            ORDER BY ROUTINE_TYPE, ROUTINE_NAME
            "#,
        )
        .bind(database)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| format!("Failed to list routines: {e}"))?;

        Ok(rows
            .into_iter()
            .map(|r| RoutineInfo {
                database: database.to_string(),
                schema: None,
                name: r.try_get("name").unwrap_or_default(),
                routine_type: r.try_get("routine_type").unwrap_or_default(),
                return_type: r.try_get("return_type").ok(),
                definer: r.try_get("definer").ok(),
                comment: r.try_get("comment").ok(),
            })
            .collect())
    }

    async fn list_sequences(
        &self,
        _database: &str,
        _schema: Option<&str>,
    ) -> Result<Vec<SequenceInfo>, String> {
        Ok(Vec::new())
    }

    async fn get_object_ddl(
        &self,
        database: &str,
        _schema: Option<&str>,
        object_type: &str,
        object_name: &str,
    ) -> Result<String, String> {
        let q_db = self.kind.quote_identifier(database);
        let q_obj = self.kind.quote_identifier(object_name);
        let sql = match object_type.to_ascii_uppercase().as_str() {
            "TABLE" => format!("SHOW CREATE TABLE {q_db}.{q_obj}"),
            "VIEW" => format!("SHOW CREATE VIEW {q_db}.{q_obj}"),
            "FUNCTION" => format!("SHOW CREATE FUNCTION {q_db}.{q_obj}"),
            "PROCEDURE" => format!("SHOW CREATE PROCEDURE {q_db}.{q_obj}"),
            other => return Err(format!("Unsupported DDL object type for MySQL: {other}")),
        };

        let row = sqlx::query(&sql)
            .fetch_one(&self.pool)
            .await
            .map_err(|e| format!("Failed to load DDL: {e}"))?;

        let col_idx = match object_type.to_ascii_uppercase().as_str() {
            "FUNCTION" | "PROCEDURE" => 2,
            _ => 1,
        };
        row.try_get::<String, usize>(col_idx)
            .map_err(|e| format!("Failed to decode DDL column: {e}"))
    }

    async fn execute_query(
        &self,
        database: Option<&str>,
        _schema: Option<&str>,
        sql: &str,
    ) -> Result<QueryResultSet, String> {
        let mut conn = self
            .pool
            .acquire()
            .await
            .map_err(|e| format!("Failed to acquire MySQL connection: {e}"))?;

        if let Some(db) = database.filter(|s| !s.trim().is_empty()) {
            let use_sql = format!("USE {}", self.kind.quote_identifier(db));
            sqlx::query(&use_sql)
                .execute(&mut *conn)
                .await
                .map_err(|e| format!("Failed to switch database '{db}': {e}"))?;
        }

        Self::run_single_on_conn(&mut conn, sql).await
    }

    async fn execute_batch(
        &self,
        database: Option<&str>,
        _schema: Option<&str>,
        sql_batch: &str,
    ) -> Result<BatchQueryResponse, String> {
        let total_start = Instant::now();
        let statements = split_sql_statements(sql_batch);
        let mut conn = self
            .pool
            .acquire()
            .await
            .map_err(|e| format!("Failed to acquire MySQL connection: {e}"))?;

        if let Some(db) = database.filter(|s| !s.trim().is_empty()) {
            let use_sql = format!("USE {}", self.kind.quote_identifier(db));
            sqlx::query(&use_sql)
                .execute(&mut *conn)
                .await
                .map_err(|e| format!("Failed to switch database '{db}': {e}"))?;
        }

        let mut summaries = Vec::with_capacity(statements.len());
        for (index, stmt) in statements.into_iter().enumerate() {
            let stmt_start = Instant::now();
            match Self::run_single_on_conn(&mut conn, &stmt).await {
                Ok(rs) => {
                    let affected = rs.affected_rows;
                    let ms = rs.execution_ms;
                    summaries.push(StatementExecutionSummary {
                        index,
                        sql_preview: preview_sql(&stmt),
                        success: true,
                        affected_rows: affected,
                        execution_ms: ms,
                        error: None,
                        result_set: Some(rs),
                    });
                }
                Err(err) => {
                    summaries.push(StatementExecutionSummary {
                        index,
                        sql_preview: preview_sql(&stmt),
                        success: false,
                        affected_rows: 0,
                        execution_ms: stmt_start.elapsed().as_millis() as u64,
                        error: Some(err),
                        result_set: None,
                    });
                }
            }
        }

        Ok(BatchQueryResponse {
            statements: summaries,
            total_execution_ms: total_start.elapsed().as_millis() as u64,
        })
    }

    async fn close(&self) {
        self.pool.close().await;
    }
}

fn decode_mysql_cell(row: &MySqlRow, idx: usize) -> serde_json::Value {
    if let Ok(raw) = row.try_get_raw(idx) {
        if raw.is_null() {
            return serde_json::Value::Null;
        }
    }

    let col = &row.columns()[idx];
    let type_name = col.type_info().name().to_ascii_uppercase();

    match type_name.as_str() {
        "BOOLEAN" => {
            if let Ok(v) = row.try_get::<bool, usize>(idx) {
                return serde_json::Value::Bool(v);
            }
        }
        "TINYINT" | "SMALLINT" | "INT" | "MEDIUMINT" | "BIGINT" | "YEAR" => {
            if let Ok(v) = row.try_get::<i64, usize>(idx) {
                return serde_json::Value::Number(v.into());
            }
            if let Ok(v) = row.try_get::<u64, usize>(idx) {
                return serde_json::Value::Number(v.into());
            }
        }
        "TINYINT UNSIGNED" | "SMALLINT UNSIGNED" | "INT UNSIGNED" | "MEDIUMINT UNSIGNED"
        | "BIGINT UNSIGNED" => {
            if let Ok(v) = row.try_get::<u64, usize>(idx) {
                return serde_json::Value::Number(v.into());
            }
        }
        "FLOAT" | "DOUBLE" => {
            if let Ok(v) = row.try_get::<f64, usize>(idx) {
                if let Some(n) = serde_json::Number::from_f64(v) {
                    return serde_json::Value::Number(n);
                }
                return serde_json::Value::String(v.to_string());
            }
        }
        "DECIMAL" | "NEWDECIMAL" => {
            if let Ok(v) = row.try_get::<rust_decimal::Decimal, usize>(idx) {
                return serde_json::Value::String(v.to_string());
            }
        }
        "JSON" => {
            if let Ok(v) = row.try_get::<serde_json::Value, usize>(idx) {
                return v;
            }
        }
        "DATE" => {
            if let Ok(v) = row.try_get::<chrono::NaiveDate, usize>(idx) {
                return serde_json::Value::String(v.to_string());
            }
        }
        "TIME" => {
            if let Ok(v) = row.try_get::<chrono::NaiveTime, usize>(idx) {
                return serde_json::Value::String(v.to_string());
            }
        }
        "DATETIME" => {
            if let Ok(v) = row.try_get::<chrono::NaiveDateTime, usize>(idx) {
                return serde_json::Value::String(v.format("%Y-%m-%d %H:%M:%S%.f").to_string());
            }
        }
        "TIMESTAMP" => {
            if let Ok(v) = row.try_get::<chrono::DateTime<chrono::Utc>, usize>(idx) {
                return serde_json::Value::String(v.to_rfc3339());
            }
            if let Ok(v) = row.try_get::<chrono::NaiveDateTime, usize>(idx) {
                return serde_json::Value::String(v.format("%Y-%m-%d %H:%M:%S%.f").to_string());
            }
        }
        "BLOB" | "TINYBLOB" | "MEDIUMBLOB" | "LONGBLOB" | "BINARY" | "VARBINARY" | "BIT" => {
            if let Ok(bytes) = row.try_get::<Vec<u8>, usize>(idx) {
                return serde_json::Value::String(bytes_to_hex_preview(&bytes));
            }
        }
        _ => {}
    }

    if let Ok(s) = row.try_get::<String, usize>(idx) {
        return serde_json::Value::String(s);
    }
    if let Ok(bytes) = row.try_get::<Vec<u8>, usize>(idx) {
        return match std::str::from_utf8(&bytes) {
            Ok(text) => serde_json::Value::String(text.to_string()),
            Err(_) => serde_json::Value::String(bytes_to_hex_preview(&bytes)),
        };
    }

    serde_json::Value::String(format!("<{type_name}>"))
}
