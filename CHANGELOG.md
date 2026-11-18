# Changelog

All notable changes to **SqlCraft** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-11-18

### Added
- **Cross-Platform Tauri 2.0 Architecture & Rust Database Engine (`src-tauri/`)**:
  - Implemented unified `DatabaseDriver` trait and `ConnectionManager` supporting concurrent pools and `CancellationToken` query cancellation.
  - Added `MySqlDriver` (MySQL & MariaDB) and `PostgresDriver` (multi-database `PgPool` cache & `Schema` hierarchy) using `sqlx` + `rustls` SSL/TLS.
  - Added `ProfileStore` backed by local SQLite with `AES-256-GCM` (`CredentialCipher`) encrypted passwords/passphrases and `SavedQuery` CRUD (`list_saved_queries`, `save_query`, `delete_saved_query`).
  - Added `SshTunnelManager` (`ssh -N -L` port forwarding) and `HttpTunnelPacketCodec` binary packet encoder/decoder compatible with Navicat HTTP Tunnel v207/v204.
- **Navicat-Style Workbench Shell & Explorer (`src/`)**:
  - Built multi-pane layout (`src/App.tsx`, `WorkspaceTabs`, `RightInspectorPane`) with resizable splitters, 4-pane status bar, and offline `Demo` mode (`src/lib/demo-data.ts`).
  - Built 6-tab `ConnectionModal` (`General`, `Advanced`, `Databases`, `SSL`, `SSH`, `HTTP`) with color tags and live connection testing.
  - Built dual-hierarchy `ConnectionTree` (2-tier MySQL/MariaDB & 3-tier PostgreSQL) and `ObjectListPane` (List/Grid views, context menus, DDL preview).
- **Virtualized Data Grid & Visual Table Designer**:
  - Added `@tanstack/react-virtual` `DataViewerGrid` with pagination (`100`–`5000`), column resizing/visibility, multi-column sorting, visual `Filter Builder`, inline CRUD Change Set, and single-transaction `Apply Changes` / `Discard`.
  - Added 6-tab `TableDesigner` (`Fields`, `Indexes`, `Foreign Keys`, `Triggers`, `Options`, `SQL Preview`) and `src/lib/sql-builder.ts` for `CREATE TABLE` and `ALTER TABLE`.
- **Offline Monaco SQL Editor & Export Wizard**:
  - Integrated locally bundled `monaco-editor` (`MonacoSqlEditor.tsx`) with MySQL/MariaDB vs. PostgreSQL dialect switching, Schema-aware autocomplete, `Ctrl+Enter` run selection/current statement, and `Ctrl+Shift+F` SQL formatting (`src/lib/sql-formatter.ts`).
  - Upgraded `QueryEditorPane` with `Result 1..N` multi-result tabs, `Message` summary, `Explain` plan analysis (`ALL` / `Seq Scan` warnings), and Saved Queries integration.
  - Added `ExportModal` and `src/lib/export-utils.ts` for exporting table grids or query results to **CSV**, **JSON**, and **SQL `INSERT`**.
- **Cross-Platform Packaging, CI/CD & Documentation**:
  - Configured Vite `manualChunks` (`vite.config.ts`), Tauri bundle metadata (`src-tauri/tauri.conf.json`), and GitHub Actions multi-OS release workflow (`.github/workflows/release.yml`) for Windows, Linux, and macOS.
  - Added `README.md`, `CHANGELOG.md`, `LICENSE` (Apache-2.0), `docs/navicat-ui-spec.md`, and `docs/parity-verification-report.md`.
