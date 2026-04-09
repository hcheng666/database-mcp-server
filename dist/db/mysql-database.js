"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MysqlDatabase = void 0;
const promise_1 = __importDefault(require("mysql2/promise"));
/**
 * MySQL 数据库实现
 * 使用 mysql2 的 Promise API，实现 IDatabase 接口
 */
class MysqlDatabase {
    pool;
    databaseName;
    constructor(config, databaseName) {
        this.pool = promise_1.default.createPool({
            ...config,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
        });
        this.databaseName = databaseName;
    }
    async query(sql, params) {
        const [rows] = await this.pool.query(sql, params);
        return rows;
    }
    async listTables() {
        const sql = `
            SELECT table_schema, table_name, table_type
            FROM information_schema.tables
            WHERE table_schema = ?
            ORDER BY table_schema, table_name;
        `;
        return this.query(sql, [this.databaseName]);
    }
    async describeTable(tableName) {
        const sql = `
            SELECT 
                column_name, 
                data_type, 
                character_maximum_length, 
                column_default, 
                is_nullable
            FROM information_schema.columns
            WHERE table_schema = ? AND table_name = ?
            ORDER BY ordinal_position;
        `;
        return this.query(sql, [this.databaseName, tableName]);
    }
    async close() {
        await this.pool.end();
    }
}
exports.MysqlDatabase = MysqlDatabase;
