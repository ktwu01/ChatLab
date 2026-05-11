/**
 * 时间统计工具
 *
 * 获取聊天活跃时段分布（小时、星期、每日趋势）。
 */

import type { ToolDefinition, ToolExecutionContext, ToolResult, JsonSchema } from '../types'
import { getHourlyActivity, getWeekdayActivity, getDailyActivity } from '@openchatlab/core'

const inputSchema: JsonSchema = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      description: '统计类型：hourly（按小时）、weekday（按星期）、daily（按天）',
      enum: ['hourly', 'weekday', 'daily'],
      default: 'hourly',
    },
  },
}

function handler(params: Record<string, unknown>, context: ToolExecutionContext): ToolResult {
  const type = (params.type as string) || 'hourly'
  let data: unknown

  switch (type) {
    case 'hourly':
      data = getHourlyActivity(context.db)
      break
    case 'weekday':
      data = getWeekdayActivity(context.db)
      break
    case 'daily':
      data = getDailyActivity(context.db)
      break
    default:
      data = getHourlyActivity(context.db)
  }

  return {
    content: JSON.stringify({ type, data }),
    data,
  }
}

export const timeStatsTool: ToolDefinition = {
  name: 'chatlab_time_stats',
  description: '获取聊天活跃时段分布（按小时/星期/每日趋势）',
  inputSchema,
  handler,
}
