# DB MCP Server

本程序是一个为大语言模型设计、遵循 [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) 协议的底层数据库接入服务。它可以作为大语言模型（如 Antigravity）的外部数据库交互工具。

支持 **PostgreSQL** 和 **MySQL** 数据库，并可通过配置文件同时管理多个数据库连接。内置了防止破坏性操作（`DELETE`, `DROP` 等）的 SQL 分析防火墙，主张"安全的数据库分析问答"。同时提供可独立开关的 `insert_data` 工具，按需开启数据插入能力。

---

## 💡 功能亮点

1. **多数据库支持**：同时支持 PostgreSQL 和 MySQL，通过统一接口操作不同类型的数据库。
2. **多连接管理**：通过 JSON 配置文件定义多个命名连接，一个 MCP Server 实例即可服务多个数据库。
3. **安全至上**：集成 `node-sql-parser` 和正则双重校验，采用**严格白名单策略**。仅放行 `SELECT`、表结构查询、无破坏性结构变更（`CREATE TABLE`、新增/修改字段的 `ALTER TABLE`）以及注释操作（`COMMENT`）。所有未被明确授权的操作（包括 `DELETE`、`DROP`、`UPDATE`、`INSERT`、`TRUNCATE`、`GRANT`、`REVOKE`、`RENAME`、`EXECUTE` 等）一律拒绝。
4. **智能方言切换**：SQL 校验引擎根据目标连接的数据库类型自动切换校验方言。
5. **内置检索辅助工具**：自带 `list_connections`、`list_tables` 与 `describe_table` 高级封装工具，大语言模型无需猜测底层 DDL 也能完美完成结构化查询。
6. **可选数据插入**：提供独立的 `insert_data` 工具，支持标准 VALUES 插入、`INSERT...SELECT`、多行批量插入。该工具与 `execute_sql` 完全独立，可在 MCP 客户端中单独开启或关闭，灵活满足数据写入需求。

---

## ⚙️ 运行环境要求

1. **Node.js 环境**：要求 Node.js 版本为 **v18 或更高版本**（因为 `@modelcontextprotocol/sdk` 等底层库对 Node 版本有一定要求）。
2. **依赖包 (node_modules)**：由于本应用未集成捆绑打包，不能只单独拷贝 `dist` 文件夹运行。在最终的运行机器上，必须要在包含 `package.json` 的同级目录下运行 `npm install --omit=dev` (或全量 `npm install`) 来安装诸如 `pg`、`mysql2` 和 `mcp-sdk` 等依赖。

---

## 🛠 安装与构建

### 1. 源码构建
如果你下载了源码，只需要安装依赖并进行一次 `TypeScript` 编译：

```bash
npm install
npm run build
```

编译产物会存放在 `./dist` 目录中。

### 2. 全局本地安装
构建完成后，推荐将其作为系统全局的命令连接：

```bash
npm link
```
执行完毕后，您可以在系统任意处使用全局命令 `db-mcp-server` 快速唤起该服务。

---

## 📝 配置文件

使用 JSON 文件配置数据库连接。每个连接需要一个唯一的 `name` 作为标识。

### 配置文件示例

```json
{
  "connections": [
    {
      "name": "analytics-pg",
      "type": "postgresql",
      "host": "127.0.0.1",
      "port": 5432,
      "user": "postgres",
      "password": "my-secret-password",
      "database": "analytics",
      "schemas": ["public", "reporting"]
    },
    {
      "name": "order-mysql",
      "type": "mysql",
      "host": "127.0.0.1",
      "port": 3306,
      "user": "root",
      "password": "my-secret-password",
      "database": "orders"
    }
  ]
}
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | ✅ | 连接的唯一标识名称，用于工具调用时指定目标 |
| `type` | string | ✅ | 数据库类型：`postgresql` 或 `mysql` |
| `host` | string | ✅ | 数据库主机地址 |
| `port` | number | ❌ | 端口号。PostgreSQL 默认 `5432`，MySQL 默认 `3306` |
| `user` | string | ✅ | 数据库用户名 |
| `password` | string | ✅ | 数据库密码 |
| `database` | string | ✅ | 数据库名称 |
| `schemas` | string[] | ❌ | 仅 PostgreSQL 生效，默认 `["public"]`。MySQL 忽略此字段 |

---

## 🚀 启动与使用

```bash
db-mcp-server --config <path-to-config.json>
```

**参数列表：**
- `-c, --config <path>`：配置文件路径（必填）。

---

## 🧠 MCP 客户端配置示例

以常规 MCP Client（如 Claude Desktop 或 Antigravity）的配置为例。向配置文件写入该 `server` 节点即可调用：

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

> **提示**：如果是使用纯 `npx` 配合包名，"command" 可以写 `npx`，"args" 添加 `[ "您的发布包名", "--config", "配置文件路径" ]` 即可。

---

## 🧰 模型所能调用的工具 (Tools)

一旦该 Server 连接至大语言模型，它将主动提供以下五个方法给模型支配：

### 1. `list_connections`
- **说明**：列出配置文件中所有可用的数据库连接（含名称、类型、主机、端口、数据库名等信息，不含密码）。
- **参数**：无。

### 2. `list_tables`
- **说明**：列出指定连接下所有的数据库表（包含普通表与视图等）。
- **参数**：
  - `connectionName` (String): 目标连接名称。

### 3. `describe_table`
- **说明**：给定一个连接名称和表名称，快速返回表内所有字段（列名、数据类型、是否允许为空、默认值等）。
- **参数**：
  - `connectionName` (String): 目标连接名称。
  - `tableName` (String): 表的名称（如 "users" 或 "public.users"）。

### 4. `execute_sql`
- **说明**：在指定连接上执行 SQL 交互，所输入的一切语句都会受到安全层强力核查。
- **参数**：
  - `connectionName` (String): 目标连接名称。
  - `sql` (String): 即将被运行的 SQL。
- **受限情况**：采用严格白名单策略，仅允许 `SELECT`、`CREATE`、`ALTER`（限 ADD/MODIFY）、`COMMENT` 操作。所有不在白名单内的操作（包括但不限于 `UPDATE`, `INSERT`, `DELETE`, `DROP`, `TRUNCATE`, `GRANT`, `REVOKE`, `RENAME`, `EXECUTE` 等）均会被安全层拦截并中断执行。

### 5. `insert_data`
- **说明**：在指定连接上执行 INSERT 语句，专门用于数据插入场景。支持标准 `INSERT INTO ... VALUES` 插入、`INSERT INTO ... SELECT` 查询插入以及多行批量插入。该工具与 `execute_sql` 完全独立，拥有独立的安全校验逻辑。
- **参数**：
  - `connectionName` (String): 目标连接名称。
  - `sql` (String): 仅限 INSERT 语句。
- **受限情况**：采用 INSERT 专属白名单策略，仅允许 `INSERT` 操作。所有非 INSERT 的操作（包括 `SELECT`、`UPDATE`、`DELETE`、`DROP` 等）均会被拒绝。同时检测分号拼接攻击等安全风险。
- **开关控制**：该工具可在 MCP 客户端（如 Claude Desktop、Cursor、Antigravity 等）的工具管理界面中单独启用或禁用，无需修改任何配置文件。
