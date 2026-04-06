import { useState, useRef, useCallback, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useProjects } from '../hooks/useProjects'
import useCanvasInteraction from '../hooks/useCanvasInteraction'
import ElementRenderer from './pdf/ElementRenderer'
import ImageSidebar from './pdf/ImageSidebar'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import { jsPDF } from 'jspdf'
import { matchTemplates, applyTemplate, classifyImages, getTemplatesForCount, computeCover, constrainCrop } from '../utils/templateMatcher'

// ── 상수 ──
const A4_W = 210, A4_H = 297
const A4_L_W = 297, A4_L_H = 210
const SCALE = 2.5
const SNAP_DIST = 4

// ── 이미지 프리로드 + 캐시 ──
const imgCache = new Map()
function preloadImageSize(url) {
  if (imgCache.has(url)) return Promise.resolve(imgCache.get(url))
  return new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const d = { url, w: img.naturalWidth, h: img.naturalHeight, ratio: img.naturalWidth / img.naturalHeight }
      imgCache.set(url, d)
      resolve(d)
    }
    img.onerror = () => resolve({ url, w: 1200, h: 800, ratio: 1.5 })
    img.src = url
  })
}

// ── 스마트 레이아웃 ──
function smartLayout(imgs, pw, ph, margin = 15, gap = 3, startY = 48) {
  const aW = pw - margin * 2, aH = ph - startY - margin - 14 // 14mm footer 여유
  const r = []
  if (!imgs.length) return r
  const n = imgs.length

  const contain = (ratio, maxW, maxH) => {
    let w, h
    if (ratio > maxW / maxH) { w = maxW; h = maxW / ratio }
    else { h = maxH; w = maxH * ratio }
    return { w, h }
  }

  if (n === 1) {
    const { w, h } = contain(imgs[0].ratio, aW, aH)
    r.push({ ...imgs[0], x: margin + (aW - w) / 2, y: startY + (aH - h) / 2, w, h })
    return r
  }

  if (n === 2) {
    const r0 = imgs[0].ratio, r1 = imgs[1].ratio
    if (r0 > 1 && r1 > 1) {
      // 둘 다 가로: 상하
      const h0 = aW / r0, h1 = aW / r1
      const tot = h0 + gap + h1, sc = tot > aH ? aH / tot : 1
      const oY = startY + (aH - (h0 + gap + h1) * sc) / 2
      r.push({ ...imgs[0], x: margin, y: oY, w: aW, h: h0 * sc })
      r.push({ ...imgs[1], x: margin, y: oY + h0 * sc + gap, w: aW, h: h1 * sc })
    } else if (r0 < 1 && r1 < 1) {
      // 둘 다 세로: 좌우
      const cW = (aW - gap) / 2
      const s0 = contain(r0, cW, aH), s1 = contain(r1, cW, aH)
      r.push({ ...imgs[0], x: margin + (cW - s0.w) / 2, y: startY + (aH - s0.h) / 2, ...s0 })
      r.push({ ...imgs[1], x: margin + cW + gap + (cW - s1.w) / 2, y: startY + (aH - s1.h) / 2, ...s1 })
    } else {
      // 혼합: 비율 기반 좌우
      const w0 = (aW - gap) * r0 / (r0 + r1), w1 = aW - gap - w0
      const s0 = contain(r0, w0, aH), s1 = contain(r1, w1, aH)
      r.push({ ...imgs[0], x: margin, y: startY + (aH - s0.h) / 2, ...s0 })
      r.push({ ...imgs[1], x: margin + w0 + gap, y: startY + (aH - s1.h) / 2, ...s1 })
    }
    return r
  }

  if (n === 3) {
    const sorted = [...imgs].sort((a, b) => b.ratio - a.ratio)
    const h = sorted[0], s1 = sorted[1], s2 = sorted[2]
    if (h.ratio > 1) {
      const hH = Math.min(aW / h.ratio, aH * 0.6), bH = aH - hH - gap, bW = (aW - gap) / 2
      const b1 = contain(s1.ratio, bW, bH), b2 = contain(s2.ratio, bW, bH)
      r.push({ ...h, x: margin, y: startY, w: aW, h: hH })
      r.push({ ...s1, x: margin + (bW - b1.w) / 2, y: startY + hH + gap + (bH - b1.h) / 2, ...b1 })
      r.push({ ...s2, x: margin + bW + gap + (bW - b2.w) / 2, y: startY + hH + gap + (bH - b2.h) / 2, ...b2 })
    } else {
      const hW = aW * 0.5, sW = aW - hW - gap
      const hS = contain(h.ratio, hW, aH)
      const sH = (aH - gap) / 2
      const b1 = contain(s1.ratio, sW, sH), b2 = contain(s2.ratio, sW, sH)
      r.push({ ...h, x: margin + (hW - hS.w) / 2, y: startY + (aH - hS.h) / 2, ...hS })
      r.push({ ...s1, x: margin + hW + gap + (sW - b1.w) / 2, y: startY + (sH - b1.h) / 2, ...b1 })
      r.push({ ...s2, x: margin + hW + gap + (sW - b2.w) / 2, y: startY + sH + gap + (sH - b2.h) / 2, ...b2 })
    }
    return r
  }

  if (n === 4) {
    const cW = (aW - gap) / 2, rH = (aH - gap) / 2
    const pos = [[0,0],[1,0],[0,1],[1,1]]
    imgs.forEach((img, i) => {
      const [c, row] = pos[i]
      const s = contain(img.ratio, cW, rH)
      r.push({ ...img, x: margin + c * (cW + gap) + (cW - s.w) / 2, y: startY + row * (rH + gap) + (rH - s.h) / 2, ...s })
    })
    return r
  }

  // 5+: bento
  const tH = aH * 0.55, bH = aH - tH - gap, bW0 = aW * 0.6, sW = aW - bW0 - gap, btW = (aW - gap) / 2
  const f0 = contain(imgs[0].ratio, bW0, tH)
  r.push({ ...imgs[0], x: margin + (bW0 - f0.w) / 2, y: startY + (tH - f0.h) / 2, ...f0 })
  const smH = (tH - gap) / 2
  if (imgs[1]) { const f = contain(imgs[1].ratio, sW, smH); r.push({ ...imgs[1], x: margin + bW0 + gap + (sW - f.w) / 2, y: startY + (smH - f.h) / 2, ...f }) }
  if (imgs[2]) { const f = contain(imgs[2].ratio, sW, smH); r.push({ ...imgs[2], x: margin + bW0 + gap + (sW - f.w) / 2, y: startY + smH + gap + (smH - f.h) / 2, ...f }) }
  if (imgs[3]) { const f = contain(imgs[3].ratio, btW, bH); r.push({ ...imgs[3], x: margin + (btW - f.w) / 2, y: startY + tH + gap + (bH - f.h) / 2, ...f }) }
  if (imgs[4]) { const f = contain(imgs[4].ratio, btW, bH); r.push({ ...imgs[4], x: margin + btW + gap + (btW - f.w) / 2, y: startY + tH + gap + (bH - f.h) / 2, ...f }) }
  return r
}

// ── 템플릿 ──
const PDF_FONT_LIST = [
  { id: 'pretendard', label: 'Pretendard', family: "'Pretendard Variable', 'Pretendard', sans-serif", type: 'KR' },
  { id: 'noto-sans', label: 'Noto Sans KR', family: "'Noto Sans KR', sans-serif", type: 'KR' },
  { id: 'noto-serif', label: 'Noto Serif KR', family: "'Noto Serif KR', serif", type: 'KR' },
  { id: 'suit', label: 'SUIT', family: "'SUIT Variable', 'SUIT', sans-serif", type: 'KR' },
  { id: 'gmarket', label: 'Gmarket Sans', family: "'GmarketSansMedium', sans-serif", type: 'KR' },
  { id: 'inter', label: 'Inter', family: "'Inter', sans-serif", type: 'EN' },
  { id: 'poppins', label: 'Poppins', family: "'Poppins', sans-serif", type: 'EN' },
  { id: 'montserrat', label: 'Montserrat', family: "'Montserrat', sans-serif", type: 'EN' },
  { id: 'dm-sans', label: 'DM Sans', family: "'DM Sans', sans-serif", type: 'EN' },
  { id: 'space-grotesk', label: 'Space Grotesk', family: "'Space Grotesk', sans-serif", type: 'EN' },
  { id: 'playfair', label: 'Playfair Display', family: "'Playfair Display', serif", type: 'EN' },
  { id: 'cormorant', label: 'Cormorant Garamond', family: "'Cormorant Garamond', serif", type: 'EN' },
]

const TEMPLATES = [
  { id: 'minimal', name: '미니멀 화이트', en: 'MINIMAL WHITE', preview: 'from-white to-gray-50', bg: '#FFFFFF', text: '#1A1A1A', accent: '#333333', sub: '#999999' },
  { id: 'cineDark', name: '다크 시네마틱', en: 'DARK CINEMATIC', preview: 'from-gray-900 to-black', bg: '#0A0A0A', text: '#F5F5F5', accent: '#E8E8E8', sub: '#666666' },
  { id: 'softEdit', name: '소프트 에디토리얼', en: 'SOFT EDITORIAL', preview: 'from-amber-50 to-orange-50', bg: '#FAF7F2', text: '#2C2417', accent: '#C4956A', sub: '#A09080' },
  { id: 'myColor', name: '마이 컬러', en: 'MY COLOR', preview: 'from-pink-50 to-violet-50', bg: '#FFFFFF', text: '#1A1A1A', accent: '#828DF8', sub: '#888888', customizable: true },
  { id: 'mono', name: '모노크롬', en: 'MONOCHROME', preview: 'from-gray-100 to-gray-200', bg: '#F0F0F0', text: '#111111', accent: '#111111', sub: '#777777' },
]

// ── 요소 생성 ──
let _id = 0
const uid = () => `el_${Date.now()}_${++_id}`
const mkImg = (url, x, y, w, h, ratio) => ({ id: uid(), type: 'image', url, x, y, w, h, ratio: ratio || w / h, cropX: 0, cropY: 0, cropZoom: 1 })
const mkText = (text, x, y, w, h, o = {}) => ({ id: uid(), type: 'text', text, x, y, w, h, fontSize: o.fontSize || 14, fontWeight: o.fontWeight || 'normal', color: o.color || '#1a1a1a', align: o.align || 'left' })
const mkShape = (x, y, w, h, color, opacity = 0.2) => ({ id: uid(), type: 'shape', shape: 'rect', x, y, w, h, color: color || '#828DF8', opacity })

// ── 커버 생성 (Pinterest 패턴: 좌하단 타이틀 + 우상단 서브) ──
function buildCover(tpl, title, subtitle, contact, pw, ph) {
  const m = 20
  return {
    id: uid(), bg: tpl.bg, isCover: true, elements: [
      // 좌하단 큰 타이틀
      mkText((title || 'PORTFOLIO').toUpperCase(), m, ph * 0.58, pw * 0.65, 30, { fontSize: 36, fontWeight: 'bold', color: tpl.text, align: 'left' }),
      // 악센트 라인
      mkShape(m, ph * 0.58 - 4, 30, 0.8, tpl.accent, 1),
      // 서브타이틀 (직군)
      mkText((subtitle || '').toUpperCase(), m, ph * 0.58 + 32, pw * 0.6, 10, { fontSize: 9, color: tpl.sub, align: 'left' }),
      // 하단 연락처
      mkText(contact || '', m, ph - 25, pw - m * 2, 10, { fontSize: 8, color: tpl.sub, align: 'left' }),
      // 하단 우측 연도
      mkText(new Date().getFullYear().toString(), pw - m - 30, ph - 25, 30, 10, { fontSize: 8, color: tpl.sub, align: 'right' }),
    ]
  }
}

// ── 프로젝트 구분 페이지 (Pinterest 패턴 2: 중앙 큰 타이틀) ──
function buildProjectDivider(tpl, project, pw, ph, pageNum, brandName) {
  const m = 20
  return {
    id: uid(), bg: tpl.bg, isDivider: true, projectName: project.name, elements: [
      // 상단 카테고리 라벨
      mkText((project.category || project.client || 'PROJECT').toUpperCase(), m, ph * 0.38, pw - m * 2, 8, { fontSize: 8, color: tpl.sub, align: 'left' }),
      // 악센트 라인
      mkShape(m, ph * 0.38 + 12, 25, 0.6, tpl.accent, 1),
      // 큰 프로젝트명
      mkText(project.name, m, ph * 0.38 + 18, pw - m * 2, 24, { fontSize: 28, fontWeight: 'bold', color: tpl.text, align: 'left' }),
      // 클라이언트/날짜 (있으면)
      ...(project.client ? [mkText(project.client, m, ph * 0.38 + 46, pw - m * 2, 10, { fontSize: 10, color: tpl.sub, align: 'left' })] : []),
      ...(project.shootDate ? [mkText(project.shootDate, m, ph * 0.38 + (project.client ? 58 : 46), pw - m * 2, 10, { fontSize: 9, color: tpl.sub, align: 'left' })] : []),
      // 하단 footer
      ...buildFooter(tpl, pw, ph, m, pageNum, brandName),
    ]
  }
}

// ── 페이지 하단 footer (Pinterest 패턴 6: 브랜드 | 페이지번호) ──
function buildFooter(tpl, pw, ph, m, pageNum, brandName) {
  return [
    // 좌측 브랜드명
    mkText((brandName || '').toUpperCase(), m, ph - 12, 60, 6, { fontSize: 6, color: tpl.sub, align: 'left' }),
    // 우측 페이지 번호
    mkText(String(pageNum || '').padStart(2, '0'), pw - m - 20, ph - 12, 20, 6, { fontSize: 6, color: tpl.sub, align: 'right' }),
  ]
}

// ── 텍스트+이미지 분할 레이아웃 (Pinterest 패턴 3: 좌 35% 텍스트 + 우 65% 이미지) ──
function splitTextImageLayout(imgs, pw, ph, margin = 15, gap = 3) {
  const textW = pw * 0.32 // 텍스트 영역 32%
  const imgAreaX = margin + textW + gap * 2
  const imgAreaW = pw - imgAreaX - margin
  const imgAreaY = margin + 8 // 상단 여유
  const imgAreaH = ph - imgAreaY - margin - 14 // 하단 footer 여유
  const r = []
  if (!imgs.length) return r
  const n = imgs.length

  const contain = (ratio, maxW, maxH) => {
    let w, h
    if (ratio > maxW / maxH) { w = maxW; h = maxW / ratio }
    else { h = maxH; w = maxH * ratio }
    return { w, h }
  }

  if (n === 1) {
    const { w, h } = contain(imgs[0].ratio, imgAreaW, imgAreaH)
    r.push({ ...imgs[0], x: imgAreaX + (imgAreaW - w) / 2, y: imgAreaY + (imgAreaH - h) / 2, w, h })
  } else if (n === 2) {
    const r0 = imgs[0].ratio, r1 = imgs[1].ratio
    if (r0 >= 1 && r1 >= 1) {
      // 둘 다 가로: 상하 스택
      const h0 = imgAreaW / r0, h1 = imgAreaW / r1
      const tot = h0 + gap + h1, sc = tot > imgAreaH ? imgAreaH / tot : 1
      const oY = imgAreaY + (imgAreaH - (h0 + gap + h1) * sc) / 2
      r.push({ ...imgs[0], x: imgAreaX, y: oY, w: imgAreaW, h: h0 * sc })
      r.push({ ...imgs[1], x: imgAreaX, y: oY + h0 * sc + gap, w: imgAreaW, h: h1 * sc })
    } else {
      // 좌우 배치
      const cW = (imgAreaW - gap) / 2
      const s0 = contain(r0, cW, imgAreaH), s1 = contain(r1, cW, imgAreaH)
      r.push({ ...imgs[0], x: imgAreaX + (cW - s0.w) / 2, y: imgAreaY + (imgAreaH - s0.h) / 2, ...s0 })
      r.push({ ...imgs[1], x: imgAreaX + cW + gap + (cW - s1.w) / 2, y: imgAreaY + (imgAreaH - s1.h) / 2, ...s1 })
    }
  } else {
    // 3+: 우측 영역에 그리드
    const cols = n <= 3 ? 1 : 2
    const rows = Math.ceil(n / cols)
    const cellW = (imgAreaW - (cols - 1) * gap) / cols
    const cellH = (imgAreaH - (rows - 1) * gap) / rows
    imgs.forEach((img, i) => {
      const col = i % cols, row = Math.floor(i / cols)
      const s = contain(img.ratio, cellW, cellH)
      r.push({ ...img, x: imgAreaX + col * (cellW + gap) + (cellW - s.w) / 2, y: imgAreaY + row * (cellH + gap) + (cellH - s.h) / 2, ...s })
    })
  }
  return r
}

// ────────────────────────────────────────
// 메인 컴포넌트
// ────────────────────────────────────────
export default function PdfBuilder({ isMobile }) {
  const { user, userDoc } = useAuth()
  const { projects } = useProjects()

  const [step, setStep] = useState('setup')
  const [orientation, setOrientation] = useState('portrait')
  const [selectedTemplate, setSelectedTemplate] = useState('minimal')
  const [selectedProjectIds, setSelectedProjectIds] = useState([])
  const [ippMin, setIppMin] = useState(2)
  const [ippMax, setIppMax] = useState(4)
  const [customColors, setCustomColors] = useState({ bg: '#FFFFFF', text: '#1A1A1A', accent: '#828DF8' })
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [contact, setContact] = useState('')
  const [pdfFontFamily, setPdfFontFamily] = useState('pretendard')

  const [pages, setPages] = useState([])
  const [currentPageIdx, setCurrentPageIdx] = useState(0)
  const [generating, setGenerating] = useState(false)
  const [zoom, setZoom] = useState(100)
  const [projectAssets, setProjectAssets] = useState({})
  const [loading, setLoading] = useState(false)
  const [rightTab, setRightTab] = useState('images') // images | layouts | order
  const [localProjects, setLocalProjects] = useState([]) // [{id, name, imageCount, assets: [{id, url, ratio}]}]
  const [folderLoading, setFolderLoading] = useState(false)
  const [activeDraftId, setActiveDraftId] = useState(null) // 현재 편집 중인 드래프트 ID
  const [draftName, setDraftName] = useState('') // 현재 드래프트 이름
  const [showDraftDropdown, setShowDraftDropdown] = useState(false)

  const canvasRef = useRef(null)
  const pagesRef = useRef([])
  pagesRef.current = pages

  // ── Undo/Redo ──
  const historyRef = useRef([])
  const futureRef = useRef([])
  const saveSnapshot = useCallback(() => {
    historyRef.current = [...historyRef.current.slice(-40), JSON.stringify(pagesRef.current)]
    futureRef.current = []
  }, [])
  const undo = useCallback(() => {
    if (!historyRef.current.length) return
    futureRef.current = [...futureRef.current, JSON.stringify(pagesRef.current)]
    setPages(JSON.parse(historyRef.current.pop()))
  }, [])
  const redo = useCallback(() => {
    if (!futureRef.current.length) return
    historyRef.current = [...historyRef.current, JSON.stringify(pagesRef.current)]
    setPages(JSON.parse(futureRef.current.pop()))
  }, [])

  const _tpl = TEMPLATES.find(t => t.id === selectedTemplate)
  const template = _tpl?.customizable
    ? { ..._tpl, bg: customColors.bg, text: customColors.text, accent: customColors.accent, sub: customColors.accent + '88' }
    : _tpl
  const pw = orientation === 'landscape' ? A4_L_W : A4_W
  const ph = orientation === 'landscape' ? A4_L_H : A4_H
  const zs = zoom / 100
  const es = SCALE * zs // effective scale
  const canvasW = pw * es
  const canvasH = ph * es
  const currentPage = pages[currentPageIdx]

  // ── Canvas Interaction Hook ──
  const {
    selectedElId, setSelectedElId,
    cropModeElId, setCropModeElId,
    editingTextId, setEditingTextId,
    snapLines, dragOverFrameId,
    updateEl, deleteEl,
    handlers,
  } = useCanvasInteraction({ pages, setPages, currentPageIdx, es, pw, ph, saveSnapshot })

  const selectedEl = currentPage?.elements.find(e => e.id === selectedElId)

  useEffect(() => {
    if (userDoc && !title) {
      setTitle(userDoc.displayName || '')
      setSubtitle(userDoc.profession || '')
      const p = [userDoc.email || user?.email, userDoc.phone, userDoc.instagram ? `@${userDoc.instagram}` : ''].filter(Boolean)
      setContact(p.join(' | '))
    }
  }, [userDoc])

  // ── 멀티 드래프트 시스템 ──
  const DRAFTS_INDEX_KEY = `assi_pdf_drafts_${user?.uid || 'anon'}`
  const draftDataKey = (id) => `assi_pdf_draft_${user?.uid || 'anon'}_${id}`

  // 드래프트 목록 읽기
  const getDraftList = useCallback(() => {
    try { return JSON.parse(localStorage.getItem(DRAFTS_INDEX_KEY) || '[]') } catch { return [] }
  }, [DRAFTS_INDEX_KEY])

  // 드래프트 목록 저장
  const setDraftList = useCallback((list) => {
    try { localStorage.setItem(DRAFTS_INDEX_KEY, JSON.stringify(list)) } catch (e) { /* */ }
  }, [DRAFTS_INDEX_KEY])

  const [drafts, setDrafts] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`assi_pdf_drafts_${user?.uid || 'anon'}`) || '[]') } catch { return [] }
  })

  // 드래프트 데이터 묶기
  const buildDraftData = useCallback(() => ({
    pages: pagesRef.current, orientation, selectedTemplate, selectedProjectIds,
    title, subtitle, contact, customColors, projectAssets,
  }), [orientation, selectedTemplate, selectedProjectIds, title, subtitle, contact, customColors, projectAssets])

  // 드래프트 저장 (신규 or 기존 덮어쓰기)
  const saveDraft = useCallback((id, name) => {
    const dId = id || `draft_${Date.now()}`
    const data = buildDraftData()
    try { localStorage.setItem(draftDataKey(dId), JSON.stringify(data)) } catch (e) { console.warn('Draft save failed:', e); return null }
    const list = getDraftList()
    const existing = list.findIndex(d => d.id === dId)
    const meta = { id: dId, name: name || title || '제목 없음', updatedAt: Date.now(), pageCount: pagesRef.current.length }
    if (existing >= 0) list[existing] = meta; else list.unshift(meta)
    // 최대 10개
    while (list.length > 10) { const removed = list.pop(); try { localStorage.removeItem(draftDataKey(removed.id)) } catch {} }
    setDraftList(list)
    setDrafts(list)
    setActiveDraftId(dId)
    setDraftName(meta.name)
    return dId
  }, [buildDraftData, getDraftList, setDraftList, draftDataKey, title])

  // 드래프트 불러오기
  const loadDraft = useCallback((dId) => {
    try {
      const raw = localStorage.getItem(draftDataKey(dId))
      if (!raw) return false
      const saved = JSON.parse(raw)
      if (!saved.pages?.length) return false
      setPages(saved.pages)
      setOrientation(saved.orientation || 'portrait')
      setSelectedTemplate(saved.selectedTemplate || 'minimal')
      setSelectedProjectIds(saved.selectedProjectIds || [])
      setTitle(saved.title || '')
      setSubtitle(saved.subtitle || '')
      setContact(saved.contact || '')
      setCustomColors(saved.customColors || { bg: '#FFFFFF', text: '#1A1A1A', accent: '#828DF8' })
      setProjectAssets(saved.projectAssets || {})
      setCurrentPageIdx(0)
      setActiveDraftId(dId)
      const list = getDraftList()
      const meta = list.find(d => d.id === dId)
      setDraftName(meta?.name || saved.title || '제목 없음')
      setStep('editor')
      historyRef.current = []
      futureRef.current = []
      return true
    } catch (e) { console.warn('Draft load failed:', e); return false }
  }, [draftDataKey, getDraftList])

  // 드래프트 삭제
  const deleteDraft = useCallback((dId) => {
    try { localStorage.removeItem(draftDataKey(dId)) } catch {}
    const list = getDraftList().filter(d => d.id !== dId)
    setDraftList(list)
    setDrafts(list)
    if (activeDraftId === dId) setActiveDraftId(null)
  }, [draftDataKey, getDraftList, setDraftList, activeDraftId])

  // 자동저장 (에디터 상태 + activeDraftId 있을 때 2초 디바운스)
  const saveTimerRef = useRef(null)
  useEffect(() => {
    if (step !== 'editor' || !pages.length || !activeDraftId) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => { saveDraft(activeDraftId, draftName) }, 2000)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [step, pages, orientation, selectedTemplate, selectedProjectIds, title, subtitle, contact, customColors, activeDraftId, draftName, saveDraft])

  // 에디터 나갈 때 즉시 저장
  useEffect(() => {
    const onBeforeUnload = () => {
      if (step === 'editor' && pages.length && activeDraftId) saveDraft(activeDraftId, draftName)
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [step, pages, activeDraftId, draftName, saveDraft])

  // 구버전 단일 드래프트 마이그레이션 (최초 1회)
  useEffect(() => {
    const oldKey = `assi_pdf_draft_${user?.uid || 'anon'}`
    try {
      const raw = localStorage.getItem(oldKey)
      if (!raw) return
      const saved = JSON.parse(raw)
      if (saved.pages?.length) {
        const migId = `draft_migrated_${Date.now()}`
        localStorage.setItem(draftDataKey(migId), JSON.stringify({
          pages: saved.pages, orientation: saved.orientation, selectedTemplate: saved.selectedTemplate,
          selectedProjectIds: saved.selectedProjectIds, title: saved.title, subtitle: saved.subtitle,
          contact: saved.contact, customColors: saved.customColors, projectAssets: saved.projectAssets,
        }))
        const list = getDraftList()
        list.unshift({ id: migId, name: saved.title || '이전 작업', updatedAt: saved.savedAt || Date.now(), pageCount: saved.pages.length })
        setDraftList(list)
        setDrafts(list)
      }
      localStorage.removeItem(oldKey)
    } catch (e) { /* */ }
  }, [])

  // PDF 다운로드 후 드래프트 정리 (삭제하지 않음 — 이름만 유지)
  const clearDraft = () => { /* 다운로드 완료 후 삭제하지 않음 — 사용자가 수동 삭제 */ }

  const toggleProject = id => setSelectedProjectIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])

  // Firebase + 로컬 프로젝트 병합 목록
  const allProjects = [
    ...projects,
    ...localProjects.map(lp => ({ ...lp, isLocal: true })),
  ]

  // ── 로컬 폴더 불러오기 ──
  const fileInputRef = useRef(null)
  const handleFolderImport = async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setFolderLoading(true)

    const imageExts = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.tif']
    const imageFiles = files.filter(f => {
      const ext = f.name.toLowerCase().slice(f.name.lastIndexOf('.'))
      return imageExts.includes(ext) && !f.name.startsWith('.')
    })

    // 폴더 구조 분석: webkitRelativePath = "rootFolder/subfolder/file.jpg"
    const folderMap = new Map() // folderName → File[]
    for (const f of imageFiles) {
      const parts = f.webkitRelativePath.split('/')
      // 루트 바로 아래 파일 → 루트 폴더명으로
      // 서브폴더 있으면 → 서브폴더명으로
      let folderName
      if (parts.length <= 2) {
        folderName = parts[0] // 루트 폴더 이름
      } else {
        folderName = parts[1] // 첫 번째 서브폴더
      }
      if (!folderMap.has(folderName)) folderMap.set(folderName, [])
      folderMap.get(folderName).push(f)
    }

    // 각 폴더를 프로젝트로 변환
    const newLocalProjects = []
    for (const [folderName, folderFiles] of folderMap) {
      const projectId = `local_${Date.now()}_${folderName.replace(/\s/g, '_')}`
      const assets = await Promise.all(folderFiles.slice(0, 30).map(async (file) => {
        const url = URL.createObjectURL(file)
        const ratio = await new Promise(resolve => {
          const img = new Image()
          img.onload = () => resolve(img.naturalWidth / img.naturalHeight)
          img.onerror = () => resolve(1.5)
          img.src = url
        })
        // preloadImageSize 캐시에도 등록
        imgCache.set(url, { url, w: 0, h: 0, ratio })
        return { id: `asset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, url, ratio, fileName: file.name }
      }))

      newLocalProjects.push({
        id: projectId,
        name: folderName,
        imageCount: assets.length,
        assets,
        isLocal: true,
      })
    }

    setLocalProjects(prev => [...prev, ...newLocalProjects])
    // 자동 선택
    setSelectedProjectIds(prev => [...prev, ...newLocalProjects.map(p => p.id)])
    setFolderLoading(false)
    e.target.value = '' // 같은 폴더 재선택 가능하게
  }

  // ── 프로젝트 순서 드래그앤드롭 ──
  const projectDragRef = useRef(null) // { dragId, overId }
  const onProjectDragStart = (e, id) => {
    projectDragRef.current = { dragId: id, overId: null }
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }
  const onProjectDragOver = (e, id) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (projectDragRef.current) projectDragRef.current.overId = id
  }
  const onProjectDrop = (e, targetId) => {
    e.preventDefault()
    const dragId = projectDragRef.current?.dragId
    if (!dragId || dragId === targetId) return
    setSelectedProjectIds(prev => {
      const arr = [...prev]
      const fromIdx = arr.indexOf(dragId)
      const toIdx = arr.indexOf(targetId)
      if (fromIdx === -1 || toIdx === -1) return prev
      arr.splice(fromIdx, 1)
      arr.splice(toIdx, 0, dragId)
      return arr
    })
    projectDragRef.current = null
  }

  // ── 에디터 진입 ──
  const enterEditor = async () => {
    setLoading(true)
    const newPages = []
    const assetMap = {}
    const brandName = title || ''
    let pageNum = 1
    const m = 15 // 통일 마진

    newPages.push(buildCover(template, title, subtitle, contact, pw, ph))

    for (const pid of selectedProjectIds) {
      const project = allProjects.find(p => p.id === pid)
      if (!project) continue
      let imgMetas = []

      // 로컬 프로젝트 vs Firebase 프로젝트
      const localProj = localProjects.find(lp => lp.id === pid)
      if (localProj) {
        assetMap[pid] = localProj.assets
        imgMetas = localProj.assets.map(a => ({ url: a.url, ratio: a.ratio, w: 0, h: 0 }))
      } else {
        try {
          const snap = await getDocs(query(collection(db, 'assets'), where('projectId', '==', pid)))
          const assets = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(a => !a.isVideo).slice(0, 20)
          assetMap[pid] = assets
          imgMetas = await Promise.all(assets.map(a => preloadImageSize(a.url)))
        } catch (e) { console.warn(e) }
      }

      // 프로젝트 구분 페이지 (Pinterest 패턴 2)
      pageNum++
      newPages.push(buildProjectDivider(template, project, pw, ph, pageNum, brandName))

      // 가로/세로 분류 → 각각 청크 → 교차 배치 (몰리지 않게)
      const landscapeImgs = imgMetas.filter(m => m.ratio >= 1)
      const portraitImgs = imgMetas.filter(m => m.ratio < 1)

      // 각 그룹을 ippMin~ippMax 단위로 청크 분할
      const makeChunks = (arr) => {
        const chunks = []
        let rem = [...arr]
        while (rem.length > 0) {
          let count = Math.min(ippMax, rem.length)
          if (rem.length - count > 0 && rem.length - count < ippMin) count = Math.ceil(rem.length / 2)
          if (count > rem.length) count = rem.length
          chunks.push(rem.splice(0, count))
        }
        return chunks
      }
      const lChunks = makeChunks(landscapeImgs)
      const pChunks = makeChunks(portraitImgs)

      // 교차 배치: 가로-세로-가로-세로... (더 많은 쪽 먼저)
      const allChunks = []
      const [primary, secondary] = lChunks.length >= pChunks.length ? [lChunks, pChunks] : [pChunks, lChunks]
      let pi2 = 0, si = 0
      while (pi2 < primary.length || si < secondary.length) {
        if (pi2 < primary.length) allChunks.push(primary[pi2++])
        if (si < secondary.length) allChunks.push(secondary[si++])
      }

      let isFirst = true
      let lastStyle = ''

      for (const chunk of allChunks) {
        pageNum++
        const chunkMetas = chunk.map(c => ({ ratio: c.ratio, url: c.url }))
        const ranked = matchTemplates(chunkMetas, pw, ph, {
          previousStyle: lastStyle,
          preferTextZone: false,
          orientation,
        })

        const bestTpl = ranked[0]
        const tplElements = applyTemplate(bestTpl, chunk, pw, ph, template, {
          margin: m, startY: 15, footerReserve: 14, gap: 3,
          projectName: project.name,
          category: project.category || '',
          client: project.client || '',
          shootDate: project.shootDate || '',
        })

        // 첫 페이지만: 하단 구석 워터마크 스타일 프로젝트명
        if (isFirst) {
          const wmY = ph - m - 10
          tplElements.push(
            mkText(project.name, m, wmY, pw * 0.45, 6, { fontSize: 7, fontWeight: 'bold', color: template.sub, align: 'left' }),
            ...(project.category || project.client ? [mkText((project.category || project.client).toUpperCase(), m, wmY + 7, pw * 0.45, 5, { fontSize: 5.5, color: template.sub, align: 'left' })] : []),
          )
        }

        tplElements.push(...buildFooter(template, pw, ph, m, pageNum, brandName))

        const pageId = uid()
        newPages.push({ id: pageId, bg: template.bg, elements: tplElements, projectName: project.name })
        lastStyle = bestTpl.style
        isFirst = false
      }

    }

    // 마지막 페이지: CONTACT (Pinterest 스타일 — 좌측 정렬)
    pageNum++
    newPages.push({
      id: uid(), bg: template.bg, elements: [
        mkText('CONTACT', m, ph * 0.4, pw - m * 2, 8, { fontSize: 8, color: template.accent, align: 'left' }),
        mkShape(m, ph * 0.4 + 12, 25, 0.6, template.accent, 1),
        mkText(title || '', m, ph * 0.4 + 18, pw - m * 2, 20, { fontSize: 24, fontWeight: 'bold', color: template.text, align: 'left' }),
        mkText(subtitle || '', m, ph * 0.4 + 42, pw - m * 2, 10, { fontSize: 10, color: template.sub, align: 'left' }),
        mkText(contact || '', m, ph * 0.4 + 56, pw - m * 2, 12, { fontSize: 10, color: template.sub, align: 'left' }),
        ...buildFooter(template, pw, ph, m, pageNum, brandName),
      ]
    })

    setProjectAssets(assetMap)
    setPages(newPages)
    setActiveLayoutId({})
    setCurrentPageIdx(0)
    setSelectedElId(null)
    // 새 드래프트 자동 생성
    const name = title || '새 포트폴리오'
    setDraftName(name)
    const newId = `draft_${Date.now()}`
    setActiveDraftId(newId)
    setStep('editor')
    // 다음 렌더에서 auto-save가 처리
    setLoading(false)
  }

  // updateEl, deleteEl은 useCanvasInteraction에서 제공

  // ── 레이아웃 템플릿 적용 (우측 패널 타일 클릭) ──
  const [activeLayoutId, setActiveLayoutId] = useState({}) // pageId → templateId

  const applyLayoutTemplate = (tpl) => {
    const page = currentPage
    if (!page) return
    const imgs = page.elements.filter(e => e.type === 'image')
    if (!imgs.length) return

    const projectName = page.projectName || title || 'Portfolio'
    const project = projects.find(p => p.name === projectName) || { name: projectName, client: '', category: '' }
    // 이 프로젝트의 첫 이미지 페이지인지 판단
    const projPages = pages.filter(p => p.projectName === projectName && !p.isCover && !p.isDivider && p.elements.some(e => e.type === 'image'))
    const isFirst = projPages.length > 0 && projPages[0].id === page.id

    const imgMetas = imgs.map(e => ({ ratio: e.ratio || e.w / e.h, url: e.url }))
    const newElements = applyTemplate(tpl, imgMetas, pw, ph, template, {
      margin: 15, startY: 15, footerReserve: 14, gap: 3,
      projectName: project.name,
      category: project.category || '',
      client: project.client || '',
      shootDate: project.shootDate || '',
    })

    // 첫 페이지만: 하단 워터마크 스타일
    if (isFirst) {
      const wmY = ph - 15 - 10
      newElements.push(
        mkText(project.name, 15, wmY, pw * 0.45, 6, { fontSize: 7, fontWeight: 'bold', color: template.sub, align: 'left' }),
        ...(project.category || project.client ? [mkText((project.category || project.client).toUpperCase(), 15, wmY + 7, pw * 0.45, 5, { fontSize: 5.5, color: template.sub, align: 'left' })] : []),
      )
    }

    newElements.push(...buildFooter(template, pw, ph, 15, currentPageIdx + 1, title || ''))

    saveSnapshot()
    setActiveLayoutId(prev => ({ ...prev, [page.id]: tpl.id }))
    setPages(prev => prev.map((p, i) => i === currentPageIdx ? { ...p, elements: newElements } : p))
    setSelectedElId(null)
  }

  // ── 프로젝트 순서 변경 — 기존 페이지 그룹 그대로 스왑 ──
  const reorderAndRegenerate = () => {
    setPages(prev => {
      // 표지(첫 페이지)와 마지막 CONTACT 페이지 분리
      const cover = prev[0]?.isCover ? [prev[0]] : []
      const contact2 = prev.length > 1 && !prev[prev.length - 1].projectName && !prev[prev.length - 1].isDivider && !prev[prev.length - 1].isCover
        ? [prev[prev.length - 1]] : []
      const middle = prev.slice(cover.length, prev.length - contact2.length)

      // 프로젝트별 페이지 그룹 수집
      const groups = new Map() // projectName → pages[]
      for (const p of middle) {
        const key = p.projectName || '__unknown'
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key).push(p)
      }

      // selectedProjectIds 순서대로 재배치
      const reordered = []
      for (const pid of selectedProjectIds) {
        const project = projects.find(p => p.id === pid)
        if (!project) continue
        const grp = groups.get(project.name)
        if (grp) reordered.push(...grp)
      }
      // 매칭 안 된 그룹도 뒤에 추가
      for (const [key, grp] of groups) {
        if (!reordered.some(p => p.id === grp[0].id)) reordered.push(...grp)
      }

      return [...cover, ...reordered, ...contact2]
    })
    setCurrentPageIdx(0)
    setSelectedElId(null)
  }

  // 현재 페이지 이미지 수에 맞는 템플릿 + 탭 상태
  const currentPageImgCount = currentPage?.elements.filter(e => e.type === 'image').length || 0
  const [layoutTab, setLayoutTab] = useState(0) // 0 = 현재 페이지 기준 자동, 1~6 = 수동 선택
  const activeTab = layoutTab || currentPageImgCount || 1
  const availableLayouts = getTemplatesForCount(activeTab, orientation)

  // 인터랙션 핸들러는 useCanvasInteraction 훅에서 제공

  // ── 키보드 (Undo/Redo + Delete + Escape) ──
  useEffect(() => {
    if (step !== 'editor') return
    const h = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return }
      if (e.key === 'Escape' && cropModeElId) { setCropModeElId(null); return }
      if (e.key === 'Escape' && editingTextId) { setEditingTextId(null); return }
      if (editingTextId) return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElId) { e.preventDefault(); deleteEl(selectedElId) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [step, selectedElId, editingTextId, cropModeElId, deleteEl, undo, redo, setCropModeElId, setEditingTextId])

  // ── 크롭 줌 (마우스 휠) ──
  useEffect(() => {
    if (step !== 'editor' || !cropModeElId) return
    const h = (e) => {
      const el = pagesRef.current[currentPageIdx]?.elements.find(e2 => e2.id === cropModeElId)
      if (!el || el.type !== 'image') return
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.1 : 0.1
      const newZoom = Math.max(1, Math.min(3, (el.cropZoom || 1) + delta))
      const { cropX, cropY } = constrainCrop(el.ratio, el.w, el.h, el.cropX || 0, el.cropY || 0, newZoom)
      updateEl(cropModeElId, { cropZoom: newZoom, cropX, cropY })
    }
    const canvas = canvasRef.current
    if (canvas) canvas.addEventListener('wheel', h, { passive: false })
    return () => { if (canvas) canvas.removeEventListener('wheel', h) }
  }, [step, cropModeElId, currentPageIdx, updateEl])

  // ── 이전 핸들러 블록 제거됨 — 아래는 기존 코드 유지 시작점 ──
  // ── 추가 함수들 ──
  const addText = () => {
    const el = mkText('텍스트 입력', pw / 2 - 40, ph / 2 - 8, 80, 16, { fontSize: 14, color: template.text })
    setPages(p => p.map((pg, i) => i === currentPageIdx ? { ...pg, elements: [...pg.elements, el] } : pg))
    setSelectedElId(el.id)
  }
  const addShape = () => {
    const el = mkShape(pw / 2 - 30, ph / 2 - 30, 60, 60, template.accent, 0.2)
    setPages(p => p.map((pg, i) => i === currentPageIdx ? { ...pg, elements: [...pg.elements, el] } : pg))
    setSelectedElId(el.id)
  }
  const addImageToPage = (url) => {
    const meta = imgCache.get(url) || { ratio: 1.5 }
    const w = 80, h = w / meta.ratio
    const el = mkImg(url, pw / 2 - w / 2, ph / 2 - h / 2, w, h, meta.ratio)
    setPages(p => p.map((pg, i) => i === currentPageIdx ? { ...pg, elements: [...pg.elements, el] } : pg))
    setSelectedElId(el.id)
  }
  // ── 에디터 페이지 드래그 재정렬 ──
  const pageDragRef = useRef(null)
  const onPageDragStart = (e, idx) => {
    pageDragRef.current = idx
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(idx))
  }
  const onPageDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }
  const onPageDrop = (e, targetIdx) => {
    e.preventDefault()
    const fromIdx = pageDragRef.current
    if (fromIdx == null || fromIdx === targetIdx) return
    // 같은 프로젝트 내에서만, 표지/구분 페이지는 이동 불가
    const fromPage = pages[fromIdx]
    const targetPage = pages[targetIdx]
    if (fromPage?.isCover || fromPage?.isDivider) return
    if (targetPage?.isCover || targetPage?.isDivider) return
    if (fromPage?.projectName !== targetPage?.projectName) return
    setPages(prev => {
      const arr = [...prev]
      const [moved] = arr.splice(fromIdx, 1)
      arr.splice(targetIdx, 0, moved)
      return arr
    })
    setCurrentPageIdx(targetIdx)
    pageDragRef.current = null
  }

  const addPage = () => {
    saveSnapshot()
    const np = { id: uid(), bg: template.bg, elements: [], projectName: currentPage?.projectName || '' }
    setPages(p => [...p.slice(0, currentPageIdx + 1), np, ...p.slice(currentPageIdx + 1)])
    setCurrentPageIdx(currentPageIdx + 1)
  }
  const deletePage = () => {
    if (pages.length <= 1) return
    saveSnapshot()
    setPages(p => p.filter((_, i) => i !== currentPageIdx))
    setCurrentPageIdx(Math.min(currentPageIdx, pages.length - 2))
  }
  const moveImageToPage = (dir) => {
    if (!selectedEl || selectedEl.type !== 'image') return
    const targetIdx = currentPageIdx + dir
    if (targetIdx < 0 || targetIdx >= pages.length) return
    saveSnapshot()
    const el = { ...selectedEl, id: uid() }
    deleteEl(selectedElId)
    setPages(p => p.map((pg, i) => i === targetIdx ? { ...pg, elements: [...pg.elements, el] } : pg))
    setCurrentPageIdx(targetIdx)
    setSelectedElId(el.id)
  }

  // ── PDF 다운로드 ──
  const handleDownload = async () => {
    setGenerating(true)
    try {
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: orientation === 'landscape' ? 'landscape' : 'portrait' })
      const fontName = (await loadFont(pdf)) || 'helvetica'
      const hex = h => { const c = (h || '#000').replace('#', ''); return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)] }

      for (let pi = 0; pi < pages.length; pi++) {
        if (pi > 0) pdf.addPage()
        const page = pages[pi]
        pdf.setFillColor(...hex(page.bg || '#fff'))
        pdf.rect(0, 0, pw, ph, 'F')

        for (const el of page.elements) {
          if (el.type === 'text') {
            pdf.setFontSize(el.fontSize || 12)
            pdf.setTextColor(...hex(el.color))
            pdf.setFont(fontName, el.fontWeight === 'bold' ? 'bold' : 'normal')
            let tx = el.x
            if (el.align === 'center') tx = el.x + el.w / 2
            else if (el.align === 'right') tx = el.x + el.w
            const lines = pdf.splitTextToSize(el.text || '', el.w)
            pdf.text(lines, tx, el.y + el.fontSize * 0.353 * 0.8, { align: el.align || 'left' })
          } else if (el.type === 'shape') {
            pdf.setFillColor(...hex(el.color))
            pdf.setGState(new pdf.GState({ opacity: el.opacity ?? 0.2 }))
            pdf.rect(el.x, el.y, el.w, el.h, 'F')
            pdf.setGState(new pdf.GState({ opacity: 1 }))
          } else if (el.type === 'image') {
            try {
              const img = new Image()
              img.crossOrigin = 'anonymous'
              await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = el.url })
              const ratio = el.ratio || img.naturalWidth / img.naturalHeight
              const { imgW, imgH } = computeCover(ratio, el.w, el.h, el.cropZoom || 1)
              // 원본 해상도 기준으로 프레임 영역만 잘라서 PNG로 추출 (무손실)
              const scaleX = img.naturalWidth / imgW
              const scaleY = img.naturalHeight / imgH
              const sx = -(el.cropX || 0) * scaleX
              const sy = -(el.cropY || 0) * scaleY
              const sw = el.w * scaleX
              const sh = el.h * scaleY
              const outW = Math.round(Math.min(sw, 3000))
              const outH = Math.round(outW * (sh / sw))
              const cropCanvas = document.createElement('canvas')
              cropCanvas.width = outW; cropCanvas.height = outH
              cropCanvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH)
              pdf.addImage(cropCanvas, 'JPEG', el.x, el.y, el.w, el.h, undefined, 'FAST')
            } catch (err) {
              pdf.setFillColor(230, 230, 230); pdf.rect(el.x, el.y, el.w, el.h, 'F')
            }
          }
        }
      }
      pdf.save(`${title || 'Portfolio'}_${new Date().toISOString().slice(0, 10)}.pdf`)
      clearDraft()
    } catch (err) { alert('PDF 생성 실패: ' + err.message) }
    setGenerating(false)
  }

  const fetchImgData = (url) => new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.naturalWidth; c.height = img.naturalHeight
      c.getContext('2d').drawImage(img, 0, 0)
      resolve({ base64: c.toDataURL('image/jpeg', 0.85), naturalW: img.naturalWidth, naturalH: img.naturalHeight })
    }
    img.onerror = () => reject(new Error('fail'))
    img.src = url
  })

  const loadFont = async (pdf) => {
    const urls = [
      'https://raw.githubusercontent.com/google/fonts/main/ofl/nanumgothic/NanumGothic-Regular.ttf',
      'https://cdn.jsdelivr.net/gh/googlefonts/nanum@main/fonts/NanumGothic-Regular.ttf',
    ]
    for (const u of urls) {
      try {
        const r = await fetch(u); if (!r.ok) continue
        const b = new Uint8Array(await r.arrayBuffer())
        let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i])
        pdf.addFileToVFS('NG.ttf', btoa(s))
        pdf.addFont('NG.ttf', 'NG', 'normal'); pdf.addFont('NG.ttf', 'NG', 'bold')
        return 'NG'
      } catch (e) {}
    }
    return null
  }

  // ── 모바일 ──
  if (isMobile) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-20 h-20 rounded-[24px] bg-[#828DF8]/10 flex items-center justify-center mb-4">
          <svg className="w-10 h-10 text-[#828DF8]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
        </div>
        <h2 className="text-xl font-black tracking-tighter text-gray-900 mb-2">데스크탑에서 이용해주세요</h2>
        <p className="text-sm text-gray-400 text-center max-w-xs">포트폴리오 빌더는 데스크탑 환경에서 최적의 경험을 제공합니다.</p>
      </div>
    )
  }

  // ── 셋업 화면 ──
  if (step === 'setup') {
    return (
      <div className="space-y-6">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-sm tracking-[0.2em] uppercase text-gray-400 font-semibold">PORTFOLIO BUILDER</p>
            <h1 className="text-3xl font-black tracking-tighter text-gray-900">포트폴리오 빌더</h1>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 space-y-4">
            {/* 템플릿 */}
            <div className="bg-white rounded-[24px] p-6 shadow-sm">
              <p className="text-xs tracking-[0.2em] uppercase text-gray-400 font-semibold mb-1">SELECT TEMPLATE</p>
              <h2 className="text-lg font-black tracking-tighter text-gray-900 mb-4">템플릿 선택</h2>
              <div className="grid grid-cols-5 gap-3">
                {TEMPLATES.map(t => (
                  <button key={t.id} onClick={() => setSelectedTemplate(t.id)}
                    className={`rounded-[16px] p-1 transition-all text-left ${selectedTemplate === t.id ? 'ring-3 ring-[#828DF8] ring-offset-2 shadow-lg' : 'hover:shadow-md'}`}>
                    <div className={`rounded-[12px] bg-gradient-to-br ${t.preview} flex items-center justify-center`} style={{ aspectRatio: '210/297' }}>
                      <div className="flex flex-col items-center" style={{ width: '70%' }}>
                        <div className="h-[1px] rounded-full mb-1" style={{ width: '40%', background: t.accent }} />
                        <div className="h-[3px] rounded-full mb-[2px]" style={{ width: '60%', background: t.text, opacity: 0.7 }} />
                        <div className="h-[2px] rounded-full" style={{ width: '40%', background: t.sub || t.accent, opacity: 0.4 }} />
                      </div>
                    </div>
                    <div className="px-1 py-1.5">
                      <p className="text-xs tracking-[0.1em] uppercase text-gray-400 font-semibold">{t.en}</p>
                      <p className="text-xs font-bold text-gray-900 tracking-tight">{t.name}</p>
                    </div>
                  </button>
                ))}
              </div>
              {selectedTemplate === 'myColor' && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-xs tracking-[0.15em] uppercase text-gray-400 font-semibold mb-3">CUSTOMIZE COLORS</p>
                  <div className="flex gap-4">
                    {[{ k: 'bg', l: '배경' }, { k: 'text', l: '텍스트' }, { k: 'accent', l: '포인트' }].map(({ k, l }) => (
                      <div key={k} className="flex-1">
                        <label className="text-xs text-gray-400 font-semibold block mb-1">{l}</label>
                        <div className="flex items-center gap-2">
                          <input type="color" value={customColors[k]} onChange={e => setCustomColors(p => ({ ...p, [k]: e.target.value }))}
                            className="w-8 h-8 rounded-[8px] cursor-pointer border border-gray-200 p-0" />
                          <span className="text-xs text-gray-400 font-mono">{customColors[k]}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 페이지당 장수 */}
            <div className="bg-white rounded-[24px] p-6 shadow-sm">
              <p className="text-xs tracking-[0.2em] uppercase text-gray-400 font-semibold mb-1">IMAGES PER PAGE</p>
              <h2 className="text-lg font-black tracking-tighter text-gray-900 mb-1">페이지당 이미지 수</h2>
              <p className="text-xs text-gray-400 mb-5">범위 내 자동 배치 · 에디터에서 자유 수정</p>
              <div className="relative h-10 flex items-center">
                <div className="absolute left-0 right-0 h-2 bg-gray-200 rounded-full" />
                <div className="absolute h-2 bg-[#828DF8] rounded-full" style={{ left: `${(ippMin - 1) * 20}%`, right: `${(6 - ippMax) * 20}%` }} />
                <input type="range" min="1" max="6" step="1" value={ippMin}
                  onChange={e => { const v = +e.target.value; setIppMin(Math.min(v, ippMax)) }}
                  className="absolute w-full h-2 appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-moz-range-thumb]:pointer-events-auto"
                  style={{ zIndex: ippMin === ippMax ? 2 : 1 }} />
                <input type="range" min="1" max="6" step="1" value={ippMax}
                  onChange={e => { const v = +e.target.value; setIppMax(Math.max(v, ippMin)) }}
                  className="absolute w-full h-2 appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-moz-range-thumb]:pointer-events-auto"
                  style={{ zIndex: 2 }} />
              </div>
              <div className="flex justify-between px-1 mt-1">
                {[1,2,3,4,5,6].map(n => <span key={n} className={`text-xs font-bold ${n >= ippMin && n <= ippMax ? 'text-[#828DF8]' : 'text-gray-300'}`}>{n}장</span>)}
              </div>
              <div className="mt-3 text-center bg-[#F4F3EE] rounded-[14px] py-3">
                <span className="text-2xl font-black text-[#828DF8]">{ippMin}</span>
                <span className="text-sm font-bold text-gray-400 mx-2">~</span>
                <span className="text-2xl font-black text-[#828DF8]">{ippMax}</span>
                <span className="text-sm font-bold text-gray-400 ml-1">장 / 페이지</span>
              </div>
            </div>

            {/* 방향 + 브랜딩 */}
            <div className="bg-white rounded-[24px] p-6 shadow-sm">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-xs tracking-[0.2em] uppercase text-gray-400 font-semibold mb-3">ORIENTATION</p>
                  <div className="flex gap-3">
                    {['portrait', 'landscape'].map(o => (
                      <button key={o} onClick={() => setOrientation(o)}
                        className={`flex-1 py-4 rounded-[16px] border-2 transition-all flex flex-col items-center gap-2 ${orientation === o ? 'border-[#828DF8] bg-[#828DF8]/5' : 'border-gray-200'}`}>
                        <div className={`${o === 'portrait' ? 'w-8 h-11' : 'w-11 h-8'} rounded-[4px] border-2 ${orientation === o ? 'border-[#828DF8]' : 'border-gray-300'}`} />
                        <span className="text-xs font-bold text-gray-700">{o === 'portrait' ? '세로 (A4)' : '가로'}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <p className="text-xs tracking-[0.2em] uppercase text-gray-400 font-semibold">BRANDING</p>
                  {[[title, setTitle, '포트폴리오 제목'], [subtitle, setSubtitle, '직군 또는 소개'], [contact, setContact, '이메일 또는 연락처']].map(([v, s, p], i) => (
                    <input key={i} className="w-full px-4 py-2.5 bg-[#F4F3EE] rounded-[12px] text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#828DF8]/30"
                      value={v} onChange={e => s(e.target.value)} placeholder={p} />
                  ))}
                </div>
              </div>
            </div>
          </div>

            {/* 폰트 선택 */}
            <div className="bg-white rounded-[24px] p-6 shadow-sm">
              <p className="text-xs tracking-[0.2em] uppercase text-gray-400 font-semibold mb-1">FONT</p>
              <h2 className="text-lg font-black tracking-tighter text-gray-900 mb-4">폰트 선택</h2>
              <div className="grid grid-cols-3 gap-2">
                {PDF_FONT_LIST.map(f => (
                  <button key={f.id} onClick={() => setPdfFontFamily(f.id)}
                    className={`px-3 py-2.5 rounded-[12px] text-left transition-all ${pdfFontFamily === f.id ? 'bg-gray-900 text-white' : 'bg-[#F4F3EE] text-gray-600 hover:bg-gray-200'}`}>
                    <span className="text-sm font-bold block truncate" style={{ fontFamily: f.family }}>{f.label}</span>
                    <span className={`text-[10px] ${pdfFontFamily === f.id ? 'text-white/60' : 'text-gray-400'}`}>{f.type}</span>
                  </button>
                ))}
              </div>
            </div>

          {/* 우측: 저장 목록 + 프로젝트 선택 */}
          <div className="space-y-4">
            {/* 저장된 작업 목록 */}
            {drafts.length > 0 && (
              <div className="bg-white rounded-[24px] p-5 shadow-sm">
                <p className="text-xs tracking-[0.2em] uppercase text-gray-400 font-semibold mb-1">MY PORTFOLIOS</p>
                <h2 className="text-sm font-black tracking-tighter text-gray-900 mb-3">저장된 작업</h2>
                <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                  {drafts.map(d => (
                    <div key={d.id} className="flex items-center gap-2 p-2.5 bg-[#F4F3EE] rounded-[12px] group hover:bg-[#828DF8]/5 transition-all">
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => loadDraft(d.id)}>
                        <p className="text-xs font-bold text-gray-900 truncate">{d.name}</p>
                        <p className="text-xs text-gray-400">{d.pageCount}p · {(() => {
                          const diff = Date.now() - d.updatedAt
                          if (diff < 60000) return '방금 전'
                          if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`
                          if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`
                          const date = new Date(d.updatedAt)
                          return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`
                        })()}</p>
                      </div>
                      <button onClick={() => loadDraft(d.id)}
                        className="px-2 py-1 bg-[#828DF8]/10 text-[#828DF8] rounded-[8px] text-xs font-bold hover:bg-[#828DF8]/20 flex-shrink-0">열기</button>
                      <button onClick={() => { if (confirm(`"${d.name}" 삭제?`)) deleteDraft(d.id) }}
                        className="w-5 h-5 rounded-[6px] text-gray-300 hover:text-red-400 hover:bg-red-50 flex items-center justify-center text-[10px] flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 로컬 폴더 불러오기 */}
            <div className="bg-gradient-to-br from-[#828DF8]/5 to-[#828DF8]/10 rounded-[24px] p-5 shadow-sm border border-[#828DF8]/20">
              <p className="text-xs tracking-[0.2em] uppercase text-[#828DF8] font-semibold mb-1">IMPORT LOCAL</p>
              <h2 className="text-sm font-black tracking-tighter text-gray-900 mb-2">로컬 폴더 불러오기</h2>
              <p className="text-xs text-gray-400 mb-3">폴더 선택 → 하위 폴더별 프로젝트 자동 정리</p>
              <input ref={fileInputRef} type="file" webkitdirectory="" directory="" multiple
                onChange={handleFolderImport} className="hidden" />
              <button onClick={() => fileInputRef.current?.click()} disabled={folderLoading}
                className="w-full py-3 bg-[#828DF8] text-white rounded-[14px] font-bold text-xs shadow-md shadow-[#828DF8]/25 hover:bg-[#6366F1] transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {folderLoading ? (
                  <><span className="animate-spin">⟳</span> 이미지 분석 중...</>
                ) : (
                  <><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg> 폴더 선택</>
                )}
              </button>
              {localProjects.length > 0 && (
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-[#828DF8] font-bold">{localProjects.length}개 로컬 프로젝트 · {localProjects.reduce((s, p) => s + p.assets.length, 0)}장</span>
                  <button onClick={() => { setLocalProjects([]); setSelectedProjectIds(prev => prev.filter(id => !id.startsWith('local_'))) }}
                    className="text-xs text-gray-400 hover:text-red-400">초기화</button>
                </div>
              )}
            </div>

            <div className="bg-white rounded-[24px] p-6 shadow-sm">
              <p className="text-xs tracking-[0.2em] uppercase text-gray-400 font-semibold mb-1">SELECT PROJECTS</p>
              <h2 className="text-lg font-black tracking-tighter text-gray-900 mb-4">포함할 프로젝트</h2>
              {allProjects.length === 0
                ? <p className="text-xs text-gray-400 text-center py-4">프로젝트를 먼저 생성하거나 폴더를 불러오세요</p>
                : <div className="space-y-2 max-h-[360px] overflow-y-auto">
                    {allProjects.map(p => (
                      <button key={p.id} onClick={() => toggleProject(p.id)}
                        className={`w-full flex items-center gap-3 p-3 rounded-[12px] transition-all text-left ${selectedProjectIds.includes(p.id) ? 'bg-[#828DF8]/10 ring-1 ring-[#828DF8]/30' : 'bg-[#F4F3EE] hover:bg-gray-200'}`}>
                        <div className={`w-5 h-5 rounded-[6px] flex items-center justify-center flex-shrink-0 ${selectedProjectIds.includes(p.id) ? 'bg-[#828DF8] text-white' : 'bg-white border border-gray-300'}`}>
                          {selectedProjectIds.includes(p.id) && <span className="text-xs">✓</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-gray-900 truncate">{p.name}{p.isLocal ? '' : ''}</p>
                          <p className="text-xs text-gray-400">
                            {p.isLocal ? (
                              <><span className="text-[#828DF8] font-semibold">로컬</span> · {p.imageCount || p.assets?.length || 0}장</>
                            ) : (
                              <>{p.client || '클라이언트 미지정'} · {p.imageCount || 0}장</>
                            )}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>}
            </div>
            {/* 선택된 프로젝트 순서 (드래그로 변경) */}
            {selectedProjectIds.length > 1 && (
              <div className="bg-white rounded-[24px] p-5 shadow-sm">
                <p className="text-xs tracking-[0.2em] uppercase text-gray-400 font-semibold mb-1">PROJECT ORDER</p>
                <p className="text-xs text-gray-400 mb-3">드래그하여 순서 변경</p>
                <div className="space-y-1.5">
                  {selectedProjectIds.map((pid, idx) => {
                    const pr = allProjects.find(p => p.id === pid)
                    if (!pr) return null
                    return (
                      <div key={pid} draggable
                        onDragStart={e => onProjectDragStart(e, pid)}
                        onDragOver={e => onProjectDragOver(e, pid)}
                        onDrop={e => onProjectDrop(e, pid)}
                        className="flex items-center gap-2 p-2.5 bg-[#F4F3EE] rounded-[10px] cursor-grab active:cursor-grabbing hover:bg-gray-200 transition-all select-none">
                        <span className="text-xs font-bold text-[#828DF8] w-4 text-center">{idx + 1}</span>
                        <span className="text-xs text-gray-400 flex-shrink-0">⠿</span>
                        <span className="text-xs font-bold text-gray-900 truncate flex-1">{pr.name}</span>
                        <span className="text-xs text-gray-400">{pr.imageCount || pr.assets?.length || 0}장</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="bg-white rounded-[24px] p-5 shadow-sm">
              <div className="flex justify-between text-xs mb-3"><span className="text-gray-400">선택된 프로젝트</span><span className="font-bold text-gray-900">{selectedProjectIds.length}개</span></div>
              <div className="flex justify-between text-xs mb-3"><span className="text-gray-400">방향</span><span className="font-bold text-gray-900">{orientation === 'portrait' ? 'A4 세로' : 'A4 가로'}</span></div>
              <div className="flex justify-between text-xs mb-4"><span className="text-gray-400">페이지당</span><span className="font-bold text-gray-900">{ippMin}~{ippMax}장</span></div>
              <button onClick={enterEditor} disabled={!selectedProjectIds.length || loading}
                className="w-full py-3.5 bg-[#828DF8] text-white rounded-[14px] font-bold text-sm shadow-lg shadow-[#828DF8]/25 hover:bg-[#6366F1] transition-all disabled:opacity-50">
                {loading ? '이미지 분석 중...' : '에디터 열기'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── 에디터 화면 ──
  return (
    <div className="flex flex-col h-[calc(100vh-40px)] min-w-0">
      {/* 툴바 */}
      <div className="flex items-center justify-between bg-white rounded-[16px] px-4 py-2.5 shadow-sm mb-3">
        <div className="flex items-center gap-3">
          <button onClick={() => { if (confirm('설정으로 돌아가시겠습니까? 작업 내용은 자동 저장됩니다.')) { if (activeDraftId) saveDraft(activeDraftId, draftName); setStep('setup') } }} className="text-xs text-gray-400 hover:text-gray-600 font-bold">← 설정으로</button>
          <div className="w-px h-5 bg-gray-200" />
          {/* 포트폴리오 이름 + 드롭다운 */}
          <div className="relative">
            <button onClick={() => setShowDraftDropdown(p => !p)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-[10px] hover:bg-[#F4F3EE] transition-all">
              <span className="text-xs font-bold text-gray-900 max-w-[140px] truncate">{draftName || title || '제목 없음'}</span>
              <span className="text-xs text-gray-400">{pages.length}p</span>
              <svg className={`w-3 h-3 text-gray-400 transition-transform ${showDraftDropdown ? 'rotate-180' : ''}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 5l3 3 3-3" /></svg>
            </button>
            <span className="text-xs text-green-500 font-medium ml-1">● 자동저장</span>
            {showDraftDropdown && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowDraftDropdown(false)} />
                <div className="absolute top-full left-0 mt-1 w-[260px] bg-white rounded-[16px] shadow-2xl border border-gray-100 p-3 z-50">
                  <p className="text-xs tracking-[0.15em] uppercase text-gray-400 font-semibold mb-2">내 포트폴리오</p>
                  {/* 현재 작업 이름 수정 */}
                  <div className="flex items-center gap-1.5 mb-2 pb-2 border-b border-gray-100">
                    <input value={draftName} onChange={e => setDraftName(e.target.value)}
                      onBlur={() => { if (activeDraftId) saveDraft(activeDraftId, draftName) }}
                      className="flex-1 px-2 py-1.5 bg-[#F4F3EE] rounded-[8px] text-sm font-bold text-gray-900 outline-none focus:ring-1 focus:ring-[#828DF8]/30"
                      placeholder="포트폴리오 이름" />
                    <span className="text-[11px] text-[#828DF8] font-bold flex-shrink-0">편집 중</span>
                  </div>
                  {/* 다른 저장된 작업 */}
                  <div className="space-y-1 max-h-[200px] overflow-y-auto">
                    {drafts.filter(d => d.id !== activeDraftId).map(d => (
                      <button key={d.id} onClick={() => { if (activeDraftId) saveDraft(activeDraftId, draftName); loadDraft(d.id); setShowDraftDropdown(false) }}
                        className="w-full flex items-center gap-2 p-2 rounded-[10px] hover:bg-[#F4F3EE] transition-all text-left group">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-900 truncate">{d.name}</p>
                          <p className="text-xs text-gray-400">{d.pageCount}p · {(() => {
                            const diff = Date.now() - d.updatedAt
                            if (diff < 60000) return '방금 전'
                            if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`
                            if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`
                            const date = new Date(d.updatedAt)
                            return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`
                          })()}</p>
                        </div>
                        <span className="w-4 h-4 rounded text-gray-300 hover:text-red-400 text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100"
                          onClick={e => { e.stopPropagation(); if (confirm(`"${d.name}" 삭제?`)) { deleteDraft(d.id); if (drafts.length <= 1) setShowDraftDropdown(false) } }}>×</span>
                      </button>
                    ))}
                  </div>
                  {/* 새로 만들기 */}
                  <button onClick={() => { if (activeDraftId) saveDraft(activeDraftId, draftName); setShowDraftDropdown(false); setStep('setup') }}
                    className="w-full mt-2 pt-2 border-t border-gray-100 flex items-center gap-2 p-2 rounded-[10px] hover:bg-[#828DF8]/5 transition-all text-left">
                    <span className="w-5 h-5 rounded-[6px] bg-[#828DF8]/10 flex items-center justify-center text-[#828DF8] text-xs font-bold">+</span>
                    <span className="text-sm font-bold text-[#828DF8]">새 포트폴리오 만들기</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={undo} disabled={!historyRef.current.length} title="실행 취소 (Ctrl+Z)"
            className="px-2 py-1.5 bg-[#F4F3EE] rounded-[10px] text-sm font-bold text-gray-600 hover:bg-gray-200 disabled:opacity-30">↩</button>
          <button onClick={redo} disabled={!futureRef.current.length} title="다시 실행 (Ctrl+Shift+Z)"
            className="px-2 py-1.5 bg-[#F4F3EE] rounded-[10px] text-sm font-bold text-gray-600 hover:bg-gray-200 disabled:opacity-30">↪</button>
          <div className="w-px h-5 bg-gray-200 mx-0.5" />
          <button onClick={() => setRightTab('images')} className="px-3 py-1.5 bg-[#F4F3EE] rounded-[10px] text-xs font-bold text-gray-600 hover:bg-gray-200">+ 이미지</button>
          <button onClick={addText} className="px-3 py-1.5 bg-[#F4F3EE] rounded-[10px] text-xs font-bold text-gray-600 hover:bg-gray-200">T 텍스트</button>
          <button onClick={addShape} className="px-2.5 py-1.5 bg-[#F4F3EE] rounded-[10px] text-xs font-bold text-gray-600 hover:bg-gray-200">▢</button>
          <div className="w-px h-5 bg-gray-200 mx-0.5" />
          <button onClick={addPage} className="px-2.5 py-1.5 bg-[#F4F3EE] rounded-[10px] text-xs font-bold text-gray-600 hover:bg-gray-200">+ 페이지</button>
          {pages.length > 1 && <button onClick={deletePage} className="px-2.5 py-1.5 bg-red-50 rounded-[10px] text-xs font-bold text-red-400 hover:bg-red-100">삭제</button>}
          <div className="w-px h-5 bg-gray-200 mx-0.5" />
          <div className="flex items-center gap-0.5">
            <button onClick={() => setZoom(z => Math.max(30, z - 15))} className="w-6 h-6 rounded-[8px] bg-[#F4F3EE] text-gray-600 text-xs font-bold hover:bg-gray-200 flex items-center justify-center">−</button>
            <button onClick={() => setZoom(100)} className="px-1.5 py-1 rounded-[8px] text-xs font-bold text-gray-600 hover:bg-[#F4F3EE] min-w-[36px] text-center">{zoom}%</button>
            <button onClick={() => setZoom(z => Math.min(200, z + 15))} className="w-6 h-6 rounded-[8px] bg-[#F4F3EE] text-gray-600 text-xs font-bold hover:bg-gray-200 flex items-center justify-center">+</button>
          </div>
          <div className="w-px h-5 bg-gray-200 mx-0.5" />
          <button onClick={handleDownload} disabled={generating}
            className="px-4 py-1.5 bg-[#828DF8] text-white rounded-[10px] text-xs font-bold shadow-md shadow-[#828DF8]/25 hover:bg-[#6366F1] disabled:opacity-50">
            {generating ? '생성 중...' : 'PDF 다운로드'}
          </button>
        </div>
      </div>

      <div className="flex flex-1 gap-3 min-h-0 min-w-0">
        {/* 왼쪽: 페이지 네비게이터 */}
        <div className="w-[140px] flex-shrink-0 bg-white rounded-[16px] p-3 shadow-sm overflow-y-auto">
          <p className="text-xs tracking-[0.15em] uppercase text-gray-400 font-semibold mb-2">PAGES</p>
          <div className="space-y-2">
            {pages.map((page, idx) => {
              const canDrag = !page.isCover && !page.isDivider
              return (
                <div key={page.id}
                  draggable={canDrag}
                  onDragStart={canDrag ? (e) => onPageDragStart(e, idx) : undefined}
                  onDragOver={canDrag ? onPageDragOver : undefined}
                  onDrop={canDrag ? (e) => onPageDrop(e, idx) : undefined}
                  onClick={() => { setCurrentPageIdx(idx); setSelectedElId(null); setEditingTextId(null) }}
                  className={`w-full rounded-[10px] overflow-hidden transition-all border-2 ${canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${idx === currentPageIdx ? 'border-[#828DF8] shadow-md' : 'border-transparent hover:border-gray-200'}`}>
                  <div className="w-full relative" style={{ aspectRatio: `${pw}/${ph}`, background: page.bg || '#fff' }}>
                    {page.elements.map(el => (
                      <div key={el.id} className="absolute overflow-hidden"
                        style={{ left: `${(el.x / pw) * 100}%`, top: `${(el.y / ph) * 100}%`, width: `${(el.w / pw) * 100}%`, height: `${(el.h / ph) * 100}%` }}>
                        {el.type === 'image' && (() => {
                          const fW = el.w, fH = el.h
                          const { imgW: iW, imgH: iH } = computeCover(el.ratio || 1.5, fW, fH, el.cropZoom || 1)
                          return (
                            <div className="w-full h-full overflow-hidden relative">
                              <img src={el.url} alt="" draggable={false} className="absolute"
                                style={{
                                  width: `${(iW / fW) * 100}%`, height: `${(iH / fH) * 100}%`,
                                  left: `${((el.cropX || 0) / fW) * 100}%`, top: `${((el.cropY || 0) / fH) * 100}%`,
                                  maxWidth: 'none',
                                }} />
                            </div>
                          )
                        })()}
                        {el.type === 'shape' && <div className="w-full h-full" style={{ background: el.color, opacity: el.opacity ?? 0.2 }} />}
                        {el.type === 'text' && <div style={{ fontSize: '2px', color: el.color, fontWeight: el.fontWeight }}>{el.text}</div>}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 text-center py-1">{page.isCover ? '표지' : page.isDivider ? `${page.projectName} ↓` : page.projectName || `${idx + 1}`}</p>
                </div>
              )
            })}
          </div>
        </div>

        {/* 중앙: 캔버스 */}
        <div className="flex-1 min-w-0 flex items-start justify-center overflow-auto bg-[#E8E7E3] rounded-[16px] p-6">
          <div className="relative shadow-2xl rounded-[4px] overflow-hidden"
            data-canvas
            ref={canvasRef}
            style={{ width: canvasW, height: canvasH, background: currentPage?.bg || '#fff', flexShrink: 0, fontFamily: (PDF_FONT_LIST.find(f => f.id === pdfFontFamily) || PDF_FONT_LIST[0]).family }}
            onMouseDown={handlers.handleCanvasMouseDown}
            onDragOver={handlers.handleCanvasDragOver}
            onDragLeave={handlers.handleCanvasDragLeave}
            onDrop={handlers.handleCanvasDrop}>

            {/* 중앙 가이드라인 */}
            <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: canvasW / 2, width: 1, background: 'rgba(130,141,248,0.15)' }} />
            <div className="absolute left-0 right-0 pointer-events-none" style={{ top: canvasH / 2, height: 1, background: 'rgba(130,141,248,0.15)' }} />

            {/* 스냅 가이드라인 */}
            {snapLines.map((line, i) =>
              line.axis === 'x'
                ? <div key={`snap-${i}`} className="absolute top-0 bottom-0 pointer-events-none z-50" style={{ left: line.pos * es, width: 1, background: '#F43F5E' }} />
                : <div key={`snap-${i}`} className="absolute left-0 right-0 pointer-events-none z-50" style={{ top: line.pos * es, height: 1, background: '#F43F5E' }} />
            )}

            {/* 크롭 모드: 배경 어둡게 */}
            {cropModeElId && <div className="absolute inset-0 bg-black/60 z-30 pointer-events-none" />}

            {currentPage?.elements.map(el => (
              <ElementRenderer
                key={el.id}
                el={el}
                es={es}
                isSel={el.id === selectedElId}
                isCropMode={cropModeElId === el.id}
                isDragOver={dragOverFrameId === el.id}
                pageBg={currentPage?.bg}
                handlers={handlers}
                cropModeElId={cropModeElId}
                editingTextId={editingTextId}
                onTextChange={(id, text) => updateEl(id, { text })}
                onTextBlur={() => setEditingTextId(null)}
                onDelete={(id) => deleteEl(id)}
                onCropToggle={(id) => setCropModeElId(prev => prev === id ? null : id)}
              />
            ))}
          </div>
        </div>

        {/* 오른쪽: 탭 패널 (이미지/레이아웃/순서) */}
        <div className="w-[240px] flex-shrink-0 flex flex-col gap-3 overflow-hidden">
          {/* 탭 바 */}
          <div className="flex gap-1 bg-white rounded-[12px] p-1 shadow-sm">
            {[
              { id: 'images', icon: '📷', label: '이미지' },
              { id: 'layouts', icon: '🔲', label: '레이아웃' },
              { id: 'order', icon: '⇅', label: '순서' },
            ].map(tab => (
              <button key={tab.id} onClick={() => setRightTab(tab.id)}
                className={`flex-1 py-1.5 rounded-[8px] text-xs font-bold transition-all ${rightTab === tab.id ? 'bg-[#828DF8] text-white shadow-sm' : 'text-gray-400 hover:bg-[#F4F3EE]'}`}>
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {/* 이미지 탭 */}
          {rightTab === 'images' && (
            <div className="bg-white rounded-[16px] p-3 shadow-sm flex-1 overflow-y-auto min-h-0">
              <p className="text-xs tracking-[0.15em] uppercase text-gray-400 font-semibold mb-2">PROJECT IMAGES</p>
              <p className="text-xs text-gray-300 mb-2">캔버스로 드래그하여 추가/교체</p>
              <ImageSidebar
                projectAssets={projectAssets}
                projects={projects}
                selectedProjectIds={selectedProjectIds}
                currentProjectName={currentPage?.projectName}
                localProjects={localProjects}
              />
            </div>
          )}

          {/* 레이아웃 탭 */}
          {rightTab === 'layouts' && (
            <div className="bg-white rounded-[16px] p-3 shadow-sm flex-1 overflow-y-auto min-h-0">
              <p className="text-xs tracking-[0.15em] uppercase text-gray-400 font-semibold mb-2">LAYOUTS</p>
              <div className="flex gap-0.5 mb-2">
                {[1,2,3,4,5,6].map(n => {
                  const isActiveTab = activeTab === n
                  const isCurrentCount = currentPageImgCount === n
                  return (
                    <button key={n} onClick={() => setLayoutTab(n)}
                      className={`flex-1 py-1 rounded-[6px] text-xs font-bold transition-all ${isActiveTab ? 'bg-[#828DF8] text-white' : isCurrentCount ? 'bg-[#828DF8]/15 text-[#828DF8]' : 'bg-[#F4F3EE] text-gray-400 hover:bg-gray-200'}`}>
                      {n}장
                    </button>
                  )
                })}
              </div>
              {currentPage?.isCover || currentPage?.isDivider ? (
                <p className="text-xs text-gray-300 text-center py-4">표지/구분 페이지</p>
              ) : (
                <div className="grid grid-cols-2 gap-1.5">
                  {availableLayouts.map(tpl => {
                    const isActive = activeLayoutId[currentPage?.id] === tpl.id
                    return (
                      <button key={tpl.id} onClick={() => applyLayoutTemplate(tpl)}
                        className={`relative rounded-[8px] overflow-hidden border-2 transition-all hover:shadow-md ${isActive ? 'border-[#828DF8] shadow-md shadow-[#828DF8]/20' : 'border-gray-100 hover:border-gray-300'}`}>
                        <svg viewBox={tpl.orientation === 'landscape' ? '0 0 141 100' : '0 0 100 141'} className="w-full bg-gray-50" style={{ aspectRatio: tpl.orientation === 'landscape' ? '297/210' : '210/297' }}>
                          {(tpl.imageSlots || []).map((slot, si) => {
                            const svgW = tpl.orientation === 'landscape' ? 125 : 84
                            const svgH = tpl.orientation === 'landscape' ? 80 : 117
                            const ox = tpl.orientation === 'landscape' ? 8 : 8
                            const oy = tpl.orientation === 'landscape' ? 10 : 12
                            const sx = ox + slot.x * svgW
                            const sy = oy + slot.y * svgH
                            const sw = slot.w * svgW
                            const sh = slot.h * svgH
                            return <rect key={si} x={sx} y={sy} width={sw} height={sh} rx={1.5}
                              fill={isActive ? '#828DF8' : '#C4C8F8'} opacity={0.5 + si * 0.1} />
                          })}
                          {tpl.hasTextZone && tpl.textZone && (() => {
                            const tw = tpl.orientation === 'landscape' ? 125 : 84
                            const th = tpl.orientation === 'landscape' ? 80 : 117
                            const tox = tpl.orientation === 'landscape' ? 8 : 8
                            const toy = tpl.orientation === 'landscape' ? 10 : 12
                            const tzx = tox + tpl.textZone.x * tw
                            const tzy = toy + tpl.textZone.y * th
                            const tzw = tpl.textZone.w * tw
                            return (
                              <>
                                <rect x={tzx} y={tzy} width={tzw * 0.5} height={1.2} fill={isActive ? '#6366F1' : '#999'} rx={0.5} />
                                <rect x={tzx} y={tzy + 4} width={tzw * 0.8} height={2.5} fill={isActive ? '#4F46E5' : '#666'} rx={0.5} />
                                <rect x={tzx} y={tzy + 9} width={tzw * 0.6} height={1} fill={isActive ? '#818CF8' : '#bbb'} rx={0.5} />
                              </>
                            )
                          })()}
                        </svg>
                        <p className="text-[8px] text-gray-500 font-medium py-0.5 truncate px-1">{tpl.name}</p>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* 순서 탭 */}
          {rightTab === 'order' && (
            <div className="bg-white rounded-[16px] p-3 shadow-sm flex-1 overflow-y-auto min-h-0">
              <p className="text-xs tracking-[0.15em] uppercase text-gray-400 font-semibold mb-2">PROJECT ORDER</p>
              {selectedProjectIds.length > 1 ? (
                <>
                  <div className="space-y-1">
                    {selectedProjectIds.map((pid, idx) => {
                      const pr = projects.find(p => p.id === pid)
                      if (!pr) return null
                      const isCurrent = currentPage?.projectName === pr.name
                      return (
                        <div key={pid} draggable
                          onDragStart={e => onProjectDragStart(e, pid)}
                          onDragOver={e => onProjectDragOver(e, pid)}
                          onDrop={e => onProjectDrop(e, pid)}
                          className={`flex items-center gap-1.5 px-2 py-1.5 rounded-[8px] cursor-grab active:cursor-grabbing transition-all select-none ${isCurrent ? 'bg-[#828DF8]/10 ring-1 ring-[#828DF8]/30' : 'bg-[#F4F3EE] hover:bg-gray-200'}`}>
                          <span className="text-xs font-bold text-[#828DF8] w-3 text-center">{idx + 1}</span>
                          <span className="text-xs text-gray-300">⠿</span>
                          <span className="text-xs font-bold text-gray-900 truncate flex-1">{pr.name}</span>
                        </div>
                      )
                    })}
                  </div>
                  <button onClick={reorderAndRegenerate}
                    className="w-full mt-2 py-1.5 bg-[#828DF8]/10 text-[#828DF8] rounded-[8px] text-xs font-bold hover:bg-[#828DF8]/20 transition-all">
                    순서 적용하기
                  </button>
                </>
              ) : (
                <p className="text-xs text-gray-300 text-center py-4">프로젝트가 2개 이상일 때 순서 변경 가능</p>
              )}
            </div>
          )}

          {/* 하단: 속성 패널 (요소 선택시) */}
          {selectedEl && (
            <div className="bg-white rounded-[16px] p-3 shadow-sm overflow-y-auto max-h-[45%]">
              <p className="text-xs tracking-[0.15em] uppercase text-gray-400 font-semibold mb-2">
                {selectedEl.type === 'text' ? 'TEXT' : selectedEl.type === 'image' ? 'IMAGE' : 'SHAPE'}
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {[['X', 'x', selectedEl.x], ['Y', 'y', selectedEl.y], ['W', 'w', selectedEl.w], ['H', 'h', selectedEl.h]].map(([l, k, v]) => (
                  <div key={k}>
                    <label className="text-[11px] text-gray-400 font-semibold">{l}</label>
                    <input type="number" value={Math.round(v)} onChange={e => updateEl(selectedEl.id, { [k]: +e.target.value })}
                      className="w-full px-1.5 py-1 bg-[#F4F3EE] rounded-[6px] text-xs text-gray-900 outline-none" />
                  </div>
                ))}
              </div>

              {selectedEl.type === 'text' && (
                <div className="mt-2 space-y-2">
                  <div className="flex gap-1">
                    <input type="number" value={selectedEl.fontSize} onChange={e => updateEl(selectedEl.id, { fontSize: Math.max(4, +e.target.value) })}
                      className="w-14 px-1.5 py-1 bg-[#F4F3EE] rounded-[6px] text-xs text-gray-900 outline-none" />
                    {['normal', 'bold'].map(w => (
                      <button key={w} onClick={() => updateEl(selectedEl.id, { fontWeight: w })}
                        className={`flex-1 py-1 rounded-[6px] text-xs font-bold ${selectedEl.fontWeight === w ? 'bg-[#828DF8] text-white' : 'bg-[#F4F3EE] text-gray-500'}`}>{w === 'bold' ? 'B' : 'R'}</button>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    {['left', 'center', 'right'].map(a => (
                      <button key={a} onClick={() => updateEl(selectedEl.id, { align: a })}
                        className={`flex-1 py-1 rounded-[6px] text-xs font-bold ${selectedEl.align === a ? 'bg-[#828DF8] text-white' : 'bg-[#F4F3EE] text-gray-500'}`}>
                        {a === 'left' ? '←' : a === 'center' ? '↔' : '→'}
                      </button>
                    ))}
                  </div>
                  <input type="color" value={selectedEl.color} onChange={e => updateEl(selectedEl.id, { color: e.target.value })}
                    className="w-full h-6 rounded-[6px] cursor-pointer border-0" />
                </div>
              )}

              {selectedEl.type === 'shape' && (
                <div className="mt-2 space-y-2">
                  <input type="color" value={selectedEl.color} onChange={e => updateEl(selectedEl.id, { color: e.target.value })}
                    className="w-full h-6 rounded-[6px] cursor-pointer border-0" />
                  <input type="range" min="0" max="1" step="0.05" value={selectedEl.opacity ?? 0.2}
                    onChange={e => updateEl(selectedEl.id, { opacity: +e.target.value })} className="w-full" />
                </div>
              )}

              {selectedEl.type === 'image' && pages.length > 1 && (
                <div className="flex gap-1 mt-2">
                  <button onClick={() => moveImageToPage(-1)} disabled={currentPageIdx <= 0}
                    className="flex-1 py-1.5 bg-[#F4F3EE] rounded-[6px] text-xs font-bold text-gray-600 hover:bg-gray-200 disabled:opacity-30">← 이전</button>
                  <button onClick={() => moveImageToPage(1)} disabled={currentPageIdx >= pages.length - 1}
                    className="flex-1 py-1.5 bg-[#F4F3EE] rounded-[6px] text-xs font-bold text-gray-600 hover:bg-gray-200 disabled:opacity-30">다음 →</button>
                </div>
              )}

              <button onClick={() => deleteEl(selectedEl.id)}
                className="w-full py-1.5 bg-red-50 text-red-500 rounded-[8px] text-xs font-bold hover:bg-red-100 mt-2">삭제</button>
            </div>
          )}
        </div>
      </div>

      {/* 하단 페이지 인디케이터 */}
      <div className="flex items-center justify-center gap-2 mt-3">
        <button onClick={() => { setCurrentPageIdx(Math.max(0, currentPageIdx - 1)); setSelectedElId(null) }} disabled={currentPageIdx === 0}
          className="w-7 h-7 rounded-full bg-white flex items-center justify-center text-gray-400 hover:bg-gray-100 disabled:opacity-30 text-xs shadow-sm">◀</button>
        <span className="text-xs font-bold text-gray-600">{currentPageIdx + 1} / {pages.length}</span>
        <button onClick={() => { setCurrentPageIdx(Math.min(pages.length - 1, currentPageIdx + 1)); setSelectedElId(null) }} disabled={currentPageIdx === pages.length - 1}
          className="w-7 h-7 rounded-full bg-white flex items-center justify-center text-gray-400 hover:bg-gray-100 disabled:opacity-30 text-xs shadow-sm">▶</button>
      </div>

    </div>
  )
}
