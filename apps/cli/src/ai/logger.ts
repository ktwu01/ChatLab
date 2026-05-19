/**
 * Server 端 AI 日志
 *
 * 复用 @openchatlab/node-runtime 的 AiLogger，
 * 在 startHttpServer() 中通过 initServerAiLogger() 初始化。
 */

import { AiLogger } from '@openchatlab/node-runtime'

let logger: AiLogger | null = null

export function initServerAiLogger(logsDir: string): AiLogger {
  if (!logger) {
    logger = new AiLogger(logsDir)
  }
  return logger
}

export function getServerAiLogger(): AiLogger | null {
  return logger
}

export function closeServerAiLogger(): void {
  if (logger) {
    logger.close()
    logger = null
  }
}
