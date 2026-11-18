use std::collections::{BTreeMap, HashMap};
use std::time::{Duration, Instant};

use async_trait::async_trait;
use futures_util::StreamExt;
use sqlx::postgres::{PgConnectOptions, PgPool, PgPoolOptions, PgRow, PgSslMode};
use sqlx::{Column, Either, Executor, Row, TypeInfo, ValueRef};
use tokio::sync::RwLock;

use crate::drivers::{bytes_to_hex_preview, preview_sql, split_sql_statements, DatabaseDriver, MAX_QUERY_ROWS};
use crate::models::{
    BatchQueryResponse, ColumnInfo, ConnectionProfile, ConnectionTestResult, DatabaseInfo, DbKind,
    ForeignKeyInfo, IndexInfo, QueryColumn, QueryResultSet, RoutineInfo, SchemaInfo, SequenceInfo,
    SslMode, StatementExecutionSummary, TableInfo, ViewInfo,
};

pub struct PostgresDriver {
    profile: ConnectionProfile,
    default_db: String,
    pools: RwLock<HashMap<String, PgPool>>,
}

impl PostgresDriver {
    pub async fn connect(profile: &ConnectionProfile) -> Result<Self, String> {
        let default_db = profile
            .initial_database
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("postgres")
            .to_string();

        let pool = Self::build_pool(profile, &default_db).await?;
        let mut map = HashMap::new();
        map.insert(default_db.clone(), pool);

        Ok(Self {
            profile: profile.clone(),
            default_db,
            pools: RwLock::new(map),
        })
    }

    async fn build_pool(profile: &ConnectionProfile, database: &str) -> Result<PgPool, String> {
        let mut opts = PgConnectOptions::new()
            .host(&profile.host)
            .port(profile.port)
            .username(&profile.username)
            .password(profile.password.as_deref().unwrap_or(""))
            .database(database);

        let ssl_mode = if !profile.ssl.use_ssl {
            PgSslMode::Disable
        } else {
            match profile.ssl.mode {
                SslMode::Disable => PgSslMode::Disable,
                SslMode::Prefer => PgSslMode::Prefer,
                SslMode::Require => PgSslMode::Require,
                SslMode::VerifyCa => PgSslMode::VerifyCa,
                SslMode::VerifyFull => PgSslMode::VerifyFull,
            }
        };
        opts = opts.ssl_mode(ssl_mode);

        if profile.ssl.use_ssl {
            if let Some(ca) = profile.ssl.ca_cert_path.as_deref().filter(|s| !s.trim().is_empty()) {
                opts = opts.ssl_root_cert(ca.trim());
            }
            if let Some(cert) = profile.ssl.client_cert_path.as_deref().filter(|s| !s.trim().is_empty()) {
                opts = opts.ssl_client_cert(cert.trim());
            }
            if let Some(key) = profile.ssl.client_key_path.as_deref().filter(|s| !s.trim().is_empty()) {
                opts = opts.ssl_client_key(key.trim());
            }
        }

        let timeout = Duration::from_secs(profile.connect_timeout_secs.max(3) as u64);
        PgPoolOptions::new()
            .max_connections(5)
            .acquire_timeout(timeout)
            .connect_with(opts)
            .await
            .map_err(|e| format!("PostgreSQL connection failed (db '{database}'): {e}"))
    }

    async fn pool_for_db(&self, database: Option<&str>) -> Result<PgPool, String> {
        let target_db = database
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or(&self.default_db);

        {
            let guard = self.pools.read().await;
            if let Some(pool) = guard.get(target_db) {
                return Ok(pool.clone());
            }
        }

        let new_pool = Self::build_pool(&self.profile, target_db).await?;
        let mut guard = self.pools.write().await;
        let entry = guard.entry(target_db.to_string()).or_insert_with(|| new_pool.clone());
        Ok(entry.clone())
    }

    async fn run_single_on_conn(
        conn: &mut sqlx::PgConnection,
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
                                decoded.push(decode_pg_cell(&row, idx));
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
impl DatabaseDriver for PostgresDriver {
    fn db_kind(&self) -> DbKind {
        DbKind::Postgres
    }

    async fn test_connection(&self) -> Result<ConnectionTestResult, String> {
        let start = Instant::now();
        let pool = self.pool_for_db(None).await?;
        let row = sqlx::query("SELECT version() AS ver")
            .fetch_one(&pool)
            .await
            .map_err(|e| format!("PostgreSQL ping failed: {e}"))?;

        let version: String = row.try_get("ver").unwrap_or_else(|_| "unknown".to_string());
        Ok(ConnectionTestResult {
            success: true,
            db_kind: DbKind::Postgres,
            server_version: Some(version.clone()),
            latency_ms: start.elapsed().as_millis() as u64,
            message: format!("Connected successfully ({version})"),
        })
    }

    async fn list_databases(&self) -> Result<Vec<DatabaseInfo>, String> {
        let pool = self.pool_for_db(None).await?;
        let rows = sqlx::query(
            r#"
            SELECT
                d.datname::text AS name,
                pg_encoding_to_char(d.encoding)::text AS charset,
                d.datcollate::text AS collation,
                pg_catalog.pg_get_userbyid(d.datdba)::text AS owner,
                pg_database_size(d.datname)::bigint AS size_bytes
            FROM pg_database d
            WHERE d.datistemplate = false
            ORDER BY d.datname
            "#,
        )
        .fetch_all(&pool)
        .await
        .map_err(|e| format!("Failed to list PostgreSQL databases: {e}"))?;

        Ok(rows
            .into_iter()
            .map(|r| DatabaseInfo {
                name: r.try_get("name").unwrap_or_default(),
                charset: r.try_get("charset").ok(),
                collation: r.try_get("collation").ok(),
                owner: r.try_get("owner").ok(),
                size_bytes: r.try_get("size_bytes").ok(),
            })
            .collect())
    }

    async fn list_schemas(&self, database: &str) -> Result<Vec<SchemaInfo>, String> {
        let pool = self.pool_for_db(Some(database)).await?;
        let rows = sqlx::query(
            r#"
            SELECT
                schema_name::text AS name,
                schema_owner::text AS owner
            FROM information_schema.schemata
            WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
              AND schema_name NOT LIKE 'pg_toast%'
              AND schema_name NOT LIKE 'pg_temp_%'
            ORDER BY schema_name
            "#,
        )
        .fetch_all(&pool)
        .await
        .map_err(|e| format!("Failed to list PostgreSQL schemas: {e}"))?;

        Ok(rows
            .into_iter()
            .map(|r| SchemaInfo {
                database: database.to_string(),
                name: r.try_get("name").unwrap_or_default(),
                owner: r.try_get("owner").ok(),
            })
            .collect())
    }

    async fn list_tables(
        &self,
        database: &str,
        schema: Option<&str>,
    ) -> Result<Vec<TableInfo>, String> {
        let schema_name = schema.unwrap_or("public");
        let pool = self.pool_for_db(Some(database)).await?;
        let rows = sqlx::query(
            r#"
            SELECT
                c.relname::text AS name,
                CASE WHEN c.reltuples >= 0 THEN c.reltuples::bigint ELSE NULL END AS rows_estimate,
                pg_total_relation_size(c.oid)::bigint AS data_length_bytes,
                COALESCE(ts.spcname, 'pg_default')::text AS tablespace,
                pg_catalog.pg_get_userbyid(c.relowner)::text AS owner,
                pg_catalog.obj_description(c.oid, 'pg_class')::text AS comment
            FROM pg_catalog.pg_class c
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            LEFT JOIN pg_catalog.pg_tablespace ts ON ts.oid = c.reltablespace
            WHERE n.nspname = $1
              AND c.relkind IN ('r', 'p')
            ORDER BY c.relname
            "#,
        )
        .bind(schema_name)
        .fetch_all(&pool)
        .await
        .map_err(|e| format!("Failed to list PostgreSQL tables: {e}"))?;

        Ok(rows
            .into_iter()
            .map(|r| TableInfo {
                database: database.to_string(),
                schema: Some(schema_name.to_string()),
                name: r.try_get("name").unwrap_or_default(),
                rows_estimate: r.try_get("rows_estimate").ok(),
                data_length_bytes: r.try_get("data_length_bytes").ok(),
                engine: Some("PostgreSQL".to_string()),
                tablespace: r.try_get("tablespace").ok(),
                owner: r.try_get("owner").ok(),
                modified_at: None,
                comment: r.try_get("comment").ok(),
            })
            .collect())
    }

    async fn list_views(
        &self,
        database: &str,
        schema: Option<&str>,
    ) -> Result<Vec<ViewInfo>, String> {
        let schema_name = schema.unwrap_or("public");
        let pool = self.pool_for_db(Some(database)).await?;
        let rows = sqlx::query(
            r#"
            SELECT
                c.relname::text AS name,
                pg_catalog.pg_get_userbyid(c.relowner)::text AS owner,
                (v.is_updatable = 'YES') AS is_updatable,
                pg_catalog.obj_description(c.oid, 'pg_class')::text AS comment
            FROM pg_catalog.pg_class c
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            LEFT JOIN information_schema.views v
                ON v.table_schema = n.nspname AND v.table_name = c.relname
            WHERE n.nspname = $1
              AND c.relkind IN ('v', 'm')
            ORDER BY c.relname
            "#,
        )
        .bind(schema_name)
        .fetch_all(&pool)
        .await
        .map_err(|e| format!("Failed to list PostgreSQL views: {e}"))?;

        Ok(rows
            .into_iter()
            .map(|r| ViewInfo {
                database: database.to_string(),
                schema: Some(schema_name.to_string()),
                name: r.try_get("name").unwrap_or_default(),
                owner: r.try_get("owner").ok(),
                is_updatable: r.try_get("is_updatable").ok(),
                comment: r.try_get("comment").ok(),
            })
            .collect())
    }

    async fn list_columns(
        &self,
        database: &str,
        schema: Option<&str>,
        table: &str,
    ) -> Result<Vec<ColumnInfo>, String> {
        let schema_name = schema.unwrap_or("public");
        let pool = self.pool_for_db(Some(database)).await?;
        let rows = sqlx::query(
            r#"
            SELECT
                a.attname::text AS name,
                a.attnum::int4 AS ordinal_position,
                t.typname::text AS data_type,
                pg_catalog.format_type(a.atttypid, a.atttypmod)::text AS column_type,
                NOT a.attnotnull AS nullable,
                pg_catalog.pg_get_expr(d.adbin, d.adrelid)::text AS default_value,
                COALESCE(pk.is_pk, false) AS is_primary_key,
                (a.attidentity IN ('a', 'd')
                    OR COALESCE(pg_catalog.pg_get_expr(d.adbin, d.adrelid), '') LIKE 'nextval(%') AS is_auto_increment,
                pg_catalog.col_description(c.oid, a.attnum)::text AS comment
            FROM pg_catalog.pg_attribute a
            JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            JOIN pg_catalog.pg_type t ON t.oid = a.atttypid
            LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
            LEFT JOIN (
                SELECT i.indrelid, unnest(i.indkey) AS attnum, true AS is_pk
                FROM pg_catalog.pg_index i
                WHERE i.indisprimary
            ) pk ON pk.indrelid = c.oid AND pk.attnum = a.attnum
            WHERE n.nspname = $1
              AND c.relname = $2
              AND a.attnum > 0
              AND NOT a.attisdropped
            ORDER BY a.attnum
            "#,
        )
        .bind(schema_name)
        .bind(table)
        .fetch_all(&pool)
        .await
        .map_err(|e| format!("Failed to list PostgreSQL columns: {e}"))?;

        Ok(rows
            .into_iter()
            .map(|r| ColumnInfo {
                name: r.try_get("name").unwrap_or_default(),
                ordinal_position: r.try_get("ordinal_position").unwrap_or(0),
                data_type: r.try_get("data_type").unwrap_or_default(),
                column_type: r.try_get("column_type").unwrap_or_default(),
                nullable: r.try_get("nullable").unwrap_or(true),
                default_value: r.try_get("default_value").ok(),
                is_primary_key: r.try_get("is_primary_key").unwrap_or(false),
                is_auto_increment: r.try_get("is_auto_increment").unwrap_or(false),
                character_set: None,
                collation: None,
                comment: r.try_get("comment").ok(),
            })
            .collect())
    }

    async fn list_indexes(
        &self,
        database: &str,
        schema: Option<&str>,
        table: &str,
    ) -> Result<Vec<IndexInfo>, String> {
        let schema_name = schema.unwrap_or("public");
        let pool = self.pool_for_db(Some(database)).await?;
        let rows = sqlx::query(
            r#"
            SELECT
                idx.relname::text AS index_name,
                a.attname::text AS column_name,
                ix.indisunique AS is_unique,
                ix.indisprimary AS is_primary,
                am.amname::text AS index_type,
                pg_catalog.obj_description(idx.oid, 'pg_class')::text AS comment
            FROM pg_catalog.pg_index ix
            JOIN pg_catalog.pg_class tbl ON tbl.oid = ix.indrelid
            JOIN pg_catalog.pg_namespace n ON n.oid = tbl.relnamespace
            JOIN pg_catalog.pg_class idx ON idx.oid = ix.indexrelid
            JOIN pg_catalog.pg_am am ON am.oid = idx.relam
            CROSS JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord)
            LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid = tbl.oid AND a.attnum = k.attnum
            WHERE n.nspname = $1
              AND tbl.relname = $2
            ORDER BY idx.relname, k.ord
            "#,
        )
        .bind(schema_name)
        .bind(table)
        .fetch_all(&pool)
        .await
        .map_err(|e| format!("Failed to list PostgreSQL indexes: {e}"))?;

        let mut grouped: BTreeMap<String, IndexInfo> = BTreeMap::new();
        for r in rows {
            let idx_name: String = r.try_get("index_name").unwrap_or_default();
            let col_name: String = r.try_get("column_name").unwrap_or_else(|_| "<expr>".to_string());
            let is_unique: bool = r.try_get("is_unique").unwrap_or(false);
            let is_primary: bool = r.try_get("is_primary").unwrap_or(false);
            let index_type: Option<String> = r.try_get("index_type").ok();
            let comment: Option<String> = r.try_get("comment").ok();

            let entry = grouped.entry(idx_name.clone()).or_insert_with(|| IndexInfo {
                name: idx_name,
                columns: Vec::new(),
                is_unique,
                is_primary,
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
        schema: Option<&str>,
        table: &str,
    ) -> Result<Vec<ForeignKeyInfo>, String> {
        let schema_name = schema.unwrap_or("public");
        let pool = self.pool_for_db(Some(database)).await?;
        let rows = sqlx::query(
            r#"
            SELECT
                con.conname::text AS name,
                src_att.attname::text AS column_name,
                ref_ns.nspname::text AS ref_schema,
                ref_tbl.relname::text AS ref_table,
                ref_att.attname::text AS ref_column,
                con.confupdtype::text AS on_update_code,
                con.confdeltype::text AS on_delete_code
            FROM pg_catalog.pg_constraint con
            JOIN pg_catalog.pg_class src_tbl ON src_tbl.oid = con.conrelid
            JOIN pg_catalog.pg_namespace src_ns ON src_ns.oid = src_tbl.relnamespace
            JOIN pg_catalog.pg_class ref_tbl ON ref_tbl.oid = con.confrelid
            JOIN pg_catalog.pg_namespace ref_ns ON ref_ns.oid = ref_tbl.relnamespace
            CROSS JOIN LATERAL unnest(con.conkey, con.confkey) WITH ORDINALITY AS cols(src_num, ref_num, ord)
            JOIN pg_catalog.pg_attribute src_att ON src_att.attrelid = src_tbl.oid AND src_att.attnum = cols.src_num
            JOIN pg_catalog.pg_attribute ref_att ON ref_att.attrelid = ref_tbl.oid AND ref_att.attnum = cols.ref_num
            WHERE con.contype = 'f'
              AND src_ns.nspname = $1
              AND src_tbl.relname = $2
            ORDER BY con.conname, cols.ord
            "#,
        )
        .bind(schema_name)
        .bind(table)
        .fetch_all(&pool)
        .await
        .map_err(|e| format!("Failed to list PostgreSQL foreign keys: {e}"))?;

        let mut grouped: BTreeMap<String, ForeignKeyInfo> = BTreeMap::new();
        for r in rows {
            let fk_name: String = r.try_get("name").unwrap_or_default();
            let col: String = r.try_get("column_name").unwrap_or_default();
            let ref_schema: Option<String> = r.try_get("ref_schema").ok();
            let ref_table: String = r.try_get("ref_table").unwrap_or_default();
            let ref_col: String = r.try_get("ref_column").unwrap_or_default();
            let upd_code: String = r.try_get("on_update_code").unwrap_or_default();
            let del_code: String = r.try_get("on_delete_code").unwrap_or_default();

            let entry = grouped.entry(fk_name.clone()).or_insert_with(|| ForeignKeyInfo {
                name: fk_name,
                columns: Vec::new(),
                referenced_schema: ref_schema,
                referenced_table: ref_table,
                referenced_columns: Vec::new(),
                on_update: Some(pg_fk_action(&upd_code).to_string()),
                on_delete: Some(pg_fk_action(&del_code).to_string()),
            });
            entry.columns.push(col);
            entry.referenced_columns.push(ref_col);
        }

        Ok(grouped.into_values().collect())
    }

    async fn list_routines(
        &self,
        database: &str,
        schema: Option<&str>,
    ) -> Result<Vec<RoutineInfo>, String> {
        let schema_name = schema.unwrap_or("public");
        let pool = self.pool_for_db(Some(database)).await?;
        let rows = sqlx::query(
            r#"
            SELECT
                p.proname::text AS name,
                CASE p.prokind
                    WHEN 'p' THEN 'PROCEDURE'
                    WHEN 'a' THEN 'AGGREGATE'
                    ELSE 'FUNCTION'
                END AS routine_type,
                pg_catalog.format_type(p.prorettype, NULL)::text AS return_type,
                pg_catalog.pg_get_userbyid(p.proowner)::text AS definer,
                pg_catalog.obj_description(p.oid, 'pg_proc')::text AS comment
            FROM pg_catalog.pg_proc p
            JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = $1
            ORDER BY routine_type, p.proname
            "#,
        )
        .bind(schema_name)
        .fetch_all(&pool)
        .await
        .map_err(|e| format!("Failed to list PostgreSQL routines: {e}"))?;

        Ok(rows
            .into_iter()
            .map(|r| RoutineInfo {
                database: database.to_string(),
                schema: Some(schema_name.to_string()),
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
        database: &str,
        schema: Option<&str>,
    ) -> Result<Vec<SequenceInfo>, String> {
        let schema_name = schema.unwrap_or("public");
        let pool = self.pool_for_db(Some(database)).await?;
        let rows = sqlx::query(
            r#"
            SELECT
                sequencename::text AS name,
                data_type::text AS data_type,
                last_value::bigint AS last_value
            FROM pg_catalog.pg_sequences
            WHERE schemaname = $1
            ORDER BY sequencename
            "#,
        )
        .bind(schema_name)
        .fetch_all(&pool)
        .await
        .map_err(|e| format!("Failed to list PostgreSQL sequences: {e}"))?;

        Ok(rows
            .into_iter()
            .map(|r| SequenceInfo {
                database: database.to_string(),
                schema: schema_name.to_string(),
                name: r.try_get("name").unwrap_or_default(),
                data_type: r.try_get("data_type").ok(),
                last_value: r.try_get("last_value").ok(),
            })
            .collect())
    }

    async fn get_object_ddl(
        &self,
        database: &str,
        schema: Option<&str>,
        object_type: &str,
        object_name: &str,
    ) -> Result<String, String> {
        let schema_name = schema.unwrap_or("public");
        let pool = self.pool_for_db(Some(database)).await?;
        let q_schema = DbKind::Postgres.quote_identifier(schema_name);
        let q_obj = DbKind::Postgres.quote_identifier(object_name);

        match object_type.to_ascii_uppercase().as_str() {
            "VIEW" => {
                let row = sqlx::query(
                    r#"
                    SELECT pg_catalog.pg_get_viewdef(c.oid, true)::text AS def
                    FROM pg_catalog.pg_class c
                    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = $1 AND c.relname = $2
                    "#,
                )
                .bind(schema_name)
                .bind(object_name)
                .fetch_one(&pool)
                .await
                .map_err(|e| format!("Failed to fetch PostgreSQL view definition: {e}"))?;

                let def: String = row.try_get("def").unwrap_or_default();
                Ok(format!("CREATE OR REPLACE VIEW {q_schema}.{q_obj} AS\n{def}"))
            }
            "FUNCTION" | "PROCEDURE" => {
                let row = sqlx::query(
                    r#"
                    SELECT pg_catalog.pg_get_functiondef(p.oid)::text AS def
                    FROM pg_catalog.pg_proc p
                    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = $1 AND p.proname = $2
                    LIMIT 1
                    "#,
                )
                .bind(schema_name)
                .bind(object_name)
                .fetch_one(&pool)
                .await
                .map_err(|e| format!("Failed to fetch PostgreSQL routine definition: {e}"))?;
                row.try_get("def")
                    .map_err(|e| format!("Failed to decode routine DDL: {e}"))
            }
            "TABLE" => {
                let cols = self.list_columns(database, Some(schema_name), object_name).await?;
                let pks: Vec<String> = cols
                    .iter()
                    .filter(|c| c.is_primary_key)
                    .map(|c| DbKind::Postgres.quote_identifier(&c.name))
                    .collect();

                let mut lines: Vec<String> = cols
                    .iter()
                    .map(|c| {
                        let mut line = format!(
                            "  {} {}",
                            DbKind::Postgres.quote_identifier(&c.name),
                            c.column_type
                        );
                        if !c.nullable {
                            line.push_str(" NOT NULL");
                        }
                        if let Some(def) = c.default_value.as_deref() {
                            line.push_str(&format!(" DEFAULT {def}"));
                        }
                        line
                    })
                    .collect();

                if !pks.is_empty() {
                    lines.push(format!("  PRIMARY KEY ({})", pks.join(", ")));
                }

                Ok(format!(
                    "CREATE TABLE {q_schema}.{q_obj} (\n{}\n);",
                    lines.join(",\n")
                ))
            }
            other => Err(format!("Unsupported DDL object type for PostgreSQL: {other}")),
        }
    }

    async fn execute_query(
        &self,
        database: Option<&str>,
        schema: Option<&str>,
        sql: &str,
    ) -> Result<QueryResultSet, String> {
        let pool = self.pool_for_db(database).await?;
        let mut conn = pool
            .acquire()
            .await
            .map_err(|e| format!("Failed to acquire PostgreSQL connection: {e}"))?;

        if let Some(sc) = schema.filter(|s| !s.trim().is_empty()) {
            let search_path = format!(
                "SET search_path TO {}, public",
                DbKind::Postgres.quote_identifier(sc.trim())
            );
            sqlx::query(&search_path)
                .execute(&mut *conn)
                .await
                .map_err(|e| format!("Failed to set search_path '{sc}': {e}"))?;
        }

        Self::run_single_on_conn(&mut conn, sql).await
    }

    async fn execute_batch(
        &self,
        database: Option<&str>,
        schema: Option<&str>,
        sql_batch: &str,
    ) -> Result<BatchQueryResponse, String> {
        let total_start = Instant::now();
        let statements = split_sql_statements(sql_batch);
        let pool = self.pool_for_db(database).await?;
        let mut conn = pool
            .acquire()
            .await
            .map_err(|e| format!("Failed to acquire PostgreSQL connection: {e}"))?;

        if let Some(sc) = schema.filter(|s| !s.trim().is_empty()) {
            let search_path = format!(
                "SET search_path TO {}, public",
                DbKind::Postgres.quote_identifier(sc.trim())
            );
            sqlx::query(&search_path)
                .execute(&mut *conn)
                .await
                .map_err(|e| format!("Failed to set search_path '{sc}': {e}"))?;
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
        let pools: Vec<PgPool> = {
            let mut guard = self.pools.write().await;
            guard.drain().map(|(_, p)| p).collect()
        };
        for pool in pools {
            pool.close().await;
        }
    }
}

fn pg_fk_action(code: &str) -> &'static str {
    match code {
        "a" => "NO ACTION",
        "r" => "RESTRICT",
        "c" => "CASCADE",
        "n" => "SET NULL",
        "d" => "SET DEFAULT",
        _ => "NO ACTION",
    }
}

fn decode_pg_cell(row: &PgRow, idx: usize) -> serde_json::Value {
    if let Ok(raw) = row.try_get_raw(idx) {
        if raw.is_null() {
            return serde_json::Value::Null;
        }
    }

    let col = &row.columns()[idx];
    let type_name = col.type_info().name().to_ascii_uppercase();

    match type_name.as_str() {
        "BOOL" => {
            if let Ok(v) = row.try_get::<bool, usize>(idx) {
                return serde_json::Value::Bool(v);
            }
        }
        "INT2" => {
            if let Ok(v) = row.try_get::<i16, usize>(idx) {
                return serde_json::Value::Number(v.into());
            }
        }
        "INT4" => {
            if let Ok(v) = row.try_get::<i32, usize>(idx) {
                return serde_json::Value::Number(v.into());
            }
        }
        "INT8" => {
            if let Ok(v) = row.try_get::<i64, usize>(idx) {
                return serde_json::Value::Number(v.into());
            }
        }
        "FLOAT4" => {
            if let Ok(v) = row.try_get::<f32, usize>(idx) {
                if let Some(n) = serde_json::Number::from_f64(v as f64) {
                    return serde_json::Value::Number(n);
                }
                return serde_json::Value::String(v.to_string());
            }
        }
        "FLOAT8" => {
            if let Ok(v) = row.try_get::<f64, usize>(idx) {
                if let Some(n) = serde_json::Number::from_f64(v) {
                    return serde_json::Value::Number(n);
                }
                return serde_json::Value::String(v.to_string());
            }
        }
        "NUMERIC" => {
            if let Ok(v) = row.try_get::<rust_decimal::Decimal, usize>(idx) {
                return serde_json::Value::String(v.to_string());
            }
        }
        "JSON" | "JSONB" => {
            if let Ok(v) = row.try_get::<serde_json::Value, usize>(idx) {
                return v;
            }
        }
        "UUID" => {
            if let Ok(v) = row.try_get::<uuid::Uuid, usize>(idx) {
                return serde_json::Value::String(v.to_string());
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
        "TIMESTAMP" => {
            if let Ok(v) = row.try_get::<chrono::NaiveDateTime, usize>(idx) {
                return serde_json::Value::String(v.format("%Y-%m-%d %H:%M:%S%.f").to_string());
            }
        }
        "TIMESTAMPTZ" => {
            if let Ok(v) = row.try_get::<chrono::DateTime<chrono::Utc>, usize>(idx) {
                return serde_json::Value::String(v.to_rfc3339());
            }
        }
        "BYTEA" => {
            if let Ok(bytes) = row.try_get::<Vec<u8>, usize>(idx) {
                return serde_json::Value::String(bytes_to_hex_preview(&bytes));
            }
        }
        _ => {}
    }

    if let Ok(s) = row.try_get::<String, usize>(idx) {
        return serde_json::Value::String(s);
    }
    if let Ok(raw) = row.try_get_raw(idx) {
        if let Ok(text) = raw.as_str() {
            return serde_json::Value::String(text.to_string());
        }
        if let Ok(bytes) = raw.as_bytes() {
            return serde_json::Value::String(bytes_to_hex_preview(bytes));
        }
    }

    serde_json::Value::String(format!("<{type_name}>"))
}
