/**
 * FetchMessageAdapter — Web (CLI serve) 模式消息查询实现
 *
 * 通过 pluginQuery 构建 SQL 查询来实现消息检索。
 * 逻辑从 web-api-shim.ts 迁移而来。
 */

import type { MessageAdapter, TimeFilter, PaginatedMessages, MessageRecord, SearchResult } from './types'
import { getRegisteredAdapter } from '../registry'
import type { DataAdapter } from '../data/types'

function getDataAdapter(): DataAdapter {
  return getRegisteredAdapter<DataAdapter>('data')
}

const MSG_SELECT = `
  SELECT
    msg.id,
    m.id as senderId,
    COALESCE(m.group_nickname, m.account_name, m.platform_id) as senderName,
    m.platform_id as senderPlatformId,
    m.aliases,
    m.avatar as senderAvatar,
    msg.content,
    msg.ts as timestamp,
    msg.type,
    msg.reply_to_message_id as replyToMessageId,
    reply_msg.content as replyToContent,
    COALESCE(reply_m.group_nickname, reply_m.account_name, reply_m.platform_id) as replyToSenderName
  FROM message msg
  JOIN member m ON msg.sender_id = m.id
  LEFT JOIN message reply_msg ON msg.reply_to_message_id = reply_msg.platform_message_id
  LEFT JOIN member reply_m ON reply_msg.sender_id = reply_m.id
`

function buildConditions(
  filter?: TimeFilter,
  senderId?: number,
  keywords?: string[]
): { clause: string; params: unknown[] } {
  const conds: string[] = []
  const params: unknown[] = []

  if (filter?.startTs != null) {
    conds.push('msg.ts >= ?')
    params.push(filter.startTs)
  }
  if (filter?.endTs != null) {
    conds.push('msg.ts <= ?')
    params.push(filter.endTs)
  }
  if (senderId != null) {
    conds.push('msg.sender_id = ?')
    params.push(senderId)
  }
  if (keywords && keywords.length > 0) {
    const kwConds = keywords.map(() => 'msg.content LIKE ?')
    conds.push(`(${kwConds.join(' OR ')})`)
    params.push(...keywords.map((k) => `%${k}%`))
  }

  return { clause: conds.length > 0 ? 'AND ' + conds.join(' AND ') : '', params }
}

function pq<T>(sessionId: string, sql: string, params: unknown[] = []) {
  return getDataAdapter().pluginQuery<T>(sessionId, sql, params)
}

export class FetchMessageAdapter implements MessageAdapter {
  async getMessagesBefore(
    sessionId: string,
    beforeId: number,
    limit: number = 50,
    filter?: TimeFilter,
    senderId?: number,
    keywords?: string[]
  ): Promise<PaginatedMessages> {
    const { clause, params } = buildConditions(filter, senderId, keywords)
    const sql = `${MSG_SELECT} WHERE msg.id < ? ${clause} ORDER BY msg.id DESC LIMIT ?`
    const rows = await pq<MessageRecord>(sessionId, sql, [beforeId, ...params, limit + 1])
    const hasMore = rows.length > limit
    const messages = hasMore ? rows.slice(0, limit) : rows
    return { messages: messages.reverse(), hasMore }
  }

  async getMessagesAfter(
    sessionId: string,
    afterId: number,
    limit: number = 50,
    filter?: TimeFilter,
    senderId?: number,
    keywords?: string[]
  ): Promise<PaginatedMessages> {
    const { clause, params } = buildConditions(filter, senderId, keywords)
    const sql = `${MSG_SELECT} WHERE msg.id > ? ${clause} ORDER BY msg.id ASC LIMIT ?`
    const rows = await pq<MessageRecord>(sessionId, sql, [afterId, ...params, limit + 1])
    const hasMore = rows.length > limit
    const messages = hasMore ? rows.slice(0, limit) : rows
    return { messages, hasMore }
  }

  async getMessageContext(
    sessionId: string,
    messageIds: number | number[],
    contextSize: number = 20
  ): Promise<MessageRecord[]> {
    const ids = Array.isArray(messageIds) ? messageIds : [messageIds]
    if (ids.length === 0) return []

    const allIds = new Set<number>()

    for (const id of ids) {
      allIds.add(id)
      if (contextSize > 0) {
        const before = await pq<{ id: number }>(
          sessionId,
          'SELECT id FROM message WHERE id < ? ORDER BY id DESC LIMIT ?',
          [id, contextSize]
        )
        before.forEach((r) => allIds.add(r.id))

        const after = await pq<{ id: number }>(
          sessionId,
          'SELECT id FROM message WHERE id > ? ORDER BY id ASC LIMIT ?',
          [id, contextSize]
        )
        after.forEach((r) => allIds.add(r.id))
      }
    }

    const idList = Array.from(allIds).sort((a, b) => a - b)
    const placeholders = idList.map(() => '?').join(', ')
    const sql = `${MSG_SELECT} WHERE msg.id IN (${placeholders}) ORDER BY msg.id ASC`
    return pq<MessageRecord>(sessionId, sql, idList)
  }

  async searchMessages(
    sessionId: string,
    keywords: string[],
    filter?: TimeFilter,
    limit: number = 100,
    offset: number = 0,
    senderId?: number
  ): Promise<SearchResult> {
    const { clause, params } = buildConditions(filter, senderId, keywords)
    const countSql = `SELECT COUNT(*) as total FROM message msg JOIN member m ON msg.sender_id = m.id WHERE 1=1 ${clause}`
    const countResult = await pq<{ total: number }>(sessionId, countSql, params)
    const total = countResult[0]?.total ?? 0

    const sql = `${MSG_SELECT} WHERE 1=1 ${clause} ORDER BY msg.ts DESC LIMIT ? OFFSET ?`
    const messages = await pq<MessageRecord>(sessionId, sql, [...params, limit, offset])
    return { messages, total }
  }

  async getAllRecentMessages(sessionId: string, filter?: TimeFilter, limit: number = 100): Promise<SearchResult> {
    const { clause, params } = buildConditions(filter)
    const countSql = `SELECT COUNT(*) as total FROM message msg JOIN member m ON msg.sender_id = m.id WHERE 1=1 ${clause}`
    const countResult = await pq<{ total: number }>(sessionId, countSql, params)
    const total = countResult[0]?.total ?? 0

    const sql = `${MSG_SELECT} WHERE 1=1 ${clause} ORDER BY msg.ts DESC LIMIT ?`
    const messages = await pq<MessageRecord>(sessionId, sql, [...params, limit])
    return { messages: messages.reverse(), total }
  }
}
