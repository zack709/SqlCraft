import type {
  CellValue,
  ColumnInfo,
  DatabaseInfo,
  DbKind,
  ForeignKeyInfo,
  IndexInfo,
  QueryResultSet,
  RoutineInfo,
  SchemaInfo,
  SequenceInfo,
  TableInfo,
  ViewInfo,
} from "../types/database";

interface DemoTableDef {
  info: TableInfo;
  columns: ColumnInfo[];
  indexes: IndexInfo[];
  foreignKeys: ForeignKeyInfo[];
  rows: CellValue[][];
  ddl: string;
}

const DEMO_MYSQL_TABLES: Record<string, DemoTableDef[]> = {
  shop_prod: [
    {
      info: {
        database: "shop_prod",
        schema: null,
        name: "users",
        rowsEstimate: 14280,
        dataLengthBytes: 2621440,
        engine: "InnoDB",
        modifiedAt: "2026-11-12 09:42:10",
        comment: "會員主檔",
      },
      columns: [
        {
          name: "id",
          ordinalPosition: 1,
          dataType: "bigint",
          columnType: "bigint unsigned",
          nullable: false,
          defaultValue: null,
          isPrimaryKey: true,
          isAutoIncrement: true,
          characterSet: null,
          collation: null,
          comment: "主鍵 ID",
        },
        {
          name: "email",
          ordinalPosition: 2,
          dataType: "varchar",
          columnType: "varchar(190)",
          nullable: false,
          defaultValue: null,
          isPrimaryKey: false,
          isAutoIncrement: false,
          characterSet: "utf8mb4",
          collation: "utf8mb4_unicode_ci",
          comment: "電子郵件",
        },
        {
          name: "display_name",
          ordinalPosition: 3,
          dataType: "varchar",
          columnType: "varchar(80)",
          nullable: false,
          defaultValue: "''",
          isPrimaryKey: false,
          isAutoIncrement: false,
          characterSet: "utf8mb4",
          collation: "utf8mb4_unicode_ci",
          comment: "顯示名稱",
        },
        {
          name: "status",
          ordinalPosition: 4,
          dataType: "enum",
          columnType: "enum('active','pending','suspended')",
          nullable: false,
          defaultValue: "'active'",
          isPrimaryKey: false,
          isAutoIncrement: false,
          characterSet: "utf8mb4",
          collation: "utf8mb4_unicode_ci",
          comment: "帳號狀態",
        },
        {
          name: "created_at",
          ordinalPosition: 5,
          dataType: "timestamp",
          columnType: "timestamp",
          nullable: false,
          defaultValue: "CURRENT_TIMESTAMP",
          isPrimaryKey: false,
          isAutoIncrement: false,
          characterSet: null,
          collation: null,
          comment: "建立時間",
        },
      ],
      indexes: [
        {
          name: "PRIMARY",
          columns: ["id"],
          isUnique: true,
          isPrimary: true,
          indexType: "BTREE",
          comment: null,
        },
        {
          name: "uq_users_email",
          columns: ["email"],
          isUnique: true,
          isPrimary: false,
          indexType: "BTREE",
          comment: "Email 唯一索引",
        },
      ],
      foreignKeys: [],
      rows: [
        [1, "alice@sqlcraft.dev", "Alice Lin", "active", "2026-10-01 10:15:00"],
        [2, "bob@sqlcraft.dev", "Bob Chen", "active", "2026-10-04 14:22:31"],
        [3, "carol@sqlcraft.dev", "Carol Wu", "pending", "2026-11-02 08:05:19"],
      ],
      ddl: `CREATE TABLE \`users\` (
  \`id\` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主鍵 ID',
  \`email\` varchar(190) NOT NULL COMMENT '電子郵件',
  \`display_name\` varchar(80) NOT NULL DEFAULT '' COMMENT '顯示名稱',
  \`status\` enum('active','pending','suspended') NOT NULL DEFAULT 'active' COMMENT '帳號狀態',
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '建立時間',
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uq_users_email\` (\`email\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='會員主檔';`,
    },
    {
      info: {
        database: "shop_prod",
        schema: null,
        name: "orders",
        rowsEstimate: 89410,
        dataLengthBytes: 18874368,
        engine: "InnoDB",
        modifiedAt: "2026-11-17 18:10:04",
        comment: "訂單交易主表",
      },
      columns: [
        {
          name: "id",
          ordinalPosition: 1,
          dataType: "bigint",
          columnType: "bigint unsigned",
          nullable: false,
          defaultValue: null,
          isPrimaryKey: true,
          isAutoIncrement: true,
          characterSet: null,
          collation: null,
          comment: "訂單流水號",
        },
        {
          name: "user_id",
          ordinalPosition: 2,
          dataType: "bigint",
          columnType: "bigint unsigned",
          nullable: false,
          defaultValue: null,
          isPrimaryKey: false,
          isAutoIncrement: false,
          characterSet: null,
          collation: null,
          comment: "下單會員",
        },
        {
          name: "order_no",
          ordinalPosition: 3,
          dataType: "varchar",
          columnType: "varchar(32)",
          nullable: false,
          defaultValue: null,
          isPrimaryKey: false,
          isAutoIncrement: false,
          characterSet: "utf8mb4",
          collation: "utf8mb4_unicode_ci",
          comment: "訂單編號",
        },
        {
          name: "total_amount",
          ordinalPosition: 4,
          dataType: "decimal",
          columnType: "decimal(12,2)",
          nullable: false,
          defaultValue: "0.00",
          isPrimaryKey: false,
          isAutoIncrement: false,
          characterSet: null,
          collation: null,
          comment: "訂單總額",
        },
        {
          name: "paid_at",
          ordinalPosition: 5,
          dataType: "datetime",
          columnType: "datetime",
          nullable: true,
          defaultValue: null,
          isPrimaryKey: false,
          isAutoIncrement: false,
          characterSet: null,
          collation: null,
          comment: "付款時間",
        },
      ],
      indexes: [
        {
          name: "PRIMARY",
          columns: ["id"],
          isUnique: true,
          isPrimary: true,
          indexType: "BTREE",
          comment: null,
        },
        {
          name: "idx_orders_user_id",
          columns: ["user_id"],
          isUnique: false,
          isPrimary: false,
          indexType: "BTREE",
          comment: null,
        },
      ],
      foreignKeys: [
        {
          name: "fk_orders_user_id",
          columns: ["user_id"],
          referencedSchema: "shop_prod",
          referencedTable: "users",
          referencedColumns: ["id"],
          onUpdate: "CASCADE",
          onDelete: "RESTRICT",
        },
      ],
      rows: [
        [1001, 1, "ORD-20261117-001", "2490.00", "2026-11-17 11:20:00"],
        [1002, 2, "ORD-20261117-002", "899.50", null],
      ],
      ddl: `CREATE TABLE \`orders\` (
  \`id\` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '訂單流水號',
  \`user_id\` bigint unsigned NOT NULL COMMENT '下單會員',
  \`order_no\` varchar(32) NOT NULL COMMENT '訂單編號',
  \`total_amount\` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '訂單總額',
  \`paid_at\` datetime DEFAULT NULL COMMENT '付款時間',
  PRIMARY KEY (\`id\`),
  KEY \`idx_orders_user_id\` (\`user_id\`),
  CONSTRAINT \`fk_orders_user_id\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='訂單交易主表';`,
    },
    {
      info: {
        database: "shop_prod",
        schema: null,
        name: "products",
        rowsEstimate: 640,
        dataLengthBytes: 393216,
        engine: "InnoDB",
        modifiedAt: "2026-11-10 15:00:00",
        comment: "商品目錄",
      },
      columns: [
        {
          name: "id",
          ordinalPosition: 1,
          dataType: "int",
          columnType: "int unsigned",
          nullable: false,
          defaultValue: null,
          isPrimaryKey: true,
          isAutoIncrement: true,
          characterSet: null,
          collation: null,
          comment: null,
        },
        {
          name: "sku",
          ordinalPosition: 2,
          dataType: "varchar",
          columnType: "varchar(64)",
          nullable: false,
          defaultValue: null,
          isPrimaryKey: false,
          isAutoIncrement: false,
          characterSet: "utf8mb4",
          collation: "utf8mb4_unicode_ci",
          comment: "商品料號",
        },
        {
          name: "title",
          ordinalPosition: 3,
          dataType: "varchar",
          columnType: "varchar(200)",
          nullable: false,
          defaultValue: null,
          isPrimaryKey: false,
          isAutoIncrement: false,
          characterSet: "utf8mb4",
          collation: "utf8mb4_unicode_ci",
          comment: "商品名稱",
        },
        {
          name: "stock",
          ordinalPosition: 4,
          dataType: "int",
          columnType: "int",
          nullable: false,
          defaultValue: "0",
          isPrimaryKey: false,
          isAutoIncrement: false,
          characterSet: null,
          collation: null,
          comment: "庫存數量",
        },
      ],
      indexes: [
        {
          name: "PRIMARY",
          columns: ["id"],
          isUnique: true,
          isPrimary: true,
          indexType: "BTREE",
          comment: null,
        },
      ],
      foreignKeys: [],
      rows: [
        [10, "SKU-SQLC-01", "SqlCraft Pro Keycap", 45],
        [11, "SKU-SQLC-02", "USB-C NVMe Dock", 18],
      ],
      ddl: `CREATE TABLE \`products\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`sku\` varchar(64) NOT NULL COMMENT '商品料號',
  \`title\` varchar(200) NOT NULL COMMENT '商品名稱',
  \`stock\` int NOT NULL DEFAULT '0' COMMENT '庫存數量',
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='商品目錄';`,
    },
  ],
  analytics: [
    {
      info: {
        database: "analytics",
        schema: null,
        name: "daily_metrics",
        rowsEstimate: 1250,
        dataLengthBytes: 262144,
        engine: "InnoDB",
        modifiedAt: "2026-11-18 01:00:00",
        comment: "每日流量指標",
      },
      columns: [
        {
          name: "metric_date",
          ordinalPosition: 1,
          dataType: "date",
          columnType: "date",
          nullable: false,
          defaultValue: null,
          isPrimaryKey: true,
          isAutoIncrement: false,
          characterSet: null,
          collation: null,
          comment: null,
        },
        {
          name: "active_users",
          ordinalPosition: 2,
          dataType: "int",
          columnType: "int",
          nullable: false,
          defaultValue: "0",
          isPrimaryKey: false,
          isAutoIncrement: false,
          characterSet: null,
          collation: null,
          comment: null,
        },
      ],
      indexes: [
        {
          name: "PRIMARY",
          columns: ["metric_date"],
          isUnique: true,
          isPrimary: true,
          indexType: "BTREE",
          comment: null,
        },
      ],
      foreignKeys: [],
      rows: [
        ["2026-11-16", 3120],
        ["2026-11-17", 3490],
      ],
      ddl: `CREATE TABLE \`daily_metrics\` (
  \`metric_date\` date NOT NULL,
  \`active_users\` int NOT NULL DEFAULT '0',
  PRIMARY KEY (\`metric_date\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='每日流量指標';`,
    },
  ],
};

const DEMO_PG_TABLES: Record<string, Record<string, DemoTableDef[]>> = {
  postgres: {
    public: [
      {
        info: {
          database: "postgres",
          schema: "public",
          name: "accounts",
          rowsEstimate: 3500,
          dataLengthBytes: 786432,
          engine: "PostgreSQL",
          tablespace: "pg_default",
          owner: "postgres",
          modifiedAt: null,
          comment: "租戶帳戶資料表",
        },
        columns: [
          {
            name: "id",
            ordinalPosition: 1,
            dataType: "uuid",
            columnType: "uuid",
            nullable: false,
            defaultValue: "gen_random_uuid()",
            isPrimaryKey: true,
            isAutoIncrement: false,
            characterSet: null,
            collation: null,
            comment: "帳戶 UUID",
          },
          {
            name: "org_name",
            ordinalPosition: 2,
            dataType: "varchar",
            columnType: "character varying(120)",
            nullable: false,
            defaultValue: null,
            isPrimaryKey: false,
            isAutoIncrement: false,
            characterSet: null,
            collation: null,
            comment: "組織名稱",
          },
          {
            name: "plan_tier",
            ordinalPosition: 3,
            dataType: "text",
            columnType: "text",
            nullable: false,
            defaultValue: "'starter'::text",
            isPrimaryKey: false,
            isAutoIncrement: false,
            characterSet: null,
            collation: null,
            comment: "訂閱方案",
          },
          {
            name: "settings",
            ordinalPosition: 4,
            dataType: "jsonb",
            columnType: "jsonb",
            nullable: false,
            defaultValue: "'{}'::jsonb",
            isPrimaryKey: false,
            isAutoIncrement: false,
            characterSet: null,
            collation: null,
            comment: "JSONB 設定",
          },
        ],
        indexes: [
          {
            name: "accounts_pkey",
            columns: ["id"],
            isUnique: true,
            isPrimary: true,
            indexType: "btree",
            comment: null,
          },
          {
            name: "idx_accounts_settings_gin",
            columns: ["settings"],
            isUnique: false,
            isPrimary: false,
            indexType: "gin",
            comment: "JSONB GIN Index",
          },
        ],
        foreignKeys: [],
        rows: [
          [
            "550e8400-e29b-41d4-a716-446655440000",
            "SqlCraft Taiwan",
            "enterprise",
            '{"region":"ap-east","sso":true}',
          ],
          [
            "550e8400-e29b-41d4-a716-446655440001",
            "Northwind Labs",
            "pro",
            '{"region":"us-west","sso":false}',
          ],
        ],
        ddl: `CREATE TABLE "public"."accounts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "org_name" character varying(120) NOT NULL,
  "plan_tier" text NOT NULL DEFAULT 'starter'::text,
  "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY ("id")
);`,
      },
      {
        info: {
          database: "postgres",
          schema: "public",
          name: "audit_events",
          rowsEstimate: 94200,
          dataLengthBytes: 25165824,
          engine: "PostgreSQL",
          tablespace: "pg_default",
          owner: "postgres",
          modifiedAt: null,
          comment: "安全稽核紀錄",
        },
        columns: [
          {
            name: "event_id",
            ordinalPosition: 1,
            dataType: "int8",
            columnType: "bigint",
            nullable: false,
            defaultValue: "nextval('audit_events_event_id_seq'::regclass)",
            isPrimaryKey: true,
            isAutoIncrement: true,
            characterSet: null,
            collation: null,
            comment: null,
          },
          {
            name: "account_id",
            ordinalPosition: 2,
            dataType: "uuid",
            columnType: "uuid",
            nullable: false,
            defaultValue: null,
            isPrimaryKey: false,
            isAutoIncrement: false,
            characterSet: null,
            collation: null,
            comment: null,
          },
          {
            name: "action",
            ordinalPosition: 3,
            dataType: "text",
            columnType: "text",
            nullable: false,
            defaultValue: null,
            isPrimaryKey: false,
            isAutoIncrement: false,
            characterSet: null,
            collation: null,
            comment: null,
          },
          {
            name: "occurred_at",
            ordinalPosition: 4,
            dataType: "timestamptz",
            columnType: "timestamp with time zone",
            nullable: false,
            defaultValue: "now()",
            isPrimaryKey: false,
            isAutoIncrement: false,
            characterSet: null,
            collation: null,
            comment: null,
          },
        ],
        indexes: [
          {
            name: "audit_events_pkey",
            columns: ["event_id"],
            isUnique: true,
            isPrimary: true,
            indexType: "btree",
            comment: null,
          },
        ],
        foreignKeys: [
          {
            name: "fk_audit_account",
            columns: ["account_id"],
            referencedSchema: "public",
            referencedTable: "accounts",
            referencedColumns: ["id"],
            onUpdate: "NO ACTION",
            onDelete: "CASCADE",
          },
        ],
        rows: [
          [101, "550e8400-e29b-41d4-a716-446655440000", "ROLE_UPDATED", "2026-11-18T02:10:00Z"],
          [102, "550e8400-e29b-41d4-a716-446655440001", "KEY_ROTATED", "2026-11-18T02:14:32Z"],
        ],
        ddl: `CREATE TABLE "public"."audit_events" (
  "event_id" bigint NOT NULL DEFAULT nextval('audit_events_event_id_seq'::regclass),
  "account_id" uuid NOT NULL,
  "action" text NOT NULL,
  "occurred_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("event_id")
);`,
      },
    ],
    billing: [
      {
        info: {
          database: "postgres",
          schema: "billing",
          name: "invoices",
          rowsEstimate: 1210,
          dataLengthBytes: 524288,
          engine: "PostgreSQL",
          tablespace: "pg_default",
          owner: "postgres",
          modifiedAt: null,
          comment: "帳單主檔",
        },
        columns: [
          {
            name: "invoice_no",
            ordinalPosition: 1,
            dataType: "text",
            columnType: "text",
            nullable: false,
            defaultValue: null,
            isPrimaryKey: true,
            isAutoIncrement: false,
            characterSet: null,
            collation: null,
            comment: null,
          },
          {
            name: "amount_twd",
            ordinalPosition: 2,
            dataType: "numeric",
            columnType: "numeric(12,2)",
            nullable: false,
            defaultValue: "0",
            isPrimaryKey: false,
            isAutoIncrement: false,
            characterSet: null,
            collation: null,
            comment: null,
          },
        ],
        indexes: [
          {
            name: "invoices_pkey",
            columns: ["invoice_no"],
            isUnique: true,
            isPrimary: true,
            indexType: "btree",
            comment: null,
          },
        ],
        foreignKeys: [],
        rows: [
          ["INV-2026-001", "18000.00"],
          ["INV-2026-002", "5400.00"],
        ],
        ddl: `CREATE TABLE "billing"."invoices" (
  "invoice_no" text NOT NULL,
  "amount_twd" numeric(12,2) NOT NULL DEFAULT 0,
  PRIMARY KEY ("invoice_no")
);`,
      },
    ],
  },
  app_staging: {
    public: [
      {
        info: {
          database: "app_staging",
          schema: "public",
          name: "feature_flags",
          rowsEstimate: 28,
          dataLengthBytes: 32768,
          engine: "PostgreSQL",
          tablespace: "pg_default",
          owner: "postgres",
          modifiedAt: null,
          comment: "功能開關設定",
        },
        columns: [
          {
            name: "flag_key",
            ordinalPosition: 1,
            dataType: "text",
            columnType: "text",
            nullable: false,
            defaultValue: null,
            isPrimaryKey: true,
            isAutoIncrement: false,
            characterSet: null,
            collation: null,
            comment: null,
          },
          {
            name: "enabled",
            ordinalPosition: 2,
            dataType: "bool",
            columnType: "boolean",
            nullable: false,
            defaultValue: "false",
            isPrimaryKey: false,
            isAutoIncrement: false,
            characterSet: null,
            collation: null,
            comment: null,
          },
        ],
        indexes: [
          {
            name: "feature_flags_pkey",
            columns: ["flag_key"],
            isUnique: true,
            isPrimary: true,
            indexType: "btree",
            comment: null,
          },
        ],
        foreignKeys: [],
        rows: [
          ["new_grid_virtualizer", true],
          ["explain_flamegraph", false],
        ],
        ddl: `CREATE TABLE "public"."feature_flags" (
  "flag_key" text NOT NULL,
  "enabled" boolean NOT NULL DEFAULT false,
  PRIMARY KEY ("flag_key")
);`,
      },
    ],
  },
};

export function getDemoDatabases(dbKind: DbKind): DatabaseInfo[] {
  if (dbKind === "postgres") {
    return [
      { name: "postgres", charset: "UTF8", collation: "en_US.utf8", owner: "postgres", sizeBytes: 26476544 },
      { name: "app_staging", charset: "UTF8", collation: "en_US.utf8", owner: "postgres", sizeBytes: 8388608 },
    ];
  }
  return [
    { name: "shop_prod", charset: "utf8mb4", collation: "utf8mb4_unicode_ci", sizeBytes: 21889024 },
    { name: "analytics", charset: "utf8mb4", collation: "utf8mb4_unicode_ci", sizeBytes: 262144 },
  ];
}

export function getDemoSchemas(dbKind: DbKind, database: string): SchemaInfo[] {
  if (dbKind !== "postgres") return [];
  const dbSchemas = DEMO_PG_TABLES[database];
  if (!dbSchemas) return [{ database, name: "public", owner: "postgres" }];
  return Object.keys(dbSchemas).map((name) => ({ database, name, owner: "postgres" }));
}

function findDemoTables(dbKind: DbKind, database: string, schema?: string | null): DemoTableDef[] {
  if (dbKind === "postgres") {
    return DEMO_PG_TABLES[database]?.[schema || "public"] ?? [];
  }
  return DEMO_MYSQL_TABLES[database] ?? [];
}

export function getDemoTables(dbKind: DbKind, database: string, schema?: string | null): TableInfo[] {
  return findDemoTables(dbKind, database, schema).map((t) => t.info);
}

export function getDemoViews(dbKind: DbKind, database: string, schema?: string | null): ViewInfo[] {
  if (dbKind === "postgres") {
    if (database === "postgres" && (schema || "public") === "public") {
      return [
        {
          database,
          schema: "public",
          name: "v_enterprise_accounts",
          owner: "postgres",
          isUpdatable: false,
          comment: "企業方案租戶檢視表",
        },
      ];
    }
    return [];
  }
  if (database === "shop_prod") {
    return [
      {
        database,
        schema: null,
        name: "v_active_users",
        owner: "root@localhost",
        isUpdatable: true,
        comment: "有效會員檢視表",
      },
    ];
  }
  return [];
}

export function getDemoRoutines(dbKind: DbKind, database: string, schema?: string | null): RoutineInfo[] {
  if (dbKind === "postgres") {
    if (database === "postgres" && (schema || "public") === "public") {
      return [
        {
          database,
          schema: "public",
          name: "fn_record_audit",
          routineType: "FUNCTION",
          returnType: "bigint",
          definer: "postgres",
          comment: "寫入稽核紀錄",
        },
      ];
    }
    return [];
  }
  if (database === "shop_prod") {
    return [
      {
        database,
        schema: null,
        name: "sp_recalc_order_total",
        routineType: "PROCEDURE",
        returnType: null,
        definer: "root@localhost",
        comment: "重算訂單總額",
      },
    ];
  }
  return [];
}

export function getDemoSequences(dbKind: DbKind, database: string, schema?: string | null): SequenceInfo[] {
  if (dbKind !== "postgres") return [];
  if (database === "postgres" && (schema || "public") === "public") {
    return [
      {
        database,
        schema: "public",
        name: "audit_events_event_id_seq",
        dataType: "bigint",
        lastValue: 102,
      },
    ];
  }
  return [];
}

export function getDemoTableMeta(
  dbKind: DbKind,
  database: string,
  schema: string | null | undefined,
  table: string
): {
  columns: ColumnInfo[];
  indexes: IndexInfo[];
  foreignKeys: ForeignKeyInfo[];
  ddl: string;
  sampleData: QueryResultSet;
} | null {
  const def = findDemoTables(dbKind, database, schema).find((t) => t.info.name === table);
  if (!def) return null;
  return {
    columns: def.columns,
    indexes: def.indexes,
    foreignKeys: def.foreignKeys,
    ddl: def.ddl,
    sampleData: {
      columns: def.columns.map((c) => ({ name: c.name, dataType: c.columnType })),
      rows: def.rows,
      affectedRows: 0,
      executionMs: 4,
      truncated: false,
      warning: "Demo 模式資料預覽（離線範例資料）",
    },
  };
}

export function updateDemoTableRows(
  dbKind: DbKind,
  database: string,
  schema: string | null | undefined,
  table: string,
  nextRows: CellValue[][]
): void {
  const def = findDemoTables(dbKind, database, schema).find((t) => t.info.name === table);
  if (def) {
    def.rows = nextRows;
    def.info.rowsEstimate = nextRows.length;
  }
}

export function upsertDemoTable(
  dbKind: DbKind,
  database: string,
  schema: string | null | undefined,
  table: string,
  meta: {
    columns: ColumnInfo[];
    indexes: IndexInfo[];
    foreignKeys: ForeignKeyInfo[];
    ddl: string;
  }
): void {
  const list =
    dbKind === "postgres"
      ? (DEMO_PG_TABLES[database] ??= {})[schema || "public"] ??= []
      : (DEMO_MYSQL_TABLES[database] ??= []);
  const existing = list.find((t) => t.info.name === table);
  if (existing) {
    existing.columns = meta.columns;
    existing.indexes = meta.indexes;
    existing.foreignKeys = meta.foreignKeys;
    existing.ddl = meta.ddl;
  } else {
    list.push({
      info: {
        database,
        schema: dbKind === "postgres" ? schema || "public" : null,
        name: table,
        rowsEstimate: 0,
        dataLengthBytes: 16384,
        engine: dbKind === "postgres" ? "PostgreSQL" : "InnoDB",
        tablespace: dbKind === "postgres" ? "pg_default" : null,
        owner: dbKind === "postgres" ? "postgres" : null,
        modifiedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
        comment: "新建範例資料表",
      },
      columns: meta.columns,
      indexes: meta.indexes,
      foreignKeys: meta.foreignKeys,
      rows: [],
      ddl: meta.ddl,
    });
  }
}
