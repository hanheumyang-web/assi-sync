#!/usr/bin/env node
// ASSI Sync — Gemini Vision 이미지 단위 프로젝트 분류
// Claude 버전과 동일한 작업이지만, Gemini 는 한 요청에 훨씬 많은 이미지를 받을 수 있음
// → 타일링 없이 개별 풀 썸네일 전송 가능

const fs = require('fs')
const path = require('path')
const os = require('os')
const sharp = require('sharp')

const API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
const MODEL = 'gemini-2.5-flash' // 빠르고 저렴. 필요시 gemini-2.5-pro 로 교체
const THUMB_SIZE = 300
const CATEGORIES = ['AUDIO', 'BEAUTY', 'FASHION', 'VIDEO', 'CELEBRITY', 'PERSONAL WORK']

async function main() {
  const args = process.argv.slice(2)
  let reuseSessionId = null
  let useProModel = false
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--reuse') reuseSessionId = args[++i]
    else if (args[i] === '--pro') useProModel = true
  }
  if (!API_KEY) { console.error('❌ GEMINI_API_KEY 환경변수 필요'); process.exit(1) }
  if (!reuseSessionId) { console.error('Usage: ... --reuse <sessionId> [--pro]'); process.exit(1) }

  const model = useProModel ? 'gemini-2.5-pro' : MODEL
  const sessionDir = path.join(os.homedir(), '.assi-sync', 'keynote-preview', reuseSessionId)
  const dataFile = path.join(sessionDir, 'data.json')
  if (!fs.existsSync(dataFile)) { console.error('data.json not found'); process.exit(1) }
  const { parsed, extracted } = JSON.parse(fs.readFileSync(dataFile, 'utf8'))

  // 이미지 순서대로 수집
  const seen = new Set()
  const orderedImages = []
  const slideGroups = parsed.groups
    .filter(g => g.slideIndex != null)
    .sort((a, b) => a.slideIndex - b.slideIndex)
  const metaByFn = new Map()
  for (const ex of extracted) metaByFn.set(ex.fileName, ex)
  for (const sg of slideGroups) {
    let pos = 0
    for (const fn of sg.imageNames) {
      if (seen.has(fn)) continue
      seen.add(fn)
      const meta = metaByFn.get(fn)
      if (!meta || !meta.thumbPath) continue
      orderedImages.push({
        fileName: fn, slideIndex: sg.slideIndex, slideTitle: (sg.title || '').trim(),
        positionInSlide: pos++, extractedPath: meta.extractedPath, thumbPath: meta.thumbPath,
      })
    }
  }
  for (const ex of extracted) {
    if (!seen.has(ex.fileName) && ex.thumbPath) {
      orderedImages.push({ fileName: ex.fileName, slideIndex: -1, slideTitle: '', positionInSlide: 0, extractedPath: ex.extractedPath, thumbPath: ex.thumbPath })
    }
  }

  console.log(`📂 Session: ${reuseSessionId} · ${orderedImages.length}장 (모델: ${model})`)
  console.log('🖼️  인코딩 중...')

  // Gemini 는 inlineData(base64) 여러 개를 parts 로 한 번에 받을 수 있음
  const parts = []
  parts.push({ text: buildPrompt(orderedImages) })
  for (let i = 0; i < orderedImages.length; i++) {
    const im = orderedImages[i]
    try {
      const buf = fs.readFileSync(im.thumbPath)
      const resized = await sharp(buf).resize(THUMB_SIZE, THUMB_SIZE, { fit: 'inside' }).jpeg({ quality: 72 }).toBuffer()
      parts.push({ text: `[#${i}] 슬라이드${im.slideIndex + 1} pos${im.positionInSlide} title="${im.slideTitle}"` })
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: resized.toString('base64') } })
    } catch (e) { console.warn(`  skip #${i}:`, e.message) }
    if ((i + 1) % 40 === 0) console.log(`   ${i + 1}/${orderedImages.length}`)
  }
  const kb = Math.round(JSON.stringify(parts).length / 1024)
  console.log(`🤖 Gemini 호출 (${parts.filter(p=>p.inlineData).length}장, payload ~${kb}KB)...`)

  const t0 = Date.now()
  const { result, rawJson } = await callGemini(model, parts)
  const dt = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`✅ 응답 (${dt}s)`)

  // 결과 검증 & 정규화
  const projects = validateAndNormalize(result.projects, orderedImages)

  // 썸네일 URL 맵
  const thumbUrlByFn = {}
  for (const ex of extracted) if (ex.thumbPath) thumbUrlByFn[ex.fileName] = toFileUrl(ex.thumbPath)

  const outJson = path.join(sessionDir, 'gemini-classification.json')
  fs.writeFileSync(outJson, JSON.stringify({
    model, generatedAt: new Date().toISOString(), sourceName: parsed.sourceName,
    totalImages: orderedImages.length, projects, rawResult: result,
  }, null, 2))
  console.log(`\n💾 JSON: ${outJson}`)

  // HTML
  const html = buildReviewHtml({
    sourceName: parsed.sourceName, totalImages: orderedImages.length,
    imagesByFn: Object.fromEntries(orderedImages.map(x => [x.fileName, { slideIndex: x.slideIndex, slideTitle: x.slideTitle, thumbUrl: thumbUrlByFn[x.fileName] }])),
    projects, modelTag: model,
  })
  const outHtml = path.join(sessionDir, 'gemini-review.html')
  fs.writeFileSync(outHtml, html)
  console.log(`📄 HTML: ${outHtml}\n👉 ${toFileUrl(outHtml)}`)

  console.log('\n📊 분류 결과:')
  for (const p of projects) {
    const cat = p.category ? `[${p.category}]` : '[미분류]'
    console.log(`  ${cat.padEnd(16)} ${p.title}  (${p.imageFileNames.length}장)`)
    if (p.reasoning) console.log(`      ↳ ${p.reasoning}`)
  }
}

function toFileUrl(p) { return 'file:///' + p.replace(/\\/g, '/').replace(/ /g, '%20').replace(/#/g, '%23') }

async function callGemini(model, parts) {
  // 키 형태 판별: AIza... 는 key= 파라미터, 그 외 (AQ. 등 OAuth 토큰) 는 Bearer 헤더
  const isApiKey = API_KEY.startsWith('AIza')
  const url = isApiKey
    ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`
    : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
  const headers = { 'Content-Type': 'application/json' }
  if (!isApiKey) headers['Authorization'] = `Bearer ${API_KEY}`

  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: {
          projects: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                category: { type: 'string', enum: [...CATEGORIES, 'null'] },
                imageIndexes: { type: 'array', items: { type: 'integer' } },
                titleIndicatorIndex: { type: 'integer' },
                reasoning: { type: 'string' },
              },
              required: ['title', 'imageIndexes'],
            },
          },
        },
        required: ['projects'],
      },
    },
  }

  const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!resp.ok) {
    const txt = await resp.text()
    throw new Error(`Gemini API ${resp.status}: ${txt.slice(0, 800)}`)
  }
  const json = await resp.json()
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('빈 응답: ' + JSON.stringify(json).slice(0, 400))
  const parsed = JSON.parse(text)
  return { result: parsed, rawJson: json }
}

function validateAndNormalize(projects, images) {
  // 각 이미지가 여러 프로젝트에 중복 들어가면 첫 번째만 유지, 나머지에서 제거
  const seenIdx = new Set()
  const cleaned = []
  for (let pi = 0; pi < projects.length; pi++) {
    const p = projects[pi]
    const idxs = (p.imageIndexes || []).filter(i => Number.isInteger(i) && i >= 0 && i < images.length)
    const unique = []
    for (const i of idxs) {
      if (!seenIdx.has(i)) { seenIdx.add(i); unique.push(i) }
    }
    if (unique.length === 0) continue
    cleaned.push({
      title: p.title || `프로젝트 ${cleaned.length + 1}`,
      category: CATEGORIES.includes(p.category) ? p.category : null,
      imageFileNames: unique.map(i => images[i].fileName),
      reasoning: p.reasoning || '',
      titleIndicatorIndex: p.titleIndicatorIndex ?? null,
      order: cleaned.length,
    })
  }
  // 누락된 이미지 수집 → "미분류" 에 추가
  const orphans = []
  for (let i = 0; i < images.length; i++) if (!seenIdx.has(i)) orphans.push(images[i].fileName)
  if (orphans.length > 0) {
    cleaned.push({ title: '미분류 (AI 누락)', category: null, imageFileNames: orphans, reasoning: 'AI 응답에서 누락된 이미지들', titleIndicatorIndex: null, order: cleaned.length })
  }
  return cleaned
}

function buildPrompt(images) {
  const bySlide = new Map()
  for (let i = 0; i < images.length; i++) {
    const k = images[i].slideIndex
    if (!bySlide.has(k)) bySlide.set(k, { title: images[i].slideTitle || '', idxs: [] })
    bySlide.get(k).idxs.push(i)
  }
  const slideLines = [...bySlide.entries()].sort((a,b)=>a[0]-b[0]).map(([si, v]) => {
    const t = v.title && !/^슬라이드\s*\d+$/i.test(v.title) ? `"${v.title}"` : '(타이틀 없음)'
    const slideLabel = si < 0 ? '미매핑' : `슬라이드 ${si + 1}`
    return `${slideLabel}  title=${t}  →  #${v.idxs.join(', #')}`
  }).join('\n')

  return `
당신은 크리에이티브 스태프(헤어/메이크업/스타일리스트/포토그래퍼)의 포트폴리오 Keynote 파일을 프로젝트 단위로 정리하는 전문가입니다.

【입력】
${images.length}장의 이미지가 순서대로 #0부터 #${images.length - 1}까지 번호 라벨과 함께 따라옵니다.
각 이미지는 슬라이드 번호, 슬라이드 내 순서, 슬라이드 타이틀 텍스트와 함께 제공됩니다.

【슬라이드 구성표 (매우 중요 — 꼭 읽어주세요)】
${slideLines}

【핵심 규칙】

1. **같은 슬라이드의 이미지는 기본적으로 같은 프로젝트.**
   같은 슬라이드 번호의 #번호들은 대부분 한 프로젝트에 묶습니다.
   예외: 한 슬라이드가 "갤러리형"으로 각 썸네일마다 서로 다른 캡션/브랜드명이 붙어 있으면 그때만 분할.

2. **슬라이드 타이틀 텍스트를 1차 판단 기준으로 사용.**
   타이틀이 의미있게 바뀌면 (placeholder 아님) → 새 프로젝트.
   타이틀이 placeholder/비어있으면 → 이미지의 시각 단서(인물·톤·매거진 로고·브랜드 텍스트)로 판단.

3. **매거진 커버/브랜드 로고 이미지는 다음 프로젝트의 시작 표식.**
   COSMOPOLITAN, VOGUE 같은 매거진명, KUNDAL/OLIVEYOUNG 같은 브랜드 로고, 단색/장식 배경 이미지는
   그 뒤 연속 이미지들과 한 프로젝트로 묶으세요.

4. **같은 이미지를 여러 프로젝트에 넣지 마세요.** 각 #번호는 정확히 한 프로젝트에만.

5. **중복 분류 금지.** 비슷한 톤이나 같은 브랜드라도 서로 다른 촬영이면 별개 프로젝트로 나누되,
   실제로는 같은 촬영의 다른 컷이면 한 프로젝트에 합쳐주세요. 애매하면 합치는 쪽.

6. **과분할 금지.** 슬라이드 ${[...bySlide.keys()].filter(k=>k>=0).length}개 → 프로젝트 목표 15~25개.

【미매핑 이미지 처리】
"slide-1" 또는 "미매핑"으로 표시된 이미지는 파서가 슬라이드를 못 찾은 이미지입니다.
이것들은 주변 이미지의 시각 유사성만으로 가장 가까운 프로젝트에 배정하거나, 별도 "미분류 풀" 프로젝트로 묶으세요.

【출력 — 반드시 JSON 스키마 준수】
각 프로젝트:
- title: 매거진/브랜드명 있으면 그대로 ("COSMOPOLITAN", "Dalba"). 없으면 시각 특징으로 짧게 ("뷰티 에디토리얼 — 레드톤").
- category: "AUDIO" | "BEAUTY" | "FASHION" | "VIDEO" | "CELEBRITY" | "PERSONAL WORK" | "null"(문자열)
- imageIndexes: 이 프로젝트의 #번호 배열 (중복 금지, 오름차순)
- titleIndicatorIndex: 대표 이미지 #번호
- reasoning: 왜 묶었는지 + 이전과 어떻게 다른지 1문장

【엄수】
- 모든 #번호(0 ~ ${images.length - 1})가 정확히 한 프로젝트에만 속해야 합니다.
- 같은 #번호를 두 프로젝트에 넣으면 안 됩니다.
`.trim()
}

function buildReviewHtml(data) {
  const json = JSON.stringify(data)
  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8">
<title>ASSI — Gemini 자동 분류</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, Pretendard, sans-serif; background: #F4F3EE; color: #1a1a1a; }
  header { background: #1a1a1a; color: #fff; padding: 14px 28px; display: flex; gap: 14px; align-items: center; position: sticky; top: 0; z-index: 50; }
  header .tag { background: #4285F4; color: #fff; font-size: 11px; font-weight: 900; padding: 3px 10px; border-radius: 10px; letter-spacing: 0.1em; }
  header h1 { font-size: 14px; font-weight: 800; }
  header .meta { color: #aaa; font-size: 12px; font-family: ui-monospace, monospace; }
  main { max-width: 1100px; margin: 0 auto; padding: 24px 28px 80px; }
  .hint { background: #fff; border-left: 3px solid #4285F4; padding: 12px 16px; margin-bottom: 18px; font-size: 13px; border-radius: 0 6px 6px 0; }
  .hint b { color: #4285F4; }
  .proj { background: #fff; border-radius: 10px; padding: 16px; margin-bottom: 10px; border: 2px solid transparent; transition: all 0.15s; }
  .proj.drag-over { border-color: #4285F4; background: #EEF3FD; }
  .proj-head { display: flex; gap: 10px; align-items: center; margin-bottom: 10px; }
  .proj-head input.title { flex: 1; font-size: 17px; font-weight: 800; border: none; background: transparent; padding: 4px 8px; outline: none; border-bottom: 2px solid transparent; }
  .proj-head input.title:focus, .proj-head input.title:hover { border-bottom-color: #4285F4; background: #EEF3FD; }
  .proj-head .cnt { font-size: 11px; color: #888; font-family: ui-monospace, monospace; }
  .proj-head select.cat { font-size: 12px; font-weight: 700; padding: 6px 12px; border-radius: 6px; border: 1.5px solid #ddd; cursor: pointer; }
  .proj-head button.del { background: transparent; border: none; color: #bbb; cursor: pointer; font-size: 16px; padding: 4px 8px; }
  .proj-imgs { display: flex; flex-wrap: wrap; gap: 6px; }
  .img-cell { position: relative; width: 88px; height: 88px; border-radius: 4px; overflow: hidden; cursor: grab; border: 2px solid transparent; background: #f0f0f0; user-select: none; }
  .img-cell:hover { border-color: #4285F4; }
  .img-cell.selected { border-color: #F4A259; box-shadow: 0 0 0 1px #F4A259; }
  .img-cell img { width: 100%; height: 100%; object-fit: cover; pointer-events: none; }
  .img-cell .slide-n { position: absolute; bottom: 2px; right: 2px; background: rgba(0,0,0,0.6); color: #fff; font-size: 8px; padding: 1px 4px; border-radius: 2px; font-family: ui-monospace, monospace; }
  .reasoning { font-size: 11px; color: #888; padding: 8px 10px 0; font-style: italic; }
  .proj-divider { height: 3px; background: transparent; margin: -2px 0; border-radius: 2px; transition: all 0.15s; }
  .proj-divider.drag-over { background: #F4A259; height: 8px; margin: -4px 0; }
  .footer { position: fixed; bottom: 0; left: 0; right: 0; background: #fff; border-top: 1px solid #eee; padding: 14px 28px; display: flex; gap: 14px; align-items: center; z-index: 40; }
  .footer .stats { flex: 1; font-size: 13px; color: #666; }
  .footer .stats b { color: #4285F4; }
  .btn { padding: 9px 18px; background: #4285F4; color: #fff; border: none; border-radius: 6px; font-size: 13px; font-weight: 700; cursor: pointer; }
  .btn.ghost { background: transparent; color: #4285F4; border: 1.5px solid #4285F4; }
</style></head><body>
<header>
  <span class="tag">GEMINI</span>
  <h1>자동 분류 결과 · 드래그로 미세 조정</h1>
  <span class="meta" id="meta"></span>
</header>
<main>
  <div class="hint"><b>💡 사용법</b> — 이미지 드래그로 다른 프로젝트 이동 · 프로젝트 사이 공간에 드롭 → 새 프로젝트 · Shift/Ctrl 다중선택</div>
  <div id="proj-stack"></div>
</main>
<div class="footer">
  <div class="stats" id="stats"></div>
  <button class="btn ghost" id="btn-reset">AI 결과로 되돌리기</button>
  <button class="btn" id="btn-export">확정 · JSON 내보내기</button>
</div>
<script>
const DATA = ${json};
const CATS = ['AUDIO','BEAUTY','FASHION','VIDEO','CELEBRITY','PERSONAL WORK'];
let STATE = { projects: JSON.parse(JSON.stringify(DATA.projects)) };
let selected = new Set();
const el = s => document.querySelector(s)
function esc(s) { return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) }
el('#meta').textContent = DATA.sourceName + ' · ' + DATA.totalImages + '장 · ' + DATA.modelTag
function render() {
  const stack = el('#proj-stack'); stack.innerHTML = ''
  stack.appendChild(makeDiv(0))
  STATE.projects.forEach((p, pi) => {
    const d = document.createElement('div'); d.className = 'proj'; d.dataset.pi = pi
    d.innerHTML = '<div class="proj-head"><input class="title" value="' + esc(p.title) + '" data-pi="' + pi + '"><span class="cnt">' + p.imageFileNames.length + '장</span><select class="cat" data-pi="' + pi + '"><option value="">카테고리 ▾</option>' + CATS.map(c=>'<option value="'+c+'"'+(p.category===c?' selected':'')+'>'+c+'</option>').join('') + '</select><button class="del" data-pi="' + pi + '">✕</button></div><div class="proj-imgs">' + p.imageFileNames.map(fn => { const im = DATA.imagesByFn[fn] || {}; const isSel = selected.has(fn); return '<div class="img-cell' + (isSel?' selected':'') + '" draggable="true" data-fn="' + esc(fn) + '">' + (im.thumbUrl?'<img src="'+im.thumbUrl+'">':'') + (im.slideIndex>=0?'<span class="slide-n">S'+(im.slideIndex+1)+'</span>':'') + '</div>' }).join('') + '</div>' + (p.reasoning?'<div class="reasoning">'+esc(p.reasoning)+'</div>':'')
    stack.appendChild(d); stack.appendChild(makeDiv(pi+1))
  })
  stack.querySelectorAll('input.title').forEach(i => i.addEventListener('input', e => { STATE.projects[+e.target.dataset.pi].title = e.target.value; stats() }))
  stack.querySelectorAll('select.cat').forEach(s => s.addEventListener('change', e => { STATE.projects[+e.target.dataset.pi].category = e.target.value || null; stats() }))
  stack.querySelectorAll('button.del').forEach(b => b.addEventListener('click', e => delProj(+e.target.dataset.pi)))
  stack.querySelectorAll('.img-cell').forEach(c => {
    c.addEventListener('click', e => { const fn = c.dataset.fn; if (e.shiftKey||e.ctrlKey||e.metaKey) { selected.has(fn)?selected.delete(fn):selected.add(fn) } else { selected.clear(); selected.add(fn) } render() })
    c.addEventListener('dragstart', e => { if (!selected.has(c.dataset.fn)) { selected.clear(); selected.add(c.dataset.fn) } e.dataTransfer.setData('text/plain', [...selected].join('|')) })
  })
  stack.querySelectorAll('.proj').forEach(p => {
    p.addEventListener('dragover', e => { e.preventDefault(); p.classList.add('drag-over') })
    p.addEventListener('dragleave', () => p.classList.remove('drag-over'))
    p.addEventListener('drop', e => { e.preventDefault(); p.classList.remove('drag-over'); move(e.dataTransfer.getData('text/plain').split('|').filter(Boolean), +p.dataset.pi) })
  })
  stack.querySelectorAll('.proj-divider').forEach(dv => {
    dv.addEventListener('dragover', e => { e.preventDefault(); dv.classList.add('drag-over') })
    dv.addEventListener('dragleave', () => dv.classList.remove('drag-over'))
    dv.addEventListener('drop', e => { e.preventDefault(); dv.classList.remove('drag-over'); insertAt(+dv.dataset.at, e.dataTransfer.getData('text/plain').split('|').filter(Boolean)) })
  })
  stats()
}
function makeDiv(at) { const d = document.createElement('div'); d.className = 'proj-divider'; d.dataset.at = at; return d }
function move(fns, pi) { const t = STATE.projects[pi]; for (const fn of fns) { for (const p of STATE.projects) { const i = p.imageFileNames.indexOf(fn); if (i>=0 && p!==t) p.imageFileNames.splice(i,1) } if (!t.imageFileNames.includes(fn)) t.imageFileNames.push(fn) } STATE.projects = STATE.projects.filter(p=>p.imageFileNames.length>0); selected.clear(); render() }
function insertAt(at, fns) { if (!fns.length) return; const np = { title: '새 프로젝트', category: null, imageFileNames: [], reasoning: '' }; for (const fn of fns) { for (const p of STATE.projects) { const i = p.imageFileNames.indexOf(fn); if (i>=0) p.imageFileNames.splice(i,1) } np.imageFileNames.push(fn) } STATE.projects.splice(at,0,np); STATE.projects = STATE.projects.filter(p=>p.imageFileNames.length>0); selected.clear(); render() }
function delProj(pi) { if (!confirm(STATE.projects[pi].imageFileNames.length + '장이 "미분류"로 이동합니다')) return; const r = STATE.projects.splice(pi,1)[0]; let m = STATE.projects.find(p=>p.title==='미분류'); if (!m) { m = { title: '미분류', category: null, imageFileNames: [], reasoning: '' }; STATE.projects.push(m) } m.imageFileNames.push(...r.imageFileNames); render() }
function stats() { const tot = STATE.projects.reduce((s,p)=>s+p.imageFileNames.length,0); const asg = STATE.projects.filter(p=>p.category).length; el('#stats').innerHTML = '프로젝트 <b>'+STATE.projects.length+'</b> · 카테고리 <b>'+asg+'/'+STATE.projects.length+'</b> · 이미지 <b>'+tot+'</b>' }
el('#btn-reset').addEventListener('click', () => { if (!confirm('AI 결과로 복원?')) return; STATE = { projects: JSON.parse(JSON.stringify(DATA.projects)) }; selected.clear(); render() })
el('#btn-export').addEventListener('click', () => { const out = { sourceName: DATA.sourceName, projects: STATE.projects.filter(p=>p.imageFileNames.length>0).map((p,i)=>({ title: p.title, category: p.category, order: i, thumbnailFileName: p.imageFileNames[0], imageFileNames: p.imageFileNames })) }; const blob = new Blob([JSON.stringify(out,null,2)], {type:'application/json'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'classification.json'; a.click() })
render()
</script>
</body></html>`
}

main().catch(e => { console.error('FAIL:', e.message); process.exit(1) })
