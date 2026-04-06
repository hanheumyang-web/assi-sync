#!/usr/bin/env node
import chalk from 'chalk'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { config, validateConfig } from './config.js'
import { initFirebase } from './firebase.js'
import { loadState, saveState } from './state.js'
import { startWatcher } from './watcher.js'

const argv = yargs(hideBin(process.argv))
  .option('watch-dir', { alias: 'w', type: 'string', describe: '감시할 폴더 경로' })
  .option('uid', { alias: 'u', type: 'string', describe: 'Firebase Auth UID' })
  .option('service-account', { alias: 's', type: 'string', describe: '서비스 계정 키 파일 경로' })
  .help()
  .argv

// CLI args override .env
if (argv.watchDir) config.watchDir = argv.watchDir
if (argv.uid) config.uid = argv.uid
if (argv.serviceAccount) config.serviceAccountPath = argv.serviceAccount

console.log(chalk.bold.cyan(`
  ╔══════════════════════════════════╗
  ║     ASSI Sync Agent v1.0.0      ║
  ╚══════════════════════════════════╝
`))

try {
  validateConfig()
} catch (err) {
  console.error(chalk.red(`❌ ${err.message}`))
  console.log(chalk.gray(`\n설정 방법:`))
  console.log(chalk.gray(`  1. .env 파일에 WATCH_DIR, UID, SERVICE_ACCOUNT_PATH 설정`))
  console.log(chalk.gray(`  2. 또는 CLI 옵션: --watch-dir <경로> --uid <UID>`))
  process.exit(1)
}

console.log(chalk.gray(`  UID:       ${config.uid}`))
console.log(chalk.gray(`  폴더:      ${config.watchDir}`))
console.log(chalk.gray(`  프로젝트:   ${config.projectId}`))

// Firebase 초기화
try {
  initFirebase()
  console.log(chalk.green(`  Firebase:  연결됨 ✓`))
} catch (err) {
  console.error(chalk.red(`❌ Firebase 초기화 실패: ${err.message}`))
  console.log(chalk.gray(`  서비스 계정 키 파일 경로를 확인하세요: ${config.serviceAccountPath}`))
  process.exit(1)
}

// 상태 로드
loadState()

// 감시 시작
const watcher = startWatcher()

// Graceful shutdown
process.on('SIGINT', () => {
  console.log(chalk.gray(`\n\n종료 중...`))
  saveState()
  watcher.close()
  process.exit(0)
})

process.on('SIGTERM', () => {
  saveState()
  watcher.close()
  process.exit(0)
})
