# Changelog

All notable changes to **SqlCraft** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-11-18

### Added
- **macOS Universal Build & Native OS Styling**: Added macOS native menu (`src-tauri/src/menu.rs`), OS-adaptive UI styling (`src/utils/platform.ts`), custom `SqlCraft` app icon (`src-tauri/icons/`), `ErrorBoundary`, `universal-apple-darwin` bundle configuration, and macOS HiDPI / Retina rendering optimizations (`Info.plist`, `src/index.css`).
- **Dark Theme & Preferences (`SettingsModal.tsx`)**: Added Light / Dark theme switching, SQL editor font size selector, default object view mode, and inspector visibility toggle.
- **Multi-Language Support (`src/lib/i18n.ts`)**: Added Traditional Chinese (`zh-TW`) and English (`en`) UI localization with a language dropdown in Preferences.
- **Redesigned Site Manager & Session Tabs (`ConnectionModal.tsx`, `SessionTabsBar.tsx`)**: Added folder management, YAML import/export (`src/lib/yaml-sites.ts`), database engine dropdown with `DbEngineIcon`, multi-session tabs, and ad-hoc connections (`connect_adhoc_profile`) that connect without auto-saving.
- **SSH Tunnel Auth Methods**: Added support for `Password`, `Public Key`, and `Password & Public Key` (`PasswordAndPrivateKey`) in the SSH Tunnel tab and Rust backend.
- **Windows Portable Mode & `./config/` Storage**: Added `portable` Cargo feature (`--features portable`) and automatic portable detection (`config/`, `.portable`, or `portable.txt` beside `SqlCraft.exe`), storing app preferences in `config/config.json`, encrypted site profiles & saved queries in `config/sqlcraft.db`, and the AES-256-GCM key in `config/master.key`, plus `SqlCraft_<version>_x64-portable.zip` CI packaging in `.github/workflows/release.yml`.

### Changed
- **License**: Switched project license to **Business Source License 1.1 (`BUSL-1.1`)**.
- **Navicat-Style Tree & Connection UX**: Double-clicking a database opens it without auto-expanding tables; category folders (`Tables`, `Views`, etc.) select on single-click and expand on double-click; single-row highlight on folder selection. Clicking Connect closes Site Manager immediately and displays connecting status with a **Cancel Connection** button in the left explorer.
- **UI Cleanup**: Removed Demo preview buttons and tag color swatches from Site Manager.

### Fixed
- **MariaDB Database List (`src-tauri/src/drivers/mysql.rs`)**: Simplified `information_schema.SCHEMATA` query, added `Vec<u8>` decoding, and added `SHOW DATABASES` fallback so MariaDB databases always load properly.
- **Cloud PostgreSQL / MySQL SSL Default (`postgres.rs`, `mysql.rs`)**: Defaulted SSL mode to `Prefer` / `Preferred` when SSL is unchecked to prevent `no encryption` errors on Azure PostgreSQL.
- **SSH Host Input Layout**: Separated SSH Host and Port onto individual rows and fixed `w-full` width conflict.

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
