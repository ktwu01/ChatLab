/**
 * @openchatlab/server (chatlab)
 *
 * ChatLab 的 CLI 和服务端入口包。
 * 提供 chatlab 命令行工具和 HTTP API / MCP 服务。
 */

export { run } from './cli'
export { startHttpServer, stopHttpServer } from './http'
