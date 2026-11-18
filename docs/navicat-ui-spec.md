# Navicat Premium 18 UI/UX & Driver Specification Snapshot (`docs/navicat-ui-spec.md`)

> **用途**：本文件固化 **Phase 1** 透過 Craft Anything 取得之實際執行期 UI 與協定證據，作為 **Phase 2 ~ Phase 5** 的單一實作參照規範。後續回合請直接依據本文件開發，不需重新讀取龐大的原始 UI 樹。

---

## 1. 證據來源與邊界 (Evidence Metadata)

- **Craft Anything Evidence ID**：`ev_fcfdd0e5d869e85e843a15d1bb8e67df41b7b94535cfbcf580e3db37c91b8f46`
  - 工具：`runtime_ui_read`（Engine: `ui-automation`, Host: `windows-x86_64`, Clean-room: `true`）
  - 目標：`navicat.exe`（PID `400`），視窗類別 `TNavicatMainForm`，標題 `"Navicat Premium"`
  - 節點數：共擷取 **67 個 UI 元素**（未截斷，`truncated: false`）
  - 邊界註記：`ev_fcfdd0e5...` 記錄了「主工作台處於預設物件列表狀態」時的視窗控制項；「新增連線對話框」、「資料表檢視器 (Data Grid)」、「資料表設計器」與「SQL 查詢編輯器」於擷取時尚未開啟，其細部元件規格於下方明確標註為 `[Design Spec]`。
- **靜態檢視檔案 (`[Observed]`)**：
  - `C:\Program Files\Navicat\Navicat Premium 18\resource\httptunnel\ntunnel_mysql.php` (`$versionNum = 207`)
  - `C:\Program Files\Navicat\Navicat Premium 18\resource\httptunnel\ntunnel_pgsql.php` (`$versionNum = 204`)
  - 安裝目錄編譯相依與驅動模組清單（`libmariadb.dll`、`libpq.dll`、`sqlite3.dll`、`ssh.dll`、`cacert.pem`、`nparser.dll`、`libdv.dll`、`libqb.dll`、`libee.dll` 等）

---

## 2. 主工作台精確版面幾何與元件樹 (`[Observed]` — `TNavicatMainForm`)

### 2.1 整體座標與像素比例（觀測解析度：`2560 x 1392` 客戶區；外框 `2576 x 1408` @ `(-8, -8)`）

```text
+---------------------------------------------------------------------------------------------------+ y=0, h=23
| TitleBar: [系統] Navicat Premium                                                [Minimize][Restore][Close] |
+---------------------------------------------------------------------------------------------------+ y=23, h=25
| MenuBar (TActionMainMenuBar)                                                                      |
+---------------------------------------------------------------------------------------------------+ y=48, h=63
| Main ActionToolBar (flex-1, obs: 2400x62)                       | Aux Right Panel (160x62: 72+88) | (1px底線 y=110)
+---------------------+-------------------------------------------------------+---------------------+ y=111
| Left Explorer       | Center PanelNavTabs (flex-1, obs: w=1954)             | Right Inspector     |
| (w=300, x=0..300)   | +---------------------------------------------------+ | (w=300, x=2260..2560|
|                     | | TNavicatRkSmartTabs (h=26) + 4px accent bar (h=30)| | +-----------------+ |
| TVirtualStringTree  | +---------------------------------------------------+ | | Header (h=40)   | |
| (連線 / DB / Schema | | ActionToolBar2 (flex-1, h=26) | ViewMode (24x26)  | | +-----------------+ |
|  / 物件導覽樹)      | +---------------------------------------------------+ | | Info Card (h=72)| |
|                     | | TListView DataGrid (SysHeader32 h=24)             | | | Sync/Activity   | |
|                     | | [名稱 242][列 74][資料長度 94][引擎 74][修改 124]... | | | (TScrollBox)    | |
+---------------------+ |                                                   | |                   |
| plFilterControl(h30)|                                                   | |                   |
| [搜尋 179x21][按鈕] |                                                   | |                   |
+---------------------+---------------------------------------------------+---+---------------------+ y=1370, h=22
| StatusBar: Pane0 (w=300) | Pane1 (flex-1, obs: w=2133)              | Pane2 (w=69) | Pane3 (w=52) |
+---------------------------------------------------------------------------------------------------+ y=1392
```

### 2.2 對應 Tauri 2.0 (CSS Grid / Flexbox) 版面規範

| 區塊 (Observed VCL Class) | 觀測尺寸與位置 | Tauri 2.0 跨平台佈局規則 |
|---|---|---|
| **TitleBar** (`TitleBar`) | `y: 0, h: 23, w: 2560` | 視窗頂部列；Windows/Linux 可用自訂無邊框標題列或原生標題列，macOS 適配 `titleBarStyle: Overlay` |
| **MenuBar** (`TActionMainMenuBar`) | `y: 23, h: 25, w: 2560` | 頂部選單列（檔案 / 檢視 / 連線 / 收藏 / 工具 / 視窗 / 說明）；macOS 同步對應原生 App Menu |
| **Main Toolbar** (`TPanel` + `TActionToolBar`) | `y: 48, h: 63`（內容 `62px` + 底線 `1px`） | 左側主要大圖示工具列 (`flex-1`) + 右側輔助區 (`160px` = `72px` + `88px`) |
| **Left Explorer** (`TVTFilterFrame`) | `x: 0, y: 111, w: 300, h: 1259` | 預設寬度 `300px`（支援拖曳 `3px` 分隔線縮放）；上方 `TVirtualStringTree`（連線樹），底部固定 `30px` `plFilterControl`（`1px` 上分隔線 + 左側 `179px x 21px` 搜尋框含 `16x16` 圖示 + 右側 `109px` 過濾控制區 `92px + 17px`） |
| **Center Workspace** (`PanelNavTabs`) | `x: 303, y: 111, w: 1954, h: 1259` | 佔滿剩餘寬度 (`flex-1`)，與左右側各間隔 `3px` splitter：<br>1. `TNavicatRkSmartTabs`：`h: 30px`（標籤列 `26px` + 底部強調條 `4px`）<br>2. `ActionToolBar2`：`h: 26px`（左側物件操作工具列 `flex-1` + 右側 `24px` 檢視切換鈕）<br>3. 主內容區 (`PanelDockHost`)：物件列表 / 資料表檢視器 / SQL 編輯器 / 設計器 |
| **Object List DataGrid** (`TListView` + `SysHeader32`) | `x: 303, y: 167, w: 1954, h: 1203`（表頭 `h: 24`） | MySQL/MariaDB 觀測欄位：<br>1. `名稱` (`242px`)<br>2. `列` (`74px`)<br>3. `資料長度` (`94px`)<br>4. `引擎` (`74px`)<br>5. `修改日期` (`124px`)<br>6. `註解` (`124px`)<br>PostgreSQL `[Design Spec]` 對應欄位：`名稱`、`列 (預估)`、`資料表空間`、`擁有者`、`註解` |
| **Right Inspector** (`TPanel` + `TNavicatSyncActivityLog`) | `x: 2260, y: 111, w: 300, h: 1259` | 預設寬度 `300px`（支援收合與 `3px` splitter 拖曳）：頂部 `40px` 標題列 + `72px` 物件摘要卡 + 可捲動 DDL / 屬性 / 活動日誌區 |
| **Status Bar** (`TStatusBar`) | `x: 0, y: 1370, w: 2560, h: 22` | 固定 `22px` 高、4 欄配置：<br>`Pane0` (`300px`, 與左側樹對齊) / `Pane1` (`flex-1`, 狀態訊息與執行統計) / `Pane2` (`69px`) / `Pane3` (`52px`) |

---

## 3. 連線對話框與驅動協定規格 (MySQL / MariaDB / PostgreSQL)

### 3.1 新建 / 編輯連線對話框欄位 (`[Design Spec]`)
所有三種資料庫共用 6 分頁對話框架構，並依資料庫類型動態調整預設值與專用欄位：

1. **一般 (General)**：
   - 連線類型：`mysql` | `mariadb` | `postgresql`
   - 連線名稱 (`name`)
   - 主機 (`host`, 預設 `localhost`)
   - 埠 (`port`, 預設 MySQL/MariaDB `3306`、PostgreSQL `5432`)
   - 初始資料庫 (`initial_database`, PostgreSQL 必填/預設 `postgres`，MySQL/MariaDB 選填)
   - 使用者名稱 (`username`, 預設 `root` / `postgres`)
   - 密碼 (`password`, 選配 `save_password`)
2. **進階 (Advanced)**：
   - 連線顏色標記 (`color`, 如藍/綠/紅/橘以區分正式/測試環境)
   - 編碼 (`encoding`, 如 `utf8mb4` / `UTF8`)
   - 保持連線間隔 (`keepalive_secs`)
   - 連線逾時 (`connect_timeout_secs`)
   - 唯讀模式保護開關（選配安全提示）
3. **資料庫 (Databases)**：
   - 顯示清單模式（全部顯示 / 自訂勾選要展示的資料庫）
4. **SSL**：
   - 使用 SSL (`use_ssl`)、驗證模式 (`disable` / `prefer` / `require` / `verify_ca` / `verify_full`)
   - 用戶端金鑰 (`client_key`)、用戶端憑證 (`client_cert`)、CA 憑證 (`ca_cert`, 對應 Navicat 內建 `cacert.pem` 機制)
5. **SSH**：
   - 使用 SSH 通道 (`use_ssh`)
   - SSH 主機、埠 (`22`)、使用者名稱
   - 驗證方式：密碼 (`password`) 或私鑰檔案 (`private_key_path` + `passphrase`)
6. **HTTP (`[Observed]` 來自 `ntunnel_mysql.php` v207 / `ntunnel_pgsql.php` v204)**：
   - 使用 HTTP 通道 (`use_http_tunnel`)、Tunnel URL、Base64 編碼 (`encodeBase64`)

### 3.2 已觀測之 Navicat HTTP Tunnel 協定與 PostgreSQL OID 映射 (`[Observed]`)

從 `resource\httptunnel\ntunnel_mysql.php` 與 `ntunnel_pgsql.php` 直接觀測到的協定細節（Phase 2/後階段若實作 HTTP Tunnel 可直接相容）：
- **請求欄位 (POST)**：`actn`（`"C"` 取得連線資訊；`"Q"` 執行查詢陣列 `q[]`）、`host`、`port`、`login`、`password`、`db`（PostgreSQL 空值預設 `"template1"`）、`encodeBase64`（`"0"` / `"1"`）。
- **表頭封包格式**：`u32be(1111)` + `u16be(versionNum)` + `u32be(errno)` + `6 bytes 0x00`。
- **ResultSet 表頭**：`u32be(errno)` + `u32be(affected_rows)` + `u32be(insert_id)` + `u32be(num_fields)` + `u32be(num_rows)` + `12 bytes 0x00`。
- **區塊編碼**：長度 `< 254` 以 `u8(len) + payload`；`>= 254` 以 `0xFE + u32be(len) + payload`；`NULL` 值為單一位元組 `0xFF`。
- **PostgreSQL 常見 OID 映射（直接觀測自 `ntunnel_pgsql.php`）**：
  - `boolean=16`, `bytea=17`, `char=18`, `name=19`, `int8=20`, `int2=21`, `int2vector=22`, `int4=23`, `regproc=24`, `text=25`, `oid=26`, `tid=27`, `xid=28`, `cid=29`, `oidvector=30`, `cidr=650`, `float4=700`, `float8=701`, `money=790`, `macaddr=829`, `inet=869`, `bpchar=1042`, `varchar=1043`, `date=1082`, `time=1083`, `timestamp=1114`, `timestamptz=1184`, `interval=1186`, `timetz=1266`, `bit=1560`, `varbit=1562`, `numeric=1700`, `refcursor=1790`。

---

## 4. 連線樹雙階層模型、資料表檢視器與查詢編輯器規格 (`[Design Spec]`)

### 4.1 左側連線樹雙階層差異（MySQL/MariaDB vs PostgreSQL）
- **MySQL / MariaDB 階層**：
  `Connection -> Database -> [資料表 (Tables) | 檢視表 (Views) | 函式 (Functions) | 事件 (Events) | 查詢 (Queries)]`
- **PostgreSQL 階層**：
  `Connection -> Database -> Schema (e.g. public) -> [資料表 (Tables) | 檢視表 (Views) | 函式 (Functions) | 序列 (Sequences) | 查詢 (Queries)]`

### 4.2 資料表檢視器 (Data Viewer Grid)
- **上方列**：視覺化篩選器 (`Filter Builder`: 欄位 + 運算子 `=/!=/LIKE/IN/IS NULL` + 值) 與排序控制 (`ORDER BY`)。
- **中間格線**：虛擬化渲染欄位表頭（含型別/主鍵圖示）與儲存格；區分 `NULL`（灰色斜體）、空字串、BLOB/BYTEA 預覽、JSON 展開檢視。
- **底部控制列**：
  - 記錄操作：`+` 新增列、`-` 刪除列、`✓` 套用變更 (Apply Changes)、`✕` 放棄變更 (Discard Changes)、`↻` 重新整理
  - 分頁導覽：首頁 / 上一頁 / 頁碼輸入 / 下一頁 / 末頁、每頁筆數設定（預設 `1000`）
  - 變更佇列機制：修改儲存格不立即寫庫，標記異動後由使用者點選 `✓` 預覽並於單一 Transaction 中送出 `INSERT` / `UPDATE` / `DELETE`。

### 4.3 資料表設計器 (Table Designer / DDL)
- 子分頁：`欄位 (Fields)` | `索引 (Indexes)` | `外鍵 (Foreign Keys)` | `觸發器 (Triggers)` | `選項 (Options)` | `註解 (Comment)` | `SQL 預覽 (SQL Preview)`。
- 依方言生成對應 DDL（MySQL 使用 `` ` `` 反引號與 `AUTO_INCREMENT` / `ENGINE` / `CHARSET`；PostgreSQL 使用 `"` 雙引號與 `SERIAL`/`IDENTITY`、`COMMENT ON`）。

### 4.4 SQL 查詢編輯器 (Query Editor)
- 頂部情境列：連線選擇器 + 資料庫 / Schema 選擇器 + `執行 (Run)` + `執行選取 (Run Selected)` + `停止 (Stop)` + `解釋 (Explain)` + `美化 (Format)` + `儲存 (Save)`。
- 編輯區：Monaco Editor（依方言切換關鍵字與 Table/Column 自動補全）。
- 下方結果區：多結果集分頁 (`結果 1`, `結果 2`...) + `訊息 (Message)`（顯示逐句 SQL 狀態、影響列數、耗時 ms）+ `解釋 (Explain)`（`EXPLAIN` / `EXPLAIN ANALYZE` 計畫表）。
