/**
 * 工具适配层
 *
 * 将 @openchatlab/tools 的 ToolDefinition 适配为 @mariozechner/pi-agent-core 的 AgentTool 格式。
 */

import type { AgentTool } from '@mariozechner/pi-agent-core'
import type { ToolDefinition, ToolExecutionContext } from '@openchatlab/tools'
import type { DatabaseAdapter } from '@openchatlab/core'

export interface ServerToolContext {
  db: DatabaseAdapter
  sessionId: string
  locale?: string
}

function convertJsonSchemaToParameters(schema: ToolDefinition['inputSchema']): AgentTool['parameters'] {
  const properties: Record<string, unknown> = {}
  for (const [key, prop] of Object.entries(schema.properties)) {
    properties[key] = { ...prop }
  }
  return {
    type: 'object',
    properties,
    required: schema.required || [],
  }
}

export function adaptToolsForAgent(tools: ToolDefinition[], getContext: () => ServerToolContext): AgentTool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: convertJsonSchemaToParameters(tool.inputSchema),
    async execute(params: Record<string, unknown>): Promise<string> {
      const ctx = getContext()
      const execCtx: ToolExecutionContext = {
        db: ctx.db,
        sessionId: ctx.sessionId,
        locale: ctx.locale,
      }
      try {
        const result = tool.handler(params, execCtx)
        return result.content
      } catch (error) {
        return `Error: ${error instanceof Error ? error.message : String(error)}`
      }
    },
  }))
}
