/**
 * 数据库类型枚举
 */
export enum DatabaseType {
    POSTGRESQL = 'postgresql',
    MYSQL = 'mysql',
}

/**
 * 各数据库类型对应的默认端口
 */
export const DEFAULT_PORTS: Record<DatabaseType, number> = {
    [DatabaseType.POSTGRESQL]: 5432,
    [DatabaseType.MYSQL]: 3306,
};

/**
 * 单个数据库连接的配置
 */
export interface ConnectionConfig {
    /** 连接的唯一标识名称 */
    name: string;
    /** 数据库类型 */
    type: DatabaseType;
    /** 连接的业务描述，帮助大模型理解该数据库的用途和内容 */
    description?: string;
    /** 数据库主机地址 */
    host: string;
    /** 端口号（可选，根据 type 自动使用默认值） */
    port?: number;
    /** 数据库用户名 */
    user: string;
    /** 数据库密码 */
    password: string;
    /** 数据库名称 */
    database: string;
    /** Schema 列表，仅 PostgreSQL 生效，默认 ["public"] */
    schemas?: string[];
}

/**
 * 配置文件的顶层结构
 */
export interface AppConfig {
    connections: ConnectionConfig[];
}

/**
 * 脱敏后的连接信息（不含密码），用于返回给模型
 */
export interface ConnectionInfo {
    name: string;
    type: DatabaseType;
    description?: string;
    host: string;
    port: number;
    database: string;
    schemas?: string[];
}
