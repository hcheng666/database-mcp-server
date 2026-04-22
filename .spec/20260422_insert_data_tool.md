# Feature Spec: `insert_data` MCP Tool

**日期**: 2026-04-22  
**类型**: 新增功能  
**影响范围**: `src/validator.ts`、`src/index.ts`

---

## 背景

现有的 `execute_sql` 工具通过严格白名单策略屏蔽了 `INSERT` 操作，以保障数据只读安全。  
本次需求在**不影响现有工具**的前提下，新增一个独立的 `insert_data` MCP 工具，专门用于数据插入场景。  
工具的启用/禁用由 AI 编辑器（如 Cursor、Claude Desktop）的 MCP 工具开关 UI 来管理，代码层面无需额外实现开关逻辑。

---

## 设计决策

| 项目 | 决策 |
|---|---|
| 工具开关 | 由 MCP 客户端（AI 编辑器）工具 UI 控制，无代码侵入 |
| 工具名称 | `insert_data` |
| 输入参数 | `connectionName`（连接名）+ `sql`（原始 INSERT SQL） |
| SQL 类型范围 | 仅允许 `INSERT` 语句：标准 VALUES、INSERT...SELECT、多行批量插入 |
| 对现有工具的影响 | 零影响，`execute_sql` 的白名单逻辑与行为完全不变 |

---

## 实现细节

### `src/validator.ts` — 新增内容

#### 新增枚举：`InsertAllowedOperation`

```typescript
enum InsertAllowedOperation {
    INSERT = 'INSERT',
}
```

#### 新增正则常量

- `INSERT_PREFIX_REGEX`：Fallback 时判断语句是否以 `INSERT` 关键字开头
- `INSERT_DESTRUCTIVE_KEYWORDS_REGEX`：Fallback 时检测混入的破坏性关键字（防分号拼接攻击），包括 `UPDATE`、`DELETE FROM`、`DROP ...`、`TRUNCATE`、`GRANT`、`REVOKE`、`RENAME`、`EXECUTE`、`COPY`

#### 新增导出函数：`validateInsertSql(sql, dbType)`

**校验流程：**

1. 使用 `node-sql-parser` 解析 SQL 为 AST
2. 遍历所有 AST 节点，若存在非 `INSERT` 类型节点 → 拒绝
3. 全部通过 → 放行
4. 解析异常时 Fallback：
   - 语句不以 `INSERT` 开头 → 拒绝
   - 检测到破坏性关键字（防多语句注入）→ 拒绝
   - 否则放行

---

### `src/index.ts` — 新增内容

#### Import 变更

```typescript
// 修改前
import { validateSql } from './validator.js';

// 修改后
import { validateInsertSql, validateSql } from './validator.js';
```

#### 工具列表注册（ListToolsRequestSchema）

在 `execute_sql` 工具定义之后追加 `insert_data` 工具：

- **name**: `insert_data`
- **description**: 执行 INSERT 语句，支持 VALUES/INSERT...SELECT/多行批量，仅允许 INSERT，由 MCP 客户端独立开关控制
- **inputSchema**: `connectionName`（必填）、`sql`（必填）

#### 工具调用处理（CallToolRequestSchema）

在 `execute_sql` 分支之后追加 `insert_data` 分支：

1. 提取 `connectionName`、`sql`，缺失抛出 `InvalidParams`
2. 调用 `validateInsertSql(sql, config.type)` 校验
3. 校验失败 → 返回 `SECURITY ERROR` + `isError: true`
4. 校验通过 → `db.query(sql)` 执行，返回结果

---

## 安全边界

| 场景 | 结果 |
|---|---|
| `INSERT INTO t (a) VALUES (1)` | ✅ 允许 |
| `INSERT INTO t (a) VALUES (1),(2),(3)` | ✅ 允许（多行） |
| `INSERT INTO t SELECT * FROM s` | ✅ 允许（INSERT...SELECT） |
| `DELETE FROM t` | ❌ SECURITY ERROR |
| `INSERT INTO t VALUES(1); DROP TABLE t` | ❌ Fallback Firewall 拦截 |
| 通过 `execute_sql` 执行 INSERT | ❌ 原有拦截逻辑不变 |
