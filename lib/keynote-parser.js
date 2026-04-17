// ASSI Sync — Keynote (.key) 파일 파서
// .key 는 ZIP 컨테이너 + Index/*.iwa (Apple 독자 Protobuf) + Data/ (원본 이미지)
//
// 이 모듈 역할:
//   1. .key 열기 (yauzl 스트리밍)
//   2. Index/*.iwa 파싱 (keynote-parser2 래퍼)
//   3. 슬라이드 ↔ 이미지 매핑 구축 → 초기 그룹 제안
//   4. Data/ 엔트리 목록 추출
//
// MVP 접근: 슬라이드 순서 기반 초기 그룹 (slide.name 또는 "슬라이드 N").
// 타이틀 텍스트 추출은 Placeholder→StorageArchive 체인이 복잡해서 Phase B.
// 파싱 자체가 실패하면 "미분류" 단일 그룹으로 폴백.

const yauzl = require('yauzl')
const path = require('path')

let keynoteParser = null
function getKeynoteParser() {
  if (!keynoteParser) {
    try { keynoteParser = require('keynote-parser2') }
    catch (e) { console.warn('[KeynoteParser] keynote-parser2 load failed:', e.message) }
  }
  return keynoteParser
}

// ─── 파일 열기 (lazy entries) ───
function openArchive(filePath) {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true, autoClose: false }, (err, zip) => {
      if (err) reject(err)
      else resolve(zip)
    })
  })
}

// ─── 엔트리 전체 스캔: 분류만 하고 데이터는 아직 읽지 않음 ───
function scanEntries(zip) {
  return new Promise((resolve, reject) => {
    const entries = { iwa: [], data: [], other: [] }
    zip.on('entry', (entry) => {
      const name = entry.fileName
      if (/^Index\/.*\.iwa$/i.test(name)) entries.iwa.push(entry)
      else if (/^Data\//i.test(name) && !name.endsWith('/')) entries.data.push(entry)
      else entries.other.push(entry)
      zip.readEntry()
    })
    zip.on('end', () => resolve(entries))
    zip.on('error', reject)
    zip.readEntry()
  })
}

// ─── Buffer 로 읽기 ───
function readEntryBuffer(zip, entry) {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (err, rs) => {
      if (err) return reject(err)
      const chunks = []
      rs.on('data', c => chunks.push(c))
      rs.on('end', () => resolve(Buffer.concat(chunks)))
      rs.on('error', reject)
    })
  })
}

// ─── iwa 파일 하나 → 메시지 맵 (archiveId → [{name, msg}]) ───
function parseIwaBuffer(buf) {
  const kp = getKeynoteParser()
  if (!kp) throw new Error('keynote-parser2 unavailable')
  const iwa = kp.parseIwa(buf)
  const out = new Map()
  for (const [id, archive] of Object.entries(iwa)) {
    out.set(id, archive.messages.map(m => ({
      name: m.messageProtoName,
      msg: m.message,
    })))
  }
  return out
}

// protobuf Long | number | string → 10진수 문자열 정규화
function normalizeId(v) {
  if (v == null) return null
  if (typeof v === 'string' || typeof v === 'number') return String(v)
  if (typeof v === 'object') {
    // Long { low, high, unsigned }
    if ('low' in v && 'high' in v) {
      if (v.high === 0 || v.high === -0) return String(v.low >>> 0)
      // BigInt 조합
      try { return (BigInt(v.high) * BigInt(0x100000000) + BigInt(v.low >>> 0)).toString() }
      catch { return String(v.low) }
    }
    if (typeof v.toString === 'function') {
      const s = v.toString()
      if (/^\d+$/.test(s)) return s
    }
  }
  return null
}

// ─── 전체 iwa 머지 → 한 방에 모든 archive 조회 가능한 Map ───
// 추가: iwaByArchiveId (archiveId → iwaFileName) + iwaTextTokens (iwaFileName → string[])
// iwaTextTokens 는 각 iwa 버퍼에서 UTF-8 사용자 입력 텍스트를 무식 스크레이핑한 결과.
// parser 가 공식 필드로 못 뽑는 "텍스트 박스 내용" 을 복구하기 위한 fallback.
async function parseAllIwa(zip, iwaEntries, onProgress) {
  const archives = new Map()        // archiveId → [{name, msg}]
  const iwaByArchiveId = new Map()   // archiveId → iwaFileName (Slide-xxx.iwa)
  const iwaTextTokens = new Map()    // iwaFileName → string[] (user text)
  let done = 0
  for (const entry of iwaEntries) {
    try {
      const buf = await readEntryBuffer(zip, entry)
      const partial = parseIwaBuffer(buf)
      for (const [id, msgs] of partial) {
        archives.set(id, msgs)
        iwaByArchiveId.set(id, entry.fileName)
      }
      // Slide-*.iwa 에만 텍스트 스크레이프 (용량/시간 절약)
      if (/\/Slide[^/]*\.iwa$/i.test(entry.fileName)) {
        iwaTextTokens.set(entry.fileName, scrapeUserText(buf))
      }
    } catch (e) {
      console.warn('[KeynoteParser] iwa parse failed:', entry.fileName, e.message)
    }
    done++
    onProgress?.({ phase: 'parsing-iwa', done, total: iwaEntries.length })
  }
  return { archives, iwaByArchiveId, iwaTextTokens }
}

// iwa 바이너리에서 사용자 입력 텍스트 추출 (Gemini 자문 기반 Raw Buffer Scraping).
// Apple protobuf 가 string 필드를 UTF-8 평문으로 저장하므로, 압축 해제 없이도 영/한글 토큰이 보임.
// 기술 식별자(KN.xxx, TSWP.xxx), placeholder 이름("제목 슬라이드" 등), 바이너리 노이즈는 제외.
function scrapeUserText(buf) {
  const text = buf.toString('utf8')
  // 최소 2자, 최대 80자. 필터링은 아래에서 (한글/ASCII 분기).
  const re = /[A-Za-z가-힣][A-Za-z가-힣0-9 \-_.,&'()\/~:!?]{1,80}/g
  const out = new Set()
  const STOP = new Set([
    'decimal', 'en', 'ko', 'gregorian', 'latn', 'none',
    'Transition', 'Slide', '제목 슬라이드', '제목 및 내용', '구역 머리글', '제목 텍스트',
    '개체 틀', '바닥글 개체 틀', '바닥글', '빈 화면', '사진', '캡션 있는 그림',
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
    '1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월',
    '일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일',
  ])
  let m
  while ((m = re.exec(text)) != null) {
    const s = m[0].trim()
    if (s.length < 2 || s.length > 100) continue
    if (/^\d/.test(s)) continue
    if (/^(KN|TS[A-Z]+|SF[A-Z]+|MFT|MFS|Mutable|Immutable)\./.test(s)) continue
    if (/Archive$|Storage$|Info$|Record$/.test(s)) continue
    if (/^그림\s?\d+/.test(s)) continue
    if (/^그룹\s?\d+/.test(s)) continue
    if (/^직사각형\s?\d+/.test(s)) continue
    if (/^직선\s?연결선\s?\d+/.test(s)) continue
    if (/^TextBox\s?\d+/.test(s)) continue
    if (/^\d+_/.test(s)) continue
    if (STOP.has(s)) continue
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) continue

    const asciiPortion = s.replace(/[^A-Za-z]/g, '')
    const koreanPortion = s.replace(/[^가-힣]/g, '')

    if (koreanPortion.length >= 2) {
      // 한글 2자 이상: 통과
    } else if (asciiPortion.length >= 4) {
      // 영문 4자 이상: 모음 체크 (브랜드명 대부분 4자 이상)
      if (!/[aeiouAEIOU]/.test(asciiPortion)) continue
      // 바이너리 노이즈 패턴: mixed case 짧은 조각 (예: "NEc", "LEc s", "NEc so")
      if (/^[A-Z]{2,3}[a-z]{1,2}\s*[a-z]{0,3}$/.test(s)) continue
      // 공백 포함 시 모든 단어가 3자 이상이어야 함 (노이즈: "NEc so", "LEc s")
      if (/\s/.test(s)) {
        const words = s.split(/\s+/).filter(Boolean)
        if (words.some(w => w.length < 3)) continue
      }
    } else {
      // 영문 3자 이하: 제외 (BNI, UFC 같은 iwa 노이즈 차단)
      continue
    }

    // 스페셜 문자 비율 > 40% 잡음
    const specialCount = (s.match(/[^A-Za-z가-힣0-9 ]/g) || []).length
    if (specialCount / s.length > 0.4) continue
    out.add(s)
  }
  return [...out]
}

// 특정 archive의 첫 메시지 타입
function firstMessage(archives, id, typeName) {
  const msgs = archives.get(String(id))
  if (!msgs) return null
  for (const m of msgs) if (m.name === typeName) return m.msg
  return null
}

// 어떤 타입이든 첫 매치
function firstAnyMessage(archives, id) {
  const msgs = archives.get(String(id))
  return msgs && msgs[0] ? msgs[0] : null
}

// ─── 텍스트 플레이스홀더에서 텍스트 추출 (best effort, 실패 시 null) ───
// KN.PlaceholderArchive → (깊은 super 체인) → TSWP.StorageArchive 참조
// Placeholder의 contained_storage 같은 필드는 버전별 다름. 일단 간단히 트리 워크.
function extractTextFromRefs(archives, rootId, depth = 0) {
  if (depth > 6) return null
  const msgs = archives.get(normalizeId(rootId) || String(rootId))
  if (!msgs) return null
  for (const m of msgs) {
    // TSWP.StorageArchive는 직접 text 필드
    if (m.name === 'TSWP.StorageArchive' && m.msg?.text) {
      const joined = (Array.isArray(m.msg.text) ? m.msg.text : [m.msg.text]).join(' ').trim()
      if (joined) return joined
    }
    // 자식 identifier들을 DFS
    const childIds = collectIdentifiers(m.msg, 4)
    for (const cid of childIds) {
      if (cid === String(rootId)) continue
      const t = extractTextFromRefs(archives, cid, depth + 1)
      if (t) return t
    }
  }
  return null
}

function collectIdentifiers(obj, maxDepth) {
  const out = []
  function walk(v, d) {
    if (d > maxDepth) return
    if (!v) return
    if (Array.isArray(v)) { for (const x of v) walk(x, d + 1); return }
    if (typeof v === 'object') {
      if (v.identifier && typeof v.identifier === 'string') out.push(v.identifier)
      for (const k of Object.keys(v)) walk(v[k], d + 1)
    }
  }
  walk(obj, 0)
  return out
}

// ─── 슬라이드 목록 + 각 슬라이드의 이미지 archiveIds 수집 ───
function collectSlides(archives) {
  const slides = []
  for (const [id, msgs] of archives) {
    for (const m of msgs) {
      if (m.name !== 'KN.SlideArchive') continue
      const slide = m.msg || {}
      const name = slide.name || null
      const drawableIds = (slide.ownedDrawables || [])
        .map(d => normalizeId(d?.identifier))
        .filter(Boolean)
      const imageArchiveIds = []
      for (const did of drawableIds) {
        const dmsgs = archives.get(did) || []
        for (const dm of dmsgs) {
          if (dm.name === 'TSD.ImageArchive') imageArchiveIds.push(did)
        }
      }
      const titlePhId = normalizeId(slide.titlePlaceholder?.identifier)
      const titleText = titlePhId ? extractTextFromRefs(archives, titlePhId) : null
      slides.push({ archiveId: id, name, title: titleText, imageArchiveIds })
    }
  }
  return slides
}

// ─── TSD.ImageArchive → Data/ 파일 매핑 ───
// Keynote는 이미지 data.identifier(Long)를 파일명 suffix로 사용:
//   data.identifier.low = 630 → Data/IMG_1089-630.JPG
// 1차: dataId suffix로 직접 매칭 (가장 신뢰)
// 2차: data archive 내부에서 파일명 문자열 탐색 (버전별 대안)
function extractImageFileRef(archives, imageArchiveId, dataEntriesByBase) {
  const msgs = archives.get(imageArchiveId) || []
  for (const m of msgs) {
    if (m.name !== 'TSD.ImageArchive') continue
    const dataId = normalizeId(m.msg?.data?.identifier)
    if (!dataId) continue

    // 1차: 파일명 suffix 매칭 (빠르고 확실)
    const byDataId = findEntryByDataIdSuffix(dataEntriesByBase, dataId)
    if (byDataId) return byDataId

    // 2차: data archive 내부 텍스트 필드
    const dmsgs = archives.get(dataId) || []
    for (const dm of dmsgs) {
      const fileName = findFileNameInMessage(dm.msg)
      if (fileName) {
        const match = findDataMatch(dataEntriesByBase, fileName)
        if (match) return match.fileName
      }
    }
  }
  return null
}

function findEntryByDataIdSuffix(dataEntriesByBase, dataId) {
  // "IMG_1089-630.JPG" 패턴: stem 끝이 "-<dataId>"
  const suffix = '-' + dataId
  for (const [base] of dataEntriesByBase) {
    const stem = base.replace(/\.[^.]+$/, '')
    if (stem.endsWith(suffix)) return base
  }
  return null
}

const FILE_EXT_RE = /\.(jpg|jpeg|png|heic|heif|tif|tiff|gif|webp|bmp|mov|mp4|m4v)$/i
function findFileNameInMessage(obj, depth = 0) {
  if (depth > 6 || !obj) return null
  if (typeof obj === 'string') {
    if (FILE_EXT_RE.test(obj)) return obj
    return null
  }
  if (Array.isArray(obj)) {
    for (const x of obj) { const f = findFileNameInMessage(x, depth + 1); if (f) return f }
    return null
  }
  if (typeof obj === 'object') {
    // 우선순위: preferred_file_name, file_name
    for (const key of ['preferredFileName', 'preferred_file_name', 'fileName', 'file_name']) {
      if (typeof obj[key] === 'string' && FILE_EXT_RE.test(obj[key])) return obj[key]
    }
    for (const k of Object.keys(obj)) {
      const f = findFileNameInMessage(obj[k], depth + 1)
      if (f) return f
    }
  }
  return null
}

// ─── 메인 파이프라인: 파일 경로 → 구조화된 결과 ───
// 반환:
//   { ok: true,  mode: 'structured', slides: [...], images: [...], groups: [...] }
//   { ok: false, mode: 'fallback',  images: [...], groups: [{ title:'미분류', imageNames:[...] }] }
async function parseKeynoteFile(filePath, onProgress) {
  const zip = await openArchive(filePath)
  try {
    onProgress?.({ phase: 'scan', done: 0, total: 1 })
    const entries = await scanEntries(zip)
    onProgress?.({
      phase: 'scan-done',
      iwa: entries.iwa.length,
      data: entries.data.length,
    })

    // Data/ 엔트리 이름 리스트 (파일명만)
    const dataEntriesByBase = new Map() // basename → entry
    for (const e of entries.data) {
      const base = path.basename(e.fileName)
      dataEntriesByBase.set(base, e)
    }
    const allImagesRaw = entries.data.map(e => ({
      fileName: path.basename(e.fileName),
      relPath: e.fileName, // Data/xxx.jpg
      size: e.uncompressedSize,
    }))

    // ─── -small- 썸네일 변형을 원본과 pairing + 제거 ───
    //   키노트가 자동 생성하는 내부 캐시. 예:
    //     01_06_2248+0065-F4-1251.jpg         (원본)
    //     01_06_2248+0065-F4-small-1252.jpeg  (썸네일)
    //   두 파일은 "stem 에서 '-small-NNNN' 또는 '-NNNN' 을 제거한 base" 가 같음.
    //   dataId 가 둘 다 있으므로 slide iwa 가 썸네일 을 참조할 수도 있음 → 원본으로 치환 매핑 제공.
    const smallToFullMap = new Map()  // -small- 파일명 → 원본 파일명
    const fullFiles = []              // 원본만 (썸네일 제외)
    const baseToFull = new Map()      // 공통 stem base → 원본 파일명
    const baseToSmall = new Map()     // 공통 stem base → 썸네일 파일명
    for (const img of allImagesRaw) {
      const stem = img.fileName.replace(/\.[^.]+$/, '')
      const smallMatch = stem.match(/^(.+?)-small-\d+$/)
      const fullMatch = stem.match(/^(.+?)-\d+$/)
      if (smallMatch) baseToSmall.set(smallMatch[1], img.fileName)
      else if (fullMatch) baseToFull.set(fullMatch[1], img.fileName)
    }
    // pairing: base 가 겹치는 쌍 → small→full 매핑 작성
    for (const [base, smallName] of baseToSmall) {
      const fullName = baseToFull.get(base)
      if (fullName) smallToFullMap.set(smallName, fullName)
    }
    // 출력: 원본만 전달 (썸네일 제거)
    for (const img of allImagesRaw) {
      if (smallToFullMap.has(img.fileName)) continue  // 이 파일은 썸네일 → drop
      fullFiles.push(img)
    }
    const allImages = fullFiles
    console.log(`[KeynoteParser] 원본 ${fullFiles.length}장 · 제거된 썸네일 변형 ${smallToFullMap.size}장`)

    // iwa 파싱 시도
    let archives = null, iwaByArchiveId = null, iwaTextTokens = null
    try {
      const parsed = await parseAllIwa(zip, entries.iwa, onProgress)
      archives = parsed.archives
      iwaByArchiveId = parsed.iwaByArchiveId
      iwaTextTokens = parsed.iwaTextTokens
    } catch (e) {
      console.warn('[KeynoteParser] parseAllIwa failed:', e.message)
    }

    // 파싱 실패 or 슬라이드 없음 → 폴백
    if (!archives || archives.size === 0) {
      return buildFallback(allImages)
    }
    const slides = collectSlides(archives)
    if (!slides.length) return buildFallback(allImages)

    // 슬라이드 이미지 archiveId → 실제 파일명 매핑
    const usedFiles = new Set()
    const structuredGroups = []
    for (let i = 0; i < slides.length; i++) {
      const s = slides[i]
      const imageFiles = []
      for (const imgId of s.imageArchiveIds) {
        let fname = extractImageFileRef(archives, imgId, dataEntriesByBase)
        // 슬라이드가 -small- 썸네일 을 참조한 경우 → 원본으로 치환
        if (fname && smallToFullMap.has(fname)) fname = smallToFullMap.get(fname)
        if (fname && !usedFiles.has(fname)) {
          imageFiles.push(fname)
          usedFiles.add(fname)
        }
      }
      // 이 슬라이드가 속한 iwa 파일의 raw text tokens 수집 (브랜드명/프로젝트명 복구용)
      const iwaFile = iwaByArchiveId?.get(s.archiveId)
      const textTokens = (iwaFile && iwaTextTokens?.get(iwaFile)) || []
      const initialTitle = s.title || s.name || `슬라이드 ${i + 1}`
      structuredGroups.push({
        title: initialTitle,
        titleConfidence: s.title ? 'high' : (s.name ? 'low' : 'none'),
        category: null,
        imageNames: imageFiles,
        slideIndex: i,
        textTokens,   // ← 신규: 슬라이드 내 모든 사용자 텍스트 조각
      })
    }

    // 매핑 안 된 이미지는 "미분류" 그룹으로 추가
    const unmapped = allImages.filter(img => !usedFiles.has(img.fileName))
    if (unmapped.length > 0) {
      structuredGroups.push({
        title: '미분류',
        titleConfidence: 'none',
        category: null,
        imageNames: unmapped.map(i => i.fileName),
        slideIndex: null,
      })
    }

    // 이미지가 하나도 매핑 안 됐으면 전체 폴백이 실용적
    const totalMapped = structuredGroups.reduce((s, g) => g.slideIndex !== null ? s + g.imageNames.length : s, 0)
    if (totalMapped === 0) return buildFallback(allImages)

    return {
      ok: true,
      mode: 'structured',
      slides,
      images: allImages,
      groups: structuredGroups.filter(g => g.imageNames.length > 0),
    }
  } finally {
    try { zip.close() } catch {}
  }
}

function findDataMatch(dataEntriesByBase, fname) {
  // 정확 매칭
  if (dataEntriesByBase.has(fname)) return dataEntriesByBase.get(fname)
  // 대소문자 변형
  const lower = fname.toLowerCase()
  for (const [base, entry] of dataEntriesByBase) {
    if (base.toLowerCase() === lower) return entry
  }
  // .key 내부 파일명은 IMG_xxx-NNNN.JPG 형태로 suffix가 붙음
  // 원본 파일명이 IMG_xxx.JPG라면 Data/에 IMG_xxx-123.JPG 등으로 저장. suffix 무시 매칭.
  const stem = fname.replace(/\.[^.]+$/, '').toLowerCase()
  const ext = (fname.match(/\.[^.]+$/) || [''])[0].toLowerCase()
  for (const [base, entry] of dataEntriesByBase) {
    const bLower = base.toLowerCase()
    if (bLower.startsWith(stem) && bLower.endsWith(ext)) return entry
  }
  return null
}

function buildFallback(allImages) {
  return {
    ok: true,
    mode: 'fallback',
    slides: [],
    images: allImages,
    groups: [{
      title: '미분류',
      titleConfidence: 'none',
      category: null,
      imageNames: allImages.map(i => i.fileName),
      slideIndex: null,
    }],
  }
}

module.exports = {
  parseKeynoteFile,
  // 테스트/재사용용
  openArchive,
  scanEntries,
  readEntryBuffer,
}
