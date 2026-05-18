/**
 * Lightweight AI translation module.
 *
 * Provides a platform-agnostic `TranslateFn` compatible with the shared
 * prompt-builder. No i18next dependency — just nested object lookup
 * with {{var}} interpolation and locale fallback.
 */

import type { TranslateFn } from '../agent/prompt-builder'
import zhCN from './locales/zh-CN'
import enUS from './locales/en-US'
import jaJP from './locales/ja-JP'
import zhTW from './locales/zh-TW'

export type { TranslateFn }

const localeMap: Record<string, Record<string, unknown>> = {
  'zh-CN': zhCN,
  'en-US': enUS,
  'ja-JP': jaJP,
  'zh-TW': zhTW,
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  let current: unknown = obj
  for (const segment of path.split('.')) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

function interpolate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = vars[key]
    return val != null ? String(val) : ''
  })
}

/**
 * Create a translation function for the given locale.
 * Supports `lng` option override (i18next-compatible) and {{var}} interpolation.
 */
export function createAiTranslate(defaultLocale: string = 'zh-CN'): TranslateFn {
  return (key: string, options?: Record<string, unknown>): string => {
    const lng = (options?.lng as string) || defaultLocale
    const locale = localeMap[lng] ? lng : 'en-US'
    const value = getNestedValue(localeMap[locale], key) ?? getNestedValue(localeMap['en-US'], key)

    if (typeof value !== 'string') return key
    if (!options) return value
    return interpolate(value, options)
  }
}

/** All AI locale data (for consumers like Electron that compose with their own keys) */
export const aiLocales = { 'zh-CN': zhCN, 'en-US': enUS, 'ja-JP': jaJP, 'zh-TW': zhTW }
