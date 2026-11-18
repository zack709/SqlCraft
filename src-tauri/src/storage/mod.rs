use std::path::{Path, PathBuf};

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use rand::RngCore;
use sha2::{Digest, Sha256};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions};
use sqlx::Row;

use crate::models::{
    ConnectionProfile, DbKind, HttpTunnelConfig, SavedQuery, SshTunnelConfig, SslConfig,
};

const CIPHER_PREFIX: &str = "v1:";

/// AES-256-GCM credential cipher for encrypting stored passwords and SSH passphrases at rest.
#[derive(Clone)]
pub struct CredentialCipher {
    key: [u8; 32],
}

impl CredentialCipher {
    pub fn from_key(key: [u8; 32]) -> Self {
        Self { key }
    }

    pub fn load_or_create(app_dir: &Path) -> Result<Self, String> {
        std::fs::create_dir_all(app_dir)
            .map_err(|e| format!("Failed to create SqlCraft data directory: {e}"))?;
        let key_path = app_dir.join("master.key");
        if key_path.exists() {
            let raw = std::fs::read_to_string(&key_path)
                .map_err(|e| format!("Failed to read master key: {e}"))?;
            let decoded = BASE64
                .decode(raw.trim())
                .map_err(|e| format!("Invalid master key encoding: {e}"))?;
            if decoded.len() == 32 {
                let mut key = [0u8; 32];
                key.copy_from_slice(&decoded);
                return Ok(Self { key });
            }
            let hash = Sha256::digest(&decoded);
            let mut key = [0u8; 32];
            key.copy_from_slice(&hash);
            return Ok(Self { key });
        }

        let mut key = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut key);
        let encoded = BASE64.encode(key);
        std::fs::write(&key_path, encoded)
            .map_err(|e| format!("Failed to persist master key: {e}"))?;
        Ok(Self { key })
    }

    pub fn encrypt(&self, plaintext: &str) -> Result<String, String> {
        let cipher = Aes256Gcm::new_from_slice(&self.key)
            .map_err(|e| format!("Cipher init failed: {e}"))?;
        let mut nonce_bytes = [0u8; 12];
        rand::thread_rng().fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);
        let ciphertext = cipher
            .encrypt(nonce, plaintext.as_bytes())
            .map_err(|e| format!("Encryption failed: {e}"))?;

        let mut combined = Vec::with_capacity(12 + ciphertext.len());
        combined.extend_from_slice(&nonce_bytes);
        combined.extend_from_slice(&ciphertext);
        Ok(format!("{CIPHER_PREFIX}{}", BASE64.encode(combined)))
    }

    pub fn decrypt(&self, encoded: &str) -> Result<String, String> {
        let payload = encoded
            .strip_prefix(CIPHER_PREFIX)
            .ok_or_else(|| "Unsupported credential cipher prefix".to_string())?;
        let combined = BASE64
            .decode(payload)
            .map_err(|e| format!("Invalid encrypted payload: {e}"))?;
        if combined.len() < 13 {
            return Err("Encrypted payload is too short".to_string());
        }
        let (nonce_bytes, ciphertext) = combined.split_at(12);
        let cipher = Aes256Gcm::new_from_slice(&self.key)
            .map_err(|e| format!("Cipher init failed: {e}"))?;
        let plaintext = cipher
            .decrypt(Nonce::from_slice(nonce_bytes), ciphertext)
            .map_err(|e| format!("Decryption failed: {e}"))?;
        String::from_utf8(plaintext).map_err(|e| format!("Invalid UTF-8 in secret: {e}"))
    }

    pub fn encrypt_opt(&self, value: &Option<String>) -> Result<Option<String>, String> {
        match value.as_deref() {
            Some(s) if !s.is_empty() => Ok(Some(self.encrypt(s)?)),
            _ => Ok(None),
        }
    }

    pub fn decrypt_opt(&self, value: &Option<String>) -> Result<Option<String>, String> {
        match value.as_deref() {
            Some(s) if !s.is_empty() => {
                if s.starts_with(CIPHER_PREFIX) {
                    Ok(Some(self.decrypt(s)?))
                } else {
                    Ok(Some(s.to_string()))
                }
            }
            _ => Ok(None),
        }
    }
}

/// Local SQLite store for connection profiles and saved queries.
#[derive(Clone)]
pub struct ProfileStore {
    pool: SqlitePool,
    cipher: CredentialCipher,
}

impl ProfileStore {
    pub fn default_data_dir() -> PathBuf {
        dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("SqlCraft")
    }

    pub async fn open_default() -> Result<Self, String> {
        let dir = Self::default_data_dir();
        Self::open_in_dir(&dir).await
    }

    pub async fn open_in_dir(dir: &Path) -> Result<Self, String> {
        let cipher = CredentialCipher::load_or_create(dir)?;
        let db_path = dir.join("sqlcraft.db");
        let opts = SqliteConnectOptions::new()
            .filename(&db_path)
            .create_if_missing(true);
        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect_with(opts)
            .await
            .map_err(|e| format!("Failed to open local SQLite store: {e}"))?;

        let store = Self { pool, cipher };
        store.migrate_and_seed().await?;
        Ok(store)
    }

    pub async fn open_in_memory(key: [u8; 32]) -> Result<Self, String> {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .map_err(|e| format!("Failed to open in-memory SQLite store: {e}"))?;
        let store = Self {
            pool,
            cipher: CredentialCipher::from_key(key),
        };
        store.migrate_and_seed().await?;
        Ok(store)
    }

    async fn migrate_and_seed(&self) -> Result<(), String> {
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS connection_profiles (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                group_name TEXT,
                db_kind TEXT NOT NULL,
                host TEXT NOT NULL,
                port INTEGER NOT NULL,
                initial_database TEXT,
                username TEXT NOT NULL,
                encrypted_password TEXT,
                save_password INTEGER NOT NULL DEFAULT 0,
                color TEXT,
                encoding TEXT,
                keepalive_secs INTEGER NOT NULL DEFAULT 60,
                connect_timeout_secs INTEGER NOT NULL DEFAULT 10,
                auto_connect INTEGER NOT NULL DEFAULT 0,
                ssl_json TEXT NOT NULL,
                ssh_json TEXT NOT NULL,
                http_tunnel_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            "#,
        )
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to migrate connection_profiles: {e}"))?;

        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS saved_queries (
                id TEXT PRIMARY KEY,
                profile_id TEXT NOT NULL,
                database_name TEXT,
                schema_name TEXT,
                title TEXT NOT NULL,
                sql_text TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            "#,
        )
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to migrate saved_queries: {e}"))?;

        let count_row = sqlx::query("SELECT COUNT(*) AS cnt FROM connection_profiles")
            .fetch_one(&self.pool)
            .await
            .map_err(|e| format!("Failed to count profiles: {e}"))?;
        let count: i64 = count_row.try_get("cnt").unwrap_or(0);
        if count == 0 {
            for starter in Self::starter_profiles() {
                self.save_profile(&starter).await?;
            }
        }

        Ok(())
    }

    fn starter_profiles() -> Vec<ConnectionProfile> {
        let now = chrono::Utc::now().to_rfc3339();
        vec![
            ConnectionProfile {
                id: "starter-mysql-local".to_string(),
                name: "Local MySQL (3306)".to_string(),
                group_name: Some("Local".to_string()),
                db_kind: DbKind::Mysql,
                host: "127.0.0.1".to_string(),
                port: 3306,
                initial_database: None,
                username: "root".to_string(),
                password: None,
                save_password: false,
                color: Some("#2563eb".to_string()),
                encoding: Some("utf8mb4".to_string()),
                keepalive_secs: 60,
                connect_timeout_secs: 10,
                auto_connect: false,
                ssl: SslConfig::default(),
                ssh: SshTunnelConfig::default(),
                http_tunnel: HttpTunnelConfig::default(),
                created_at: now.clone(),
                updated_at: now.clone(),
            },
            ConnectionProfile {
                id: "starter-mariadb-local".to_string(),
                name: "Local MariaDB (3306)".to_string(),
                group_name: Some("Local".to_string()),
                db_kind: DbKind::MariaDb,
                host: "127.0.0.1".to_string(),
                port: 3306,
                initial_database: None,
                username: "root".to_string(),
                password: None,
                save_password: false,
                color: Some("#0d9488".to_string()),
                encoding: Some("utf8mb4".to_string()),
                keepalive_secs: 60,
                connect_timeout_secs: 10,
                auto_connect: false,
                ssl: SslConfig::default(),
                ssh: SshTunnelConfig::default(),
                http_tunnel: HttpTunnelConfig::default(),
                created_at: now.clone(),
                updated_at: now.clone(),
            },
            ConnectionProfile {
                id: "starter-postgres-local".to_string(),
                name: "Local PostgreSQL (5432)".to_string(),
                group_name: Some("Local".to_string()),
                db_kind: DbKind::Postgres,
                host: "127.0.0.1".to_string(),
                port: 5432,
                initial_database: Some("postgres".to_string()),
                username: "postgres".to_string(),
                password: None,
                save_password: false,
                color: Some("#4f46e5".to_string()),
                encoding: Some("UTF8".to_string()),
                keepalive_secs: 60,
                connect_timeout_secs: 10,
                auto_connect: false,
                ssl: SslConfig::default(),
                ssh: SshTunnelConfig::default(),
                http_tunnel: HttpTunnelConfig::default(),
                created_at: now.clone(),
                updated_at: now,
            },
        ]
    }

    pub async fn list_profiles(&self) -> Result<Vec<ConnectionProfile>, String> {
        let rows = sqlx::query(
            r#"
            SELECT
                id, name, group_name, db_kind, host, port, initial_database, username,
                encrypted_password, save_password, color, encoding, keepalive_secs,
                connect_timeout_secs, auto_connect, ssl_json, ssh_json, http_tunnel_json,
                created_at, updated_at
            FROM connection_profiles
            ORDER BY COALESCE(group_name, ''), name
            "#,
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| format!("Failed to list connection profiles: {e}"))?;

        let mut out = Vec::with_capacity(rows.len());
        for r in rows {
            out.push(self.row_to_profile(&r)?);
        }
        Ok(out)
    }

    pub async fn get_profile(&self, profile_id: &str) -> Result<ConnectionProfile, String> {
        let row = sqlx::query(
            r#"
            SELECT
                id, name, group_name, db_kind, host, port, initial_database, username,
                encrypted_password, save_password, color, encoding, keepalive_secs,
                connect_timeout_secs, auto_connect, ssl_json, ssh_json, http_tunnel_json,
                created_at, updated_at
            FROM connection_profiles
            WHERE id = ?
            "#,
        )
        .bind(profile_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| format!("Failed to fetch connection profile: {e}"))?
        .ok_or_else(|| format!("Connection profile '{profile_id}' not found"))?;

        self.row_to_profile(&row)
    }

    pub async fn save_profile(&self, profile: &ConnectionProfile) -> Result<ConnectionProfile, String> {
        let now = chrono::Utc::now().to_rfc3339();
        let mut stored = profile.clone();
        if stored.id.trim().is_empty() {
            stored.id = uuid::Uuid::new_v4().to_string();
        }
        if stored.created_at.trim().is_empty() {
            stored.created_at = now.clone();
        }
        stored.updated_at = now;

        let encrypted_password = if stored.save_password {
            self.cipher.encrypt_opt(&stored.password)?
        } else {
            None
        };

        let mut ssh_for_storage = stored.ssh.clone();
        ssh_for_storage.password = self.cipher.encrypt_opt(&stored.ssh.password)?;
        ssh_for_storage.passphrase = self.cipher.encrypt_opt(&stored.ssh.passphrase)?;

        let ssl_json = serde_json::to_string(&stored.ssl)
            .map_err(|e| format!("Failed to serialize SSL config: {e}"))?;
        let ssh_json = serde_json::to_string(&ssh_for_storage)
            .map_err(|e| format!("Failed to serialize SSH config: {e}"))?;
        let http_json = serde_json::to_string(&stored.http_tunnel)
            .map_err(|e| format!("Failed to serialize HTTP tunnel config: {e}"))?;

        sqlx::query(
            r#"
            INSERT INTO connection_profiles (
                id, name, group_name, db_kind, host, port, initial_database, username,
                encrypted_password, save_password, color, encoding, keepalive_secs,
                connect_timeout_secs, auto_connect, ssl_json, ssh_json, http_tunnel_json,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                group_name = excluded.group_name,
                db_kind = excluded.db_kind,
                host = excluded.host,
                port = excluded.port,
                initial_database = excluded.initial_database,
                username = excluded.username,
                encrypted_password = excluded.encrypted_password,
                save_password = excluded.save_password,
                color = excluded.color,
                encoding = excluded.encoding,
                keepalive_secs = excluded.keepalive_secs,
                connect_timeout_secs = excluded.connect_timeout_secs,
                auto_connect = excluded.auto_connect,
                ssl_json = excluded.ssl_json,
                ssh_json = excluded.ssh_json,
                http_tunnel_json = excluded.http_tunnel_json,
                updated_at = excluded.updated_at
            "#,
        )
        .bind(&stored.id)
        .bind(&stored.name)
        .bind(&stored.group_name)
        .bind(stored.db_kind.as_str())
        .bind(&stored.host)
        .bind(i64::from(stored.port))
        .bind(&stored.initial_database)
        .bind(&stored.username)
        .bind(&encrypted_password)
        .bind(if stored.save_password { 1_i64 } else { 0_i64 })
        .bind(&stored.color)
        .bind(&stored.encoding)
        .bind(i64::from(stored.keepalive_secs))
        .bind(i64::from(stored.connect_timeout_secs))
        .bind(if stored.auto_connect { 1_i64 } else { 0_i64 })
        .bind(&ssl_json)
        .bind(&ssh_json)
        .bind(&http_json)
        .bind(&stored.created_at)
        .bind(&stored.updated_at)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to save connection profile: {e}"))?;

        Ok(stored)
    }

    pub async fn delete_profile(&self, profile_id: &str) -> Result<(), String> {
        sqlx::query("DELETE FROM connection_profiles WHERE id = ?")
            .bind(profile_id)
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to delete connection profile: {e}"))?;
        Ok(())
    }

    fn row_to_profile(&self, row: &sqlx::sqlite::SqliteRow) -> Result<ConnectionProfile, String> {
        let db_kind_str: String = row.try_get("db_kind").unwrap_or_default();
        let db_kind = DbKind::from_str(&db_kind_str)?;

        let encrypted_password: Option<String> = row.try_get("encrypted_password").ok().flatten();
        let password = self.cipher.decrypt_opt(&encrypted_password)?;

        let ssl_json: String = row.try_get("ssl_json").unwrap_or_else(|_| "{}".to_string());
        let ssl: SslConfig = serde_json::from_str(&ssl_json).unwrap_or_default();

        let ssh_json: String = row.try_get("ssh_json").unwrap_or_else(|_| "{}".to_string());
        let mut ssh: SshTunnelConfig = serde_json::from_str(&ssh_json).unwrap_or_default();
        ssh.password = self.cipher.decrypt_opt(&ssh.password)?;
        ssh.passphrase = self.cipher.decrypt_opt(&ssh.passphrase)?;

        let http_json: String = row
            .try_get("http_tunnel_json")
            .unwrap_or_else(|_| "{}".to_string());
        let http_tunnel: HttpTunnelConfig = serde_json::from_str(&http_json).unwrap_or_default();

        let port: i64 = row.try_get("port").unwrap_or(i64::from(db_kind.default_port()));
        let save_password: i64 = row.try_get("save_password").unwrap_or(0);
        let keepalive_secs: i64 = row.try_get("keepalive_secs").unwrap_or(60);
        let connect_timeout_secs: i64 = row.try_get("connect_timeout_secs").unwrap_or(10);
        let auto_connect: i64 = row.try_get("auto_connect").unwrap_or(0);

        Ok(ConnectionProfile {
            id: row.try_get("id").unwrap_or_default(),
            name: row.try_get("name").unwrap_or_default(),
            group_name: row.try_get("group_name").ok(),
            db_kind,
            host: row.try_get("host").unwrap_or_default(),
            port: u16::try_from(port).unwrap_or_else(|_| db_kind.default_port()),
            initial_database: row.try_get("initial_database").ok(),
            username: row.try_get("username").unwrap_or_default(),
            password,
            save_password: save_password != 0,
            color: row.try_get("color").ok(),
            encoding: row.try_get("encoding").ok(),
            keepalive_secs: u32::try_from(keepalive_secs).unwrap_or(60),
            connect_timeout_secs: u32::try_from(connect_timeout_secs).unwrap_or(10),
            auto_connect: auto_connect != 0,
            ssl,
            ssh,
            http_tunnel,
            created_at: row.try_get("created_at").unwrap_or_default(),
            updated_at: row.try_get("updated_at").unwrap_or_default(),
        })
    }

    pub async fn list_saved_queries(
        &self,
        profile_id: Option<&str>,
    ) -> Result<Vec<SavedQuery>, String> {
        let rows = if let Some(pid) = profile_id {
            sqlx::query(
                r#"
                SELECT id, profile_id, database_name, schema_name, title, sql_text, created_at, updated_at
                FROM saved_queries
                WHERE profile_id = ?
                ORDER BY updated_at DESC, title
                "#,
            )
            .bind(pid)
            .fetch_all(&self.pool)
            .await
        } else {
            sqlx::query(
                r#"
                SELECT id, profile_id, database_name, schema_name, title, sql_text, created_at, updated_at
                FROM saved_queries
                ORDER BY updated_at DESC, title
                "#,
            )
            .fetch_all(&self.pool)
            .await
        }
        .map_err(|e| format!("Failed to list saved queries: {e}"))?;

        Ok(rows
            .into_iter()
            .map(|r| SavedQuery {
                id: r.try_get("id").unwrap_or_default(),
                profile_id: r.try_get("profile_id").unwrap_or_default(),
                database_name: r.try_get("database_name").ok().flatten(),
                schema_name: r.try_get("schema_name").ok().flatten(),
                title: r.try_get("title").unwrap_or_default(),
                sql_text: r.try_get("sql_text").unwrap_or_default(),
                created_at: r.try_get("created_at").unwrap_or_default(),
                updated_at: r.try_get("updated_at").unwrap_or_default(),
            })
            .collect())
    }

    pub async fn save_query(&self, query: &SavedQuery) -> Result<SavedQuery, String> {
        let now = chrono::Utc::now().to_rfc3339();
        let mut stored = query.clone();
        if stored.id.trim().is_empty() {
            stored.id = uuid::Uuid::new_v4().to_string();
        }
        if stored.created_at.trim().is_empty() {
            stored.created_at = now.clone();
        }
        stored.updated_at = now;

        sqlx::query(
            r#"
            INSERT INTO saved_queries (
                id, profile_id, database_name, schema_name, title, sql_text, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                profile_id = excluded.profile_id,
                database_name = excluded.database_name,
                schema_name = excluded.schema_name,
                title = excluded.title,
                sql_text = excluded.sql_text,
                updated_at = excluded.updated_at
            "#,
        )
        .bind(&stored.id)
        .bind(&stored.profile_id)
        .bind(&stored.database_name)
        .bind(&stored.schema_name)
        .bind(&stored.title)
        .bind(&stored.sql_text)
        .bind(&stored.created_at)
        .bind(&stored.updated_at)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to save query: {e}"))?;

        Ok(stored)
    }

    pub async fn delete_saved_query(&self, query_id: &str) -> Result<(), String> {
        sqlx::query("DELETE FROM saved_queries WHERE id = ?")
            .bind(query_id)
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to delete saved query: {e}"))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cipher_encrypts_and_decrypts_secrets() {
        let cipher = CredentialCipher::from_key([42u8; 32]);
        let secret = "s3cr3t!Passw0rd#2026";
        let encrypted = cipher.encrypt(secret).unwrap();
        assert!(encrypted.starts_with("v1:"));
        assert_ne!(encrypted, secret);
        let decrypted = cipher.decrypt(&encrypted).unwrap();
        assert_eq!(decrypted, secret);
    }

    #[tokio::test]
    async fn profile_store_seeds_saves_lists_and_deletes() {
        let store = ProfileStore::open_in_memory([7u8; 32]).await.unwrap();
        let seeded = store.list_profiles().await.unwrap();
        assert_eq!(seeded.len(), 3);

        let mut custom = seeded[0].clone();
        custom.id = "custom-pg-prod".to_string();
        custom.name = "Prod PostgreSQL".to_string();
        custom.db_kind = DbKind::Postgres;
        custom.port = 5432;
        custom.password = Some("pg-secret-token".to_string());
        custom.save_password = true;

        store.save_profile(&custom).await.unwrap();
        let loaded = store.get_profile("custom-pg-prod").await.unwrap();
        assert_eq!(loaded.name, "Prod PostgreSQL");
        assert_eq!(loaded.password.as_deref(), Some("pg-secret-token"));

        store.delete_profile("custom-pg-prod").await.unwrap();
        let after_delete = store.list_profiles().await.unwrap();
        assert_eq!(after_delete.len(), 3);
    }

    #[tokio::test]
    async fn saved_query_store_crud() {
        let store = ProfileStore::open_in_memory([9u8; 32]).await.unwrap();
        let item = SavedQuery {
            id: "q-1".to_string(),
            profile_id: "starter-mysql-local".to_string(),
            database_name: Some("shop_prod".to_string()),
            schema_name: None,
            title: "Active Users".to_string(),
            sql_text: "SELECT * FROM users WHERE status = 'active';".to_string(),
            created_at: String::new(),
            updated_at: String::new(),
        };
        let saved = store.save_query(&item).await.unwrap();
        assert_eq!(saved.title, "Active Users");
        assert!(!saved.created_at.is_empty());

        let list = store
            .list_saved_queries(Some("starter-mysql-local"))
            .await
            .unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, "q-1");

        store.delete_saved_query("q-1").await.unwrap();
        let empty = store.list_saved_queries(None).await.unwrap();
        assert!(empty.is_empty());
    }
}
