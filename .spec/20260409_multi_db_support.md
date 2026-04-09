# 多数据库支持（MySQL + PostgreSQL + 多连接）- 需求规格说明

## 1. 需求概述

在现有仅支持 PostgreSQL 单连接的 MCP Server 基础上，进行如下重大升级：
1. **新增 MySQL 数据库支持**：除 PostgreSQL 外，支持连接 MySQL 数据库。
2. **多连接管理**：支持通过 JSON 配置文件同时定义和管理多个数据库连接，每个连接拥有唯一名称作为标识。
3. **工具改造**：所有现有工具（`list_tables`、`describe_table`、`execute_sql`）增加 `connectionName` 参数以指定目标连接；新增 `list_connections` 工具供模型查询可用连接列表。

## 2. 配置方式

### 2.1 JSON 配置文件

通过 CLI 参数 `--config <path>` 指定配置文件路径。配置文件结构如下：

```json
{
  "connections": [
    {
      "name": "analytics-pg",
      "type": "postgresql",
      "host": "127.0.0.1",
      "port": 5432,
      "user": "postgres",
      "password": "secret",
      "database": "analytics",
      "schemas": ["public", "reporting"]
    },
    {
      "name": "order-mysql",
      "type": "mysql",
      "host": "127.0.0.1",
      "port": 3306,
      "user": "root",
      "password": "secret",
      "database": "orders"
    }
  ]
}
```

### 2.2 配置字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | ✅ | 连接的唯一标识名称，用于工具调用时指定目标 |
| `type` | enum | ✅ | 数据库类型，可选值：`postgresql`、`mysql` |
| `host` | string | ✅ | 数据库主机地址 |
| `port` | number | ❌ | 端口号。PostgreSQL 默认 `5432`，MySQL 默认 `3306` |
| `user` | string | ✅ | 数据库用户名 |
| `password` | string | ✅ | 数据库密码 |
| `database` | string | ✅ | 数据库名称 |
| `schemas` | string[] | ❌ | 仅 PostgreSQL 生效，默认 `["public"]`。MySQL 忽略此字段 |

### 2.3 CLI 参数变更

原有的 `-H`、`-p`、`-u`、`-w`、`-d`、`-s` 等独立参数**全部移除**，统一改为：

```bash
db-mcp-server --config <path-to-config.json>
```

- `-c, --config <path>`：配置文件路径（必填）。

## 3. MCP Tools 设计

### 3.1 `list_connections`（新增）

- **说明**：列出配置文件中所有可用的数据库连接信息。
- **参数**：无。
- **返回**：每个连接的 `name`、`type`、`host`、`port`、`database` 信息（不返回密码）。

### 3.2 `list_tables`（修改）

- **说明**：列出指定连接下的所有数据表。
- **参数**：
  - `connectionName` (string, 必填)：目标连接名称。
- **逻辑**：
  - PostgreSQL：查询 `information_schema.tables`，按配置的 schemas 过滤。
  - MySQL：查询 `information_schema.tables`，按配置的 database 过滤。

### 3.3 `describe_table`（修改）

- **说明**：返回指定连接下某张表的详细字段信息。
- **参数**：
  - `connectionName` (string, 必填)：目标连接名称。
  - `tableName` (string, 必填)：表名。PostgreSQL 支持 `schema.table` 格式。
- **逻辑**：
  - PostgreSQL：查询 `information_schema.columns`，支持 schema 解析。
  - MySQL：查询 `information_schema.columns`，按 database 过滤。

### 3.4 `execute_sql`（修改）

- **说明**：在指定连接上执行 SQL（受安全校验限制）。
- **参数**：
  - `connectionName` (string, 必填)：目标连接名称。
  - `sql` (string, 必填)：SQL 语句。
- **逻辑**：根据连接类型选择对应的数据库方言进行 SQL 校验和执行。

## 4. 架构设计

### 4.1 目录结构变更

```
src/
├── index.ts                  # CLI 入口（读取配置、启动 MCP Server）
├── types.ts                  # [NEW] 枚举与接口定义（DatabaseType, ConnectionConfig）
├── connection-manager.ts     # [NEW] 多连接管理器（持有所有连接实例的 Map）
├── validator.ts              # [MODIFY] SQL 校验（根据数据库类型切换方言）
└── db/
    ├── database.ts           # [NEW] 数据库操作抽象接口 IDatabase
    ├── database-factory.ts   # [NEW] 工厂方法，根据 type 创建对应数据库实例
    ├── postgres-database.ts  # [NEW] PostgreSQL 实现（从原 db.ts 迁移）
    └── mysql-database.ts     # [NEW] MySQL 实现
```

### 4.2 核心类/接口设计

#### `DatabaseType` 枚举 (`types.ts`)
```typescript
enum DatabaseType {
    POSTGRESQL = 'postgresql',
    MYSQL = 'mysql',
}
```

#### `ConnectionConfig` 接口 (`types.ts`)
```typescript
interface ConnectionConfig {
    name: string;
    type: DatabaseType;
    host: string;
    port?: number;
    user: string;
    password: string;
    database: string;
    schemas?: string[];  // 仅 PostgreSQL 生效
}
```

#### `IDatabase` 接口 (`db/database.ts`)
```typescript
interface IDatabase {
    query(sql: string, params?: any[]): Promise<any[]>;
    listTables(): Promise<any[]>;
    describeTable(tableName: string): Promise<any[]>;
    close(): Promise<void>;
}
```

#### `ConnectionManager` 类 (`connection-manager.ts`)
- 持有 `Map<string, IDatabase>` 连接池映射
- `getConnection(name: string): IDatabase` - 获取指定连接
- `getConnectionConfig(name: string): ConnectionConfig` - 获取连接配置（脱敏）
- `getAllConnectionInfos()` - 返回所有连接的基本信息（不含密码）
- `closeAll()` - 关闭所有连接

#### `DatabaseFactory` (`db/database-factory.ts`)
- 根据 `ConnectionConfig.type` 创建对应的 `IDatabase` 实例
- `postgresql` → `PostgresDatabase`
- `mysql` → `MysqlDatabase`

### 4.3 SQL 校验器变更 (`validator.ts`)

- `validateSql(sql: string, dbType: DatabaseType)` 增加 `dbType` 参数
- `node-sql-parser` 的 `astify` 根据 dbType 传入不同的 `database` 选项：
  - `DatabaseType.POSTGRESQL` → `{ database: 'Postgresql' }`
  - `DatabaseType.MYSQL` → `{ database: 'MySQL' }`

### 4.4 MySQL 实现要点 (`db/mysql-database.ts`)

- 使用 `mysql2` 的 Promise API（`mysql2/promise`）创建连接池
- `listTables()`：查询 `information_schema.tables WHERE table_schema = <database>`
- `describeTable(tableName)`：查询 `information_schema.columns WHERE table_schema = <database> AND table_name = <tableName>`
- `query(sql, params)`：直接执行，使用 `?` 占位符
- 忽略 `schemas` 配置

## 5. 依赖变更

| 包名 | 动作 | 说明 |
|------|------|------|
| `mysql2` | 新增 | MySQL 数据库驱动（自带 TypeScript 类型，无需额外 @types） |
| `pg` | 保留 | PostgreSQL 驱动 |

## 6. MCP 客户端配置示例

```json
{
  "mcpServers": {
    "DatabaseMCP": {
      "command": "node",
      "args": [
        "绝对路径/db_mcp_server/dist/index.js",
        "--config", "绝对路径/db-connections.json"
      ]
    }
  }
}
```

## 7. 向后兼容性

> [!WARNING]
> 此次变更为**破坏性变更**，原有的 CLI 单连接参数模式将被移除，统一使用配置文件。已有用户需要将原 CLI 参数迁移为 JSON 配置文件格式。

## 8. 删除的文件

- `src/db.ts`：原 PostgreSQL 单数据库实现，功能迁移至 `src/db/postgres-database.ts`。
