"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PORTS = exports.DatabaseType = void 0;
/**
 * 数据库类型枚举
 */
var DatabaseType;
(function (DatabaseType) {
    DatabaseType["POSTGRESQL"] = "postgresql";
    DatabaseType["MYSQL"] = "mysql";
})(DatabaseType || (exports.DatabaseType = DatabaseType = {}));
/**
 * 各数据库类型对应的默认端口
 */
exports.DEFAULT_PORTS = {
    [DatabaseType.POSTGRESQL]: 5432,
    [DatabaseType.MYSQL]: 3306,
};
