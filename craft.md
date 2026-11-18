# SqlCraft — Navicat Premium 18 跨平台重建計畫 (`craft.md`)

> **文件用途**：本文件是 **SqlCraft** 專案的主藍圖與**斷點續傳控制中心**。每次新開啟對話或切換階段時，請先讀取本文件並呼叫 Craft Anything MCP 的 `core_investigation_show`，即可在不浪費 Token 重複探索的情況下無縫接續開發。

---

## 1. 專案目標與技術棧總覽 (Project Overview & Tech Stack)

- **專案名稱**：SqlCraft（Navicat Premium 18 跨平台重建專案）
- **目標平台**：Windows (`x64`/`arm64`)、Linux (`AppImage`/`deb`/`rpm`)、macOS (`Universal` / Apple Silicon & Intel)
- **核心技術棧**：
  - **應用框架**：**Tauri 2.0**（Rust 後端核心 + Web 前端介面）
  - **Rust 後端技術選型（設計規劃）**：
    - 非同步執行期：`tokio`
    - 資料庫驅動：`sqlx` / `mysql_async`（MySQL & MariaDB）、`tokio-postgres` + `deadpool-postgres`（PostgreSQL）
    - 安全通道與加密：`russh`（SSH Tunnel）、`rustls` / `tokio-native-tls`（SSL/TLS）、`aes-gcm` / `keyring`（連線密碼加密保存）
    - 本地設定與紀錄儲存：`rusqlite`（SQLite 本地工作區與連線設定檔管理）
    - 資料匯出/串流：`csv`、`serde_json`
  - **Web 前端技術選型（設計規劃）**：
    - UI 框架：React 19 + TypeScript + Vite + Tailwind CSS
    - 狀態管理：Zustand（連線狀態、開啟分頁、物件樹快取、變更佇列）
    - 高效能資料格 (Data Grid)：`@tanstack/react-virtual`（支援百萬級列捲動與虛擬化渲染）
    - SQL 編輯器：Monaco Editor（支援 MySQL / PostgreSQL 方言高亮與 Schema-aware 自動補全）
- **首波資料庫支援範圍**：
  1. **MySQL**（5.7 / 8.x / 9.x，含 `caching_sha2_password` / `mysql_native_password`）
  2. **MariaDB**（10.x / 11.x，含 `client_ed25519` 等常見驗證外掛）
  3. **PostgreSQL**（12 ~ 17，完整支援 `Database -> Schema -> Objects` 多層架構）
  - *擴充性設計*：Rust 後端採用統一 `DatabaseDriver` Trait 與連線池註冊表，後續階段可平滑擴充 SQLite、Redis、MongoDB、MSSQL、Oracle 等。

---

## 2. Navicat Premium 18 目標環境初步盤點 (Initial Target Reconnaissance)

### 2.1 已觀測事實 (Observed)
- **運行中程序**：`navicat.exe`（PID: `400`）
- **安裝路徑**：`C:\Program Files\Navicat\Navicat Premium 18\navicat.exe`
- **Craft Anything MCP 狀態**：`craft-anything` v`0.6.1` 已連線並啟用全部 toolsets；目前為 `clean-room` 模式（`deep_mode: false`、`ask_before_running: true`）。讀取執行中畫面控制項（`runtime_ui_read`）需使用者授權（`consent_required`）。
- **安裝目錄核心元件清單**（於 `C:\Program Files\Navicat\Navicat Premium 18\` 直接觀測）：
  - **MySQL / MariaDB 用戶端與驗證模組**：`libmariadb.dll`、`libmariadb-10.1.dll`、`caching_sha2_password.dll`、`sha256_password.dll`、`mysql_clear_password.dll`、`client_ed25519.dll`、`auth_gssapi_client.dll`、`dialog.dll`、`pvio_npipe.dll`
  - **PostgreSQL 用戶端模組**：`libpq.dll`、`libpq-g.dll`、`libpq-h.dll`
  - **本地儲存與嵌入式資料庫**：`sqlite.dll`、`sqlite3.dll`
  - **通道與加密網路模組**：`ssh.dll`、`libssl-3-x64.dll`、`libssl-1_1-x64.dll`、`libcurl.dll`、`cacert.pem`、`gssapi64.dll`、`sasl2.dll`
  - **HTTP Tunnel 腳本**（位於 `resource\httptunnel\`）：`ntunnel_mysql.php`、`ntunnel_pgsql.php`、`ntunnel_sqlite.php`
  - **Navicat 子系統動態函式庫**：`nparser.dll`、`dparser.dll`、`libqb.dll`、`libdv.dll`、`libee.dll`、`libmv.dll`、`libndataprofiling.dll`、`libncharts.dll`、`libndrawing.dll`、`libnp2.dll`、`libnpdf.dll`、`libqexp.dll`、`libstat.dll`、`libsv.dll`、`libvf.dll`、`libxl.dll`、`libnai.dll`
  - **UI 與字型資源**：`webview2loader.dll`、`cairo-2.dll`、`pango-1.0-0.dll`、`resource\fonts\NotoSans-*.ttf`（含 `NotoSansSC`、`NotoSansJP`、`NotoSansKR`）

### 2.2 模組對照推論 (Inferred Architecture Mapping)
> 以下功能歸屬係根據上述檔名與常見資料庫工具模組結構所做之**推論**，實際介面與細節將於 Phase 1 取證後轉為已驗證證據 (`ev_...`)。

| Navicat 模組（觀測檔案） | 推論對應子系統 | SqlCraft (Tauri 2.0) 對應實作目標 |
|---|---|---|
| `libmariadb.dll` / `caching_sha2_password.dll` | MySQL / MariaDB 連線引擎 | `src-tauri/src/drivers/mysql.rs` |
| `libpq.dll` / `libpq-g.dll` / `libpq-h.dll` | PostgreSQL 連線引擎 | `src-tauri/src/drivers/postgres.rs` |
| `ssh.dll` + `resource/httptunnel/ntunnel_*.php` | SSH / HTTP 通道轉發 | `src-tauri/src/tunnel/ssh.rs` & `http.rs` |
| `nparser.dll` / `dparser.dll` | SQL 詞法剖析與語法補全 | Web Monaco SQL Language Service + Rust Statement Splitter |
| `libdv.dll` | 資料檢視器 (Data Viewer Grid) | Web 虛擬化表格元件 + Change Set 交易控制器 |
| `libqb.dll` / `libee.dll` | 查詢建構器與匯入匯出引擎 | `src-tauri/src/export/` + 視覺化精靈 |
| `sqlite3.dll` | 本地連線設定與歷史紀錄庫 | `src-tauri/src/storage/sqlite.rs` |

---

## 3. Token 節省與斷點續傳協議 (Token Conservation & Checkpoint Protocol)

為避免跨對話與長週期開發耗盡 Token，所有執行回合必須嚴格遵守以下協議：

1. **單次聚焦單一子任務**：每次只處理一個 Phase 中的 1~2 個子任務（例如只做 `2.2` 與 `2.3`），完成即驗證並存檔，不一次掃描或重寫整個專案。
2. **證據快照化（不再重複逆向）**：Phase 1 取得 `navicat.exe` 的 UI Tree 與欄位結構後，一律將精簡後的 UI 規格與 `ev_...` 證據 ID 記錄於 Craft Anything Findings 與專案規格檔，後續前端開發只讀精簡規格，不再重讀龐大的原始 UI 樹。
3. **雙重檢查點同步 (Dual Checkpoint)**：每輪工作結束前必須更新：
   - 本文件 (`craft.md`) 的任務勾選狀態 (`[ ]` -> `[~]` -> `[x]`) 與第 5 節「當前狀態與交接摘要」。
   - Craft Anything MCP：`core_plan_update`、`core_finding_record`（含 `ev_...`）、`core_handoff_write`。
4. **新對話冷啟動指令**：開新對話時，只需對 AI 說：
   > 「請讀取 `craft.md` 與呼叫 `core_investigation_show`，從目前未完成的下一個任務繼續。」

---

## 4. 分階段實施計畫 (Phased Implementation Plan)

### Phase 0：專案規劃與 Craft Anything 調查初始化（已完成）
- [x] **0.1 目標偵察**：定位執行中的 `navicat.exe` (PID `400`) 與安裝目錄 DLL / `resource\` 結構。
- [x] **0.2 建立藍圖**：撰寫 `e:\Workspace\SqlCraft\craft.md` 分階段計畫與 Token 節省協議。
- [x] **0.3 初始化調查記憶**：建立 Craft Anything `brief`、`plan`、待釐清 `unknowns` 與 `handoff`。

### Phase 1：Navicat Premium 18 介面與行為取證 (Craft Anything Evidence Collection)（已完成）
> **證據紀錄**：已獲使用者授權 `(A)`，完成 `runtime_ui_read`（`ev_fcfdd0e5d869e85e843a15d1bb8e67df41b7b94535cfbcf580e3db37c91b8f46`）與 HTTP Tunnel 驅動檢查；UI/UX 規格已固化於 `docs/navicat-ui-spec.md`。

- [x] **1.1 主視窗 UI Tree 擷取**：已透過 `runtime_ui_read`（`pid: 400`, `ev_fcfdd0e5d869e85e843a15d1bb8e67df41b7b94535cfbcf580e3db37c91b8f46`）擷取 `TNavicatMainForm` 共 67 個控制項（TitleBar `23px` + MenuBar `25px` + ActionToolBar `63px` + 左側 `300px` `TVirtualStringTree`/`plFilterControl` + 中間 `1954px` `PanelNavTabs`/`TNavicatRkSmartTabs`/`ActionToolBar2`/`TListView` + 右側 `300px` `TNavicatSyncActivityLog` + 底部 `22px` 4 欄 `TStatusBar`）。
- [x] **1.2 連線對話框與協定取證 (MySQL / MariaDB / PostgreSQL)**：已分析 `ntunnel_mysql.php` (v207) / `ntunnel_pgsql.php` (v204) 封包與 PG OID 映射，並於 `docs/navicat-ui-spec.md` 固化 General / Advanced / Databases / SSL / SSH / HTTP 6 分頁欄位設計規範。
- [x] **1.3 資料表檢視器與查詢編輯器規格固化**：已觀測物件列表 `TListView` 6 欄結構（`名稱`/`列`/`資料長度`/`引擎`/`修改日期`/`註解`），並於 `docs/navicat-ui-spec.md` 固化 Data Viewer Grid、Table Designer 與 Query Editor 規格。
- [x] **1.4 產出 UI/UX 規格快照**：已建立 `e:\Workspace\SqlCraft\docs\navicat-ui-spec.md`，並同步寫入 Craft Anything Findings (`fnd_1`) 與解決 `unk_0caddcfbd7cfdfec`。

### Phase 2：Tauri 2.0 專案骨架與 Rust 多資料庫核心引擎 (Core Rust Backend)（已完成）
- [x] **2.1 Tauri 2.0 跨平台骨架初始化**：已完成 `src-tauri` 與 React 19 + TypeScript + Vite + Tailwind CSS 專案骨架（`package.json`、`tauri.conf.json`、`capabilities/default.json`、`icons/`），並驗證 `npm run build` 通過。
- [x] **2.2 統一資料庫驅動抽象層 (`DatabaseDriver` Trait)**：
  - 已實作 `ConnectionManager`（管理多條並發連線池、SSH 通道與 `CancellationToken` 查詢取消）。
  - 已定義統一介面：`test_connection`、`list_databases`、`list_schemas`、`list_tables`、`list_views`、`list_columns`、`list_indexes`、`list_foreign_keys`、`list_routines`、`list_sequences`、`get_object_ddl`、`execute_query`、`execute_batch`。
- [x] **2.3 MySQL & MariaDB 驅動實作**：
  - 已實作 `src-tauri/src/drivers/mysql.rs`，支援標準 TCP、SSL/TLS（含 CA/Client Cert/Key）、版本偵測（區分 MySQL 與 MariaDB）、中繼資料查詢與型別安全轉換。
- [x] **2.4 PostgreSQL 驅動實作**：
  - 已實作 `src-tauri/src/drivers/postgres.rs`，支援動態多資料庫 `PgPool` 快取與 `Schema` 階層列舉、`pg_catalog` 查詢、`JSONB` / `UUID` / `NUMERIC` / `BYTEA` 轉換與 DDL 組合。
- [x] **2.5 安全連線設定儲存與 SSH 通道 (`ProfileStore` & `SshTunnel`)**：
  - 已實作 `src-tauri/src/storage/mod.rs`（本地 SQLite `connection_profiles` / `saved_queries` + AES-256-GCM 憑證加密與預設範本種子）。
  - 已實作 `src-tauri/src/tunnel/mod.rs`（跨平台 SSH `-N -L` 通道管理與 Navicat HTTP Tunnel 二進位封包編解碼器）；`cargo test` 6 項單元測試全數通過。

### Phase 3：Navicat 風格主工作台與連線導覽樹 (Workbench UI & Explorer)（已完成）
- [x] **3.1 經典主工作台佈局**：已完成 [src/App.tsx](src/App.tsx)、[src/store/workbenchStore.ts](src/store/workbenchStore.ts)、[src/components/WorkspaceTabs.tsx](src/components/WorkspaceTabs.tsx) 與 [src/components/RightInspectorPane.tsx](src/components/RightInspectorPane.tsx)，還原 `25px` 選單列、`63px` 主工具列（含左動作群組與右 `160px` 輔助面板）、`3px` 可拖曳寬度分隔器、多標籤工作區（物件 / 資料預覽 / 結構 / SQL 查詢）與 `22px` 四欄狀態列。
- [x] **3.2 新建/編輯連線對話框**：已完成 [src/components/ConnectionModal.tsx](src/components/ConnectionModal.tsx)，支援 MySQL / MariaDB / PostgreSQL 切換與自動埠號/帳號/編碼調整、一般/進階/資料庫/SSL/SSH/HTTP 6 分頁、標籤色票與即時「測試連線」。
- [x] **3.3 連線樹非同步展開與物件清單**：
  - 已完成 [src/components/ConnectionTree.tsx](src/components/ConnectionTree.tsx) 與 [src/components/ObjectListPane.tsx](src/components/ObjectListPane.tsx)，完整支援 MySQL/MariaDB 雙層樹與 PostgreSQL 三層樹 (`Database -> Schema -> Objects`)、物件清單/圖示檢視切換、DDL 預覽與右鍵選單（開啟、設計、SELECT 查詢、重新命名、清空、刪除、Dump SQL）。
  - 已加入 [src/lib/demo-data.ts](src/lib/demo-data.ts) 支援無本機資料庫時的離線範例結構模式 (`DEMO`)；`npm run build` (`tsc && vite build`) 已通過。

### Phase 4：資料表檢視器與資料表設計器 (Data Grid & Table Designer)（已完成）
- [x] **4.1 虛擬化資料網格 (Data Viewer Grid)**：
  - 已導入 `@tanstack/react-virtual` 完成 [src/components/DataViewerGrid.tsx](src/components/DataViewerGrid.tsx)，支援分頁（`100`/`500`/`1000`/`5000`）、欄位拖曳調寬、欄位顯示隱藏、點擊表頭與多欄位排序 (`ORDER BY`) 及 Navicat 風格視覺化篩選器 (`Filter Builder`)。
- [x] **4.2 內聯編輯與交易控制 (Inline CRUD & Change Set)**：
  - 已支援雙擊儲存格內聯編輯、新增列 (`+`)、標記刪除 (`-`)、右鍵快捷操作（`設為 NULL`、`設為空字串`、`還原`、`複製 INSERT SQL` / `JSON`）、套用 (`Apply Changes`) / 放棄 (`Discard`) 與送出前 SQL 預覽。
  - 已於 [src/lib/sql-builder.ts](src/lib/sql-builder.ts) 實作依主鍵優先定位 `WHERE` 條件及交易打包送出 (`BEGIN`/`START TRANSACTION` -> `COMMIT`/`ROLLBACK`)。
- [x] **4.3 資料表設計器 (Table Designer / DDL)**：
  - 已完成 [src/components/TableDesigner.tsx](src/components/TableDesigner.tsx)，支援新建資料表 (`CREATE TABLE`) 與修改現有結構 (`ALTER TABLE`)，涵蓋 `欄位`、`索引`、`外鍵`、`觸發器`、`選項與註解`、`SQL 預覽` 6 大分頁與即時 DDL 生成執行。

### Phase 5：SQL 查詢編輯器與進階生產力工具 (SQL Editor & Import/Export)（已完成）
- [x] **5.1 Monaco SQL 編輯器整合**：
  - 已導入 `monaco-editor`（Vite 本地 worker 打包，完全離線可用），實作 [src/components/MonacoSqlEditor.tsx](src/components/MonacoSqlEditor.tsx) 與 [src/lib/sql-formatter.ts](src/lib/sql-formatter.ts)，支援 MySQL/MariaDB vs PostgreSQL 方言高亮切換、`Table` / `View` / `Routine` / `Column`（含 `table.` 觸發）Schema-aware 智慧自動補全、`Ctrl+Enter` 執行選取與 `Ctrl+Shift+F` SQL 格式化。
- [x] **5.2 多結果集與執行計畫**：
  - 已升級 [src/components/QueryEditorPane.tsx](src/components/QueryEditorPane.tsx) 與 [src/store/workbenchStore.ts](src/store/workbenchStore.ts)，支援「執行全部」、「執行選取 / 執行當前語句」、「停止查詢 (`cancelQueryInTab`)」、多結果集 `結果 1 / 結果 2...` 分頁、`訊息` 分頁（逐句狀態、影響列數、耗時、錯誤提示）與 `解釋 (Explain)` 分頁（偵測全表掃描 `ALL` / `Seq Scan` 並警示）。
- [x] **5.3 查詢儲存與匯出精靈**：
  - 已於 Rust 後端 ([src-tauri/src/storage/mod.rs](src-tauri/src/storage/mod.rs)、[src-tauri/src/commands.rs](src-tauri/src/commands.rs)、[src-tauri/src/models.rs](src-tauri/src/models.rs)) 新增 `SavedQuery` 與 SQLite CRUD 指令 (`list_saved_queries`、`save_query`、`delete_saved_query`)；`cargo test` 7 項單元測試（含 `saved_query_store_crud`）全數通過。
  - 已完成 [src/lib/export-utils.ts](src/lib/export-utils.ts) 與 [src/components/ExportModal.tsx](src/components/ExportModal.tsx)，同時整合至資料網格與查詢結果工具列，支援 CSV（自訂分隔符與 `NULL` 顯示）、JSON（Pretty Print）與 SQL `INSERT`（單列/批次）匯出下載與複製，並支援於左側連線樹展開已儲存查詢。

### Phase 6：跨平台打包、驗證與效能調校 (Cross-Platform Polish & Verification)（已完成）
- [x] **6.1 Craft Anything 視覺與功能對照驗證**：
  - 已產出 [docs/parity-verification-report.md](docs/parity-verification-report.md)，依據 Phase 1 固化證據 (`ev_fcfdd0e5d869e85e843a15d1bb8e67df41b7b94535cfbcf580e3db37c91b8f46`, `docs/navicat-ui-spec.md`) 與 Phase 2 ~ 6 實作檔案，完成主工作台幾何佈局、MySQL / MariaDB / PostgreSQL 驅動與 Tunnel 安全架構，以及資料網格 / 設計器 / SQL 編輯器 / 匯出精靈之逐項對照驗證（並標記 Phase 6 時因 `navicat.exe` PID `400` 未開啟，未執行實況重擷取）。
- [x] **6.2 Windows / Linux / macOS 跨平台編譯與 CI 配置**：
  - 已更新 [vite.config.ts](vite.config.ts) 設定 `manualChunks` 拆分 `monaco-editor`、`react-vendor` 與 `ui-vendor`（0 chunk-size 警告）。
  - 已更新 [src-tauri/tauri.conf.json](src-tauri/tauri.conf.json) 補齊 `icons/icon.png`、分類與 macOS 最低版本規範 (`10.15`)。
  - 已新增 [.github/workflows/release.yml](.github/workflows/release.yml) 與 [README.md](README.md)，配置 Windows (`msi`/`nsis`)、Linux (`deb`/`AppImage`) 與 macOS (`dmg`/`app`) 自動驗證及 `tauri-action` 跨平台打包工作流。

---

## 5. 當前狀態與交接摘要 (Current Handoff & Next Actions)

- **目前進度**：**Phase 0 ~ Phase 6 已 100% 全部完成**；
  - `npm run build`（`tsc && vite build`，2852 modules）以 0 錯誤、0 警告通過，並獨立輸出 `monaco-editor`、`react-vendor` 與 `ui-vendor` 分塊資源。
  - Rust 核心測試 (`cargo test`，7/7 測試全數通過、0 警告)。
- **待確認或可選補充**：
  1. 若要啟動完整 Tauri 原生桌面視窗或生成本機安裝檔，請於載入 VS 2022 `vcvars64.bat` 的終端執行 `npm run tauri dev` 或 `npm run tauri build`（或針對執行中之真實 MySQL / MariaDB / PostgreSQL 實例測試連線）。
  2. 若需要對運行中的 `navicat.exe` 重新擷取實況視窗樹進行畫面比對，可重開 `navicat.exe` 後再次執行 Craft Anything `runtime_ui_read`。
- **已知避坑提示 (Traps to Avoid)**：
  - Windows 環境下執行 `cargo` / `npm run tauri dev` / `npm run tauri build` 前需載入 VS 2022 BuildTools (`vcvars64.bat`) 以取得 `link.exe`。
  - `monaco-editor@0.57.0` 需透過 `"monaco-editor"` 與 `"monaco-editor/editor/editor.worker?worker"` 匯入以符合其 `package.json` `exports` 規範並確保 Vite 離線打包 worker。
