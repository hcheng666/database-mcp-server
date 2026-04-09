"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresDatabase = void 0;
const pg_1 = require("pg");
/**
 * PostgreSQL 数据库实现
 * 从原 db.ts 迁移而来，实现 IDatabase 接口
 */
class PostgresDatabase {
    pool;
    schemas;
    constructor(config, schemas = ['public']) {
        this.pool = new pg_1.Pool(config);
        this.schemas = schemas;
    }
    async query(sql, params) {
        const client = await this.pool.connect();
        try {
            // 设置 search_path 为传入的 schemas
            if (this.schemas.length > 0) {
                await client.query(`SET search_path TO ${this.schemas.map(s => `"${s}"`).join(', ')}`);
            }
            const res = await client.query(sql, params);
            return res.rows;
        }
        finally {
            client.release();
        }
    }
    async listTables() {
        const schemaNames = this.schemas.map(s => `'${s}'`).join(',');
        const sql = `
            SELECT table_schema, table_name, table_type
            FROM information_schema.tables
            WHERE table_schema IN (${schemaNames})
            ORDER BY table_schema, table_name;
        `;
        return this.query(sql);
    }
    async describeTable(tableName) {
        // 如果包含 schema 比如 "public.users"，则拆解，否则查所有的配置的 schema 下的同名表
        let schemaCondition = `table_schema IN (${this.schemas.map(s => `'${s}'`).join(',')})`;
        let name = tableName;
        if (tableName.includes('.')) {
            const parts = tableName.split('.');
            schemaCondition = `table_schema = '${parts[0]}'`;
            name = parts[1];
        }
        const sql = `
            SELECT 
                column_name, 
                data_type, 
                character_maximum_length, 
                column_default, 
                is_nullable
            FROM information_schema.columns
            WHERE table_name = $1 AND ${schemaCondition}
            ORDER BY ordinal_position;
        `;
        return this.query(sql, [name]);
    }
    async close() {
        await this.pool.end();
    }
}
exports.PostgresDatabase = PostgresDatabase;
