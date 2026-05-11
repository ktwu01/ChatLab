/**
 * 最近消息工具
 *
 * 获取最近 N 条聊天消息。
 */

import type { ToolDefinition, ToolExecutionContext, ToolResult, JsonSchema } from '../types'
import { getRecentMessages } from '@openchatlab/core'

const inputSchema: JsonSchema = {
  type: 'object',
  properties: {
    limit: {
      type: 'number',
      description: '返回的消息条数',
      default: 20,
    },
  },
}

function handler(params: Record<string, unknown>, context: ToolExecutionContext): ToolResult {
  const limit = (params.limit as number) || 20
  const messages = getRecentMessages(context.db, { limit })

  const data = {
    returned: messages.length,
    messages: messages.map((m) => ({
      sender: m.senderName,
      content: m.content,
      time: new Date(m.timestamp * 1000).toISOString(),
    })),
  }

  return {
    content: JSON.stringify(data),
    data,
  }
}

export const recentMessagesTool: ToolDefinition = {
  name: 'chatlab_recent_messages',
  description: '获取最近的聊天消息',
  inputSchema,
  handler,
}
