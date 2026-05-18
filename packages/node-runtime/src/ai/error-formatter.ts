export interface FormatAIErrorOptions {
  providerName?: string
  rawErrorLabel?: string
}

/**
 * Parse error candidates from an LLM API error, extracting statusCode, message, and retry info.
 */
function parseErrorCandidates(error: unknown): {
  rawMessage: string
  statusCode: number | undefined
  retrySeconds: number | undefined
} {
  const candidates: unknown[] = []
  if (error) candidates.push(error)

  const errorObj = error as { lastError?: unknown; errors?: unknown[] }
  if (errorObj?.lastError) candidates.push(errorObj.lastError)
  if (Array.isArray(errorObj?.errors)) candidates.push(...errorObj.errors)

  let rawMessage = ''
  let statusCode: number | undefined
  let retrySeconds: number | undefined

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') {
      if (!rawMessage && typeof candidate === 'string') rawMessage = candidate
      continue
    }

    const record = candidate as Record<string, unknown>
    if (typeof record.statusCode === 'number') statusCode = record.statusCode
    if (!rawMessage && typeof record.message === 'string') rawMessage = record.message

    if (!rawMessage && record.data && typeof record.data === 'object') {
      const data = record.data as { error?: { message?: string } }
      if (data.error?.message) rawMessage = data.error.message
    }

    if (record.responseBody && typeof record.responseBody === 'string') {
      try {
        const parsed = JSON.parse(record.responseBody) as { error?: { message?: string } }
        if (!rawMessage && parsed.error?.message) rawMessage = parsed.error.message
      } catch {
        if (!rawMessage) rawMessage = record.responseBody
      }
    }

    if (rawMessage) {
      const retryMatch = rawMessage.match(/retry in ([0-9.]+)s/i)
      if (retryMatch) retrySeconds = Math.ceil(Number(retryMatch[1]))
    }
  }

  return { rawMessage: rawMessage || String(error), statusCode, retrySeconds }
}

/**
 * Format LLM API errors into user-friendly messages.
 * Shared between Electron and Server — provider name and i18n labels are injected via options.
 */
export function formatAIError(error: unknown, options?: FormatAIErrorOptions): string {
  const { rawMessage: fallbackMessage, statusCode, retrySeconds } = parseErrorCandidates(error)
  const lowerMessage = fallbackMessage.toLowerCase()
  const providerName = options?.providerName || 'API'

  let friendlyMessage = ''

  if (statusCode === 429 || lowerMessage.includes('quota') || lowerMessage.includes('resource_exhausted')) {
    friendlyMessage = retrySeconds
      ? `${providerName} quota exhausted, please retry after ${retrySeconds}s or upgrade your quota.`
      : `${providerName} quota exhausted, please retry later or upgrade your quota.`
  } else if (
    statusCode === 403 &&
    (lowerMessage.includes('quota') || lowerMessage.includes('not enough') || lowerMessage.includes('insufficient'))
  ) {
    friendlyMessage = `${providerName} rejected the request due to insufficient quota or balance.`
  } else if (statusCode === 503 || lowerMessage.includes('overloaded') || lowerMessage.includes('unavailable')) {
    friendlyMessage = `${providerName} model is overloaded, please retry later.`
  } else if (fallbackMessage.length > 300) {
    friendlyMessage = `${fallbackMessage.slice(0, 300)}...`
  } else {
    friendlyMessage = fallbackMessage
  }

  const rawErrorLabel = options?.rawErrorLabel || 'Raw error'
  const details = [statusCode ? `status=${statusCode}` : null, fallbackMessage].filter(Boolean).join('; ')

  if (friendlyMessage !== fallbackMessage) {
    return `${friendlyMessage}\n\n${rawErrorLabel}: ${details}`
  }

  return friendlyMessage
}
