/**
 * 工具注册表
 *
 * 所有平台无关工具的统一注册表。
 * MCP Server 和 HTTP API 从此注册表加载工具。
 */

import type { ToolDefinition } from './types'

import { searchTool } from './definitions/search'
import { memberStatsTool } from './definitions/member-stats'
import { timeStatsTool } from './definitions/time-stats'
import { recentMessagesTool } from './definitions/recent-messages'
import { sqlQueryTool, schemaTool } from './definitions/sql-query'
import { sessionInfoTool } from './definitions/session-info'
import { sessionsListTool } from './definitions/sessions'

/**
 * 所有可用工具的注册表
 *
 * sessions 和 session_info 为会话管理工具；
 * 其余为数据查询/分析工具。
 */
export const TOOL_REGISTRY: ToolDefinition[] = [
  sessionsListTool,
  sessionInfoTool,
  searchTool,
  memberStatsTool,
  timeStatsTool,
  recentMessagesTool,
  sqlQueryTool,
  schemaTool,
]

/**
 * 按名称查找工具
 */
export function getToolByName(name: string): ToolDefinition | undefined {
  return TOOL_REGISTRY.find((t) => t.name === name)
}
