/**
 * 服务端 Agent
 *
 * 使用 @openchatlab/node-runtime 的 runAgentCore 编排对话流程，
 * 将流式事件通过回调输出给 SSE 端点。
 */

import {
  runAgentCore,
  completeSimple,
  checkAndCompress,
  buildSystemPrompt,
  createAiTranslate,
  type AgentCoreEvent,
  type SimpleHistoryMessage,
  type AIConversationManager,
  type CompressionConfig,
  type CompressionLlmAdapter,
  type PiTextContent,
  type AgentTool,
  type DataSnapshot,
  type OwnerInfo,
  type MentionedMember,
} from '@openchatlab/node-runtime'

import { getDefaultAssistantConfig, buildPiModel } from './llm-config'
import { getServerAiLogger } from './logger'

export interface AgentStreamEvent {
  type: 'content' | 'think' | 'tool_start' | 'tool_result' | 'status' | 'done' | 'error'
  content?: string
  thinkTag?: string
  thinkDurationMs?: number
  toolName?: string
  toolParams?: Record<string, unknown>
  toolResult?: unknown
  error?: { name: string | null; message: string | null }
  isFinished?: boolean
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
  status?: {
    phase: string
    round: number
    toolsUsed: number
    currentTool?: string
  }
}

export interface RunAgentOptions {
  userMessage: string
  conversationId: string
  chatType?: 'group' | 'private'
  locale?: string
  assistantSystemPrompt?: string
  skillMenu?: string | null
  compressionConfig?: CompressionConfig
  tools?: AgentTool[]
  aiDataDir: string
  convManager: AIConversationManager
  onEvent: (event: AgentStreamEvent) => void
  abortSignal?: AbortSignal
  ownerInfo?: OwnerInfo
  mentionedMembers?: MentionedMember[]
  dataSnapshot?: DataSnapshot
}

function mapCoreEventToStream(
  event: AgentCoreEvent,
  onEvent: (event: AgentStreamEvent) => void,
  toolsUsedCount: { value: number },
  currentRound: { value: number }
): void {
  switch (event.type) {
    case 'content':
      onEvent({ type: 'content', content: event.content })
      break
    case 'thinking_start':
      onEvent({
        type: 'status',
        status: { phase: 'thinking', round: currentRound.value, toolsUsed: toolsUsedCount.value },
      })
      break
    case 'thinking_delta':
      onEvent({ type: 'think', content: event.content, thinkTag: 'thinking' })
      break
    case 'thinking_end':
      onEvent({ type: 'think', content: '', thinkTag: 'thinking', thinkDurationMs: event.durationMs })
      break
    case 'tool_start':
      toolsUsedCount.value += 1
      onEvent({ type: 'tool_start', toolName: event.toolName, toolParams: event.toolParams })
      onEvent({
        type: 'status',
        status: {
          phase: 'tool_running',
          round: currentRound.value,
          toolsUsed: toolsUsedCount.value,
          currentTool: event.toolName,
        },
      })
      break
    case 'tool_end':
      onEvent({ type: 'tool_result', toolName: event.toolName, toolResult: event.toolResult })
      break
    case 'turn_end':
      currentRound.value = event.round
      break
    case 'usage_update':
      break
  }
}

export async function runServerAgent(options: RunAgentOptions): Promise<void> {
  const {
    userMessage,
    conversationId,
    chatType = 'group',
    locale = 'zh-CN',
    assistantSystemPrompt,
    skillMenu,
    compressionConfig,
    tools = [],
    aiDataDir,
    convManager,
    onEvent,
    abortSignal,
    ownerInfo,
    mentionedMembers,
    dataSnapshot,
  } = options

  const llmConfig = getDefaultAssistantConfig(aiDataDir)
  if (!llmConfig) {
    onEvent({ type: 'error', error: { name: 'ConfigError', message: 'LLM service not configured' } })
    onEvent({ type: 'done', isFinished: true })
    return
  }

  const piModel = buildPiModel(llmConfig)
  const t = createAiTranslate(locale)

  let skillCtx: { skillDef?: { name: string; prompt: string }; skillMenu?: string } | undefined
  if (skillMenu) {
    skillCtx = { skillMenu }
  }

  const systemPrompt = buildSystemPrompt({
    t,
    chatType,
    assistantSystemPrompt,
    ownerInfo,
    locale,
    skillCtx,
    mentionedMembers,
    dataSnapshot,
  })

  if (compressionConfig?.enabled) {
    const llmAdapter: CompressionLlmAdapter = {
      contextWindow: piModel.contextWindow ?? 128000,
      compress: async (prompt: string, maxTokens: number) => {
        onEvent({ type: 'status', status: { phase: 'compressing', round: 0, toolsUsed: 0 } })
        try {
          const result = await completeSimple(
            piModel,
            {
              systemPrompt: undefined,
              messages: [{ role: 'user', content: [{ type: 'text', text: prompt }], timestamp: Date.now() }] as any,
            },
            { apiKey: llmConfig.apiKey, maxTokens }
          )
          const text = result.content
            .filter((item): item is PiTextContent => item.type === 'text')
            .map((item) => item.text)
            .join('')
          return text || null
        } catch {
          return null
        }
      },
    }
    const aiLogger = getServerAiLogger()
    const compressionResult = await checkAndCompress(
      conversationId,
      compressionConfig,
      systemPrompt,
      llmAdapter,
      convManager,
      aiLogger ?? undefined
    )
    if (compressionResult.compressed) {
      onEvent({ type: 'status', status: { phase: 'compression_done', round: 0, toolsUsed: 0 } })
    }
  }

  if (abortSignal?.aborted) {
    onEvent({ type: 'done', isFinished: true, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } })
    return
  }

  let history: SimpleHistoryMessage[] = []
  try {
    history = convManager.getHistoryForAgent(conversationId)
  } catch {
    // empty history on failure
  }

  const toolsUsedCount = { value: 0 }
  const currentRound = { value: 0 }

  onEvent({ type: 'status', status: { phase: 'preparing', round: 0, toolsUsed: 0 } })

  try {
    const result = await runAgentCore({
      piModel,
      apiKey: llmConfig.apiKey,
      systemPrompt,
      tools,
      history,
      userMessage,
      maxToolRounds: 5,
      abortSignal,
      onEvent: (coreEvent) => mapCoreEventToStream(coreEvent, onEvent, toolsUsedCount, currentRound),
      onDebugContext: (messages) => {
        try {
          convManager.setPendingDebugContext(conversationId, JSON.stringify(messages, null, 2))
        } catch {
          // silent
        }
      },
    })

    if (result.error) {
      onEvent({ type: 'error', error: { name: 'AgentError', message: result.error } })
    }

    onEvent({ type: 'done', isFinished: true, usage: result.usage })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    onEvent({ type: 'error', error: { name: 'AgentError', message: msg } })
    onEvent({ type: 'done', isFinished: true, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } })
  }
}
