/**
 * 助手配置加载器
 *
 * 从 ~/.chatlab/ai/assistants/*.md 加载助手系统提示词。
 */

import * as fs from 'fs'
import * as path from 'path'
import { parseAssistantFile } from '@openchatlab/node-runtime'
import type { AssistantConfig } from '@openchatlab/node-runtime'

export function loadAssistantConfig(aiDataDir: string, assistantId: string): AssistantConfig | null {
  const filePath = path.join(aiDataDir, 'assistants', `${assistantId}.md`)
  if (!fs.existsSync(filePath)) return null

  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return parseAssistantFile(content, filePath)
  } catch {
    return null
  }
}
