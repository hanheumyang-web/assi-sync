/**
 * useCanvasInteraction.js — Canva-style 분산 이벤트 상태머신
 *
 * 핵심: 캔버스 레벨 onMouseDown 하나로 모든 인터랙션을 처리하던 방식 제거.
 * 각 DOM 요소(핸들, 요소 본체, 캔버스)에 직접 핸들러를 바인딩하여
 * DOM 이벤트 버블링으로 자연스럽게 우선순위 결정.
 *
 * 상태: IDLE → SELECTED → MOVING/RESIZING → SELECTED
 *                       → CROP_MODE → CROP_PANNING → CROP_MODE
 *                       → EDITING_TEXT
 */

import { useState, useRef, useCallback } from 'react'
import { computeCover, constrainCrop } from '../utils/templateMatcher'

const SNAP_DIST = 4 // mm

export default function useCanvasInteraction({
  pages, setPages, currentPageIdx, es, pw, ph, saveSnapshot,
}) {
  const [selectedElId, setSelectedElId] = useState(null)
  const [cropModeElId, setCropModeElId] = useState(null)
  const [editingTextId, setEditingTextId] = useState(null)
  const [snapLines, setSnapLines] = useState([])
  const [dragOverFrameId, setDragOverFrameId] = useState(null)

  const dragRef = useRef(null)
  const resizeRef = useRef(null)
  const cropDragRef = useRef(null)
  const pagesRef = useRef(pages)
  pagesRef.current = pages

  const [, forceUpdate] = useState(0)

  // ── 유틸 ──
  const getPage = () => pagesRef.current[currentPageIdx]
  const getEl = (id) => getPage()?.elements.find(e => e.id === id)

  const updateEl = useCallback((elId, upd) => {
    setPages(prev => prev.map((p, i) =>
      i === currentPageIdx ? { ...p, elements: p.elements.map(e => e.id === elId ? { ...e, ...upd } : e) } : p
    ))
  }, [currentPageIdx, setPages])

  const deleteEl = useCallback((elId) => {
    saveSnapshot()
    setPages(prev => prev.map((p, i) =>
      i === currentPageIdx ? { ...p, elements: p.elements.filter(e => e.id !== elId) } : p
    ))
    setSelectedElId(prev => prev === elId ? null : prev)
    setCropModeElId(prev => prev === elId ? null : prev)
  }, [currentPageIdx, setPages, saveSnapshot])

  // ── 스냅 가이드 ──
  const collectSnap = (excludeId) => {
    const xs = [0, pw / 2, pw], ys = [0, ph / 2, ph]
    for (const el of (getPage()?.elements || [])) {
      if (el.id === excludeId) continue
      xs.push(el.x, el.x + el.w / 2, el.x + el.w)
      ys.push(el.y, el.y + el.h / 2, el.y + el.h)
    }
    return { xs, ys }
  }
  const findSnap = (val, targets) => {
    let best = null, bestDist = SNAP_DIST
    for (const t of targets) {
      const d = Math.abs(val - t)
      if (d < bestDist) { bestDist = d; best = t }
    }
    return best
  }

  // ═══════════════════════════════════════
  // 핸들러: 캔버스 빈 영역 클릭 → 선택 해제
  // ═══════════════════════════════════════
  const handleCanvasMouseDown = useCallback((e) => {
    // 빈 영역만 (요소 클릭은 stopPropagation으로 여기 안 옴)
    setSelectedElId(null)
    setCropModeElId(null)
    setEditingTextId(null)
    setSnapLines([])
  }, [])

  // ═══════════════════════════════════════
  // 핸들러: 요소 본체 클릭 → 선택/이동/크롭패닝
  // ═══════════════════════════════════════
  const handleElementMouseDown = useCallback((e, el) => {
    e.stopPropagation()
    e.preventDefault()

    const rect = e.currentTarget.closest('[data-canvas]')?.getBoundingClientRect()
    if (!rect) return
    const mx = (e.clientX - rect.left) / es
    const my = (e.clientY - rect.top) / es

    // 크롭 모드 중이면 → 패닝
    if (cropModeElId === el.id && el.type === 'image') {
      const canvasDom = e.currentTarget.closest('[data-canvas]')
      cropDragRef.current = {
        elId: el.id, startMx: mx, startMy: my,
        origCropX: el.cropX || 0, origCropY: el.cropY || 0,
      }
      const onMove = (me) => {
        const r = canvasDom?.getBoundingClientRect()
        if (!r) return
        const cx = (me.clientX - r.left) / es
        const cy = (me.clientY - r.top) / es
        const cd = cropDragRef.current
        if (!cd) return
        const rawX = cd.origCropX + (cx - cd.startMx)
        const rawY = cd.origCropY + (cy - cd.startMy)
        const curEl = getEl(cd.elId)
        if (!curEl) return
        const { cropX, cropY } = constrainCrop(curEl.ratio, curEl.w, curEl.h, rawX, rawY, curEl.cropZoom || 1)
        const imgDoms = document.querySelectorAll(`#el-${cd.elId} img`)
        imgDoms.forEach(img => { img.style.left = (cropX * es) + 'px'; img.style.top = (cropY * es) + 'px' })
        cd._lastCropX = cropX; cd._lastCropY = cropY
      }
      const onUp = () => {
        const cd = cropDragRef.current
        if (cd?._lastCropX !== undefined) { saveSnapshot(); updateEl(cd.elId, { cropX: cd._lastCropX, cropY: cd._lastCropY }) }
        cropDragRef.current = null
        forceUpdate(n => n + 1)
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
      return
    }

    // 다른 요소 클릭 시 크롭 해제
    if (cropModeElId && cropModeElId !== el.id) setCropModeElId(null)

    setSelectedElId(el.id)
    setEditingTextId(null)

    // 이동 시작
    const canvasDom = e.currentTarget.closest('[data-canvas]')
    const snap = collectSnap(el.id)
    dragRef.current = { elId: el.id, startMx: mx, startMy: my, origX: el.x, origY: el.y }

    const onMove = (me) => {
      const r = canvasDom?.getBoundingClientRect()
      if (!r) return
      const cx = (me.clientX - r.left) / es
      const cy = (me.clientY - r.top) / es
      const d = dragRef.current
      if (!d) return
      const curEl = getEl(d.elId)
      if (!curEl) return

      let nx = d.origX + (cx - d.startMx)
      let ny = d.origY + (cy - d.startMy)
      nx = Math.max(0, Math.min(pw - curEl.w, nx))
      ny = Math.max(0, Math.min(ph - curEl.h, ny))

      const lines = []
      for (const edge of [
        { val: nx, t: snap.xs, apply: v => { nx = v }, axis: 'x' },
        { val: nx + curEl.w / 2, t: snap.xs, apply: v => { nx = v - curEl.w / 2 }, axis: 'x' },
        { val: nx + curEl.w, t: snap.xs, apply: v => { nx = v - curEl.w }, axis: 'x' },
        { val: ny, t: snap.ys, apply: v => { ny = v }, axis: 'y' },
        { val: ny + curEl.h / 2, t: snap.ys, apply: v => { ny = v - curEl.h / 2 }, axis: 'y' },
        { val: ny + curEl.h, t: snap.ys, apply: v => { ny = v - curEl.h }, axis: 'y' },
      ]) {
        const s = findSnap(edge.val, edge.t)
        if (s !== null) { edge.apply(s); lines.push({ axis: edge.axis, pos: s }) }
      }

      const dom = document.getElementById(`el-${d.elId}`)
      if (dom) { dom.style.left = (nx * es) + 'px'; dom.style.top = (ny * es) + 'px' }
      d._lastX = nx; d._lastY = ny
      setSnapLines(lines)
    }
    const onUp = () => {
      if (dragRef.current?._lastX !== undefined) {
        saveSnapshot()
        updateEl(dragRef.current.elId, { x: dragRef.current._lastX, y: dragRef.current._lastY })
      }
      dragRef.current = null
      setSnapLines([])
      forceUpdate(n => n + 1)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [es, pw, ph, cropModeElId, currentPageIdx, updateEl, saveSnapshot])

  // ═══════════════════════════════════════
  // 핸들러: 리사이즈 핸들 → 리사이즈
  // ═══════════════════════════════════════
  const handleHandleMouseDown = useCallback((e, el, handleId) => {
    e.stopPropagation()
    e.preventDefault()

    setCropModeElId(null)
    setSelectedElId(el.id)

    const canvasDom = e.currentTarget.closest('[data-canvas]')
    const rect = canvasDom?.getBoundingClientRect()
    if (!rect) return
    const mx = (e.clientX - rect.left) / es
    const my = (e.clientY - rect.top) / es
    const snap = collectSnap(el.id)

    resizeRef.current = {
      elId: el.id, handle: handleId,
      startMx: mx, startMy: my,
      origW: el.w, origH: el.h, origX: el.x, origY: el.y,
    }

    const onMove = (me) => {
      const r = canvasDom?.getBoundingClientRect()
      if (!r) return
      const cx = (me.clientX - r.left) / es
      const cy = (me.clientY - r.top) / es
      const rv = resizeRef.current
      if (!rv) return

      const dx = cx - rv.startMx, dy = cy - rv.startMy
      let nw = rv.origW, nh = rv.origH, nx = rv.origX, ny = rv.origY

      if (rv.handle.includes('e')) nw = Math.max(10, rv.origW + dx)
      if (rv.handle.includes('w')) { nw = Math.max(10, rv.origW - dx); nx = rv.origX + dx }
      if (rv.handle.includes('s')) nh = Math.max(10, rv.origH + dy)
      if (rv.handle.includes('n')) { nh = Math.max(10, rv.origH - dy); ny = rv.origY + dy }

      // 리사이즈 엣지 스냅
      const lines = []
      const edges = []
      if (rv.handle.includes('e')) edges.push({ val: nx + nw, t: snap.xs, apply: v => { nw = v - nx }, axis: 'x' })
      if (rv.handle.includes('w')) edges.push({ val: nx, t: snap.xs, apply: v => { nw += nx - v; nx = v }, axis: 'x' })
      if (rv.handle.includes('s')) edges.push({ val: ny + nh, t: snap.ys, apply: v => { nh = v - ny }, axis: 'y' })
      if (rv.handle.includes('n')) edges.push({ val: ny, t: snap.ys, apply: v => { nh += ny - v; ny = v }, axis: 'y' })
      for (const edge of edges) {
        const s = findSnap(edge.val, edge.t)
        if (s !== null) { edge.apply(s); lines.push({ axis: edge.axis, pos: s }) }
      }

      const dom = document.getElementById(`el-${rv.elId}`)
      if (dom) {
        dom.style.left = (nx * es) + 'px'
        dom.style.top = (ny * es) + 'px'
        dom.style.width = (nw * es) + 'px'
        dom.style.height = (nh * es) + 'px'
        // 이미지 cover 재계산
        const curEl = getEl(rv.elId)
        if (curEl?.type === 'image' && curEl.ratio) {
          const { imgW, imgH } = computeCover(curEl.ratio, nw, nh, curEl.cropZoom || 1)
          const imgDom = dom.querySelector('img')
          if (imgDom) {
            imgDom.style.width = (imgW * es) + 'px'
            imgDom.style.height = (imgH * es) + 'px'
            const { cropX, cropY } = constrainCrop(curEl.ratio, nw, nh, curEl.cropX || 0, curEl.cropY || 0, curEl.cropZoom || 1)
            imgDom.style.left = (cropX * es) + 'px'
            imgDom.style.top = (cropY * es) + 'px'
          }
        }
      }
      rv._lastW = nw; rv._lastH = nh; rv._lastX = nx; rv._lastY = ny
      setSnapLines(lines)
    }
    const onUp = () => {
      if (resizeRef.current?._lastW !== undefined) {
        saveSnapshot()
        const rv = resizeRef.current
        const upd = { x: rv._lastX, y: rv._lastY, w: rv._lastW, h: rv._lastH }
        const curEl = getEl(rv.elId)
        if (curEl?.type === 'image' && curEl.ratio) {
          const { cropX, cropY } = constrainCrop(curEl.ratio, rv._lastW, rv._lastH, curEl.cropX || 0, curEl.cropY || 0, curEl.cropZoom || 1)
          upd.cropX = cropX; upd.cropY = cropY
        }
        updateEl(rv.elId, upd)
      }
      resizeRef.current = null
      setSnapLines([])
      forceUpdate(n => n + 1)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [es, pw, ph, currentPageIdx, updateEl, saveSnapshot])

  // ═══════════════════════════════════════
  // 핸들러: 더블클릭 → 크롭모드 or 텍스트편집
  // ═══════════════════════════════════════
  const handleElementDoubleClick = useCallback((e, el) => {
    e.stopPropagation()
    if (el.type === 'image') {
      setCropModeElId(prev => prev === el.id ? null : el.id)
      setSelectedElId(el.id)
    } else if (el.type === 'text') {
      setEditingTextId(el.id)
      setSelectedElId(el.id)
    }
  }, [])

  // ═══════════════════════════════════════
  // 드래그앤드롭: 사이드바 → 캔버스
  // ═══════════════════════════════════════
  const handleCanvasDragOver = useCallback((e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    const rect = e.currentTarget.getBoundingClientRect()
    const mx = (e.clientX - rect.left) / es
    const my = (e.clientY - rect.top) / es
    const page = pagesRef.current[currentPageIdx]
    if (!page) return
    const hit = [...page.elements].reverse().find(el =>
      el.type === 'image' && mx >= el.x && mx <= el.x + el.w && my >= el.y && my <= el.y + el.h
    )
    setDragOverFrameId(hit?.id || null)
  }, [es, currentPageIdx])

  const handleCanvasDragLeave = useCallback(() => {
    setDragOverFrameId(null)
  }, [])

  const handleCanvasDrop = useCallback((e) => {
    e.preventDefault()
    setDragOverFrameId(null)
    let data
    try { data = JSON.parse(e.dataTransfer.getData('application/x-pdf-image')) } catch { return }
    if (!data?.url) return

    saveSnapshot()
    if (dragOverFrameId) {
      // 프레임에 드롭 → 이미지 교체
      updateEl(dragOverFrameId, { url: data.url, ratio: data.ratio || 1.5, cropX: 0, cropY: 0, cropZoom: 1 })
    } else {
      // 빈 영역에 드롭 → 새 요소 추가
      const rect = e.currentTarget.getBoundingClientRect()
      const mx = (e.clientX - rect.left) / es
      const my = (e.clientY - rect.top) / es
      const w = 80, h = w / (data.ratio || 1.5)
      const newEl = {
        id: `el_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'image', url: data.url,
        x: Math.max(0, mx - w / 2), y: Math.max(0, my - h / 2), w, h,
        ratio: data.ratio || 1.5, cropX: 0, cropY: 0, cropZoom: 1,
      }
      setPages(prev => prev.map((p, i) =>
        i === currentPageIdx ? { ...p, elements: [...p.elements, newEl] } : p
      ))
      setSelectedElId(newEl.id)
    }
  }, [es, currentPageIdx, dragOverFrameId, updateEl, setPages, saveSnapshot])

  return {
    selectedElId, setSelectedElId,
    cropModeElId, setCropModeElId,
    editingTextId, setEditingTextId,
    snapLines, dragOverFrameId,
    updateEl, deleteEl,
    handlers: {
      handleCanvasMouseDown,
      handleElementMouseDown,
      handleHandleMouseDown,
      handleElementDoubleClick,
      handleCanvasDragOver,
      handleCanvasDragLeave,
      handleCanvasDrop,
    },
  }
}
