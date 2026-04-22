"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateSql = validateSql;
exports.validateInsertSql = validateInsertSql;
const node_sql_parser_1 = require("node-sql-parser");
const types_js_1 = require("./types.js");
const parser = new node_sql_parser_1.Parser();
/**
 * node-sql-parser 所需的 database 方言标识映射
 */
const SQL_PARSER_DIALECT = {
    [types_js_1.DatabaseType.POSTGRESQL]: 'Postgresql',
    [types_js_1.DatabaseType.MYSQL]: 'MySQL',
};
/**
 * AST 层允许放行的 SQL 操作类型白名单
 * 不在此白名单中的操作一律拒绝
 */
var AllowedSqlOperation;
(function (AllowedSqlOperation) {
    AllowedSqlOperation["SELECT"] = "SELECT";
    AllowedSqlOperation["SHOW"] = "SHOW";
    AllowedSqlOperation["DESC"] = "DESC";
    AllowedSqlOperation["DESCRIBE"] = "DESCRIBE";
    AllowedSqlOperation["EXPLAIN"] = "EXPLAIN";
    AllowedSqlOperation["USE"] = "USE";
    AllowedSqlOperation["CREATE"] = "CREATE";
    AllowedSqlOperation["ALTER"] = "ALTER";
    AllowedSqlOperation["COMMENT"] = "COMMENT";
})(AllowedSqlOperation || (AllowedSqlOperation = {}));
const ALLOWED_AST_TYPES = new Set(Object.values(AllowedSqlOperation));
/**
 * ALTER 语句中允许放行的子操作类型白名单
 * 不在此白名单中的 ALTER 子操作一律拒绝
 */
var AllowedAlterAction;
(function (AllowedAlterAction) {
    AllowedAlterAction["ADD"] = "ADD";
    AllowedAlterAction["MODIFY"] = "MODIFY";
    AllowedAlterAction["COMMENT"] = "COMMENT";
})(AllowedAlterAction || (AllowedAlterAction = {}));
const ALLOWED_ALTER_ACTIONS = new Set(Object.values(AllowedAlterAction));
/**
 * Fallback 正则：当解析器无法解析 SQL 时，仅放行以安全查询关键字开头的语句
 */
const SAFE_QUERY_PREFIX_REGEX = /^\s*(SELECT|SHOW|DESC|DESCRIBE|EXPLAIN)\b/i;
/**
 * Fallback 正则：WITH (CTE) 开头的语句需要单独匹配
 */
const WITH_PREFIX_REGEX = /^\s*WITH\b/i;
/**
 * Fallback 正则：在 WITH 语句中检测破坏性关键字
 */
const DESTRUCTIVE_KEYWORDS_REGEX = /\b(UPDATE|INSERT\s+INTO|DELETE\s+FROM|DROP\s+(TABLE|DATABASE|SCHEMA|INDEX|VIEW|COLUMN)|TRUNCATE|GRANT|REVOKE|RENAME|EXECUTE|COPY)\b/i;
/**
 * INSERT 专用校验：AST 层只允许 INSERT 操作类型
 */
var InsertAllowedOperation;
(function (InsertAllowedOperation) {
    InsertAllowedOperation["INSERT"] = "INSERT";
})(InsertAllowedOperation || (InsertAllowedOperation = {}));
/**
 * Fallback 正则：判断语句是否以 INSERT 关键字开头
 */
const INSERT_PREFIX_REGEX = /^\s*INSERT\b/i;
/**
 * Fallback 正则：INSERT 语句中检测混入的破坏性关键字（防止分号拼接攻击）
 */
const INSERT_DESTRUCTIVE_KEYWORDS_REGEX = /\b(UPDATE|DELETE\s+FROM|DROP\s+(TABLE|DATABASE|SCHEMA|INDEX|VIEW|COLUMN)|TRUNCATE|GRANT|REVOKE|RENAME|EXECUTE|COPY)\b/i;
/**
 * 校验 SQL 是否为安全的只读/无破坏性操作（严格白名单策略）
 * @param sql 待校验的 SQL 语句
 * @param dbType 数据库类型，用于选择解析方言
 */
function validateSql(sql, dbType) {
    const dialect = SQL_PARSER_DIALECT[dbType];
    try {
        const type = parser.astify(sql, { database: dialect });
        const asts = Array.isArray(type) ? type : [type];
        for (const ast of asts) {
            if (!ast || !('type' in ast))
                continue;
            const opType = String(ast.type).toUpperCase();
            // 白名单校验：不在白名单内的操作一律拒绝
            if (!ALLOWED_AST_TYPES.has(opType)) {
                return { valid: false, error: `The '${opType}' operation is not authorized. Only the following operations are allowed: ${Array.from(ALLOWED_AST_TYPES).join(', ')}.` };
            }
            // 对于 ALTER 的二次白名单校验（仅允许 ADD / MODIFY / COMMENT 子操作）
            if (opType === AllowedSqlOperation.ALTER) {
                const expr = ast.expr;
                if (Array.isArray(expr)) {
                    for (const action of expr) {
                        const actionType = action.action ? String(action.action).toUpperCase() : null;
                        // 跳过没有 action 的子表达式（如 MySQL 的 ALTER TABLE ... COMMENT 不一定有 action）
                        if (!actionType)
                            continue;
                        if (!ALLOWED_ALTER_ACTIONS.has(actionType)) {
                            return { valid: false, error: `The 'ALTER TABLE ... ${actionType}' operation is not authorized. Only the following ALTER actions are allowed: ${Array.from(ALLOWED_ALTER_ACTIONS).join(', ')}.` };
                        }
                    }
                }
            }
        }
        return { valid: true };
    }
    catch (err) {
        // 解析失败时采用严格的白名单 Fallback 策略
        // 仅放行以安全查询关键字开头的语句
        if (SAFE_QUERY_PREFIX_REGEX.test(sql)) {
            return { valid: true };
        }
        // WITH (CTE) 语句特殊处理：允许但需确保不包含破坏性关键字
        if (WITH_PREFIX_REGEX.test(sql)) {
            if (DESTRUCTIVE_KEYWORDS_REGEX.test(sql)) {
                return { valid: false, error: `Fallback Firewall: Destructive keywords detected inside WITH/CTE statement. Operation denied.` };
            }
            return { valid: true };
        }
        // 其余所有无法解析的语句一律拒绝
        return { valid: false, error: `SQL statement could not be parsed and does not match any known safe query pattern. Operation denied for security reasons.` };
    }
}
/**
 * 校验 SQL 是否为合法的 INSERT 语句（仅允许 INSERT 操作）
 * 支持：标准 VALUES 插入、INSERT...SELECT、多行批量插入
 * @param sql 待校验的 INSERT SQL
 * @param dbType 数据库类型，用于选择解析方言
 */
function validateInsertSql(sql, dbType) {
    const dialect = SQL_PARSER_DIALECT[dbType];
    try {
        const type = parser.astify(sql, { database: dialect });
        const asts = Array.isArray(type) ? type : [type];
        for (const ast of asts) {
            if (!ast || !('type' in ast))
                continue;
            const opType = String(ast.type).toUpperCase();
            // 严格白名单：仅允许 INSERT 操作
            if (opType !== InsertAllowedOperation.INSERT) {
                return {
                    valid: false,
                    error: `The '${opType}' operation is not authorized for insert_data. Only INSERT statements are allowed.`,
                };
            }
        }
        return { valid: true };
    }
    catch (err) {
        // 解析失败时的 Fallback：必须以 INSERT 开头
        if (!INSERT_PREFIX_REGEX.test(sql)) {
            return {
                valid: false,
                error: `SQL statement could not be parsed and does not appear to be an INSERT statement. Operation denied for security reasons.`,
            };
        }
        // Fallback 放行前检测混入的破坏性关键字（防分号拼接攻击）
        if (INSERT_DESTRUCTIVE_KEYWORDS_REGEX.test(sql)) {
            return {
                valid: false,
                error: `Fallback Firewall: Destructive keywords detected inside INSERT statement. Operation denied.`,
            };
        }
        return { valid: true };
    }
}
