/**
 * 数据库迁移系统
 *
 * 迁移脚本定义在 Electron 层（依赖 NLP 分词器、i18n 等平台特性），
 * 但执行引擎委托给 @openchatlab/core 的 runMigrations。
 */

import type Database from 'better-sqlite3'
import {
  CURRENT_SCHEMA_VERSION,
  runMigrations,
  needsMigration as coreNeedsMigration,
  type Migration as CoreMigration,
} from '@openchatlab/core'
import type { DatabaseAdapter } from '@openchatlab/core'
import { BetterSqliteAdapter } from '@openchatlab/node-runtime'
import { t } from '../i18n'
import { tokenizeForFts } from '../nlp/ftsTokenizer'

export { CURRENT_SCHEMA_VERSION }

/** 导出给前端使用的迁移信息 */
export interface MigrationInfo {
  version: number
  /** 技术描述（面向开发者） */
  description: string
  /** 用户可读的升级原因（显示在弹窗中） */
  userMessage: string
}

interface ElectronMigration extends CoreMigration {
  descriptionKey: string
  userMessageKey: string
}

const migrations: ElectronMigration[] = [
  {
    version: 1,
    description: 'Add owner_id column to meta',
    descriptionKey: 'database.migrationV1Desc',
    userMessageKey: 'database.migrationV1Message',
    up: (db: DatabaseAdapter) => {
      const tableInfo = db.pragma('table_info(meta)') as Array<{ name: string }>
      const hasOwnerIdColumn = tableInfo.some((col) => col.name === 'owner_id')
      if (!hasOwnerIdColumn) {
        db.exec('ALTER TABLE meta ADD COLUMN owner_id TEXT')
      }
    },
  },
  {
    version: 2,
    description: 'Add roles, reply_to_message_id, platform_message_id columns',
    descriptionKey: 'database.migrationV2Desc',
    userMessageKey: 'database.migrationV2Message',
    up: (db: DatabaseAdapter) => {
      const memberTableInfo = db.pragma('table_info(member)') as Array<{ name: string }>
      const hasRolesColumn = memberTableInfo.some((col) => col.name === 'roles')
      if (!hasRolesColumn) {
        db.exec("ALTER TABLE member ADD COLUMN roles TEXT DEFAULT '[]'")
      }

      const messageTableInfo = db.pragma('table_info(message)') as Array<{ name: string }>

      const hasReplyColumn = messageTableInfo.some((col) => col.name === 'reply_to_message_id')
      if (!hasReplyColumn) {
        db.exec('ALTER TABLE message ADD COLUMN reply_to_message_id TEXT DEFAULT NULL')
      }

      const hasPlatformMsgIdColumn = messageTableInfo.some((col) => col.name === 'platform_message_id')
      if (!hasPlatformMsgIdColumn) {
        db.exec('ALTER TABLE message ADD COLUMN platform_message_id TEXT DEFAULT NULL')
      }

      try {
        db.exec('CREATE INDEX IF NOT EXISTS idx_message_platform_id ON message(platform_message_id)')
      } catch {
        // Index may already exist
      }
    },
  },
  {
    version: 3,
    description: 'Add chat_session and message_context tables',
    descriptionKey: 'database.migrationV3Desc',
    userMessageKey: 'database.migrationV3Message',
    up: (db: DatabaseAdapter) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS chat_session (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          start_ts INTEGER NOT NULL,
          end_ts INTEGER NOT NULL,
          message_count INTEGER DEFAULT 0,
          is_manual INTEGER DEFAULT 0,
          summary TEXT
        )
      `)

      try {
        db.exec('CREATE INDEX IF NOT EXISTS idx_session_time ON chat_session(start_ts, end_ts)')
      } catch {
        // Index may already exist
      }

      db.exec(`
        CREATE TABLE IF NOT EXISTS message_context (
          message_id INTEGER PRIMARY KEY,
          session_id INTEGER NOT NULL,
          topic_id INTEGER
        )
      `)

      try {
        db.exec('CREATE INDEX IF NOT EXISTS idx_context_session ON message_context(session_id)')
      } catch {
        // Index may already exist
      }

      const tableInfo = db.pragma('table_info(meta)') as Array<{ name: string }>
      const hasGapThresholdColumn = tableInfo.some((col) => col.name === 'session_gap_threshold')
      if (!hasGapThresholdColumn) {
        db.exec('ALTER TABLE meta ADD COLUMN session_gap_threshold INTEGER')
      }
    },
  },
  {
    version: 4,
    description: 'Add FTS5 full-text search index',
    descriptionKey: 'database.migrationV4Desc',
    userMessageKey: 'database.migrationV4Message',
    up: (db: DatabaseAdapter) => {
      const hasTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='message_fts'").get()
      if (hasTable) return

      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS message_fts USING fts5(
          content,
          content='',
          content_rowid=id
        )
      `)

      const BATCH_SIZE = 5000
      const insertFts = db.prepare('INSERT INTO message_fts(rowid, content) VALUES (?, ?)')

      const countRow = db
        .prepare("SELECT COUNT(*) as total FROM message WHERE type = 0 AND content IS NOT NULL AND content != ''")
        .get() as { total: number } | undefined

      const total = countRow?.total ?? 0
      let offset = 0
      while (offset < total) {
        const rows = db
          .prepare(
            `SELECT id, content FROM message
             WHERE type = 0 AND content IS NOT NULL AND content != ''
             ORDER BY id ASC LIMIT ? OFFSET ?`
          )
          .all(BATCH_SIZE, offset) as Array<{ id: number; content: string }>

        if (rows.length === 0) break

        for (const row of rows) {
          const tokens = tokenizeForFts(row.content)
          if (tokens) {
            insertFts.run(row.id, tokens)
          }
        }

        offset += BATCH_SIZE
      }
    },
  },
]

/**
 * Check database structural integrity (meta table must exist)
 */
function checkDatabaseIntegrity(db: DatabaseAdapter): { valid: boolean; error?: string } {
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='meta'").all() as Array<{
      name: string
    }>

    if (tables.length === 0) {
      return {
        valid: false,
        error: t('database.integrityError'),
      }
    }
    return { valid: true }
  } catch (error) {
    return {
      valid: false,
      error: t('database.checkFailed', { error: error instanceof Error ? error.message : String(error) }),
    }
  }
}

/**
 * Execute database migrations.
 * Wraps better-sqlite3 Database in a DatabaseAdapter and delegates to core runMigrations.
 *
 * @param db Raw better-sqlite3 connection (stays open after migration)
 * @param forceRepair Re-run all migration scripts even if version is current
 */
export function migrateDatabase(db: Database.Database, forceRepair = false): boolean {
  const adapter = new BetterSqliteAdapter(db)

  const integrity = checkDatabaseIntegrity(adapter)
  if (!integrity.valid) {
    throw new Error(integrity.error)
  }

  return runMigrations(adapter, migrations, forceRepair)
}

/**
 * Check if database needs migration
 */
export function needsMigration(db: Database.Database): boolean {
  const adapter = new BetterSqliteAdapter(db)
  return coreNeedsMigration(adapter, CURRENT_SCHEMA_VERSION)
}

/**
 * Get pending migration info for UI display
 * @param fromVersion Starting version (exclusive)
 */
export function getPendingMigrationInfos(fromVersion = 0): MigrationInfo[] {
  return migrations
    .filter((m) => m.version > fromVersion)
    .map((m) => ({
      version: m.version,
      description: t(m.descriptionKey),
      userMessage: t(m.userMessageKey),
    }))
}
