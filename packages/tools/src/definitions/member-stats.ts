/**
 * 成员统计工具
 *
 * 获取成员活跃度排行和统计信息。
 */

import type { ToolDefinition, ToolExecutionContext, ToolResult, JsonSchema } from '../types'
import { getMemberActivity } from '@openchatlab/core'

const inputSchema: JsonSchema = {
  type: 'object',
  properties: {
    top: {
      type: 'number',
      description: '返回前 N 个活跃成员',
      default: 20,
    },
  },
}

function handler(params: Record<string, unknown>, context: ToolExecutionContext): ToolResult {
  const top = (params.top as number) || 20
  const members = getMemberActivity(context.db).slice(0, top)

  const data = {
    total: members.length,
    members: members.map((m) => ({
      name: m.name,
      messageCount: m.messageCount,
      percentage: m.percentage,
    })),
  }

  return {
    content: JSON.stringify(data),
    data,
  }
}

export const memberStatsTool: ToolDefinition = {
  name: 'chatlab_member_stats',
  description: '获取成员活跃度排行，包括消息数量和占比',
  inputSchema,
  handler,
}
