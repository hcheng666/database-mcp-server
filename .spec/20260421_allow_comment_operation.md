# 放开注释 (COMMENT) 操作 & 安全校验白名单重构

## 1. 背景与需求

### 1.1 原始需求
用户反馈"注释操作似乎是不被支持的"。经排查发现：
- `validator.ts` 核心校验逻辑本身并未拦截 `COMMENT` 操作（因为不在黑名单中）。
- 但 `index.ts` 中 `execute_sql` 工具的 description 只提到 `SELECT, CREATE, ALTER ADD allowed`，导致大模型自我限制，不生成 COMMENT 语句。

### 1.2 安全审计发现
在排查过程中，发现现有校验逻辑采用**黑名单机制 (Blocklist)**，存在严重安全隐患：

| 漏洞编号 | 类型 | 说明 | 风险等级 |
|---------|------|------|---------|
| V-01 | AST 白名单遗漏 | `GRANT`/`REVOKE` 可直接提权 | 🔴 高危 |
| V-02 | AST 白名单遗漏 | `RENAME TABLE` 可导致业务瘫痪 | 🟡 中危 |
| V-03 | AST 白名单遗漏 | `CALL`/`EXECUTE` 可调用危险存储过程 | 🔴 高危 |
| V-04 | AST 白名单遗漏 | `SET` 可修改数据库全局变量 | 🟡 中危 |
| V-05 | Fallback 逃逸 | 解析失败时默认放行，`COPY` 等可被利用进行文件读写/拖库 | 🔴 高危 |
| V-06 | ALTER 不严谨 | `ALTER TABLE ... RENAME COLUMN` 等未被拦截 | 🟡 中危 |

### 1.3 修复目标
将"黑名单拦截"全面重构为"严格白名单放行"策略，同时显式支持 `COMMENT` 操作。

---

## 2. 修改详情

### 2.1 修改 `src/validator.ts` — 核心安全重构

**策略转换**：从"拦截已知危险操作" → "仅放行已知安全操作"

#### 2.1.1 AST 解析层：定义安全操作白名单枚举

新增枚举 `AllowedSqlOperation`，包含以下允许的 AST type：

| 允许的操作 | AST type | 说明 |
|-----------|----------|------|
| SELECT | `select` | 数据查询 |
| SHOW | `show` | 元数据查看（MySQL） |
| DESC / DESCRIBE | `desc` | 表结构描述 |
| EXPLAIN | `explain` | 执行计划分析 |
| USE | `use` | 切换数据库（MySQL） |
| CREATE | `create` | 建表/建索引（无破坏性） |
| ALTER | `alter` | 结构变更（需二次检查子操作） |
| COMMENT | `comment` | 表/字段注释（PostgreSQL） |

**重要限制**：
- 不在白名单内的任何 AST type 一律拒绝执行。
- `ALTER` 仍需二次白名单校验：仅允许子操作类型为 `ADD`、`MODIFY`、`COMMENT`，拒绝 `DROP`、`RENAME` 等。

#### 2.1.2 Fallback 正则层：同样改为白名单

当 `node-sql-parser` 解析失败时（进入 `catch` 块）：
- 不再采用"检查是否包含危险关键字、不包含就放行"的策略。
- 改为：仅允许以安全关键字开头的 SQL（`SELECT`, `SHOW`, `DESC`, `DESCRIBE`, `EXPLAIN`, `WITH`），其余一律拒绝。
- 特别说明：`WITH` 语句（CTE）因为支持复杂查询而开头不是 `SELECT`，需要单独发行但同时检查不包含破坏性关键字。

#### 2.1.3 完整的新白名单逻辑伪代码

```
function validateSql(sql, dbType):
    try:
        asts = parser.astify(sql, dialect)
        for ast in asts:
            opType = ast.type.toUpperCase()
            
            if opType NOT IN ALLOWED_AST_OPERATIONS:
                return BLOCKED("操作类型 ${opType} 未被授权")

            if opType == 'ALTER':
                for action in ast.expr:
                    actionType = action.action?.toUpperCase()
                    if actionType NOT IN ALLOWED_ALTER_ACTIONS:
                        return BLOCKED("ALTER 子操作 ${actionType} 未被授权")

        return PASSED
        
    catch:
        // 解析失败：严格白名单放行
        normalizedSql = sql.trim().toUpperCase()
        if normalizedSql starts with SELECT/SHOW/DESC/DESCRIBE/EXPLAIN:
            return PASSED
        if normalizedSql starts with WITH:
            if contains destructive keywords:
                return BLOCKED
            return PASSED
        return BLOCKED("无法解析且非查询语句")
```

### 2.2 修改 `src/index.ts` — 工具描述更新

将 `execute_sql` 的 description 更新为：
```
Execute a safe SQL statement. Allowed: SELECT, CREATE, ALTER (ADD/MODIFY only), COMMENT. Blocked: DELETE, DROP, UPDATE, INSERT, TRUNCATE, GRANT, REVOKE, RENAME, EXECUTE, and all other destructive operations.
```

### 2.3 修改 `README.md` — 文档同步

- 功能亮点的安全说明更新为白名单机制描述，并明确提及 `COMMENT` 支持。
- `execute_sql` 的受限说明同步更新。

---

## 3. 兼容性与安全性

- **兼容性**：PostgreSQL `COMMENT ON TABLE/COLUMN` 和 MySQL `ALTER TABLE ... COMMENT` 均被白名单覆盖。
- **安全性**：白名单策略从根本上杜绝未知操作的漏洞。所有未明确放行的操作将默认拒绝。

## 4. 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/validator.ts` | 修改 | 核心重构：黑名单 → 白名单 |
| `src/index.ts` | 修改 | 更新 execute_sql 工具描述 |
| `README.md` | 修改 | 同步更新文档说明 |
