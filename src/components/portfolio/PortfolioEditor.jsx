import { useState, useEffect, useRef, useCallback } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { useProjects } from '../../hooks/useProjects'
import { usePortfolio } from '../../hooks/usePortfolio'
import PortfolioGrid from './PortfolioGrid'
import PortfolioHeader from './PortfolioHeader'
import PortfolioCategoryFilter from './PortfolioCategoryFilter'
import { PORTFOLIO_TEMPLATES } from './portfolioTemplates'
import PortfolioTemplateRenderer from './PortfolioTemplateRenderer'

const ASPECT_OPTIONS = [
  { label: '3:2', value: 0.667 },
  { label: '1:1', value: 1.0 },
  { label: '4:3', value: 0.75 },
  { label: '3:4', value: 1.333 },
  { label: '16:9', value: 0.5625 },
]

const COLOR_PRESETS = [
  { label: 'Light', bg: '#FFFFFF', text: '#1A1A1A', accent: '#F4A259' },
  { label: 'Dark', bg: '#0A0A0A', text: '#FFFFFF', accent: '#F4A259' },
  { label: 'Warm', bg: '#F4F3EE', text: '#2C2C2C', accent: '#C19A6B' },
  { label: 'Navy', bg: '#0D1B2A', text: '#E0E1DD', accent: '#778DA9' },
  { label: 'Forest', bg: '#1B2721', text: '#E8E4D9', accent: '#7D8F69' },
]

const CATEGORY_LIST = ['FASHION', 'BEAUTY', 'CELEBRITY', 'AD', 'PORTRAIT', 'PERSONAL WORK']

const FONT_LIST = [
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

/* ─── 레인지 슬라이더 ─── */
function RangeSlider({ label, value, min, max, step, unit, onChange }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-[#b3b3b3] w-[5.5rem] flex-shrink-0">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))}
        className="flex-1 h-1 accent-[#F4A259] cursor-pointer" />
      <span className="text-sm text-[#cbcbcb] font-mono w-16 text-right flex-shrink-0">{value}{unit}</span>
    </div>
  )
}

/* 레이아웃 리팩: 겹침/빈칸 제거, 큰 타일 우선 배치 */
function repackLayout(rawLayout, cols) {
  if (!rawLayout || typeof rawLayout !== 'object') return {}
  const entries = Object.entries(rawLayout).filter(([, p]) => p && typeof p === 'object')
  // 큰 타일(colSpan>1) 먼저 배치 → 작은 타일이 빈자리 채움
  const large = entries.filter(([, p]) => (p.colSpan || 1) > 1)
    .sort(([, a], [, b]) => ((a?.row ?? 0) - (b?.row ?? 0)) || ((a?.col ?? 0) - (b?.col ?? 0)))
  const small = entries.filter(([, p]) => (p.colSpan || 1) <= 1)
    .sort(([, a], [, b]) => ((a?.row ?? 0) - (b?.row ?? 0)) || ((a?.col ?? 0) - (b?.col ?? 0)))
  const repacked = {}
  const occupied = new Set()
  for (const [pid, pos] of [...large, ...small]) {
    const colSpan = Math.min(cols, pos.colSpan || 1)
    const rowSpan = pos.rowSpan || 2
    const origRow = pos.row ?? 0
    const origCol = Math.min(pos.col ?? 0, cols - colSpan)
    let ok = true
    for (let dr = 0; dr < rowSpan && ok; dr++)
      for (let dc = 0; dc < colSpan && ok; dc++)
        if (occupied.has(`${origRow + dr}-${origCol + dc}`)) ok = false
    if (ok) {
      repacked[pid] = { row: origRow, col: origCol, colSpan, rowSpan }
      for (let dr = 0; dr < rowSpan; dr++)
        for (let dc = 0; dc < colSpan; dc++)
          occupied.add(`${origRow + dr}-${origCol + dc}`)
      continue
    }
    for (let r = 0; ; r++) {
      let placed = false
      for (let c = 0; c <= cols - colSpan; c++) {
        ok = true
        for (let dr = 0; dr < rowSpan && ok; dr++)
          for (let dc = 0; dc < colSpan && ok; dc++)
            if (occupied.has(`${r + dr}-${c + dc}`)) ok = false
        if (ok) {
          repacked[pid] = { row: r, col: c, colSpan, rowSpan }
          for (let dr = 0; dr < rowSpan; dr++)
            for (let dc = 0; dc < colSpan; dc++)
              occupied.add(`${r + dr}-${c + dc}`)
          placed = true
          break
        }
      }
      if (placed) break
    }
  }
  return repacked
}

export default function PortfolioEditor({ isMobile }) {
  const { user, userDoc } = useAuth()
  const { projects } = useProjects()
  const { portfolio, loading, savePortfolio, deployPortfolio, checkSlugAvailable } = usePortfolio()
  const [deploying, setDeploying] = useState(false)

  const [slug, setSlug] = useState('')
  const [slugStatus, setSlugStatus] = useState(null)
  const [columns, setColumns] = useState(3)
  const [bgColor, setBgColor] = useState('#FFFFFF')
  const [textColor, setTextColor] = useState('#1A1A1A')
  const [accentColor, setAccentColor] = useState('#F4A259')
  const [rowAspectRatio, setRowAspectRatio] = useState(0.667)
  const [businessName, setBusinessName] = useState('')
  const [tagline, setTagline] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [showInstagram, setShowInstagram] = useState(true)
  const [showWebsite, setShowWebsite] = useState(true)
  const [projectOrder, setProjectOrder] = useState([])
  const [featuredProjects, setFeaturedProjects] = useState([])
  // 카테고리별 레이아웃: { _all: { [pid]: {row,col,...} }, FASHION: {...}, ... }
  const [projectLayout, setProjectLayout] = useState({})
  const [enabledCategories, setEnabledCategories] = useState([])
  // 상세 조정
  const [photoGap, setPhotoGap] = useState(8)
  const [fontSize, setFontSize] = useState(100)
  const [pagePadding, setPagePadding] = useState(48)
  const [borderRadius, setBorderRadius] = useState(12)
  const [fontFamily, setFontFamily] = useState('pretendard')
  const [template, setTemplate] = useState('default')
  // 템플릿별 전체 설정 캐시: { default: { layout, columns, photoGap, ... }, bentobox: {...}, ... }
  const templateCacheRef = useRef({})
  // 섹션 열기/닫기 (기본: 슬러그+프로젝트 열림)
  const [openSections, setOpenSections] = useState({ slug: true, projects: true, available: true })
  // 데스크탑: 상단 리본 탭 (null = 닫힘, 'template' | 'color' | 'layout' | 'header' | 'advanced' | 'projects' | 'categories')
  const [ribbonTab, setRibbonTab] = useState(null)

  const [saving, setSaving] = useState(false)
  const [autoSaved, setAutoSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [previewCategory, setPreviewCategory] = useState(null)
  const [sidebarNumber, setSidebarNumber] = useState('01')
  const [previewZoom, setPreviewZoom] = useState(100)
  const previewScrollRef = useRef(null)

  // 드래그 중 자동 스크롤: 컨테이너 상/하 가장자리 80px에서 자동 스크롤
  const handlePreviewDragOver = useCallback((e) => {
    const container = previewScrollRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const y = e.clientY - rect.top
    const edge = 80
    if (y < edge) {
      container.scrollTop -= Math.max(2, (edge - y) * 0.3)
    } else if (y > rect.height - edge) {
      container.scrollTop += Math.max(2, (y - (rect.height - edge)) * 0.3)
    }
  }, [])
  const layoutKey = previewCategory || '_all'
  const currentLayout = projectLayout[layoutKey] || {}
  const [projectAssets, setProjectAssets] = useState({})
  const autoSaveTimer = useRef(null)
  const initialLoad = useRef(true)

  useEffect(() => {
    if (!portfolio) return
    // draft가 있으면 draft 데이터 우선 사용 (편집 중인 내용 유지)
    const src = portfolio.draft || portfolio
    setSlug(src.slug || portfolio.slug || '')
    setColumns(src.columns || 3)
    setBgColor(src.backgroundColor || '#FFFFFF')
    setTextColor(src.textColor || '#1A1A1A')
    setAccentColor(src.accentColor || '#F4A259')
    setRowAspectRatio(src.rowAspectRatio || 0.667)
    setBusinessName(src.businessName || userDoc?.displayName || '')
    setTagline(src.tagline || userDoc?.profession || '')
    setContactEmail(src.contactEmail || userDoc?.email || user?.email || '')
    setContactPhone(src.contactPhone || userDoc?.phone || '')
    setShowInstagram(src.showInstagram !== false)
    setShowWebsite(src.showWebsite !== false)
    setProjectOrder(src.projectOrder || portfolio.projectOrder || [])
    setFeaturedProjects(src.featuredProjects || portfolio.featuredProjects || [])
    // 마이그레이션: flat 구조면 _all로 wrap
    const rawLayout = src.projectLayout || portfolio.projectLayout || {}
    const isLegacy = Object.values(rawLayout).some(v => v && typeof v === 'object' && 'row' in v)
    const parsedLayout = isLegacy ? { _all: rawLayout } : rawLayout
    // 데이터 정리: undefined 값 제거 + featured 아닌데 colSpan=2인 항목 복원
    const feat = src.featuredProjects || portfolio.featuredProjects || []
    const cols = src.columns || 3
    const ar = src.rowAspectRatio || 0.667
    const defaultRS = Math.max(1, Math.ceil(1 / ar - 0.1))
    for (const key of Object.keys(parsedLayout)) {
      const section = parsedLayout[key]
      if (section && typeof section === 'object') {
        for (const pid of Object.keys(section)) {
          const entry = section[pid]
          if (!entry || typeof entry !== 'object') { delete section[pid]; continue }
          // undefined 값 제거
          if (entry.row === undefined || entry.row === null) entry.row = 0
          if (entry.col === undefined || entry.col === null) entry.col = 0
          if (entry.rowSpan === undefined || entry.rowSpan === null) entry.rowSpan = defaultRS
          if (entry.colSpan === undefined || entry.colSpan === null) entry.colSpan = 1
        }
        // 겹침/빈칸 제거
        parsedLayout[key] = repackLayout(section, cols)
      }
    }
    setProjectLayout(parsedLayout)
    // 템플릿별 설정 캐시 초기화
    const savedCache = src.templateCache || portfolio.templateCache || {}
    const curTpl = src.template || portfolio.template || 'default'
    templateCacheRef.current = {
      ...savedCache,
      [curTpl]: {
        projectLayout: parsedLayout,
        columns: cols,
        photoGap: src.photoGap ?? portfolio.photoGap ?? 8,
        fontSize: src.fontSize ?? portfolio.fontSize ?? 100,
        pagePadding: src.pagePadding ?? portfolio.pagePadding ?? 48,
        borderRadius: src.borderRadius ?? portfolio.borderRadius ?? 12,
        fontFamily: src.fontFamily || portfolio.fontFamily || 'pretendard',
        rowAspectRatio: src.rowAspectRatio || 0.667,
        bgColor: src.backgroundColor || '#FFFFFF',
        textColor: src.textColor || '#1A1A1A',
        accentColor: src.accentColor || '#F4A259',
        featuredProjects: feat,
      },
    }
    setEnabledCategories(src.enabledCategories || portfolio.enabledCategories || [])
    setPhotoGap(src.photoGap ?? portfolio.photoGap ?? 8)
    setFontSize(src.fontSize ?? portfolio.fontSize ?? 100)
    setPagePadding(src.pagePadding ?? portfolio.pagePadding ?? 48)
    setBorderRadius(src.borderRadius ?? portfolio.borderRadius ?? 12)
    setFontFamily(src.fontFamily || portfolio.fontFamily || 'pretendard')
    setTemplate(curTpl)
    initialLoad.current = true
  }, [portfolio, userDoc, user])

  useEffect(() => {
    if (!user || !projectOrder.length) return
    const unsubs = []
    for (const pid of projectOrder) {
      const q = query(collection(db, 'assets'), where('projectId', '==', pid))
      const unsub = onSnapshot(q, snap => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        data.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
        setProjectAssets(prev => ({ ...prev, [pid]: data }))
      })
      unsubs.push(unsub)
    }
    return () => unsubs.forEach(u => u())
  }, [user, projectOrder])

  useEffect(() => {
    if (!slug || slug.length < 2) { setSlugStatus(null); return }
    const timer = setTimeout(async () => {
      setSlugStatus('checking')
      const available = await checkSlugAvailable(slug)
      setSlugStatus(available ? 'ok' : 'taken')
    }, 500)
    return () => clearTimeout(timer)
  }, [slug, checkSlugAvailable])

  const getPayload = useCallback(() => {
    // Firestore 저장 전 projectLayout에서 undefined 값 제거
    const cleanLayout = {}
    for (const [key, section] of Object.entries(projectLayout)) {
      if (!section || typeof section !== 'object') continue
      cleanLayout[key] = {}
      for (const [pid, entry] of Object.entries(section)) {
        if (!entry || typeof entry !== 'object') continue
        cleanLayout[key][pid] = {
          row: entry.row ?? 0,
          col: entry.col ?? 0,
          colSpan: entry.colSpan ?? 1,
          rowSpan: entry.rowSpan ?? 2,
        }
      }
    }
    // 현재 템플릿 설정을 캐시에 동기화
    const currentCache = {
      projectLayout, columns, photoGap, fontSize, pagePadding, borderRadius,
      fontFamily, rowAspectRatio, bgColor, textColor, accentColor, featuredProjects,
    }
    const allCache = { ...templateCacheRef.current, [template]: currentCache }
    // 캐시에서 projectLayout만 clean 처리
    const cleanCache = {}
    for (const [tplId, cache] of Object.entries(allCache)) {
      if (!cache || typeof cache !== 'object') continue
      const cl = {}
      if (cache.projectLayout) {
        for (const [key, section] of Object.entries(cache.projectLayout)) {
          if (!section || typeof section !== 'object') continue
          cl[key] = {}
          for (const [pid, entry] of Object.entries(section)) {
            if (!entry || typeof entry !== 'object') continue
            cl[key][pid] = { row: entry.row ?? 0, col: entry.col ?? 0, colSpan: entry.colSpan ?? 1, rowSpan: entry.rowSpan ?? 2 }
          }
        }
      }
      cleanCache[tplId] = { ...cache, projectLayout: cl }
    }
    return {
      slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-'),
      columns, backgroundColor: bgColor, textColor, accentColor, rowAspectRatio,
      businessName, tagline, contactEmail, contactPhone, showInstagram, showWebsite,
      projectOrder, featuredProjects, projectLayout: cleanLayout, enabledCategories,
      photoGap, fontSize, pagePadding, borderRadius, fontFamily, template,
      templateCache: cleanCache,
    }
  }, [slug, columns, bgColor, textColor, accentColor, rowAspectRatio, businessName, tagline, contactEmail, contactPhone, showInstagram, showWebsite, projectOrder, featuredProjects, projectLayout, enabledCategories, photoGap, fontSize, pagePadding, borderRadius, fontFamily, template])

  // 임시저장 (3초 디바운스)
  useEffect(() => {
    if (initialLoad.current) { initialLoad.current = false; return }
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(async () => {
      try {
        await savePortfolio(getPayload())
        setAutoSaved(true)
        setTimeout(() => setAutoSaved(false), 2000)
      } catch (err) {
        console.error('[AutoSave Failed]', err)
        alert('자동 저장 실패: ' + err.message)
      }
    }, 3000)
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current) }
  }, [slug, columns, bgColor, textColor, accentColor, rowAspectRatio, businessName, tagline, contactEmail, contactPhone, showInstagram, showWebsite, projectOrder, featuredProjects, projectLayout, enabledCategories, photoGap, fontSize, pagePadding, borderRadius, fontFamily, template, getPayload, savePortfolio])

  const handleSave = async () => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    setSaving(true)
    try {
      await savePortfolio(getPayload())
    } catch (err) {
      console.error('[Save Failed]', err)
      alert('저장 실패: ' + err.message)
    }
    setSaving(false)
  }

  const handleDeploy = async () => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    setDeploying(true)
    try {
      // 먼저 최신 draft 저장
      await savePortfolio(getPayload())
      // draft → 공개 사이트 반영
      await deployPortfolio()
      alert('배포 완료! 공개 사이트에 반영되었습니다.')
    } catch (err) {
      console.error('[Deploy Failed]', err)
      alert('배포 실패: ' + err.message)
    }
    setDeploying(false)
  }



  const toggleProject = (pid) => {
    if (projectOrder.includes(pid)) {
      // 제거
      setProjectOrder(prev => prev.filter(id => id !== pid))
      setProjectLayout(pl => {
        const next = { ...pl }
        for (const k of Object.keys(next)) {
          if (next[k] && typeof next[k] === 'object' && next[k][pid]) {
            const c = { ...next[k] }; delete c[pid]; next[k] = c
          }
        }
        return next
      })
      return
    }
    // 신규 추가: 1칸(1×1)으로 맨 앞에 — 1×1 타일들만 한 자리씩 밀고, 멀티셀 타일은 그대로
    setProjectOrder(prev => [pid, ...prev])
    setProjectLayout(pl => {
      const cur = pl[layoutKey] || {}
      const singles = []
      const multis = {}
      for (const [id, pos] of Object.entries(cur)) {
        const cs = pos.colSpan || 1, rs = pos.rowSpan || 1
        if (cs === 1 && rs === 1) singles.push({ id, pos })
        else multis[id] = pos
      }
      singles.sort((a, b) => (a.pos.row - b.pos.row) || (a.pos.col - b.pos.col))
      const slots = singles.map(s => ({ row: s.pos.row, col: s.pos.col }))
      const newOrder = [pid, ...singles.map(s => s.id)]

      const result = { ...multis }
      // 기존 1×1 슬롯에 순서대로 채워넣기 (신규가 맨앞 슬롯 차지)
      for (let i = 0; i < Math.min(newOrder.length, slots.length); i++) {
        result[newOrder[i]] = { ...slots[i], colSpan: 1, rowSpan: 1 }
      }
      // 슬롯이 부족한 마지막 타일은 첫 빈 셀에 배치
      if (newOrder.length > slots.length) {
        const last = newOrder[newOrder.length - 1]
        const used = new Set()
        for (const r of Object.values(result)) {
          const cs = r.colSpan || 1, rs = r.rowSpan || 1
          for (let dr = 0; dr < rs; dr++)
            for (let dc = 0; dc < cs; dc++)
              used.add(`${r.row + dr}-${r.col + dc}`)
        }
        let placed = false
        for (let r = 0; !placed; r++) {
          for (let c = 0; c < columns; c++) {
            if (!used.has(`${r}-${c}`)) {
              result[last] = { row: r, col: c, colSpan: 1, rowSpan: 1 }
              placed = true
              break
            }
          }
        }
      }
      return { ...pl, [layoutKey]: result }
    })
  }

  // 주어진 순서대로 레이아웃 재패킹 (각 타일의 기존 크기 유지)
  const packLayoutFromOrder = (order) => {
    const newLayout = {}
    const occupied = new Set()
    for (const pid of order) {
      const existing = currentLayout[pid]
      const colSpan = existing?.colSpan || 1
      const rowSpan = existing?.rowSpan || 2
      let placed = false
      for (let r = 0; !placed; r++) {
        for (let c = 0; c <= columns - colSpan; c++) {
          let ok = true
          for (let dr = 0; dr < rowSpan && ok; dr++)
            for (let dc = 0; dc < colSpan && ok; dc++)
              if (occupied.has(`${r + dr}-${c + dc}`)) ok = false
          if (ok) {
            newLayout[pid] = { row: r, col: c, colSpan, rowSpan }
            for (let dr = 0; dr < rowSpan; dr++)
              for (let dc = 0; dc < colSpan; dc++)
                occupied.add(`${r + dr}-${c + dc}`)
            placed = true
            break
          }
        }
      }
    }
    setProjectLayout(prev => ({ ...prev, [layoutKey]: newLayout }))
  }

  // 좌측 패널 드래그앤드롭으로 순서 변경
  const [dragProjId, setDragProjId] = useState(null)
  const reorderProjectInList = (targetId) => {
    if (!dragProjId || dragProjId === targetId) return
    setProjectOrder(prev => {
      const next = prev.filter(id => id !== dragProjId)
      const idx = next.indexOf(targetId)
      if (idx < 0) return prev
      next.splice(idx, 0, dragProjId)
      packLayoutFromOrder(next)
      return next
    })
    setDragProjId(null)
  }

  // 다음 빈 공간 찾기 (colSpan × rowSpan 크기)
  const findNextEmpty = (layout, cols, colSpan, rowSpan) => {
    const occupied = new Set()
    for (const pos of Object.values(layout)) {
      const cs = pos.colSpan || pos.span || 1
      const rs = pos.rowSpan || 2
      for (let r = 0; r < rs; r++)
        for (let c = 0; c < cs; c++)
          occupied.add(`${pos.row + r}-${pos.col + c}`)
    }
    for (let r = 0; ; r++) {
      for (let c = 0; c <= cols - colSpan; c++) {
        let ok = true
        for (let dr = 0; dr < rowSpan && ok; dr++)
          for (let dc = 0; dc < colSpan && ok; dc++)
            if (occupied.has(`${r + dr}-${c + dc}`)) ok = false
        if (ok) return { row: r, col: c }
      }
    }
  }

  const handleLayoutChange = (newLayout) => {
    const repacked = repackLayout(newLayout, columns)
    setProjectLayout(prev => ({ ...prev, [layoutKey]: repacked }))
    // _all 뷰에서 편집한 순서를 좌측 프로젝트 리스트에도 반영
    if (layoutKey === '_all') {
      const sorted = Object.entries(repacked)
        .sort(([, a], [, b]) => (a.row - b.row) || (a.col - b.col))
        .map(([id]) => id)
      setProjectOrder(prev => {
        const others = prev.filter(id => !sorted.includes(id))
        return [...sorted, ...others]
      })
    }
  }

  // 자동 정렬: ★별표(featured) 큰 타일은 원래 위치 고정, 1칸짜리만 빈자리에 빽빽하게 채움
  const autoAlign = () => {
    const validOrder = projectOrder.filter(pid => projects.some(p => p.id === pid))
    setProjectOrder(validOrder)
    const newLayout = {}
    const occupied = new Set()

    // 1) 별표된 큰 타일(colSpan>1) → 원래 자리 그대로 고정
    const largePids = validOrder.filter(pid => {
      const existing = currentLayout[pid]
      return existing && (existing.colSpan || 1) > 1
    })
    for (const pid of largePids) {
      const existing = currentLayout[pid]
      const colSpan = Math.min(columns, existing.colSpan)
      const rowSpan = existing.rowSpan || 2
      const row = existing.row ?? 0
      const col = Math.min(existing.col ?? 0, columns - colSpan)
      newLayout[pid] = { row, col, colSpan, rowSpan }
      for (let dr = 0; dr < rowSpan; dr++)
        for (let dc = 0; dc < colSpan; dc++)
          occupied.add(`${row + dr}-${col + dc}`)
    }

    // 2) 1칸짜리 작은 타일 → 기존 위치 무시, row 0부터 첫 빈칸에 순서대로 채움
    const smallPids = validOrder.filter(pid => {
      const existing = currentLayout[pid]
      return !existing || (existing.colSpan || 1) <= 1
    })
    for (const pid of smallPids) {
      const existing = currentLayout[pid]
      const colSpan = 1
      const rowSpan = existing?.rowSpan || 2
      let placed = false
      for (let r = 0; !placed; r++) {
        for (let c = 0; c <= columns - colSpan; c++) {
          let ok = true
          for (let dr = 0; dr < rowSpan && ok; dr++)
            for (let dc = 0; dc < colSpan && ok; dc++)
              if (occupied.has(`${r + dr}-${c + dc}`)) ok = false
          if (ok) {
            newLayout[pid] = { row: r, col: c, colSpan, rowSpan }
            for (let dr = 0; dr < rowSpan; dr++)
              for (let dc = 0; dc < colSpan; dc++)
                occupied.add(`${r + dr}-${c + dc}`)
            placed = true
            break
          }
        }
      }
    }
    console.log('[autoAlign] 결과:', Object.entries(newLayout).map(([k,v]) => `${k.slice(0,6)}:r${v.row}c${v.col} ${v.colSpan}x${v.rowSpan}`).join(' '))
    setProjectLayout(prev => ({ ...prev, [layoutKey]: newLayout }))
  }

  // 초기화: 모든 타일을 기본 크기(1×2)로 리셋 + 위에서부터 정렬
  const resetLayout = () => {
    const newLayout = {}
    const occupied = new Set()
    for (const pid of projectOrder) {
      const colSpan = 1, rowSpan = 2
      let placed = false
      for (let r = 0; !placed; r++) {
        for (let c = 0; c <= columns - colSpan; c++) {
          let ok = true
          for (let dr = 0; dr < rowSpan && ok; dr++)
            for (let dc = 0; dc < colSpan && ok; dc++)
              if (occupied.has(`${r + dr}-${c + dc}`)) ok = false
          if (ok) {
            newLayout[pid] = { row: r, col: c, colSpan, rowSpan }
            for (let dr = 0; dr < rowSpan; dr++)
              for (let dc = 0; dc < colSpan; dc++)
                occupied.add(`${r + dr}-${c + dc}`)
            placed = true
            break
          }
        }
      }
    }
    setFeaturedProjects([])
    setProjectLayout(prev => ({ ...prev, [layoutKey]: newLayout }))
  }

  const toggleCategory = (cat) => {
    setEnabledCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat])
  }

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/p/${slug}`)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const applyPreset = (preset) => {
    setBgColor(preset.bg); setTextColor(preset.text); setAccentColor(preset.accent)
  }

  const applyTemplate = (templateId) => {
    const tpl = PORTFOLIO_TEMPLATES.find(t => t.id === templateId)
    if (!tpl) return

    // 1) 현재 템플릿의 모든 설정을 캐시에 저장
    templateCacheRef.current[template] = {
      projectLayout, columns, photoGap, fontSize, pagePadding, borderRadius,
      fontFamily, rowAspectRatio, bgColor, textColor, accentColor, featuredProjects,
    }

    // 2) 새 템플릿의 캐시가 있으면 복원, 없으면 템플릿 기본값 사용
    const cached = templateCacheRef.current[templateId]
    setTemplate(templateId)
    setPreviewCategory(null)   // 템플릿 전환 시 카테고리 필터 초기화 (dimming 방지)

    if (cached) {
      // 캐시 복원 — 이전에 이 템플릿에서 조정했던 설정 그대로
      setBgColor(cached.bgColor)
      setTextColor(cached.textColor)
      setAccentColor(cached.accentColor)
      setColumns(cached.columns)
      setPhotoGap(cached.photoGap)
      setPagePadding(cached.pagePadding)
      setBorderRadius(cached.borderRadius)
      setFontFamily(cached.fontFamily)
      setRowAspectRatio(cached.rowAspectRatio)
      setFontSize(cached.fontSize)
      if (cached.featuredProjects) setFeaturedProjects(cached.featuredProjects)
      setProjectLayout(cached.projectLayout || {})
    } else {
      // 캐시 없음 — 템플릿 기본값으로 초기화
      setBgColor(tpl.defaults.backgroundColor)
      setTextColor(tpl.defaults.textColor)
      setAccentColor(tpl.defaults.accentColor)
      const newCols = tpl.defaults.columns
      setColumns(newCols)
      setPhotoGap(tpl.defaults.photoGap)
      setPagePadding(tpl.defaults.pagePadding)
      setBorderRadius(tpl.defaults.borderRadius)
      setFontFamily(tpl.defaults.fontFamily)
      setRowAspectRatio(tpl.defaults.rowAspectRatio || 0.667)
      setFontSize(tpl.defaults.fontSize || 100)
      // 레이아웃 새로 생성
      const newAll = {}
      const occupied = new Set()
      for (const pid of projectOrder) {
        const colSpan = featuredProjects.includes(pid) ? Math.min(2, newCols) : 1
        const rowSpan = 2
        let placed = false
        for (let r = 0; !placed; r++) {
          for (let c = 0; c <= newCols - colSpan; c++) {
            let ok = true
            for (let dr = 0; dr < rowSpan && ok; dr++)
              for (let dc = 0; dc < colSpan && ok; dc++)
                if (occupied.has(`${r + dr}-${c + dc}`)) ok = false
            if (ok) {
              newAll[pid] = { row: r, col: c, colSpan, rowSpan }
              for (let dr = 0; dr < rowSpan; dr++)
                for (let dc = 0; dc < colSpan; dc++)
                  occupied.add(`${r + dr}-${c + dc}`)
              placed = true
              break
            }
          }
        }
      }
      setProjectLayout({ _all: newAll })
    }
  }

  const currentTemplate = PORTFOLIO_TEMPLATES.find(t => t.id === template) || PORTFOLIO_TEMPLATES[0]

  const previewProjects = projectOrder.map(pid => projects.find(p => p.id === pid)).filter(Boolean)
  const theme = { bg: bgColor, text: textColor, accent: accentColor }
  const previewPortfolio = {
    ...portfolio, businessName, tagline, contactEmail, contactPhone, showInstagram, showWebsite,
    columns, backgroundColor: bgColor, textColor, accentColor, rowAspectRatio,
    featuredProjects, projectLayout, enabledCategories, photoGap, fontSize, pagePadding, borderRadius, fontFamily, template,
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#F4A259] to-[#6366F1] animate-pulse" />
      </div>
    )
  }

  /* ─────────────── 모바일/태블릿: 세로 스택 ─────────────── */
  /* 사이드바 포함 1100px 미만이면 세로 레이아웃 (갤럭시 폴드 등 폴더블 대응) */
  const useStackLayout = isMobile || window.innerWidth < 1100

  if (useStackLayout) {
    return (
      <div className="space-y-4">
        {/* 상단 버튼: 저장/배포/공유/정렬 */}
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={handleSave} disabled={saving}
            className="px-3 py-2 bg-[#181818] border border-[#2a2a2a] text-[#cbcbcb] text-xs font-bold rounded-[10px] hover:bg-[#1f1f1f] transition-all disabled:opacity-50 whitespace-nowrap">
            {saving ? '저장 중...' : '저장'}
          </button>
          <button onClick={handleDeploy} disabled={deploying}
            className="px-3 py-2 bg-[#6366F1] text-white text-xs font-bold rounded-[10px] hover:bg-[#5558E3] transition-all shadow-md disabled:opacity-50 whitespace-nowrap">
            {deploying ? '배포 중...' : '배포'}
          </button>
          <button onClick={copyLink}
            className="px-3 py-2 bg-[#F4A259] text-white text-xs font-bold rounded-[10px] hover:bg-[#7078E8] transition-all shadow-md whitespace-nowrap">
            {copied ? '복사됨!' : '공유'}
          </button>
          {previewProjects.length > 0 && (
            <button onClick={autoAlign}
              className="px-3 py-2 rounded-[10px] text-xs font-bold tracking-wide transition-all cursor-pointer shadow-md hover:shadow whitespace-nowrap ml-auto"
              style={{ backgroundColor: accentColor, color: '#fff' }}>
              정렬
            </button>
          )}
        </div>
        {/* 미리보기 먼저 */}
        <div className="rounded-[12px] overflow-auto border border-[#2a2a2a] shadow-sm relative"
          style={{ backgroundColor: bgColor }}
          onDragOver={handlePreviewDragOver}>
          {/* Zoom slider (mobile) */}
          <div className="sticky top-1 z-30 flex justify-end pointer-events-none" style={{ marginBottom: '-32px' }}>
            <div className="flex items-center gap-1.5 mr-1
              bg-black/60 backdrop-blur-md rounded-full px-2 py-1 shadow-lg pointer-events-auto">
              <button onClick={() => setPreviewZoom(v => Math.max(30, v - 10))}
                className="w-4 h-4 flex items-center justify-center text-white/70 hover:text-white text-[10px] font-bold">−</button>
              <input type="range" min={30} max={150} step={5} value={previewZoom}
                onChange={(e) => setPreviewZoom(Number(e.target.value))}
                className="w-14 h-1 accent-white cursor-pointer" />
              <button onClick={() => setPreviewZoom(v => Math.min(150, v + 10))}
                className="w-4 h-4 flex items-center justify-center text-white/70 hover:text-white text-[10px] font-bold">+</button>
              <span className="text-[9px] text-white/50 font-mono">{previewZoom}%</span>
            </div>
          </div>
          <div style={{
            transform: `scale(${previewZoom / 100})`,
            transformOrigin: 'top center',
          }}>
            {renderPreview()}
          </div>
        </div>
        {/* 설정 패널 */}
        {renderSettings()}
      </div>
    )
  }

  /* ─────────────── 와이드 데스크탑: 상단 리본 + 풀너비 프리뷰 (Word 스타일) ─────────────── */
  const RIBBON_TABS = [
    { id: 'template', label: '템플릿', icon: '⊞' },
    { id: 'color', label: '컬러', icon: '◐' },
    { id: 'layout', label: '레이아웃', icon: '⊟' },
    { id: 'header', label: '헤더', icon: 'Aa' },
    { id: 'advanced', label: '상세', icon: '⚙' },
    { id: 'projects', label: '프로젝트', icon: '☰' },
    { id: 'categories', label: '카테고리', icon: '#' },
  ]

  const toggleRibbon = (tabId) => {
    // 탭 클릭 시 항상 해당 탭으로 전환 (닫히지 않음), 닫기는 X 버튼으로만
    setRibbonTab(tabId)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* ── 상단 리본 바 ── */}
      <div className="flex-shrink-0">
        {/* 1행: 주소 + 저장/배포/공유 */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#2a2a2a] bg-[#111]">
          <span className="text-[11px] text-[#6a6a6a] font-medium flex-shrink-0">웹 주소</span>
          <div className="flex items-center gap-1 bg-[#1e1e1e] rounded-lg px-2.5 py-1.5 flex-shrink-0">
            <span className="text-[11px] text-[#6a6a6a] flex-shrink-0">/p/</span>
            <input value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="필수 입력" className="bg-transparent text-xs font-bold text-white outline-none w-[80px] placeholder:text-red-400/60 placeholder:font-normal" />
            {slugStatus === 'ok' && <span className="text-emerald-500 text-[10px]">✓</span>}
            {slugStatus === 'taken' && <span className="text-red-500 text-[10px]">✕</span>}
          </div>
          <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
            <button onClick={handleSave} disabled={saving}
              className="px-3 py-1.5 bg-[#1e1e1e] border border-[#333] text-[#cbcbcb] text-xs font-bold rounded-lg hover:bg-[#252525] transition-all disabled:opacity-50">
              {saving ? '...' : '저장'}
            </button>
            <button onClick={handleDeploy} disabled={deploying}
              className="px-3 py-1.5 bg-[#6366F1] text-white text-xs font-bold rounded-lg hover:bg-[#5558E3] transition-all disabled:opacity-50">
              {deploying ? '...' : '배포'}
            </button>
            <button onClick={copyLink}
              className="px-3 py-1.5 bg-[#F4A259] text-white text-xs font-bold rounded-lg hover:bg-[#e8913f] transition-all">
              {copied ? '✓' : '공유'}
            </button>
            {autoSaved && <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full flex-shrink-0" title="저장됨" />}
          </div>
        </div>
        {/* 2행: 리본 탭 + 자동 정렬/초기화 */}
        <div className="flex items-center gap-0.5 px-3 py-1 border-b border-[#2a2a2a] bg-[#141414] overflow-x-auto">
          {RIBBON_TABS.map(tab => (
            <button key={tab.id} onClick={() => toggleRibbon(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide transition-all whitespace-nowrap
                ${ribbonTab === tab.id
                  ? 'bg-[#252525] text-white'
                  : 'text-[#8a8a8a] hover:text-[#cbcbcb] hover:bg-[#1a1a1a]'}`}>
              <span className="text-[10px] opacity-60">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
          {previewProjects.length > 0 && (
            <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
              <button onClick={() => autoAlign()}
                className="px-3 py-1 rounded-lg text-[11px] font-bold transition-all"
                style={{ backgroundColor: accentColor, color: '#fff' }}>
                자동 정렬
              </button>
              <button onClick={() => resetLayout()}
                className="px-3 py-1 rounded-lg text-[11px] font-bold bg-[#1e1e1e] border border-[#333] text-[#8a8a8a] hover:bg-[#252525] transition-all">
                초기화
              </button>
            </div>
          )}
        </div>

        {/* 드롭다운 패널 (활성 탭의 설정 내용) — 닫기 버튼으로만 닫힘 */}
        {ribbonTab && (
          <div className="border-b border-[#2a2a2a] bg-[#181818] px-4 py-3 relative"
            style={{ maxHeight: '360px', overflowY: 'auto' }}>
            <button onClick={() => setRibbonTab(null)}
              className="absolute top-2 right-3 w-6 h-6 flex items-center justify-center rounded-md text-[#6a6a6a] hover:text-white hover:bg-[#333] transition-all z-10">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            {renderRibbonPanel(ribbonTab)}
          </div>
        )}
      </div>

      {/* ── 풀너비 프리뷰 ── */}
      <div ref={previewScrollRef}
        className="flex-1 min-h-0 overflow-auto relative"
        style={{ backgroundColor: bgColor }}
        onDragOver={handlePreviewDragOver}>
        {/* Zoom slider */}
        <div className="sticky top-2 z-30 flex justify-end pointer-events-none" style={{ marginBottom: '-40px' }}>
          <div className="flex items-center gap-2 mr-3
            bg-black/60 backdrop-blur-md rounded-full px-3 py-1.5 shadow-lg pointer-events-auto">
            <button onClick={() => setPreviewZoom(v => Math.max(30, v - 10))}
              className="w-5 h-5 flex items-center justify-center text-white/70 hover:text-white transition text-xs font-bold">−</button>
            <input type="range" min={30} max={150} step={5} value={previewZoom}
              onChange={(e) => setPreviewZoom(Number(e.target.value))}
              className="w-20 h-1 accent-white cursor-pointer" />
            <button onClick={() => setPreviewZoom(v => Math.min(150, v + 10))}
              className="w-5 h-5 flex items-center justify-center text-white/70 hover:text-white transition text-xs font-bold">+</button>
            <span className="text-[10px] text-white/50 font-mono w-8 text-right">{previewZoom}%</span>
            {previewZoom !== 100 && (
              <button onClick={() => setPreviewZoom(100)}
                className="text-[10px] text-white/40 hover:text-white transition ml-0.5">↺</button>
            )}
          </div>
        </div>
        <div style={{
          transform: `scale(${previewZoom / 100})`,
          transformOrigin: 'top center',
        }}>
          {renderPreview()}
          {!previewProjects.length && (
            <div className="text-center py-20">
              <p className="text-sm font-light" style={{ color: textColor + '40' }}>프로젝트 탭에서 프로젝트를 선택하세요</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  /* ══════════════════════════════════════════════ */
  function renderRibbonPanel(tabId) {
    if (tabId === 'template') {
      return (
        <div className="flex gap-2 flex-wrap">
          {PORTFOLIO_TEMPLATES.map(t => (
            <button key={t.id} onClick={() => applyTemplate(t.id)}
              className={`px-4 py-2.5 rounded-xl transition-all text-left ${
                template === t.id
                  ? 'bg-[#F4A259] text-white ring-2 ring-[#F4A259]/40'
                  : 'bg-[#252525] text-[#b3b3b3] hover:bg-[#2a2a2a]'}`}>
              <div className="text-sm font-bold whitespace-nowrap">{t.name}</div>
              <div className="text-[10px] opacity-60 whitespace-nowrap">{t.description}</div>
            </button>
          ))}
        </div>
      )
    }

    if (tabId === 'color') {
      return (
        <div className="flex items-start gap-6">
          {/* 프리셋 */}
          <div className="flex gap-2">
            {COLOR_PRESETS.map(p => (
              <button key={p.label} onClick={() => applyPreset(p)}
                className="flex flex-col items-center gap-1 py-1.5 px-2 rounded-lg hover:bg-[#222] transition-all">
                <div className="w-7 h-7 rounded-full border border-[#333] overflow-hidden flex">
                  <div className="w-1/2 h-full" style={{ backgroundColor: p.bg }} />
                  <div className="w-1/2 h-full" style={{ backgroundColor: p.accent }} />
                </div>
                <span className="text-[10px] text-[#8a8a8a]">{p.label}</span>
              </button>
            ))}
          </div>
          <div className="w-px h-12 bg-[#333] flex-shrink-0" />
          {/* 커스텀 컬러 */}
          <div className="flex gap-4">
            {[
              { label: '배경', value: bgColor, set: setBgColor },
              { label: '글자', value: textColor, set: setTextColor },
              { label: '포인트', value: accentColor, set: setAccentColor },
            ].map(c => (
              <div key={c.label} className="flex items-center gap-2">
                <input type="color" value={c.value} onChange={e => c.set(e.target.value)}
                  className="w-7 h-7 rounded cursor-pointer border-0 p-0" />
                <div className="flex flex-col">
                  <span className="text-[10px] text-[#6a6a6a]">{c.label}</span>
                  <input value={c.value} onChange={e => c.set(e.target.value)}
                    className="bg-[#252525] rounded px-1.5 py-0.5 text-[11px] text-[#cbcbcb] font-mono outline-none w-[70px]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )
    }

    if (tabId === 'layout') {
      return (
        <div className="flex items-center gap-6">
          {/* 열 수 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#8a8a8a] font-medium">열</span>
            <div className="flex gap-1">
              {[2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => setColumns(n)}
                  className={`w-8 h-8 rounded-lg text-sm font-bold transition-all
                    ${columns === n ? 'bg-white text-[#181818]' : 'bg-[#252525] text-[#8a8a8a] hover:bg-[#2a2a2a]'}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="w-px h-8 bg-[#333]" />
          {/* 비율 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#8a8a8a] font-medium">비율</span>
            <div className="flex gap-1">
              {ASPECT_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => setRowAspectRatio(opt.value)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all
                    ${rowAspectRatio === opt.value ? 'bg-white text-[#181818]' : 'bg-[#252525] text-[#8a8a8a] hover:bg-[#2a2a2a]'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )
    }

    if (tabId === 'header') {
      return (
        <div className="flex items-start gap-4 flex-wrap">
          <div className="flex flex-col gap-2 min-w-[200px]">
            <input value={businessName} onChange={e => setBusinessName(e.target.value)}
              placeholder="이름 / 스튜디오명" className="bg-[#252525] text-white placeholder:text-[#555] rounded-lg px-3 py-2 text-sm outline-none" />
            <input value={tagline} onChange={e => setTagline(e.target.value)}
              placeholder="한줄 소개" className="bg-[#252525] text-white placeholder:text-[#555] rounded-lg px-3 py-2 text-sm outline-none" />
          </div>
          <div className="flex flex-col gap-2 min-w-[200px]">
            <input value={contactEmail} onChange={e => setContactEmail(e.target.value)}
              placeholder="연락 이메일" className="bg-[#252525] text-white placeholder:text-[#555] rounded-lg px-3 py-2 text-sm outline-none" />
            <input value={contactPhone} onChange={e => setContactPhone(e.target.value)}
              placeholder="연락처" className="bg-[#252525] text-white placeholder:text-[#555] rounded-lg px-3 py-2 text-sm outline-none" />
          </div>
          <div className="flex items-center gap-4 self-center">
            <label className="flex items-center gap-1.5 text-xs text-[#b3b3b3] cursor-pointer">
              <input type="checkbox" checked={showInstagram} onChange={e => setShowInstagram(e.target.checked)} className="rounded" />
              인스타그램
            </label>
            <label className="flex items-center gap-1.5 text-xs text-[#b3b3b3] cursor-pointer">
              <input type="checkbox" checked={showWebsite} onChange={e => setShowWebsite(e.target.checked)} className="rounded" />
              웹사이트
            </label>
          </div>
        </div>
      )
    }

    if (tabId === 'advanced') {
      return (
        <div className="space-y-3">
          {/* 폰트 - 가로 스크롤 */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-[#8a8a8a] font-medium flex-shrink-0">폰트</span>
            <div className="flex gap-1 overflow-x-auto pb-1">
              {FONT_LIST.map(f => (
                <button key={f.id} onClick={() => setFontFamily(f.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex-shrink-0
                    ${fontFamily === f.id ? 'bg-white text-[#181818]' : 'bg-[#252525] text-[#8a8a8a] hover:bg-[#2a2a2a]'}`}
                  style={{ fontFamily: f.family }}>
                  {f.label}
                  <span className="ml-1 opacity-50 text-[10px]">{f.type}</span>
                </button>
              ))}
            </div>
          </div>
          {/* 슬라이더 - 가로 배치 */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-2">
            <RangeSlider label="사진 간격" value={photoGap} min={0} max={24} step={1} unit="px" onChange={setPhotoGap} />
            <RangeSlider label="폰트 크기" value={fontSize} min={50} max={200} step={5} unit="%" onChange={setFontSize} />
            <RangeSlider label="주변 여백" value={pagePadding} min={0} max={120} step={4} unit="px" onChange={setPagePadding} />
            <RangeSlider label="곡률" value={borderRadius} min={0} max={32} step={2} unit="px" onChange={setBorderRadius} />
          </div>
        </div>
      )
    }

    if (tabId === 'projects') {
      const selectedList = projectOrder.map(id => projects.find(p => p.id === id)).filter(Boolean)
      const selectedSet = new Set(projectOrder)
      const unselected = projects.filter(p => !selectedSet.has(p.id))
      return (
        <div className="flex gap-4">
          {/* 선택된 프로젝트 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-[#8a8a8a] font-bold uppercase tracking-wider">선택됨 ({selectedList.length})</span>
              {projectOrder.length > 0 && (
                <>
                  <button onClick={() => { setProjectOrder([]); setFeaturedProjects([]); setProjectLayout(prev => ({ ...prev, [layoutKey]: {} })) }}
                    className="text-[10px] text-[#6a6a6a] hover:text-red-400 transition-colors ml-auto">전체해제</button>
                  <button onClick={autoAlign} className="text-[10px] text-[#F4A259] hover:underline">정렬</button>
                </>
              )}
            </div>
            <div className="flex gap-1.5 flex-wrap max-h-[220px] overflow-y-auto">
              {selectedList.map(p => (
                <div key={p.id}
                  draggable
                  onDragStart={(e) => { setDragProjId(p.id); e.dataTransfer.effectAllowed = 'move' }}
                  onDragOver={(e) => { if (dragProjId) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } }}
                  onDrop={(e) => { e.preventDefault(); reorderProjectInList(p.id) }}
                  onDragEnd={() => setDragProjId(null)}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-[#222] ring-1 ring-[#F4A259]/60 transition-all
                    ${dragProjId === p.id ? 'opacity-40' : ''}`}>
                  {p.thumbnailUrl ? (
                    <img src={p.thumbnailUrl} alt="" className="w-7 h-7 rounded object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-7 h-7 rounded bg-[#333] flex-shrink-0" />
                  )}
                  <span className="text-xs font-bold text-white truncate max-w-[80px]">{p.name}</span>
                  <button onClick={() => {
                    const wasFeatured = featuredProjects.includes(p.id)
                    setFeaturedProjects(prev => wasFeatured ? prev.filter(id => id !== p.id) : [...prev, p.id])
                    const defaultRS = Math.max(1, Math.ceil(1 / rowAspectRatio - 0.1))
                    const newColSpan = wasFeatured ? 1 : Math.min(2, columns)
                    const newRowSpan = wasFeatured ? defaultRS : (rowAspectRatio >= 1.0 ? 2 : 1)
                    setProjectLayout(prev => {
                      const layout = { ...(prev[layoutKey] || {}) }
                      const existing = layout[p.id] || { row: 0, col: 0, rowSpan: defaultRS }
                      layout[p.id] = {
                        row: existing.row ?? 0,
                        col: Math.min(existing.col ?? 0, columns - newColSpan),
                        colSpan: newColSpan,
                        rowSpan: newRowSpan,
                      }
                      return { ...prev, [layoutKey]: repackLayout(layout, columns) }
                    })
                  }}
                    className={`w-5 h-5 flex items-center justify-center rounded-full transition-all flex-shrink-0
                      ${featuredProjects.includes(p.id) ? 'bg-amber-400 text-white' : 'bg-[#333] text-[#555] hover:text-amber-400'}`}>
                    <span className="text-[10px]">★</span>
                  </button>
                  <button onClick={() => toggleProject(p.id)}
                    className="w-4 h-4 rounded-full bg-[#555] hover:bg-red-500 flex items-center justify-center flex-shrink-0 transition-colors">
                    <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
              ))}
              {!selectedList.length && <p className="text-xs text-[#555] py-4">프로젝트를 선택하세요 →</p>}
            </div>
          </div>
          <div className="w-px bg-[#333] flex-shrink-0" />
          {/* 추가 가능 */}
          <div className="w-[280px] flex-shrink-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-[#8a8a8a] font-bold uppercase tracking-wider">추가 ({unselected.length})</span>
              {unselected.length > 0 && (
                <button onClick={() => {
                  const allIds = projects.map(p => p.id)
                  const newIds = allIds.filter(id => !projectOrder.includes(id))
                  setProjectOrder([...projectOrder, ...newIds])
                  setProjectLayout(prev => {
                    const layout = { ...(prev[layoutKey] || {}) }
                    for (const id of newIds) {
                      if (!layout[id]) {
                        const defaultRS = Math.max(1, Math.ceil(1 / rowAspectRatio - 0.1))
                        layout[id] = { row: 0, col: 0, colSpan: 1, rowSpan: defaultRS }
                      }
                    }
                    return { ...prev, [layoutKey]: repackLayout(layout, columns) }
                  })
                }}
                  className="text-[10px] text-[#6a6a6a] hover:text-white transition-colors ml-auto">전체선택</button>
              )}
            </div>
            <div className="flex flex-col gap-1 max-h-[220px] overflow-y-auto">
              {unselected.map(p => (
                <button key={p.id} onClick={() => toggleProject(p.id)}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#222] transition-all text-left w-full">
                  {p.thumbnailUrl ? (
                    <img src={p.thumbnailUrl} alt="" className="w-6 h-6 rounded object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-6 h-6 rounded bg-[#333] flex-shrink-0" />
                  )}
                  <span className="text-xs text-[#b3b3b3] truncate">{p.name}</span>
                  <span className="text-[10px] text-[#555] ml-auto flex-shrink-0">{p.category}</span>
                </button>
              ))}
              {!unselected.length && <p className="text-xs text-[#555] text-center py-4">모두 선택됨</p>}
            </div>
          </div>
        </div>
      )
    }

    if (tabId === 'categories') {
      const projectCats = [...new Set(projects.map(p => p.category).filter(c => c && !CATEGORY_LIST.includes(c)))]
      // 활성화된 카테고리만 표시 (기본/커스텀 구분 없이)
      const activeCats = enabledCategories
      // 추가 가능한 카테고리: 기본 목록 + 프로젝트에서 온 것 중 아직 활성화 안 된 것
      const availableCats = [...CATEGORY_LIST, ...projectCats].filter(c => !enabledCategories.includes(c))
      return (
        <div className="flex flex-col gap-3">
          {/* 활성화된 카테고리 */}
          <div className="flex items-center gap-2 flex-wrap">
            {activeCats.map(cat => (
              <span key={cat} className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-white text-[#181818]">
                {cat}
                <button onClick={() => setEnabledCategories(prev => prev.filter(c => c !== cat))}
                  className="ml-0.5 text-[#999] hover:text-[#ff3b30] text-sm leading-none">✕</button>
              </span>
            ))}
            {!activeCats.length && <span className="text-xs text-[#555]">카테고리를 추가하세요</span>}
          </div>
          {/* 추가 가능한 기본 카테고리 */}
          {availableCats.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {availableCats.map(cat => (
                <button key={cat} onClick={() => setEnabledCategories(prev => [...prev, cat])}
                  className="px-3 py-1.5 rounded-full text-xs font-bold bg-[#252525] text-[#6a6a6a] hover:bg-[#2a2a2a] transition-all">
                  + {cat}
                </button>
              ))}
            </div>
          )}
          {/* 커스텀 카테고리 입력 */}
          <input
            className="px-3 py-1.5 bg-[#252525] rounded-full text-xs text-white placeholder:text-[#555] outline-none w-[180px]"
            placeholder="+ 커스텀 카테고리 입력"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.target.value.trim()) {
                const val = e.target.value.trim().toUpperCase()
                if (!enabledCategories.includes(val)) setEnabledCategories(prev => [...prev, val])
                e.target.value = ''
              }
            }}
          />
        </div>
      )
    }

    return null
  }

  function renderPreview() {
    return (
      <>
        <PortfolioTemplateRenderer
          templateId={template}
          portfolio={previewPortfolio}
          profile={userDoc}
          projects={previewProjects}
          projectAssets={projectAssets}
          categories={enabledCategories}
          bg={bgColor} text={textColor} accent={accentColor}
          photoGap={photoGap} fontSize={fontSize} pagePadding={pagePadding}
          borderRadius={borderRadius} fontFamily={fontFamily}
          activeCategory={previewCategory} setActiveCategory={setPreviewCategory}
          sidebarNumber={sidebarNumber} setSidebarNumber={setSidebarNumber}
          onProjectClick={() => {}}
          onContactClick={() => {}}
          onReorder={(dragId, targetId) => {
            setProjectOrder(prev => {
              const next = [...prev]
              const i = next.indexOf(dragId)
              const j = next.indexOf(targetId)
              if (i < 0 || j < 0) return prev
              // swap 방식: 방향 무관하게 항상 동작
              ;[next[i], next[j]] = [next[j], next[i]]
              return next
            })
          }}
          mode="preview"
        />
        {!previewProjects.length && (
          <div className="text-center py-20">
            <p className="text-sm font-light" style={{ color: textColor + '40' }}>좌측에서 프로젝트를 선택하세요</p>
          </div>
        )}
      </>
    )
  }

  function toggleSection(key) {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }))
  }

  function SectionHeader({ id, label, badge }) {
    const open = openSections[id]
    return (
      <button onClick={() => toggleSection(id)}
        className="w-full flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-sm tracking-[0.15em] uppercase text-[#8a8a8a] font-semibold truncate">{label}</p>
          {badge}
        </div>
        <svg className={`w-4 h-4 text-[#6a6a6a] transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
    )
  }

  function renderSettings() {
    return (
      <>
        {/* 타이틀 */}
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-xl font-black tracking-tight text-white">웹 포트폴리오</h2>
          {autoSaved && (
            <span className="flex items-center gap-1 ml-auto">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
              <span className="text-xs text-emerald-500 font-semibold">저장됨</span>
            </span>
          )}
        </div>

        {/* ── 템플릿 ── */}
        <div className="bg-[#181818] rounded-[20px] shadow-lg p-5 space-y-3">
          <SectionHeader id="template" label="템플릿"
            badge={<span className="text-xs text-[#8a8a8a]">{currentTemplate.nameEn}</span>}
          />
          {openSections.template && (
            <div className="space-y-1.5 max-h-[360px] overflow-y-auto">
              {PORTFOLIO_TEMPLATES.map(t => (
                <button key={t.id} onClick={() => applyTemplate(t.id)}
                  className={`w-full text-left px-4 py-3 rounded-xl transition-all ${
                    template === t.id
                      ? 'bg-[#F4A259] text-white'
                      : 'bg-[#252525] text-[#b3b3b3] hover:bg-[#2a2a2a]'
                  }`}>
                  <div className="text-sm font-bold">{t.name}</div>
                  <div className="text-xs opacity-60">{t.description}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── 포트폴리오 주소 (모바일에서만 표시, 데스크탑은 프리뷰 상단 바로 이동) ── */}
        <div className="bg-[#181818] rounded-[20px] shadow-lg p-5 space-y-3 lg:hidden">
          <SectionHeader id="slug" label="포트폴리오 주소" />
          {openSections.slug && (
            <div className="flex items-center gap-1 bg-[#252525] rounded-[12px] px-3 py-2.5">
              <span className="text-xs text-[#8a8a8a] flex-shrink-0">/p/</span>
              <input value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="필수 입력" className="flex-1 bg-transparent text-sm font-bold text-white outline-none min-w-0 placeholder:text-red-400/60 placeholder:font-normal" />
              {slugStatus === 'ok' && <span className="text-emerald-500 text-xs">✓</span>}
              {slugStatus === 'taken' && <span className="text-red-500 text-xs">사용중</span>}
              {slugStatus === 'checking' && <span className="text-[#8a8a8a] text-xs">...</span>}
            </div>
          )}
        </div>

        {/* ── 컬러 테마 ── */}
        <div className="bg-[#181818] rounded-[20px] shadow-lg p-5 space-y-3">
          <SectionHeader id="color" label="컬러 테마"
            badge={<div className="flex gap-0.5">{[bgColor, accentColor].map((c,i) => <div key={i} className="w-3 h-3 rounded-full border border-[#2a2a2a]" style={{ backgroundColor: c }} />)}</div>}
          />
          {openSections.color && (
            <>
              <div className="flex gap-1.5">
                {COLOR_PRESETS.map(p => (
                  <button key={p.label} onClick={() => applyPreset(p)}
                    className="flex-1 flex flex-col items-center gap-1 py-1.5 rounded-[10px] hover:bg-[#1f1f1f] transition-all">
                    <div className="w-6 h-6 rounded-full border border-[#2a2a2a] overflow-hidden flex">
                      <div className="w-1/2 h-full" style={{ backgroundColor: p.bg }} />
                      <div className="w-1/2 h-full" style={{ backgroundColor: p.accent }} />
                    </div>
                    <span className="text-xs text-[#b3b3b3]">{p.label}</span>
                  </button>
                ))}
              </div>
              <div className="space-y-2">
                {[
                  { label: '배경색', value: bgColor, set: setBgColor },
                  { label: '글자색', value: textColor, set: setTextColor },
                  { label: '포인트색', value: accentColor, set: setAccentColor },
                ].map(c => (
                  <div key={c.label} className="flex items-center gap-2">
                    <input type="color" value={c.value} onChange={e => c.set(e.target.value)}
                      className="w-7 h-7 rounded-[6px] cursor-pointer border-0 p-0 flex-shrink-0" />
                    <span className="text-sm text-[#b3b3b3] w-14 flex-shrink-0">{c.label}</span>
                    <input value={c.value} onChange={e => c.set(e.target.value)}
                      className="flex-1 min-w-0 bg-[#252525] rounded-[8px] px-2 py-1.5 text-sm text-[#cbcbcb] font-mono outline-none" />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── 레이아웃 ── */}
        <div className="bg-[#181818] rounded-[20px] shadow-lg p-5 space-y-3">
          <SectionHeader id="layout" label="레이아웃"
            badge={<span className="text-xs text-[#8a8a8a] font-mono">{columns}열 · {ASPECT_OPTIONS.find(o=>o.value===rowAspectRatio)?.label||'3:2'}</span>}
          />
          {openSections.layout && (
            <>
              <div>
                <label className="text-xs text-[#b3b3b3] mb-1 block">열 수</label>
                <div className="flex gap-1.5">
                  {[2, 3, 4, 5].map(n => (
                    <button key={n} onClick={() => setColumns(n)}
                      className={`flex-1 py-2 rounded-[10px] text-sm font-bold transition-all
                        ${columns === n ? 'bg-white text-[#181818]' : 'bg-[#252525] text-[#b3b3b3] hover:bg-[#2a2a2a]'}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-[#b3b3b3] mb-1 block">비율</label>
                <div className="flex flex-wrap gap-1.5">
                  {ASPECT_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => setRowAspectRatio(opt.value)}
                      className={`px-3 py-1.5 rounded-[10px] text-sm font-bold transition-all
                        ${rowAspectRatio === opt.value ? 'bg-white text-[#181818]' : 'bg-[#252525] text-[#b3b3b3] hover:bg-[#2a2a2a]'}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── 헤더 정보 ── */}
        <div className="bg-[#181818] rounded-[20px] shadow-lg p-5 space-y-3">
          <SectionHeader id="header" label="헤더 정보"
            badge={businessName ? <span className="text-xs text-[#8a8a8a] truncate max-w-[100px]">{businessName}</span> : null}
          />
          {openSections.header && (
            <>
              <input value={businessName} onChange={e => setBusinessName(e.target.value)}
                placeholder="이름 / 스튜디오명" className="w-full bg-[#252525] text-white placeholder:text-[#6a6a6a] rounded-[12px] px-3 py-2.5 text-sm outline-none" />
              <input value={tagline} onChange={e => setTagline(e.target.value)}
                placeholder="한줄 소개" className="w-full bg-[#252525] text-white placeholder:text-[#6a6a6a] rounded-[12px] px-3 py-2.5 text-sm outline-none" />
              <input value={contactEmail} onChange={e => setContactEmail(e.target.value)}
                placeholder="연락 이메일" className="w-full bg-[#252525] text-white placeholder:text-[#6a6a6a] rounded-[12px] px-3 py-2.5 text-sm outline-none" />
              <input value={contactPhone} onChange={e => setContactPhone(e.target.value)}
                placeholder="연락처 (010-0000-0000)" className="w-full bg-[#252525] text-white placeholder:text-[#6a6a6a] rounded-[12px] px-3 py-2.5 text-sm outline-none" />
              <div className="flex gap-4">
                <label className="flex items-center gap-1.5 text-xs text-[#b3b3b3] cursor-pointer">
                  <input type="checkbox" checked={showInstagram} onChange={e => setShowInstagram(e.target.checked)} className="rounded" />
                  인스타그램
                </label>
                <label className="flex items-center gap-1.5 text-xs text-[#b3b3b3] cursor-pointer">
                  <input type="checkbox" checked={showWebsite} onChange={e => setShowWebsite(e.target.checked)} className="rounded" />
                  웹사이트
                </label>
              </div>
            </>
          )}
        </div>

        {/* ── 상세 조정 (별도 섹션) ── */}
        <div className="bg-[#181818] rounded-[20px] shadow-lg p-5 space-y-3">
          <SectionHeader id="advanced" label="상세 조정"
            badge={<span className="text-xs text-[#8a8a8a] font-mono">{photoGap}px · {fontSize}% · {pagePadding}px · R{borderRadius}</span>}
          />
          {openSections.advanced && (
            <div className="space-y-4">
              {/* 폰트 선택 */}
              <div>
                <label className="text-xs text-[#b3b3b3] mb-1.5 block">폰트</label>
                <div className="flex flex-col gap-1 max-h-[280px] overflow-y-auto">
                  {FONT_LIST.map(f => (
                    <button key={f.id} onClick={() => setFontFamily(f.id)}
                      className={`w-full px-3 py-2.5 rounded-[10px] text-left transition-all flex items-center justify-between gap-3 ${fontFamily === f.id ? 'bg-white text-[#181818]' : 'bg-[#252525] text-[#b3b3b3] hover:bg-[#2a2a2a]'}`}>
                      <span className="text-sm font-bold truncate" style={{ fontFamily: f.family }}>{f.label}</span>
                      <span className={`text-[10px] shrink-0 ${fontFamily === f.id ? 'text-[#181818]/60' : 'text-[#8a8a8a]'}`}>{f.type}</span>
                    </button>
                  ))}
                </div>
              </div>
              <RangeSlider label="사진 간격" value={photoGap} min={0} max={24} step={1} unit="px" onChange={setPhotoGap} />
              <RangeSlider label="폰트 크기" value={fontSize} min={50} max={200} step={5} unit="%" onChange={setFontSize} />
              <RangeSlider label="주변 여백" value={pagePadding} min={0} max={120} step={4} unit="px" onChange={setPagePadding} />
              <RangeSlider label="곡률" value={borderRadius} min={0} max={32} step={2} unit="px" onChange={setBorderRadius} />
            </div>
          )}
        </div>

        {/* ── 선택된 프로젝트 ── */}
        <div className="bg-[#181818] rounded-[20px] shadow-lg p-5 space-y-3">
          <div className="flex items-center justify-between">
            <SectionHeader id="projects" label={`선택된 프로젝트 (${projectOrder.length})`} />
            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
              {projectOrder.length > 0 && (
                <button onClick={(e) => {
                  e.stopPropagation()
                  setProjectOrder([])
                  setFeaturedProjects([])
                  setProjectLayout(prev => ({ ...prev, [layoutKey]: {} }))
                }}
                  className="text-xs text-[#8a8a8a] font-bold tracking-wide hover:text-red-400 transition-colors">
                  전체해제
                </button>
              )}
              {projectOrder.length > 0 && (
                <button onClick={(e) => { e.stopPropagation(); autoAlign() }}
                  className="text-xs text-[#F4A259] font-bold tracking-wide hover:underline">
                  정렬
                </button>
              )}
            </div>
          </div>
          {openSections.projects && (() => {
            const selectedList = projectOrder.map(id => projects.find(p => p.id === id)).filter(Boolean)
            if (!selectedList.length) return (
              <p className="text-xs text-[#6a6a6a] text-center py-4">아래에서 프로젝트를 추가하세요</p>
            )
            return (
              <div className="max-h-[24rem] overflow-y-auto space-y-1 px-1 py-1">
                {selectedList.map(p => (
                  <div key={p.id}
                    draggable
                    onDragStart={(e) => { setDragProjId(p.id); e.dataTransfer.effectAllowed = 'move' }}
                    onDragOver={(e) => { if (dragProjId) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } }}
                    onDrop={(e) => { e.preventDefault(); reorderProjectInList(p.id) }}
                    onDragEnd={() => setDragProjId(null)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-[12px] transition-all text-left
                      bg-[#181818] ring-2 ring-[#F4A259]
                      ${dragProjId === p.id ? 'opacity-40' : ''}`}>
                    <span className="text-[#6a6a6a] text-xs cursor-grab active:cursor-grabbing flex-shrink-0">⋮⋮</span>
                    {p.thumbnailUrl ? (
                      <img src={p.thumbnailUrl} alt="" className="w-8 h-8 rounded-[6px] object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-[6px] bg-[#2a2a2a] flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-xs font-bold text-white truncate">{p.name}</p>
                      <p className="text-xs text-[#8a8a8a]">{p.category} · {(p.imageCount || 0) + (p.videoCount || 0)}개</p>
                    </div>
                    <button onClick={(e) => {
                      e.stopPropagation()
                      const wasFeatured = featuredProjects.includes(p.id)
                      setFeaturedProjects(prev => wasFeatured ? prev.filter(id => id !== p.id) : [...prev, p.id])
                      const defaultRS = Math.max(1, Math.ceil(1 / rowAspectRatio - 0.1))
                      const newColSpan = wasFeatured ? 1 : Math.min(2, columns)
                      const newRowSpan = wasFeatured ? defaultRS : (rowAspectRatio >= 1.0 ? 2 : 1)
                      setProjectLayout(prev => {
                        const layout = { ...(prev[layoutKey] || {}) }
                        const existing = layout[p.id] || { row: 0, col: 0, rowSpan: defaultRS }
                        layout[p.id] = {
                          row: existing.row ?? 0,
                          col: Math.min(existing.col ?? 0, columns - newColSpan),
                          colSpan: newColSpan,
                          rowSpan: newRowSpan,
                        }
                        return { ...prev, [layoutKey]: repackLayout(layout, columns) }
                      })
                    }}
                      className={`w-6 h-6 flex items-center justify-center rounded-full transition-all flex-shrink-0
                        ${featuredProjects.includes(p.id) ? 'bg-amber-400 text-white' : 'bg-[#252525] text-[#6a6a6a] hover:text-amber-400'}`}>
                      <span className="text-xs">★</span>
                    </button>
                    <button onClick={() => toggleProject(p.id)}
                      className="w-5 h-5 rounded-full bg-[#F4A259] border-2 border-[#F4A259] flex items-center justify-center flex-shrink-0 hover:bg-red-500 hover:border-red-500 transition-colors">
                      <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>

        {/* ── 프로젝트 추가 ── */}
        <div className="bg-[#181818] rounded-[20px] shadow-lg p-5 space-y-3">
          <div className="flex items-center justify-between">
            <SectionHeader id="available" label={`프로젝트 추가 (${projects.length - projectOrder.length})`} />
            {projects.length - projectOrder.length > 0 && (
              <button onClick={(e) => {
                e.stopPropagation()
                const allIds = projects.map(p => p.id)
                const newIds = allIds.filter(id => !projectOrder.includes(id))
                setProjectOrder([...projectOrder, ...newIds])
                setProjectLayout(prev => {
                  const layout = { ...(prev[layoutKey] || {}) }
                  for (const id of newIds) {
                    if (!layout[id]) {
                      const defaultRS = Math.max(1, Math.ceil(1 / rowAspectRatio - 0.1))
                      layout[id] = { row: 0, col: 0, colSpan: 1, rowSpan: defaultRS }
                    }
                  }
                  return { ...prev, [layoutKey]: repackLayout(layout, columns) }
                })
              }}
                className="text-xs text-[#8a8a8a] font-bold tracking-wide hover:text-white transition-colors flex-shrink-0 ml-2">
                전체선택
              </button>
            )}
          </div>
          {openSections.available && (() => {
            const selectedSet = new Set(projectOrder)
            const unselected = projects.filter(p => !selectedSet.has(p.id))
            if (!unselected.length) return (
              <p className="text-xs text-[#6a6a6a] text-center py-4">모든 프로젝트가 선택됨</p>
            )
            return (
              <div className="max-h-[24rem] overflow-y-auto space-y-1 px-1 py-1">
                {unselected.map(p => (
                  <div key={p.id}
                    onClick={() => toggleProject(p.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-[12px] transition-all text-left cursor-pointer hover:bg-[#1f1f1f]">
                    {p.thumbnailUrl ? (
                      <img src={p.thumbnailUrl} alt="" className="w-8 h-8 rounded-[6px] object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-[6px] bg-[#2a2a2a] flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-xs font-bold text-white truncate">{p.name}</p>
                      <p className="text-xs text-[#8a8a8a]">{p.category} · {(p.imageCount || 0) + (p.videoCount || 0)}개</p>
                    </div>
                    <div className="w-5 h-5 rounded-full border-2 border-[#6a6a6a] flex items-center justify-center flex-shrink-0">
                      <svg className="w-3 h-3 text-[#6a6a6a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>

        {/* ── 필터 카테고리 ── */}
        <div className="bg-[#181818] rounded-[20px] shadow-lg p-5 space-y-3">
          <SectionHeader id="categories" label="필터 카테고리"
            badge={enabledCategories.length > 0 ? <span className="text-xs text-[#8a8a8a]">{enabledCategories.length}개</span> : null}
          />
          {openSections.categories && (() => {
            const projectCats = [...new Set(projects.map(p => p.category).filter(c => c && !CATEGORY_LIST.includes(c)))]
            const allCats = [...CATEGORY_LIST, ...projectCats, ...enabledCategories.filter(c => !CATEGORY_LIST.includes(c) && !projectCats.includes(c))]
            const uniqueCats = [...new Set(allCats)]
            return (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {uniqueCats.map(cat => {
                    const on = enabledCategories.includes(cat)
                    return (
                      <button key={cat} onClick={() => toggleCategory(cat)}
                        className={`px-3 py-1.5 rounded-full text-sm font-bold transition-all
                          ${on ? 'bg-white text-[#181818]' : 'bg-[#252525] text-[#8a8a8a] hover:bg-[#2a2a2a]'}`}>
                        {cat}
                      </button>
                    )
                  })}
                </div>
                <div className="flex gap-1.5">
                  <input
                    className="flex-1 px-3 py-1.5 bg-[#252525] rounded-full text-sm text-white placeholder:text-[#6a6a6a] outline-none"
                    placeholder="커스텀 카테고리 추가"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.target.value.trim()) {
                        const val = e.target.value.trim().toUpperCase()
                        if (!enabledCategories.includes(val)) setEnabledCategories(prev => [...prev, val])
                        e.target.value = ''
                      }
                    }}
                  />
                </div>
              </div>
            )
          })()}
        </div>

        {/* 액션 버튼은 데스크탑에서 프리뷰 상단 바로 이동, 모바일에서만 여기 표시 */}
        <div className="space-y-2 pb-4 lg:hidden">
          <button onClick={handleSave} disabled={saving}
            className="w-full py-3 bg-[#181818] border border-[#2a2a2a] text-[#cbcbcb] text-sm font-bold rounded-[16px] hover:bg-[#1f1f1f] transition-all disabled:opacity-50">
            {saving ? '저장 중...' : '저장'}
          </button>
          <button onClick={copyLink}
            className="w-full py-3 bg-[#F4A259] text-white text-sm font-bold rounded-[16px] hover:bg-[#7078E8] transition-all shadow-lg">
            {copied ? '복사됨!' : '포트폴리오 공유'}
          </button>
        </div>
      </>
    )
  }
}
