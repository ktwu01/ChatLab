/**
 * @openchatlab/core
 *
 * 平台无关的 ChatLab 共享核心。
 * 提供抽象接口、查询工具、分析算法，不依赖任何特定运行时（Electron / Node / 浏览器）。
 */

// 抽象接口
export type {
  DatabaseAdapter,
  PreparedStatement,
  RunResult,
  PathProvider,
  NotificationBus,
  NotificationPayload,
} from './interfaces'

// 查询工具
export { buildTimeFilter, buildSystemMessageFilter } from './query'
