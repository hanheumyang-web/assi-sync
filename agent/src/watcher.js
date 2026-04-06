import chokidar from 'chokidar'
import chalk from 'chalk'
import { config } from './config.js'
import { isSupportedFile, isIgnoredFile } from './utils.js'
import { syncFile, unsyncFile } from './sync.js'

let queue = []
let processing = false

async function processQueue() {
  if (processing) return
  processing = true
  while (queue.length > 0) {
    const { type, path } = queue.shift()
    if (type === 'add') await syncFile(path)
    else if (type === 'unlink') await unsyncFile(path)
  }
  processing = false
}

function enqueue(type, path) {
  queue.push({ type, path })
  processQueue()
}

export function startWatcher({ onReady } = {}) {
  console.log(chalk.cyan(`\n👁  감시 폴더: ${config.watchDir}\n`))

  const watcher = chokidar.watch(config.watchDir, {
    persistent: true,
    ignoreInitial: false,
    depth: 5,
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 200,
    },
    ignored: (path, stats) => {
      const name = path.split(/[/\\]/).pop()
      return name.startsWith('.') || isIgnoredFile(name)
    },
  })

  let readyFired = false
  const initialFiles = []

  watcher.on('add', (path) => {
    if (!isSupportedFile(path)) return
    if (!readyFired) {
      initialFiles.push(path)
    } else {
      enqueue('add', path)
    }
  })

  watcher.on('unlink', (path) => {
    if (!isSupportedFile(path)) return
    enqueue('unlink', path)
  })

  watcher.on('ready', async () => {
    readyFired = true
    console.log(chalk.cyan(`📂 ${initialFiles.length}개 파일 발견\n`))

    // 초기 동기화
    for (const path of initialFiles) {
      await syncFile(path)
    }

    console.log(chalk.green(`\n✅ 초기 동기화 완료`))
    console.log(chalk.gray(`\n변경사항 감시 중... (Ctrl+C 종료)\n`))
    onReady?.()
  })

  watcher.on('error', (err) => {
    console.error(chalk.red(`Watcher error: ${err.message}`))
  })

  return watcher
}
