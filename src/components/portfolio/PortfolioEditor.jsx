import { useState, useEffect, useRef, useCallback } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { useProjects } from '../../hooks/useProjects'
import { usePortfolio } from '../../hooks/usePortfolio'
import PortfolioGrid from './PortfolioGrid'
import PortfolioHeader from './PortfolioHeader'
import PortfolioCategoryFilter from './PortfolioCategoryFilter'

const ASPECT_OPTIONS = [
  { label: '3:2', value: 0.667 },
  { label: '1:1', value: 1.0 },
  { label: '4:3', value: 0.75 },
  { label: '3:4', value: 1.333 },
  { label: '16:9', value: 0.5625 },
]

const COLOR_PRESETS = [
  { label: 'Light', bg: '#FFFFFF', text: '#1A1A1A', accent: '#828DF8' },
  { label: 'Dark', bg: '#0A0A0A', text: '#FFFFFF', accent: '#828DF8' },
  { label: 'Warm', bg: '#F4F3EE', text: '#2C2C2C', accent: '#C19A6B' },
  { label: 'Navy', bg: '#0D1B2A', text: '#E0E1DD', accent: '#778DA9' },
  { label: 'Forest', bg: '#1B2721', text: '#E8E4D9', accent: '#7D8F69' },
]

const CATEGORY_LIST = ['FASHION', 'BEAUTY', 'CELEBRITY', 'AD', 'PORTRAIT', 'PERSONAL WORK']

/* ─── 레인지 슬라이더 ─── */
function RangeSlider({ label, value, min, max, step, unit, onChange }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] text-gray-500 w-16 flex-shrink-0">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))}
        className="flex-1 h-1 accent-[#828DF8] cursor-pointer" />
      <span className="text-[11px] text-gray-700 font-mono w-12 text-right flex-shrink-0">{value}{unit}</span>
    </div>
  )
}

export default function PortfolioEditor({ isMobile }) {
  const { user, userDoc } = useAuth()
  const { projects } = useProjects()
  const { portfolio, loading, savePortfolio, checkSlugAvailable, publishPortfolio, unpublishPortfolio } = usePortfolio()

  const [slug, setSlug] = useState('')
  const [slugStatus, setSlugStatus] = useState(null)
  const [columns, setColumns] = useState(3)
  const [bgColor, setBgColor] = useState('#FFFFFF')
  const [textColor, setTextColor] = useState('#1A1A1A')
  const [accentColor, setAccentColor] = useState('#828DF8')
  const [rowAspectRatio, setRowAspectRatio] = useState(0.667)
  const [businessName, setBusinessName] = useState('')
  const [tagline, setTagline] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [showInstagram, setShowInstagram] = useState(true)
  const [showWebsite, setShowWebsite] = useState(true)
  const [projectOrder, setProjectOrder] = useState([])
  const [featuredProjects, setFeaturedProjects] = useState([])
  const [projectLayout, setProjectLayout] = useState({}) // { [pid]: { row, col, span } }
  const [enabledCategories, setEnabledCategories] = useState([])
  // 상세 조정
  const [photoGap, setPhotoGap] = useState(8)
  const [fontSize, setFontSize] = useState(100)
  const [pagePadding, setPagePadding] = useState(48)
  const [borderRadius, setBorderRadius] = useState(12)
  // 섹션 열기/닫기 (기본: 슬러그+프로젝트 열림)
  const [openSections, setOpenSections] = useState({ slug: true, projects: true })

  const [saving, setSaving] = useState(false)
  const [autoSaved, setAutoSaved] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [previewCategory, setPreviewCategory] = useState(null)
  const [projectAssets, setProjectAssets] = useState({})
  const autoSaveTimer = useRef(null)
  const initialLoad = useRef(true)

  useEffect(() => {
    if (!portfolio) return
    setSlug(portfolio.slug || '')
    setColumns(portfolio.columns || 3)
    setBgColor(portfolio.backgroundColor || '#FFFFFF')
    setTextColor(portfolio.textColor || '#1A1A1A')
    setAccentColor(portfolio.accentColor || '#828DF8')
    setRowAspectRatio(portfolio.rowAspectRatio || 0.667)
    setBusinessName(portfolio.businessName || userDoc?.displayName || '')
    setTagline(portfolio.tagline || userDoc?.profession || '')
    setContactEmail(portfolio.contactEmail || userDoc?.email || user?.email || '')
    setShowInstagram(portfolio.showInstagram !== false)
    setShowWebsite(portfolio.showWebsite !== false)
    setProjectOrder(portfolio.projectOrder || [])
    setFeaturedProjects(portfolio.featuredProjects || [])
    setProjectLayout(portfolio.projectLayout || {})
    setEnabledCategories(portfolio.enabledCategories || [])
    setPhotoGap(portfolio.photoGap ?? 8)
    setFontSize(portfolio.fontSize ?? 100)
    setPagePadding(portfolio.pagePadding ?? 48)
    setBorderRadius(portfolio.borderRadius ?? 12)
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

  const getPayload = useCallback(() => ({
    slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-'),
    columns, backgroundColor: bgColor, textColor, accentColor, rowAspectRatio,
    businessName, tagline, contactEmail, showInstagram, showWebsite,
    projectOrder, featuredProjects, projectLayout, enabledCategories,
    photoGap, fontSize, pagePadding, borderRadius,
  }), [slug, columns, bgColor, textColor, accentColor, rowAspectRatio, businessName, tagline, contactEmail, showInstagram, showWebsite, projectOrder, featuredProjects, projectLayout, enabledCategories, photoGap, fontSize, pagePadding, borderRadius])

  // 임시저장 (3초 디바운스)
  useEffect(() => {
    if (initialLoad.current) { initialLoad.current = false; return }
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(async () => {
      await savePortfolio(getPayload())
      setAutoSaved(true)
      setTimeout(() => setAutoSaved(false), 2000)
    }, 3000)
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current) }
  }, [slug, columns, bgColor, textColor, accentColor, rowAspectRatio, businessName, tagline, contactEmail, showInstagram, showWebsite, projectOrder, featuredProjects, projectLayout, enabledCategories, photoGap, fontSize, pagePadding, borderRadius, getPayload, savePortfolio])

  const handleSave = async () => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    setSaving(true)
    await savePortfolio(getPayload())
    setSaving(false)
  }

  const handlePublish = async () => {
    if (!slug || slugStatus === 'taken') { alert('유효한 슬러그를 입력하세요'); return }
    setPublishing(true)
    await handleSave()
    await publishPortfolio(projectOrder)
    setPublishing(false)
  }

  const handleUnpublish = async () => {
    setPublishing(true); await unpublishPortfolio(); setPublishing(false)
  }

  const toggleProject = (pid) => {
    setProjectOrder(prev => {
      if (prev.includes(pid)) {
        setProjectLayout(pl => { const n = { ...pl }; delete n[pid]; return n })
        return prev.filter(id => id !== pid)
      }
      const newOrder = [...prev, pid]
      setProjectLayout(pl => {
        const colSpan = featuredProjects.includes(pid) ? Math.min(2, columns) : 1
        const rowSpan = 2 // 기본: 세로
        const nextPos = findNextEmpty(pl, columns, colSpan, rowSpan)
        return { ...pl, [pid]: { ...nextPos, colSpan, rowSpan } }
      })
      return newOrder
    })
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
    setProjectLayout(newLayout)
  }

  // 자동 정렬: 위에서부터 빈틈없이 재배치 (각 타일의 현재 크기 유지)
  const autoAlign = () => {
    // 실제 존재하는 프로젝트만 대상
    const validOrder = projectOrder.filter(pid => projects.some(p => p.id === pid))
    console.log('[autoAlign]', validOrder.length, '개 프로젝트,', columns, '열')
    const newLayout = {}
    const occupied = new Set()
    // projectOrder도 정리
    setProjectOrder(validOrder)
    for (const pid of validOrder) {
      const existing = projectLayout[pid]
      const colSpan = existing?.colSpan || (featuredProjects.includes(pid) ? Math.min(2, columns) : 1)
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
    console.log('[autoAlign] 결과:', Object.entries(newLayout).map(([k,v]) => `${k.slice(0,6)}:r${v.row}c${v.col}`).join(' '))
    setProjectLayout(newLayout)
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
    setProjectLayout(newLayout)
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

  const previewProjects = projectOrder.map(pid => projects.find(p => p.id === pid)).filter(Boolean)
  const theme = { bg: bgColor, text: textColor, accent: accentColor }
  const previewPortfolio = {
    ...portfolio, businessName, tagline, contactEmail, showInstagram, showWebsite,
    columns, backgroundColor: bgColor, textColor, accentColor, rowAspectRatio,
    featuredProjects, projectLayout, enabledCategories, photoGap, fontSize, pagePadding, borderRadius,
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#828DF8] to-[#6366F1] animate-pulse" />
      </div>
    )
  }

  /* ─────────────── 모바일: 미리보기 위, 설정 아래 ─────────────── */
  if (isMobile) {
    return (
      <div className="space-y-4">
        {/* 미리보기 먼저 */}
        <div className="rounded-[24px] overflow-hidden shadow-lg" style={{ backgroundColor: bgColor }}>
          {renderPreview()}
        </div>
        {/* 설정 패널 */}
        {renderSettings()}
      </div>
    )
  }

  /* ─────────────── 데스크탑: 좌우 분할 ─────────────── */
  return (
    <div className="flex gap-6 h-[calc(100vh-64px)]">
      {/* 좌: 설정 패널 — 고정 너비, 독립 스크롤 */}
      <div className="w-[340px] flex-shrink-0 overflow-y-auto space-y-4 pr-1">
        {renderSettings()}
      </div>

      {/* 우: 라이브 프리뷰 */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* 정렬 버튼 — 프리뷰 스크롤 영역 밖 */}
        {previewProjects.length > 0 && (
          <div className="flex justify-end px-3 pb-2">
            <button onClick={autoAlign}
              className="px-4 py-2 rounded-full text-[11px] font-bold tracking-wide transition-all cursor-pointer shadow-sm hover:shadow"
              style={{ backgroundColor: accentColor, color: '#fff' }}>
              정렬
            </button>
          </div>
        )}
        <div className="flex-1 min-h-0 rounded-[24px] overflow-y-auto overflow-x-hidden shadow-lg"
          style={{ backgroundColor: bgColor }}>
          {renderPreview()}
        </div>
      </div>
    </div>
  )

  /* ══════════════════════════════════════════════ */
  function renderPreview() {
    return (
      <>
        <PortfolioHeader
          portfolio={previewPortfolio} profile={userDoc}
          onContact={() => {}} theme={theme}
          fontSize={fontSize} pagePadding={pagePadding}
        />
        <PortfolioCategoryFilter
          categories={enabledCategories} activeCategory={previewCategory}
          onSelect={setPreviewCategory} theme={theme}
          variant="horizontal"
        />
        <PortfolioGrid
          projects={previewProjects} projectAssets={projectAssets}
          columns={columns} rowAspectRatio={rowAspectRatio}
          featuredProjects={featuredProjects}
          projectLayout={projectLayout}
          photoGap={photoGap} pagePadding={pagePadding}
          borderRadius={borderRadius}
          masonry={true}
          mode="owner" categoryFilter={previewCategory}
          onLayoutChange={handleLayoutChange} theme={theme}
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
        <div className="flex items-center gap-2">
          <p className="text-[10px] tracking-[0.15em] uppercase text-gray-400 font-semibold">{label}</p>
          {badge}
        </div>
        <svg className={`w-4 h-4 text-gray-300 transition-transform ${open ? 'rotate-180' : ''}`}
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
          <h2 className="text-xl font-black tracking-tight text-gray-900">웹 포트폴리오</h2>
          {autoSaved && (
            <span className="flex items-center gap-1 ml-auto">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
              <span className="text-[10px] text-emerald-500 font-semibold">저장됨</span>
            </span>
          )}
        </div>

        {/* ── 포트폴리오 주소 ── */}
        <div className="bg-white rounded-[20px] shadow-sm p-5 space-y-3">
          <SectionHeader id="slug" label="포트폴리오 주소" />
          {openSections.slug && (
            <div className="flex items-center gap-1 bg-[#F4F3EE] rounded-[12px] px-3 py-2.5">
              <span className="text-xs text-gray-400 flex-shrink-0">/p/</span>
              <input value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="my-portfolio" className="flex-1 bg-transparent text-sm font-bold text-gray-900 outline-none min-w-0" />
              {slugStatus === 'ok' && <span className="text-emerald-500 text-xs">✓</span>}
              {slugStatus === 'taken' && <span className="text-red-500 text-xs">사용중</span>}
              {slugStatus === 'checking' && <span className="text-gray-400 text-xs">...</span>}
            </div>
          )}
        </div>

        {/* ── 컬러 테마 ── */}
        <div className="bg-white rounded-[20px] shadow-sm p-5 space-y-3">
          <SectionHeader id="color" label="컬러 테마"
            badge={<div className="flex gap-0.5">{[bgColor, accentColor].map((c,i) => <div key={i} className="w-3 h-3 rounded-full border border-gray-200" style={{ backgroundColor: c }} />)}</div>}
          />
          {openSections.color && (
            <>
              <div className="flex gap-1.5">
                {COLOR_PRESETS.map(p => (
                  <button key={p.label} onClick={() => applyPreset(p)}
                    className="flex-1 flex flex-col items-center gap-1 py-1.5 rounded-[10px] hover:bg-gray-50 transition-all">
                    <div className="w-6 h-6 rounded-full border border-gray-200 overflow-hidden flex">
                      <div className="w-1/2 h-full" style={{ backgroundColor: p.bg }} />
                      <div className="w-1/2 h-full" style={{ backgroundColor: p.accent }} />
                    </div>
                    <span className="text-[9px] text-gray-500">{p.label}</span>
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
                    <span className="text-[11px] text-gray-500 w-14 flex-shrink-0">{c.label}</span>
                    <input value={c.value} onChange={e => c.set(e.target.value)}
                      className="flex-1 min-w-0 bg-[#F4F3EE] rounded-[8px] px-2 py-1.5 text-[11px] text-gray-700 font-mono outline-none" />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── 레이아웃 ── */}
        <div className="bg-white rounded-[20px] shadow-sm p-5 space-y-3">
          <SectionHeader id="layout" label="레이아웃"
            badge={<span className="text-[9px] text-gray-400 font-mono">{columns}열 · {ASPECT_OPTIONS.find(o=>o.value===rowAspectRatio)?.label||'3:2'}</span>}
          />
          {openSections.layout && (
            <>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">열 수</label>
                <div className="flex gap-1.5">
                  {[2, 3, 4, 5].map(n => (
                    <button key={n} onClick={() => setColumns(n)}
                      className={`flex-1 py-2 rounded-[10px] text-sm font-bold transition-all
                        ${columns === n ? 'bg-gray-900 text-white' : 'bg-[#F4F3EE] text-gray-500 hover:bg-gray-200'}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">비율</label>
                <div className="flex flex-wrap gap-1.5">
                  {ASPECT_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => setRowAspectRatio(opt.value)}
                      className={`px-3 py-1.5 rounded-[10px] text-[11px] font-bold transition-all
                        ${rowAspectRatio === opt.value ? 'bg-gray-900 text-white' : 'bg-[#F4F3EE] text-gray-500 hover:bg-gray-200'}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── 헤더 정보 ── */}
        <div className="bg-white rounded-[20px] shadow-sm p-5 space-y-3">
          <SectionHeader id="header" label="헤더 정보"
            badge={businessName ? <span className="text-[9px] text-gray-400 truncate max-w-[100px]">{businessName}</span> : null}
          />
          {openSections.header && (
            <>
              <input value={businessName} onChange={e => setBusinessName(e.target.value)}
                placeholder="이름 / 스튜디오명" className="w-full bg-[#F4F3EE] rounded-[12px] px-3 py-2.5 text-sm outline-none" />
              <input value={tagline} onChange={e => setTagline(e.target.value)}
                placeholder="한줄 소개" className="w-full bg-[#F4F3EE] rounded-[12px] px-3 py-2.5 text-sm outline-none" />
              <input value={contactEmail} onChange={e => setContactEmail(e.target.value)}
                placeholder="연락 이메일" className="w-full bg-[#F4F3EE] rounded-[12px] px-3 py-2.5 text-sm outline-none" />
              <div className="flex gap-4">
                <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                  <input type="checkbox" checked={showInstagram} onChange={e => setShowInstagram(e.target.checked)} className="rounded" />
                  인스타그램
                </label>
                <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                  <input type="checkbox" checked={showWebsite} onChange={e => setShowWebsite(e.target.checked)} className="rounded" />
                  웹사이트
                </label>
              </div>
            </>
          )}
        </div>

        {/* ── 상세 조정 (별도 섹션) ── */}
        <div className="bg-white rounded-[20px] shadow-sm p-5 space-y-3">
          <SectionHeader id="advanced" label="상세 조정"
            badge={<span className="text-[9px] text-gray-400 font-mono">{photoGap}px · {fontSize}% · {pagePadding}px · R{borderRadius}</span>}
          />
          {openSections.advanced && (
            <div className="space-y-3">
              <RangeSlider label="사진 간격" value={photoGap} min={0} max={24} step={1} unit="px" onChange={setPhotoGap} />
              <RangeSlider label="폰트 크기" value={fontSize} min={50} max={200} step={5} unit="%" onChange={setFontSize} />
              <RangeSlider label="주변 여백" value={pagePadding} min={0} max={120} step={4} unit="px" onChange={setPagePadding} />
              <RangeSlider label="곡률" value={borderRadius} min={0} max={32} step={2} unit="px" onChange={setBorderRadius} />
            </div>
          )}
        </div>

        {/* ── 프로젝트 선택 ── */}
        <div className="bg-white rounded-[20px] shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between">
            <SectionHeader id="projects" label={`프로젝트 선택 (${projectOrder.length}개)`} />
            {projectOrder.length > 0 && (
              <button onClick={(e) => { e.stopPropagation(); autoAlign() }}
                className="text-[10px] text-[#828DF8] font-bold tracking-wide hover:underline flex-shrink-0 ml-2">
                정렬
              </button>
            )}
          </div>
          {openSections.projects && (
            <div className="max-h-64 overflow-y-auto space-y-1">
              {projects.map(p => {
                const included = projectOrder.includes(p.id)
                return (
                  <button key={p.id} onClick={() => toggleProject(p.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-[12px] transition-all text-left
                      ${included ? 'bg-[#828DF8]/10 ring-1 ring-[#828DF8]/30' : 'hover:bg-[#F4F3EE]'}`}>
                    {p.thumbnailUrl ? (
                      <img src={p.thumbnailUrl} alt="" className="w-8 h-8 rounded-[6px] object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-[6px] bg-gray-200 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-xs font-bold text-gray-900 truncate">{p.name}</p>
                      <p className="text-[10px] text-gray-400">{p.category} · {(p.imageCount || 0) + (p.videoCount || 0)}개</p>
                    </div>
                    {included && (
                      <button onClick={(e) => {
                        e.stopPropagation()
                        const wasFeatured = featuredProjects.includes(p.id)
                        setFeaturedProjects(prev => wasFeatured ? prev.filter(id => id !== p.id) : [...prev, p.id])
                        // colSpan 업데이트
                        setProjectLayout(pl => {
                          if (!pl[p.id]) return pl
                          const newColSpan = wasFeatured ? 1 : Math.min(2, columns)
                          return { ...pl, [p.id]: { ...pl[p.id], colSpan: newColSpan } }
                        })
                      }}
                        className={`w-6 h-6 flex items-center justify-center rounded-full transition-all flex-shrink-0
                          ${featuredProjects.includes(p.id) ? 'bg-amber-400 text-white' : 'bg-gray-100 text-gray-300 hover:text-amber-400'}`}>
                        <span className="text-xs">★</span>
                      </button>
                    )}
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0
                      ${included ? 'bg-[#828DF8] border-[#828DF8]' : 'border-gray-300'}`}>
                      {included && (
                        <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ── 필터 카테고리 ── */}
        <div className="bg-white rounded-[20px] shadow-sm p-5 space-y-3">
          <SectionHeader id="categories" label="필터 카테고리"
            badge={enabledCategories.length > 0 ? <span className="text-[9px] text-gray-400">{enabledCategories.length}개</span> : null}
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
                        className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-all
                          ${on ? 'bg-gray-900 text-white' : 'bg-[#F4F3EE] text-gray-400 hover:bg-gray-200'}`}>
                        {cat}
                      </button>
                    )
                  })}
                </div>
                <div className="flex gap-1.5">
                  <input
                    className="flex-1 px-3 py-1.5 bg-[#F4F3EE] rounded-full text-[11px] text-gray-900 outline-none focus:ring-2 focus:ring-[#828DF8]/30"
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

        {/* ── 액션 ── */}
        <div className="space-y-2 pb-4">
          <button onClick={handleSave} disabled={saving}
            className="w-full py-3 bg-white border border-gray-200 text-gray-700 text-sm font-bold rounded-[16px] hover:bg-gray-50 transition-all disabled:opacity-50">
            {saving ? '저장 중...' : '저장'}
          </button>
          <button onClick={copyLink}
            className="w-full py-3 bg-[#828DF8] text-white text-sm font-bold rounded-[16px] hover:bg-[#7078E8] transition-all shadow-lg shadow-[#828DF8]/25">
            {copied ? '복사됨!' : '링크 복사'}
          </button>
        </div>
      </>
    )
  }
}
