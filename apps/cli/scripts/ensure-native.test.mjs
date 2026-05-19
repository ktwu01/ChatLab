import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { getNativeStatus } from './ensure-native.mjs'

test('reports missing native binding', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'chatlab-native-missing-'))
  try {
    const status = getNativeStatus(path.join(dir, 'better_sqlite3.node'))
    assert.equal(status.ok, false)
    assert.equal(status.reason, 'missing')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('reports invalid native binding load failure', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'chatlab-native-invalid-'))
  try {
    const nativePath = path.join(dir, 'better_sqlite3.node')
    writeFileSync(nativePath, 'not a native module')

    const status = getNativeStatus(nativePath)
    assert.equal(status.ok, false)
    assert.equal(status.reason, 'invalid')
    assert.match(status.message, /file too short|not a mach-o file|invalid/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('reports valid native binding when it can be loaded by current Node', () => {
  const nativePath = path.resolve('apps/cli/native/better_sqlite3.node')
  const status = getNativeStatus(nativePath)
  assert.equal(status.ok, true)
  assert.equal(status.reason, 'valid')
})

test('prints status to stderr so CLI stdout stays machine-readable', () => {
  const result = spawnSync(process.execPath, ['apps/cli/scripts/ensure-native.mjs', '--check'], {
    encoding: 'utf8',
  })

  assert.equal(result.status, 0)
  assert.equal(result.stdout, '')
  assert.match(result.stderr, /better-sqlite3 ready/)
})
