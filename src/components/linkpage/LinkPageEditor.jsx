import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useProjects } from '../../hooks/useProjects'
import { useLinkPage, makeId, DEFAULT_LINKPAGE } from '../../hooks/useLinkPage'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '../../firebase'

// ── 서비스 아이콘 매핑 ──
const SERVICE_ICONS = {
  instagram: '📸', tiktok: '🎵', youtube: '▶️', vimeo: '▶️',
  website: '🌐', email: '✉️',
}
const SERVICE_COLORS = {
  instagram: 'linear-gradient(135deg,#f9ce34,#ee2a7b,#6228d7)',
  tiktok: '#000', youtube: '#FF0000', vimeo: '#1ab7ea',
  website: '#333', email: '#666',
}

// ── 템플릿 미니 프리뷰 데이터 ──
const TEMPLATES = [
  { id: 'bentobox', label: 'Bento Box', bg: '#F4F3EE', dark: false },
  { id: 'cinematography', label: 'Cinemato', bg: '#0D1B2A', dark: true },
  { id: 'code', label: 'Code', bg: '#1e1e1e', dark: true },
  { id: 'editorial', label: 'Editorial', bg: '#fff', dark: false },
  { id: 'coloured', label: 'Coloured', bg: '#EBEAE5', dark: false },
  { id: 'grey', label: 'Grey', bg: '#F5F5F5', dark: false },
  { id: 'creative', label: 'Creative', bg: '#F4F3EE', dark: false },
  { id: 'casestudy', label: 'Case Study', bg: '#fff', dark: false },
]

const THEMES = {
  light: { bg: '#ffffff', text: '#1a1a1a', textSub: '#888888', accent: '#F4A259', chipBg: '#f0f0f0' },
  dark: { bg: '#111111', text: '#f0f0f0', textSub: '#888888', accent: '#F4A259', chipBg: '#222222' },
  warm: { bg: '#fdf6ee', text: '#3d2c1e', textSub: '#a08060', accent: '#c87941', chipBg: '#f0e6d6' },
  navy: { bg: '#0f1729', text: '#e8eaf0', textSub: '#7889a8', accent: '#5b8def', chipBg: '#1a2740' },
  forest: { bg: '#0d1f0d', text: '#d4e8d0', textSub: '#6a9a6a', accent: '#4aa24a', chipBg: '#1a2e1a' },
}

// ── 타일 렌더러 (공유: 피커 + 폰 프리뷰) ──
function TileContent({ tile, style: s }) {
  if (!tile) return <span className="text-xl text-[#bbb]">+</span>

  switch (tile.type) {
    case 'project':
      return (
        <>
          <img src={tile.thumbnailUrl} alt="" className="w-full h-full object-cover" />
          <div className="absolute bottom-0 left-0 right-0 px-1.5 pb-1 pt-3" style={{ background: 'linear-gradient(transparent, rgba(0,0,0,.55))' }}>
            <span className="text-[8px] font-semibold text-white leading-tight">{tile.name}</span>
          </div>
        </>
      )
    case 'category':
      return (
        <div className="flex flex-col items-center justify-center gap-0.5 w-full h-full" style={{ background: tile.color || s.accent }}>
          <span className="text-base">📁</span>
          <span className="text-[8px] font-bold text-white text-center leading-tight">{tile.category}</span>
          <span className="text-[7px] text-white/60">{tile.count} projects</span>
        </div>
      )
    case 'link':
      return (
        <div className="flex flex-col items-center justify-center gap-0.5 w-full h-full" style={{ background: s.chipBg }}>
          <span className="text-[22px]">{SERVICE_ICONS[tile.service] || '🔗'}</span>
          <span className="text-[8px] font-semibold text-center" style={{ color: s.text }}>{tile.label}</span>
        </div>
      )
    case 'template': {
      const tmpl = TEMPLATES.find(t => t.id === tile.templateId)
      return (
        <div className="flex flex-col items-center justify-center gap-0.5 w-full h-full" style={{ background: tmpl?.bg || '#f5f5f5' }}>
          <span className="text-base">⬡</span>
          <span className="text-[7px] font-bold" style={{ color: tmpl?.dark ? '#fff' : '#1a1a1a' }}>포트폴리오</span>
          <span className="text-[6px] text-[#888]">{tmpl?.label}</span>
        </div>
      )
    }
    case 'portfolio':
      return (
        <div className="flex flex-col items-center justify-center gap-0.5 w-full h-full" style={{ background: s.accent }}>
          <span className="text-lg text-white">⬡</span>
          <span className="text-[8px] font-semibold text-white">포트폴리오</span>
        </div>
      )
    case 'image':
      return <img src={tile.url} alt="" className="w-full h-full object-cover" />
    case 'video':
      return <video src={tile.url} muted loop playsInline autoPlay className="w-full h-full object-cover" />
    default:
      return <span className="text-xl text-[#bbb]">+</span>
  }
}

// ══════════════════════════════════════
// ██ MAIN EDITOR COMPONENT
// ══════════════════════════════════════
export default function LinkPageEditor({ isMobile }) {
  const { user, userDoc } = useAuth()
  const { projects } = useProjects()
  const { linkPage, loading, saveLinkPage, deployLinkPage, checkSlugAvailable } = useLinkPage()

  // ── 편집 상태 (로컬, 자동저장) ──
  const [state, setState] = useState(null)
  const [selectedTileId, setSelectedTileId] = useState(null)
  const [ribbonTab, setRibbonTab] = useState(0) // 0=스타일 1=헤더 2=타일
  const [sheet, setSheet] = useState(null) // mobile: 'add'|'style'|'header'|'tile'|null
  const autoSaveRef = useRef(null)

  // linkPage 로드 시 state 초기화
  useEffect(() => {
    if (!linkPage) return
    const draft = linkPage.draft || {}
    setState({
      ...DEFAULT_LINKPAGE,
      ...linkPage,
      ...draft,
      profileName: draft.profileName || linkPage.profileName || userDoc?.displayName || '',
      profileRole: draft.profileRole || linkPage.profileRole || userDoc?.profession || '',
      contactEmail: draft.contactEmail || linkPage.contactEmail || user?.email || '',
    })
  }, [linkPage, userDoc, user])

  // 자동저장 (2초 디바운스)
  useEffect(() => {
    if (!state) return
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current)
    autoSaveRef.current = setTimeout(() => {
      saveLinkPage(state)
    }, 2000)
    return () => clearTimeout(autoSaveRef.current)
  }, [state, saveLinkPage])

  // ── 헬퍼 ──
  const update = useCallback((key, val) => {
    setState(prev => prev ? { ...prev, [key]: val } : prev)
  }, [])

  const updateTile = useCallback((tileId, updates) => {
    setState(prev => {
      if (!prev) return prev
      return { ...prev, tiles: prev.tiles.map(t => t.id === tileId ? { ...t, ...updates } : t) }
    })
  }, [])

  const addTile = useCallback((tile) => {
    setState(prev => {
      if (!prev) return prev
      const emptyIdx = prev.tiles.findIndex(t => t.type === 'empty')
      if (emptyIdx >= 0) {
        const newTiles = [...prev.tiles]
        newTiles[emptyIdx] = tile
        return { ...prev, tiles: newTiles }
      }
      return { ...prev, tiles: [...prev.tiles, tile] }
    })
  }, [])

  const removeTile = useCallback((tileId) => {
    setState(prev => prev ? { ...prev, tiles: prev.tiles.filter(t => t.id !== tileId) } : prev)
    setSelectedTileId(null)
  }, [])

  const addRow = useCallback(() => {
    setState(prev => {
      if (!prev) return prev
      const cols = prev.columns || 3
      const newTiles = Array.from({ length: cols }, () => ({ id: makeId(), type: 'empty' }))
      return { ...prev, tiles: [...prev.tiles, ...newTiles] }
    })
  }, [])

  // 드래그 앤 드롭 (피커 → 그리드)
  const dragDataRef = useRef(null)
  const handleDragStart = useCallback((tileData) => {
    dragDataRef.current = tileData
  }, [])
  const handleDrop = useCallback((targetIdx) => {
    const data = dragDataRef.current
    if (!data) return
    setState(prev => {
      if (!prev) return prev
      const newTiles = [...prev.tiles]
      if (targetIdx < newTiles.length) {
        newTiles[targetIdx] = { ...data, id: newTiles[targetIdx]?.id || makeId() }
      }
      return { ...prev, tiles: newTiles }
    })
    dragDataRef.current = null
  }, [])

  // 파일 업로드
  const uploadFile = useCallback(async (file, type) => {
    if (!user) return null
    const path = `users/${user.uid}/linkpage/${Date.now()}_${file.name}`
    const storageRef = ref(storage, path)
    await uploadBytes(storageRef, file)
    const url = await getDownloadURL(storageRef)
    return { url, storagePath: path }
  }, [user])

  // 카테고리 집계
  const categories = useMemo(() => {
    const map = {}
    projects?.forEach(p => {
      const cat = p.category || '미분류'
      if (!map[cat]) map[cat] = { name: cat, count: 0 }
      map[cat].count++
    })
    return Object.values(map)
  }, [projects])

  // ── 링크페이지 테마 스타일 (폰 프리뷰용) ──
  const s = useMemo(() => ({
    bg: state?.backgroundColor || '#fff',
    text: state?.textColor || '#1a1a1a',
    textSub: '#888',
    accent: state?.accentColor || '#F4A259',
    chipBg: state?.backgroundColor === '#ffffff' || !state?.backgroundColor ? '#f0f0f0'
      : adjustColor(state?.backgroundColor, 15),
  }), [state?.backgroundColor, state?.textColor, state?.accentColor])

  if (loading || !state) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-[#8a8a8a] text-sm">로딩 중...</p>
      </div>
    )
  }

  const tiles = state.tiles || []

  // ══════════════════════════════════════
  // ██ DESKTOP LAYOUT
  // ══════════════════════════════════════
  if (!isMobile) {
    return (
      <div className="flex flex-col h-[calc(100vh-64px)] -m-8">
        {/* ── Ribbon Bar ── */}
        <div className="bg-white dark:bg-black border-b border-[#dcdcdc] dark:border-[#2a2a2a] flex-shrink-0">
          <div className="flex border-b border-[#ececec] dark:border-[#2a2a2a] px-3">
            {['스타일', '헤더', '타일'].map((label, i) => (
              <button key={i} onClick={() => setRibbonTab(i)}
                className={`text-[11px] font-semibold px-3.5 py-2 border-b-2 transition-all
                  ${ribbonTab === i
                    ? 'text-[#F4A259] border-[#F4A259]'
                    : 'text-[#8a8a8a] border-transparent hover:text-[#181818] dark:hover:text-white'
                  }`}>
                {label}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2 py-1">
              <button
                onClick={() => navigator.clipboard?.writeText(`assifolio.com/l/${state.slug}`)}
                className="text-[11px] text-[#8a8a8a] hover:text-[#181818] dark:hover:text-white px-2 py-1 rounded-[8px] hover:bg-[#ececec] dark:hover:bg-[#1f1f1f] transition-all">
                🔗 복사
              </button>
              <button
                onClick={async () => { await saveLinkPage(state); await deployLinkPage() }}
                className="text-[11px] font-bold bg-[#F4A259] text-white px-4 py-1.5 rounded-[10px] hover:shadow-lg hover:shadow-[#F4A259]/40 transition-all">
                배포
              </button>
            </div>
          </div>
          <div className="flex items-center px-3 py-1.5 gap-0 min-h-[44px]">
            {ribbonTab === 0 && <RibbonStyle state={state} update={update} s={s} userDoc={userDoc} />}
            {ribbonTab === 1 && <RibbonHeader state={state} update={update} />}
            {ribbonTab === 2 && <RibbonTile state={state} update={update} selectedTileId={selectedTileId} removeTile={removeTile} tiles={tiles} updateTile={updateTile} />}
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* ── Left Picker ── */}
          <div className="w-[270px] bg-[#FAFAFA] dark:bg-[#0a0a0a] border-r border-[#dcdcdc] dark:border-[#2a2a2a] overflow-y-auto flex-shrink-0 p-1.5">
            <PickerPanel
              projects={projects} categories={categories} s={s}
              onDragStart={handleDragStart}
              onTap={(tile) => addTile(tile)}
              onUpload={async (file, type) => {
                const result = await uploadFile(file, type)
                if (result) addTile({ id: makeId(), type, ...result })
              }}
            />
          </div>

          {/* ── Phone Preview ── */}
          <div className="flex-1 flex items-center justify-center bg-[#f0f0f0] dark:bg-[#111]">
            <div className="w-[360px] flex flex-col overflow-hidden"
              style={{
                height: 'min(700px, calc(100vh - 160px))',
                background: s.bg,
                borderRadius: 36,
                border: '5px solid #ddd',
                boxShadow: '0 24px 80px rgba(0,0,0,.12)',
                transition: 'background .3s',
              }}>
              {/* notch */}
              <div className="flex items-center justify-center h-7 flex-shrink-0">
                <div className="w-[72px] h-[5px] rounded-full" style={{ background: adjustColor(s.bg, -20) }} />
              </div>
              <div className="flex-1 overflow-y-auto px-4 pb-6" style={{ scrollbarWidth: 'thin' }}>
                {/* Profile */}
                <PhoneProfile state={state} s={s} />
                {/* Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${state.columns || 3}, 1fr)`, gap: state.tileGap ?? 3 }}>
                  {tiles.map((tile, idx) => (
                    <div key={tile.id}
                      onClick={() => { setSelectedTileId(tile.id); setRibbonTab(2) }}
                      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
                      onDrop={(e) => { e.preventDefault(); handleDrop(idx) }}
                      className={`relative cursor-pointer overflow-hidden transition-all hover:opacity-90 ${selectedTileId === tile.id ? 'ring-2 ring-[#F4A259]' : ''}`}
                      style={{
                        aspectRatio: state.tileRatio || '1',
                        borderRadius: state.tileRadius ?? 3,
                        background: tile.type === 'empty' ? s.chipBg : undefined,
                        border: tile.type === 'empty' ? '1.5px dashed #ccc' : 'none',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                      <TileContent tile={tile.type === 'empty' ? null : tile} style={s} />
                    </div>
                  ))}
                </div>
                <button onClick={addRow}
                  className="w-full mt-1 py-2.5 border-[1.5px] border-dashed rounded-[12px] text-sm transition-all hover:border-[#F4A259] hover:text-[#F4A259]"
                  style={{ borderColor: adjustColor(s.bg, -30), color: adjustColor(s.bg, -60), background: 'transparent' }}>
                  + 한 줄 추가
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════
  // ██ MOBILE LAYOUT
  // ══════════════════════════════════════
  return (
    <div className="flex flex-col -m-4 -mb-20" style={{ height: 'calc(100vh - 56px)' }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-2 flex-shrink-0 bg-white dark:bg-black">
        <span className="text-sm font-bold text-[#181818] dark:text-white">링크페이지</span>
        <div className="flex gap-1.5">
          <button className="text-xs text-[#8a8a8a] px-2 py-1 rounded-[8px] hover:bg-[#ececec] dark:hover:bg-[#1f1f1f] transition-all" onClick={() => {
            navigator.clipboard?.writeText(`assifolio.com/l/${state.slug}`)
          }}>🔗</button>
          <button className="text-[11px] font-bold bg-[#F4A259] text-white px-3.5 py-1.5 rounded-[10px] shadow-lg shadow-[#F4A259]/30"
            onClick={async () => { await saveLinkPage(state); await deployLinkPage() }}>
            배포
          </button>
        </div>
      </div>

      {/* Preview (full screen) */}
      <div className="flex-1 overflow-y-auto" style={{ background: s.bg, transition: 'background .3s' }}>
        <PhoneProfile state={state} s={s} />
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${state.columns || 3}, 1fr)`, gap: state.tileGap ?? 3, padding: '0 12px' }}>
          {tiles.map((tile, idx) => (
            <div key={tile.id}
              onClick={() => setSelectedTileId(tile.id === selectedTileId ? null : tile.id)}
              className={`relative cursor-pointer overflow-hidden ${selectedTileId === tile.id ? 'ring-2 ring-[#F4A259]' : ''}`}
              style={{
                aspectRatio: state.tileRatio || '1',
                borderRadius: state.tileRadius ?? 3,
                background: tile.type === 'empty' ? s.chipBg : undefined,
                border: tile.type === 'empty' ? '1.5px dashed #ccc' : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
              <TileContent tile={tile.type === 'empty' ? null : tile} style={s} />
            </div>
          ))}
        </div>
        <button onClick={addRow}
          className="w-[calc(100%-24px)] mx-3 mt-1 mb-24 py-3 border-[1.5px] border-dashed rounded-[12px] text-sm"
          style={{ borderColor: adjustColor(s.bg, -30), color: adjustColor(s.bg, -60), background: 'transparent' }}>
          + 한 줄 추가
        </button>
      </div>

      {/* Bottom Tab Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-black border-t border-[#dcdcdc] dark:border-[#2a2a2a] flex justify-around py-1.5 z-40" style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
        {[
          { id: 'add', icon: '➕', label: '추가' },
          { id: 'style', icon: '🎨', label: '스타일' },
          { id: 'header', icon: '👤', label: '헤더' },
          { id: 'tile', icon: '⊞', label: '타일' },
        ].map(tab => (
          <button key={tab.id} onClick={() => setSheet(tab.id)}
            className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-[12px] transition-all ${sheet === tab.id ? 'text-[#F4A259]' : 'text-[#8a8a8a]'}`}>
            <span className="text-lg">{tab.icon}</span>
            <span className="text-[9px] font-bold">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Sheet Overlay */}
      {sheet && <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setSheet(null)} />}

      {/* Sheets */}
      <MobileSheet open={sheet === 'add'} onClose={() => setSheet(null)} title="타일 추가">
        <PickerPanel projects={projects} categories={categories} s={s}
          onTap={(tile) => { addTile(tile); setSheet(null) }}
          onUpload={async (file, type) => {
            const result = await uploadFile(file, type)
            if (result) { addTile({ id: makeId(), type, ...result }); setSheet(null) }
          }}
        />
      </MobileSheet>

      <MobileSheet open={sheet === 'style'} onClose={() => setSheet(null)} title="스타일">
        <SheetStyle state={state} update={update} s={s} />
      </MobileSheet>

      <MobileSheet open={sheet === 'header'} onClose={() => setSheet(null)} title="헤더 편집">
        <SheetHeader state={state} update={update} />
      </MobileSheet>

      <MobileSheet open={sheet === 'tile'} onClose={() => setSheet(null)} title="타일 설정">
        <SheetTile state={state} update={update} selectedTileId={selectedTileId} removeTile={removeTile} tiles={tiles} updateTile={updateTile} />
      </MobileSheet>
    </div>
  )
}

// ══════════════════════════════════════
// ██ SUB-COMPONENTS
// ══════════════════════════════════════

function PhoneProfile({ state, s }) {
  const frameClass = {
    circle: 'rounded-full',
    rounded: 'rounded-[18px]',
    square: 'rounded-[6px]',
    hexagon: 'rounded-full',
  }[state.profileFrame] || 'rounded-full'

  const hexStyle = state.profileFrame === 'hexagon'
    ? { clipPath: 'polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)' }
    : {}

  return (
    <div className="flex flex-col items-center py-4 px-4">
      <div className="relative mb-2.5">
        <img
          src={state.profilePhotoUrl || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop&crop=face'}
          className={`w-20 h-20 object-cover ${frameClass}`}
          style={{ border: state.profileFrame !== 'hexagon' ? `3px solid ${s.accent}` : 'none', ...hexStyle, transition: 'all .3s' }}
          alt=""
        />
      </div>
      <div className="text-[17px] font-extrabold text-center" style={{ color: s.text, transition: 'color .3s' }}>
        {state.profileName || '이름'}
      </div>
      {state.showRole && state.profileRole && (
        <div className="text-[11px] mt-0.5 text-center" style={{ color: s.textSub }}>{state.profileRole}</div>
      )}
      <div className="flex gap-1.5 mt-2 flex-wrap justify-center">
        {state.showEmail && state.contactEmail && (
          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: s.chipBg, color: s.textSub, transition: 'all .3s' }}>
            ✉ {state.contactEmail}
          </span>
        )}
        {state.showPhone && state.contactPhone && (
          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: s.chipBg, color: s.textSub, transition: 'all .3s' }}>
            📱 {state.contactPhone}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Desktop Ribbon Sections ──
function RibbonSection({ label, children }) {
  return (
    <div className="flex items-center gap-1.5 px-3 border-r border-[#ececec] dark:border-[#2a2a2a] last:border-r-0">
      <span className="text-[8px] font-bold text-[#8a8a8a] uppercase tracking-wider" style={{ writingMode: 'vertical-rl' }}>{label}</span>
      {children}
    </div>
  )
}

function RibbonStyle({ state, update, s, userDoc }) {
  return (
    <>
      <RibbonSection label="주소">
        <span className="text-[9px] text-[#8a8a8a]">assifolio.com/l/</span>
        <input value={state.slug} onChange={e => update('slug', e.target.value.replace(/[^a-z0-9-]/g, ''))}
          className="bg-[#f5f5f5] dark:bg-[#1f1f1f] border border-[#dcdcdc] dark:border-[#333] rounded-[8px] px-1.5 py-0.5 text-[10px] text-[#181818] dark:text-white outline-none w-20 focus:border-[#F4A259]" />
      </RibbonSection>
      <RibbonSection label="테마">
        <div className="flex gap-1">
          {Object.keys(THEMES).map(t => (
            <button key={t} onClick={() => {
              const th = THEMES[t]
              update('backgroundColor', th.bg)
              update('textColor', th.text)
              update('accentColor', th.accent)
            }}
              className={`px-2 py-0.5 rounded-full text-[9px] font-semibold border transition-all
                ${state.backgroundColor === THEMES[t].bg
                  ? 'border-[#F4A259] text-[#F4A259]'
                  : 'border-[#dcdcdc] dark:border-[#333] text-[#8a8a8a] hover:border-[#F4A259]/50'
                }`}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </RibbonSection>
      <RibbonSection label="컬러">
        {[['배경', 'backgroundColor'], ['텍스트', 'textColor'], ['강조', 'accentColor']].map(([lbl, key]) => (
          <div key={key} className="flex items-center gap-1">
            <span className="text-[9px] text-[#8a8a8a]">{lbl}</span>
            <input type="color" value={state[key]} onChange={e => update(key, e.target.value)}
              className="w-5 h-5 rounded border-none cursor-pointer" style={{ background: 'none', padding: 0 }} />
          </div>
        ))}
      </RibbonSection>
      <RibbonSection label="프레임">
        <div className="flex gap-1">
          {['circle', 'rounded', 'square', 'hexagon'].map(f => (
            <button key={f} onClick={() => update('profileFrame', f)}
              className={`w-7 h-7 rounded-[8px] border flex items-center justify-center overflow-hidden transition-all
                ${state.profileFrame === f
                  ? 'border-[#F4A259]'
                  : 'border-[#dcdcdc] dark:border-[#333] hover:border-[#F4A259]/50'
                }`}
              style={{ background: 'var(--tw-bg-opacity, 1)' }}>
              <div className={`w-5 h-5 bg-[#ccc] dark:bg-[#555] ${f === 'circle' ? 'rounded-full' : f === 'rounded' ? 'rounded-[4px]' : f === 'hexagon' ? 'rounded-full' : 'rounded-[1px]'}`}
                style={f === 'hexagon' ? { clipPath: 'polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)' } : {}} />
            </button>
          ))}
        </div>
      </RibbonSection>
    </>
  )
}

function RibbonHeader({ state, update }) {
  const inputCls = "bg-[#f5f5f5] dark:bg-[#1f1f1f] border border-[#dcdcdc] dark:border-[#333] rounded-[8px] px-1.5 py-0.5 text-[10px] text-[#181818] dark:text-white outline-none focus:border-[#F4A259]"
  return (
    <>
      <RibbonSection label="정보">
        <input value={state.profileName} onChange={e => update('profileName', e.target.value)}
          placeholder="이름" className={`${inputCls} w-16`} />
        <input value={state.profileRole} onChange={e => update('profileRole', e.target.value)}
          placeholder="직함" className={`${inputCls} w-28`} />
        <input value={state.contactEmail} onChange={e => update('contactEmail', e.target.value)}
          placeholder="이메일" className={`${inputCls} w-28`} />
        <input value={state.contactPhone} onChange={e => update('contactPhone', e.target.value)}
          placeholder="전화번호" className={`${inputCls} w-24`} />
      </RibbonSection>
      <RibbonSection label="표시">
        {[['이메일', 'showEmail'], ['전화', 'showPhone'], ['직함', 'showRole'], ['소개', 'showBio']].map(([lbl, key]) => (
          <label key={key} className="flex items-center gap-1 cursor-pointer">
            <span className="text-[9px] text-[#8a8a8a]">{lbl}</span>
            <div onClick={() => update(key, !state[key])}
              className={`w-7 h-3.5 rounded-full relative transition-all cursor-pointer ${state[key] ? 'bg-[#F4A259]' : 'bg-[#dcdcdc] dark:bg-[#333]'}`}>
              <div className={`absolute top-[2px] w-[10px] h-[10px] rounded-full bg-white transition-all ${state[key] ? 'left-[14px]' : 'left-[2px]'}`} />
            </div>
          </label>
        ))}
      </RibbonSection>
    </>
  )
}

function RibbonTile({ state, update, selectedTileId, removeTile, tiles, updateTile }) {
  const selectedTile = tiles.find(t => t.id === selectedTileId)
  return (
    <>
      <RibbonSection label="비율">
        <div className="flex gap-1">
          {[['1', '1:1'], ['4/5', '4:5'], ['3/2', '3:2']].map(([v, lbl]) => (
            <button key={v} onClick={() => update('tileRatio', v)}
              className={`px-2 py-0.5 rounded-full text-[9px] font-semibold border transition-all
                ${state.tileRatio === v
                  ? 'border-[#F4A259] text-[#F4A259]'
                  : 'border-[#dcdcdc] dark:border-[#333] text-[#8a8a8a]'
                }`}>
              {lbl}
            </button>
          ))}
        </div>
      </RibbonSection>
      <RibbonSection label="열">
        <div className="flex gap-1">
          {[2, 3, 4].map(n => (
            <button key={n} onClick={() => update('columns', n)}
              className={`px-2 py-0.5 rounded-full text-[9px] font-semibold border transition-all
                ${state.columns === n
                  ? 'border-[#F4A259] text-[#F4A259]'
                  : 'border-[#dcdcdc] dark:border-[#333] text-[#8a8a8a]'
                }`}>
              {n}
            </button>
          ))}
        </div>
      </RibbonSection>
      <RibbonSection label="간격">
        <input type="range" min={0} max={10} value={state.tileGap ?? 3} onChange={e => update('tileGap', +e.target.value)}
          className="w-16 accent-[#F4A259]" style={{ height: 3 }} />
        <span className="text-[8px] text-[#8a8a8a]">{state.tileGap ?? 3}px</span>
      </RibbonSection>
      <RibbonSection label="둥글기">
        <input type="range" min={0} max={100} value={state.tileRadius ?? 3} onChange={e => update('tileRadius', +e.target.value)}
          className="w-16 accent-[#F4A259]" style={{ height: 3 }} />
        <span className="text-[8px] text-[#8a8a8a]">{state.tileRadius ?? 3}{state.tileRadius >= 50 ? '(원형)' : 'px'}</span>
      </RibbonSection>
      <RibbonSection label="선택">
        {selectedTile && selectedTile.type !== 'empty' ? (
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-[#8a8a8a]">{selectedTile.type}</span>
            {(selectedTile.type === 'link') && (
              <input value={selectedTile.url || ''} onChange={e => updateTile(selectedTileId, { url: e.target.value })}
                placeholder="URL"
                className="bg-[#f5f5f5] dark:bg-[#1f1f1f] border border-[#dcdcdc] dark:border-[#333] rounded-[8px] px-1.5 py-0.5 text-[10px] text-[#181818] dark:text-white outline-none w-28 focus:border-[#F4A259]" />
            )}
            <button onClick={() => removeTile(selectedTileId)}
              className="px-2 py-0.5 rounded-[8px] text-[9px] font-semibold border border-[#dcdcdc] dark:border-[#333] text-[#8a8a8a] hover:border-red-500 hover:text-red-400 transition-all">
              삭제
            </button>
          </div>
        ) : (
          <span className="text-[9px] text-[#8a8a8a]">타일 클릭으로 선택</span>
        )}
      </RibbonSection>
    </>
  )
}

// ── Picker (shared desktop + mobile) ──
function PickerPanel({ projects, categories, s, onDragStart, onTap, onUpload }) {
  const [openSections, setOpenSections] = useState({ projects: true, categories: true, links: true, portfolio: false, media: false })
  const toggle = (key) => setOpenSections(prev => ({ ...prev, [key]: !prev[key] }))

  const makeProjectTile = (p) => ({
    id: makeId(), type: 'project', projectId: p.id, name: p.name,
    thumbnailUrl: p.thumbnailUrl || 'https://via.placeholder.com/200',
  })
  const makeCatTile = (c) => ({
    id: makeId(), type: 'category', category: c.name, count: c.count,
    color: ['#F4A259', '#5b8def', '#e1306c', '#4aa24a', '#9b59b6'][categories.indexOf(c) % 5],
  })
  const makeLinkTile = (service) => ({
    id: makeId(), type: 'link', service, label: service.charAt(0).toUpperCase() + service.slice(1), url: '',
  })
  const makeTmplTile = (tmpl) => ({
    id: makeId(), type: 'template', templateId: tmpl.id, label: tmpl.label, bgColor: tmpl.bg, isDark: tmpl.dark,
  })
  const makePortfolioTile = () => ({ id: makeId(), type: 'portfolio' })

  const Section = ({ title, sectionKey, children }) => (
    <div className="mb-0.5">
      <button onClick={() => toggle(sectionKey)}
        className="w-full flex items-center justify-between text-[10px] font-bold text-[#8a8a8a] uppercase tracking-wider px-2 py-2 hover:bg-[#ececec] dark:hover:bg-[#1f1f1f] rounded-[8px] transition-all">
        {title}
        <svg className={`w-3 h-3 transition-transform ${openSections[sectionKey] ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {openSections[sectionKey] && <div className="pb-1">{children}</div>}
    </div>
  )

  const Tile = ({ tile, children }) => (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'copy'; onDragStart?.(tile) }}
      onClick={() => onTap?.(tile)}
      className="aspect-square rounded-[8px] overflow-hidden cursor-pointer border-[1.5px] border-transparent hover:border-[#F4A259]/50 active:scale-95 active:opacity-70 transition-all relative">
      {children}
    </div>
  )

  return (
    <>
      <Section title="내 프로젝트" sectionKey="projects">
        <div className="grid grid-cols-3 gap-1 px-1">
          {(projects || []).filter(p => p.thumbnailUrl).slice(0, 12).map(p => {
            const tile = makeProjectTile(p)
            return (
              <Tile key={p.id} tile={tile}>
                <TileContent tile={tile} style={s} />
              </Tile>
            )
          })}
        </div>
      </Section>

      {categories.length > 0 && (
        <Section title="카테고리" sectionKey="categories">
          <div className="grid grid-cols-3 gap-1 px-1">
            {categories.map(c => {
              const tile = makeCatTile(c)
              return (
                <Tile key={c.name} tile={tile}>
                  <TileContent tile={tile} style={s} />
                </Tile>
              )
            })}
          </div>
          <p className="text-[8px] text-[#8a8a8a] text-center mt-1">포트폴리오 해당 카테고리로 이동</p>
        </Section>
      )}

      <Section title="링크 연결" sectionKey="links">
        <div className="grid grid-cols-3 gap-1 px-1">
          {Object.keys(SERVICE_ICONS).map(svc => {
            const tile = makeLinkTile(svc)
            return (
              <Tile key={svc} tile={tile}>
                <TileContent tile={tile} style={{ ...s, chipBg: '#f0f0f0', text: '#333' }} />
              </Tile>
            )
          })}
        </div>
      </Section>

      <Section title="포트폴리오" sectionKey="portfolio">
        <div className="grid grid-cols-3 gap-1 px-1">
          {TEMPLATES.map(tmpl => {
            const tile = makeTmplTile(tmpl)
            return (
              <Tile key={tmpl.id} tile={tile}>
                <TileContent tile={tile} style={s} />
              </Tile>
            )
          })}
          <Tile tile={makePortfolioTile()}>
            <TileContent tile={{ type: 'portfolio' }} style={s} />
          </Tile>
        </div>
      </Section>

      <Section title="미디어 업로드" sectionKey="media">
        <div className="grid grid-cols-2 gap-1 px-1">
          {[['image', '🖼', '사진', 'image/*'], ['video', '🎬', '영상', 'video/*']].map(([type, icon, label, accept]) => (
            <div key={type}
              onClick={() => {
                const input = document.createElement('input')
                input.type = 'file'; input.accept = accept
                input.onchange = () => { if (input.files[0]) onUpload?.(input.files[0], type) }
                input.click()
              }}
              className="aspect-[2/1] rounded-[10px] flex flex-col items-center justify-center gap-1 cursor-pointer bg-[#f5f5f5] dark:bg-[#1f1f1f] border border-dashed border-[#dcdcdc] dark:border-[#333] hover:border-[#F4A259] transition-all">
              <span className="text-xl opacity-50">{icon}</span>
              <span className="text-[9px] font-semibold text-[#8a8a8a]">{label}</span>
            </div>
          ))}
        </div>
      </Section>
    </>
  )
}

// ── Mobile Bottom Sheet ──
function MobileSheet({ open, onClose, title, children }) {
  return (
    <div
      className={`fixed bottom-0 left-0 right-0 bg-white dark:bg-black rounded-t-[20px] z-[51] flex flex-col transition-transform duration-300 ${open ? 'translate-y-0' : 'translate-y-full'}`}
      style={{ maxHeight: '75vh' }}>
      <div className="flex items-center justify-center pt-2"><div className="w-9 h-1 bg-[#dcdcdc] dark:bg-[#333] rounded-full" /></div>
      <div className="flex items-center justify-between px-4 py-2">
        <span className="text-sm font-bold text-[#181818] dark:text-white">{title}</span>
        <button onClick={onClose} className="text-[#8a8a8a] hover:text-[#181818] dark:hover:text-white text-lg transition-colors">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-5">{children}</div>
    </div>
  )
}

// ── Mobile Sheet Contents ──
function SheetStyle({ state, update, s }) {
  return (
    <>
      <div className="mb-4">
        <div className="text-[11px] font-bold text-[#8a8a8a] mb-2">테마</div>
        <div className="flex gap-1.5 flex-wrap">
          {Object.keys(THEMES).map(t => (
            <button key={t} onClick={() => {
              const th = THEMES[t]; update('backgroundColor', th.bg); update('textColor', th.text); update('accentColor', th.accent)
            }}
              className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all
                ${state.backgroundColor === THEMES[t].bg
                  ? 'border-[#F4A259] text-[#F4A259] bg-[#F4A259]/5'
                  : 'border-[#dcdcdc] dark:border-[#333] text-[#8a8a8a]'
                }`}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-4">
        <div className="text-[11px] font-bold text-[#8a8a8a] mb-2">컬러</div>
        {[['배경', 'backgroundColor'], ['텍스트', 'textColor'], ['강조', 'accentColor']].map(([lbl, key]) => (
          <div key={key} className="flex items-center gap-2 mb-2">
            <span className="text-[11px] text-[#8a8a8a] w-10">{lbl}</span>
            <input type="color" value={state[key]} onChange={e => update(key, e.target.value)}
              className="w-8 h-8 rounded-[8px] border-none cursor-pointer" style={{ background: 'none', padding: 0 }} />
          </div>
        ))}
      </div>
      <div className="mb-4">
        <div className="text-[11px] font-bold text-[#8a8a8a] mb-2">프로필 프레임</div>
        <div className="flex gap-2">
          {['circle', 'rounded', 'square', 'hexagon'].map(f => (
            <button key={f} onClick={() => update('profileFrame', f)}
              className={`w-10 h-10 rounded-[10px] border-2 flex items-center justify-center overflow-hidden transition-all
                ${state.profileFrame === f ? 'border-[#F4A259]' : 'border-[#dcdcdc] dark:border-[#333]'}`}>
              <div className={`w-7 h-7 bg-[#ccc] dark:bg-[#555] ${f === 'circle' ? 'rounded-full' : f === 'rounded' ? 'rounded-[6px]' : f === 'hexagon' ? 'rounded-full' : 'rounded-[2px]'}`}
                style={f === 'hexagon' ? { clipPath: 'polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)' } : {}} />
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="text-[11px] font-bold text-[#8a8a8a] mb-2">링크 주소</div>
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-[#8a8a8a]">assifolio.com/l/</span>
          <input value={state.slug} onChange={e => update('slug', e.target.value.replace(/[^a-z0-9-]/g, ''))}
            className="flex-1 bg-[#f5f5f5] dark:bg-[#1f1f1f] border border-[#dcdcdc] dark:border-[#333] rounded-[12px] px-2.5 py-2 text-[12px] text-[#181818] dark:text-white outline-none focus:border-[#F4A259]" />
        </div>
      </div>
    </>
  )
}

function SheetHeader({ state, update }) {
  const inputCls = "w-full bg-[#f5f5f5] dark:bg-[#1f1f1f] border border-[#dcdcdc] dark:border-[#333] rounded-[12px] px-2.5 py-2 text-[12px] text-[#181818] dark:text-white outline-none focus:border-[#F4A259] mb-1.5"
  return (
    <>
      <div className="mb-4">
        <div className="text-[11px] font-bold text-[#8a8a8a] mb-2">프로필 정보</div>
        {[['profileName', '이름'], ['profileRole', '직함'], ['contactEmail', '이메일'], ['contactPhone', '전화번호']].map(([key, ph]) => (
          <input key={key} value={state[key]} onChange={e => update(key, e.target.value)} placeholder={ph} className={inputCls} />
        ))}
        <textarea value={state.bio || ''} onChange={e => update('bio', e.target.value)} placeholder="소개글 (선택)"
          rows={2} className="w-full bg-[#f5f5f5] dark:bg-[#1f1f1f] border border-[#dcdcdc] dark:border-[#333] rounded-[12px] px-2.5 py-2 text-[12px] text-[#181818] dark:text-white outline-none focus:border-[#F4A259] resize-none" />
      </div>
      <div>
        <div className="text-[11px] font-bold text-[#8a8a8a] mb-2">표시 항목</div>
        {[['이메일', 'showEmail'], ['전화번호', 'showPhone'], ['직함', 'showRole'], ['소개글', 'showBio']].map(([lbl, key]) => (
          <div key={key} className="flex items-center justify-between py-1.5">
            <span className="text-[12px] text-[#6a6a6a] dark:text-[#b3b3b3]">{lbl}</span>
            <div onClick={() => update(key, !state[key])}
              className={`w-9 h-5 rounded-full relative transition-all cursor-pointer ${state[key] ? 'bg-[#F4A259]' : 'bg-[#dcdcdc] dark:bg-[#333]'}`}>
              <div className={`absolute top-[2px] w-4 h-4 rounded-full bg-white transition-all shadow-sm ${state[key] ? 'left-[18px]' : 'left-[2px]'}`} />
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function SheetTile({ state, update, selectedTileId, removeTile, tiles, updateTile }) {
  return (
    <>
      <div className="mb-4">
        <div className="text-[11px] font-bold text-[#8a8a8a] mb-2">비율</div>
        <div className="flex gap-1.5">
          {[['1', '1:1 정사각'], ['4/5', '4:5 세로'], ['3/2', '3:2 가로']].map(([v, lbl]) => (
            <button key={v} onClick={() => update('tileRatio', v)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all
                ${state.tileRatio === v
                  ? 'border-[#F4A259] text-[#F4A259]'
                  : 'border-[#dcdcdc] dark:border-[#333] text-[#8a8a8a]'
                }`}>
              {lbl}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-4">
        <div className="text-[11px] font-bold text-[#8a8a8a] mb-2">열 수</div>
        <div className="flex gap-1.5">
          {[2, 3, 4].map(n => (
            <button key={n} onClick={() => update('columns', n)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all
                ${state.columns === n
                  ? 'border-[#F4A259] text-[#F4A259]'
                  : 'border-[#dcdcdc] dark:border-[#333] text-[#8a8a8a]'
                }`}>
              {n}열
            </button>
          ))}
        </div>
      </div>
      <div className="mb-4">
        <div className="text-[11px] font-bold text-[#8a8a8a] mb-2">간격</div>
        <input type="range" min={0} max={10} value={state.tileGap ?? 3} onChange={e => update('tileGap', +e.target.value)}
          className="w-full accent-[#F4A259]" />
      </div>
      <div className="mb-4">
        <div className="text-[11px] font-bold text-[#8a8a8a] mb-2">둥글기 {state.tileRadius >= 50 && '(원형)'}</div>
        <input type="range" min={0} max={100} value={state.tileRadius ?? 3} onChange={e => update('tileRadius', +e.target.value)}
          className="w-full accent-[#F4A259]" />
      </div>
    </>
  )
}

// ── 유틸 ──
function adjustColor(hex, amount) {
  try {
    const num = parseInt(hex.replace('#', ''), 16)
    const r = Math.min(255, Math.max(0, (num >> 16) + amount))
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount))
    const b = Math.min(255, Math.max(0, (num & 0xff) + amount))
    return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`
  } catch { return '#f0f0f0' }
}
