/**
 * 通知总线抽象接口
 *
 * 统一不同运行环境下的异步事件通知方式：
 * - Electron：通过 BrowserWindow.webContents.send（IPC）通知前端
 * - Node 独立运行：通过 EventEmitter 或 SSE 通知消费者
 * - 浏览器：通过 postMessage / CustomEvent 通知 UI
 */

export type NotificationPayload = Record<string, unknown>

export interface NotificationBus {
  /** 发送通知事件 */
  emit(event: string, payload?: NotificationPayload): void

  /** 监听通知事件 */
  on(event: string, handler: (payload?: NotificationPayload) => void): void

  /** 取消监听 */
  off(event: string, handler: (payload?: NotificationPayload) => void): void
}
