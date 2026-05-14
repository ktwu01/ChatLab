/**
 * AI 对话历史管理模块（平台无关）
 *
 * 管理 AI 对话的持久化存储（conversations.db），
 * 供 Electron 主进程和 CLI serve 共用。
 */

import Database from 'better-sqlite3'
import * as fs from 'fs'
import * as path from 'path'

const DEFAULT_GENERAL_ID = 'general_cn'

// ==================== 类型定义 ====================

export interface AIConversation {
  id: string
  sessionId: string
  title: string | null
  assistantId: string
  createdAt: number
  updatedAt: number
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'think'; tag: string; text: string; durationMs?: number }
  | {
      type: 'tool'
      tool: {
        name: string
        displayName: string
        status: 'running' | 'done' | 'error'
        params?: Record<string, unknown>
      }
    }
  | {
      type: 'summary_meta'
      bufferBoundaryTimestamp: number
      compressedMessageCount: number
    }

export type AIMessageRole = 'user' | 'assistant' | 'summary'

export interface TokenUsageData {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface AIMessage {
  id: string
  conversationId: string
  role: AIMessageRole
  content: string
  timestamp: number
  dataKeywords?: string[]
  dataMessageCount?: number
  contentBlocks?: ContentBlock[]
  tokenUsage?: TokenUsageData
}

export interface ConversationManagerLogger {
  warn(category: string, message: string, extra?: Record<string, unknown>): void
}

const defaultLogger: ConversationManagerLogger = {
  warn(_category, message, extra) {
    console.warn(`[AI Conversations] ${message}`, extra ?? '')
  },
}

// ==================== AIConversationManager ====================

export class AIConversationManager {
  private db: Database.Database | null = null
  private readonly aiDataDir: string
  private readonly logger: ConversationManagerLogger
  private readonly nativeBinding?: string
  private readonly pendingDebugContextMap = new Map<string, string>()

  constructor(aiDataDir: string, options?: { logger?: ConversationManagerLogger; nativeBinding?: string }) {
    this.aiDataDir = aiDataDir
    this.logger = options?.logger ?? defaultLogger
    this.nativeBinding = options?.nativeBinding
  }

  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  private getDb(): Database.Database {
    if (this.db) return this.db

    this.ensureDir(this.aiDataDir)
    const dbPath = path.join(this.aiDataDir, 'conversations.db')
    this.db = this.nativeBinding ? new Database(dbPath, { nativeBinding: this.nativeBinding }) : new Database(dbPath)
    this.db.pragma('journal_mode = WAL')

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ai_conversation (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        title TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ai_message (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        data_keywords TEXT,
        data_message_count INTEGER,
        content_blocks TEXT,
        FOREIGN KEY(conversation_id) REFERENCES ai_conversation(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_ai_conversation_session ON ai_conversation(session_id);
      CREATE INDEX IF NOT EXISTS idx_ai_message_conversation ON ai_message(conversation_id);
    `)

    this.migrateDatabase(this.db)
    return this.db
  }

  private migrateDatabase(db: Database.Database): void {
    try {
      const messageTableInfo = db.pragma('table_info(ai_message)') as Array<{ name: string }>
      const messageColumns = messageTableInfo.map((col) => col.name)

      if (!messageColumns.includes('content_blocks')) {
        db.exec('ALTER TABLE ai_message ADD COLUMN content_blocks TEXT')
      }
      if (!messageColumns.includes('token_usage')) {
        db.exec('ALTER TABLE ai_message ADD COLUMN token_usage TEXT')
      }
      if (!messageColumns.includes('debug_context')) {
        db.exec('ALTER TABLE ai_message ADD COLUMN debug_context TEXT')
      }

      const convTableInfo = db.pragma('table_info(ai_conversation)') as Array<{ name: string }>
      const convColumns = convTableInfo.map((col) => col.name)

      if (!convColumns.includes('assistant_id')) {
        db.exec(`ALTER TABLE ai_conversation ADD COLUMN assistant_id TEXT DEFAULT '${DEFAULT_GENERAL_ID}'`)
      }
    } catch (error) {
      console.error('[AI DB Migration] Migration failed:', error)
    }
  }

  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }

  // ==================== 生命周期 ====================

  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }

  // ==================== Debug ====================

  getAiSchema(): Array<{
    name: string
    columns: Array<{ name: string; type: string; notnull: boolean; pk: boolean }>
  }> {
    const db = this.getDb()
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as Array<{ name: string }>

    return tables.map((t) => {
      const columns = db.pragma(`table_info("${t.name}")`) as Array<{
        name: string
        type: string
        notnull: number
        pk: number
      }>
      return {
        name: t.name,
        columns: columns.map((c) => ({
          name: c.name,
          type: c.type,
          notnull: !!c.notnull,
          pk: !!c.pk,
        })),
      }
    })
  }

  executeAiSQL(sql: string): {
    columns: string[]
    rows: unknown[][]
    rowCount: number
    duration: number
    limited: boolean
  } {
    const db = this.getDb()
    const start = Date.now()
    const trimmed = sql.trim()
    const isSelect = /^SELECT/i.test(trimmed)

    if (isSelect) {
      const stmt = db.prepare(trimmed)
      const rows = stmt.all() as Record<string, unknown>[]
      const duration = Date.now() - start
      const columns = rows.length > 0 ? Object.keys(rows[0]) : []
      return {
        columns,
        rows: rows.map((r) => columns.map((c) => r[c])),
        rowCount: rows.length,
        duration,
        limited: false,
      }
    } else {
      const result = db.prepare(trimmed).run()
      const duration = Date.now() - start
      return {
        columns: ['changes', 'lastInsertRowid'],
        rows: [[result.changes, Number(result.lastInsertRowid)]],
        rowCount: 1,
        duration,
        limited: false,
      }
    }
  }

  // ==================== 对话管理 ====================

  createConversation(sessionId: string, title: string | undefined, assistantId: string): AIConversation {
    const db = this.getDb()
    const now = Math.floor(Date.now() / 1000)
    const id = this.generateId('conv')

    db.prepare(
      `INSERT INTO ai_conversation (id, session_id, title, assistant_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, sessionId, title || null, assistantId, now, now)

    return { id, sessionId, title: title || null, assistantId, createdAt: now, updatedAt: now }
  }

  getConversationCountsBySession(): Map<string, number> {
    const result = new Map<string, number>()
    try {
      const db = this.getDb()
      const rows = db
        .prepare('SELECT session_id, COUNT(*) as count FROM ai_conversation GROUP BY session_id')
        .all() as Array<{ session_id: string; count: number }>
      for (const row of rows) {
        result.set(row.session_id, row.count)
      }
    } catch {
      // AI DB may not be initialized yet
    }
    return result
  }

  getConversations(sessionId: string): AIConversation[] {
    const db = this.getDb()
    return db
      .prepare(
        `SELECT id, session_id as sessionId, title, assistant_id as assistantId,
                created_at as createdAt, updated_at as updatedAt
         FROM ai_conversation WHERE session_id = ? ORDER BY updated_at DESC`
      )
      .all(sessionId) as AIConversation[]
  }

  getConversation(conversationId: string): AIConversation | null {
    const db = this.getDb()
    const row = db
      .prepare(
        `SELECT id, session_id as sessionId, title, assistant_id as assistantId,
                created_at as createdAt, updated_at as updatedAt
         FROM ai_conversation WHERE id = ?`
      )
      .get(conversationId) as AIConversation | undefined
    return row || null
  }

  updateConversationTitle(conversationId: string, title: string): boolean {
    const db = this.getDb()
    const now = Math.floor(Date.now() / 1000)
    const result = db
      .prepare('UPDATE ai_conversation SET title = ?, updated_at = ? WHERE id = ?')
      .run(title, now, conversationId)
    return result.changes > 0
  }

  deleteConversation(conversationId: string): boolean {
    const db = this.getDb()
    db.prepare('DELETE FROM ai_message WHERE conversation_id = ?').run(conversationId)
    const result = db.prepare('DELETE FROM ai_conversation WHERE id = ?').run(conversationId)
    return result.changes > 0
  }

  // ==================== 消息管理 ====================

  addMessage(
    conversationId: string,
    role: AIMessageRole,
    content: string,
    dataKeywords?: string[],
    dataMessageCount?: number,
    contentBlocks?: ContentBlock[],
    tokenUsage?: TokenUsageData
  ): AIMessage {
    const db = this.getDb()
    const now = Math.floor(Date.now() / 1000)
    const id = this.generateId('msg')

    const pendingDebug = role === 'assistant' ? this.pendingDebugContextMap.get(conversationId) : undefined
    if (pendingDebug) {
      this.pendingDebugContextMap.delete(conversationId)
    }

    db.prepare(
      `INSERT INTO ai_message (id, conversation_id, role, content, timestamp, data_keywords, data_message_count, content_blocks, token_usage, debug_context)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      conversationId,
      role,
      content,
      now,
      dataKeywords ? JSON.stringify(dataKeywords) : null,
      dataMessageCount ?? null,
      contentBlocks ? JSON.stringify(contentBlocks) : null,
      tokenUsage ? JSON.stringify(tokenUsage) : null,
      pendingDebug ?? null
    )

    db.prepare('UPDATE ai_conversation SET updated_at = ? WHERE id = ?').run(now, conversationId)

    return {
      id,
      conversationId,
      role,
      content,
      timestamp: now,
      dataKeywords,
      dataMessageCount,
      contentBlocks,
      tokenUsage,
    }
  }

  getMessages(conversationId: string): AIMessage[] {
    const db = this.getDb()
    const rows = db
      .prepare(
        `SELECT id, conversation_id as conversationId, role, content, timestamp,
                data_keywords as dataKeywords, data_message_count as dataMessageCount,
                content_blocks as contentBlocks, token_usage as tokenUsage
         FROM ai_message WHERE conversation_id = ? ORDER BY timestamp ASC`
      )
      .all(conversationId) as Array<{
      id: string
      conversationId: string
      role: string
      content: string
      timestamp: number
      dataKeywords: string | null
      dataMessageCount: number | null
      contentBlocks: string | null
      tokenUsage: string | null
    }>

    return rows.map((row) => ({
      id: row.id,
      conversationId: row.conversationId,
      role: row.role as AIMessageRole,
      content: row.content,
      timestamp: row.timestamp,
      dataKeywords: row.dataKeywords ? JSON.parse(row.dataKeywords) : undefined,
      dataMessageCount: row.dataMessageCount ?? undefined,
      contentBlocks: row.contentBlocks ? JSON.parse(row.contentBlocks) : undefined,
      tokenUsage: row.tokenUsage ? JSON.parse(row.tokenUsage) : undefined,
    }))
  }

  deleteMessage(messageId: string): boolean {
    const db = this.getDb()
    const result = db.prepare('DELETE FROM ai_message WHERE id = ?').run(messageId)
    return result.changes > 0
  }

  getConversationTokenUsage(conversationId: string): TokenUsageData {
    const db = this.getDb()
    const row = db
      .prepare(
        `SELECT
           COALESCE(SUM(json_extract(token_usage, '$.promptTokens')), 0) as promptTokens,
           COALESCE(SUM(json_extract(token_usage, '$.completionTokens')), 0) as completionTokens,
           COALESCE(SUM(json_extract(token_usage, '$.totalTokens')), 0) as totalTokens
         FROM ai_message WHERE conversation_id = ? AND token_usage IS NOT NULL`
      )
      .get(conversationId) as { promptTokens: number; completionTokens: number; totalTokens: number }
    return { promptTokens: row.promptTokens, completionTokens: row.completionTokens, totalTokens: row.totalTokens }
  }

  // ==================== Debug context ====================

  setPendingDebugContext(conversationId: string, debugContext: string): void {
    this.pendingDebugContextMap.set(conversationId, debugContext)
  }

  setDebugContext(messageId: string, debugContext: string): void {
    const db = this.getDb()
    db.prepare('UPDATE ai_message SET debug_context = ? WHERE id = ?').run(debugContext, messageId)
  }

  clearAllDebugContext(): number {
    const db = this.getDb()
    const result = db.prepare('UPDATE ai_message SET debug_context = NULL WHERE debug_context IS NOT NULL').run()
    return result.changes
  }

  // ==================== Agent 专用 ====================

  getHistoryForAgent(
    conversationId: string,
    maxMessages?: number
  ): Array<{ role: 'user' | 'assistant' | 'summary'; content: string }> {
    const messages = this.getMessages(conversationId)
    const validMessages = messages.filter(
      (m) => (m.role === 'user' || m.role === 'assistant' || m.role === 'summary') && m.content?.trim()
    )

    let summaryMsg: AIMessage | undefined
    for (let i = validMessages.length - 1; i >= 0; i--) {
      if (validMessages[i].role === 'summary') {
        summaryMsg = validMessages[i]
        break
      }
    }

    let result: Array<{ role: 'user' | 'assistant' | 'summary'; content: string }>

    if (summaryMsg) {
      const metaBlock = summaryMsg.contentBlocks?.find(
        (b): b is Extract<ContentBlock, { type: 'summary_meta' }> => b.type === 'summary_meta'
      )
      const bufferBoundary = metaBlock?.bufferBoundaryTimestamp

      if (!metaBlock) {
        this.logger.warn('Conversations', 'summary message missing summary_meta; agent context will be summary-only', {
          conversationId,
          messageId: summaryMsg.id,
        })
      }

      const contextMessages = bufferBoundary
        ? validMessages.filter((m) => m.role !== 'summary' && m.timestamp >= bufferBoundary)
        : []

      result = [
        { role: 'summary' as const, content: summaryMsg.content },
        ...contextMessages.map((m) => ({ role: m.role, content: m.content })),
      ]
    } else {
      result = validMessages.map((m) => ({ role: m.role, content: m.content }))
    }

    if (maxMessages && result.length > maxMessages) {
      if (result.length > 0 && result[0].role === 'summary') {
        const rest = result.slice(1)
        const truncated = rest.slice(-(maxMessages - 1))
        return [result[0], ...truncated]
      }
      return result.slice(-maxMessages)
    }
    return result
  }

  // ==================== Summary / 压缩专用 ====================

  addSummaryMessage(
    conversationId: string,
    content: string,
    meta: { bufferBoundaryTimestamp: number; compressedMessageCount: number }
  ): AIMessage {
    const db = this.getDb()
    db.prepare("DELETE FROM ai_message WHERE conversation_id = ? AND role = 'summary'").run(conversationId)

    const contentBlocks: ContentBlock[] = [
      {
        type: 'summary_meta',
        bufferBoundaryTimestamp: meta.bufferBoundaryTimestamp,
        compressedMessageCount: meta.compressedMessageCount,
      },
    ]

    return this.addMessage(conversationId, 'summary', content, undefined, undefined, contentBlocks)
  }

  getLatestSummary(conversationId: string): AIMessage | null {
    const db = this.getDb()
    const row = db
      .prepare(
        `SELECT id, conversation_id as conversationId, role, content, timestamp,
                data_keywords as dataKeywords, data_message_count as dataMessageCount,
                content_blocks as contentBlocks
         FROM ai_message WHERE conversation_id = ? AND role = 'summary'
         ORDER BY timestamp DESC LIMIT 1`
      )
      .get(conversationId) as
      | {
          id: string
          conversationId: string
          role: string
          content: string
          timestamp: number
          dataKeywords: string | null
          dataMessageCount: number | null
          contentBlocks: string | null
        }
      | undefined

    if (!row) return null
    return {
      id: row.id,
      conversationId: row.conversationId,
      role: row.role as AIMessageRole,
      content: row.content,
      timestamp: row.timestamp,
      dataKeywords: row.dataKeywords ? JSON.parse(row.dataKeywords) : undefined,
      dataMessageCount: row.dataMessageCount ?? undefined,
      contentBlocks: row.contentBlocks ? JSON.parse(row.contentBlocks) : undefined,
    }
  }

  getMessagesAfterSummary(
    conversationId: string,
    summaryTimestamp: number
  ): Array<{ role: AIMessageRole; content: string; timestamp: number }> {
    const db = this.getDb()
    const rows = db
      .prepare(
        `SELECT role, content, timestamp FROM ai_message
         WHERE conversation_id = ? AND timestamp > ? AND role IN ('user', 'assistant')
         ORDER BY timestamp ASC`
      )
      .all(conversationId, summaryTimestamp) as Array<{ role: string; content: string; timestamp: number }>
    return rows.map((r) => ({ role: r.role as AIMessageRole, content: r.content, timestamp: r.timestamp }))
  }

  getAllUserAssistantMessages(
    conversationId: string
  ): Array<{ role: AIMessageRole; content: string; timestamp: number }> {
    const db = this.getDb()
    const rows = db
      .prepare(
        `SELECT role, content, timestamp FROM ai_message
         WHERE conversation_id = ? AND role IN ('user', 'assistant')
         ORDER BY timestamp ASC`
      )
      .all(conversationId) as Array<{ role: string; content: string; timestamp: number }>
    return rows.map((r) => ({ role: r.role as AIMessageRole, content: r.content, timestamp: r.timestamp }))
  }

  getMessageCountAfterSummary(conversationId: string): number {
    const summary = this.getLatestSummary(conversationId)
    if (!summary) {
      const db = this.getDb()
      const row = db
        .prepare("SELECT COUNT(*) as count FROM ai_message WHERE conversation_id = ? AND role IN ('user', 'assistant')")
        .get(conversationId) as { count: number }
      return row.count
    }

    const metaBlock = summary.contentBlocks?.find(
      (b): b is Extract<ContentBlock, { type: 'summary_meta' }> => b.type === 'summary_meta'
    )
    const boundary = metaBlock?.bufferBoundaryTimestamp ?? summary.timestamp

    const db = this.getDb()
    const row = db
      .prepare(
        "SELECT COUNT(*) as count FROM ai_message WHERE conversation_id = ? AND timestamp >= ? AND role IN ('user', 'assistant')"
      )
      .get(conversationId, boundary) as { count: number }
    return row.count
  }
}
