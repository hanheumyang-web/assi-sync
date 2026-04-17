#!/usr/bin/env node
// ASSI Sync — Claude Vision 이미지 단위 프로젝트 분류
//
// 접근:
//   사람마다 "타이틀"을 (A) 전용 슬라이드에 텍스트로 두거나, (B) 같은 슬라이드 상단에 텍스트+이미지로
//   두거나, (C) 스타일 차이만으로 구분하기도 함. 그래서 슬라이드 단위로 묶지 않고
//   모든 이미지를 순서대로 Claude 에 보여주고, 타이틀 성격의 이미지/슬라이드가 어딘지 + 얼굴/톤
//   유사성 + 순서를 종합해 프로젝트 경계를 찾게 함.
//
// 사용:
//   $env:ANTHROPIC_API_KEY="sk-ant-..."   (PowerShell)
//   node scripts/keynote-ai-classify.js --reuse <sessionId>
//
// 옵션:
//   --fallback           API 키 없어도 휴리스틱으로 분류 (UI 검증용)
//   --max <N>            이미지 N장만 사용 (빠른 테스트)

const fs = require('fs')
const path = require('path')
const os = require('os')
const sharp = require('sharp')

const API_KEY = process.env.ANTHROPIC_API_KEY
const MODEL = 'claude-sonnet-4-20250514'
const THUMB_SIZE = 200
const MAX_TOKENS = 8192
const CATEGORIES = ['AUDIO', 'BEAUTY', 'FASHION', 'VIDEO', 'CELEBRITY', 'PERSONAL WORK']

async function main() {
  const args = process.argv.slice(2)
  let reuseSessionId = null, fallback = false, maxImages = Infinity
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--reuse') reuseSessionId = args[++i]
    else if (args[i] === '--fallback') fallback = true
    else if (args[i] === '--max') maxImages = parseInt(args[++i]) || Infinity
  }
  if (!reuseSessionId) {
    console.error('Usage: node scripts/keynote-ai-classify.js --reuse <sessionId> [--fallback] [--max N]')
    process.exit(1)
  }

  const sessionDir = path.join(os.homedir(), '.assi-sync', 'keynote-preview', reuseSessionId)
  const dataFile = path.join(sessionDir, 'data.json')
  if (!fs.existsSync(dataFile)) { console.error('data.json not found'); process.exit(1) }
  const { parsed, extracted } = JSON.parse(fs.readFileSync(dataFile, 'utf8'))

  // 이미지 순서대로 정렬 (slide + 슬라이드 내 순서 유지)
  const seen = new Set()
  const orderedImages = [] // { fileName, slideIndex, slideTitle, positionInSlide, extractedPath, thumbPath }
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
        fileName: fn,
        slideIndex: sg.slideIndex,
        slideTitle: (sg.title || '').trim(),
        textTokens: sg.textTokens || [],  // ← 신규: iwa 에서 긁어온 사용자 텍스트 조각
        positionInSlide: pos++,
        extractedPath: meta.extractedPath,
        thumbPath: meta.thumbPath,
      })
    }
  }
  // 매핑 안된 이미지도 뒤에 추가 (안전장치)
  for (const ex of extracted) {
    if (!seen.has(ex.fileName) && ex.thumbPath) {
      orderedImages.push({ fileName: ex.fileName, slideIndex: -1, slideTitle: '', positionInSlide: 0, extractedPath: ex.extractedPath, thumbPath: ex.thumbPath })
    }
  }

  const usedImages = orderedImages.slice(0, maxImages)
  console.log(`📂 Session: ${reuseSessionId}`)
  console.log(`   전체 이미지: ${orderedImages.length}장 / 사용: ${usedImages.length}장`)

  // thumbnailsUrl 맵 (HTML 에서 바로 쓰도록)
  const thumbUrlByFn = {}
  for (const ex of extracted) if (ex.thumbPath) thumbUrlByFn[ex.fileName] = toFileUrl(ex.thumbPath)

  let result
  if (fallback || !API_KEY) {
    if (!API_KEY) console.log('⚠️  ANTHROPIC_API_KEY 없음 — 휴리스틱 폴백으로 진행 (타이틀 텍스트 변화 기반)')
    result = heuristicClassify(usedImages)
  } else {
    result = await aiClassify(usedImages)
  }

  // ai-classification.json 저장
  const outJson = path.join(sessionDir, 'ai-classification.json')
  fs.writeFileSync(outJson, JSON.stringify({
    model: fallback || !API_KEY ? 'heuristic-fallback' : MODEL,
    generatedAt: new Date().toISOString(),
    sourceName: parsed.sourceName,
    totalImages: orderedImages.length,
    projects: result.projects,
    rawResult: result.raw || null,
  }, null, 2))
  console.log(`\n💾 JSON: ${outJson}`)

  // ai-review.html 생성 (타이틀 / 이미지 / 타이틀 / 이미지 스택 + 드래그앤드롭)
  const html = buildReviewHtml({
    sourceName: parsed.sourceName,
    totalImages: orderedImages.length,
    imagesByFn: Object.fromEntries(orderedImages.map(x => [x.fileName, { slideIndex: x.slideIndex, slideTitle: x.slideTitle, thumbUrl: thumbUrlByFn[x.fileName] }])),
    projects: result.projects,
    modelTag: fallback || !API_KEY ? 'heuristic' : 'claude-sonnet',
  })
  const outHtml = path.join(sessionDir, 'ai-review.html')
  fs.writeFileSync(outHtml, html)
  console.log(`📄 HTML: ${outHtml}`)
  console.log(`\n👉 브라우저에서 열기:\n   ${toFileUrl(outHtml)}`)

  // 콘솔 요약
  console.log('\n📊 분류 결과:')
  for (const p of result.projects) {
    const cat = p.category ? `[${p.category}]` : '[미분류]'
    console.log(`  ${cat.padEnd(16)} ${p.title}  (${p.imageFileNames.length}장)`)
    if (p.reasoning) console.log(`      ↳ ${p.reasoning}`)
  }
}

function toFileUrl(p) { return 'file:///' + p.replace(/\\/g, '/').replace(/ /g, '%20').replace(/#/g, '%23') }

// ──────────────────────────────────────────────────────────────
// AI 호출 (Claude Vision, 이미지 단위 분석)
// ──────────────────────────────────────────────────────────────
async function aiClassify(images) {
  // Claude 는 한 요청에 최대 100개 이미지. 여러 이미지를 타일로 묶어서 전송.
  // 세부 판별을 위해 셀을 크게, 타일당 이미지 수는 줄임.
  const COLS = 6
  const CELL = 260
  const PER_TILE = 30 // 6x5
  const GAP = 6
  console.log(`🖼️  타일 조립 중 (${Math.ceil(images.length / PER_TILE)}장)...`)
  const tiles = []
  for (let start = 0; start < images.length; start += PER_TILE) {
    const chunk = images.slice(start, start + PER_TILE)
    const rows = Math.ceil(chunk.length / COLS)
    const tileW = COLS * CELL + (COLS + 1) * GAP
    const tileH = rows * CELL + (rows + 1) * GAP
    const composites = []
    for (let i = 0; i < chunk.length; i++) {
      const idx = start + i
      const col = i % COLS, row = Math.floor(i / COLS)
      const x = GAP + col * (CELL + GAP)
      const y = GAP + row * (CELL + GAP)
      try {
        const buf = fs.readFileSync(chunk[i].thumbPath)
        const resized = await sharp(buf).resize(CELL, CELL, { fit: 'cover' }).jpeg({ quality: 75 }).toBuffer()
        composites.push({ input: resized, top: y, left: x })
      } catch (e) {
        // skip; 번호 라벨만 찍음
      }
      // 인덱스 번호 라벨 (SVG)
      const label = `<svg width="${CELL}" height="26"><rect x="0" y="0" width="${CELL}" height="26" fill="rgba(130,141,248,0.92)"/><text x="${CELL/2}" y="18" font-family="Arial" font-size="15" font-weight="900" fill="white" text-anchor="middle">#${idx}</text></svg>`
      composites.push({ input: Buffer.from(label), top: y, left: x })
    }
    const tileBuf = await sharp({ create: { width: tileW, height: tileH, channels: 3, background: '#1a1a1a' } })
      .composite(composites)
      .jpeg({ quality: 78 })
      .toBuffer()
    tiles.push({ buf: tileBuf, start, end: start + chunk.length - 1 })
    console.log(`   tile ${tiles.length}: #${start}~#${start + chunk.length - 1} (${Math.round(tileBuf.length/1024)}KB)`)
  }

  const content = []
  content.push({ type: 'text', text: buildPrompt(images, tiles.length) })
  for (const t of tiles) {
    content.push({ type: 'text', text: `[타일] #${t.start} ~ #${t.end}` })
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: t.buf.toString('base64') } })
  }
  // 메타데이터 (이미지 → 슬라이드/타이틀) 전부 텍스트로 한 번에
  const metaLines = images.map((im, i) => `#${i} slide${im.slideIndex + 1} pos${im.positionInSlide} title="${(im.slideTitle || '').slice(0, 40)}"`).join('\n')
  content.push({ type: 'text', text: `【이미지 메타데이터】\n${metaLines}` })

  const kb = Math.round(JSON.stringify(content).length / 1024)
  console.log(`🤖 Claude 호출 (${tiles.length}타일, payload ~${kb}KB)...`)
  const t0 = Date.now()
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      tools: [CLASSIFY_TOOL],
      tool_choice: { type: 'tool', name: 'classify_projects' },
      messages: [{ role: 'user', content }],
    }),
  })
  const dt = ((Date.now() - t0) / 1000).toFixed(1)
  if (!resp.ok) { const txt = await resp.text(); throw new Error(`API ${resp.status}: ${txt.slice(0, 500)}`) }
  const json = await resp.json()
  console.log(`✅ 응답 (${dt}s, in=${json.usage?.input_tokens}tok out=${json.usage?.output_tokens}tok)`)
  const toolUse = json.content.find(b => b.type === 'tool_use')
  if (!toolUse) throw new Error('tool_use 없음: ' + JSON.stringify(json).slice(0, 500))
  const raw = toolUse.input

  // AI 가 준 imageIndexes → fileName 매핑
  const projects = (raw.projects || []).map((p, i) => ({
    title: p.title,
    category: CATEGORIES.includes(p.category) ? p.category : null,
    imageFileNames: (p.imageIndexes || []).map(idx => images[idx]?.fileName).filter(Boolean),
    reasoning: p.reasoning || '',
    titleIndicatorIndex: p.titleIndicatorIndex ?? null,
    order: i,
  }))
  // 포트폴리오 overview / contact-sheet 자동 감지 & 제외
  //   - 30장 이상 + 제목/reasoning 에 overview 키워드
  const OVERVIEW_RE = /overview|portfolio|contact.?sheet|gallery|collection|갤러리|전체|요약|커버|목차|인덱스/i
  const kept = []
  const excluded = []
  for (const p of projects) {
    const looksOverview = p.imageFileNames.length >= 30 && (OVERVIEW_RE.test(p.title || '') || OVERVIEW_RE.test(p.reasoning || ''))
    if (looksOverview) excluded.push(p)
    else kept.push(p)
  }
  if (excluded.length) {
    const totalExcluded = excluded.reduce((s, p) => s + p.imageFileNames.length, 0)
    console.log(`🗑️  Overview 슬라이드 자동 제외: ${excluded.length}개 프로젝트 (${totalExcluded}장)`)
    for (const p of excluded) console.log(`    - ${p.title} (${p.imageFileNames.length}장)`)
  }
  return { projects: kept, raw, excludedOverview: excluded }
}

function buildPrompt(images, tileCount) {
  // 슬라이드별로 묶어 Claude 에 전달 (같은 슬라이드 = 같은 프로젝트 기본값)
  const bySlide = new Map()
  for (let i = 0; i < images.length; i++) {
    const key = images[i].slideIndex
    if (!bySlide.has(key)) bySlide.set(key, { title: images[i].slideTitle || '', idxs: [] })
    bySlide.get(key).idxs.push(i)
  }
  // 슬라이드별로 title + textTokens 표시 + 고빈도 토큰(작가 서명) 식별
  const bySlideFull = new Map()
  const tokenFreq = new Map()
  for (let i = 0; i < images.length; i++) {
    const k = images[i].slideIndex
    if (!bySlideFull.has(k)) bySlideFull.set(k, { title: images[i].slideTitle, tokens: images[i].textTokens || [], idxs: [] })
    bySlideFull.get(k).idxs.push(i)
  }
  for (const [, v] of bySlideFull) {
    for (const t of new Set(v.tokens)) tokenFreq.set(t, (tokenFreq.get(t) || 0) + 1)
  }
  const totalSlides = bySlideFull.size
  // 절반 이상 슬라이드에 등장하는 토큰 = 작가/스튜디오 서명 (제외 대상)
  const commonTokens = [...tokenFreq.entries()].filter(([, n]) => n >= Math.max(3, Math.floor(totalSlides * 0.4))).map(([t]) => t)

  const slideLines = [...bySlideFull.entries()].sort((a,b)=>a[0]-b[0]).map(([si, v]) => {
    const t = v.title && !/^슬라이드\s*\d+$/i.test(v.title) ? `"${v.title}"` : '(placeholder)'
    // 고빈도 (작가 서명) 토큰은 제외하고 유의미한 토큰만 표시
    const meaningful = v.tokens.filter(tk => !commonTokens.includes(tk))
    const tokens = meaningful.length > 0 ? ` · 내부텍스트=[${meaningful.slice(0, 8).map(s => '"' + s + '"').join(', ')}${meaningful.length > 8 ? ', ...' : ''}]` : ''
    return `슬라이드 ${si + 1}  title=${t}${tokens}  →  #${v.idxs.join(', #')}`
  }).join('\n')

  const signatureNote = commonTokens.length > 0
    ? `\n【작가/스튜디오 서명 (무시할 것)】\n${commonTokens.map(t => `"${t}"`).join(', ')}\n→ 이 토큰들은 ${totalSlides}개 슬라이드 중 절반 이상에 등장하므로 작가 서명으로 판단됩니다. 프로젝트 제목으로 절대 사용하지 마세요.\n`
    : ''

  return `
당신은 크리에이티브 스태프(헤어/메이크업/스타일리스트/포토그래퍼)의 포트폴리오 Keynote 파일을 프로젝트 단위로 정리하는 전문가입니다.

【입력】
${tileCount}개의 composite 타일 이미지에 총 ${images.length}장의 썸네일이 #번호 라벨(보라색 바)과 함께 박혀 있습니다. 그 뒤에 슬라이드 구성표가 붙습니다.

【슬라이드 구성표】
${slideLines}
${signatureNote}

【가장 중요한 3가지 규칙】

■ 규칙 1 — **같은 슬라이드의 이미지는 기본적으로 한 프로젝트. 단, 각 이미지마다 별도 캡션이 있는 경우는 예외.**
포트폴리오 작성자는 대부분 한 슬라이드에 한 프로젝트의 이미지들을 모읍니다. 따라서 같은 슬라이드 번호의 #번호들은 **기본적으로 하나의 프로젝트**로 묶으세요.
**예외 케이스**: 하나의 슬라이드가 "갤러리 형태"로 각 썸네일 아래/옆에 서로 다른 프로젝트명/캡션 텍스트가 각각 붙어있는 경우 — 이때만 같은 슬라이드 안에서도 나눠야 합니다. 타일 이미지에서 각 썸네일 주변에 **서로 다른 짧은 텍스트/로고/매거진명**이 붙어있는지 반드시 확인하세요.
경계는 원칙적으로 슬라이드 사이, 예외적으로 캡션이 다른 슬라이드 내부.

■ 규칙 2 — **슬라이드 "내부텍스트" 가 1차 판단 기준. (가장 중요!)**
슬라이드 구성표에는 각 슬라이드의 title 과 **내부텍스트=["..."]** 가 제공됩니다.
"내부텍스트" 는 해당 슬라이드의 텍스트 박스 안에 실제로 사용자가 입력한 단어들입니다 (브랜드명, 매거진명, 프로젝트명 등).
  - **내부텍스트에 들어있는 브랜드명/매거진명을 프로젝트 title 로 최우선 채택하세요** (예: "Oliveyoung", "Dalba", "KUNDAL", "COSMOPOLITAN", "LAKA", "SKIN FOOD" 등).
  - 두 슬라이드의 내부텍스트 주요 단어가 같거나 유사하면 → 같은 프로젝트.
  - 내부텍스트가 명백히 다른 브랜드로 바뀌면 → 새 프로젝트.
  - "EDITORIAL" / "ADVERTISEMENT" 단어는 카테고리 힌트로 해석 (EDITORIAL = 에디토리얼, ADVERTISEMENT = 광고).
  - 내부텍스트가 비어있으면 → 이미지의 시각적 단서(인물/톤/매거진 로고)로 판단.

■ 규칙 3 — **다른 브랜드명 = 무조건 다른 프로젝트. 합치기 절대 금지.**
  - 내부텍스트에 **서로 다른 브랜드명** (예: "LAKA" 와 "too cool for school") 이 있으면 반드시 **별개 프로젝트**.
  - "X x Y" 형태의 콜라보성 제목을 임의로 만들지 마세요. 원본 텍스트에 그런 조합이 명시되어 있을 때만 허용.
  - 스태프 이름/스튜디오 태그 (예: "UUFC", "AHN HYUNGGYU", "HAIR" 등) 는 프로젝트 제목에서 **제거**. 작가 서명이지 프로젝트명 아님.
  - **슬라이드 경계 우선**: 슬라이드가 바뀌면 대체로 다른 프로젝트. 연속된 슬라이드를 합칠 때는 "같은 브랜드명이 두 슬라이드에 모두 나타날 때" 만.

■ 규칙 4 — 과분할/과합치기 둘 다 주의.
  - 톤이 조금 다르다고, 컷 각도만 다르다고 분리하지 마세요 (같은 촬영의 다른 컷).
  - 반대로, 서로 다른 브랜드/매거진/인물이면 반드시 분리.
  - 가이드: 슬라이드 ${[...new Set(images.map(i=>i.slideIndex).filter(s=>s>=0))].length}개 있으면 프로젝트 수는 **슬라이드 수와 비슷하거나 약간 적은 정도**가 자연스러움. 절반 이하로 뭉치면 과합치기.

【프로젝트 경계의 명확한 신호 (아래 중 하나가 있을 때만 분리)】
(a) 슬라이드 타이틀이 의미있게 바뀜 (placeholder 제외)
(b) 매거진 로고/커버/브랜드명 이미지가 새로 등장 (새 프로젝트의 시작 표식)
(c) 인물이 명백히 완전히 다른 사람 (같은 사람의 다른 각도/헤어스타일은 같은 프로젝트)
(d) 단색 배경/장식 이미지 — 이건 다음 이미지의 표지 역할이므로 뒤 프로젝트에 포함시키세요

【출력 형식】
각 프로젝트:
- title: 매거진/브랜드명 있으면 그대로 ("COSMOPOLITAN Beauty Awards", "Dalba", "KUNDAL"). 없으면 시각 특징으로 짧게.
- category: AUDIO / BEAUTY / FASHION / VIDEO / CELEBRITY / PERSONAL WORK 중 하나 또는 null
- imageIndexes: 이 프로젝트의 #번호 배열 (연속적, 같은 슬라이드 이미지는 전부 포함)
- titleIndicatorIndex: 프로젝트 대표 이미지 #번호 (매거진 커버/타이틀 슬라이드 있으면 그것, 없으면 첫 이미지)
- reasoning: 왜 묶었는지 + 이전과 어떻게 다른지 1문장

【엄수】
- 모든 이미지(${images.length}장, #0~#${images.length - 1})가 반드시 어떤 프로젝트에 속해야 함.
- **같은 슬라이드의 이미지는 반드시 같은 프로젝트에 몰아넣기.**
- 반드시 classify_projects 도구 사용.
`.trim()
}

const CLASSIFY_TOOL = {
  name: 'classify_projects',
  description: '포트폴리오 키노트를 프로젝트 단위로 그룹핑한 결과',
  input_schema: {
    type: 'object',
    properties: {
      projects: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            category: { type: ['string', 'null'], enum: [...CATEGORIES, null] },
            imageIndexes: { type: 'array', items: { type: 'integer' } },
            titleIndicatorIndex: { type: ['integer', 'null'] },
            reasoning: { type: 'string' },
          },
          required: ['title', 'imageIndexes'],
        },
      },
    },
    required: ['projects'],
  },
}

// ──────────────────────────────────────────────────────────────
// 휴리스틱 폴백 (API 키 없을 때 UI 테스트용)
// ──────────────────────────────────────────────────────────────
function heuristicClassify(images) {
  const isPlaceholder = t => !t || /^슬라이드\s*\d+$/i.test(t) || /^slide\s*\d+$/i.test(t)
  const norm = t => (t || '').trim().replace(/\s+/g, ' ').toLowerCase()
  const projects = []
  let lastNorm = null
  let current = null
  for (let i = 0; i < images.length; i++) {
    const im = images[i]
    const placeholder = isPlaceholder(im.slideTitle)
    const n = placeholder ? null : norm(im.slideTitle)
    if (!current || (n && n !== lastNorm)) {
      current = {
        title: placeholder ? `프로젝트 ${projects.length + 1}` : im.slideTitle,
        category: null,
        imageFileNames: [],
        reasoning: '(휴리스틱) 슬라이드 타이틀 텍스트가 바뀌는 지점을 경계로 사용',
        titleIndicatorIndex: i,
        order: projects.length,
      }
      projects.push(current)
      if (n) lastNorm = n
    }
    current.imageFileNames.push(im.fileName)
  }
  return { projects, raw: null }
}

// ──────────────────────────────────────────────────────────────
// 리뷰 HTML (타이틀 / 이미지 / 타이틀 / 이미지 스택 + 드래그앤드롭)
// ──────────────────────────────────────────────────────────────
function buildReviewHtml(data) {
  const json = JSON.stringify(data)
  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8">
<title>ASSI Sync — AI 자동 분류 결과</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, Pretendard, 'Apple SD Gothic Neo', sans-serif; background: #F4F3EE; color: #1a1a1a; }
  header { background: #1a1a1a; color: #fff; padding: 14px 28px; display: flex; align-items: center; gap: 14px; position: sticky; top: 0; z-index: 50; }
  header h1 { font-size: 14px; font-weight: 800; letter-spacing: 0.02em; }
  header .tag { background: #828DF8; color: #fff; font-size: 11px; font-weight: 900; padding: 3px 10px; border-radius: 10px; letter-spacing: 0.1em; }
  header .meta { color: #aaa; font-size: 12px; font-family: ui-monospace, monospace; }
  header .spacer { flex: 1; }

  /* ─── 카테고리 섹션 헤더 ─── */
  .cat-section { margin-bottom: 8px; }
  .cat-header { display: flex; align-items: center; gap: 10px; padding: 14px 16px 8px; font-size: 11px; font-weight: 900; letter-spacing: 0.2em; text-transform: uppercase; color: #666; }
  .cat-header .cat-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 12px; background: #fff; border: 1.5px solid #ddd; }
  .cat-header .cat-badge .dot { width: 8px; height: 8px; border-radius: 50%; background: #ccc; }
  .cat-header[data-cat="AUDIO"] .cat-badge .dot { background: #6366F1 }
  .cat-header[data-cat="BEAUTY"] .cat-badge .dot { background: #EC4899 }
  .cat-header[data-cat="FASHION"] .cat-badge .dot { background: #F59E0B }
  .cat-header[data-cat="VIDEO"] .cat-badge .dot { background: #0EA5E9 }
  .cat-header[data-cat="CELEBRITY"] .cat-badge .dot { background: #8B5CF6 }
  .cat-header[data-cat="PERSONAL WORK"] .cat-badge .dot { background: #10B981 }
  .cat-header .cat-count { font-size: 10px; color: #aaa; font-family: ui-monospace, monospace; font-weight: 700; letter-spacing: 0 }
  .cat-header .cat-line { flex: 1; height: 1px; background: #ddd; }

  /* ─── 프로젝트 사이 + 버튼 (hover 시 노출) ─── */
  .proj-slot { position: relative; height: 14px; margin: -2px 0; transition: height 0.2s; }
  .proj-slot.drag-over { height: 32px; background: linear-gradient(180deg, transparent 0%, rgba(244,162,89,0.15) 50%, transparent 100%); border-radius: 4px; }
  .proj-slot .add-btn { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 26px; height: 26px; border-radius: 50%; background: #828DF8; color: #fff; border: none; font-size: 16px; font-weight: 900; cursor: pointer; opacity: 0; transition: opacity 0.15s, transform 0.15s; z-index: 5; box-shadow: 0 2px 6px rgba(130,141,248,0.4); display: flex; align-items: center; justify-content: center; }
  .proj-slot:hover .add-btn { opacity: 1; transform: translate(-50%, -50%) scale(1.05); }
  .proj-slot.drag-over .add-btn { opacity: 1; background: #F4A259; }

  main { max-width: 1100px; margin: 0 auto; padding: 18px 28px 100px; }
  .hint { background: #fff; border-left: 3px solid #828DF8; padding: 10px 14px; margin-bottom: 14px; font-size: 12px; color: #333; border-radius: 0 6px 6px 0; line-height: 1.6; }
  .hint b { color: #828DF8; }
  .hint code { background: #F4F3FF; padding: 1px 5px; border-radius: 3px; font-family: ui-monospace, monospace; font-size: 11px; }

  .proj { background: #fff; border-radius: 10px; padding: 14px 16px; border: 2px solid transparent; transition: all 0.15s; position: relative; }
  .proj.drag-over { border-color: #828DF8; background: #F4F3FF; }
  .proj.p-selected { border-color: #F4A259; box-shadow: 0 0 0 2px rgba(244,162,89,0.2); }
  .proj-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .proj-head .p-check { width: 16px; height: 16px; cursor: pointer; accent-color: #F4A259; flex-shrink: 0; }
  .proj-head input.title { flex: 1; font-size: 16px; font-weight: 800; border: none; background: transparent; padding: 4px 6px; outline: none; border-bottom: 2px solid transparent; min-width: 0; }
  .proj-head input.title:focus, .proj-head input.title:hover { border-bottom-color: #828DF8; background: #F4F3FF; }
  .proj-head .cnt { font-size: 11px; color: #888; font-family: ui-monospace, monospace; white-space: nowrap; }
  .proj-head select.cat { font-size: 12px; font-weight: 700; padding: 6px 10px; border-radius: 6px; border: 1.5px solid #ddd; background: #fff; cursor: pointer; max-width: 180px; }
  .proj-head select.cat[data-set="1"] { border-color: #828DF8; background: #F4F3FF; color: #828DF8; }
  .proj-head button.del { background: transparent; border: none; color: #bbb; cursor: pointer; font-size: 15px; padding: 4px 6px; }
  .proj-head button.del:hover { color: #e45; }

  .proj-imgs { display: flex; flex-wrap: wrap; gap: 6px; }
  .img-cell { position: relative; width: 80px; height: 80px; border-radius: 4px; overflow: hidden; cursor: grab; border: 2px solid transparent; background: #f0f0f0; user-select: none; }
  .img-cell:hover { border-color: #828DF8; }
  .img-cell.selected { border-color: #F4A259; box-shadow: 0 0 0 1px #F4A259; }
  .img-cell.is-title { border-color: #6366F1; box-shadow: 0 0 0 2px rgba(99,102,241,0.4); }
  .img-cell img { width: 100%; height: 100%; object-fit: cover; pointer-events: none; }
  .img-cell .check { position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; background: rgba(255,255,255,0.9); border-radius: 3px; opacity: 0; transition: opacity 0.15s; display: flex; align-items: center; justify-content: center; z-index: 3; }
  .img-cell:hover .check, .img-cell.selected .check { opacity: 1; }
  .img-cell.selected .check { background: #F4A259; }
  .img-cell.selected .check::after { content: '✓'; color: #fff; font-weight: 900; font-size: 11px; }
  .img-cell .slide-n { position: absolute; bottom: 2px; right: 2px; background: rgba(0,0,0,0.6); color: #fff; font-size: 8px; padding: 1px 4px; border-radius: 2px; font-family: ui-monospace, monospace; }

  .reasoning { font-size: 11px; color: #888; padding: 8px 6px 0; font-style: italic; }

  /* ─── 상단 프로젝트 일괄 툴바 ─── */
  .top-bar { background: #1a1a1a; color: #fff; padding: 10px 28px; display: flex; align-items: center; gap: 12px; position: sticky; top: 48px; z-index: 49; transition: transform 0.2s; transform: translateY(-100%); }
  .top-bar.show { transform: translateY(0); }
  .top-bar .sel-count { font-size: 12px; font-weight: 700; }
  .top-bar select { background: #333; color: #fff; border: 1px solid #444; padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: pointer; }
  .top-bar button { background: #fff; color: #1a1a1a; border: none; padding: 6px 14px; border-radius: 14px; font-size: 11px; font-weight: 800; cursor: pointer; transition: all 0.15s; }
  .top-bar button:hover { background: #F4A259; color: #fff; }
  .top-bar .sep { width: 1px; height: 18px; background: #444; }

  /* ─── 프로젝트 내부 이미지 선택 인라인 액션 ─── */
  .proj .img-sel-actions { display: none; align-items: center; gap: 8px; padding: 8px 10px; margin-bottom: 8px; background: #FFF6EA; border: 1.5px solid #F4A259; border-radius: 8px; font-size: 11px; font-weight: 700; color: #8a4b13; }
  .proj.has-selected-imgs .img-sel-actions { display: flex; }
  .proj .img-sel-actions button { background: #F4A259; color: #fff; border: none; padding: 6px 12px; border-radius: 14px; font-size: 11px; font-weight: 800; cursor: pointer; }
  .proj .img-sel-actions button:hover { background: #e59145; }
  .proj .img-sel-actions button.ghost { background: transparent; color: #8a4b13; border: 1px solid #F4A259; }

  .footer { position: fixed; bottom: 0; left: 0; right: 0; background: #fff; border-top: 1px solid #eee; padding: 12px 28px; display: flex; align-items: center; gap: 14px; z-index: 40; }
  .footer .stats { flex: 1; font-size: 13px; color: #666; }
  .footer .stats b { color: #828DF8; }
  .footer .btn { padding: 9px 18px; background: #828DF8; color: #fff; border: none; border-radius: 6px; font-size: 13px; font-weight: 700; cursor: pointer; }
  .footer .btn.ghost { background: transparent; color: #828DF8; border: 1.5px solid #828DF8; }
  #toast { position: fixed; bottom: 140px; left: 50%; transform: translateX(-50%); background: #1a1a1a; color: #fff; padding: 10px 16px; border-radius: 20px; font-size: 12px; opacity: 0; pointer-events: none; transition: opacity 0.2s; z-index: 100; }
  #toast.show { opacity: 1; }

  /* ─── 첫 진입 사용법 튜토리얼 모달 ─── */
  .help-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 200; display: none; align-items: flex-start; justify-content: center; padding: 40px 20px; overflow-y: auto; }
  .help-modal.show { display: flex; }
  .help-modal .hm-box { background: #fff; border-radius: 18px; max-width: 1040px; width: 100%; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.4); margin: auto; }
  .help-modal .hm-head { padding: 28px 36px 20px; border-bottom: 1px solid #eee; display: flex; align-items: center; gap: 14px; }
  .help-modal .hm-head .hm-tag { background: #828DF8; color: #fff; font-size: 12px; font-weight: 900; padding: 5px 14px; border-radius: 12px; letter-spacing: 0.1em; }
  .help-modal .hm-head h2 { flex: 1; font-size: 24px; font-weight: 800; letter-spacing: -0.01em; }
  .help-modal .hm-head .hm-skip { background: transparent; color: #999; border: none; font-size: 14px; cursor: pointer; padding: 8px 12px; }
  .help-modal .hm-head .hm-skip:hover { color: #555; }
  .help-modal .hm-body { padding: 28px 36px; }

  /* 맨 위: 폴더 구조 트리 (크게) */
  .hm-tree { background: linear-gradient(135deg, #F4F3FF 0%, #FFF 100%); border: 2px solid #d8dbf5; border-radius: 14px; padding: 28px 32px; margin-bottom: 28px; }
  .hm-tree h3 { font-size: 14px; font-weight: 800; color: #828DF8; letter-spacing: 0.15em; margin-bottom: 18px; text-transform: uppercase; }
  .hm-tree .tree-row { display: flex; align-items: center; gap: 12px; font-size: 16px; margin-bottom: 10px; color: #333; line-height: 1.6; }
  .hm-tree .tree-row .icon { font-size: 22px; flex-shrink: 0; }
  .hm-tree .tree-row .label { font-weight: 800; }
  .hm-tree .tree-row .hint { font-size: 12px; color: #999; font-weight: 600; background: #fff; padding: 3px 10px; border-radius: 10px; margin-left: 8px; }
  .hm-tree .tree-row.indent-1 { padding-left: 32px; }
  .hm-tree .tree-row.indent-2 { padding-left: 64px; }
  .hm-tree .tree-row.indent-2 .label { color: #1a1a1a; font-weight: 700; }

  .hm-section-title { font-size: 15px; font-weight: 800; color: #1a1a1a; margin-bottom: 16px; padding-bottom: 10px; border-bottom: 2px solid #F4F3EE; }

  /* 4단계 — 세로 스택 (크게) */
  .hm-steps { display: flex; flex-direction: column; gap: 14px; }
  .hm-step { background: #F8F7F2; border-radius: 14px; padding: 20px 24px; display: grid; grid-template-columns: 1fr 280px; gap: 24px; align-items: center; }
  .hm-step .hm-left h3 { display: flex; align-items: center; font-size: 17px; font-weight: 800; margin-bottom: 8px; gap: 10px; }
  .hm-step .hm-num { display: inline-flex; width: 32px; height: 32px; background: #828DF8; color: #fff; border-radius: 50%; align-items: center; justify-content: center; font-size: 15px; font-weight: 900; flex-shrink: 0; }
  .hm-step .hm-left p { font-size: 13px; color: #555; line-height: 1.7; }
  .hm-step .hm-left p b { color: #1a1a1a; font-weight: 800; }

  /* 애니메이션 박스 — 크게 */
  .hm-anim { background: #fff; border-radius: 10px; padding: 14px; border: 1.5px solid #eee; height: 160px; display: flex; flex-direction: column; justify-content: center; gap: 6px; overflow: hidden; position: relative; }
  .hm-anim .a-proj { background: #fff; border: 1.5px solid #ddd; border-radius: 6px; padding: 8px 10px; display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; transition: all 0.3s; }
  .hm-anim .a-proj.sel { border-color: #F4A259; box-shadow: 0 0 0 1px #F4A259; background: #FFF6EA; }
  .hm-anim .a-box { display: inline-block; width: 14px; height: 14px; border: 1.5px solid #bbb; border-radius: 3px; flex-shrink: 0; transition: all 0.3s; position: relative; }
  .hm-anim .a-imgs { display: flex; gap: 4px; padding-left: 22px; }
  .hm-anim .a-img { width: 20px; height: 20px; border-radius: 3px; background: #e0ddd5; border: 2px solid transparent; transition: all 0.3s; }
  .hm-anim .a-img.sel { border-color: #F4A259; background: #F4A259; }

  /* Step 1: 이미지 선택 → 새 프로젝트 분리 애니메이션 */
  .anim-step1 .a-img.sel-target { animation: selFadeIn 3s infinite; }
  @keyframes selFadeIn {
    0%, 40% { background: #e0ddd5; border-color: transparent; transform: scale(1); }
    50%, 80% { background: #F4A259; border-color: #F4A259; transform: scale(1.2); }
    90%, 100% { background: #e0ddd5; border-color: transparent; transform: scale(1); }
  }
  .anim-step1 .a-split-proj { animation: splitIn 3s infinite; opacity: 0; max-height: 0; overflow: hidden; }
  @keyframes splitIn {
    0%, 50% { opacity: 0; max-height: 0; margin-top: 0; }
    70%, 100% { opacity: 1; max-height: 50px; margin-top: 6px; }
  }

  /* Step 2: + 버튼 hover 등장 + 빈 프로젝트 삽입 */
  .anim-step2 .a-plus-slot { height: 10px; background: transparent; position: relative; transition: all 0.3s; animation: plusSlot 3s infinite; }
  @keyframes plusSlot {
    0%, 30% { height: 10px; background: transparent; }
    40%, 70% { height: 28px; background: rgba(130,141,248,0.1); border-radius: 4px; }
    80%, 100% { height: 10px; background: transparent; }
  }
  .anim-step2 .a-plus { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 24px; height: 24px; background: #828DF8; color: #fff; border-radius: 50%; text-align: center; line-height: 24px; font-size: 16px; font-weight: 900; opacity: 0; animation: plusFade 3s infinite; }
  @keyframes plusFade {
    0%, 35% { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
    45%, 75% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    85%, 100% { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
  }
  .anim-step2 .a-new-proj { opacity: 0; max-height: 0; overflow: hidden; animation: newProj 3s infinite; }
  @keyframes newProj {
    0%, 70% { opacity: 0; max-height: 0; margin-top: 0; }
    85%, 100% { opacity: 1; max-height: 50px; margin-top: 6px; }
  }

  /* Step 3: 체크박스 토글 + 일괄 지정 */
  .anim-step3 .a-box.check-target { animation: boxCheck 3s infinite; }
  @keyframes boxCheck {
    0%, 25% { background: #fff; border-color: #bbb; }
    35%, 80% { background: #F4A259; border-color: #F4A259; }
    90%, 100% { background: #fff; border-color: #bbb; }
  }
  .anim-step3 .a-box.check-target::after { content: '✓'; position: absolute; top: -3px; left: 1px; color: #fff; font-size: 13px; font-weight: 900; opacity: 0; animation: checkMark 3s infinite; }
  @keyframes checkMark {
    0%, 30% { opacity: 0; }
    35%, 85% { opacity: 1; }
    90%, 100% { opacity: 0; }
  }
  .anim-step3 .a-bar { background: #1a1a1a; color: #fff; font-size: 11px; font-weight: 800; padding: 6px 12px; border-radius: 6px; text-align: center; opacity: 0; animation: barFade 3s infinite; margin-top: 6px; }
  @keyframes barFade {
    0%, 40% { opacity: 0; transform: translateY(-6px); }
    50%, 85% { opacity: 1; transform: translateY(0); }
    90%, 100% { opacity: 0; transform: translateY(-6px); }
  }

  /* Step 4: 드롭다운에서 + 새 카테고리 */
  .anim-step4 .a-dropdown { background: #fff; border: 1.5px solid #ddd; border-radius: 6px; padding: 6px 12px; font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px; animation: dropHighlight 3s infinite; }
  @keyframes dropHighlight {
    0%, 30% { border-color: #ddd; background: #fff; color: #555; }
    50%, 80% { border-color: #828DF8; background: #F4F3FF; color: #828DF8; }
    100% { border-color: #ddd; background: #fff; color: #555; }
  }
  .anim-step4 .a-new-cat { font-size: 12px; color: #10B981; font-weight: 800; opacity: 0; animation: newCatFade 3s infinite; margin-top: 8px; padding: 6px 12px; background: #ECFDF5; border-radius: 6px; text-align: center; }
  @keyframes newCatFade {
    0%, 60% { opacity: 0; }
    75%, 95% { opacity: 1; }
    100% { opacity: 0; }
  }

  .hm-foot { padding: 14px 22px; border-top: 1px solid #eee; display: flex; justify-content: flex-end; gap: 10px; }
  .hm-foot label { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #888; margin-right: auto; cursor: pointer; }
  .hm-foot button.primary { background: #828DF8; color: #fff; border: none; padding: 9px 20px; border-radius: 6px; font-weight: 700; cursor: pointer; font-size: 13px; }
  .hm-foot button.primary:hover { background: #6c76e0; }

  /* 헤더 ? 버튼 */
  header .help-btn { background: #333; color: #eee; border: none; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; font-size: 13px; font-weight: 800; transition: all 0.15s; }
  header .help-btn:hover { background: #828DF8; color: #fff; }
</style>
</head>
<body>
<header>
  <span class="tag">AI</span>
  <h1>자동 분류 결과 · 드래그 + 다중 선택으로 조정</h1>
  <span class="meta" id="meta"></span>
  <div class="spacer"></div>
  <button class="help-btn" id="btn-help" title="사용법 보기">?</button>
</header>

<!-- 첫 진입 튜토리얼 모달 -->
<div class="help-modal" id="help-modal">
  <div class="hm-box">
    <div class="hm-head">
      <span class="hm-tag">HOW TO</span>
      <h2>AI 분류 결과 검수하기</h2>
      <button class="hm-skip" id="hm-skip-top">건너뛰기 ✕</button>
    </div>
    <div class="hm-body">
      <!-- 폴더 구조 4단계 -->
      <div class="hm-tree">
        <h3>📂 폴더 구조 — 최종 정리 결과</h3>
        <div class="tree-row"><span class="icon">📦</span><span class="label" style="color:#1a1a1a">동기화 폴더</span><span class="hint">ASSI Sync 에서 선택한 루트</span></div>
        <div class="tree-row indent-1"><span class="icon">📁</span><span class="label" style="color:#EC4899">BEAUTY</span><span class="hint">카테고리</span></div>
        <div class="tree-row indent-2"><span class="icon">🗂️</span><span class="label">Dalba</span><span class="hint">프로젝트 · 이미지/비디오</span></div>
        <div class="tree-row indent-2"><span class="icon">🗂️</span><span class="label">KUNDAL</span></div>
        <div class="tree-row indent-1"><span class="icon">📁</span><span class="label" style="color:#F59E0B">FASHION</span><span class="hint">카테고리</span></div>
        <div class="tree-row indent-2"><span class="icon">🗂️</span><span class="label">Vogue Editorial</span></div>
      </div>

      <div class="hm-section-title">AI 분류가 틀렸다면 4가지로 고치세요</div>

      <div class="hm-steps">
        <!-- Step 1: 이미지 쪼개기 -->
        <div class="hm-step">
          <div class="hm-left">
            <h3><span class="hm-num">1</span>이미지 쪼개기</h3>
            <p>같은 브랜드로 묶였지만 실제로는 <b>다른 촬영</b>일 때.<br>이미지 클릭으로 체크 → <b>선택한 이미지로 새 프로젝트</b> 버튼.</p>
          </div>
          <div class="hm-anim anim-step1">
            <div class="a-proj"><span class="a-box"></span>Dalba <span style="margin-left:auto;color:#999;font-weight:500">4장</span></div>
            <div class="a-imgs">
              <span class="a-img"></span><span class="a-img"></span>
              <span class="a-img sel-target"></span><span class="a-img sel-target"></span>
            </div>
            <div class="a-proj a-split-proj"><span class="a-box"></span>새 프로젝트 <span style="margin-left:auto;color:#999;font-weight:500">2장</span></div>
          </div>
        </div>

        <!-- Step 2: + 버튼 -->
        <div class="hm-step">
          <div class="hm-left">
            <h3><span class="hm-num">2</span>프로젝트 사이에 추가</h3>
            <p>프로젝트 사이 공간에 마우스 올리면 <b>+</b> 버튼이 나타납니다.<br>클릭 → 빈 프로젝트 생성 → 이미지 드래그로 채우기.</p>
          </div>
          <div class="hm-anim anim-step2">
            <div class="a-proj"><span class="a-box"></span>Oliveyoung</div>
            <div class="a-plus-slot"><span class="a-plus">+</span></div>
            <div class="a-proj a-new-proj"><span class="a-box"></span>새 프로젝트</div>
            <div class="a-proj"><span class="a-box"></span>Round lab</div>
          </div>
        </div>

        <!-- Step 3: 일괄 카테고리 -->
        <div class="hm-step">
          <div class="hm-left">
            <h3><span class="hm-num">3</span>카테고리 일괄 지정</h3>
            <p>여러 프로젝트의 <b>체크박스</b>를 선택하면 상단에 검정 툴바가 나타납니다.<br>툴바에서 카테고리를 선택하면 <b>한 번에</b> 전부 배정.</p>
          </div>
          <div class="hm-anim anim-step3">
            <div class="a-proj"><span class="a-box check-target"></span>Dalba</div>
            <div class="a-proj"><span class="a-box check-target"></span>KUNDAL</div>
            <div class="a-proj"><span class="a-box"></span>Makeon</div>
            <div class="a-bar">2개 선택 · BEAUTY 일괄 지정</div>
          </div>
        </div>

        <!-- Step 4: 새 카테고리 -->
        <div class="hm-step">
          <div class="hm-left">
            <h3><span class="hm-num">4</span>새 카테고리 추가</h3>
            <p>기본 6개(BEAUTY·FASHION·VIDEO·CELEBRITY·AUDIO·PERSONAL WORK) 외가 필요하면,<br>카테고리 드롭다운 맨 아래 <b>+ 새 카테고리…</b> 로 커스텀 추가.</p>
          </div>
          <div class="hm-anim anim-step4">
            <div class="a-proj">
              <span class="a-box"></span>프로젝트
              <span class="a-dropdown" style="margin-left:auto">+ 새 카테고리 ▾</span>
            </div>
            <div class="a-new-cat">✓ "ADVERTISING" 추가됨</div>
          </div>
        </div>
      </div>
    </div>
    <div class="hm-foot">
      <label><input type="checkbox" id="hm-dontshow"> 다시 보지 않기</label>
      <button class="primary" id="hm-start">시작하기</button>
    </div>
  </div>
</div>
<!-- 상단 프로젝트 일괄 툴바 (프로젝트 체크 시 노출) -->
<div class="top-bar" id="top-bar">
  <span class="sel-count" id="tb-count"></span>
  <div class="sep"></div>
  <select id="tb-cat-assign"></select>
  <button id="tb-clear">선택 해제</button>
</div>
<main>
  <div class="hint">
    <b>💡 사용법</b><br>
    • <b>프로젝트 체크박스</b>로 여러 프로젝트 선택 → 하단 툴바에서 카테고리 일괄 지정 / 삭제<br>
    • <b>이미지 클릭(체크)</b>으로 선택 → 하단 <code>선택한 이미지로 새 프로젝트</code> → 같은 브랜드지만 다른 촬영 분리<br>
    • <b>프로젝트 사이 +버튼</b> 클릭 → 빈 프로젝트 삽입 후 이미지 드래그로 채우기<br>
    • <b>카테고리 드롭다운</b>의 <code>+ 새 카테고리</code> 로 커스텀 카테고리 추가
  </div>
  <div id="proj-stack"></div>
</main>

<div class="footer">
  <div class="stats" id="stats"></div>
  <button class="btn ghost" id="btn-reset">AI 결과로 되돌리기</button>
  <button class="btn" id="btn-export">확정 · 폴더 생성</button>
</div>
<div id="toast"></div>

<script>
const DATA = ${json};
const BUILTIN_CATS = ['AUDIO','BEAUTY','FASHION','VIDEO','CELEBRITY','PERSONAL WORK'];
let STATE = {
  projects: JSON.parse(JSON.stringify(DATA.projects)),
  customCats: [],  // 사용자가 추가한 커스텀 카테고리
}
let selImages = new Set()  // 선택된 이미지 fileName
let selProjects = new Set()  // 선택된 프로젝트 id (pi 인덱스 X — 삭제 시 변하므로 project 객체 레퍼런스)

const el = s => document.querySelector(s)
const els = s => [...document.querySelectorAll(s)]
function esc(s) { return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) }
function toast(m, ms=1800) { const t=el('#toast'); t.textContent=m; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), ms) }
function allCats() { return [...BUILTIN_CATS, ...STATE.customCats] }

// 프로젝트 객체에 안정적 id 부여 (초기화 시)
STATE.projects.forEach((p, i) => { if (!p._id) p._id = 'p-' + i + '-' + Math.random().toString(36).slice(2, 6) })

el('#meta').textContent = DATA.sourceName + ' · 이미지 ' + DATA.totalImages + ' · ' + DATA.modelTag

// ─── 메인 렌더 ───
function render() {
  const stack = el('#proj-stack')
  stack.innerHTML = ''

  // 카테고리별 그룹화 (미배정 → 각 카테고리 순)
  const unassigned = []
  const catMap = new Map()
  for (const c of allCats()) catMap.set(c, [])
  for (const p of STATE.projects) {
    if (!p.category) unassigned.push(p)
    else if (catMap.has(p.category)) catMap.get(p.category).push(p)
    else { // 저장은 됐지만 현재 cats 목록에 없는 경우 (예: 삭제됨) → 유지하되 unassigned
      if (!catMap.has(p.category)) catMap.set(p.category, [])
      catMap.get(p.category).push(p)
    }
  }

  const sections = []
  if (unassigned.length) sections.push({ cat: null, label: '미배정', projs: unassigned })
  for (const [c, ps] of catMap) if (ps.length) sections.push({ cat: c, label: c, projs: ps })

  for (const sec of sections) {
    const secDiv = document.createElement('div')
    secDiv.className = 'cat-section'
    const imgTotal = sec.projs.reduce((s, p) => s + p.imageFileNames.length, 0)
    secDiv.innerHTML =
      '<div class="cat-header" data-cat="' + esc(sec.cat || '') + '">' +
        '<span class="cat-badge"><span class="dot"></span>' + esc(sec.label) + '</span>' +
        '<span class="cat-count">프로젝트 ' + sec.projs.length + ' · 이미지 ' + imgTotal + '</span>' +
        '<span class="cat-line"></span>' +
      '</div>'
    stack.appendChild(secDiv)

    // 섹션 시작 전 + 슬롯
    secDiv.appendChild(makeSlot(sec.projs[0]._id, 'before'))

    sec.projs.forEach((p, i) => {
      secDiv.appendChild(renderProject(p))
      // 각 프로젝트 뒤에 + 슬롯
      secDiv.appendChild(makeSlot(p._id, 'after'))
    })
  }

  attachProjectEvents()
  updateSelBar()
  updateStats()
}

function renderProject(p) {
  const pdiv = document.createElement('div')
  // 이 프로젝트에 선택된 이미지가 몇 개 있는지 (인라인 액션 바 표시용)
  const selectedInThis = p.imageFileNames.filter(fn => selImages.has(fn)).length
  pdiv.className = 'proj' + (selProjects.has(p._id) ? ' p-selected' : '') + (selectedInThis > 0 ? ' has-selected-imgs' : '')
  pdiv.dataset.pid = p._id
  const firstFn = p.imageFileNames[0]
  const titleFn = firstFn

  const catOptions = '<option value="">카테고리 ▾</option>' +
    allCats().map(c => '<option value="' + esc(c) + '"' + (p.category === c ? ' selected' : '') + '>' + esc(c) + '</option>').join('') +
    '<option value="__NEW__">+ 새 카테고리…</option>'

  pdiv.innerHTML =
    '<div class="proj-head">' +
      '<input type="checkbox" class="p-check" ' + (selProjects.has(p._id) ? 'checked' : '') + '>' +
      '<input class="title" value="' + esc(p.title) + '">' +
      '<span class="cnt">' + p.imageFileNames.length + '장</span>' +
      '<select class="cat" data-set="' + (p.category ? 1 : 0) + '">' + catOptions + '</select>' +
      '<button class="del" title="프로젝트 삭제">✕</button>' +
    '</div>' +
    // 선택된 이미지가 있을 때만 보이는 액션 바
    '<div class="img-sel-actions">' +
      '<span>✓ ' + selectedInThis + '장 선택됨</span>' +
      '<button class="proj-new-from-sel">선택한 이미지로 새 프로젝트</button>' +
      '<button class="ghost proj-clear-sel">선택 해제</button>' +
    '</div>' +
    '<div class="proj-imgs">' +
      p.imageFileNames.map(fn => {
        const im = DATA.imagesByFn[fn] || {}
        const isTitle = fn === titleFn
        const isSel = selImages.has(fn)
        return '<div class="img-cell' + (isSel ? ' selected' : '') + (isTitle ? ' is-title' : '') + '" draggable="true" data-fn="' + esc(fn) + '">' +
          '<div class="check"></div>' +
          (im.thumbUrl ? '<img src="' + im.thumbUrl + '" loading="lazy">' : '') +
          (im.slideIndex >= 0 ? '<span class="slide-n">S' + (im.slideIndex + 1) + '</span>' : '') +
        '</div>'
      }).join('') +
    '</div>' +
    (p.reasoning ? '<div class="reasoning">' + esc(p.reasoning) + '</div>' : '')

  return pdiv
}

function makeSlot(anchorId, pos) {
  const div = document.createElement('div')
  div.className = 'proj-slot'
  div.dataset.anchor = anchorId
  div.dataset.pos = pos
  div.innerHTML = '<button class="add-btn" title="여기에 새 프로젝트 추가">+</button>'
  return div
}

// ─── 이벤트 부착 ───
function attachProjectEvents() {
  // 제목 편집
  els('.proj input.title').forEach(inp => {
    inp.addEventListener('input', e => {
      const pid = e.target.closest('.proj').dataset.pid
      const p = STATE.projects.find(x => x._id === pid)
      if (p) { p.title = e.target.value; updateStats() }
    })
  })
  // 카테고리 변경 (+ 새 카테고리 처리)
  els('.proj select.cat').forEach(sel => {
    sel.addEventListener('change', e => {
      const pid = e.target.closest('.proj').dataset.pid
      const p = STATE.projects.find(x => x._id === pid)
      if (!p) return
      if (e.target.value === '__NEW__') {
        const name = prompt('새 카테고리 이름 (영문/한글):')
        if (name && name.trim()) {
          const nm = name.trim().toUpperCase()
          if (!STATE.customCats.includes(nm) && !BUILTIN_CATS.includes(nm)) STATE.customCats.push(nm)
          p.category = nm
        } else {
          e.target.value = p.category || ''
        }
      } else {
        p.category = e.target.value || null
      }
      render()
    })
  })
  // 프로젝트 삭제
  els('.proj button.del').forEach(btn => {
    btn.addEventListener('click', e => {
      const pid = e.target.closest('.proj').dataset.pid
      deleteProjectById(pid)
    })
  })
  // 프로젝트 체크박스 (change 이벤트 — native 토글과 동기화)
  els('.proj .p-check').forEach(cb => {
    cb.addEventListener('change', e => {
      const pid = e.target.closest('.proj').dataset.pid
      if (e.target.checked) selProjects.add(pid)
      else selProjects.delete(pid)
      render()
    })
  })
  // 프로젝트 내부 "선택한 이미지로 새 프로젝트" 버튼
  els('.proj .proj-new-from-sel').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation()
      const pid = e.target.closest('.proj').dataset.pid
      const p = STATE.projects.find(x => x._id === pid)
      if (!p) return
      const fns = p.imageFileNames.filter(fn => selImages.has(fn))
      if (fns.length === 0) { toast('이미지를 먼저 선택하세요'); return }
      insertNewProjectAtSlot(pid, 'after', fns)
      toast(fns.length + '장으로 새 프로젝트 생성')
    })
  })
  // 프로젝트 내부 "선택 해제" 버튼
  els('.proj .proj-clear-sel').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation()
      const pid = e.target.closest('.proj').dataset.pid
      const p = STATE.projects.find(x => x._id === pid)
      if (!p) return
      for (const fn of p.imageFileNames) selImages.delete(fn)
      render()
    })
  })
  // 이미지 셀 (클릭 = 선택 토글, 드래그)
  els('.img-cell').forEach(cell => {
    cell.addEventListener('click', e => {
      const fn = cell.dataset.fn
      if (e.shiftKey || e.ctrlKey || e.metaKey || selImages.size > 0) {
        if (selImages.has(fn)) selImages.delete(fn)
        else selImages.add(fn)
      } else {
        selImages.clear()
        selImages.add(fn)
      }
      render()
    })
    cell.addEventListener('dragstart', e => {
      const fn = cell.dataset.fn
      if (!selImages.has(fn)) { selImages.clear(); selImages.add(fn) }
      e.dataTransfer.setData('text/plain', 'imgs:' + [...selImages].join('|'))
      e.dataTransfer.effectAllowed = 'move'
    })
  })
  // 프로젝트 drop zone (이미지 이동용)
  els('.proj').forEach(pd => {
    pd.addEventListener('dragover', e => { e.preventDefault(); pd.classList.add('drag-over') })
    pd.addEventListener('dragleave', () => pd.classList.remove('drag-over'))
    pd.addEventListener('drop', e => {
      e.preventDefault(); pd.classList.remove('drag-over')
      const data = e.dataTransfer.getData('text/plain')
      if (!data.startsWith('imgs:')) return
      const fns = data.slice(5).split('|').filter(Boolean)
      const pid = pd.dataset.pid
      const target = STATE.projects.find(x => x._id === pid)
      if (target) moveImagesTo(fns, target)
    })
  })
  // + 슬롯 (버튼 클릭 = 빈 프로젝트 / drop = 새 프로젝트 with 이미지)
  els('.proj-slot').forEach(slot => {
    slot.addEventListener('dragover', e => { e.preventDefault(); slot.classList.add('drag-over') })
    slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'))
    slot.addEventListener('drop', e => {
      e.preventDefault(); slot.classList.remove('drag-over')
      const data = e.dataTransfer.getData('text/plain')
      if (!data.startsWith('imgs:')) return
      const fns = data.slice(5).split('|').filter(Boolean)
      insertNewProjectAtSlot(slot.dataset.anchor, slot.dataset.pos, fns)
    })
    slot.querySelector('.add-btn').addEventListener('click', e => {
      e.stopPropagation()
      insertNewProjectAtSlot(slot.dataset.anchor, slot.dataset.pos, [])
    })
  })
}

// ─── 상태 조작 ───
function moveImagesTo(fns, target) {
  for (const fn of fns) {
    for (const p of STATE.projects) {
      const i = p.imageFileNames.indexOf(fn)
      if (i >= 0 && p !== target) p.imageFileNames.splice(i, 1)
    }
    if (!target.imageFileNames.includes(fn)) target.imageFileNames.push(fn)
  }
  STATE.projects = STATE.projects.filter(p => p.imageFileNames.length > 0 || p._keepEmpty)
  selImages.clear()
  render()
}

function insertNewProjectAtSlot(anchorId, pos, fns) {
  const np = { _id: 'p-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), title: '새 프로젝트', category: null, imageFileNames: [], reasoning: '', _keepEmpty: fns.length === 0 }
  for (const fn of fns) {
    for (const p of STATE.projects) {
      const i = p.imageFileNames.indexOf(fn)
      if (i >= 0) p.imageFileNames.splice(i, 1)
    }
    np.imageFileNames.push(fn)
  }
  const anchorIdx = STATE.projects.findIndex(x => x._id === anchorId)
  const insertAt = pos === 'before' ? anchorIdx : anchorIdx + 1
  STATE.projects.splice(insertAt, 0, np)
  STATE.projects = STATE.projects.filter(p => p.imageFileNames.length > 0 || p._keepEmpty)
  selImages.clear()
  render()
}

function deleteProjectById(pid) {
  const idx = STATE.projects.findIndex(x => x._id === pid)
  if (idx < 0) return
  const p = STATE.projects[idx]
  if (p.imageFileNames.length > 0 && !confirm(p.imageFileNames.length + '장 이미지가 미분류로 이동합니다. 계속?')) return
  STATE.projects.splice(idx, 1)
  if (p.imageFileNames.length > 0) {
    let misc = STATE.projects.find(x => x.title === '미분류')
    if (!misc) {
      misc = { _id: 'p-misc-' + Date.now(), title: '미분류', category: null, imageFileNames: [], reasoning: '' }
      STATE.projects.push(misc)
    }
    misc.imageFileNames.push(...p.imageFileNames)
  }
  selProjects.delete(pid)
  render()
}

// ─── 상단 프로젝트 일괄 툴바 (프로젝트 선택 시만 노출) ───
function updateSelBar() {
  const bar = el('#top-bar')
  const projN = selProjects.size
  if (projN === 0) { bar.classList.remove('show'); return }
  bar.classList.add('show')
  el('#tb-count').textContent = projN + '개 프로젝트 선택'
  const sel = el('#tb-cat-assign')
  sel.innerHTML = '<option value="">카테고리 일괄 지정 ▾</option>' +
    allCats().map(c => '<option value="' + esc(c) + '">' + esc(c) + '</option>').join('') +
    '<option value="__CLEAR__">— 카테고리 제거</option>' +
    '<option value="__NEW__">+ 새 카테고리…</option>'
}

el('#tb-cat-assign').addEventListener('change', e => {
  const v = e.target.value
  if (!v) return
  let cat = v
  if (v === '__NEW__') {
    const name = prompt('새 카테고리 이름:')
    if (!name || !name.trim()) { e.target.value = ''; return }
    cat = name.trim().toUpperCase()
    if (!STATE.customCats.includes(cat) && !BUILTIN_CATS.includes(cat)) STATE.customCats.push(cat)
  } else if (v === '__CLEAR__') {
    cat = null
  }
  for (const pid of selProjects) {
    const p = STATE.projects.find(x => x._id === pid)
    if (p) p.category = cat
  }
  toast(selProjects.size + '개 프로젝트 카테고리 일괄 지정')
  selProjects.clear()
  e.target.value = ''
  render()
})

el('#tb-clear').addEventListener('click', () => {
  selProjects.clear()
  render()
})

function updateStats() {
  const total = STATE.projects.reduce((s, p) => s + p.imageFileNames.length, 0)
  const assigned = STATE.projects.filter(p => p.category).length
  el('#stats').innerHTML = '프로젝트 <b>' + STATE.projects.length + '</b> · 카테고리 배정 <b>' + assigned + '/' + STATE.projects.length + '</b> · 이미지 <b>' + total + '</b>'
}

el('#btn-reset').addEventListener('click', () => {
  if (!confirm('모든 수동 편집 취소하고 AI 결과로 복원?')) return
  STATE = { projects: JSON.parse(JSON.stringify(DATA.projects)), customCats: [] }
  STATE.projects.forEach((p, i) => { if (!p._id) p._id = 'p-' + i + '-' + Math.random().toString(36).slice(2, 6) })
  selImages.clear()
  selProjects.clear()
  render()
  toast('초기 상태로 복원')
})
el('#btn-export').addEventListener('click', async () => {
  const out = {
    sourceName: DATA.sourceName,
    categories: [...BUILTIN_CATS, ...STATE.customCats],
    projects: STATE.projects.filter(p => p.imageFileNames.length > 0).map((p, i) => ({
      title: p.title, category: p.category, order: i,
      thumbnailFileName: p.imageFileNames[0],
      imageFileNames: p.imageFileNames,
    })),
  }
  // Electron 환경: ASSI Sync 의 watchDir 에 직접 적용
  if (window.api?.keynoteApply && DATA.sessionId) {
    try {
      toast('폴더 생성 중...', 3000)
      const r = await window.api.keynoteApply({ sessionId: DATA.sessionId, classification: out })
      if (r.ok) {
        toast('✓ ' + r.projectsCreated + '개 프로젝트 · ' + r.filesCopied + '장 파일 복사 완료', 3000)
        setTimeout(() => { try { window.close() } catch {} }, 2500)
      } else {
        toast('실패: ' + r.error, 5000)
      }
    } catch (e) { toast('오류: ' + e.message, 5000) }
    return
  }
  // 웹 브라우저 환경 (스크립트 직접 실행): JSON 다운로드
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'classification.json'; a.click()
  toast('JSON 내보내기 완료 (' + out.projects.length + '개 프로젝트)')
})

// 빈 영역 클릭 시 이미지 선택만 해제 (프로젝트 선택은 명시적 체크박스로만 관리)
document.addEventListener('click', e => {
  if (e.target.closest('.proj') || e.target.closest('.top-bar') || e.target.closest('.proj-slot') || e.target.closest('.help-modal') || e.target.closest('button')) return
  if (selImages.size > 0) {
    selImages.clear(); render()
  }
})

// 튜토리얼 모달 — localStorage 가드 (Electron 내부 웹뷰 및 file:// 브라우저 둘 다 동작)
try {
  const seen = (typeof localStorage !== 'undefined') ? localStorage.getItem('assi_keynote_help_seen_v1') : null
  if (!seen) el('#help-modal').classList.add('show')
} catch {}

el('#btn-help').addEventListener('click', () => el('#help-modal').classList.add('show'))
el('#hm-skip-top').addEventListener('click', () => el('#help-modal').classList.remove('show'))
el('#hm-start').addEventListener('click', () => {
  if (el('#hm-dontshow').checked) {
    try { localStorage.setItem('assi_keynote_help_seen_v1', '1') } catch {}
  }
  el('#help-modal').classList.remove('show')
})
el('#help-modal').addEventListener('click', e => {
  if (e.target.id === 'help-modal') el('#help-modal').classList.remove('show')
})

render()
</script>
</body></html>`
}

if (require.main === module) {
  main().catch(e => { console.error('FAIL:', e); process.exit(1) })
}

module.exports = { buildReviewHtml }
