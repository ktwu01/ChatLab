/**
 * 路径提供器抽象接口
 *
 * 统一不同运行环境下的目录路径获取方式：
 * - Electron：通过 app.getPath('userData') 驱动
 * - Node 独立运行：通过 ~/.chatlab/ 或 CHATLAB_DATA_DIR 环境变量驱动
 *
 * 子目录结构在所有环境下保持一致：
 *   {dataDir}/
 *     ├── databases/     聊天记录 SQLite 文件（{uuid}.db）
 *     ├── ai/            AI 对话历史、LLM 配置
 *     ├── settings/      用户设置
 *     ├── cache/         派生数据缓存（可再生）
 *     ├── temp/          临时文件
 *     └── logs/          日志
 */
export interface PathProvider {
  /** 数据根目录 */
  getDataDir(): string

  /** 数据库文件目录（存放 {uuid}.db） */
  getDatabaseDir(): string

  /** AI 数据目录（对话历史、LLM 配置） */
  getAiDataDir(): string

  /** 设置目录 */
  getSettingsDir(): string

  /** 缓存目录（存放可再生的派生数据） */
  getCacheDir(): string

  /** 临时文件目录 */
  getTempDir(): string

  /** 日志目录 */
  getLogsDir(): string

  /** 下载目录（导出文件的默认保存位置） */
  getDownloadsDir(): string
}
