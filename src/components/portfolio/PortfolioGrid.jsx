import { useState, useRef, useMemo, useCallback, useEffect, memo } from 'react'

// 이미지 로드 시 fade-in
function FadeImage({ src, alt = '', className = '', ...props }) {
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
        loading="lazy" decoding="async"
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
  mode = 'viewer',
  onLayoutChange,
  categoryFilter,
  onProjectClick,
  theme,
}) {
  const [dragId, setDragId] = useState(null)
  const [dropTarget, setDropTarget] = useState(null)  // { row, col, colSpan, rowSpan }
  const [resizing, setResizing] = useState(null)
  const [rowHeight, setRowHeight] = useState(200)
  const [colWidth, setColWidth] = useState(200)
  const dragRef = useRef(null)
  const containerRef = useRef(null)
  const resizeRef = useRef(null)

  const text = theme?.text || '#1A1A1A'
  const accent = theme?.accent || '#828DF8'
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
      setRowHeight(Math.round(cw * 2 / 3))
    }
    calc()
    const ro = new ResizeObserver(calc)
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [columns, gap])

  const getDefaultSpan = useCallback((id) => ({
    colSpan: featuredProjects.includes(id) ? Math.min(2, columns) : 1,
    rowSpan: 2,
  }), [featuredProjects, columns])

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
        const rowSpan = existing?.rowSpan || 2

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
      const rowSpan = existing?.rowSpan || 2
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
  }, [projectLayout, filtered, columns, getDefaultSpan, categoryFilter, featuredProjects])

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

  // ─── 드래그 핸들러 (그리드 레벨) ───
  const handleDragStart = (e, projectId) => {
    if (mode !== 'owner' || resizing) return
    setDragId(projectId)
    dragRef.current = projectId
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', projectId)
  }

  const handleGridDragOver = (e) => {
    if (mode !== 'owner' || !dragRef.current) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'

    const cell = getCellFromEvent(e)
    if (!cell) return

    const pos = activeLayout[dragRef.current]
    if (!pos) return

    // 타일 크기에 맞게 col 조정 (오른쪽 넘침 방지)
    const adjustedCol = Math.min(cell.col, columns - pos.colSpan)
    setDropTarget({ row: cell.row, col: adjustedCol, colSpan: pos.colSpan, rowSpan: pos.rowSpan })
  }

  const handleGridDrop = (e) => {
    if (mode !== 'owner' || !dragRef.current || !dropTarget) return
    e.preventDefault()

    const pid = dragRef.current
    const pos = layout[pid]
    if (!pos) { resetDrag(); return }

    const { row, col } = dropTarget
    const { colSpan, rowSpan } = pos

    // 충돌 체크
    const conflicting = new Set()
    for (let r = 0; r < rowSpan; r++)
      for (let c = 0; c < colSpan; c++) {
        const occ = cellMap[`${row + r}-${col + c}`]
        if (occ && occ !== pid) conflicting.add(occ)
      }

    const newLayout = { ...layout }
    if (conflicting.size === 1) {
      const otherId = [...conflicting][0]
      newLayout[otherId] = { ...layout[otherId], row: pos.row, col: pos.col }
      newLayout[pid] = { ...pos, row, col }
    } else if (conflicting.size === 0) {
      newLayout[pid] = { ...pos, row, col }
    } else {
      resetDrag(); return
    }

    onLayoutChange?.(newLayout)
    resetDrag()
  }

  const resetDrag = () => {
    setDragId(null)
    setDropTarget(null)
    dragRef.current = null
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
    // 썸네일: 작은 thumbUrl 우선 > 프로젝트 썸네일 > 첫 이미지 > Bunny 썸네일
    const rawThumb = firstVideo?.videoThumbnailUrl || null
    const bunnyThumb = rawThumb?.replace('vz-631122.b-cdn.net', 'vz-cd1dda72-832.b-cdn.net') || null
    const thumb = firstImage?.url || firstImage?.thumbUrl || project.thumbnailUrl || bunnyThumb || null
    const embedUrl = firstVideo?.embedUrl || null
    const isDragging = dragId === project.id
    const isResizing = resizing?.id === project.id

    return (
      <div
        key={project.id}
        draggable={mode === 'owner' && !resizing}
        onDragStart={e => handleDragStart(e, project.id)}
        onDragEnd={resetDrag}
        onClick={() => !resizing && onProjectClick?.(project)}
        className={`relative group cursor-pointer transition-all overflow-hidden
          ${isDragging ? 'opacity-20 scale-95' : ''}
          ${isResizing ? 'ring-2 ring-[#828DF8] z-20' : ''}
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
            className="absolute inset-0 w-full h-full object-cover" />
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-300 flex items-end opacity-0 group-hover:opacity-100">
          <div className="w-full p-4">
            <p className="text-white text-sm font-medium tracking-wide uppercase">{project.name}</p>
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
          <div className="absolute top-2 left-2 opacity-60 md:opacity-0 md:group-hover:opacity-100 transition-opacity z-10">
            <div className="w-6 h-6 bg-white/80 rounded-full flex items-center justify-center shadow">
              <svg className="w-3.5 h-3.5 text-gray-600" viewBox="0 0 24 24" fill="currentColor">
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
            onPointerDown={e => handleResizeStart(e, project.id)}>
            <div className="w-6 h-6 bg-white/80 rounded-full flex items-center justify-center shadow">
              <svg className="w-3 h-3 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
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

  return (
    <div className="w-full mx-auto" style={{ padding: `0 ${pad}px` }}>
      <div
        ref={containerRef}
        onDragOver={handleGridDragOver}
        onDrop={handleGridDrop}
        onDragLeave={() => setDropTarget(null)}
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gridAutoRows: `${rowHeight}px`,
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
                  ? 'border-2 border-dashed border-[#828DF8] bg-[#828DF8]/10'
                  : 'border border-dashed border-gray-200/60'
                }
              `}
            />
          )
        })}

        {/* 드롭 가이드: 점유된 셀 위에도 오버레이 표시 */}
        {dropTarget && (
          <div
            className="border-2 border-[#828DF8] bg-[#828DF8]/15 pointer-events-none z-10"
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
