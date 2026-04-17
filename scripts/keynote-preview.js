#!/usr/bin/env node
// ASSI Sync — Keynote 파싱 결과 미리보기 도구
// 사용법: node scripts/keynote-preview.js "<path-to-.key>"
// 결과: ~/.assi-sync/keynote-preview/<sessionId>/preview.html 생성 후 경로 출력

const path = require('path')
const fs = require('fs')
const os = require('os')
const { parseKeynoteFile } = require('../lib/keynote-parser')
const { extractAllImages } = require('../lib/keynote-extractor')

async function main() {
  const arg = process.argv[2]
  if (!arg) {
    console.error('Usage: node scripts/keynote-preview.js "<path-to-.key>"')
    process.exit(1)
  }
  const keyPath = path.resolve(arg)
  if (!fs.existsSync(keyPath)) {
    console.error('File not found:', keyPath)
    process.exit(1)
  }

  const sessionId = 'kn-' + Date.now()
  const sessionDir = path.join(os.homedir(), '.assi-sync', 'keynote-preview', sessionId)
  fs.mkdirSync(sessionDir, { recursive: true })

  console.log('📂 Session:', sessionDir)
  console.log('🔍 Parsing...')
  const t0 = Date.now()
  const parsed = await parseKeynoteFile(keyPath, (p) => {
    if (p.phase === 'scan-done') console.log(`  scan: iwa=${p.iwa} data=${p.data}`)
    if (p.phase === 'parsing-iwa' && p.done % 20 === 0) console.log(`  iwa ${p.done}/${p.total}`)
  })
  console.log(`✅ Parsed in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  console.log(`   mode=${parsed.mode} slides=${parsed.slides.length} images=${parsed.images.length} groups=${parsed.groups.length}`)

  console.log('🖼️  Extracting images + thumbnails...')
  const t1 = Date.now()
  const extracted = await extractAllImages(keyPath, parsed, sessionDir, (p) => {
    if (p.phase === 'extract' && p.done % 30 === 0) console.log(`  extract ${p.done}/${p.total}`)
  })
  console.log(`✅ Extracted ${extracted.length} images in ${((Date.now() - t1) / 1000).toFixed(1)}s`)

  // 파일명 → 추출 메타 맵
  const metaByName = new Map(extracted.map(e => [e.fileName, e]))

  // 좌: 그룹별 분류 / 우: Data/ 전체 (원본 순서)
  const html = buildHtml(parsed, extracted, metaByName, keyPath)
  const outPath = path.join(sessionDir, 'preview.html')
  fs.writeFileSync(outPath, html)
  console.log('\n📄 Preview HTML generated:')
  console.log('   ' + outPath)
  console.log('\n👉 아래 링크를 브라우저에서 열어주세요 (Ctrl+클릭 or 복사):')
  console.log('   file:///' + outPath.replace(/\\/g, '/'))
}

function toFileUrl(p) {
  if (!p) return ''
  return 'file:///' + p.replace(/\\/g, '/').replace(/ /g, '%20').replace(/#/g, '%23')
}

function buildHtml(parsed, extracted, metaByName, keyPath) {
  const groupsHtml = parsed.groups.map((g, i) => {
    const cards = g.imageNames.map(fn => {
      const meta = metaByName.get(fn)
      const thumb = meta?.thumbPath ? toFileUrl(meta.thumbPath) : ''
      return `<div class="card">
        ${thumb ? `<img src="${thumb}" loading="lazy" alt="${fn}">` : `<div class="no-thumb">${escape(fn)}</div>`}
        <div class="card-name">${escape(fn)}</div>
      </div>`
    }).join('')
    const confBadge = g.titleConfidence === 'high' ? '🟢' : g.titleConfidence === 'low' ? '🟡' : '⚪'
    return `<section class="group">
      <h3>${confBadge} <span class="g-title">${escape(g.title)}</span> <span class="g-count">${g.imageNames.length}장</span></h3>
      <div class="cards">${cards}</div>
    </section>`
  }).join('')

  const allFilesHtml = extracted.map(ex => {
    const thumb = ex.thumbPath ? toFileUrl(ex.thumbPath) : ''
    return `<div class="card">
      ${thumb ? `<img src="${thumb}" loading="lazy" alt="${ex.fileName}">` : `<div class="no-thumb">${escape(ex.fileName)}</div>`}
      <div class="card-name">${escape(ex.fileName)}</div>
    </div>`
  }).join('')

  const mapped = parsed.groups.filter(g => g.slideIndex !== null).reduce((s, g) => s + g.imageNames.length, 0)
  const unmapped = (parsed.groups.find(g => g.title === '미분류')?.imageNames.length) || 0

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>Keynote Preview — ${escape(path.basename(keyPath))}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, 'Pretendard Variable', Pretendard, 'Apple SD Gothic Neo', sans-serif; background: #F4F3EE; color: #1a1a1a; }
  header { background: #fff; padding: 16px 24px; border-bottom: 1px solid #eee; position: sticky; top: 0; z-index: 10; }
  header h1 { font-size: 18px; font-weight: 800; }
  header .stats { color: #666; font-size: 13px; margin-top: 4px; display: flex; gap: 12px; flex-wrap: wrap; }
  header .stats b { color: #828DF8; }
  .pane-wrap { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: #ddd; min-height: calc(100vh - 80px); }
  .pane { background: #fff; padding: 20px 24px; overflow-y: auto; max-height: calc(100vh - 80px); }
  .pane h2 { font-size: 14px; font-weight: 800; letter-spacing: 0.15em; text-transform: uppercase; color: #828DF8; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid #828DF8; position: sticky; top: 0; background: #fff; z-index: 2; }
  .group { margin-bottom: 24px; }
  .group h3 { font-size: 14px; font-weight: 700; margin-bottom: 10px; display: flex; gap: 8px; align-items: center; }
  .group h3 .g-title { flex: 1; }
  .group h3 .g-count { font-size: 11px; color: #999; background: #F4F3EE; padding: 2px 8px; border-radius: 10px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 8px; }
  .card { background: #fafafa; border-radius: 6px; overflow: hidden; border: 1px solid #eee; }
  .card img { width: 100%; height: 110px; object-fit: cover; display: block; }
  .card .no-thumb { height: 110px; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #999; padding: 4px; text-align: center; word-break: break-all; }
  .card-name { font-size: 9px; padding: 4px 6px; color: #666; border-top: 1px solid #eee; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ui-monospace, monospace; }
  .legend { display: inline-flex; gap: 10px; font-size: 11px; color: #666; }
  .legend span { display: inline-flex; align-items: center; gap: 4px; }
</style>
</head>
<body>
<header>
  <h1>📊 Keynote Preview — ${escape(path.basename(keyPath))}</h1>
  <div class="stats">
    <span>모드: <b>${parsed.mode}</b></span>
    <span>슬라이드 <b>${parsed.slides.length}</b></span>
    <span>이미지 <b>${parsed.images.length}</b></span>
    <span>그룹 <b>${parsed.groups.length}</b></span>
    <span>매핑됨 <b>${mapped}</b></span>
    <span>미분류 <b>${unmapped}</b></span>
  </div>
  <div class="legend" style="margin-top:6px">
    <span>🟢 사용자 입력 타이틀</span>
    <span>🟡 슬라이드 템플릿 이름</span>
    <span>⚪ 자동 생성 ("슬라이드 N" / "미분류")</span>
  </div>
</header>
<div class="pane-wrap">
  <div class="pane">
    <h2>🗂️ ASSI 분류 결과 (슬라이드별)</h2>
    ${groupsHtml}
  </div>
  <div class="pane">
    <h2>📁 원본 Data/ 폴더 전체 이미지</h2>
    <div class="cards">${allFilesHtml}</div>
  </div>
</div>
</body>
</html>`
}

function escape(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
}

main().catch(e => { console.error('FAIL:', e); process.exit(1) })
