// ASSI Sync — Keynote AI 분류 (main process 용 모듈)
// scripts/keynote-ai-classify.js 의 로직을 함수화

const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const MODEL_SONNET = 'claude-sonnet-4-20250514'
const THUMB_SIZE = 260
const COLS = 6
const PER_TILE = 30
const GAP = 6
const CATEGORIES = ['AUDIO', 'BEAUTY', 'FASHION', 'VIDEO', 'CELEBRITY', 'PERSONAL WORK']

async function buildTiles(images) {
  const tiles = []
  const CELL = THUMB_SIZE
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
      } catch {}
      const label = `<svg width="${CELL}" height="26"><rect width="${CELL}" height="26" fill="rgba(130,141,248,0.92)"/><text x="${CELL/2}" y="18" font-family="Arial" font-size="15" font-weight="900" fill="white" text-anchor="middle">#${idx}</text></svg>`
      composites.push({ input: Buffer.from(label), top: y, left: x })
    }
    const tileBuf = await sharp({ create: { width: tileW, height: tileH, channels: 3, background: '#1a1a1a' } })
      .composite(composites).jpeg({ quality: 78 }).toBuffer()
    tiles.push({ buf: tileBuf, start, end: start + chunk.length - 1 })
  }
  return tiles
}

function buildPrompt(images, tileCount) {
  const bySlideFull = new Map()
  const tokenFreq = new Map()
  for (let i = 0; i < images.length; i++) {
    const k = images[i].slideIndex
    if (!bySlideFull.has(k)) bySlideFull.set(k, { title: images[i].slideTitle, tokens: images[i].textTokens || [], idxs: [] })
    bySlideFull.get(k).idxs.push(i)
  }
  for (const [, v] of bySlideFull) for (const t of new Set(v.tokens)) tokenFreq.set(t, (tokenFreq.get(t) || 0) + 1)
  const totalSlides = bySlideFull.size
  const commonTokens = [...tokenFreq.entries()].filter(([, n]) => n >= Math.max(3, Math.floor(totalSlides * 0.4))).map(([t]) => t)
  const slideLines = [...bySlideFull.entries()].sort((a,b)=>a[0]-b[0]).map(([si, v]) => {
    const t = v.title && !/^슬라이드\s*\d+$/i.test(v.title) ? `"${v.title}"` : '(placeholder)'
    const meaningful = v.tokens.filter(tk => !commonTokens.includes(tk))
    const tokens = meaningful.length > 0 ? ` · 내부텍스트=[${meaningful.slice(0, 8).map(s => '"' + s + '"').join(', ')}]` : ''
    return `슬라이드 ${si + 1}  title=${t}${tokens}  →  #${v.idxs.join(', #')}`
  }).join('\n')
  const signatureNote = commonTokens.length > 0
    ? `\n【작가/스튜디오 서명 (무시할 것)】\n${commonTokens.map(t => `"${t}"`).join(', ')}\n→ ${totalSlides}개 슬라이드 중 절반 이상에 등장 = 작가 서명. 프로젝트 제목으로 사용 금지.\n`
    : ''
  return `
당신은 크리에이티브 스태프 포트폴리오 Keynote 를 프로젝트 단위로 정리하는 전문가입니다.

【입력】
${tileCount}개의 composite 타일에 총 ${images.length}장의 썸네일이 #번호 라벨과 함께 박혀 있습니다.

【슬라이드 구성표】
${slideLines}
${signatureNote}

【규칙】
■ 규칙 1 — 같은 슬라이드 이미지 = 한 프로젝트 (기본). 갤러리형(각 썸네일에 다른 캡션)만 예외.
■ 규칙 2 — 슬라이드 내부텍스트 = 1차 기준. 브랜드명 바뀌면 새 프로젝트. placeholder 면 이미지 시각 단서로.
■ 규칙 3 — 다른 브랜드 = 무조건 별개 프로젝트. "X x Y" 콜라보 제목 임의 생성 금지. 스태프 서명은 제목에서 제거.
■ 규칙 4 — 슬라이드 경계 우선. 같은 브랜드가 두 슬라이드에 모두 나타날 때만 합치기.

카테고리: AUDIO / BEAUTY / FASHION / VIDEO / CELEBRITY / PERSONAL WORK 중 하나 또는 null.

출력: classify_projects 도구 사용. 각 프로젝트 = title / category / imageIndexes / titleIndicatorIndex / reasoning.
모든 이미지(#0~#${images.length-1})가 정확히 한 프로젝트에 속해야 함.
`.trim()
}

const CLASSIFY_TOOL = {
  name: 'classify_projects',
  description: 'Keynote 포트폴리오 프로젝트 분류 결과',
  input_schema: {
    type: 'object',
    properties: {
      projects: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            category: { type: ['string','null'], enum: [...CATEGORIES, null] },
            imageIndexes: { type: 'array', items: { type: 'integer' } },
            titleIndicatorIndex: { type: ['integer','null'] },
            reasoning: { type: 'string' },
          },
          required: ['title', 'imageIndexes'],
        },
      },
    },
    required: ['projects'],
  },
}

async function classifyWithClaude({ apiKey, images, model = MODEL_SONNET, onProgress }) {
  onProgress?.({ phase: 'tile', done: 0, total: Math.ceil(images.length / PER_TILE) })
  const tiles = await buildTiles(images)
  onProgress?.({ phase: 'tile', done: tiles.length, total: tiles.length })

  const content = []
  content.push({ type: 'text', text: buildPrompt(images, tiles.length) })
  for (const t of tiles) {
    content.push({ type: 'text', text: `[타일] #${t.start} ~ #${t.end}` })
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: t.buf.toString('base64') } })
  }
  const metaLines = images.map((im, i) => `#${i} slide${im.slideIndex + 1} pos${im.positionInSlide} title="${(im.slideTitle || '').slice(0, 40)}"`).join('\n')
  content.push({ type: 'text', text: `【이미지 메타】\n${metaLines}` })

  onProgress?.({ phase: 'claude', status: 'calling' })
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model, max_tokens: 8192,
      tools: [CLASSIFY_TOOL],
      tool_choice: { type: 'tool', name: 'classify_projects' },
      messages: [{ role: 'user', content }],
    }),
  })
  if (!resp.ok) {
    const txt = await resp.text()
    throw new Error(`Claude API ${resp.status}: ${txt.slice(0, 400)}`)
  }
  const json = await resp.json()
  const toolUse = json.content.find(b => b.type === 'tool_use')
  if (!toolUse) throw new Error('tool_use 응답 없음')
  const raw = toolUse.input
  onProgress?.({ phase: 'claude', status: 'done', usage: json.usage })

  const projects = (raw.projects || []).map((p, i) => ({
    title: p.title,
    category: CATEGORIES.includes(p.category) ? p.category : null,
    imageFileNames: (p.imageIndexes || []).map(idx => images[idx]?.fileName).filter(Boolean),
    reasoning: p.reasoning || '',
    titleIndicatorIndex: p.titleIndicatorIndex ?? null,
    order: i,
  }))

  // Overview 자동 제외
  const OVERVIEW_RE = /overview|portfolio|contact.?sheet|gallery|collection|갤러리|전체|요약|커버|목차|인덱스/i
  const kept = []
  const excluded = []
  for (const p of projects) {
    const looksOverview = p.imageFileNames.length >= 30 && (OVERVIEW_RE.test(p.title || '') || OVERVIEW_RE.test(p.reasoning || ''))
    if (looksOverview) excluded.push(p)
    else kept.push(p)
  }

  return { projects: kept, excludedOverview: excluded, raw, usage: json.usage }
}

module.exports = { classifyWithClaude, CATEGORIES }
