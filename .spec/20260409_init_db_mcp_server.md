# Database MCP Server - 需求规格说明 (Spec)

## 1. 需求概述
本项目旨在开发一个基于 Node.js 的 MCP (Model Context Protocol) 服务端。该服务器允许大模型（如 Antigravity）通过标准 MCP 协议连接到数据库并执行受限的安全 SQL 查询。
设计原则：开箱即用、安全可控、简单轻量。

## 2. 核心特性
1. **安全校验与拦截**：
   - 允许操作：`SELECT` 等查询操作。
   - 允许 DDL：`CREATE TABLE`（建表语句）、`ALTER TABLE ... ADD ...`（增加字段语句）等基础表结构扩展操作。
   - **严格拦截**：`DELETE`、`DROP`、`UPDATE`、`INSERT`、`TRUNCATE` 等其他可能破坏或修改已有数据的破坏性操作。
2. **基于 Node.js/npx 运行**：编写并打包为标准的 Node 项目，支持使用 `npx` 配合多格式参数指令直接执行。
3. **多参数连接化**：
   - 采用拆分参数的形式启动服务端，支持：`--host`, `--port`, `--user`, `--password`, `--database`, 以及可以多选的 `--schema`（模式）。

## 3. 提供的 MCP Tools
除了执行自定义语句，服务端还应当提供如下辅助工具给模型：
1. **`execute_sql`**：核心工具，接收并执行符合安全策略的任意 SQL。
2. **`list_tables`**：列出当前连接下对应 Schema 内所有的表名。
3. **`describe_table`**：传入某一个表名，返回该表的详细结构分析（字段、数据类型、注释等）。

## 4. 技术栈
- 语言：TypeScript / Node.js
- MCP 框架：`@modelcontextprotocol/sdk`
- SQL 防火墙验证：基于 `node-sql-parser` 配合抽象语法树分析。
- CLI 参数解析：`commander`（或相似库），支持多选配置 `--schema`。
- 数据库驱动：`pg` (针对 PostgreSQL)。

## 5. 变更记录
### 2026-04-09 修复带有中划线的 Schema 导致的 SQL 语法异常
- **问题描述**：当基于 `-s` 参数传入形如 `test-schema` 的模式时，内部在构建 `SET search_path TO test-schema` 的 SQL 时没有转义，由于带中划线的标识符未加双引号，Postgres 会抛出 `syntax error at or near "-"`。
- **修改详情**：在 `src/db.ts` 中的 `query` 方法里，将其引用的模式名由直接拼接改为带有双引号的格式，如 `"${s}"`，以确保能在 Postgres 中正确识别带特殊字符或大小写敏感的 Schema 标识符。
