#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ErrorCode,
    ListToolsRequestSchema,
    McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { program } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { ConnectionManager } from './connection-manager.js';
import { AppConfig, DatabaseType } from './types.js';
import { validateInsertSql, validateSql } from './validator.js';

// ===== CLI 参数解析 =====
program
    .name('db-mcp-server')
    .description('MCP Server for executing safe SQL queries against multiple databases')
    .requiredOption('-c, --config <path>', 'Path to the JSON configuration file')
    .parse(process.argv);

const cliOptions = program.opts();

// ===== 读取并校验配置文件 =====
const configPath = path.resolve(cliOptions.config);
if (!fs.existsSync(configPath)) {
    console.error(`Configuration file not found: ${configPath}`);
    process.exit(1);
}

let appConfig: AppConfig;
try {
    const rawContent = fs.readFileSync(configPath, 'utf-8');
    appConfig = JSON.parse(rawContent) as AppConfig;
} catch (err: any) {
    console.error(`Failed to parse configuration file: ${err.message}`);
    process.exit(1);
}

if (!appConfig.connections || appConfig.connections.length === 0) {
    console.error('Configuration file must contain at least one connection.');
    process.exit(1);
}

// 校验每个连接的 type 是否为合法的枚举值
const validTypes = Object.values(DatabaseType) as string[];
for (const conn of appConfig.connections) {
    if (!validTypes.includes(conn.type)) {
        console.error(`Invalid database type "${conn.type}" for connection "${conn.name}". Supported types: ${validTypes.join(', ')}`);
        process.exit(1);
    }
}

// ===== 初始化连接管理器 =====
const connectionManager = new ConnectionManager(appConfig.connections);

// ===== 初始化 MCP Server =====
const server = new Server(
    {
        name: 'db-mcp-server',
        version: '2.0.0',
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

// ===== 注册工具列表 =====
server.setRequestHandler(ListToolsRequestSchema, async () => {
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
server.setRequestHandler(CallToolRequestSchema, async (request) => {
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
            const { connectionName } = request.params.arguments as { connectionName: string };
            if (!connectionName) {
                throw new McpError(ErrorCode.InvalidParams, 'connectionName is required');
            }
            const db = connectionManager.getConnection(connectionName);
            const rows = await db.listTables();
            return {
                content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }],
            };
        }

        // --- describe_table ---
        if (request.params.name === 'describe_table') {
            const { connectionName, tableName } = request.params.arguments as {
                connectionName: string;
                tableName: string;
            };
            if (!connectionName) {
                throw new McpError(ErrorCode.InvalidParams, 'connectionName is required');
            }
            if (!tableName) {
                throw new McpError(ErrorCode.InvalidParams, 'tableName is required');
            }
            const db = connectionManager.getConnection(connectionName);
            const rows = await db.describeTable(tableName);
            return {
                content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }],
            };
        }

        // --- execute_sql ---
        if (request.params.name === 'execute_sql') {
            const { connectionName, sql } = request.params.arguments as {
                connectionName: string;
                sql: string;
            };
            if (!connectionName) {
                throw new McpError(ErrorCode.InvalidParams, 'connectionName is required');
            }
            if (!sql) {
                throw new McpError(ErrorCode.InvalidParams, 'sql is required');
            }

            // 根据连接的数据库类型选择校验方言
            const config = connectionManager.getConnectionConfig(connectionName);
            const validationResult = validateSql(sql, config.type);
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
            const { connectionName, sql } = request.params.arguments as {
                connectionName: string;
                sql: string;
            };
            if (!connectionName) {
                throw new McpError(ErrorCode.InvalidParams, 'connectionName is required');
            }
            if (!sql) {
                throw new McpError(ErrorCode.InvalidParams, 'sql is required');
            }

            const config = connectionManager.getConnectionConfig(connectionName);
            const validationResult = validateInsertSql(sql, config.type);
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

        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
    } catch (error: any) {
        return {
            content: [{ type: 'text', text: `Error: ${error.message}` }],
            isError: true,
        };
    }
});

// ===== 启动服务 =====
async function run() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Database MCP server is running on stdio');
    console.error(`Loaded ${appConfig.connections.length} connection(s): ${appConfig.connections.map(c => c.name).join(', ')}`);
}

run().catch((error) => {
    console.error('Fatal error running server:', error);
    process.exit(1);
});
