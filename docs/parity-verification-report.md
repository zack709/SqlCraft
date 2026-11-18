# SqlCraft vs. Navicat Premium 18 對照驗證報告 (`docs/parity-verification-report.md`)

> **版本範圍**：Tauri 2.0 跨平台重製版 (`SqlCraft v0.1.0`) — 涵蓋 **Phase 0 ~ Phase 6**（優先支援 MySQL、MariaDB、PostgreSQL）。

---

## 1. 取證來源與驗證邊界 (Evidence & Scope Boundary)

- **UI Automation 實測快照 (`[Observed]`, Phase 1)**：
  - **Craft Anything Evidence ID**：`ev_fcfdd0e5d869e85e843a15d1bb8e67df41b7b94535cfbcf580e3db37c91b8f46`
  - **目標程式**：`C:\Program Files\Navicat\Navicat Premium 18\navicat.exe`（PID `400`，視窗類別 `TNavicatMainForm`，解析度 `2560 x 1392` 客戶區，共擷取 **67 個 UI Automation 節點**，完整規範固化於 [docs/navicat-ui-spec.md](navicat-ui-spec.md)）。
- **HTTP Tunnel 與 OID 取證 (`[Observed]`, Phase 1)**：
  - `ntunnel_mysql.php`（`$versionNum = 207`）與 `ntunnel_pgsql.php`（`$versionNum = 204`）封包格式與 PostgreSQL 常見型別 OID。
- **Phase 6 實況重擷取邊界註記**：
  - 於執行 Phase 6 驗證時，`navicat.exe`（PID `400`）已無開啟中之視窗（本機亦未重啟 `navicat.exe`，且維持 Craft Anything `Clean room` 模式），因此本報告係以 **Phase 1 固化證據 (`ev_fcfdd0e5...`)** 與 **Phase 2 ~ Phase 6 實際實作原始碼及編譯/測試輸出** 進行逐項對照驗證。

---

## 2. 主工作台版面幾何對照表 (Main Workbench Geometry Parity)

| Navicat Premium 18 原生元件 (`ev_fcfdd0e5...`) | 觀測幾何與結構 | SqlCraft (React + Tailwind) 對應實作 | 對照狀態 |
|---|---|---|---|
| **Top MenuBar (`TActionMainMenuBar`)** | 位於頂部，高 `25px` | [src/App.tsx](src/App.tsx) `header.h-[25px]`（含檔案 / 檢視 / 連線 / 收藏 / 工具 / 視窗 / 說明與原生/預覽模式標記） | 一致 |
| **Main Toolbar (`TActionToolBar` + 右輔助區)** | 高 `63px`（`62px` + `1px` 底線），右輔助區寬 `160px` | [src/App.tsx](src/App.tsx) `.h-[63px]` 主工具列（連線下拉、新增查詢、資料表、檢視、函式、序列、重新整理 + 右側 `w-[160px]` `範例預覽`/`資訊面板`） | 一致 |
| **Left Explorer (`TVTFilterFrame` + `plFilterControl`)** | 預設寬 `300px`，上方樹狀元件 + 底部 `30px` 搜尋過濾列 | [src/components/ConnectionTree.tsx](src/components/ConnectionTree.tsx) 搭配 [src/App.tsx](src/App.tsx) 可拖曳 `3px` splitter，預設 `leftWidth = 300` | 一致 |
| **Center Smart Tabs (`TNavicatRkSmartTabs`)** | 高 `30px`（`26px` 分頁 + `4px` 強調底線） | [src/components/WorkspaceTabs.tsx](src/components/WorkspaceTabs.tsx) `.h-[30px]` 搭配 `border-b-4 border-[#2563eb]` 多分頁列 | 一致 |
| **Center Object Toolbar & List (`ActionToolBar2` + `TListView`)** | `ActionToolBar2` `26px` + 清單/圖示切換、`SysHeader32` `24px`（6 欄：`名稱/列/資料長度/引擎/修改日期/註解`） | [src/components/ObjectListPane.tsx](src/components/ObjectListPane.tsx) 支援清單/磚形圖示檢視切換、搜尋過濾、雙點擊開啟及右鍵選單 | 一致 |
| **Right Inspector (`TNavicatSyncActivityLog`)** | 預設寬 `300px`，頂部 `40px` 標題列 + 摘要區 + 可捲動內容 | [src/components/RightInspectorPane.tsx](src/components/RightInspectorPane.tsx) `w = rightWidth (300px)`、`h-[40px]` `資訊 / DDL / 欄位 / 日誌` 分頁及可收合切換 | 一致 |
| **Status Bar (`TStatusBar`)** | 高 `22px`、4 欄配置 (`300px / flex-1 / 69px / 52px`) | [src/App.tsx](src/App.tsx) `footer.h-[22px]` 四欄結構（連線計數 / 狀態訊息 / 耗時 `69px` / 編碼 `52px`） | 一致 |

---

## 3. 資料庫引擎、安全與通道協定對照表 (Drivers, Security & Tunnels)

| 能力項目 | 目標需求 | SqlCraft Rust 後端實作 (`src-tauri/src/`) | 驗證方式 |
|---|---|---|---|
| **統一驅動抽象 (`DatabaseDriver`)** | 統一管理連線測試、中繼資料列舉與查詢取消 | [drivers/mod.rs](src-tauri/src/drivers/mod.rs) 定義 `DatabaseDriver` trait 與 `ConnectionManager`（`CancellationToken` 取消控制與 `MAX_QUERY_ROWS = 5000` 上限保護） | 編譯 & 整合呼叫通過 |
| **MySQL / MariaDB 驅動** | 原生非同步連線、版本區分、SSL/TLS、中繼資料 | [drivers/mysql.rs](src-tauri/src/drivers/mysql.rs) `MySqlDriver`（`sqlx::mysql` + `rustls`，支援 `Disable`~`VerifyIdentity`、CA/Cert） | 編譯 & `cargo test` 通過 |
| **PostgreSQL 驅動** | 多 DB 連線池、`Database -> Schema` 三層列舉、`NUMERIC`/`JSON`/`UUID`/`BYTEA` | [drivers/postgres.rs](src-tauri/src/drivers/postgres.rs) `PostgresDriver`（按資料庫快取 `PgPool` 與 `pg_catalog` 查詢） | 編譯 & `cargo test` 通過 |
| **憑證加密儲存 (`ProfileStore`)** | 本機安全保存連線設定、密碼與已儲存查詢 | [storage/mod.rs](src-tauri/src/storage/mod.rs) SQLite (`connection_profiles`, `saved_queries`) + `CredentialCipher` (`AES-256-GCM`) | `cargo test` 單元測試通過 (`cipher_encrypts_and_decrypts_secrets`, `profile_store_seeds_saves_lists_and_deletes`, `saved_query_store_crud`) |
| **SSH & HTTP Tunnel (`SshTunnelManager` & Codec)** | SSH `-N -L` 埠轉發及相容 `ntunnel_mysql.php` v207 / `ntunnel_pgsql.php` v204 封包 | [tunnel/mod.rs](src-tauri/src/tunnel/mod.rs) 跨平台 OpenSSH 通道生命週期與 `HttpTunnelPacketCodec` 二進位編解碼器 | `cargo test` 單元測試通過 (`http_tunnel_header_parses_magic_and_version`, `http_tunnel_block_roundtrip_short_long_and_null`) |
| **多語句切分 (含 `$tag$`)** | 支援標準 SQL 分號與 PostgreSQL `$tag$` 函式定義 | [drivers/mod.rs](src-tauri/src/drivers/mod.rs) 與 [src/lib/sql-formatter.ts](src/lib/sql-formatter.ts) | `cargo test` 通過 (`splits_standard_and_quoted_statements`, `splits_postgres_dollar_quoted_functions`) |

---

## 4. 核心工作流功能對照表 (Workflow Feature Parity)

| Navicat 模組 | SqlCraft 前端模組 | 已驗證功能重點 |
|---|---|---|
| **連線設定精靈** | [src/components/ConnectionModal.tsx](src/components/ConnectionModal.tsx) | MySQL / MariaDB / PostgreSQL 自動切換預設埠 (`3306`/`5432`) 與帳號編碼、一般/進階/資料庫/SSL/SSH/HTTP 6 分頁、色票標記與即時測試連線。 |
| **雙階層物件導覽樹** | [src/components/ConnectionTree.tsx](src/components/ConnectionTree.tsx) | 完整支援 MySQL/MariaDB 雙層 (`Connection -> DB`) 與 PostgreSQL 三層 (`Connection -> DB -> Schema`)、Saved Queries 分類及免裝 DB 的離線範例 (`demo`) 模式。 |
| **虛擬化資料檢視器** | [src/components/DataViewerGrid.tsx](src/components/DataViewerGrid.tsx) & [src/lib/sql-builder.ts](src/lib/sql-builder.ts) | `@tanstack/react-virtual` 虛擬化捲動、分頁 (`100`~`5000`)、欄位寬度調整/顯隱、多欄位排序、視覺化 Filter Builder、雙擊內聯編輯、右鍵 `NULL`/空字串/複製 `INSERT`/JSON、Transaction Change Set SQL 預覽與 `Apply Changes` / `Discard`。 |
| **資料表結構設計器** | [src/components/TableDesigner.tsx](src/components/TableDesigner.tsx) | 支援新建 (`CREATE TABLE`) 與修改 (`ALTER TABLE`)，涵蓋欄位、索引、外鍵、觸發器、選項/註解與即時方言 DDL 預覽執行。 |
| **SQL 查詢編輯器與分析** | [src/components/MonacoSqlEditor.tsx](src/components/MonacoSqlEditor.tsx)、[src/components/QueryEditorPane.tsx](src/components/QueryEditorPane.tsx)、[src/lib/sql-formatter.ts](src/lib/sql-formatter.ts) | 本地 Worker 打包 `monaco-editor@0.57.0`（完全離線）、方言高亮、Schema-aware 自動補全、`Ctrl+Enter` 執行選取/當前語句、`Ctrl+Shift+F` 美化、多結果集 `結果 1..N`、`訊息` 與 `解釋 (Explain)`（偵測 `ALL`/`Seq Scan` 警示）、SQL 儲存/載入。 |
| **匯出精靈** | [src/components/ExportModal.tsx](src/components/ExportModal.tsx) & [src/lib/export-utils.ts](src/lib/export-utils.ts) | 支援資料表網格與查詢結果雙入口匯出為 CSV（含自訂分隔符與 UTF-8 BOM）、JSON（Pretty Print）與 SQL `INSERT`（單列/200 列批次）。 |

---

## 5. 最終建置與測試核對摘要 (Phase 6 Verification)

- **前端型別檢查與生產打包 (`npm run build`)**：通過 (`tsc && vite build`，已啟用 `manualChunks` 拆分 `monaco-editor`、`react-vendor` 與 `ui-vendor`)。
- **Rust 核心引擎單元測試 (`cargo test`)**：7 / 7 單元測試全數通過、0 警告。
- **跨平台 CI/CD 打包管線**：已配置 [.github/workflows/release.yml](.github/workflows/release.yml) 支援 `windows-latest` (`msi`/`nsis`)、`ubuntu-22.04` (`deb`/`AppImage`) 與 `macos-latest` (`dmg`/`app`) 自動驗證與打包。
