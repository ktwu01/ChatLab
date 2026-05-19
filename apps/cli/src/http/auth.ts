/**
 * ChatLab HTTP API — Bearer Token authentication hook
 *
 * 从 electron/main/api/auth.ts 迁移，使用 @openchatlab/config 读取 token。
 */

import type { FastifyRequest, FastifyReply } from 'fastify'
import { timingSafeEqual } from 'crypto'
import { unauthorized, errorResponse } from './errors'

let cachedToken: string | null = null

/**
 * 设置 auth hook 使用的 token（由 server 启动时注入）
 */
export function setAuthToken(token: string): void {
  cachedToken = token
}

function safeTokenCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export async function authHook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!cachedToken) return

  // /_web/ 内部 API 不需要认证（仅限同源 Web UI 使用）
  if (request.url.startsWith('/_web/')) return

  const authHeader = request.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const err = unauthorized()
    reply.code(err.statusCode).send(errorResponse(err))
    return
  }

  const token = authHeader.slice(7)

  if (!safeTokenCompare(token, cachedToken)) {
    const err = unauthorized()
    reply.code(err.statusCode).send(errorResponse(err))
    return
  }
}
