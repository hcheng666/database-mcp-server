# 数据库连接描述字段 - 需求规格说明

## 1. 需求概述

在多数据库连接的场景下，大模型在调用 `list_connections` 工具时，只能获取到技术性信息（`name`、`type`、`host`、`database`），无法理解每个数据库的**业务含义**。

新增 `description` 可选字段，允许用户为每个数据库连接提供一段自然语言描述（例如："订单管理系统主库"、"数据分析平台只读副本"），以帮助大模型更准确地理解和选择目标数据库。

## 2. 涉及变更

### 2.1 配置文件变更

`db-connections.json` 中每个连接新增可选字段 `description`：

```json
{
  "connections": [
    {
      "name": "analytics-pg",
      "type": "postgresql",
      "description": "数据分析平台 PostgreSQL 主库，包含报表和用户行为数据",
      "host": "127.0.0.1",
      "port": 5432,
      "user": "postgres",
      "password": "secret",
      "database": "analytics",
      "schemas": ["public", "reporting"]
    },
    {
      "name": "order-mysql",
      "type": "mysql",
      "description": "订单管理系统 MySQL 数据库，存储订单、商品、用户等核心业务数据",
      "host": "127.0.0.1",
      "port": 3306,
      "user": "root",
      "password": "secret",
      "database": "orders"
    }
  ]
}
```

### 2.2 代码变更

#### [MODIFY] `src/types.ts`

- `ConnectionConfig` 接口添加 `description?: string` 可选字段
- `ConnectionInfo` 接口添加 `description?: string` 可选字段（用于返回给模型的脱敏信息中）

#### [MODIFY] `src/connection-manager.ts`

- `getAllConnectionInfos()` 方法：在构建 `ConnectionInfo` 时，如果 `config.description` 存在，则写入返回结果中

#### [MODIFY] `src/index.ts`

- `list_connections` 工具的 `description` 字段更新为提示模型：返回结果中包含每个连接的业务描述，建议模型参考该描述来选择合适的数据库连接

### 2.3 配置字段说明更新

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `description` | string | ❌ | 连接的业务描述，用于帮助大模型理解该数据库的用途和内容 |

## 3. 向后兼容性

> [!NOTE]
> `description` 为可选字段，不提供时不影响任何现有功能。旧配置文件无需修改即可正常工作。

## 4. 影响范围

- 仅影响 `list_connections` 工具的返回内容
- 不影响 SQL 执行、表查询等核心功能
- 不引入新依赖
