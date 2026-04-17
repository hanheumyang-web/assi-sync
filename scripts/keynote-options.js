#!/usr/bin/env node
// ASSI Sync — Keynote Import UX 3안 동시 프로토타입
// 사용법:
//   node scripts/keynote-options.js "<path-to-.key>"
//   node scripts/keynote-options.js --reuse <sessionId>
//
// 결과: 세션 디렉토리에 option-a.html / option-b.html / option-c.html 생성

const path = require('path')
const fs = require('fs')
const os = require('os')
const { parseKeynoteFile } = require('../lib/keynote-parser')
const { extractAllImages } = require('../lib/keynote-extractor')

async function main() {
  const args = process.argv.slice(2)
  let keyPath = null, reuseSessionId = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--reuse') reuseSessionId = args[++i]
    else keyPath = args[i]
  }

  let sessionDir, parsed, extracted
  if (reuseSessionId) {
    sessionDir = path.join(os.homedir(), '.assi-sync', 'keynote-preview', reuseSessionId)
    const dataFile = path.join(sessionDir, 'data.json')
    if (!fs.existsSync(dataFile)) { console.error('data.json missing:', sessionDir); process.exit(1) }
    const d = JSON.parse(fs.readFileSync(dataFile, 'utf8'))
    parsed = d.parsed; extracted = d.extracted
    console.log('♻️  Reusing:', reuseSessionId)
  } else {
    if (!keyPath) { console.error('Usage: node scripts/keynote-options.js "<path-to-.key>"'); process.exit(1) }
    keyPath = path.resolve(keyPath)
    const sessionId = 'kn-' + Date.now()
    sessionDir = path.join(os.homedir(), '.assi-sync', 'keynote-preview', sessionId)
    fs.mkdirSync(sessionDir, { recursive: true })
    console.log('📂', sessionDir)
    console.log('🔍 Parsing...')
    parsed = await parseKeynoteFile(keyPath)
    parsed.sourcePath = keyPath
    parsed.sourceName = path.basename(keyPath)
    console.log(`   slides=${parsed.slides.length} images=${parsed.images.length}`)
    console.log('🖼️  Extracting...')
    extracted = await extractAllImages(keyPath, parsed, sessionDir, p => {
      if (p.phase === 'extract' && p.done % 30 === 0) console.log(`   ${p.done}/${p.total}`)
    })
    fs.writeFileSync(path.join(sessionDir, 'data.json'), JSON.stringify({ parsed, extracted }, null, 2))
  }

  // 공통 데이터: 자동 감지된 프로젝트 + 이미지 썸네일
  const data = buildData(parsed, extracted)

  const writes = [
    ['option-a.html', buildOptionA(data)],
    ['option-b.html', buildOptionB(data)],
    ['option-c.html', buildOptionC(data)],
  ]
  for (const [name, html] of writes) {
    fs.writeFileSync(path.join(sessionDir, name), html)
  }

  console.log('\n📄 3안 프로토타입:')
  for (const [name] of writes) {
    const p = path.join(sessionDir, name)
    console.log(`   ${name}: ` + toFileUrl(p))
  }
}

function toFileUrl(p) { return 'file:///' + p.replace(/\\/g, '/').replace(/ /g, '%20').replace(/#/g, '%23') }

function buildData(parsed, extracted) {
  const thumbnails = {}
  for (const ex of extracted) if (ex.thumbPath) thumbnails[ex.fileName] = toFileUrl(ex.thumbPath)

  // 슬라이드 재구성 (중복 이미지 제거)
  const slidesForUI = []
  const seenImages = new Set()
  const slideGroups = parsed.groups.filter(g => g.slideIndex != null).sort((a,b) => a.slideIndex - b.slideIndex)
  for (const sg of slideGroups) {
    const imageNames = sg.imageNames.filter(fn => !seenImages.has(fn))
    for (const fn of imageNames) seenImages.add(fn)
    slidesForUI.push({ slideIndex: sg.slideIndex, title: sg.title, imageFileNames: imageNames })
  }
  const unmapped = parsed.images.filter(i => !seenImages.has(i.fileName)).map(i => i.fileName)

  // 자동 감지: 타이틀 변화 = 새 프로젝트
  const isPlaceholder = t => !t || /^슬라이드\s*\d+$/i.test(t) || /^slide\s*\d+$/i.test(t)
  const norm = t => (t || '').trim().replace(/\s+/g, ' ').toLowerCase()
  const projects = []
  let lastNorm = null
  let current = null
  for (const s of slidesForUI) {
    const placeholder = isPlaceholder(s.title)
    const n = placeholder ? null : norm(s.title)
    if (!current || (n && n !== lastNorm)) {
      current = { id: 'p-' + Math.random().toString(36).slice(2, 9), title: placeholder ? `프로젝트 ${projects.length + 1}` : s.title.trim(), category: null, imageFileNames: [], thumbnailFileName: null, slides: [], slideRefs: [] }
      projects.push(current)
      if (n) lastNorm = n
    }
    current.slides.push(s.slideIndex)
    current.slideRefs.push({ slideIndex: s.slideIndex, title: s.title, imageFileNames: s.imageFileNames })
    for (const fn of s.imageFileNames) current.imageFileNames.push(fn)
  }
  if (unmapped.length > 0) {
    projects.push({ id: 'p-unmapped', title: '미분류', category: null, imageFileNames: unmapped, thumbnailFileName: null, slides: [], slideRefs: [] })
  }

  return {
    sourceName: parsed.sourceName || 'unknown.key',
    totalSlides: slidesForUI.length,
    totalImages: slidesForUI.reduce((s,x)=>s+x.imageFileNames.length,0) + unmapped.length,
    slides: slidesForUI,
    projects,
    thumbnails,
  }
}

// ═══════════════════════════════════════════════════════════
// OPTION A — 한 화면 검수 (자동 감지 100% 신뢰, 틀린 것만 수정)
// ═══════════════════════════════════════════════════════════
function buildOptionA(data) {
  return baseHtml('A안 · 한 화면 검수', 'A', data, `
  <style>
    main { padding: 20px 28px; max-width: 900px; margin: 0 auto; }
    .intro { background: #fff; border-left: 3px solid #828DF8; padding: 14px 18px; border-radius: 0 6px 6px 0; margin-bottom: 20px; font-size: 13px; color: #333; }
    .intro b { color: #828DF8; }
    .proj-stack { display: flex; flex-direction: column; gap: 0; }
    .proj-item { background: #fff; border-radius: 8px; padding: 14px; border: 1.5px solid #e5e5e5; margin-bottom: 8px; }
    .proj-item.unmapped { background: #FFF8E6; border-color: #F4A259; }
    .proj-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
    .proj-head input.title { flex: 1; font-size: 15px; font-weight: 700; border: none; background: transparent; border-bottom: 1.5px dashed #ddd; padding: 4px 6px; outline: none; }
    .proj-head input.title:focus { border-color: #828DF8; background: #F4F3FF; }
    .proj-head select.cat { font-size: 12px; font-weight: 700; padding: 6px 10px; border-radius: 6px; border: 1.5px solid #ddd; background: #fff; cursor: pointer; }
    .proj-head select.cat[data-val=""] { color: #999; }
    .proj-head .slide-badge { font-size: 11px; color: #888; font-family: ui-monospace, monospace; white-space: nowrap; }
    .proj-slide-row { display: flex; gap: 10px; align-items: stretch; }
    .proj-slide-row .slides-wrap { display: flex; gap: 8px; flex: 1; overflow-x: auto; padding-bottom: 4px; }
    .proj-slide-row .slides-wrap > .kn-slide { flex: 0 0 220px; height: 138px; cursor: zoom-in; }
    .proj-slide-row .slides-wrap > .kn-slide:hover { box-shadow: 0 6px 14px rgba(130,141,248,0.25); transform: translateY(-2px); transition: all 0.15s; }
    .proj-slide-row .more-slides { flex: 0 0 auto; display: flex; align-items: center; justify-content: center; padding: 0 14px; background: #F4F3EE; border-radius: 4px; font-size: 12px; font-weight: 700; color: #666; cursor: pointer; }
    .proj-slide-row .more-slides:hover { background: #828DF8; color: #fff; }
    .proj-cover-row { margin-top: 10px; display: flex; gap: 5px; overflow-x: auto; padding: 6px 0 2px; border-top: 1px dashed #eee; }
    .proj-cover-row .lbl { font-size: 10px; color: #999; align-self: center; padding-right: 4px; white-space: nowrap; font-weight: 700; }
    .proj-cover-row img { height: 40px; width: 40px; object-fit: cover; border-radius: 3px; flex-shrink: 0; cursor: pointer; border: 2px solid transparent; }
    .proj-cover-row img.is-cover { border-color: #F4A259; box-shadow: 0 0 0 1px #F4A259; }
    .proj-cover-row img:hover { opacity: 0.85; }
    .proj-divider { display: flex; justify-content: center; padding: 2px 0; gap: 6px; }
    .proj-divider button { background: #fff; border: 1px solid #ddd; color: #666; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 12px; cursor: pointer; }
    .proj-divider button:hover { background: #F4F3EE; border-color: #828DF8; color: #828DF8; }
    .add-proj { background: transparent; border: 1.5px dashed #ccc; color: #999; padding: 12px; border-radius: 8px; width: 100%; cursor: pointer; font-weight: 700; font-size: 13px; margin-top: 8px; }
    .add-proj:hover { background: #fff; border-color: #828DF8; color: #828DF8; }
    .footer-bar { position: sticky; bottom: 0; background: #fff; border-top: 1px solid #eee; padding: 14px 24px; margin: 20px -28px -20px; display: flex; align-items: center; gap: 14px; }
    .footer-bar .stats { flex: 1; font-size: 13px; color: #666; }
    .footer-bar .stats b { color: #828DF8; }
  </style>
  <main>
    <div class="intro">
      <b>💡 자동 감지 완료</b> — 키노트 타이틀 변화를 기준으로 프로젝트 <b id="auto-n"></b>개가 자동 분할됐습니다.<br>
      제목 · 카테고리를 확인하고, 잘못 잘린 곳은 "이전과 합치기"로 수정하세요.
    </div>
    <div id="proj-stack" class="proj-stack"></div>
    <button class="add-proj" id="btn-add">+ 프로젝트 수동 추가</button>
    <div class="footer-bar">
      <div class="stats" id="stats"></div>
      <button class="btn" id="btn-export">확정 · JSON 내보내기</button>
    </div>
  </main>
  <script>
  const CATS = ['AUDIO','BEAUTY','FASHION','VIDEO','CELEBRITY','PERSONAL WORK']
  function render() {
    el('#auto-n').textContent = STATE.projects.length
    const stack = el('#proj-stack')
    stack.innerHTML = ''
    STATE.projects.forEach((p, idx) => {
      if (idx > 0) {
        const div = document.createElement('div')
        div.className = 'proj-divider'
        div.innerHTML = '<button data-i="' + idx + '" data-op="merge">↑ 위 프로젝트와 합치기</button>'
        stack.appendChild(div)
      }
      const item = document.createElement('div')
      item.className = 'proj-item' + (p.title === '미분류' ? ' unmapped' : '')
      const slides = (p.slideRefs || []).slice(0, 3)
      const extraSlides = (p.slideRefs || []).length - slides.length
      const slideCount = (p.slideRefs || []).length
      const coverImgs = p.imageFileNames.slice(0, 14)
      const remainingCover = p.imageFileNames.length - coverImgs.length
      item.innerHTML =
        '<div class="proj-head">' +
          '<input class="title" value="' + esc(p.title) + '" data-i="' + idx + '">' +
          '<span class="slide-badge">슬라이드 ' + slideCount + ' · 이미지 ' + p.imageFileNames.length + '</span>' +
          '<select class="cat" data-i="' + idx + '" data-val="' + (p.category || '') + '">' +
            '<option value="">카테고리 ▾</option>' +
            CATS.map(c => '<option value="' + c + '"' + (p.category === c ? ' selected' : '') + '>' + c + '</option>').join('') +
          '</select>' +
        '</div>' +
        '<div class="proj-slide-row">' +
          '<div class="slides-wrap" data-i="' + idx + '">' +
            slides.map(s => renderKnSlide(s, { showNum: true, maxImgs: 3 })).join('') +
          '</div>' +
          (extraSlides > 0 ? '<div class="more-slides" data-i="' + idx + '">+' + extraSlides + '장<br>전체보기</div>' : '') +
        '</div>' +
        '<div class="proj-cover-row">' +
          '<span class="lbl">커버 ★</span>' +
          coverImgs.map(fn => {
            const t = DATA.thumbnails[fn]
            const isCover = p.thumbnailFileName === fn || (!p.thumbnailFileName && fn === p.imageFileNames[0])
            return t ? '<img src="' + t + '" data-i="' + idx + '" data-fn="' + esc(fn) + '" class="' + (isCover ? 'is-cover' : '') + '">' : ''
          }).join('') +
          (remainingCover > 0 ? '<span class="lbl">+' + remainingCover + '</span>' : '') +
        '</div>'
      stack.appendChild(item)
    })
    // events
    stack.querySelectorAll('input.title').forEach(inp => inp.addEventListener('input', e => { STATE.projects[+e.target.dataset.i].title = e.target.value; updateStats() }))
    stack.querySelectorAll('select.cat').forEach(sel => sel.addEventListener('change', e => { STATE.projects[+e.target.dataset.i].category = e.target.value || null; updateStats() }))
    stack.querySelectorAll('[data-op="merge"]').forEach(btn => btn.addEventListener('click', e => mergeWithPrev(+e.target.dataset.i)))
    stack.querySelectorAll('.proj-cover-row img[data-fn]').forEach(img => img.addEventListener('click', e => { const i = +e.target.dataset.i; STATE.projects[i].thumbnailFileName = e.target.dataset.fn; render() }))
    stack.querySelectorAll('.slides-wrap .kn-slide').forEach((sl, _) => sl.addEventListener('click', e => {
      const wrap = sl.closest('.slides-wrap'); const i = +wrap.dataset.i; openSlideModal(STATE.projects[i])
    }))
    stack.querySelectorAll('.more-slides').forEach(b => b.addEventListener('click', e => openSlideModal(STATE.projects[+e.currentTarget.dataset.i])))
    updateStats()
  }
  function mergeWithPrev(i) {
    if (i <= 0) return
    const prev = STATE.projects[i-1], cur = STATE.projects[i]
    prev.imageFileNames = [...prev.imageFileNames, ...cur.imageFileNames]
    STATE.projects.splice(i, 1)
    render()
  }
  function updateStats() {
    const assigned = STATE.projects.filter(p => p.category).length
    el('#stats').innerHTML = '프로젝트 <b>' + STATE.projects.length + '</b> · 카테고리 배정 <b>' + assigned + '/' + STATE.projects.length + '</b>'
  }
  el('#btn-add').addEventListener('click', () => {
    STATE.projects.push({ id: 'p-' + Math.random().toString(36).slice(2,9), title: '새 프로젝트', category: null, imageFileNames: [], thumbnailFileName: null, slides: [] })
    render()
  })
  el('#btn-export').addEventListener('click', exportJson)
  render()
  </script>
  `)
}

// ═══════════════════════════════════════════════════════════
// OPTION B — 카테고리 탭 + 프로젝트 카드 (클릭 배정)
// ═══════════════════════════════════════════════════════════
function buildOptionB(data) {
  return baseHtml('B안 · 탭 배정식', 'B', data, `
  <style>
    main { padding: 0; }
    .cat-tabs { background: #fff; border-bottom: 1px solid #eee; padding: 0 24px; display: flex; gap: 2px; position: sticky; top: 49px; z-index: 50; overflow-x: auto; }
    .cat-tab { padding: 14px 18px; font-size: 13px; font-weight: 800; border-bottom: 3px solid transparent; cursor: pointer; color: #666; letter-spacing: 0.05em; white-space: nowrap; transition: all 0.15s; }
    .cat-tab:hover { color: #333; background: #fafafa; }
    .cat-tab.active { border-bottom-color: currentColor; }
    .cat-tab[data-cat="AUDIO"].active { color: #6366F1; }
    .cat-tab[data-cat="BEAUTY"].active { color: #EC4899; }
    .cat-tab[data-cat="FASHION"].active { color: #F59E0B; }
    .cat-tab[data-cat="VIDEO"].active { color: #0EA5E9; }
    .cat-tab[data-cat="CELEBRITY"].active { color: #8B5CF6; }
    .cat-tab[data-cat="PERSONAL WORK"].active { color: #10B981; }
    .cat-tab[data-cat=""].active { color: #999; }
    .cat-tab .cnt { background: #F4F3EE; color: #666; padding: 2px 7px; border-radius: 10px; font-size: 10px; font-weight: 700; margin-left: 6px; }
    .cat-tab.active .cnt { background: currentColor; color: #fff; }
    .hint { background: #F4F3EE; padding: 10px 24px; font-size: 12px; color: #666; border-bottom: 1px solid #eee; }
    .hint b { color: #828DF8; }
    .cards-grid { padding: 20px 24px; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
    .pcard { background: #fff; border-radius: 8px; overflow: hidden; border: 2px solid #eee; cursor: pointer; transition: all 0.15s; position: relative; }
    .pcard:hover { transform: translateY(-3px); box-shadow: 0 8px 20px rgba(0,0,0,0.08); border-color: #828DF8; }
    .pcard .pc-cover { position: relative; background: #eaeaea; padding: 10px; }
    .pcard .pc-cover .kn-slide { cursor: zoom-in; }
    .pcard .pc-cover .count-badge { position: absolute; top: 14px; right: 14px; background: rgba(0,0,0,0.7); color: #fff; padding: 3px 8px; border-radius: 10px; font-size: 10px; font-weight: 700; z-index: 2; }
    .pcard .pc-cover .cat-badge { position: absolute; bottom: 14px; left: 14px; background: #fff; color: #333; padding: 3px 8px; border-radius: 10px; font-size: 10px; font-weight: 800; letter-spacing: 0.05em; z-index: 2; }
    .pcard.assigned .pc-cover::after { content: '✓'; position: absolute; top: 14px; left: 14px; width: 24px; height: 24px; background: #828DF8; color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 900; z-index: 2; }
    .pcard .pc-slide-count { position: absolute; bottom: 14px; right: 14px; font-size: 10px; color: #666; background: rgba(255,255,255,0.9); padding: 2px 7px; border-radius: 10px; font-weight: 700; z-index: 2; }
    .pcard .pc-body { padding: 10px 12px; }
    .pcard input.title { border: none; background: transparent; font: 700 13px inherit; color: #222; width: 100%; outline: none; padding: 2px 0; }
    .pcard input.title:focus { background: #F4F3FF; }
    .pcard .pc-meta { font-size: 10px; color: #aaa; font-family: ui-monospace, monospace; margin-top: 2px; }
    .footer-bar { position: sticky; bottom: 0; background: #fff; border-top: 1px solid #eee; padding: 14px 24px; display: flex; align-items: center; gap: 14px; }
    .footer-bar .stats { flex: 1; font-size: 13px; color: #666; }
    .footer-bar .stats b { color: #828DF8; }
  </style>
  <main>
    <div class="cat-tabs" id="cat-tabs">
      <div class="cat-tab active" data-cat="__ALL__">전체 <span class="cnt" id="cnt-ALL">0</span></div>
      <div class="cat-tab" data-cat="">미배정 <span class="cnt" id="cnt-NONE">0</span></div>
      <div class="cat-tab" data-cat="AUDIO">AUDIO <span class="cnt" id="cnt-AUDIO">0</span></div>
      <div class="cat-tab" data-cat="BEAUTY">BEAUTY <span class="cnt" id="cnt-BEAUTY">0</span></div>
      <div class="cat-tab" data-cat="FASHION">FASHION <span class="cnt" id="cnt-FASHION">0</span></div>
      <div class="cat-tab" data-cat="VIDEO">VIDEO <span class="cnt" id="cnt-VIDEO">0</span></div>
      <div class="cat-tab" data-cat="CELEBRITY">CELEBRITY <span class="cnt" id="cnt-CELEBRITY">0</span></div>
      <div class="cat-tab" data-cat="PERSONAL WORK">PERSONAL WORK <span class="cnt" id="cnt-PW">0</span></div>
    </div>
    <div class="hint">
      <b>💡 사용법</b> — 위 탭에서 카테고리 선택 → 해당 카테고리에 넣을 프로젝트 카드를 <b>클릭</b>해서 배정.
      "전체"에서는 모든 카드가 보이고, 각 카테고리 탭에서는 이미 배정된 카드만 필터링.
    </div>
    <div class="cards-grid" id="cards-grid"></div>
    <div class="footer-bar">
      <div class="stats" id="stats"></div>
      <button class="btn" id="btn-export">확정 · JSON 내보내기</button>
    </div>
  </main>
  <script>
  const CATS = ['AUDIO','BEAUTY','FASHION','VIDEO','CELEBRITY','PERSONAL WORK']
  let activeTab = '__ALL__'
  function render() {
    const grid = el('#cards-grid')
    grid.innerHTML = ''
    const filter = activeTab === '__ALL__' ? () => true : p => (p.category || '') === activeTab
    STATE.projects.filter(filter).forEach(p => {
      const firstSlide = (p.slideRefs && p.slideRefs[0]) || { slideIndex: 0, title: p.title, imageFileNames: p.imageFileNames.slice(0, 3) }
      const card = document.createElement('div')
      card.className = 'pcard' + (p.category ? ' assigned' : '')
      card.innerHTML =
        '<div class="pc-cover">' +
          renderKnSlide(firstSlide, { showNum: true, maxImgs: 3 }) +
          '<div class="count-badge">' + p.imageFileNames.length + '장</div>' +
          (p.category ? '<div class="cat-badge">' + p.category + '</div>' : '') +
          ((p.slideRefs && p.slideRefs.length > 1) ? '<div class="pc-slide-count">+' + (p.slideRefs.length - 1) + ' 슬라이드</div>' : '') +
        '</div>' +
        '<div class="pc-body">' +
          '<input class="title" value="' + esc(p.title) + '" data-id="' + p.id + '">' +
          '<div class="pc-meta">' + (p.slides.length ? '슬라이드 ' + (p.slides[0]+1) + (p.slides.length>1?'~'+(p.slides[p.slides.length-1]+1):'') : '수동 추가') + '</div>' +
        '</div>'
      // 슬라이드 프리뷰 클릭 → 전체 슬라이드 모달
      card.querySelector('.kn-slide').addEventListener('click', e => { e.stopPropagation(); openSlideModal(p) })
      card.addEventListener('click', e => {
        if (e.target.tagName === 'INPUT') return
        if (activeTab === '__ALL__') {
          toast('카테고리 탭 선택 후 카드를 클릭하세요')
          return
        }
        p.category = activeTab || null
        render()
      })
      card.querySelector('input.title').addEventListener('input', e => { p.title = e.target.value; updateCounts() })
      grid.appendChild(card)
    })
    updateCounts()
  }
  function updateCounts() {
    el('#cnt-ALL').textContent = STATE.projects.length
    el('#cnt-NONE').textContent = STATE.projects.filter(p => !p.category).length
    for (const c of CATS) {
      const id = c === 'PERSONAL WORK' ? 'cnt-PW' : 'cnt-' + c
      el('#' + id).textContent = STATE.projects.filter(p => p.category === c).length
    }
    const assigned = STATE.projects.filter(p => p.category).length
    el('#stats').innerHTML = '카테고리 배정 <b>' + assigned + '/' + STATE.projects.length + '</b>'
  }
  els('.cat-tab').forEach(t => t.addEventListener('click', () => {
    activeTab = t.dataset.cat
    els('.cat-tab').forEach(x => x.classList.toggle('active', x === t))
    render()
  }))
  el('#btn-export').addEventListener('click', exportJson)
  render()
  </script>
  `)
}

// ═══════════════════════════════════════════════════════════
// OPTION C — Finder식 트리 + 그리드
// ═══════════════════════════════════════════════════════════
function buildOptionC(data) {
  return baseHtml('C안 · Finder식 폴더 뷰', 'C', data, `
  <style>
    main { padding: 0; height: calc(100vh - 80px); }
    .finder { display: grid; grid-template-columns: 280px 1fr; height: 100%; background: #fff; }
    .fside { background: #F7F6F2; border-right: 1px solid #ddd; overflow-y: auto; padding: 10px 6px; font-size: 13px; }
    .fside .cat-group { margin-bottom: 6px; }
    .fside .cat-head { padding: 6px 10px; font-weight: 800; font-size: 11px; letter-spacing: 0.1em; color: #999; text-transform: uppercase; display: flex; justify-content: space-between; }
    .fside .node { padding: 6px 10px 6px 22px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; gap: 6px; color: #333; user-select: none; }
    .fside .node:hover { background: #eeebe4; }
    .fside .node.active { background: #828DF8; color: #fff; }
    .fside .node.active .cnt { color: rgba(255,255,255,0.7); }
    .fside .node.drag-over { background: #F4A259; color: #fff; }
    .fside .node .icon { font-size: 14px; }
    .fside .node .label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
    .fside .node .label input { border: none; background: transparent; font: inherit; color: inherit; width: 100%; outline: none; }
    .fside .node .cnt { font-size: 10px; color: #aaa; font-family: ui-monospace, monospace; }
    .fside .cat-folder { padding: 6px 10px; border-radius: 4px; cursor: pointer; font-weight: 700; color: #222; margin-top: 2px; display: flex; align-items: center; gap: 6px; }
    .fside .cat-folder:hover { background: #eeebe4; }
    .fside .cat-folder.drag-over { background: #F4A259; color: #fff; }
    .fside .cat-folder[data-cat="AUDIO"] .dot { background: #6366F1; }
    .fside .cat-folder[data-cat="BEAUTY"] .dot { background: #EC4899; }
    .fside .cat-folder[data-cat="FASHION"] .dot { background: #F59E0B; }
    .fside .cat-folder[data-cat="VIDEO"] .dot { background: #0EA5E9; }
    .fside .cat-folder[data-cat="CELEBRITY"] .dot { background: #8B5CF6; }
    .fside .cat-folder[data-cat="PERSONAL WORK"] .dot { background: #10B981; }
    .fside .dot { width: 10px; height: 10px; border-radius: 50%; background: #ccc; }
    .fside .add-proj-btn { margin: 8px 10px; padding: 6px; font-size: 12px; color: #828DF8; background: transparent; border: 1px dashed #cbc9f3; border-radius: 4px; width: calc(100% - 20px); cursor: pointer; font-weight: 700; }
    .fside .add-proj-btn:hover { background: #F4F3FF; }
    .fmain { display: flex; flex-direction: column; overflow: hidden; }
    .fmain .toolbar { padding: 12px 20px; border-bottom: 1px solid #eee; display: flex; align-items: center; gap: 10px; background: #fff; }
    .fmain .toolbar .path { flex: 1; font-size: 14px; font-weight: 700; color: #333; }
    .fmain .toolbar .path input { border: none; font: inherit; background: transparent; outline: none; padding: 4px 8px; border-radius: 4px; width: 100%; max-width: 400px; }
    .fmain .toolbar .path input:focus { background: #F4F3EE; }
    .fmain .toolbar select.cat { font-size: 12px; font-weight: 700; padding: 6px 10px; border-radius: 6px; border: 1.5px solid #ddd; cursor: pointer; }
    .fmain .view-toggle { display: flex; background: #f0efea; border-radius: 6px; padding: 2px; }
    .fmain .view-toggle button { background: transparent; border: none; font-size: 11px; font-weight: 700; padding: 5px 10px; border-radius: 4px; cursor: pointer; color: #666; }
    .fmain .view-toggle button.active { background: #fff; color: #222; box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
    .fmain .grid { flex: 1; padding: 16px 20px; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; align-content: start; }
    .fmain .grid.slides-view { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
    .fmain .grid.empty { justify-content: center; align-items: center; display: flex; color: #bbb; font-style: italic; }
    .imgcard { aspect-ratio: 1; border-radius: 4px; overflow: hidden; position: relative; cursor: grab; border: 2px solid transparent; background: #f0f0f0; }
    .imgcard:hover { border-color: #828DF8; }
    .imgcard.selected { border-color: #F4A259; box-shadow: 0 0 0 1px #F4A259; }
    .imgcard img { width: 100%; height: 100%; object-fit: cover; pointer-events: none; }
    .imgcard .cover-star { position: absolute; top: 4px; right: 4px; background: rgba(0,0,0,0.5); color: #fff; border: none; border-radius: 50%; width: 22px; height: 22px; cursor: pointer; font-size: 11px; }
    .imgcard.is-cover .cover-star { background: #F4A259; color: #fff; }
    .footer-bar { background: #fff; border-top: 1px solid #eee; padding: 10px 20px; display: flex; align-items: center; gap: 14px; }
    .footer-bar .stats { flex: 1; font-size: 12px; color: #666; }
    .footer-bar .stats b { color: #828DF8; }
  </style>
  <main>
    <div class="finder">
      <aside class="fside" id="fside"></aside>
      <section class="fmain">
        <div class="toolbar" id="toolbar"></div>
        <div class="grid" id="fgrid"></div>
        <div class="footer-bar">
          <div class="stats" id="stats"></div>
          <button class="btn" id="btn-export">확정 · JSON 내보내기</button>
        </div>
      </section>
    </div>
  </main>
  <script>
  const CATS = ['AUDIO','BEAUTY','FASHION','VIDEO','CELEBRITY','PERSONAL WORK']
  let activeProjId = STATE.projects[0]?.id || null
  let selectedImages = new Set() // fileNames
  let viewMode = 'images' // 'images' | 'slides'

  function renderSide() {
    const side = el('#fside')
    side.innerHTML = ''
    // 미배정 그룹
    const unassigned = STATE.projects.filter(p => !p.category)
    if (unassigned.length) {
      const g = document.createElement('div'); g.className = 'cat-group'
      g.innerHTML = '<div class="cat-head"><span>📥 미배정</span><span>' + unassigned.length + '</span></div>'
      unassigned.forEach(p => g.appendChild(makeProjectNode(p)))
      side.appendChild(g)
    }
    // 카테고리별
    for (const c of CATS) {
      const ps = STATE.projects.filter(p => p.category === c)
      const g = document.createElement('div'); g.className = 'cat-group'
      const head = document.createElement('div'); head.className = 'cat-folder'; head.dataset.cat = c
      head.innerHTML = '<span class="dot"></span>' + c + '<span style="margin-left:auto;font-size:10px;color:#aaa;font-family:ui-monospace,monospace">' + ps.length + '</span>'
      // 프로젝트 카드 드롭 → 카테고리 이동
      head.addEventListener('dragover', e => { e.preventDefault(); head.classList.add('drag-over') })
      head.addEventListener('dragleave', () => head.classList.remove('drag-over'))
      head.addEventListener('drop', e => {
        e.preventDefault(); head.classList.remove('drag-over')
        const data = e.dataTransfer.getData('text/plain')
        if (data.startsWith('proj:')) {
          const pid = data.slice(5)
          const proj = STATE.projects.find(p => p.id === pid)
          if (proj) { proj.category = c; renderAll() }
        }
      })
      g.appendChild(head)
      ps.forEach(p => g.appendChild(makeProjectNode(p)))
      side.appendChild(g)
    }
    const add = document.createElement('button')
    add.className = 'add-proj-btn'; add.textContent = '+ 새 프로젝트 폴더'
    add.addEventListener('click', () => {
      const np = { id: 'p-' + Math.random().toString(36).slice(2,9), title: '새 프로젝트', category: null, imageFileNames: [], thumbnailFileName: null, slides: [] }
      STATE.projects.push(np); activeProjId = np.id; renderAll()
    })
    side.appendChild(add)
  }
  function makeProjectNode(p) {
    const node = document.createElement('div')
    node.className = 'node' + (p.id === activeProjId ? ' active' : '')
    node.draggable = true
    node.innerHTML = '<span class="icon">📁</span><span class="label">' + esc(p.title) + '</span><span class="cnt">' + p.imageFileNames.length + '</span>'
    node.addEventListener('click', () => { activeProjId = p.id; selectedImages.clear(); renderAll() })
    node.addEventListener('dragstart', e => e.dataTransfer.setData('text/plain', 'proj:' + p.id))
    // 이미지 드롭 → 이 프로젝트로 이동
    node.addEventListener('dragover', e => { e.preventDefault(); node.classList.add('drag-over') })
    node.addEventListener('dragleave', () => node.classList.remove('drag-over'))
    node.addEventListener('drop', e => {
      e.preventDefault(); node.classList.remove('drag-over')
      const data = e.dataTransfer.getData('text/plain')
      if (data.startsWith('imgs:')) {
        const fns = data.slice(5).split('|')
        moveImagesTo(fns, p.id)
      }
    })
    return node
  }
  function moveImagesTo(fileNames, targetPid) {
    const target = STATE.projects.find(p => p.id === targetPid)
    if (!target) return
    for (const fn of fileNames) {
      for (const p of STATE.projects) {
        const i = p.imageFileNames.indexOf(fn)
        if (i >= 0 && p.id !== targetPid) {
          p.imageFileNames.splice(i, 1)
          target.imageFileNames.push(fn)
        }
      }
    }
    selectedImages.clear()
    renderAll()
  }

  function renderMain() {
    const p = STATE.projects.find(x => x.id === activeProjId)
    const tb = el('#toolbar'); const grid = el('#fgrid')
    if (!p) { tb.innerHTML = ''; grid.innerHTML = '<div style="color:#bbb">프로젝트를 선택하세요</div>'; return }
    tb.innerHTML =
      '<div class="path">📁 ' + (p.category || '미배정') + ' / <input id="title-in" value="' + esc(p.title) + '"></div>' +
      '<div class="view-toggle">' +
        '<button id="vt-img" class="' + (viewMode === 'images' ? 'active' : '') + '">이미지</button>' +
        '<button id="vt-sld" class="' + (viewMode === 'slides' ? 'active' : '') + '">슬라이드</button>' +
      '</div>' +
      '<select class="cat" id="cat-sel">' +
        '<option value="">미배정</option>' +
        CATS.map(c => '<option value="' + c + '"' + (p.category === c ? ' selected' : '') + '>' + c + '</option>').join('') +
      '</select>' +
      '<button class="btn ghost" id="btn-del-proj" style="padding:6px 12px">삭제</button>'
    el('#title-in').addEventListener('input', e => { p.title = e.target.value; renderSide() })
    el('#cat-sel').addEventListener('change', e => { p.category = e.target.value || null; renderAll() })
    el('#vt-img').addEventListener('click', () => { viewMode = 'images'; renderMain() })
    el('#vt-sld').addEventListener('click', () => { viewMode = 'slides'; renderMain() })
    el('#btn-del-proj').addEventListener('click', () => {
      if (p.imageFileNames.length > 0) { if (!confirm('이미지 ' + p.imageFileNames.length + '장이 삭제됩니다')) return }
      STATE.projects = STATE.projects.filter(x => x.id !== p.id)
      activeProjId = STATE.projects[0]?.id || null
      renderAll()
    })
    // 슬라이드 뷰 모드
    if (viewMode === 'slides') {
      grid.className = 'grid slides-view' + ((!p.slideRefs || p.slideRefs.length === 0) ? ' empty' : '')
      if (!p.slideRefs || p.slideRefs.length === 0) { grid.innerHTML = '(슬라이드 정보 없음 — 수동 추가된 프로젝트입니다)'; return }
      grid.innerHTML = p.slideRefs.map(s => renderKnSlide(s, { showNum: true, maxImgs: 4 })).join('')
      return
    }
    grid.className = 'grid' + (p.imageFileNames.length === 0 ? ' empty' : '')
    if (p.imageFileNames.length === 0) { grid.innerHTML = '(빈 프로젝트 — 다른 폴더에서 이미지를 드래그해 오세요)'; return }
    grid.innerHTML = ''
    p.imageFileNames.forEach(fn => {
      const t = DATA.thumbnails[fn]
      const card = document.createElement('div')
      const isCover = p.thumbnailFileName === fn || (!p.thumbnailFileName && fn === p.imageFileNames[0])
      card.className = 'imgcard' + (selectedImages.has(fn) ? ' selected' : '') + (isCover ? ' is-cover' : '')
      card.draggable = true
      card.innerHTML = (t ? '<img src="' + t + '">' : '') +
        '<button class="cover-star" title="커버">★</button>'
      card.addEventListener('click', e => {
        if (e.target.classList.contains('cover-star')) { e.stopPropagation(); p.thumbnailFileName = fn; renderMain(); return }
        if (e.shiftKey || e.metaKey || e.ctrlKey) {
          if (selectedImages.has(fn)) selectedImages.delete(fn); else selectedImages.add(fn)
        } else {
          selectedImages.clear(); selectedImages.add(fn)
        }
        renderMain()
      })
      card.addEventListener('dragstart', e => {
        if (!selectedImages.has(fn)) { selectedImages.clear(); selectedImages.add(fn); renderMain() }
        e.dataTransfer.setData('text/plain', 'imgs:' + [...selectedImages].join('|'))
      })
      grid.appendChild(card)
    })
  }
  function renderAll() { renderSide(); renderMain(); updateStats() }
  function updateStats() {
    const assigned = STATE.projects.filter(p => p.category && p.imageFileNames.length > 0).length
    const total = STATE.projects.filter(p => p.imageFileNames.length > 0).length
    el('#stats').innerHTML = '프로젝트 <b>' + total + '</b> · 카테고리 배정 <b>' + assigned + '/' + total + '</b>'
  }
  el('#btn-export').addEventListener('click', exportJson)
  renderAll()
  </script>
  `)
}

// ═══════════════════════════════════════════════════════════
// 공통 베이스 HTML (STATE / exportJson / toast / header)
// ═══════════════════════════════════════════════════════════
function baseHtml(title, tag, data, bodyContent) {
  const json = JSON.stringify(data)
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<title>ASSI Sync — ${title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, 'Pretendard Variable', Pretendard, 'Apple SD Gothic Neo', sans-serif; background: #F4F3EE; color: #1a1a1a; min-height: 100vh; }
  header { background: #1a1a1a; color: #fff; padding: 12px 24px; display: flex; align-items: center; gap: 14px; position: sticky; top: 0; z-index: 100; }
  header h1 { font-size: 14px; font-weight: 800; }
  header .tag { background: #828DF8; color: #fff; font-size: 11px; font-weight: 900; padding: 3px 10px; border-radius: 10px; letter-spacing: 0.1em; }
  header .file { color: #aaa; font-size: 12px; font-family: ui-monospace, monospace; }
  header .switch { margin-left: auto; display: flex; gap: 4px; }
  header .switch a { color: #bbb; background: #2a2a2a; padding: 4px 10px; font-size: 11px; font-weight: 700; border-radius: 4px; text-decoration: none; }
  header .switch a:hover { background: #828DF8; color: #fff; }
  header .switch a.active { background: #F4A259; color: #fff; }
  .btn { padding: 9px 18px; background: #828DF8; color: #fff; border: none; border-radius: 6px; font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.15s; }
  .btn:hover { background: #6c76e0; }
  .btn.ghost { background: transparent; color: #828DF8; border: 1.5px solid #828DF8; }
  #toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #1a1a1a; color: #fff; padding: 12px 20px; border-radius: 24px; font-size: 13px; z-index: 1000; opacity: 0; pointer-events: none; transition: opacity 0.2s; }
  #toast.show { opacity: 1; }

  /* ─── 공통 키노트 슬라이드 렌더 ─── */
  .kn-slide { background: #fff; border-radius: 3px; aspect-ratio: 16/10; display: flex; flex-direction: column; position: relative; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border: 1px solid #e4e4e4; }
  .kn-slide .kn-st { padding: 8% 6% 4%; text-align: center; font-weight: 700; color: #1a1a1a; line-height: 1.2; font-size: clamp(10px, 2.6vw, 18px); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .kn-slide .kn-st.empty { color: #c4c4c4; font-style: italic; font-weight: 500; }
  .kn-slide .kn-sb { flex: 1; padding: 0 6% 6%; display: flex; gap: 3%; align-items: center; justify-content: center; min-height: 0; }
  .kn-slide .kn-sb.c1 img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .kn-slide .kn-sb img { flex: 1 1 0; min-width: 0; height: 100%; object-fit: cover; border-radius: 1px; }
  .kn-slide .kn-se { flex: 1; display: flex; align-items: center; justify-content: center; color: #ddd; font-size: 10px; font-style: italic; }
  .kn-slide .kn-sn { position: absolute; top: 3px; left: 3px; font-size: 8px; color: #888; font-family: ui-monospace, monospace; background: rgba(255,255,255,0.8); padding: 1px 4px; border-radius: 2px; }

  /* 슬라이드 미리보기 모달 */
  .slide-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 500; display: none; align-items: center; justify-content: center; padding: 40px; }
  .slide-modal.show { display: flex; }
  .slide-modal .sm-box { background: #222; border-radius: 10px; width: 100%; max-width: 1100px; max-height: 92vh; display: flex; flex-direction: column; overflow: hidden; }
  .slide-modal .sm-head { display: flex; align-items: center; gap: 14px; padding: 14px 20px; background: #1a1a1a; color: #fff; }
  .slide-modal .sm-head h3 { flex: 1; font-size: 14px; font-weight: 700; }
  .slide-modal .sm-head .sm-close { background: #333; color: #ccc; border: none; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; font-size: 16px; }
  .slide-modal .sm-body { flex: 1; overflow-y: auto; padding: 20px; display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
  .slide-modal .sm-body .kn-slide { box-shadow: 0 8px 24px rgba(0,0,0,0.5); border: none; }
</style>
</head>
<body>
<header>
  <span class="tag">${tag}안</span>
  <h1>${title}</h1>
  <span class="file">${esc(data.sourceName)} · 슬라이드 ${data.totalSlides} · 이미지 ${data.totalImages}</span>
  <span class="switch">
    <a href="option-a.html"${tag==='A'?' class="active"':''}>A</a>
    <a href="option-b.html"${tag==='B'?' class="active"':''}>B</a>
    <a href="option-c.html"${tag==='C'?' class="active"':''}>C</a>
  </span>
</header>
<div class="slide-modal" id="slide-modal">
  <div class="sm-box">
    <div class="sm-head">
      <h3 id="sm-title"></h3>
      <button class="sm-close" id="sm-close">✕</button>
    </div>
    <div class="sm-body" id="sm-body"></div>
  </div>
</div>
<div id="toast"></div>
<script>
const DATA = ${json};
const STATE = { projects: JSON.parse(JSON.stringify(DATA.projects)) };
const el = s => document.querySelector(s)
const els = s => [...document.querySelectorAll(s)]
function esc(s) { return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) }
function toast(msg, ms=1800) { const t=el('#toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), ms) }
function isPlaceholderTitle(t) { return !t || /^슬라이드\\s*\\d+$/i.test(t) || /^slide\\s*\\d+$/i.test(t) }
function renderKnSlide(s, opts) {
  opts = opts || {}
  const placeholder = isPlaceholderTitle(s.title)
  const imgs = (s.imageFileNames || []).slice(0, opts.maxImgs || 4)
  const remaining = (s.imageFileNames || []).length - imgs.length
  let body
  if (imgs.length === 0) body = '<div class="kn-se">이미지 없음</div>'
  else body = '<div class="kn-sb c' + imgs.length + '">' +
    imgs.map(fn => { const t = DATA.thumbnails[fn]; return t ? '<img src="' + t + '">' : '<div style="flex:1;background:#eee;height:100%"></div>' }).join('') +
    (remaining > 0 ? '<div style="font-size:10px;color:#999;font-weight:700;padding:0 4px">+' + remaining + '</div>' : '') + '</div>'
  return '<div class="kn-slide">' +
    (opts.showNum ? '<div class="kn-sn">' + (s.slideIndex + 1) + '</div>' : '') +
    '<div class="kn-st' + (placeholder ? ' empty' : '') + '">' + (placeholder ? '(타이틀 없음)' : esc(s.title)) + '</div>' +
    body + '</div>'
}
function openSlideModal(project) {
  el('#sm-title').textContent = project.title + ' — 슬라이드 ' + (project.slideRefs || []).length + '장'
  el('#sm-body').innerHTML = (project.slideRefs || []).map(s => renderKnSlide(s, { showNum: true, maxImgs: 4 })).join('')
  el('#slide-modal').classList.add('show')
}
function exportJson() {
  const out = { sourceName: DATA.sourceName, projects: STATE.projects.filter(p=>p.imageFileNames.length>0).map((p,i)=>({
    title: p.title, category: p.category, order: i, thumbnailFileName: p.thumbnailFileName || p.imageFileNames[0], imageFileNames: p.imageFileNames
  })) }
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'classification.json'; a.click()
  toast('JSON 내보내기 완료 (' + out.projects.length + '개 프로젝트)')
}
document.addEventListener('DOMContentLoaded', () => {
  el('#sm-close').addEventListener('click', () => el('#slide-modal').classList.remove('show'))
  el('#slide-modal').addEventListener('click', e => { if (e.target.id === 'slide-modal') el('#slide-modal').classList.remove('show') })
  document.addEventListener('keydown', e => { if (e.key === 'Escape') el('#slide-modal').classList.remove('show') })
})
</script>
${bodyContent}
</body></html>`
}

function esc(s) { return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) }

main().catch(e => { console.error('FAIL:', e); process.exit(1) })
