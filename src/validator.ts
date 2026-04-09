import { Parser } from 'node-sql-parser';
import { DatabaseType } from './types.js';

const parser = new Parser();

/**
 * node-sql-parser 所需的 database 方言标识映射
 */
const SQL_PARSER_DIALECT: Record<DatabaseType, string> = {
    [DatabaseType.POSTGRESQL]: 'Postgresql',
    [DatabaseType.MYSQL]: 'MySQL',
};

/**
 * 校验 SQL 是否为安全的只读/无破坏性操作
 * @param sql 待校验的 SQL 语句
 * @param dbType 数据库类型，用于选择解析方言
 */
export function validateSql(sql: string, dbType: DatabaseType): { valid: boolean; error?: string } {
    const dialect = SQL_PARSER_DIALECT[dbType];

    try {
        const type = parser.astify(sql, { database: dialect });
        
        const asts = Array.isArray(type) ? type : [type];
        
        for (const ast of asts) {
            if (!ast || !('type' in ast)) continue;
            
            const opType = String((ast as any).type).toUpperCase();
            
            // 严格拦截的写保护操作
            if (['UPDATE', 'INSERT', 'DELETE', 'DROP', 'TRUNCATE', 'REPLACE'].includes(opType)) {
                return { valid: false, error: `The '${opType}' operation is blocked due to security constraints. Destructive operations are not allowed.` };
            }

            // 对于 ALTER 的特殊拦截（允许ADD/MODIFY，禁止DROP COLUMN等更破坏性操作）
            if (opType === 'ALTER') {
                const expr = (ast as any).expr;
                if (Array.isArray(expr)) {
                    for (const action of expr) {
                        if (action.action && action.action.toUpperCase() === 'DROP') {
                            return { valid: false, error: `The 'ALTER TABLE ... DROP' operation is blocked. Only ADD/MODIFY fields are allowed.` };
                        }
                    }
                }
            }
        }
        
        return { valid: true };
    } catch (err: any) {
        // 如果是复杂查询或者是某些特殊语法，可能 node-sql-parser 解析失败。
        // 这时采用后备过滤检查。
        const blockRegex = /\b(update\s+.*|insert\s+into|delete\s+from|drop\s+table|drop\s+database|truncate\s+table)\b/i;
        if (blockRegex.test(sql)) {
            return { valid: false, error: `Fallback Firewall: Suspected destructive SQL detected. Operation denied.` };
        }
        
        const alterDropRegex = /\balter\s+table\s+.*?\s+drop\s+/i;
        if (alterDropRegex.test(sql)) {
            return { valid: false, error: `Fallback Firewall: ALTER TABLE DROP detected. Operation denied.` };
        }

        // 默认放行不能解析且没有明显破坏性指纹的语句
        return { valid: true };
    }
}
