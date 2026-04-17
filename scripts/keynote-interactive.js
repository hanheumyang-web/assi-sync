#!/usr/bin/env node
// ASSI Sync — Keynote 인터랙티브 분류 프로토타입 (브라우저 테스트용)
// 사용법: node scripts/keynote-interactive.js "<path-to-.key>"
//   또는: node scripts/keynote-interactive.js --reuse <sessionId>  (추출 스킵)

const path = require('path')
const fs = require('fs')
const os = require('os')
const { parseKeynoteFile } = require('../lib/keynote-parser')
const { extractAllImages } = require('../lib/keynote-extractor')

async function main() {
  const args = process.argv.slice(2)
  let keyPath = null
  let reuseSessionId = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--reuse') reuseSessionId = args[++i]
    else keyPath = args[i]
  }

  let sessionDir, parsed, extracted

  if (reuseSessionId) {
    sessionDir = path.join(os.homedir(), '.assi-sync', 'keynote-preview', reuseSessionId)
    const dataFile = path.join(sessionDir, 'data.json')
    if (!fs.existsSync(dataFile)) {
      console.error('Reuse session not found or data.json missing:', sessionDir)
      process.exit(1)
    }
    const d = JSON.parse(fs.readFileSync(dataFile, 'utf8'))
    parsed = d.parsed; extracted = d.extracted
    console.log('♻️  Reusing session:', reuseSessionId)
  } else {
    if (!keyPath) { console.error('Usage: node scripts/keynote-interactive.js "<path-to-.key>"'); process.exit(1) }
    keyPath = path.resolve(keyPath)
    if (!fs.existsSync(keyPath)) { console.error('File not found:', keyPath); process.exit(1) }

    const sessionId = 'kn-' + Date.now()
    sessionDir = path.join(os.homedir(), '.assi-sync', 'keynote-preview', sessionId)
    fs.mkdirSync(sessionDir, { recursive: true })
    console.log('📂 Session:', sessionDir)

    console.log('🔍 Parsing...')
    const t0 = Date.now()
    parsed = await parseKeynoteFile(keyPath, (p) => {
      if (p.phase === 'scan-done') console.log(`  scan: iwa=${p.iwa} data=${p.data}`)
    })
    parsed.sourcePath = keyPath
    parsed.sourceName = path.basename(keyPath)
    console.log(`✅ Parsed in ${((Date.now() - t0) / 1000).toFixed(1)}s (slides=${parsed.slides.length}, images=${parsed.images.length}, groups=${parsed.groups.length})`)

    console.log('🖼️  Extracting images + thumbnails...')
    const t1 = Date.now()
    extracted = await extractAllImages(keyPath, parsed, sessionDir, (p) => {
      if (p.phase === 'extract' && p.done % 30 === 0) console.log(`  extract ${p.done}/${p.total}`)
    })
    console.log(`✅ Extracted ${extracted.length} images in ${((Date.now() - t1) / 1000).toFixed(1)}s`)

    // 세션 데이터 저장 (reuse용)
    fs.writeFileSync(path.join(sessionDir, 'data.json'), JSON.stringify({ parsed, extracted }, null, 2))
  }

  // 슬라이드 ↔ 이미지 매핑 정리 (UI에서 사용)
  const thumbMap = new Map()
  for (const ex of extracted) thumbMap.set(ex.fileName, ex.thumbPath || null)

  // 슬라이드 목록 (parser groups에서 slideIndex 기반으로 재구성)
  const slidesForUI = []
  const seenImages = new Set()
  // groups 중 slideIndex 있는 것만
  const slideGroups = parsed.groups.filter(g => g.slideIndex !== null && g.slideIndex !== undefined)
  // slideIndex 오름차순
  slideGroups.sort((a, b) => a.slideIndex - b.slideIndex)
  for (const sg of slideGroups) {
    const imageNames = sg.imageNames.filter(fn => !seenImages.has(fn))
    for (const fn of imageNames) seenImages.add(fn)
    slidesForUI.push({
      slideIndex: sg.slideIndex,
      autoTitle: sg.title,
      imageFileNames: imageNames,
    })
  }
  // 매핑 안 된 이미지들 — 별도 '__unmapped__' bucket
  const unmapped = parsed.images.filter(i => !seenImages.has(i.fileName)).map(i => i.fileName)

  // HTML + embedded data 생성
  const html = buildHtml({
    sourceName: parsed.sourceName || (keyPath ? path.basename(keyPath) : 'unknown.key'),
    parsedSummary: {
      slides: parsed.slides.length,
      images: parsed.images.length,
      groups: parsed.groups.length,
    },
    slides: slidesForUI,
    unmapped,
    thumbnails: Object.fromEntries(
      extracted
        .filter(ex => ex.thumbPath)
        .map(ex => [ex.fileName, toFileUrl(ex.thumbPath)])
    ),
  })

  const outPath = path.join(sessionDir, 'interactive.html')
  fs.writeFileSync(outPath, html)
  console.log('\n📄 Interactive HTML:')
  console.log('   ' + outPath)
  console.log('\n👉 브라우저에서 열기:')
  console.log('   ' + toFileUrl(outPath))
}

function toFileUrl(p) {
  return 'file:///' + p.replace(/\\/g, '/').replace(/ /g, '%20').replace(/#/g, '%23')
}

function buildHtml(data) {
  const json = JSON.stringify(data)
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>ASSI Sync — Keynote Import 프로토타입</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, 'Pretendard Variable', Pretendard, 'Apple SD Gothic Neo', sans-serif; background: #F4F3EE; color: #1a1a1a; min-height: 100vh; }
  header { background: #fff; padding: 14px 24px; border-bottom: 1px solid #eee; position: sticky; top: 0; z-index: 100; display: flex; align-items: center; gap: 20px; }
  header h1 { font-size: 15px; font-weight: 800; }
  header .stats { color: #666; font-size: 12px; display: flex; gap: 10px; margin-left: auto; }
  header .stats b { color: #828DF8; }
  .tabs { display: flex; gap: 0; background: #fff; border-bottom: 1px solid #eee; padding: 0 24px; position: sticky; top: 49px; z-index: 99; }
  .tab { padding: 12px 20px; font-size: 13px; font-weight: 700; border-bottom: 3px solid transparent; cursor: pointer; color: #999; transition: all 0.15s; }
  .tab.active { color: #828DF8; border-bottom-color: #828DF8; }
  .tab .badge { font-size: 10px; background: #F4F3EE; color: #666; padding: 2px 6px; border-radius: 10px; margin-left: 6px; }
  .tab.active .badge { background: #828DF8; color: #fff; }
  main { padding: 20px 24px; max-width: 1600px; margin: 0 auto; }

  /* ─── Phase 1: 슬라이드 박싱 (44장 그리드) ─── */
  .phase1-hint { background: #fff; border-left: 3px solid #828DF8; padding: 12px 16px; margin-bottom: 16px; font-size: 13px; color: #333; border-radius: 0 6px 6px 0; }
  .phase1-hint b { color: #828DF8; }
  .slides-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 18px; }
  .slide-card { background: #fff; border-radius: 6px; border: 2px solid #e4e4e4; overflow: hidden; cursor: pointer; transition: all 0.15s; position: relative; user-select: none; aspect-ratio: 16/10; display: flex; flex-direction: column; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
  .slide-card:hover { border-color: #cbc9f3; transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0,0,0,0.1); }
  .slide-card.is-title { border-color: #828DF8; box-shadow: 0 0 0 4px rgba(130,141,248,0.2), 0 6px 16px rgba(130,141,248,0.25); }
  .slide-card.is-title::before { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(130,141,248,0.08) 0%, rgba(130,141,248,0) 40%); pointer-events: none; z-index: 1; }
  .slide-card .slide-num { position: absolute; top: 8px; left: 8px; background: rgba(0,0,0,0.55); color: #fff; font-size: 10px; font-weight: 700; padding: 3px 7px; border-radius: 8px; z-index: 3; font-family: ui-monospace, monospace; }
  .slide-card .title-marker { position: absolute; top: 8px; right: 8px; background: #828DF8; color: #fff; font-size: 9px; font-weight: 800; padding: 4px 8px; border-radius: 10px; letter-spacing: 0.08em; z-index: 3; display: none; box-shadow: 0 2px 6px rgba(130,141,248,0.4); }
  .slide-card.is-title .title-marker { display: block; }
  .slide-card .slide-title { padding: 14px 16px 8px; text-align: center; font-size: 14px; font-weight: 700; color: #1a1a1a; line-height: 1.3; min-height: 38px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .slide-card .slide-title.empty { color: #c4c4c4; font-weight: 500; font-style: italic; }
  .slide-card .slide-body { flex: 1; padding: 4px 12px 12px; display: flex; gap: 6px; align-items: center; justify-content: center; overflow: hidden; min-height: 0; }
  .slide-card .slide-body.count-1 { padding: 4px 20px 12px; }
  .slide-card .slide-body img { max-width: 100%; max-height: 100%; border-radius: 2px; background: #f5f5f5; flex: 1 1 0; min-width: 0; height: 100%; object-fit: cover; }
  .slide-card .slide-body.count-1 img { object-fit: contain; }
  .slide-card .slide-body .more { font-size: 11px; color: #999; font-weight: 700; padding: 0 6px; font-family: ui-monospace, monospace; }
  .slide-card .slide-empty { flex: 1; display: flex; align-items: center; justify-content: center; color: #ccc; font-size: 11px; font-style: italic; }
  .phase1-footer { position: sticky; bottom: 0; background: #fff; border-top: 1px solid #eee; padding: 12px 24px; margin: 20px -24px -20px; display: flex; align-items: center; gap: 12px; }
  .projects-preview { flex: 1; font-size: 12px; color: #666; overflow-x: auto; white-space: nowrap; padding: 4px 0; }
  .projects-preview .proj { display: inline-block; background: #F4F3EE; color: #333; padding: 4px 10px; border-radius: 12px; margin-right: 6px; font-weight: 600; }
  .btn { padding: 10px 18px; background: #828DF8; color: #fff; border: none; border-radius: 6px; font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.15s; }
  .btn:hover { background: #6c76e0; }
  .btn.ghost { background: transparent; color: #828DF8; border: 1.5px solid #828DF8; }
  .btn.ghost:hover { background: #F4F3FF; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }

  /* ─── Phase 2: 카테고리 태깅 ─── */
  .phase2-wrap { display: grid; grid-template-columns: 1fr 360px; gap: 16px; }
  .projects-list { background: #fff; border-radius: 8px; padding: 14px; }
  .projects-list h3 { font-size: 13px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #828DF8; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 2px solid #F4F3EE; display: flex; justify-content: space-between; align-items: center; }
  .projects-list h3 .tools { font-size: 10px; font-weight: 600; }
  .projects-list h3 .tools button { background: transparent; border: none; color: #666; font-weight: 600; cursor: pointer; padding: 2px 6px; }
  .projects-list h3 .tools button:hover { color: #828DF8; }
  .project-card { background: #fafafa; border: 1.5px solid #eee; border-radius: 6px; margin-bottom: 8px; cursor: grab; transition: all 0.15s; }
  .project-card.selected { background: #F4F3FF; border-color: #828DF8; }
  .project-card .pc-main { display: flex; align-items: center; gap: 10px; padding: 8px 10px; }
  .project-card .pc-check { width: 16px; height: 16px; flex-shrink: 0; }
  .project-card .pc-thumb { width: 40px; height: 40px; border-radius: 4px; object-fit: cover; flex-shrink: 0; background: #eee; }
  .project-card .pc-info { flex: 1; min-width: 0; }
  .project-card .pc-title { font-size: 13px; font-weight: 700; color: #222; margin-bottom: 2px; }
  .project-card .pc-title input { border: none; background: transparent; font: inherit; color: inherit; width: 100%; outline: none; padding: 2px 4px; border-radius: 3px; }
  .project-card .pc-title input:focus { background: #fff; box-shadow: 0 0 0 1px #828DF8; }
  .project-card .pc-meta { font-size: 10px; color: #999; font-family: ui-monospace, monospace; }
  .project-card .pc-cat { font-size: 10px; color: #fff; background: #4ADE80; padding: 2px 6px; border-radius: 8px; font-weight: 700; letter-spacing: 0.05em; }
  .project-card .pc-cat.none { background: #ddd; color: #666; }
  .project-card .pc-expand { background: transparent; border: none; color: #999; cursor: pointer; padding: 4px 8px; font-size: 12px; }
  .project-card .pc-gallery { padding: 0 10px 10px 10px; display: none; }
  .project-card.expanded .pc-gallery { display: block; }
  .pc-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 6px; }
  .gallery-item { position: relative; aspect-ratio: 1/1; border-radius: 4px; overflow: hidden; cursor: pointer; border: 2px solid transparent; }
  .gallery-item.is-cover { border-color: #F4A259; }
  .gallery-item img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .gallery-item .star { position: absolute; top: 3px; right: 3px; width: 20px; height: 20px; background: rgba(0,0,0,0.6); color: #ffe066; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; }
  .gallery-item.is-cover .star { background: #F4A259; color: #fff; }

  .categories-panel { background: #fff; border-radius: 8px; padding: 14px; position: sticky; top: 110px; max-height: calc(100vh - 130px); overflow-y: auto; }
  .categories-panel h3 { font-size: 13px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #828DF8; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 2px solid #F4F3EE; }
  .cat-drop { background: #fafafa; border: 1.5px dashed #ddd; border-radius: 6px; padding: 12px; margin-bottom: 8px; text-align: center; font-size: 13px; font-weight: 700; transition: all 0.15s; }
  .cat-drop.drag-over { background: #F4F3FF; border-color: #828DF8; color: #828DF8; transform: scale(1.02); }
  .cat-drop .cat-count { font-size: 11px; color: #999; font-weight: 600; margin-top: 2px; }
  .cat-drop[data-category="AUDIO"] { border-color: #6366F1; }
  .cat-drop[data-category="BEAUTY"] { border-color: #EC4899; }
  .cat-drop[data-category="FASHION"] { border-color: #F59E0B; }
  .cat-drop[data-category="VIDEO"] { border-color: #0EA5E9; }
  .cat-drop[data-category="CELEBRITY"] { border-color: #8B5CF6; }
  .cat-drop[data-category="PERSONAL WORK"] { border-color: #10B981; }
  .action-bar { display: flex; gap: 8px; margin-top: 16px; padding-top: 16px; border-top: 1px solid #f0f0f0; }
  .action-bar .btn { flex: 1; }

  #toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #1a1a1a; color: #fff; padding: 12px 20px; border-radius: 24px; font-size: 13px; z-index: 1000; opacity: 0; pointer-events: none; transition: opacity 0.2s; }
  #toast.show { opacity: 1; }
</style>
</head>
<body>
<header>
  <h1>🎬 ASSI Sync — Keynote Import</h1>
  <div style="color:#888;font-size:13px;font-family:ui-monospace,monospace" id="file-name"></div>
  <div class="stats" id="stats"></div>
</header>
<div class="tabs">
  <div class="tab active" data-phase="1">1단계 · 슬라이드 박싱<span class="badge" id="tab1-badge"></span></div>
  <div class="tab" data-phase="2">2단계 · 카테고리 태깅<span class="badge" id="tab2-badge"></span></div>
</div>

<main>
  <section id="phase1">
    <div class="phase1-hint">
      <b>💡 프로젝트 구분하기</b> — 각 프로젝트의 <b>타이틀 슬라이드</b>를 클릭해서 표시하세요.<br>
      첫 타이틀 슬라이드부터 다음 타이틀 슬라이드 직전까지가 <b>하나의 프로젝트</b>로 묶입니다.
    </div>
    <div class="slides-grid" id="slides-grid"></div>
    <div class="phase1-footer">
      <div class="projects-preview" id="projects-preview"></div>
      <button class="btn ghost" id="btn-auto">자동 구간 제안</button>
      <button class="btn" id="btn-next">2단계로 →</button>
    </div>
  </section>

  <section id="phase2" style="display:none">
    <div class="phase2-wrap">
      <div class="projects-list">
        <h3>
          <span>프로젝트 <span id="project-count-text"></span></span>
          <div class="tools">
            <button id="btn-select-all">전체선택</button>
            <button id="btn-select-none">해제</button>
          </div>
        </h3>
        <div id="project-cards"></div>
      </div>
      <div class="categories-panel">
        <h3>카테고리로 드래그</h3>
        <div class="cat-drop" data-category="AUDIO">AUDIO <div class="cat-count" data-count="AUDIO">0개</div></div>
        <div class="cat-drop" data-category="BEAUTY">BEAUTY <div class="cat-count" data-count="BEAUTY">0개</div></div>
        <div class="cat-drop" data-category="FASHION">FASHION <div class="cat-count" data-count="FASHION">0개</div></div>
        <div class="cat-drop" data-category="VIDEO">VIDEO <div class="cat-count" data-count="VIDEO">0개</div></div>
        <div class="cat-drop" data-category="CELEBRITY">CELEBRITY <div class="cat-count" data-count="CELEBRITY">0개</div></div>
        <div class="cat-drop" data-category="PERSONAL WORK">PERSONAL WORK <div class="cat-count" data-count="PERSONAL WORK">0개</div></div>
        <div class="cat-drop" data-category="">(카테고리 없음) <div class="cat-count" data-count="">0개</div></div>
        <div class="action-bar">
          <button class="btn ghost" id="btn-back">← 1단계</button>
          <button class="btn" id="btn-export">결과 확인</button>
        </div>
      </div>
    </div>
  </section>
</main>
<div id="toast"></div>

<script>
const DATA = ${json};
const STATE = {
  phase: 1,
  titleSlides: new Set(), // slideIndex 들 (프로젝트 경계)
  projects: [],           // 1단계 결과 + 2단계 편집 상태
  selectedProjectIds: new Set(),
}

const el = s => document.querySelector(s)
const els = s => [...document.querySelectorAll(s)]
function toast(msg, ms=1800) {
  const t = el('#toast'); t.textContent = msg; t.classList.add('show')
  setTimeout(() => t.classList.remove('show'), ms)
}

// ─── 초기 렌더 ───
el('#file-name').textContent = DATA.sourceName
el('#stats').innerHTML = '슬라이드 <b>' + DATA.slides.length + '</b> 이미지 <b>' + (DATA.slides.reduce((s,x) => s + x.imageFileNames.length, 0) + DATA.unmapped.length) + '</b> 미매핑 <b>' + DATA.unmapped.length + '</b>'

// 초기 상태: 첫 슬라이드만 타이틀로 지정. 나머지는 사용자가 직접 "프로젝트로 설정" 버튼으로 마킹.
if (DATA.slides.length > 0) STATE.titleSlides.add(DATA.slides[0].slideIndex)
renderPhase1()
updateTabBadges()

els('.tab').forEach(t => t.addEventListener('click', () => switchPhase(Number(t.dataset.phase))))
el('#btn-next').addEventListener('click', () => {
  if (STATE.titleSlides.size === 0) { toast('최소 1개의 타이틀 슬라이드를 선택해주세요'); return }
  buildProjectsFromTitleSlides()
  switchPhase(2)
})
el('#btn-back').addEventListener('click', () => switchPhase(1))
el('#btn-auto').addEventListener('click', autoSuggestBoundaries)
el('#btn-export').addEventListener('click', exportResult)
el('#btn-select-all').addEventListener('click', () => { STATE.projects.forEach(p => STATE.selectedProjectIds.add(p.id)); renderPhase2() })
el('#btn-select-none').addEventListener('click', () => { STATE.selectedProjectIds.clear(); renderPhase2() })

function switchPhase(p) {
  STATE.phase = p
  els('.tab').forEach(t => t.classList.toggle('active', Number(t.dataset.phase) === p))
  el('#phase1').style.display = p === 1 ? '' : 'none'
  el('#phase2').style.display = p === 2 ? '' : 'none'
  if (p === 2) renderPhase2()
  updateTabBadges()
}

function updateTabBadges() {
  el('#tab1-badge').textContent = STATE.titleSlides.size + '개 경계'
  el('#tab2-badge').textContent = STATE.projects.length + '개 프로젝트'
}

// ─── Phase 1: 슬라이드 그리드 ───
function renderPhase1() {
  const grid = el('#slides-grid')
  grid.innerHTML = ''
  DATA.slides.forEach(s => {
    const card = document.createElement('div')
    card.className = 'slide-card' + (STATE.titleSlides.has(s.slideIndex) ? ' is-title' : '')
    card.dataset.slide = s.slideIndex
    const titleText = (s.autoTitle || '').trim()
    const isEmptyTitle = !titleText || /^슬라이드\s*\d+$/.test(titleText)
    const titleHtml = '<div class="slide-title' + (isEmptyTitle ? ' empty' : '') + '">' +
      (isEmptyTitle ? '(타이틀 없음)' : escapeHtml(titleText)) + '</div>'
    const imgs = s.imageFileNames.slice(0, 3)
    const remaining = s.imageFileNames.length - imgs.length
    let bodyHtml
    if (imgs.length === 0) bodyHtml = '<div class="slide-empty">이미지 없음</div>'
    else bodyHtml = '<div class="slide-body count-' + imgs.length + '">' +
      imgs.map(fn => {
        const t = DATA.thumbnails[fn]
        return t ? '<img src="' + t + '" loading="lazy">' : '<div style="flex:1;background:#f0f0f0;height:100%;border-radius:2px"></div>'
      }).join('') +
      (remaining > 0 ? '<div class="more">+' + remaining + '</div>' : '') +
      '</div>'
    card.innerHTML =
      '<div class="slide-num">' + (s.slideIndex + 1) + '</div>' +
      '<div class="title-marker">TITLE</div>' +
      titleHtml + bodyHtml
    card.addEventListener('click', () => toggleTitleSlide(s.slideIndex))
    grid.appendChild(card)
  })
  updateProjectsPreview()
}

function toggleTitleSlide(idx) {
  if (STATE.titleSlides.has(idx)) STATE.titleSlides.delete(idx)
  else STATE.titleSlides.add(idx)
  // 첫 슬라이드는 항상 타이틀 (제약)
  if (DATA.slides.length > 0) STATE.titleSlides.add(DATA.slides[0].slideIndex)
  renderPhase1()
  updateTabBadges()
}

function updateProjectsPreview() {
  const boundaries = [...STATE.titleSlides].sort((a,b)=>a-b)
  const preview = el('#projects-preview')
  if (boundaries.length === 0) { preview.innerHTML = '<span style="color:#aaa">타이틀 슬라이드를 선택하세요</span>'; return }
  const html = boundaries.map((b, i) => {
    const next = boundaries[i+1] ?? Infinity
    const slidesInProject = DATA.slides.filter(s => s.slideIndex >= b && s.slideIndex < next)
    const imgCount = slidesInProject.reduce((s,x) => s + x.imageFileNames.length, 0)
    return '<span class="proj">P' + (i+1) + ' · 슬라이드 ' + (b+1) + (slidesInProject.length > 1 ? '~' + (slidesInProject[slidesInProject.length-1].slideIndex + 1) : '') + ' · ' + imgCount + '장</span>'
  }).join('')
  preview.innerHTML = html
}

function autoSuggestBoundaries() {
  // 휴리스틱 (복합):
  //  1) 타이틀 텍스트가 "바로 앞 슬라이드와 다르면" = 새 프로젝트 시작
  //  2) 타이틀이 비어있거나 "슬라이드 N" 같은 자동 생성 이름은 무시 (이전 타이틀 유지)
  //  3) 이미지 0장 슬라이드도 타이틀 후보 (기존 로직 병합)
  STATE.titleSlides.clear()
  if (!DATA.slides.length) { renderPhase1(); updateTabBadges(); return }
  STATE.titleSlides.add(DATA.slides[0].slideIndex)
  const norm = t => (t || '').trim().replace(/\s+/g, ' ').toLowerCase()
  const isPlaceholder = t => !t || /^슬라이드\s*\d+$/i.test(t) || /^slide\s*\d+$/i.test(t)
  let lastEffectiveTitle = isPlaceholder(DATA.slides[0].autoTitle) ? '' : norm(DATA.slides[0].autoTitle)
  for (let i = 1; i < DATA.slides.length; i++) {
    const s = DATA.slides[i]
    const t = s.autoTitle || ''
    if (isPlaceholder(t)) continue // placeholder 는 이전 프로젝트 유지
    const n = norm(t)
    if (n !== lastEffectiveTitle) {
      STATE.titleSlides.add(s.slideIndex)
      lastEffectiveTitle = n
    }
  }
  // 타이틀 추출이 전혀 안된 파일 대비: 이미지 0장 슬라이드도 경계 후보로 보조 추가
  if (STATE.titleSlides.size <= 1) {
    DATA.slides.forEach(s => { if (s.imageFileNames.length === 0) STATE.titleSlides.add(s.slideIndex) })
  }
  renderPhase1()
  updateTabBadges()
  toast('타이틀 변화 지점 ' + STATE.titleSlides.size + '개를 자동 감지했습니다')
}

// ─── Phase 1 → Phase 2 변환 ───
function buildProjectsFromTitleSlides() {
  const boundaries = [...STATE.titleSlides].sort((a,b) => a-b)
  const projects = []
  for (let i = 0; i < boundaries.length; i++) {
    const start = boundaries[i]
    const end = boundaries[i+1] ?? Infinity
    const slideList = DATA.slides.filter(s => s.slideIndex >= start && s.slideIndex < end)
    if (slideList.length === 0) continue
    const imageFileNames = []
    for (const s of slideList) for (const fn of s.imageFileNames) imageFileNames.push(fn)
    const titleSlide = DATA.slides.find(s => s.slideIndex === start)
    projects.push({
      id: 'p-' + Math.random().toString(36).slice(2, 8),
      title: '프로젝트 ' + (i+1),
      category: null,
      imageFileNames,
      thumbnailFileName: imageFileNames[0] || null,
      slideStart: start,
      slideEnd: slideList[slideList.length - 1].slideIndex,
      expanded: false,
    })
  }
  // 미매핑 이미지 프로젝트
  if (DATA.unmapped.length > 0) {
    projects.push({
      id: 'p-unmapped',
      title: '미분류',
      category: null,
      imageFileNames: [...DATA.unmapped],
      thumbnailFileName: DATA.unmapped[0],
      slideStart: null, slideEnd: null, expanded: false,
    })
  }
  STATE.projects = projects
  STATE.selectedProjectIds = new Set()
}

// ─── Phase 2: 프로젝트 리스트 + 카테고리 드롭 ───
function renderPhase2() {
  el('#project-count-text').textContent = '(' + STATE.projects.length + ')'
  const cards = el('#project-cards')
  cards.innerHTML = ''
  STATE.projects.forEach((p, idx) => {
    const card = document.createElement('div')
    card.className = 'project-card' + (STATE.selectedProjectIds.has(p.id) ? ' selected' : '') + (p.expanded ? ' expanded' : '')
    card.draggable = true
    card.dataset.id = p.id
    const thumb = p.thumbnailFileName ? DATA.thumbnails[p.thumbnailFileName] : null
    const catClass = p.category ? '' : 'none'
    const catText = p.category || '미지정'
    card.innerHTML =
      '<div class="pc-main">' +
        '<input type="checkbox" class="pc-check" ' + (STATE.selectedProjectIds.has(p.id) ? 'checked' : '') + '>' +
        (thumb ? '<img class="pc-thumb" src="' + thumb + '">' : '<div class="pc-thumb"></div>') +
        '<div class="pc-info">' +
          '<div class="pc-title"><input type="text" value="' + escapeHtml(p.title) + '"></div>' +
          '<div class="pc-meta">' + p.imageFileNames.length + '장' + (p.slideStart !== null ? ' · 슬라이드 ' + (p.slideStart+1) + '~' + (p.slideEnd+1) : '') + '</div>' +
        '</div>' +
        '<span class="pc-cat ' + catClass + '">' + catText + '</span>' +
        '<button class="pc-expand">' + (p.expanded ? '▲' : '▼') + '</button>' +
      '</div>' +
      '<div class="pc-gallery">' +
        p.imageFileNames.map(fn => {
          const t = DATA.thumbnails[fn]
          const isCover = fn === p.thumbnailFileName
          return '<div class="gallery-item ' + (isCover ? 'is-cover' : '') + '" data-fn="' + escapeHtml(fn) + '">' +
            (t ? '<img src="' + t + '">' : '<div style="padding:10px;font-size:9px">' + escapeHtml(fn) + '</div>') +
            '<div class="star">★</div></div>'
        }).join('') +
      '</div>'
    // 이벤트
    card.querySelector('.pc-check').addEventListener('click', e => { e.stopPropagation(); toggleSelect(p.id) })
    card.querySelector('.pc-title input').addEventListener('click', e => e.stopPropagation())
    card.querySelector('.pc-title input').addEventListener('change', e => { p.title = e.target.value })
    card.querySelector('.pc-expand').addEventListener('click', e => { e.stopPropagation(); p.expanded = !p.expanded; renderPhase2() })
    card.querySelectorAll('.gallery-item').forEach(gi => {
      gi.addEventListener('click', e => {
        e.stopPropagation()
        const fn = gi.dataset.fn
        p.thumbnailFileName = (p.thumbnailFileName === fn) ? (p.imageFileNames[0] || null) : fn
        renderPhase2()
      })
    })
    card.addEventListener('dragstart', e => {
      if (!STATE.selectedProjectIds.has(p.id)) { STATE.selectedProjectIds.clear(); STATE.selectedProjectIds.add(p.id) }
      e.dataTransfer.setData('text/plain', JSON.stringify([...STATE.selectedProjectIds]))
      e.dataTransfer.effectAllowed = 'move'
    })
    card.addEventListener('click', () => toggleSelect(p.id))
    cards.appendChild(card)
  })
  // 카테고리 드롭존 이벤트
  els('.cat-drop').forEach(drop => {
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('drag-over') }
    drop.ondragleave = () => drop.classList.remove('drag-over')
    drop.ondrop = e => {
      e.preventDefault(); drop.classList.remove('drag-over')
      const ids = JSON.parse(e.dataTransfer.getData('text/plain') || '[]')
      const cat = drop.dataset.category || null
      ids.forEach(id => {
        const proj = STATE.projects.find(p => p.id === id)
        if (proj) proj.category = cat
      })
      STATE.selectedProjectIds.clear()
      renderPhase2()
      toast((cat || '미지정') + '로 ' + ids.length + '개 프로젝트 이동')
    }
  })
  updateCategoryCounts()
}

function toggleSelect(id) {
  if (STATE.selectedProjectIds.has(id)) STATE.selectedProjectIds.delete(id)
  else STATE.selectedProjectIds.add(id)
  renderPhase2()
}

function updateCategoryCounts() {
  const counts = {}
  STATE.projects.forEach(p => { const k = p.category || ''; counts[k] = (counts[k]||0)+1 })
  els('[data-count]').forEach(e => {
    const k = e.dataset.count
    e.textContent = (counts[k] || 0) + '개'
  })
}

function exportResult() {
  const payload = {
    sourceName: DATA.sourceName,
    exportedAt: new Date().toISOString(),
    projects: STATE.projects.map(p => ({
      title: p.title,
      category: p.category,
      imageCount: p.imageFileNames.length,
      thumbnailFileName: p.thumbnailFileName,
      imageFileNames: p.imageFileNames,
      slideRange: p.slideStart !== null ? { start: p.slideStart, end: p.slideEnd } : null,
    })),
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'keynote-classification.json'
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
  toast('JSON 다운로드 완료! 실제 파일 복사/업로드는 Electron 앱 완성 후')
}

function escapeHtml(s) { return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) }
</script>
</body>
</html>`
}

main().catch(e => { console.error('FAIL:', e); process.exit(1) })
