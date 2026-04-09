import { ConnectionConfig, DatabaseType, DEFAULT_PORTS } from '../types.js';
import { IDatabase } from './database.js';
import { MysqlDatabase } from './mysql-database.js';
import { PostgresDatabase } from './postgres-database.js';

/**
 * 数据库实例工厂
 * 根据 ConnectionConfig.type 创建对应的 IDatabase 实例
 */
export function createDatabase(config: ConnectionConfig): IDatabase {
    const port = config.port ?? DEFAULT_PORTS[config.type];

    switch (config.type) {
        case DatabaseType.POSTGRESQL:
            return new PostgresDatabase(
                {
                    host: config.host,
                    port,
                    user: config.user,
                    password: config.password,
                    database: config.database,
                },
                config.schemas ?? ['public']
            );

        case DatabaseType.MYSQL:
            return new MysqlDatabase(
                {
                    host: config.host,
                    port,
                    user: config.user,
                    password: config.password,
                    database: config.database,
                },
                config.database
            );

        default:
            throw new Error(`Unsupported database type: ${config.type}`);
    }
}
