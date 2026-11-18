# SqlCraft

Cross-platform database workbench built with **Tauri 2.0** (Rust + React + TypeScript + Monaco Editor), supporting **MySQL**, **MariaDB**, and **PostgreSQL**.

## Features

- **Unified Multi-Database Rust Engine (`src-tauri/src/`)**:
  - Async `sqlx` connection pools (`MySqlDriver` for MySQL/MariaDB, multi-database `PgPool` cache in `PostgresDriver`) with `rustls` SSL/TLS (`disable`, `prefer`, `require`, `verify_ca`, `verify_full`) and `CancellationToken` query cancellation.
  - Local SQLite persistence (`ProfileStore`) with `AES-256-GCM` (`CredentialCipher`) encrypted password/SSH passphrase storage and `SavedQuery` CRUD.
  - Cross-platform SSH port-forwarding tunnel manager (`SshTunnelManager`) and Navicat-compatible binary packet framing (`HttpTunnelPacketCodec`).
- **Classic Workbench Shell (`src/`)**:
  - Navicat-inspired multi-pane layout (`ConnectionTree`, `ObjectListPane`, `WorkspaceTabs`, `RightInspectorPane`) with resizable splitters and offline `Demo` schema exploration.
  - 6-tab connection dialog (`General`, `Advanced`, `Databases`, `SSL`, `SSH`, `HTTP`) with instant connection testing and environment color tags.
- **Virtualized Data Viewer & Visual Table Designer**:
  - `@tanstack/react-virtual` data grid (`DataViewerGrid`) with visual `Filter Builder`, multi-column sorting, inline CRUD Change Set (`INSERT`/`UPDATE`/`DELETE` preview), and single-transaction `Apply Changes` / `Discard`.
  - 6-tab `TableDesigner` (`Fields`, `Indexes`, `Foreign Keys`, `Triggers`, `Options`, `SQL Preview`) supporting `CREATE TABLE` and `ALTER TABLE`.
- **Offline Monaco SQL Editor & Export Wizard**:
  - Locally bundled `monaco-editor` Web Worker with dialect switching (`mysql` / `pgsql`), Schema-aware autocomplete (`table.` columns, tables, views, routines, SQL keywords), `Ctrl+Enter` run selection/current statement, `Ctrl+Shift+F` SQL formatting, multi-result `Result 1..N` tabs, execution `Message`, and `EXPLAIN` plan warnings.
  - Export table grid or query results to **CSV**, **JSON**, or **SQL `INSERT`** via `ExportModal`.

## Cross-Platform Prerequisites

### Common
- **Node.js** `>= 20` & `npm`
- **Rust** stable toolchain (`rustup`)

### Windows
- Visual Studio 2022 Build Tools (Desktop development with C++ / `vcvars64.bat`)
- Microsoft Edge WebView2 Runtime (included in Windows 10/11)

### Linux (Ubuntu / Debian)
```bash
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libappindicator3-dev \
  librsvg2-dev \
  patchelf \
  libssl-dev \
  build-essential
```

### macOS
- Xcode Command Line Tools (`xcode-select --install`)
- Optional cross-arch targets for Universal/Apple Silicon builds:
  `rustup target add aarch64-apple-darwin x86_64-apple-darwin`

## Development & Build Commands

```bash
# Install frontend dependencies
npm install

# Run frontend web preview only
npm run dev

# Build frontend (TypeScript typecheck + Vite bundle)
npm run build

# Run Rust backend unit tests (Windows: run inside VS 2022 Developer Command Prompt / vcvars64.bat)
cd src-tauri && cargo test

# Launch full Tauri 2.0 desktop app in dev mode
npm run tauri dev

# Build production installers (.msi/.exe, .deb/.AppImage, .dmg/.app)
npm run tauri build

# Build Windows Portable executable (stores config.json, sqlcraft.db, and master.key in ./config/)
npx tauri build --no-bundle -- --features portable
```

## Portable Mode (Windows)

SqlCraft runs in **Portable Mode** automatically when:
- Built with `--features portable` (`SqlCraft_<version>_x64-portable.zip`), **or**
- A `config/` directory or `.portable` / `portable.txt` marker file exists next to `SqlCraft.exe`.

In Portable Mode, all application preferences (`config.json`), encrypted site manager profiles & saved queries (`sqlcraft.db`), and the AES-256-GCM key (`master.key`) are stored in `<exe_dir>/config/`.

## Documentation

- Changelog: [CHANGELOG.md](CHANGELOG.md)
- Phased roadmap & engineering log: [craft.md](craft.md)
- UI/UX & driver specification snapshot: [docs/navicat-ui-spec.md](docs/navicat-ui-spec.md)
- Navicat parity verification report: [docs/parity-verification-report.md](docs/parity-verification-report.md)

## License

Licensed under the [Business Source License 1.1](LICENSE) (`BUSL-1.1`).
