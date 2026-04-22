#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const commander_1 = require("commander");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const connection_manager_js_1 = require("./connection-manager.js");
const types_js_2 = require("./types.js");
const validator_js_1 = require("./validator.js");
// ===== CLI 参数解析 =====
commander_1.program
    .name('db-mcp-server')
    .description('MCP Server for executing safe SQL queries against multiple databases')
    .requiredOption('-c, --config <path>', 'Path to the JSON configuration file')
    .parse(process.argv);
const cliOptions = commander_1.program.opts();
// ===== 读取并校验配置文件 =====
const configPath = path.resolve(cliOptions.config);
if (!fs.existsSync(configPath)) {
    console.error(`Configuration file not found: ${configPath}`);
    process.exit(1);
}
let appConfig;
try {
    const rawContent = fs.readFileSync(configPath, 'utf-8');
    appConfig = JSON.parse(rawContent);
}
catch (err) {
    console.error(`Failed to parse configuration file: ${err.message}`);
    process.exit(1);
}
if (!appConfig.connections || appConfig.connections.length === 0) {
    console.error('Configuration file must contain at least one connection.');
    process.exit(1);
}
// 校验每个连接的 type 是否为合法的枚举值
const validTypes = Object.values(types_js_2.DatabaseType);
for (const conn of appConfig.connections) {
    if (!validTypes.includes(conn.type)) {
        console.error(`Invalid database type "${conn.type}" for connection "${conn.name}". Supported types: ${validTypes.join(', ')}`);
        process.exit(1);
    }
}
// ===== 初始化连接管理器 =====
const connectionManager = new connection_manager_js_1.ConnectionManager(appConfig.connections);
// ===== 初始化 MCP Server =====
const server = new index_js_1.Server({
    name: 'db-mcp-server',
    version: '2.0.0',
}, {
    capabilities: {
        tools: {},
    },
});
// ===== 注册工具列表 =====
server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: 'list_connections',
                description: 'List all available database connections configured in this MCP server. Each connection includes a description explaining its business purpose and data content — use this to choose the right database.',
                inputSchema: {
                    type: 'object',
                    properties: {},
                },
            },
            {
                name: 'list_tables',
                description: 'List all tables in the specified database connection.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        connectionName: {
                            type: 'string',
                            description: 'Name of the database connection to use.',
                        },
                    },
                    required: ['connectionName'],
                },
            },
            {
                name: 'describe_table',
                description: 'Get the detailed schema/columns for a specific table.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        connectionName: {
                            type: 'string',
                            description: 'Name of the database connection to use.',
                        },
                        tableName: {
                            type: 'string',
                            description: 'Name of the table to describe. E.g., "users" or "public.users".',
                        },
                    },
                    required: ['connectionName', 'tableName'],
                },
            },
            {
                name: 'execute_sql',
                description: 'Execute a safe SQL statement. Allowed: SELECT, CREATE, ALTER (ADD/MODIFY only), COMMENT. Blocked: DELETE, DROP, UPDATE, INSERT, TRUNCATE, GRANT, REVOKE, RENAME, EXECUTE, and all other destructive operations.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        connectionName: {
                            type: 'string',
                            description: 'Name of the database connection to use.',
                        },
                        sql: {
                            type: 'string',
                            description: 'The SQL statement to execute.',
                        },
                    },
                    required: ['connectionName', 'sql'],
                },
            },
            {
                name: 'insert_data',
                description: 'Execute an INSERT SQL statement to insert data into the database. Supports standard VALUES insert, INSERT...SELECT, and multi-row batch inserts. Only INSERT statements are allowed; all other operations are rejected. This tool is independent of execute_sql and can be toggled separately in the MCP client.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        connectionName: {
                            type: 'string',
                            description: 'Name of the database connection to use.',
                        },
                        sql: {
                            type: 'string',
                            description: 'The INSERT SQL statement to execute. Only INSERT statements are permitted.',
                        },
                    },
                    required: ['connectionName', 'sql'],
                },
            },
        ],
    };
});
// ===== 处理工具调用 =====
server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
    try {
        // --- list_connections ---
        if (request.params.name === 'list_connections') {
            const infos = connectionManager.getAllConnectionInfos();
            return {
                content: [{ type: 'text', text: JSON.stringify(infos, null, 2) }],
            };
        }
        // --- list_tables ---
        if (request.params.name === 'list_tables') {
            const { connectionName } = request.params.arguments;
            if (!connectionName) {
                throw new types_js_1.McpError(types_js_1.ErrorCode.InvalidParams, 'connectionName is required');
            }
            const db = connectionManager.getConnection(connectionName);
            const rows = await db.listTables();
            return {
                content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }],
            };
        }
        // --- describe_table ---
        if (request.params.name === 'describe_table') {
            const { connectionName, tableName } = request.params.arguments;
            if (!connectionName) {
                throw new types_js_1.McpError(types_js_1.ErrorCode.InvalidParams, 'connectionName is required');
            }
            if (!tableName) {
                throw new types_js_1.McpError(types_js_1.ErrorCode.InvalidParams, 'tableName is required');
            }
            const db = connectionManager.getConnection(connectionName);
            const rows = await db.describeTable(tableName);
            return {
                content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }],
            };
        }
        // --- execute_sql ---
        if (request.params.name === 'execute_sql') {
            const { connectionName, sql } = request.params.arguments;
            if (!connectionName) {
                throw new types_js_1.McpError(types_js_1.ErrorCode.InvalidParams, 'connectionName is required');
            }
            if (!sql) {
                throw new types_js_1.McpError(types_js_1.ErrorCode.InvalidParams, 'sql is required');
            }
            // 根据连接的数据库类型选择校验方言
            const config = connectionManager.getConnectionConfig(connectionName);
            const validationResult = (0, validator_js_1.validateSql)(sql, config.type);
            if (!validationResult.valid) {
                return {
                    content: [{ type: 'text', text: `SECURITY ERROR: ${validationResult.error}` }],
                    isError: true,
                };
            }
            // 执行
            const db = connectionManager.getConnection(connectionName);
            const rows = await db.query(sql);
            return {
                content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }],
            };
        }
        // --- insert_data ---
        if (request.params.name === 'insert_data') {
            const { connectionName, sql } = request.params.arguments;
            if (!connectionName) {
                throw new types_js_1.McpError(types_js_1.ErrorCode.InvalidParams, 'connectionName is required');
            }
            if (!sql) {
                throw new types_js_1.McpError(types_js_1.ErrorCode.InvalidParams, 'sql is required');
            }
            const config = connectionManager.getConnectionConfig(connectionName);
            const validationResult = (0, validator_js_1.validateInsertSql)(sql, config.type);
            if (!validationResult.valid) {
                return {
                    content: [{ type: 'text', text: `SECURITY ERROR: ${validationResult.error}` }],
                    isError: true,
                };
            }
            const db = connectionManager.getConnection(connectionName);
            const rows = await db.query(sql);
            return {
                content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }],
            };
        }
        throw new types_js_1.McpError(types_js_1.ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
    }
    catch (error) {
        return {
            content: [{ type: 'text', text: `Error: ${error.message}` }],
            isError: true,
        };
    }
});
// ===== 启动服务 =====
async function run() {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    console.error('Database MCP server is running on stdio');
    console.error(`Loaded ${appConfig.connections.length} connection(s): ${appConfig.connections.map(c => c.name).join(', ')}`);
}
run().catch((error) => {
    console.error('Fatal error running server:', error);
    process.exit(1);
});
