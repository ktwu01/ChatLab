/**
 * @openchatlab/tools
 *
 * ChatLab AI 工具链。
 * 提供平台无关的工具定义和 handler，服务于 MCP Server、HTTP API 和 Electron Agent。
 */

export { TOOL_REGISTRY, getToolByName } from './registry'
export type { ToolDefinition, ToolExecutionContext, ToolResult, JsonSchema } from './types'
