"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionManager = void 0;
const types_js_1 = require("./types.js");
const database_factory_js_1 = require("./db/database-factory.js");
/**
 * 多连接管理器
 * 持有所有命名数据库连接实例，提供按名称获取连接的能力
 */
class ConnectionManager {
    connections = new Map();
    configs = new Map();
    constructor(connectionConfigs) {
        for (const config of connectionConfigs) {
            if (this.connections.has(config.name)) {
                throw new Error(`Duplicate connection name: "${config.name}"`);
            }
            this.connections.set(config.name, (0, database_factory_js_1.createDatabase)(config));
            this.configs.set(config.name, config);
        }
    }
    /**
     * 获取指定名称的数据库连接实例
     * @throws 连接名称不存在时抛出错误
     */
    getConnection(name) {
        const db = this.connections.get(name);
        if (!db) {
            const available = Array.from(this.connections.keys()).join(', ');
            throw new Error(`Connection "${name}" not found. Available connections: [${available}]`);
        }
        return db;
    }
    /**
     * 获取指定连接的配置信息
     */
    getConnectionConfig(name) {
        const config = this.configs.get(name);
        if (!config) {
            throw new Error(`Connection config "${name}" not found.`);
        }
        return config;
    }
    /**
     * 返回所有连接的脱敏信息（不含密码）
     */
    getAllConnectionInfos() {
        const result = [];
        for (const config of this.configs.values()) {
            const info = {
                name: config.name,
                type: config.type,
                host: config.host,
                port: config.port ?? types_js_1.DEFAULT_PORTS[config.type],
                database: config.database,
            };
            if (config.description) {
                info.description = config.description;
            }
            if (config.schemas && config.schemas.length > 0) {
                info.schemas = config.schemas;
            }
            result.push(info);
        }
        return result;
    }
    /**
     * 关闭所有连接
     */
    async closeAll() {
        const closePromises = [];
        for (const db of this.connections.values()) {
            closePromises.push(db.close());
        }
        await Promise.all(closePromises);
    }
}
exports.ConnectionManager = ConnectionManager;
