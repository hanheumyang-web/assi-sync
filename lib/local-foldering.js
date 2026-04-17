// ASSI Sync — 분류 확정 결과를 watchDir 하위 폴더로 물리 생성
//
// 입력: classification = { projects: [{ title, category, imageFileNames, thumbnailFileName? }] }
//       sessionDir = extracted/ 이미지가 있는 임시 세션 디렉토리
//       watchDir = 사용자 동기화 루트
//
// 출력: watchDir/{CATEGORY}/{projectName}/ 폴더 생성 + 원본 이미지 복사
// 주의: 파일명 충돌, 금지문자, 동일 프로젝트 중복 처리

const fs = require('fs')
const path = require('path')

const FORBIDDEN_WIN = /[<>:"/\\|?*\x00-\x1F]/g
const TRAIL_DOT_SPACE = /[.\s]+$/

function sanitizeFolderName(name) {
  if (!name) return '미분류'
  const s = String(name).replace(FORBIDDEN_WIN, '_').replace(TRAIL_DOT_SPACE, '').trim()
  return s || '미분류'
}

async function copyFileNoOverwrite(src, destDir, desiredName) {
  const base = desiredName.replace(/\.[^.]+$/, '')
  const ext = (desiredName.match(/\.[^.]+$/) || [''])[0]
  let candidate = path.join(destDir, desiredName)
  let i = 2
  while (fs.existsSync(candidate)) {
    // 이미 같은 이름 존재 시 (이전 동기화 결과 등) → 스킵
    const srcStat = fs.statSync(src)
    const dstStat = fs.statSync(candidate)
    if (srcStat.size === dstStat.size) return { path: candidate, skipped: true }
    candidate = path.join(destDir, `${base} (${i})${ext}`)
    i++
  }
  await fs.promises.copyFile(src, candidate)
  return { path: candidate, skipped: false }
}

/**
 * @param {object} args
 * @param {string} args.sessionDir
 * @param {string} args.watchDir
 * @param {object} args.classification — { projects: [...] }
 * @param {Map<string, {extractedPath}>} args.imageMeta — fileName → meta
 * @param {'merge'|'suffix'} args.onDuplicateProject  기본 'merge'
 * @param {(progress)=>void} args.onProgress
 */
async function applyClassification({ sessionDir, watchDir, classification, imageMeta, onDuplicateProject = 'merge', onProgress }) {
  if (!fs.existsSync(watchDir)) throw new Error('watchDir 이 존재하지 않습니다: ' + watchDir)
  const projects = (classification?.projects || []).filter(p => (p.imageFileNames || []).length > 0)

  const results = []
  let totalFiles = projects.reduce((s, p) => s + p.imageFileNames.length, 0)
  let done = 0

  for (const proj of projects) {
    const cat = sanitizeFolderName(proj.category || '미분류')
    const title = sanitizeFolderName(proj.title || '프로젝트')
    const catDir = path.join(watchDir, cat)
    let projDir = path.join(catDir, title)

    // 중복 프로젝트 처리
    if (fs.existsSync(projDir) && onDuplicateProject === 'suffix') {
      let i = 2
      while (fs.existsSync(`${projDir} (${i})`)) i++
      projDir = `${projDir} (${i})`
    }
    fs.mkdirSync(projDir, { recursive: true })

    // 이미지 복사
    const copied = []
    for (const fn of proj.imageFileNames) {
      const meta = imageMeta.get(fn)
      if (!meta || !meta.extractedPath || !fs.existsSync(meta.extractedPath)) {
        onProgress?.({ phase: 'copy', done: ++done, total: totalFiles, warn: `${fn} not found` })
        continue
      }
      // finalName = HEIC 변환된 경우 .jpg 버전
      const destName = path.basename(meta.extractedPath)
      try {
        const r = await copyFileNoOverwrite(meta.extractedPath, projDir, destName)
        copied.push({ src: meta.extractedPath, dst: r.path, skipped: r.skipped })
      } catch (e) {
        console.warn('[LocalFoldering] copy fail', fn, e.message)
      }
      done++
      if (done % 5 === 0 || done === totalFiles) {
        onProgress?.({ phase: 'copy', done, total: totalFiles })
      }
    }

    results.push({
      title: proj.title,
      category: proj.category,
      projectDir: projDir,
      filesCopied: copied.length,
    })
  }

  return {
    ok: true,
    watchDir,
    projectsCreated: results.length,
    filesCopied: results.reduce((s, r) => s + r.filesCopied, 0),
    projects: results,
  }
}

module.exports = { applyClassification, sanitizeFolderName }
