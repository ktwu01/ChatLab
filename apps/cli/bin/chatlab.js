#!/usr/bin/env node

/**
 * ChatLab CLI 入口
 *
 * 开发阶段：通过 pnpm --filter chatlab dev 运行（使用 tsx）
 * 发布阶段：构建后直接作为 Node.js 脚本运行
 */

// 开发阶段占位，实际通过 package.json scripts 的 tsx 运行
console.error('Please run via: npx tsx apps/cli/src/cli.ts')
console.error('Or use: pnpm --filter @openchatlab/chatlab cli')
process.exit(1)
