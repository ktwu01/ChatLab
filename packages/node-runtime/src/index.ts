/**
 * @openchatlab/node-runtime
 *
 * Node.js 运行时适配器，提供 better-sqlite3 数据库适配器、
 * 路径管理、数据库连接管理等平台特定实现。
 */

export { BetterSqliteAdapter, openBetterSqliteDatabase } from './better-sqlite3-adapter'
export { NodePathProvider } from './node-path-provider'
export { DatabaseManager } from './database-manager'
export { createJiebaNlpProvider } from './jieba-nlp-provider'

// NLP 分词引擎、词频统计、词库管理
export {
  initNlpDir,
  getNlpDir,
  getJieba,
  clearJiebaInstance,
  segment,
  batchSegmentWithFrequency,
  collectPosTagStats,
  getPosTagDefinitions,
  computeWordFrequency,
  segmentText,
  isDictDownloaded,
  getDictList,
  loadDictBuffer,
  downloadDict,
  deleteDict,
  ensureDefaultDict,
} from './nlp'

// AI 助手/技能解析器 + 对话管理
export type { AssistantConfig, AssistantSummary, SkillDef, SkillSummary } from './ai'
export { parseAssistantFile, serializeAssistant, parseSkillFile, extractSkillId } from './ai'
export { AIConversationManager } from './ai'
export type {
  AIConversation,
  AIMessage,
  AIMessageRole,
  ContentBlock,
  TokenUsageData,
  ConversationManagerLogger,
} from './ai'
