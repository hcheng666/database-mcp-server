import mysql, { PoolOptions } from 'mysql2/promise';
import { IDatabase } from './database.js';

/**
 * MySQL 数据库实现
 * 使用 mysql2 的 Promise API，实现 IDatabase 接口
 */
export class MysqlDatabase implements IDatabase {
    private pool: mysql.Pool;
    private databaseName: string;

    constructor(config: PoolOptions, databaseName: string) {
        this.pool = mysql.createPool({
            ...config,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
        });
        this.databaseName = databaseName;
    }

    public async query(sql: string, params?: any[]): Promise<any[]> {
        const [rows] = await this.pool.query(sql, params);
        return rows as any[];
    }

    public async listTables(): Promise<any[]> {
        const sql = `
            SELECT table_schema, table_name, table_type
            FROM information_schema.tables
            WHERE table_schema = ?
            ORDER BY table_schema, table_name;
        `;
        return this.query(sql, [this.databaseName]);
    }

    public async describeTable(tableName: string): Promise<any[]> {
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

    public async close(): Promise<void> {
        await this.pool.end();
    }
}
