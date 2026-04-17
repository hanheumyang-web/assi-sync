#!/usr/bin/env node
// ASSI — CTO 전용 원스톱 Keynote 변환 + 인수인계 zip 생성
//
// V1 베타 단계: 프로덕션에 키노트 기능 미노출. 테스터가 .key 만 있는 경우
// CTO 가 이 스크립트로 한 번에 처리해 zip 을 넘겨주는 화이트-글러브 서비스.
//
// 사용:
//   $env:ANTHROPIC_API_KEY="sk-ant-..."
//   node scripts/keynote-handoff.js "<path.key>" --tester "홍길동"
//
// 산출물:
//   ~/Desktop/ASSI-handoff/<testerName>-<yymmdd>/
//     ├ BEAUTY/
//     │   ├ Dalba/*.jpg
//     │   └ KUNDAL/*.jpg
//     ├ FASHION/
//     └ ...
//     └ README.txt  (테스터 안내문)
//
// 이후 CTO 는 이 폴더를 zip 해서 테스터에게 전달 →
//   테스터는 압축 해제 → ASSI Sync 앱에서 해당 폴더 선택 → 자동 업로드.

const fs = require('fs')
const path = require('path')
const os = require('os')
const { parseKeynoteFile } = require('../lib/keynote-parser')
const { extractAllImages } = require('../lib/keynote-extractor')
const { classifyWithClaude } = require('../lib/keynote-ai')
const { applyClassification } = require('../lib/local-foldering')
const { buildReviewHtml } = require('./keynote-ai-classify')

async function main() {
  const args = process.argv.slice(2)
  let keyPath = null, testerName = null, autoConfirm = false
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--tester') testerName = args[++i]
    else if (args[i] === '--yes' || args[i] === '-y') autoConfirm = true
    else keyPath = args[i]
  }
  if (!keyPath) {
    console.error('Usage: node scripts/keynote-handoff.js "<path.key>" --tester "<이름>"')
    process.exit(1)
  }
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) { console.error('❌ ANTHROPIC_API_KEY 환경변수 필요'); process.exit(1) }

  keyPath = path.resolve(keyPath)
  if (!fs.existsSync(keyPath)) { console.error('파일 없음:', keyPath); process.exit(1) }
  testerName = testerName || path.basename(keyPath, '.key').replace(/\s+/g, '_')

  const today = new Date().toISOString().slice(2, 10).replace(/-/g, '')
  const sessionId = 'kn-handoff-' + Date.now()
  const sessionDir = path.join(os.homedir(), '.assi-sync', 'keynote-preview', sessionId)
  fs.mkdirSync(sessionDir, { recursive: true })

  console.log(`\n🧪 테스터: ${testerName}`)
  console.log(`📂 세션:   ${sessionDir}\n`)

  // 1) 파싱
  console.log('🔍 파싱 중...')
  const t0 = Date.now()
  const parsed = await parseKeynoteFile(keyPath, p => {
    if (p.phase === 'scan-done') console.log(`   scan: iwa=${p.iwa} data=${p.data}`)
  })
  parsed.sourcePath = keyPath; parsed.sourceName = path.basename(keyPath)
  console.log(`✅ 파싱 ${((Date.now() - t0)/1000).toFixed(1)}s · 슬라이드 ${parsed.slides.length} · 이미지 ${parsed.images.length}\n`)

  // 2) 추출
  console.log('🖼️  이미지 추출 중...')
  const t1 = Date.now()
  const extracted = await extractAllImages(keyPath, parsed, sessionDir, p => {
    if (p.phase === 'extract' && p.done % 30 === 0) console.log(`   ${p.done}/${p.total}`)
  })
  console.log(`✅ 추출 ${((Date.now() - t1)/1000).toFixed(1)}s · ${extracted.length}장\n`)

  // 3) orderedImages 조립
  const seen = new Set()
  const orderedImages = []
  const metaByFn = new Map()
  for (const ex of extracted) metaByFn.set(ex.fileName, ex)
  const slideGroups = parsed.groups.filter(g => g.slideIndex != null).sort((a,b)=>a.slideIndex-b.slideIndex)
  for (const sg of slideGroups) {
    let pos = 0
    for (const fn of sg.imageNames) {
      if (seen.has(fn)) continue
      seen.add(fn)
      const m = metaByFn.get(fn)
      if (!m?.thumbPath) continue
      orderedImages.push({
        fileName: fn, slideIndex: sg.slideIndex, slideTitle: (sg.title||'').trim(),
        textTokens: sg.textTokens||[], positionInSlide: pos++,
        extractedPath: m.extractedPath, thumbPath: m.thumbPath,
      })
    }
  }
  for (const ex of extracted) {
    if (!seen.has(ex.fileName) && ex.thumbPath) {
      orderedImages.push({ fileName: ex.fileName, slideIndex: -1, slideTitle: '', textTokens: [], positionInSlide: 0, extractedPath: ex.extractedPath, thumbPath: ex.thumbPath })
    }
  }

  // 4) Claude 분류
  console.log('🤖 Claude 분류 중...')
  const t2 = Date.now()
  const ai = await classifyWithClaude({
    apiKey, images: orderedImages,
    onProgress: p => { if (p.phase === 'claude' && p.status === 'done') console.log(`   완료 · in=${p.usage?.input_tokens} out=${p.usage?.output_tokens}`) },
  })
  console.log(`✅ 분류 ${((Date.now() - t2)/1000).toFixed(1)}s · 프로젝트 ${ai.projects.length}개 (overview 제외 ${ai.excludedOverview.length}개)\n`)

  // 5) 리뷰 HTML 생성 + 오픈
  const toFileUrl = p => 'file:///' + p.replace(/\\/g, '/').replace(/ /g, '%20').replace(/#/g, '%23')
  const imagesByFn = {}
  for (const im of orderedImages) imagesByFn[im.fileName] = { slideIndex: im.slideIndex, slideTitle: im.slideTitle, thumbUrl: toFileUrl(im.thumbPath) }
  const reviewData = {
    sessionId, sourceName: parsed.sourceName, totalImages: orderedImages.length,
    imagesByFn, projects: ai.projects, modelTag: 'claude-sonnet-4',
  }
  const reviewHtml = path.join(sessionDir, 'review.html')
  fs.writeFileSync(reviewHtml, buildReviewHtml(reviewData))

  console.log('📄 리뷰 HTML 생성:')
  console.log(`   ${toFileUrl(reviewHtml)}`)
  console.log('')
  console.log('👉 다음 단계:')
  console.log('   1) 위 링크 브라우저에서 열고 분류 검수')
  console.log('   2) "확정 · JSON 내보내기" 클릭 → classification.json 다운로드')
  console.log(`   3) 다음 명령 실행:`)
  console.log(`      node scripts/keynote-handoff.js --apply "<classification.json 경로>" --session ${sessionId} --tester "${testerName}"`)
  console.log('')
  console.log(`   OR 검수 없이 AI 결과 그대로 진행하려면:`)
  console.log(`      node scripts/keynote-handoff.js --apply-auto --session ${sessionId} --tester "${testerName}"`)

  // 세션 메타 저장 (후속 apply 에서 참조)
  fs.writeFileSync(path.join(sessionDir, 'handoff-meta.json'), JSON.stringify({
    sessionId, testerName, today, sourceName: parsed.sourceName,
    aiClassification: { projects: ai.projects },
    imageMeta: Object.fromEntries(orderedImages.map(i => [i.fileName, { extractedPath: i.extractedPath }])),
  }, null, 2))
}

// ─── apply 모드: 폴더 생성 + zip (선택) ────────────────
async function applyMode() {
  const args = process.argv.slice(2)
  let classificationPath = null, sessionId = null, testerName = null, autoMode = false
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--apply') classificationPath = args[++i]
    else if (args[i] === '--apply-auto') autoMode = true
    else if (args[i] === '--session') sessionId = args[++i]
    else if (args[i] === '--tester') testerName = args[++i]
  }
  if (!sessionId) { console.error('--session 필요'); process.exit(1) }
  const sessionDir = path.join(os.homedir(), '.assi-sync', 'keynote-preview', sessionId)
  const metaPath = path.join(sessionDir, 'handoff-meta.json')
  if (!fs.existsSync(metaPath)) { console.error('handoff-meta.json 없음:', metaPath); process.exit(1) }
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
  testerName = testerName || meta.testerName

  let classification
  if (autoMode) {
    classification = meta.aiClassification
    console.log('🤖 AI 분류 그대로 사용')
  } else {
    if (!classificationPath || !fs.existsSync(classificationPath)) { console.error('classification.json 경로 필요'); process.exit(1) }
    classification = JSON.parse(fs.readFileSync(classificationPath, 'utf8'))
    console.log('📝 사용자 검수본 사용')
  }

  // 출력 폴더
  const today = new Date().toISOString().slice(2, 10).replace(/-/g, '')
  const outDir = path.join(os.homedir(), 'Desktop', 'ASSI-handoff', `${testerName}-${today}`)
  fs.mkdirSync(outDir, { recursive: true })

  const imageMeta = new Map(Object.entries(meta.imageMeta))
  console.log(`\n📁 출력: ${outDir}`)
  const r = await applyClassification({
    sessionDir, watchDir: outDir, classification, imageMeta,
    onProgress: p => { if (p.phase === 'copy' && p.done % 10 === 0) console.log(`   copy ${p.done}/${p.total}`) },
  })

  // README
  const readme = `ASSI Sync 테스트용 포트폴리오 폴더
====================================

테스터: ${testerName}
원본:   ${meta.sourceName}
생성일: ${today}

${r.projectsCreated}개 프로젝트 · ${r.filesCopied}장 이미지

▶ 사용법
1. ASSI Sync 데스크톱 앱 설치 (assifolio.com 에서 다운로드)
2. 구글 로그인
3. 이 폴더(${path.basename(outDir)})를 ASSI Sync 에 연결
4. 자동으로 웹 포트폴리오가 만들어집니다!

문의: hanheumyang@gmail.com
`
  fs.writeFileSync(path.join(outDir, 'README.txt'), readme)

  console.log(`\n✅ 완료!`)
  console.log(`   ${r.projectsCreated}개 프로젝트 · ${r.filesCopied}장 복사됨`)
  console.log(`   ${outDir}`)
  console.log(`\n👉 이제 이 폴더를 zip 해서 테스터에게 전달하세요.`)
}

const isApply = process.argv.some(a => a === '--apply' || a === '--apply-auto')
;(isApply ? applyMode : main)().catch(e => { console.error('FAIL:', e); process.exit(1) })
