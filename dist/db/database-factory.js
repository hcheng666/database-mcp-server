"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDatabase = createDatabase;
const types_js_1 = require("../types.js");
const mysql_database_js_1 = require("./mysql-database.js");
const postgres_database_js_1 = require("./postgres-database.js");
/**
 * 数据库实例工厂
 * 根据 ConnectionConfig.type 创建对应的 IDatabase 实例
 */
function createDatabase(config) {
    const port = config.port ?? types_js_1.DEFAULT_PORTS[config.type];
    switch (config.type) {
        case types_js_1.DatabaseType.POSTGRESQL:
            return new postgres_database_js_1.PostgresDatabase({
                host: config.host,
                port,
                user: config.user,
                password: config.password,
                database: config.database,
            }, config.schemas ?? ['public']);
        case types_js_1.DatabaseType.MYSQL:
            return new mysql_database_js_1.MysqlDatabase({
                host: config.host,
                port,
                user: config.user,
                password: config.password,
                database: config.database,
            }, config.database);
        default:
            throw new Error(`Unsupported database type: ${config.type}`);
    }
}
