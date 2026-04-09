/**
 * 数据库操作抽象接口
 * PostgreSQL 和 MySQL 各自实现此接口
 */
export interface IDatabase {
    /**
     * 执行 SQL 查询并返回结果行
     * @param sql SQL 语句
     * @param params 参数化查询的参数列表
     */
    query(sql: string, params?: any[]): Promise<any[]>;

    /**
     * 列出当前连接可见的所有数据表
     */
    listTables(): Promise<any[]>;

    /**
     * 返回指定表的详细字段信息
     * @param tableName 表名（PostgreSQL 支持 schema.table 格式）
     */
    describeTable(tableName: string): Promise<any[]>;

    /**
     * 关闭数据库连接（释放连接池）
     */
    close(): Promise<void>;
}
