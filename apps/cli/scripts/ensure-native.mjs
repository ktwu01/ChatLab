#!/usr/bin/env node

import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const currentFile = fileURLToPath(import.meta.url)
const scriptDir = dirname(currentFile)
const serverDir = dirname(scriptDir)
const nativePath = resolve(serverDir, 'native/better_sqlite3.node')
const rebuildScript = resolve(scriptDir, 'rebuild-native.sh')

export function getNativeStatus(bindingPath, nodeExecutable = process.execPath) {
  if (!existsSync(bindingPath)) {
    return { ok: false, reason: 'missing', message: `Native binding not found: ${bindingPath}` }
  }

  const result = spawnSync(
    nodeExecutable,
    ['-e', 'require(process.argv[1]); process.stdout.write(process.versions.modules)', bindingPath],
    { encoding: 'utf8' }
  )

  if (result.status === 0) {
    return { ok: true, reason: 'valid', abi: result.stdout.trim() }
  }

  return {
    ok: false,
    reason: 'invalid',
    message: (result.stderr || result.stdout || result.error?.message || 'Native binding failed to load').trim(),
  }
}

function runRebuild() {
  const result = spawnSync('bash', [rebuildScript], {
    cwd: serverDir,
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    process.exit(result.status || 1)
  }
}

function main() {
  const checkOnly = process.argv.includes('--check')
  const status = getNativeStatus(nativePath)

  if (status.ok) {
    console.error(`[server native] better-sqlite3 ready (Node ABI ${status.abi})`)
    return
  }

  if (checkOnly) {
    console.error(`[server native] ${status.message}`)
    process.exit(1)
  }

  console.error(`[server native] ${status.message}`)
  console.error('[server native] Rebuilding better-sqlite3 for the current system Node.js...')
  runRebuild()

  const rebuilt = getNativeStatus(nativePath)
  if (!rebuilt.ok) {
    console.error(`[server native] Rebuild completed, but native binding is still unusable: ${rebuilt.message}`)
    process.exit(1)
  }

  console.error(`[server native] better-sqlite3 ready (Node ABI ${rebuilt.abi})`)
}

if (process.argv[1] && currentFile === resolve(process.argv[1])) {
  main()
}
