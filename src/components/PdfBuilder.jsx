import { useState, useRef, useCallback, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useProjects } from '../hooks/useProjects'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import { jsPDF } from 'jspdf'

// ── 상수 ──
const A4_W = 210, A4_H = 297  // mm
const A4_L_W = 297, A4_L_H = 210
const SCALE = 2.5 // mm → px
const SNAP_GRID = 5 // mm

// ── 레이아웃 프리셋 ──
const LAYOUTS = [
  { id: 'fullbleed', name: '풀블리드', en: 'FULL BLEED', desc: '한 장이 페이지 전체', icon: '◻', maxPerPage: 1 },
  { id: 'split', name: '좌우 분할', en: 'SPLIT', desc: '두 장 나란히', icon: '◫', maxPerPage: 2 },
  { id: 'hero2', name: '1+2 매거진', en: 'HERO + 2', desc: '메인 1장 + 하단 2장', icon: '▣', maxPerPage: 3 },
  { id: 'grid4', name: '2×2 그리드', en: '2×2 GRID', desc: '네 장 균등 배치', icon: '⊞', maxPerPage: 4 },
  { id: 'hero3', name: '1+3 에디토리얼', en: 'HERO + 3', desc: '메인 1장 + 하단 3장', icon: '▦', maxPerPage: 4 },
]

// ── 레이아웃별 이미지 배치 생성 ──
function layoutImages(layoutId, imageUrls, pw, ph, margin = 15, gap = 4, startY = 48) {
  const areaW = pw - margin * 2
  const areaH = ph - startY - margin
  const elements = []

  if (imageUrls.length === 0) return elements

  switch (layoutId) {
    case 'fullbleed': {
      // 이미지가 페이지 전체 (마진 없이)
      elements.push(createImageElement(imageUrls[0], 0, 0, pw, ph))
      break
    }
    case 'split': {
      const halfW = (areaW - gap) / 2
      if (imageUrls[0]) elements.push(createImageElement(imageUrls[0], margin, startY, halfW, areaH))
      if (imageUrls[1]) elements.push(createImageElement(imageUrls[1], margin + halfW + gap, startY, halfW, areaH))
      break
    }
    case 'hero2': {
      const bigH = areaH * 0.62
      const smallH = areaH - bigH - gap
      const halfW = (areaW - gap) / 2
      if (imageUrls[0]) elements.push(createImageElement(imageUrls[0], margin, startY, areaW, bigH))
      if (imageUrls[1]) elements.push(createImageElement(imageUrls[1], margin, startY + bigH + gap, halfW, smallH))
      if (imageUrls[2]) elements.push(createImageElement(imageUrls[2], margin + halfW + gap, startY + bigH + gap, halfW, smallH))
      break
    }
    case 'grid4': {
      const halfW = (areaW - gap) / 2
      const halfH = (areaH - gap) / 2
      if (imageUrls[0]) elements.push(createImageElement(imageUrls[0], margin, startY, halfW, halfH))
      if (imageUrls[1]) elements.push(createImageElement(imageUrls[1], margin + halfW + gap, startY, halfW, halfH))
      if (imageUrls[2]) elements.push(createImageElement(imageUrls[2], margin, startY + halfH + gap, halfW, halfH))
      if (imageUrls[3]) elements.push(createImageElement(imageUrls[3], margin + halfW + gap, startY + halfH + gap, halfW, halfH))
      break
    }
    case 'hero3':
    default: {
      const bigH = areaH * 0.6
      const smallH = areaH - bigH - gap
      const cols = Math.min(imageUrls.length - 1, 3)
      if (imageUrls[0]) elements.push(createImageElement(imageUrls[0], margin, startY, areaW, bigH))
      if (cols > 0) {
        const smallW = (areaW - gap * (cols - 1)) / cols
        for (let i = 1; i <= cols; i++) {
          if (imageUrls[i]) elements.push(createImageElement(imageUrls[i], margin + (i - 1) * (smallW + gap), startY + bigH + gap, smallW, smallH))
        }
      }
      break
    }
  }
  return elements
}

// ── 템플릿 프리셋 ──
const TEMPLATES = [
  {
    id: 'minimal', name: '미니멀 화이트', en: 'MINIMAL WHITE',
    desc: '깔끔한 여백 중심 — Cereal Magazine 스타일',
    preview: 'from-white to-gray-100',
    bg: '#ffffff', text: '#1a1a1a', accent: '#828DF8',
    coverLayout: 'center', gridStyle: 'clean',
  },
  {
    id: 'dark', name: '다크 모던', en: 'DARK MODERN',
    desc: '어두운 배경, 이미지 강조 — Hedi Slimane 스타일',
    preview: 'from-gray-800 to-gray-900',
    bg: '#111111', text: '#ffffff', accent: '#828DF8',
    coverLayout: 'center', gridStyle: 'bleed',
  },
  {
    id: 'magazine', name: '매거진 에디토리얼', en: 'EDITORIAL',
    desc: 'Vogue, W Korea 편집 레이아웃',
    preview: 'from-rose-50 to-rose-100',
    bg: '#FAFAFA', text: '#1a1a1a', accent: '#E63946',
    coverLayout: 'left', gridStyle: 'overlap',
  },
  {
    id: 'photobook', name: '포토북 클래식', en: 'PHOTOBOOK',
    desc: '전면 이미지, 최소 텍스트 — Mario Testino 스타일',
    preview: 'from-amber-50 to-amber-100',
    bg: '#FFFBF0', text: '#1a1a1a', accent: '#D4A373',
    coverLayout: 'center', gridStyle: 'fullbleed',
  },
]

// ── 요소 생성 헬퍼 ──
let _elId = 0
const uid = () => `el_${Date.now()}_${++_elId}`

function createImageElement(url, x = 20, y = 20, w = 80, h = 60, aspectRatio = null) {
  return { id: uid(), type: 'image', url, x, y, w, h, aspectRatio: aspectRatio || w / h, rotation: 0 }
}

function createTextElement(text = '텍스트 입력', x = 20, y = 20, w = 100, h = 20, opts = {}) {
  return {
    id: uid(), type: 'text', text, x, y, w, h,
    fontSize: opts.fontSize || 14,
    fontWeight: opts.fontWeight || 'normal',
    color: opts.color || '#1a1a1a',
    align: opts.align || 'left',
    rotation: 0,
  }
}

function createShapeElement(shape = 'rect', x = 20, y = 20, w = 60, h = 60, color = '#828DF8') {
  return { id: uid(), type: 'shape', shape, x, y, w, h, color, opacity: 0.2, rotation: 0 }
}

// ── 커버 페이지 생성 ──
function generateCoverPage(template, title, subtitle, contact, orientation) {
  const pw = orientation === 'landscape' ? A4_L_W : A4_W
  const ph = orientation === 'landscape' ? A4_L_H : A4_H
  const cx = pw / 2
  const cy = ph / 2
  const elements = []

  // 액센트 라인
  elements.push(createShapeElement('rect', cx - 25, cy - 40, 50, 1, template.accent))

  // 타이틀 — 넉넉한 크기
  elements.push(createTextElement(title || 'PORTFOLIO', 15, cy - 35, pw - 30, 30, {
    fontSize: 32, fontWeight: 'bold', color: template.text, align: 'center'
  }))

  // 서브타이틀
  elements.push(createTextElement((subtitle || 'Creative').toUpperCase(), 15, cy + 5, pw - 30, 14, {
    fontSize: 11, fontWeight: 'normal', color: template.accent, align: 'center'
  }))

  // 연락처
  elements.push(createTextElement(contact || '', 15, cy + 35, pw - 30, 12, {
    fontSize: 9, fontWeight: 'normal', color: '#999999', align: 'center'
  }))

  return { id: uid(), elements, bg: template.bg }
}

// ── 프로젝트 페이지들 생성 (레이아웃에 따라 여러 페이지) ──
function generateProjectPages(template, project, imageUrls, orientation, layoutId = 'hero3') {
  const pw = orientation === 'landscape' ? A4_L_W : A4_W
  const ph = orientation === 'landscape' ? A4_L_H : A4_H
  const layout = LAYOUTS.find(l => l.id === layoutId) || LAYOUTS[4]
  const pages = []

  if (imageUrls.length === 0) {
    // placeholder 페이지
    const elements = [
      createTextElement((project.client || project.category || '').toUpperCase(), 15, 15, 80, 8, { fontSize: 8, color: template.accent }),
      createTextElement(project.name, 15, 24, 150, 14, { fontSize: 20, fontWeight: 'bold', color: template.text }),
      createShapeElement('rect', 15, 40, 30, 0.8, template.accent),
      createShapeElement('rect', 15, 48, pw - 30, 120, template.accent),
      createTextElement(`${project.imageCount || 0} images`, pw / 2 - 25, 100, 50, 12, { fontSize: 10, color: template.accent, align: 'center' }),
    ]
    pages.push({ id: uid(), elements, bg: template.bg, projectId: project.id, projectName: project.name })
    return pages
  }

  // 이미지들을 레이아웃 단위로 분할
  const perPage = layout.maxPerPage
  const chunks = []
  for (let i = 0; i < imageUrls.length; i += perPage) {
    chunks.push(imageUrls.slice(i, i + perPage))
  }

  chunks.forEach((chunk, ci) => {
    const elements = []
    const isFullbleed = layoutId === 'fullbleed'

    // 풀블리드가 아닌 경우에만 텍스트 헤더 추가 (첫 페이지만)
    if (!isFullbleed && ci === 0) {
      elements.push(createTextElement(
        (project.client || project.category || '').toUpperCase(), 15, 15, 80, 8,
        { fontSize: 8, color: template.accent }
      ))
      elements.push(createTextElement(
        project.name, 15, 24, 150, 14,
        { fontSize: 20, fontWeight: 'bold', color: template.text }
      ))
      elements.push(createShapeElement('rect', 15, 40, 30, 0.8, template.accent))
    }

    // 풀블리드면 startY = 0, 아니면 첫페이지 48 / 이후 15
    const startY = isFullbleed ? 0 : (ci === 0 ? 48 : 15)
    const margin = isFullbleed ? 0 : 15
    const imgElements = layoutImages(layoutId, chunk, pw, ph, margin, 4, startY)
    elements.push(...imgElements)

    pages.push({ id: uid(), elements, bg: template.bg, projectId: project.id, projectName: project.name })
  })

  return pages
}

// ── 레이아웃 아이콘 미니 프리뷰 ──
function LayoutIcon({ layoutId, active }) {
  const border = active ? 'border-[#828DF8]' : 'border-gray-300'
  const bg = active ? 'bg-[#828DF8]/20' : 'bg-gray-200'
  const w = 40, h = 52
  const r = 'rounded-[2px]'
  switch (layoutId) {
    case 'fullbleed':
      return <div className={`${r} ${bg} border ${border}`} style={{ width: w, height: h }} />
    case 'split':
      return (
        <div className={`flex gap-[2px] border ${border} ${r} p-[3px]`} style={{ width: w, height: h }}>
          <div className={`flex-1 ${bg} ${r}`} />
          <div className={`flex-1 ${bg} ${r}`} />
        </div>
      )
    case 'hero2':
      return (
        <div className={`flex flex-col gap-[2px] border ${border} ${r} p-[3px]`} style={{ width: w, height: h }}>
          <div className={`flex-[3] ${bg} ${r}`} />
          <div className="flex gap-[2px] flex-[2]">
            <div className={`flex-1 ${bg} ${r}`} />
            <div className={`flex-1 ${bg} ${r}`} />
          </div>
        </div>
      )
    case 'grid4':
      return (
        <div className={`grid grid-cols-2 gap-[2px] border ${border} ${r} p-[3px]`} style={{ width: w, height: h }}>
          <div className={`${bg} ${r}`} />
          <div className={`${bg} ${r}`} />
          <div className={`${bg} ${r}`} />
          <div className={`${bg} ${r}`} />
        </div>
      )
    case 'hero3':
    default:
      return (
        <div className={`flex flex-col gap-[2px] border ${border} ${r} p-[3px]`} style={{ width: w, height: h }}>
          <div className={`flex-[3] ${bg} ${r}`} />
          <div className="flex gap-[2px] flex-[2]">
            <div className={`flex-1 ${bg} ${r}`} />
            <div className={`flex-1 ${bg} ${r}`} />
            <div className={`flex-1 ${bg} ${r}`} />
          </div>
        </div>
      )
  }
}

// ── 메인 컴포넌트 ──
export default function PdfBuilder({ isMobile }) {
  const { user, userDoc } = useAuth()
  const { projects } = useProjects()

  // 상태
  const [step, setStep] = useState('setup') // setup | editor
  const [orientation, setOrientation] = useState('portrait')
  const [selectedTemplate, setSelectedTemplate] = useState('minimal')
  const [selectedProjectIds, setSelectedProjectIds] = useState([])
  const [selectedLayout, setSelectedLayout] = useState('hero3')
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [contact, setContact] = useState('')

  // 에디터 상태
  const [pages, setPages] = useState([])
  const [currentPageIdx, setCurrentPageIdx] = useState(0)
  const [selectedElId, setSelectedElId] = useState(null)
  const [dragState, setDragState] = useState(null)
  const [resizeState, setResizeState] = useState(null)
  const [editingTextId, setEditingTextId] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [showLeftPanel, setShowLeftPanel] = useState(true)
  const [zoom, setZoom] = useState(100) // percent

  const canvasRef = useRef(null)

  const template = TEMPLATES.find(t => t.id === selectedTemplate)
  const pw = orientation === 'landscape' ? A4_L_W : A4_W
  const ph = orientation === 'landscape' ? A4_L_H : A4_H
  const zoomScale = zoom / 100
  const canvasW = pw * SCALE * zoomScale
  const canvasH = ph * SCALE * zoomScale

  const currentPage = pages[currentPageIdx]
  const selectedEl = currentPage?.elements.find(e => e.id === selectedElId)

  // 프로필 정보 자동 반영
  useEffect(() => {
    if (userDoc && !title) {
      setTitle(userDoc.displayName || '')
      setSubtitle(userDoc.profession || '')
      const contactParts = [userDoc.email || user?.email, userDoc.phone, userDoc.instagram ? `@${userDoc.instagram}` : ''].filter(Boolean)
      setContact(contactParts.join(' | '))
    }
  }, [userDoc])

  // 프로젝트 토글
  const toggleProject = (id) => {
    setSelectedProjectIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  // ── 에디터 진입: 페이지 자동 생성 ──
  const enterEditor = async () => {
    const newPages = []

    // 커버
    newPages.push(generateCoverPage(template, title, subtitle, contact, orientation))

    // 프로젝트 페이지들
    for (const pid of selectedProjectIds) {
      const project = projects.find(p => p.id === pid)
      if (!project) continue

      // Firestore에서 이미지 URL 가져오기
      let imageUrls = []
      try {
        const snap = await getDocs(query(collection(db, 'assets'), where('projectId', '==', pid)))
        imageUrls = snap.docs
          .map(d => d.data())
          .filter(a => !a.isVideo)
          .slice(0, 20)
          .map(a => a.url)
      } catch (e) {
        console.warn('이미지 로드 실패:', e)
      }

      newPages.push(...generateProjectPages(template, project, imageUrls, orientation, selectedLayout))
    }

    // 마지막 연락처 페이지
    const lastPage = {
      id: uid(),
      bg: template.bg,
      elements: [
        createTextElement('CONTACT', 15, ph / 2 - 25, pw - 30, 10, { fontSize: 9, color: template.accent, align: 'center' }),
        createTextElement(title || '', 15, ph / 2 - 10, pw - 30, 20, { fontSize: 22, fontWeight: 'bold', color: template.text, align: 'center' }),
        createTextElement(contact || '', 15, ph / 2 + 15, pw - 30, 12, { fontSize: 10, color: '#999999', align: 'center' }),
        createTextElement('Made with ASSI', 15, ph / 2 + 40, pw - 30, 8, { fontSize: 7, color: '#cccccc', align: 'center' }),
      ]
    }
    newPages.push(lastPage)

    setPages(newPages)
    setCurrentPageIdx(0)
    setSelectedElId(null)
    setStep('editor')
  }

  // ── 요소 업데이트 ──
  const updateElement = useCallback((elId, updates) => {
    setPages(prev => prev.map((page, idx) =>
      idx === currentPageIdx
        ? { ...page, elements: page.elements.map(el => el.id === elId ? { ...el, ...updates } : el) }
        : page
    ))
  }, [currentPageIdx])

  const deleteElement = useCallback((elId) => {
    setPages(prev => prev.map((page, idx) =>
      idx === currentPageIdx
        ? { ...page, elements: page.elements.filter(el => el.id !== elId) }
        : page
    ))
    if (selectedElId === elId) setSelectedElId(null)
  }, [currentPageIdx, selectedElId])

  // ── 텍스트 추가 ──
  const addText = () => {
    const el = createTextElement('텍스트 입력', pw / 2 - 40, ph / 2 - 8, 80, 16, {
      fontSize: 14, color: template.text
    })
    setPages(prev => prev.map((page, idx) =>
      idx === currentPageIdx ? { ...page, elements: [...page.elements, el] } : page
    ))
    setSelectedElId(el.id)
  }

  // ── 도형 추가 ──
  const addShape = (shape = 'rect') => {
    const el = createShapeElement(shape, pw / 2 - 30, ph / 2 - 30, 60, 60, template.accent)
    setPages(prev => prev.map((page, idx) =>
      idx === currentPageIdx ? { ...page, elements: [...page.elements, el] } : page
    ))
    setSelectedElId(el.id)
  }

  // ── 페이지 추가/삭제 ──
  const addPage = () => {
    const newPage = { id: uid(), elements: [], bg: template.bg }
    setPages(prev => [...prev.slice(0, currentPageIdx + 1), newPage, ...prev.slice(currentPageIdx + 1)])
    setCurrentPageIdx(currentPageIdx + 1)
  }

  const deletePage = () => {
    if (pages.length <= 1) return
    setPages(prev => prev.filter((_, i) => i !== currentPageIdx))
    setCurrentPageIdx(Math.min(currentPageIdx, pages.length - 2))
  }

  // ── 드래그 핸들러 ──
  const effectiveScale = SCALE * zoomScale

  const handleCanvasMouseDown = (e) => {
    if (editingTextId) return
    const rect = canvasRef.current.getBoundingClientRect()
    const mx = (e.clientX - rect.left) / effectiveScale
    const my = (e.clientY - rect.top) / effectiveScale

    // 요소 히트 테스트 (역순 — 위에 있는 것 먼저)
    const els = [...(currentPage?.elements || [])].reverse()
    const hit = els.find(el => mx >= el.x && mx <= el.x + el.w && my >= el.y && my <= el.y + el.h)

    if (hit) {
      setSelectedElId(hit.id)

      // 리사이즈 핸들 체크 (우하단 8x8 px 영역)
      const handleSize = 4 / effectiveScale * 2
      if (mx >= hit.x + hit.w - handleSize && my >= hit.y + hit.h - handleSize) {
        setResizeState({ elId: hit.id, startX: mx, startY: my, origW: hit.w, origH: hit.h })
      } else {
        setDragState({ elId: hit.id, offsetX: mx - hit.x, offsetY: my - hit.y })
      }
    } else {
      setSelectedElId(null)
    }
  }

  const handleCanvasMouseMove = (e) => {
    if (!dragState && !resizeState) return
    const rect = canvasRef.current.getBoundingClientRect()
    const mx = (e.clientX - rect.left) / effectiveScale
    const my = (e.clientY - rect.top) / effectiveScale

    if (dragState) {
      let nx = mx - dragState.offsetX
      let ny = my - dragState.offsetY
      // 캔버스 내 제한
      const el = currentPage.elements.find(e => e.id === dragState.elId)
      if (el) {
        nx = Math.max(0, Math.min(pw - el.w, nx))
        ny = Math.max(0, Math.min(ph - el.h, ny))
      }
      updateElement(dragState.elId, { x: nx, y: ny })
    }

    if (resizeState) {
      const dx = mx - resizeState.startX
      const el = currentPage.elements.find(e => e.id === resizeState.elId)
      // 이미지는 비율 고정
      if (el?.type === 'image' && el.aspectRatio) {
        const nw = Math.max(15, resizeState.origW + dx)
        const nh = nw / el.aspectRatio
        updateElement(resizeState.elId, { w: nw, h: nh })
      } else {
        const dy = my - resizeState.startY
        const nw = Math.max(10, resizeState.origW + dx)
        const nh = Math.max(10, resizeState.origH + dy)
        updateElement(resizeState.elId, { w: nw, h: nh })
      }
    }
  }

  const handleCanvasMouseUp = () => {
    setDragState(null)
    setResizeState(null)
  }

  // ── 텍스트 더블클릭 편집 ──
  const handleDoubleClick = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const mx = (e.clientX - rect.left) / effectiveScale
    const my = (e.clientY - rect.top) / effectiveScale
    const els = [...(currentPage?.elements || [])].reverse()
    const hit = els.find(el => el.type === 'text' && mx >= el.x && mx <= el.x + el.w && my >= el.y && my <= el.y + el.h)
    if (hit) {
      setEditingTextId(hit.id)
      setSelectedElId(hit.id)
    }
  }

  // ── 키보드 핸들러 ──
  useEffect(() => {
    const handler = (e) => {
      if (editingTextId) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedElId && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
          e.preventDefault()
          deleteElement(selectedElId)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedElId, editingTextId, deleteElement])

  // ── 이미지 → canvas로 EXIF 회전 처리 + base64 ──
  const fetchImageData = (url) => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        try {
          // 브라우저가 EXIF 회전을 자동 적용한 상태의 크기
          const w = img.naturalWidth
          const h = img.naturalHeight
          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, w, h)
          const base64 = canvas.toDataURL('image/jpeg', 0.85)
          resolve({ base64, format: 'JPEG', naturalW: w, naturalH: h })
        } catch (e) {
          reject(e)
        }
      }
      img.onerror = () => reject(new Error('Image load failed'))
      img.src = url
    })
  }

  // ── 비율 유지하면서 박스에 맞추기 (object-cover) ──
  const fitImageInBox = (natW, natH, boxW, boxH) => {
    const imgRatio = natW / natH
    const boxRatio = boxW / boxH
    let drawW, drawH, drawX, drawY
    if (imgRatio > boxRatio) {
      drawH = boxH
      drawW = boxH * imgRatio
      drawX = -(drawW - boxW) / 2
      drawY = 0
    } else {
      drawW = boxW
      drawH = boxW / imgRatio
      drawX = 0
      drawY = -(drawH - boxH) / 2
    }
    return { drawX, drawY, drawW, drawH }
  }

  // ── 한글 폰트 로드 (TTF만 지원) ──
  const loadKoreanFont = async (pdf) => {
    // NanumGothic TTF — jsPDF는 TTF만 지원
    const fontUrls = [
      'https://raw.githubusercontent.com/google/fonts/main/ofl/nanumgothic/NanumGothic-Regular.ttf',
      'https://cdn.jsdelivr.net/gh/googlefonts/nanum@main/fonts/NanumGothic-Regular.ttf',
    ]
    for (const fontUrl of fontUrls) {
      try {
        const resp = await fetch(fontUrl)
        if (!resp.ok) continue
        const buf = await resp.arrayBuffer()
        const binary = new Uint8Array(buf)
        let binaryStr = ''
        for (let i = 0; i < binary.length; i++) binaryStr += String.fromCharCode(binary[i])
        const b64 = btoa(binaryStr)
        pdf.addFileToVFS('NanumGothic.ttf', b64)
        pdf.addFont('NanumGothic.ttf', 'NanumGothic', 'normal')
        pdf.addFont('NanumGothic.ttf', 'NanumGothic', 'bold')
        return 'NanumGothic'
      } catch (e) {
        console.warn('폰트 로드 실패:', fontUrl, e)
      }
    }
    return null
  }

  // ── PDF 다운로드 ──
  const handleDownload = async () => {
    setGenerating(true)
    try {
      const isLandscape = orientation === 'landscape'
      const pdf = new jsPDF({
        unit: 'mm',
        format: 'a4',
        orientation: isLandscape ? 'landscape' : 'portrait',
      })

      // 한글 폰트 로드 (TTF만 지원 — NanumGothic)
      const fontName = (await loadKoreanFont(pdf)) || 'helvetica'

      const hexToRgb = (hex) => {
        const h = hex.replace('#', '')
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
      }

      for (let pi = 0; pi < pages.length; pi++) {
        if (pi > 0) pdf.addPage()
        const page = pages[pi]

        // 배경
        pdf.setFillColor(...hexToRgb(page.bg || '#ffffff'))
        pdf.rect(0, 0, pw, ph, 'F')

        // 요소들
        for (const el of page.elements) {
          if (el.type === 'text') {
            pdf.setFontSize(el.fontSize || 12)
            pdf.setTextColor(...hexToRgb(el.color || '#000000'))
            const style = el.fontWeight === 'bold' ? 'bold' : 'normal'
            pdf.setFont(fontName, style)
            const align = el.align || 'left'
            let tx = el.x
            if (align === 'center') tx = el.x + el.w / 2
            else if (align === 'right') tx = el.x + el.w
            pdf.text(el.text || '', tx, el.y + el.fontSize * 0.35, { align })
          } else if (el.type === 'shape') {
            const rgb = hexToRgb(el.color || '#828DF8')
            pdf.setFillColor(rgb[0], rgb[1], rgb[2])
            pdf.setGState(new pdf.GState({ opacity: el.opacity ?? 0.2 }))
            if (el.shape === 'circle') {
              pdf.circle(el.x + el.w / 2, el.y + el.h / 2, Math.min(el.w, el.h) / 2, 'F')
            } else {
              pdf.rect(el.x, el.y, el.w, el.h, 'F')
            }
            pdf.setGState(new pdf.GState({ opacity: 1 }))
          } else if (el.type === 'image' && el.url) {
            try {
              const imgData = await fetchImageData(el.url)
              const fit = fitImageInBox(imgData.naturalW, imgData.naturalH, el.w, el.h)

              // 클리핑: 박스 영역만 보이게
              pdf.saveGraphicsState()
              pdf.rect(el.x, el.y, el.w, el.h)
              pdf.clip()
              pdf.discardPath()
              pdf.addImage(imgData.base64, imgData.format, el.x + fit.drawX, el.y + fit.drawY, fit.drawW, fit.drawH)
              pdf.restoreGraphicsState()
            } catch (imgErr) {
              console.warn('이미지 삽입 실패:', imgErr)
              pdf.setFillColor(230, 230, 230)
              pdf.rect(el.x, el.y, el.w, el.h, 'F')
              pdf.setFontSize(8)
              pdf.setTextColor(150, 150, 150)
              pdf.setFont(fontName, 'normal')
              pdf.text('Image', el.x + el.w / 2, el.y + el.h / 2, { align: 'center' })
            }
          }
        }
      }

      pdf.save(`${title || 'Portfolio'}_${new Date().toISOString().slice(0, 10)}.pdf`)
    } catch (err) {
      console.error('PDF 생성 실패:', err)
      alert('PDF 생성에 실패했습니다: ' + err.message)
    }
    setGenerating(false)
  }

  // ── 렌더: 셋업 화면 ──
  // 모바일에서는 간소화 안내
  if (isMobile) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-20 h-20 rounded-[24px] bg-[#828DF8]/10 flex items-center justify-center mb-4">
          <svg className="w-10 h-10 text-[#828DF8]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        </div>
        <h2 className="text-xl font-black tracking-tighter text-gray-900 mb-2">데스크탑에서 이용해주세요</h2>
        <p className="text-sm text-gray-400 text-center max-w-xs">
          포트폴리오 빌더는 캔버스 에디터를 사용하기 때문에 데스크탑 환경에서 최적의 경험을 제공합니다.
        </p>
      </div>
    )
  }

  if (step === 'setup') {
    return (
      <div className="space-y-6">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[11px] tracking-[0.2em] uppercase text-gray-400 font-semibold">PORTFOLIO BUILDER</p>
            <h1 className="text-3xl font-black tracking-tighter text-gray-900">포트폴리오 빌더</h1>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* 왼쪽: 템플릿 + 방향 */}
          <div className="col-span-2 space-y-4">
            <div className="bg-white rounded-[24px] p-6 shadow-sm">
              <p className="text-[10px] tracking-[0.2em] uppercase text-gray-400 font-semibold mb-1">SELECT TEMPLATE</p>
              <h2 className="text-lg font-black tracking-tighter text-gray-900 mb-4">템플릿 선택</h2>
              <div className="grid grid-cols-2 gap-4">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTemplate(t.id)}
                    className={`rounded-[20px] p-1 transition-all text-left ${selectedTemplate === t.id ? 'ring-3 ring-[#828DF8] ring-offset-2 shadow-lg' : 'hover:shadow-md'}`}
                  >
                    <div className={`h-36 rounded-[16px] bg-gradient-to-br ${t.preview} flex items-center justify-center`}>
                      <div className={`${orientation === 'landscape' ? 'w-28 h-20' : 'w-20 h-28'} bg-white/80 rounded-[6px] shadow-sm p-2 space-y-1 transition-all`}>
                        <div className="h-1 bg-gray-300 rounded w-8" />
                        <div className="h-8 bg-gray-200 rounded" />
                        <div className="h-1 bg-gray-300 rounded w-12" />
                      </div>
                    </div>
                    <div className="px-2 py-2">
                      <p className="text-[10px] tracking-[0.15em] uppercase text-gray-400 font-semibold">{t.en}</p>
                      <p className="text-sm font-bold text-gray-900 tracking-tight">{t.name}</p>
                      <p className="text-xs text-gray-400">{t.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 레이아웃 프리셋 */}
            <div className="bg-white rounded-[24px] p-6 shadow-sm">
              <p className="text-[10px] tracking-[0.2em] uppercase text-gray-400 font-semibold mb-1">PAGE LAYOUT</p>
              <h2 className="text-lg font-black tracking-tighter text-gray-900 mb-4">이미지 레이아웃</h2>
              <div className="flex gap-2">
                {LAYOUTS.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => setSelectedLayout(l.id)}
                    className={`flex-1 py-3 rounded-[14px] border-2 transition-all flex flex-col items-center gap-1.5
                      ${selectedLayout === l.id ? 'border-[#828DF8] bg-[#828DF8]/5' : 'border-gray-200 hover:border-gray-300'}`}
                  >
                    <LayoutIcon layoutId={l.id} active={selectedLayout === l.id} />
                    <span className="text-[10px] font-bold text-gray-700">{l.name}</span>
                    <span className="text-[9px] text-gray-400 leading-tight">{l.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 방향 + 브랜딩 */}
            <div className="bg-white rounded-[24px] p-6 shadow-sm">
              <div className="grid grid-cols-2 gap-6">
                {/* 방향 */}
                <div>
                  <p className="text-[10px] tracking-[0.2em] uppercase text-gray-400 font-semibold mb-3">ORIENTATION</p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setOrientation('portrait')}
                      className={`flex-1 py-4 rounded-[16px] border-2 transition-all flex flex-col items-center gap-2
                        ${orientation === 'portrait' ? 'border-[#828DF8] bg-[#828DF8]/5' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                      <div className={`w-8 h-11 rounded-[4px] border-2 ${orientation === 'portrait' ? 'border-[#828DF8]' : 'border-gray-300'}`} />
                      <span className="text-xs font-bold text-gray-700">세로 (A4)</span>
                    </button>
                    <button
                      onClick={() => setOrientation('landscape')}
                      className={`flex-1 py-4 rounded-[16px] border-2 transition-all flex flex-col items-center gap-2
                        ${orientation === 'landscape' ? 'border-[#828DF8] bg-[#828DF8]/5' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                      <div className={`w-11 h-8 rounded-[4px] border-2 ${orientation === 'landscape' ? 'border-[#828DF8]' : 'border-gray-300'}`} />
                      <span className="text-xs font-bold text-gray-700">가로</span>
                    </button>
                  </div>
                </div>

                {/* 브랜딩 */}
                <div className="space-y-3">
                  <p className="text-[10px] tracking-[0.2em] uppercase text-gray-400 font-semibold">BRANDING</p>
                  <input className="w-full px-4 py-2.5 bg-[#F4F3EE] rounded-[12px] text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#828DF8]/30"
                    value={title} onChange={(e) => setTitle(e.target.value)} placeholder="포트폴리오 제목" />
                  <input className="w-full px-4 py-2.5 bg-[#F4F3EE] rounded-[12px] text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#828DF8]/30"
                    value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="직군 또는 소개" />
                  <input className="w-full px-4 py-2.5 bg-[#F4F3EE] rounded-[12px] text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#828DF8]/30"
                    value={contact} onChange={(e) => setContact(e.target.value)} placeholder="이메일 또는 연락처" />
                </div>
              </div>
            </div>
          </div>

          {/* 오른쪽: 프로젝트 선택 */}
          <div className="space-y-4">
            <div className="bg-white rounded-[24px] p-6 shadow-sm">
              <p className="text-[10px] tracking-[0.2em] uppercase text-gray-400 font-semibold mb-1">SELECT PROJECTS</p>
              <h2 className="text-lg font-black tracking-tighter text-gray-900 mb-4">포함할 프로젝트</h2>
              {projects.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">프로젝트를 먼저 생성해주세요</p>
              ) : (
                <div className="space-y-2 max-h-[360px] overflow-y-auto">
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => toggleProject(p.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-[12px] transition-all text-left
                        ${selectedProjectIds.includes(p.id) ? 'bg-[#828DF8]/10 ring-1 ring-[#828DF8]/30' : 'bg-[#F4F3EE] hover:bg-gray-200'}`}
                    >
                      <div className={`w-5 h-5 rounded-[6px] flex items-center justify-center flex-shrink-0 transition-all
                        ${selectedProjectIds.includes(p.id) ? 'bg-[#828DF8] text-white' : 'bg-white border border-gray-300'}`}>
                        {selectedProjectIds.includes(p.id) && <span className="text-xs">✓</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-gray-900 truncate">{p.name}</p>
                        <p className="text-[10px] text-gray-400">{p.client || '클라이언트 미지정'} · {p.imageCount || 0}장</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-[24px] p-5 shadow-sm">
              <div className="flex justify-between text-xs mb-3">
                <span className="text-gray-400">선택된 프로젝트</span>
                <span className="font-bold text-gray-900">{selectedProjectIds.length}개</span>
              </div>
              <div className="flex justify-between text-xs mb-3">
                <span className="text-gray-400">방향</span>
                <span className="font-bold text-gray-900">{orientation === 'portrait' ? 'A4 세로' : 'A4 가로'}</span>
              </div>
              <div className="flex justify-between text-xs mb-4">
                <span className="text-gray-400">레이아웃</span>
                <span className="font-bold text-gray-900">{LAYOUTS.find(l => l.id === selectedLayout)?.name}</span>
              </div>
              <button
                onClick={enterEditor}
                disabled={selectedProjectIds.length === 0}
                className="w-full py-3.5 bg-[#828DF8] text-white rounded-[14px] font-bold text-sm shadow-lg shadow-[#828DF8]/25 hover:bg-[#6366F1] transition-all disabled:opacity-50"
              >
                에디터 열기
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── 렌더: 에디터 ──
  return (
    <div className="flex flex-col h-[calc(100vh-40px)]">
      {/* 상단 툴바 */}
      <div className="flex items-center justify-between bg-white rounded-[16px] px-4 py-2.5 shadow-sm mb-3">
        <div className="flex items-center gap-3">
          <button onClick={() => setStep('setup')} className="text-xs text-gray-400 hover:text-gray-600 font-bold">
            ← 설정으로
          </button>
          <div className="w-px h-5 bg-gray-200" />
          <p className="text-[10px] tracking-[0.2em] uppercase text-gray-400 font-semibold">
            PORTFOLIO EDITOR — {pages.length}페이지
          </p>
        </div>

        {/* 도구 버튼들 */}
        <div className="flex items-center gap-1.5">
          <button onClick={addText}
            className="px-3 py-1.5 bg-[#F4F3EE] rounded-[10px] text-xs font-bold text-gray-600 hover:bg-gray-200 transition-all"
            title="텍스트 추가">
            T 텍스트
          </button>
          <button onClick={() => addShape('rect')}
            className="px-3 py-1.5 bg-[#F4F3EE] rounded-[10px] text-xs font-bold text-gray-600 hover:bg-gray-200 transition-all"
            title="사각형 추가">
            ▢ 사각형
          </button>
          <button onClick={() => addShape('circle')}
            className="px-3 py-1.5 bg-[#F4F3EE] rounded-[10px] text-xs font-bold text-gray-600 hover:bg-gray-200 transition-all"
            title="원 추가">
            ○ 원
          </button>
          <div className="w-px h-5 bg-gray-200 mx-1" />
          <button onClick={addPage}
            className="px-3 py-1.5 bg-[#F4F3EE] rounded-[10px] text-xs font-bold text-gray-600 hover:bg-gray-200 transition-all">
            + 페이지
          </button>
          {pages.length > 1 && (
            <button onClick={deletePage}
              className="px-3 py-1.5 bg-red-50 rounded-[10px] text-xs font-bold text-red-400 hover:bg-red-100 transition-all">
              페이지 삭제
            </button>
          )}
          <div className="w-px h-5 bg-gray-200 mx-1" />

          {/* 배경색 */}
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-gray-400 font-semibold">BG</span>
            <input
              type="color"
              value={currentPage?.bg || '#ffffff'}
              onChange={(e) => setPages(prev => prev.map((p, i) => i === currentPageIdx ? { ...p, bg: e.target.value } : p))}
              className="w-6 h-6 rounded-[6px] cursor-pointer border border-gray-200 p-0"
            />
          </div>

          <div className="w-px h-5 bg-gray-200 mx-1" />

          {/* 확대/축소 */}
          <div className="flex items-center gap-1">
            <button onClick={() => setZoom(z => Math.max(30, z - 15))}
              className="w-7 h-7 rounded-[8px] bg-[#F4F3EE] text-gray-600 text-xs font-bold hover:bg-gray-200 transition-all flex items-center justify-center">
              −
            </button>
            <button onClick={() => setZoom(100)}
              className="px-2 py-1 rounded-[8px] text-[10px] font-bold text-gray-600 hover:bg-[#F4F3EE] transition-all min-w-[40px] text-center">
              {zoom}%
            </button>
            <button onClick={() => setZoom(z => Math.min(200, z + 15))}
              className="w-7 h-7 rounded-[8px] bg-[#F4F3EE] text-gray-600 text-xs font-bold hover:bg-gray-200 transition-all flex items-center justify-center">
              +
            </button>
          </div>

          <div className="w-px h-5 bg-gray-200 mx-1" />

          <button
            onClick={handleDownload}
            disabled={generating}
            className="px-4 py-1.5 bg-[#828DF8] text-white rounded-[10px] text-xs font-bold shadow-md shadow-[#828DF8]/25 hover:bg-[#6366F1] transition-all disabled:opacity-50"
          >
            {generating ? '생성 중...' : 'PDF 다운로드'}
          </button>
        </div>
      </div>

      <div className="flex flex-1 gap-3 min-h-0">
        {/* 왼쪽: 페이지 네비게이터 */}
        {showLeftPanel && (
          <div className="w-[140px] flex-shrink-0 bg-white rounded-[16px] p-3 shadow-sm overflow-y-auto">
            <p className="text-[9px] tracking-[0.15em] uppercase text-gray-400 font-semibold mb-2">PAGES</p>
            <div className="space-y-2">
              {pages.map((page, idx) => (
                <button
                  key={page.id}
                  onClick={() => { setCurrentPageIdx(idx); setSelectedElId(null); setEditingTextId(null) }}
                  className={`w-full rounded-[10px] overflow-hidden transition-all border-2
                    ${idx === currentPageIdx ? 'border-[#828DF8] shadow-md' : 'border-transparent hover:border-gray-200'}`}
                >
                  {/* 미니 프리뷰 */}
                  <div
                    className="w-full relative"
                    style={{
                      aspectRatio: `${pw}/${ph}`,
                      background: page.bg || '#fff',
                    }}
                  >
                    {page.elements.map(el => (
                      <div
                        key={el.id}
                        className="absolute overflow-hidden"
                        style={{
                          left: `${(el.x / pw) * 100}%`,
                          top: `${(el.y / ph) * 100}%`,
                          width: `${(el.w / pw) * 100}%`,
                          height: `${(el.h / ph) * 100}%`,
                        }}
                      >
                        {el.type === 'image' && (
                          <img src={el.url} alt="" className="w-full h-full object-cover" />
                        )}
                        {el.type === 'shape' && (
                          <div className="w-full h-full" style={{
                            background: el.color,
                            opacity: el.opacity ?? 0.2,
                            borderRadius: el.shape === 'circle' ? '50%' : 0,
                          }} />
                        )}
                        {el.type === 'text' && (
                          <div style={{ fontSize: '2px', color: el.color, fontWeight: el.fontWeight }}>
                            {el.text}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="text-[9px] text-gray-400 text-center py-1">
                    {idx === 0 ? '표지' : page.projectName || `${idx + 1}`}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 중앙: 캔버스 */}
        <div className="flex-1 flex items-start justify-center overflow-auto bg-[#E8E7E3] rounded-[16px] p-6">
          <div className="relative" style={{ minWidth: canvasW, minHeight: canvasH }}>
            {/* 캔버스 배경 그림자 */}
            <div className="absolute inset-0 shadow-2xl rounded-[4px]" style={{ background: currentPage?.bg || '#fff' }} />

            {/* 메인 캔버스 */}
            <div
              ref={canvasRef}
              className="relative select-none"
              style={{ width: canvasW, height: canvasH, background: currentPage?.bg || '#fff', cursor: dragState ? 'grabbing' : 'default' }}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseUp}
              onDoubleClick={handleDoubleClick}
            >
              {currentPage?.elements.map((el) => {
                const isSelected = el.id === selectedElId
                const isEditing = el.id === editingTextId
                const style = {
                  position: 'absolute',
                  left: el.x * effectiveScale,
                  top: el.y * effectiveScale,
                  width: el.w * effectiveScale,
                  height: el.h * effectiveScale,
                }

                if (el.type === 'image') {
                  return (
                    <div key={el.id} style={style} className={`${isSelected ? 'ring-2 ring-[#828DF8]' : ''}`}>
                      <img src={el.url} alt="" className="w-full h-full object-cover" draggable={false} />
                      {isSelected && (
                        <>
                          <div className="absolute -top-6 left-0 bg-[#828DF8] text-white text-[10px] px-2 py-0.5 rounded font-bold whitespace-nowrap">
                            이미지 — {Math.round(el.w)}×{Math.round(el.h)}mm
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteElement(el.id) }}
                            className="absolute -top-6 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center hover:bg-red-600"
                          >×</button>
                          <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#828DF8] cursor-se-resize rounded-tl-[2px]" />
                        </>
                      )}
                    </div>
                  )
                }

                if (el.type === 'text') {
                  return (
                    <div key={el.id} style={style} className={`${isSelected ? 'ring-2 ring-[#828DF8] ring-offset-1' : ''}`}>
                      {isEditing ? (
                        <textarea
                          autoFocus
                          value={el.text}
                          onChange={(e) => updateElement(el.id, { text: e.target.value })}
                          onBlur={() => setEditingTextId(null)}
                          onKeyDown={(e) => { if (e.key === 'Escape') setEditingTextId(null) }}
                          className="w-full h-full bg-transparent outline-none resize-none p-0"
                          style={{
                            fontSize: el.fontSize * effectiveScale * 0.75,
                            fontWeight: el.fontWeight,
                            color: el.color,
                            textAlign: el.align,
                            lineHeight: 1.3,
                          }}
                        />
                      ) : (
                        <div
                          className="w-full h-full overflow-visible whitespace-pre-wrap"
                          style={{
                            fontSize: el.fontSize * effectiveScale * 0.75,
                            fontWeight: el.fontWeight,
                            color: el.color,
                            textAlign: el.align,
                            lineHeight: 1.3,
                          }}
                        >
                          {el.text}
                        </div>
                      )}
                      {isSelected && !isEditing && (
                        <>
                          <div className="absolute -top-6 left-0 bg-[#828DF8] text-white text-[10px] px-2 py-0.5 rounded font-bold whitespace-nowrap">
                            텍스트 — {el.fontSize}pt
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteElement(el.id) }}
                            className="absolute -top-6 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center hover:bg-red-600"
                          >×</button>
                          <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#828DF8] cursor-se-resize rounded-tl-[2px]" />
                        </>
                      )}
                    </div>
                  )
                }

                if (el.type === 'shape') {
                  return (
                    <div key={el.id} style={style} className={`${isSelected ? 'ring-2 ring-[#828DF8]' : ''}`}>
                      <div
                        className="w-full h-full"
                        style={{
                          background: el.color,
                          opacity: el.opacity ?? 0.2,
                          borderRadius: el.shape === 'circle' ? '50%' : 0,
                        }}
                      />
                      {isSelected && (
                        <>
                          <div className="absolute -top-6 left-0 bg-[#828DF8] text-white text-[10px] px-2 py-0.5 rounded font-bold whitespace-nowrap">
                            {el.shape === 'circle' ? '원' : '사각형'}
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteElement(el.id) }}
                            className="absolute -top-6 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center hover:bg-red-600"
                          >×</button>
                          <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#828DF8] cursor-se-resize rounded-tl-[2px]" />
                        </>
                      )}
                    </div>
                  )
                }

                return null
              })}
            </div>
          </div>
        </div>

        {/* 오른쪽: 속성 패널 */}
        <div className="w-[220px] flex-shrink-0 bg-white rounded-[16px] p-4 shadow-sm overflow-y-auto">
          {selectedEl ? (
            <div className="space-y-4">
              <div>
                <p className="text-[9px] tracking-[0.15em] uppercase text-gray-400 font-semibold mb-2">
                  {selectedEl.type === 'text' ? 'TEXT' : selectedEl.type === 'image' ? 'IMAGE' : 'SHAPE'} PROPERTIES
                </p>
              </div>

              {/* 위치 */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] text-gray-400 font-semibold">X (mm)</label>
                  <input type="number" value={Math.round(selectedEl.x)} onChange={(e) => updateElement(selectedEl.id, { x: +e.target.value })}
                    className="w-full px-2 py-1.5 bg-[#F4F3EE] rounded-[8px] text-xs text-gray-900 outline-none" />
                </div>
                <div>
                  <label className="text-[9px] text-gray-400 font-semibold">Y (mm)</label>
                  <input type="number" value={Math.round(selectedEl.y)} onChange={(e) => updateElement(selectedEl.id, { y: +e.target.value })}
                    className="w-full px-2 py-1.5 bg-[#F4F3EE] rounded-[8px] text-xs text-gray-900 outline-none" />
                </div>
                <div>
                  <label className="text-[9px] text-gray-400 font-semibold">W (mm)</label>
                  <input type="number" value={Math.round(selectedEl.w)} onChange={(e) => updateElement(selectedEl.id, { w: Math.max(5, +e.target.value) })}
                    className="w-full px-2 py-1.5 bg-[#F4F3EE] rounded-[8px] text-xs text-gray-900 outline-none" />
                </div>
                <div>
                  <label className="text-[9px] text-gray-400 font-semibold">H (mm)</label>
                  <input type="number" value={Math.round(selectedEl.h)} onChange={(e) => updateElement(selectedEl.id, { h: Math.max(5, +e.target.value) })}
                    className="w-full px-2 py-1.5 bg-[#F4F3EE] rounded-[8px] text-xs text-gray-900 outline-none" />
                </div>
              </div>

              {/* 텍스트 속성 */}
              {selectedEl.type === 'text' && (
                <>
                  <div>
                    <label className="text-[9px] text-gray-400 font-semibold">FONT SIZE</label>
                    <input type="number" value={selectedEl.fontSize} onChange={(e) => updateElement(selectedEl.id, { fontSize: Math.max(4, +e.target.value) })}
                      className="w-full px-2 py-1.5 bg-[#F4F3EE] rounded-[8px] text-xs text-gray-900 outline-none mt-1" />
                  </div>
                  <div>
                    <label className="text-[9px] text-gray-400 font-semibold">WEIGHT</label>
                    <div className="flex gap-1 mt-1">
                      {['normal', 'bold'].map(w => (
                        <button key={w} onClick={() => updateElement(selectedEl.id, { fontWeight: w })}
                          className={`flex-1 py-1.5 rounded-[8px] text-xs font-bold transition-all
                            ${selectedEl.fontWeight === w ? 'bg-[#828DF8] text-white' : 'bg-[#F4F3EE] text-gray-500'}`}>
                          {w === 'bold' ? 'B' : 'R'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] text-gray-400 font-semibold">ALIGN</label>
                    <div className="flex gap-1 mt-1">
                      {['left', 'center', 'right'].map(a => (
                        <button key={a} onClick={() => updateElement(selectedEl.id, { align: a })}
                          className={`flex-1 py-1.5 rounded-[8px] text-xs font-bold transition-all
                            ${selectedEl.align === a ? 'bg-[#828DF8] text-white' : 'bg-[#F4F3EE] text-gray-500'}`}>
                          {a === 'left' ? '←' : a === 'center' ? '↔' : '→'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] text-gray-400 font-semibold">COLOR</label>
                    <input type="color" value={selectedEl.color} onChange={(e) => updateElement(selectedEl.id, { color: e.target.value })}
                      className="w-full h-8 rounded-[8px] mt-1 cursor-pointer border-0" />
                  </div>
                </>
              )}

              {/* 도형 속성 */}
              {selectedEl.type === 'shape' && (
                <>
                  <div>
                    <label className="text-[9px] text-gray-400 font-semibold">COLOR</label>
                    <input type="color" value={selectedEl.color} onChange={(e) => updateElement(selectedEl.id, { color: e.target.value })}
                      className="w-full h-8 rounded-[8px] mt-1 cursor-pointer border-0" />
                  </div>
                  <div>
                    <label className="text-[9px] text-gray-400 font-semibold">OPACITY</label>
                    <input type="range" min="0" max="1" step="0.05" value={selectedEl.opacity ?? 0.2}
                      onChange={(e) => updateElement(selectedEl.id, { opacity: +e.target.value })}
                      className="w-full mt-1" />
                    <p className="text-[10px] text-gray-400 text-right">{Math.round((selectedEl.opacity ?? 0.2) * 100)}%</p>
                  </div>
                </>
              )}

              {/* 삭제 버튼 */}
              <button
                onClick={() => deleteElement(selectedEl.id)}
                className="w-full py-2.5 bg-red-50 text-red-500 rounded-[12px] text-xs font-bold hover:bg-red-100 transition-all mt-2"
              >
                요소 삭제
              </button>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-[10px] tracking-[0.15em] uppercase text-gray-400 font-semibold mb-2">PROPERTIES</p>
              <p className="text-xs text-gray-400">요소를 클릭하여 선택하세요</p>
              <p className="text-[10px] text-gray-300 mt-2">더블클릭으로 텍스트 편집</p>
              <p className="text-[10px] text-gray-300">Delete 키로 삭제</p>

              {/* 페이지 배경색 */}
              <div className="mt-6 text-left">
                <label className="text-[9px] text-gray-400 font-semibold">PAGE BACKGROUND</label>
                <input type="color" value={currentPage?.bg || '#ffffff'}
                  onChange={(e) => setPages(prev => prev.map((p, i) => i === currentPageIdx ? { ...p, bg: e.target.value } : p))}
                  className="w-full h-8 rounded-[8px] mt-1 cursor-pointer border-0" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 하단: 페이지 인디케이터 */}
      <div className="flex items-center justify-center gap-2 mt-3">
        <button
          onClick={() => { setCurrentPageIdx(Math.max(0, currentPageIdx - 1)); setSelectedElId(null) }}
          disabled={currentPageIdx === 0}
          className="w-7 h-7 rounded-full bg-white flex items-center justify-center text-gray-400 hover:bg-gray-100 disabled:opacity-30 text-xs shadow-sm"
        >◀</button>
        <span className="text-xs font-bold text-gray-600">
          {currentPageIdx + 1} / {pages.length}
        </span>
        <button
          onClick={() => { setCurrentPageIdx(Math.min(pages.length - 1, currentPageIdx + 1)); setSelectedElId(null) }}
          disabled={currentPageIdx === pages.length - 1}
          className="w-7 h-7 rounded-full bg-white flex items-center justify-center text-gray-400 hover:bg-gray-100 disabled:opacity-30 text-xs shadow-sm"
        >▶</button>
      </div>
    </div>
  )
}
