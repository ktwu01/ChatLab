/**
 * 设备密钥管理
 * 在应用数据目录下持久化一个随机生成的设备密钥，用于 API Key 加密。
 * 替代 node-machine-id，解决 Linux ARM64 等环境下 machine-id 不可用或不稳定的问题。
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { randomBytes } from 'crypto'
import { getSystemDataDir, getElectronLegacyDataDir, ensureDir } from '../../paths'

const DEVICE_KEY_FILE = '.device-key'

let cachedDeviceKey: string | null = null

function readKeyFromFile(keyPath: string): string | null {
  try {
    if (fs.existsSync(keyPath)) {
      const key = fs.readFileSync(keyPath, 'utf-8').trim()
      if (key.length >= 32) return key
    }
  } catch {
    // ignore
  }
  return null
}

/**
 * 获取设备密钥（32 字节随机值的 hex 字符串）
 * 首次调用时从文件读取，文件不存在则生成并写入。
 */
export function getDeviceKey(): string {
  if (cachedDeviceKey) return cachedDeviceKey

  const dataDir = getSystemDataDir()
  ensureDir(dataDir)
  const keyPath = path.join(dataDir, DEVICE_KEY_FILE)

  const key = readKeyFromFile(keyPath)
  if (key) {
    cachedDeviceKey = key
    return cachedDeviceKey
  }

  const newKey = randomBytes(32).toString('hex')
  try {
    fs.writeFileSync(keyPath, newKey, { encoding: 'utf-8', mode: 0o600 })
  } catch (error) {
    console.error('[DeviceKey] Failed to write device key file:', error)
  }

  cachedDeviceKey = newKey
  return cachedDeviceKey
}

/**
 * 获取所有可能的 device key（当前 + Electron legacy 位置）
 * 用于解密迁移前加密的 API Key
 */
export function getAllDeviceKeys(): string[] {
  const keys: string[] = []
  const seen = new Set<string>()

  const addKey = (k: string | null) => {
    if (k && !seen.has(k)) {
      seen.add(k)
      keys.push(k)
    }
  }

  addKey(readKeyFromFile(path.join(getSystemDataDir(), DEVICE_KEY_FILE)))

  try {
    addKey(readKeyFromFile(path.join(getElectronLegacyDataDir(), DEVICE_KEY_FILE)))
  } catch {
    // getElectronLegacyDataDir() may throw outside Electron
  }

  if (process.platform === 'darwin') {
    addKey(
      readKeyFromFile(path.join(os.homedir(), 'Library', 'Application Support', 'ChatLab', 'data', DEVICE_KEY_FILE))
    )
  } else if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
    addKey(readKeyFromFile(path.join(appData, 'ChatLab', 'data', DEVICE_KEY_FILE)))
  }

  return keys
}

/**
 * 重置缓存（仅测试用）
 */
export function resetDeviceKeyCache(): void {
  cachedDeviceKey = null
}
