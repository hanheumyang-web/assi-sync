import { useState, useRef, useMemo, useCallback, useEffect, memo } from 'react'

// 이미지 로드 시 fade-in
function FadeImage({ src, alt = '', className = '', eager = false, ...props }) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  if (error || !src) return null
  return (
    <>
      {!loaded && (
        <div className={`${className} animate-pulse`} style={{ background: 'linear-gradient(90deg, #e5e5e5 25%, #f0f0f0 50%, #e5e5e5 75%)', backgroundSize: '200% 100%' }} />
      )}
      <img
        src={src} alt={alt} {...props}
        className={`${className} transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        loading={eager ? 'eager' : 'lazy'}
        fetchpriority={eager ? 'high' : 'auto'}
        decoding="async"
      />
    </>
  )
}

/**
 * Portfolio grid — Blokus-style board with resizable tiles
 * 드래그: 그리드 컨테이너 레벨에서 마우스 좌표 → 셀 계산
 * 가이드: 드래그 중 타일 크기만큼 하이라이트
 */
export default function PortfolioGrid({
  projects,
  projectAssets,
  columns = 3,
  featuredProjects = [],
  projectLayout,
  photoGap,
  pagePadding,
  borderRadius = 12,
  rowAspectRatio = 0.667,
  mode = 'viewer',
  onLayoutChange,
  categoryFilter,
  onProjectClick,
  theme,
  template,
}) {
  const [dragId, setDragId] = useState(null)
  const [dropTarget, setDropTarget] = useState(null)  // { row, col, colSpan, rowSpan }
  const [resizing, setResizing] = useState(null)
  const [rowHeight, setRowHeight] = useState(200)
  const [colWidth, setColWidth] = useState(200)
  const dragRef = useRef(null)
  const containerRef = useRef(null)
  const resizeRef = useRef(null)
  const dropTargetRef = useRef(null)
  const hasDraggedRef = useRef(false)

  const text = theme?.text || '#1A1A1A'
  const accent = theme?.accent || '#F4A259'
  const gap = photoGap ?? 8
  const pad = pagePadding ?? 48

  const filtered = useMemo(() => categoryFilter
    ? projects.filter(p => p.category === categoryFilter)
    : projects, [projects, categoryFilter])

  // 컨테이너 크기 → 행/열 높이 계산
  useEffect(() => {
    if (!containerRef.current) return
    const calc = () => {
      const w = containerRef.current.clientWidth
      const cw = (w - (columns - 1) * gap) / columns
      setColWidth(cw)
      setRowHeight(Math.round(cw * rowAspectRatio))
    }
    calc()
    const ro = new ResizeObserver(calc)
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [columns, gap, rowAspectRatio])

  // rowAspectRatio 기반으로 적절한 기본 rowSpan 계산
  // 목표: 타일의 시각적 세로/가로 비율이 항상 0.8~1.5 사이에 있도록
  // tileRatio = rowAspectRatio * rowSpan (타일 높이/너비)
  const defaultRowSpan = Math.max(1, Math.ceil(1 / rowAspectRatio - 0.1))

  // 저장된 rowSpan도 현재 비율에 맞게 clamp
  const clampRowSpan = useCallback((saved) => {
    if (!saved) return defaultRowSpan
    // 시각적 비율 = rowAspectRatio * rowSpan — 0.4 ~ 3.0 범위로 제한
    const visualRatio = rowAspectRatio * saved
    if (visualRatio > 3.0) return Math.max(1, Math.floor(3.0 / rowAspectRatio))
    if (visualRatio < 0.4) return Math.ceil(0.4 / rowAspectRatio)
    return saved
  }, [rowAspectRatio, defaultRowSpan])

  const getDefaultSpan = useCallback((id) => ({
    colSpan: featuredProjects.includes(id) ? Math.min(2, columns) : 1,
    rowSpan: defaultRowSpan,
  }), [featuredProjects, columns, defaultRowSpan])

  // 레이아웃 계산 — 항상 bin-packing으로 겹침 방지
  const layout = useMemo(() => {
    const auto = {}
    const occupied = new Set()

    // 저장된 레이아웃이 있고 필터 안 걸렸으면, 저장된 순서대로 배치 (겹침 방지)
    if (projectLayout && Object.keys(projectLayout).length > 0 && !categoryFilter) {
      // 저장된 row 순서대로 정렬해서 배치
      const sorted = [...filtered].sort((a, b) => {
        const pa = projectLayout[a.id]
        const pb = projectLayout[b.id]
        if (!pa && !pb) return 0
        if (!pa) return 1
        if (!pb) return -1
        return pa.row !== pb.row ? pa.row - pb.row : pa.col - pb.col
      })

      for (const p of sorted) {
        const existing = projectLayout[p.id]
        const colSpan = Math.min(columns, existing?.colSpan || existing?.span || (featuredProjects.includes(p.id) ? Math.min(2, columns) : 1))
        const rowSpan = clampRowSpan(existing?.rowSpan)

        // 저장된 위치가 유효한지 (겹침 없는지) 확인
        let placed = false
        if (existing && existing.row !== undefined && existing.col !== undefined) {
          const r = existing.row
          const c = Math.min(existing.col, columns - colSpan)
          let ok = true
          for (let dr = 0; dr < rowSpan && ok; dr++)
            for (let dc = 0; dc < colSpan && ok; dc++)
              if (occupied.has(`${r + dr}-${c + dc}`)) ok = false
          if (ok) {
            auto[p.id] = { row: r, col: c, colSpan, rowSpan }
            for (let dr = 0; dr < rowSpan; dr++)
              for (let dc = 0; dc < colSpan; dc++)
                occupied.add(`${r + dr}-${c + dc}`)
            placed = true
          }
        }

        // 저장된 위치가 겹치면 원래 row 근처에서 빈 자리 찾기 (위로 안 튀게)
        if (!placed) {
          const startRow = existing?.row || 0
          for (let r = startRow; !placed; r++) {
            for (let c = 0; c <= columns - colSpan; c++) {
              let ok = true
              for (let dr = 0; dr < rowSpan && ok; dr++)
                for (let dc = 0; dc < colSpan && ok; dc++)
                  if (occupied.has(`${r + dr}-${c + dc}`)) ok = false
              if (ok) {
                auto[p.id] = { row: r, col: c, colSpan, rowSpan }
                for (let dr = 0; dr < rowSpan; dr++)
                  for (let dc = 0; dc < colSpan; dc++)
                    occupied.add(`${r + dr}-${c + dc}`)
                placed = true
                break
              }
            }
          }
        }
      }
      return auto
    }

    // 카테고리 필터 시 또는 레이아웃 없을 때: bin-packing
    for (const p of filtered) {
      const existing = projectLayout?.[p.id]
      const colSpan = Math.min(columns, existing?.colSpan || existing?.span || (featuredProjects.includes(p.id) ? Math.min(2, columns) : 1))
      const rowSpan = clampRowSpan(existing?.rowSpan)
      let placed = false
      for (let r = 0; !placed; r++) {
        for (let c = 0; c <= columns - colSpan; c++) {
          let ok = true
          for (let dr = 0; dr < rowSpan && ok; dr++)
            for (let dc = 0; dc < colSpan && ok; dc++)
              if (occupied.has(`${r + dr}-${c + dc}`)) ok = false
          if (ok) {
            auto[p.id] = { row: r, col: c, colSpan, rowSpan }
            for (let dr = 0; dr < rowSpan; dr++)
              for (let dc = 0; dc < colSpan; dc++)
                occupied.add(`${r + dr}-${c + dc}`)
            placed = true
            break
          }
        }
      }
    }
    return auto
  }, [projectLayout, filtered, columns, getDefaultSpan, clampRowSpan, categoryFilter, featuredProjects])

  // 리사이즈 중 임시 레이아웃
  const activeLayout = useMemo(() => {
    if (!resizing) return layout
    const pos = layout[resizing.id]
    return { ...layout, [resizing.id]: {
      ...pos,
      col: resizing.col !== undefined ? resizing.col : pos.col,
      colSpan: resizing.colSpan, rowSpan: resizing.rowSpan,
    } }
  }, [layout, resizing])

  // 그리드 크기
  const maxSubRow = useMemo(() =>
    Object.values(activeLayout).reduce((max, l) => Math.max(max, l.row + l.rowSpan - 1), -1)
  , [activeLayout])
  const totalSubRows = maxSubRow + 1 + (mode === 'owner' ? 4 : 0)

  // 점유 셀 맵
  const cellMap = useMemo(() => {
    const map = {}
    for (const [id, pos] of Object.entries(activeLayout)) {
      for (let r = 0; r < pos.rowSpan; r++)
        for (let c = 0; c < pos.colSpan; c++)
          map[`${pos.row + r}-${pos.col + c}`] = id
    }
    return map
  }, [activeLayout])

  // ─── 마우스 좌표 → 셀 계산 ───
  const getCellFromEvent = useCallback((e) => {
    if (!containerRef.current) return null
    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const cellW = colWidth + gap
    const cellH = rowHeight + gap
    const col = Math.max(0, Math.min(columns - 1, Math.floor(x / cellW)))
    const row = Math.max(0, Math.floor(y / cellH))
    return { row, col }
  }, [colWidth, rowHeight, gap, columns])

  // ─── 드래그 핸들러 (Pointer Events — 터치+마우스 모두 지원) ───
  const handleDragPointerDown = (e, projectId) => {
    if (mode !== 'owner' || resizing) return
    e.stopPropagation()
    e.preventDefault()

    const pos = layout[projectId]
    if (!pos) return

    setDragId(projectId)
    const layoutSnap = { ...layout }
    const cellMapSnap = { ...cellMap }
    dragRef.current = projectId
    dropTargetRef.current = null
    hasDraggedRef.current = false
    const startX = e.clientX, startY = e.clientY

    const handleMove = (me) => {
      if (!dragRef.current || !containerRef.current) return

      // 5px 이상 움직여야 드래그 시작
      if (!hasDraggedRef.current) {
        if (Math.abs(me.clientX - startX) > 5 || Math.abs(me.clientY - startY) > 5)
          hasDraggedRef.current = true
        else return
      }

      const cell = getCellFromEvent(me)
      if (!cell) return

      const dragPos = layoutSnap[dragRef.current]
      if (!dragPos) return

      const adjustedCol = Math.min(cell.col, columns - dragPos.colSpan)
      const target = { row: cell.row, col: adjustedCol, colSpan: dragPos.colSpan, rowSpan: dragPos.rowSpan }
      dropTargetRef.current = target
      setDropTarget(target)
    }

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)

      const target = dropTargetRef.current

      if (dragRef.current && target && hasDraggedRef.current) {
        const pid = dragRef.current
        const snapPos = layoutSnap[pid]
        if (snapPos) {
          const { row, col } = target
          const { colSpan, rowSpan } = snapPos

          // 드래그한 타일 우선 배치 → 나머지 리팩
          const newLayout = {}
          const occ = new Set()

          // 1) 드래그 타일을 목표 위치에 먼저 배치
          newLayout[pid] = { row, col, colSpan, rowSpan }
          for (let dr = 0; dr < rowSpan; dr++)
            for (let dc = 0; dc < colSpan; dc++)
              occ.add(`${row + dr}-${col + dc}`)

          // 2) 나머지 타일: 큰 타일 먼저 배치 → 작은 타일이 빈자리 채움
          const rest = Object.entries(layoutSnap).filter(([id]) => id !== pid)
          const largeTiles = rest.filter(([, p]) => (p.colSpan || 1) > 1)
            .sort(([, a], [, b]) => (a.row - b.row) || (a.col - b.col))
          const smallTiles = rest.filter(([, p]) => (p.colSpan || 1) <= 1)
            .sort(([, a], [, b]) => (a.row - b.row) || (a.col - b.col))
          const others = [...largeTiles, ...smallTiles]

          for (const [id, pos] of others) {
            const cs = pos.colSpan || 1, rs = pos.rowSpan || 2
            let placed = false
            const oR = pos.row ?? 0, oC = Math.min(pos.col ?? 0, columns - cs)
            let ok = true
            for (let dr = 0; dr < rs && ok; dr++)
              for (let dc = 0; dc < cs && ok; dc++)
                if (occ.has(`${oR + dr}-${oC + dc}`)) ok = false
            if (ok) {
              newLayout[id] = { row: oR, col: oC, colSpan: cs, rowSpan: rs }
              for (let dr = 0; dr < rs; dr++)
                for (let dc = 0; dc < cs; dc++)
                  occ.add(`${oR + dr}-${oC + dc}`)
              placed = true
            }
            if (!placed) {
              for (let r2 = 0; !placed; r2++)
                for (let c2 = 0; c2 <= columns - cs; c2++) {
                  ok = true
                  for (let dr = 0; dr < rs && ok; dr++)
                    for (let dc = 0; dc < cs && ok; dc++)
                      if (occ.has(`${r2 + dr}-${c2 + dc}`)) ok = false
                  if (ok) {
                    newLayout[id] = { row: r2, col: c2, colSpan: cs, rowSpan: rs }
                    for (let dr = 0; dr < rs; dr++)
                      for (let dc = 0; dc < cs; dc++)
                        occ.add(`${r2 + dr}-${c2 + dc}`)
                    placed = true
                    break
                  }
                }
            }
          }

          onLayoutChange?.(newLayout)
        }
      }

      setDragId(null)
      setDropTarget(null)
      dragRef.current = null
      dropTargetRef.current = null

      // click 이벤트가 pointerup 직후 발생하므로 잠시 유지
      if (hasDraggedRef.current) {
        setTimeout(() => { hasDraggedRef.current = false }, 100)
      }
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
  }

  // ─── 리사이즈 ───
  const handleResizeStart = (e, projectId) => {
    e.stopPropagation()
    e.preventDefault()
    const pos = layout[projectId]
    if (!pos) return

    resizeRef.current = {
      id: projectId,
      startX: e.clientX, startY: e.clientY,
      origColSpan: pos.colSpan, origRowSpan: pos.rowSpan,
      col: pos.col,
      colW: colWidth + gap, rowH: rowHeight + gap,
    }

    const handleMove = (me) => {
      const r = resizeRef.current
      if (!r) return
      const dx = me.clientX - r.startX
      const dy = me.clientY - r.startY
      const newCS = Math.max(1, Math.min(columns, Math.round(r.origColSpan + dx / r.colW)))
      const newRS = Math.max(1, Math.min(4, Math.round(r.origRowSpan + dy / r.rowH)))
      const adjustedCol = Math.min(r.col, columns - newCS)
      setResizing({ id: projectId, colSpan: newCS, rowSpan: newRS, col: adjustedCol })
    }

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      setResizing(prev => {
        if (prev) {
          const pos2 = layout[prev.id]
          const newLayout = {
            ...layout,
            [prev.id]: { ...pos2, col: prev.col ?? pos2.col, colSpan: prev.colSpan, rowSpan: prev.rowSpan }
          }
          onLayoutChange?.(newLayout)
        }
        return null
      })
      resizeRef.current = null
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
  }

  // ─── 프로젝트 카드 ───
  function renderProjectCard(project, pos) {
    const assets = projectAssets[project.id] || []
    const imageCount = assets.length
    const isVideoAsset = (a) => a.isVideo || a.fileType?.startsWith('video/') || a.contentType?.startsWith('video/') || a.videoHost === 'bunny' || a.embedUrl
    const firstImage = assets.find(a => !isVideoAsset(a) && (a.url || a.thumbnailUrl))
    const firstVideo = assets.find(a => isVideoAsset(a))
    // 썸네일: 프로젝트 기본 썸네일(가장 빨리 로드됨) > 작은 thumbUrl > 원본 url > Bunny 썸네일
    const rawThumb = firstVideo?.videoThumbnailUrl || (firstVideo?.bunnyVideoId ? `https://vz-cd1dda72-832.b-cdn.net/${firstVideo.bunnyVideoId}/thumbnail.jpg` : null)
    const bunnyThumb = rawThumb?.replace('vz-631122.b-cdn.net', 'vz-cd1dda72-832.b-cdn.net') || null
    const thumb = project.thumbnailUrl || firstImage?.thumbUrl || firstImage?.url || bunnyThumb || null
    const embedUrl = firstVideo?.embedUrl || null
    const isDragging = dragId === project.id
    const isResizing = resizing?.id === project.id

    return (
      <div
        key={project.id}
        onClick={() => !resizing && !hasDraggedRef.current && onProjectClick?.(project)}
        className={`relative group cursor-pointer transition-all overflow-hidden
          ${isDragging ? 'opacity-20 scale-95' : ''}
          ${isResizing ? 'ring-2 ring-[#F4A259] z-20' : ''}
          ${mode === 'owner' ? 'cursor-grab active:cursor-grabbing' : ''}
        `}
        style={{
          gridColumn: `${pos.col + 1} / span ${pos.colSpan}`,
          gridRow: `${pos.row + 1} / span ${pos.rowSpan}`,
          borderRadius: `${borderRadius}px`,
          ...(mode === 'owner' ? { WebkitUserSelect: 'none', userSelect: 'none' } : {}),
        }}
      >
        {/* 배경 레이어: 영상=다크, 일반=라이트 */}
        {firstVideo ? (
          <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900 flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-white/15 flex items-center justify-center mb-2">
              <svg className="w-5 h-5 text-white/80 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </div>
            <p className="text-white/50 text-[10px] tracking-[0.15em] uppercase font-medium">{project.name}</p>
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center"
            style={{ backgroundColor: text + '08' }}>
            <span className="text-xs font-light tracking-widest uppercase" style={{ color: text + '30' }}>
              {project.name}
            </span>
          </div>
        )}

        {/* 미디어 레이어 (로드 성공 시 배경 위를 덮음) */}
        {thumb && (
          <FadeImage src={thumb} alt="" draggable={false}
            eager={pos.row === 0}
            className={`absolute inset-0 w-full h-full object-cover ${
              mode === 'viewer' ? `${getImageEffectClass()} ${getHoverEffectClass()}` : ''
            }`} />
        )}

        {/* Hover overlay — variant based */}
        {mode === 'viewer' && hoverEffect === 'gradient-overlay' ? (
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-end">
            <div className="w-full p-4">
              <p className="text-white text-sm font-medium tracking-wide uppercase truncate">{project.name}</p>
              {project.category && (
                <span className="text-white/60 text-[10px] tracking-[0.15em] uppercase">{project.category}</span>
              )}
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-300 flex items-end opacity-0 group-hover:opacity-100">
            <div className="w-full p-4">
              <p className="text-white text-sm font-medium tracking-wide uppercase truncate">{project.name}</p>
              <div className="flex items-center gap-3 mt-1">
                {project.category && (
                  <span className="text-white/60 text-[10px] tracking-[0.15em] uppercase">{project.category}</span>
                )}
                {imageCount > 0 && (
                  <span className="text-white/40 text-[10px]">{imageCount} items</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Video icon */}
        {firstVideo && (
          <div className="absolute top-3 right-3 pointer-events-none opacity-60 group-hover:opacity-90 transition-opacity">
            <svg className="w-4 h-4 text-white drop-shadow" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </div>
        )}

        {/* Owner: drag handle */}
        {mode === 'owner' && (
          <div
            className="absolute top-2 left-2 opacity-60 md:opacity-0 md:group-hover:opacity-100 transition-opacity z-10 cursor-grab active:cursor-grabbing"
            style={{ touchAction: 'none' }}
            onPointerDown={e => handleDragPointerDown(e, project.id)}
            onClick={e => e.stopPropagation()}
          >
            <div className="w-8 h-8 bg-white/90 rounded-full flex items-center justify-center shadow-lg">
              <svg className="w-4 h-4 text-gray-600" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="9" cy="5" r="1.5" /><circle cx="15" cy="5" r="1.5" />
                <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
                <circle cx="9" cy="19" r="1.5" /><circle cx="15" cy="19" r="1.5" />
              </svg>
            </div>
          </div>
        )}

        {/* Owner: resize handle */}
        {mode === 'owner' && (
          <div className="absolute bottom-1 right-1 opacity-60 md:opacity-0 md:group-hover:opacity-100 transition-opacity z-10 cursor-nwse-resize"
            style={{ touchAction: 'none' }}
            onPointerDown={e => handleResizeStart(e, project.id)}
            onClick={e => e.stopPropagation()}>
            <div className="w-8 h-8 bg-white/90 rounded-full flex items-center justify-center shadow-lg">
              <svg className="w-3.5 h-3.5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="18" y1="12" x2="12" y2="18" />
              </svg>
            </div>
          </div>
        )}

        {isResizing && (
          <div className="absolute top-2 right-2 bg-black/70 text-white text-[10px] font-bold px-2 py-1 rounded-full z-20">
            {resizing.colSpan}×{resizing.rowSpan}
          </div>
        )}
      </div>
    )
  }

  // ─── 빈 셀 ───
  const emptyCells = useMemo(() => {
    if (mode !== 'owner') return []
    const cells = []
    for (let r = 0; r < totalSubRows; r++)
      for (let c = 0; c < columns; c++)
        if (!cellMap[`${r}-${c}`]) cells.push({ row: r, col: c })
    return cells
  }, [mode, totalSubRows, columns, cellMap])

  // ─── 드롭 가이드: 타일 크기만큼 하이라이트하는 셀 집합 ───
  const guideCells = useMemo(() => {
    if (!dropTarget) return new Set()
    const set = new Set()
    for (let r = 0; r < dropTarget.rowSpan; r++)
      for (let c = 0; c < dropTarget.colSpan; c++)
        set.add(`${dropTarget.row + r}-${dropTarget.col + c}`)
    return set
  }, [dropTarget])

  // ─── 뷰어: 빈 행 제거 ───
  const compactLayout = useMemo(() => {
    if (mode === 'owner') return activeLayout
    const usedSubRows = new Set()
    for (const pos of Object.values(activeLayout))
      for (let r = 0; r < pos.rowSpan; r++) usedSubRows.add(pos.row + r)
    const sorted = [...usedSubRows].sort((a, b) => a - b)
    const rowMap = {}
    sorted.forEach((r, i) => { rowMap[r] = i })
    const compact = {}
    for (const [id, pos] of Object.entries(activeLayout))
      compact[id] = { ...pos, row: rowMap[pos.row] ?? pos.row }
    return compact
  }, [activeLayout, mode])

  // ── Template-based viewer rendering ──
  const gridVariant = template?.gridVariant || 'masonry'
  const imageEffect = template?.imageEffect || 'none'
  const hoverEffect = template?.hoverEffect || 'overlay'

  // Image effect classes
  const getImageEffectClass = () => {
    if (imageEffect === 'grayscale') return 'grayscale group-hover:grayscale-0 transition-all duration-500'
    return ''
  }

  // Hover effect classes for viewer cards
  const getHoverEffectClass = () => {
    switch (hoverEffect) {
      case 'zoom': return 'group-hover:scale-105 transition-transform duration-700'
      case 'brightness': return 'group-hover:brightness-110 transition-all duration-500'
      case 'color-reveal': return 'grayscale group-hover:grayscale-0 transition-all duration-500'
      default: return ''
    }
  }

  // Viewer mode with special grid variants (casestudy, single, editorial)
  if (mode === 'viewer' && gridVariant !== 'masonry' && gridVariant !== 'bento') {
    const visibleProjects = filtered

    if (!visibleProjects.length) {
      return (
        <div className="text-center py-20">
          <p className="text-sm font-light tracking-widest uppercase" style={{ color: text + '30' }}>
            {categoryFilter ? 'No projects in this category' : 'No works yet'}
          </p>
        </div>
      )
    }

    // ── Case Study: alternating left/right cards ──
    if (gridVariant === 'casestudy') {
      return (
        <div style={{ padding: `0 ${pad}px` }} className="space-y-24 max-w-6xl mx-auto">
          {visibleProjects.map((project, idx) => {
            const assets = projectAssets[project.id] || []
            const thumb = project.thumbnailUrl || assets.find(a => !a.isVideo && a.url)?.url || null
            const isReverse = idx % 2 === 1
            return (
              <article key={project.id} onClick={() => onProjectClick?.(project)}
                className={`flex flex-col md:flex-row ${isReverse ? 'md:flex-row-reverse' : ''} gap-8 md:gap-12 items-center cursor-pointer group`}>
                <div className="w-full md:w-3/5 overflow-hidden" style={{ borderRadius: `${borderRadius}px` }}>
                  {thumb ? (
                    <FadeImage src={thumb} alt="" className={`w-full aspect-[4/3] object-cover ${getImageEffectClass()} ${getHoverEffectClass()}`} />
                  ) : (
                    <div className="w-full aspect-[4/3] flex items-center justify-center" style={{ backgroundColor: text + '08' }}>
                      <span className="text-xs font-light tracking-widest uppercase" style={{ color: text + '30' }}>{project.name}</span>
                    </div>
                  )}
                </div>
                <div className="w-full md:w-2/5">
                  {project.category && (
                    <p className="text-xs tracking-[0.2em] uppercase mb-3" style={{ color: accent }}>{project.category}</p>
                  )}
                  <h3 className="text-2xl md:text-3xl font-black tracking-tight mb-4 break-words" style={{ color: text }}>{project.name}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: text + '60' }}>{assets.length} images</p>
                </div>
              </article>
            )
          })}
        </div>
      )
    }

    // ── Single: cinematography style ──
    if (gridVariant === 'single') {
      return (
        <div style={{ padding: `0 ${pad}px` }} className="max-w-5xl mx-auto space-y-16">
          {visibleProjects.map((project, idx) => {
            const assets = projectAssets[project.id] || []
            const thumb = project.thumbnailUrl || assets.find(a => !a.isVideo && a.url)?.url || null
            return (
              <div key={project.id} onClick={() => onProjectClick?.(project)} className="cursor-pointer group">
                <div className="overflow-hidden shadow-2xl" style={{ borderRadius: `${borderRadius}px` }}>
                  {thumb ? (
                    <FadeImage src={thumb} alt=""
                      className={`w-full aspect-video object-cover ${getImageEffectClass()} group-hover:scale-105 group-hover:brightness-110 transition-all duration-1000`} />
                  ) : (
                    <div className="w-full aspect-video flex items-center justify-center" style={{ backgroundColor: text + '08' }}>
                      <span className="text-xs font-light tracking-widest uppercase" style={{ color: text + '30' }}>{project.name}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between mt-6">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xl font-bold truncate" style={{ color: text }}>{project.name}</h3>
                    <p className="text-sm mt-1 truncate" style={{ color: text + '60' }}>{project.category || ''}</p>
                  </div>
                  <span className="text-4xl font-light flex-shrink-0 ml-4" style={{ color: text + '15' }}>{String(idx + 1).padStart(2, '0')}</span>
                </div>
              </div>
            )
          })}
        </div>
      )
    }

    // ── Editorial: 2-column no-gap border grid ──
    if (gridVariant === 'editorial') {
      return (
        <div className="w-full mx-auto" style={{ padding: `0 ${pad}px` }}>
          <div className="grid grid-cols-1 md:grid-cols-2" style={{ borderTop: `1px solid ${text}10` }}>
            {visibleProjects.map(project => {
              const assets = projectAssets[project.id] || []
              const thumb = project.thumbnailUrl || assets.find(a => !a.isVideo && a.url)?.url || null
              return (
                <div key={project.id} onClick={() => onProjectClick?.(project)}
                  className="cursor-pointer group"
                  style={{ borderBottom: `1px solid ${text}10`, borderRight: `1px solid ${text}10`, padding: 0 }}>
                  <div className="overflow-hidden">
                    {thumb ? (
                      <FadeImage src={thumb} alt=""
                        className="w-full aspect-[4/3] object-cover grayscale group-hover:grayscale-0 transition-all duration-500" />
                    ) : (
                      <div className="w-full aspect-[4/3] flex items-center justify-center" style={{ backgroundColor: text + '08' }}>
                        <span className="text-xs font-light tracking-widest uppercase" style={{ color: text + '30' }}>{project.name}</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {!visibleProjects.length && (
            <div className="text-center py-20">
              <p className="text-sm font-light tracking-widest uppercase" style={{ color: text + '30' }}>
                {categoryFilter ? 'No projects in this category' : 'No works yet'}
              </p>
            </div>
          )}
        </div>
      )
    }
  }

  // ── Bento grid variant in viewer mode ──
  // Uses CSS grid with larger auto-rows for a bento-box effect
  const isBentoViewer = mode === 'viewer' && gridVariant === 'bento'
  const bentoRowHeight = isBentoViewer ? Math.max(rowHeight, 200) : rowHeight

  return (
    <div className="w-full mx-auto" style={{ padding: `0 ${pad}px` }}>
      <div
        ref={containerRef}
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gridAutoRows: `${isBentoViewer ? bentoRowHeight : rowHeight}px`,
          gap: `${gap}px`,
        }}
      >
        {/* 프로젝트 카드 */}
        {filtered.map(project => {
          const pos = mode === 'owner' ? activeLayout[project.id] : compactLayout[project.id]
          if (!pos) return null
          return renderProjectCard(project, pos)
        })}

        {/* 에디터: 빈 셀 (시각 표시 + 가이드) */}
        {mode === 'owner' && emptyCells.map(({ row, col }) => {
          const isGuide = guideCells.has(`${row}-${col}`)
          return (
            <div
              key={`e-${row}-${col}`}
              style={{ gridColumn: col + 1, gridRow: row + 1 }}
              className={`transition-all duration-100 pointer-events-none
                ${isGuide
                  ? 'border-2 border-dashed border-[#F4A259]'
                  : 'border border-dashed border-gray-200/60'
                }
              `}
            />
          )
        })}

        {/* 드롭 가이드: 점유된 셀 위에도 오버레이 표시 */}
        {dropTarget && (
          <div
            className="border-2 border-[#F4A259] pointer-events-none z-10"
            style={{
              gridColumn: `${dropTarget.col + 1} / span ${dropTarget.colSpan}`,
              gridRow: `${dropTarget.row + 1} / span ${dropTarget.rowSpan}`,
              borderRadius: `${borderRadius}px`,
            }}
          />
        )}
      </div>

      {!filtered.length && (
        <div className="text-center py-20">
          <p className="text-sm font-light tracking-widest uppercase" style={{ color: text + '30' }}>
            {categoryFilter ? 'No projects in this category' : 'No works yet'}
          </p>
        </div>
      )}
    </div>
  )
}
