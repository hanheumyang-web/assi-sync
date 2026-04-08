/**
 * templateMatcher.js — Canva-style Frame Layout System
 *
 * 핵심 변경: contain → cover
 * - 슬롯 = 프레임 (overflow:hidden)
 * - 이미지가 프레임을 꽉 채움 (crop 허용)
 * - cropX/cropY/cropZoom으로 프레임 내 위치 조정 가능
 */

import layoutTemplates from '../data/layoutTemplates.json'

// ── 전체 템플릿 반환 ──
export function getAllTemplates() {
  return layoutTemplates.templates
}

// ── 이미지 개수 + 방향으로 필터 ──
export function getTemplatesForCount(count, orientation = null) {
  let pool = layoutTemplates.templates
  if (orientation) pool = pool.filter(t => t.orientation === orientation)
  let result = pool.filter(t => t.imageCount === count)
  if (!result.length) {
    const maxCount = Math.max(...pool.map(t => t.imageCount))
    result = pool.filter(t => t.imageCount === Math.min(count, maxCount))
  }
  return result
}

// ── 이미지 분류 ──
export function classifyImages(images) {
  let landscapeCount = 0, portraitCount = 0, squareCount = 0
  for (const img of images) {
    const r = img.ratio || 1.5
    if (r > 1.2) landscapeCount++
    else if (r < 0.8) portraitCount++
    else squareCount++
  }
  let profile = 'mixed'
  if (landscapeCount === images.length) profile = 'all-landscape'
  else if (portraitCount === images.length) profile = 'all-portrait'
  else if (squareCount === images.length) profile = 'all-landscape'
  return { profile, landscapeCount, portraitCount, squareCount }
}

// ── Cover 유틸: 프레임을 꽉 채우는 이미지 크기 계산 ──
export function computeCover(ratio, frameW, frameH, cropZoom = 1) {
  const frameRatio = frameW / frameH
  let imgW, imgH
  if (ratio > frameRatio) {
    // 이미지가 프레임보다 넓음 → 높이 맞추고 좌우 크롭
    imgH = frameH * cropZoom
    imgW = imgH * ratio
  } else {
    // 이미지가 프레임보다 높음 → 너비 맞추고 상하 크롭
    imgW = frameW * cropZoom
    imgH = imgW / ratio
  }
  return { imgW, imgH }
}

// ── Crop 제약: 이미지가 항상 프레임을 덮도록 ──
export function constrainCrop(ratio, frameW, frameH, cropX, cropY, cropZoom = 1) {
  const { imgW, imgH } = computeCover(ratio, frameW, frameH, cropZoom)
  return {
    cropX: Math.max(-(imgW - frameW), Math.min(0, cropX)),
    cropY: Math.max(-(imgH - frameH), Math.min(0, cropY)),
  }
}

// ── 템플릿 매칭 (스코어링) ──
export function matchTemplates(images, pw, ph, options = {}) {
  const { previousStyle, preferTextZone, preferStyle, orientation } = options
  const n = images.length
  const { profile } = classifyImages(images)

  let pool = layoutTemplates.templates
  if (orientation) pool = pool.filter(t => t.orientation === orientation)
  let candidates = pool.filter(t => t.imageCount === n)
  if (!candidates.length) {
    const maxCount = Math.max(...pool.map(t => t.imageCount))
    candidates = pool.filter(t => t.imageCount === Math.min(n, maxCount))
  }
  if (!candidates.length) return pool.slice(0, 3)

  const scored = candidates.map(tpl => {
    let score = 0

    // ratio profile 매칭
    let profileScore = 0
    if (tpl.ratioProfile === profile) profileScore = 1
    else if (tpl.ratioProfile === 'any') profileScore = 0.7
    else if (profile === 'mixed') profileScore = 0.4
    else profileScore = 0.2

    // 개별 슬롯-이미지 비율 핏
    if (tpl.imageSlots && images.length === tpl.imageSlots.length) {
      const sorted = sortImagesForSlots(images, tpl.imageSlots)
      let fitSum = 0
      for (let i = 0; i < tpl.imageSlots.length; i++) {
        const slot = tpl.imageSlots[i]
        const img = sorted[i]
        if (slot.idealRatio && img) {
          fitSum += Math.max(0, 1 - Math.abs(img.ratio - slot.idealRatio) / Math.max(img.ratio, slot.idealRatio))
        } else fitSum += 0.5
      }
      profileScore = profileScore * 0.5 + (fitSum / tpl.imageSlots.length) * 0.5
    }
    score += profileScore * 0.6

    // 슬롯 커버리지
    let area = 0
    for (const s of (tpl.imageSlots || [])) area += s.w * s.h
    score += Math.min(1, area) * 0.3

    // 스타일 변화 보너스
    if (previousStyle && tpl.style !== previousStyle) score += 0.1
    if (preferTextZone && tpl.hasTextZone) score += 0.15
    if (preferStyle && tpl.style === preferStyle) score += 0.1

    return { ...tpl, _score: score }
  })

  scored.sort((a, b) => b._score - a._score)
  return scored
}

// ── 이미지를 슬롯에 최적 배정 (greedy) ──
function sortImagesForSlots(images, slots) {
  if (!slots || !images.length) return [...images]
  const available = images.map((img, idx) => ({ ...img, _origIdx: idx }))
  const result = new Array(slots.length).fill(null)

  const slotOrder = slots.map((s, i) => ({ ...s, _slotIdx: i }))
    .sort((a, b) => (a.priority || 0) - (b.priority || 0))

  for (const slot of slotOrder) {
    if (!available.length) break
    let bestIdx = 0, bestFit = -1
    for (let i = 0; i < available.length; i++) {
      const fit = slot.idealRatio
        ? 1 - Math.abs(available[i].ratio - slot.idealRatio) / Math.max(available[i].ratio, slot.idealRatio)
        : 0.5
      if (fit > bestFit) { bestFit = fit; bestIdx = i }
    }
    result[slot._slotIdx] = available.splice(bestIdx, 1)[0]
  }
  for (let i = 0; i < result.length; i++) {
    if (!result[i] && available.length) result[i] = available.shift()
  }
  return result
}

// ── 템플릿 적용 → Element[] 생성 (Frame 방식) ──
export function applyTemplate(template, images, pw, ph, colorTpl, options = {}) {
  const {
    margin = 15, startY = 48, footerReserve = 14, gap = 3,
    projectName = '', category = '', client = '', shootDate = '',
  } = options

  const usableW = pw - margin * 2
  const usableH = ph - startY - margin - footerReserve
  const elements = []
  const sortedImgs = sortImagesForSlots(images, template.imageSlots || [])

  for (let i = 0; i < (template.imageSlots || []).length; i++) {
    const slot = template.imageSlots[i]
    const img = sortedImgs[i]
    if (!img) continue

    // 정규화 → 절대 mm (프레임 크기 그대로)
    const x = Math.round((margin + slot.x * usableW) * 10) / 10
    const y = Math.round((startY + slot.y * usableH) * 10) / 10
    const w = Math.round((slot.w * usableW) * 10) / 10
    const h = Math.round((slot.h * usableH) * 10) / 10

    elements.push({
      id: `el_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'image', url: img.url,
      x, y, w, h,
      ratio: img.ratio,
      cropX: 0, cropY: 0, cropZoom: 1,
    })
  }

  // ── 텍스트존 ──
  if (template.hasTextZone && template.textZone) {
    const tz = template.textZone
    const tzX = margin + tz.x * usableW
    const tzY = startY + tz.y * usableH
    const tzW = tz.w * usableW
    const tzH = tz.h * usableH

    for (const slot of (tz.slots || [])) {
      const sx = tzX + slot.x * tzW
      const sy = tzY + slot.y * tzH
      const sw = slot.w * tzW
      const sh = slot.h * tzH

      if (slot.role === 'accent') {
        elements.push({
          id: `el_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: 'shape', shape: 'rect',
          x: Math.round(sx * 10) / 10, y: Math.round(sy * 10) / 10,
          w: Math.round(sw * 10) / 10, h: Math.round(Math.max(sh, 0.5) * 10) / 10,
          color: colorTpl?.[slot.colorKey] || colorTpl?.accent || '#333', opacity: 1
        })
        continue
      }

      let text = ''
      switch (slot.role) {
        case 'category': text = (category || client || 'PROJECT').toUpperCase(); break
        case 'title': text = projectName || 'Untitled'; break
        case 'client': text = client || ''; break
        case 'date': text = shootDate || ''; break
        default: text = ''
      }
      if (!text) continue

      elements.push({
        id: `el_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'text', text,
        x: Math.round(sx * 10) / 10, y: Math.round(sy * 10) / 10,
        w: Math.round(sw * 10) / 10, h: Math.round(sh * 10) / 10,
        fontSize: slot.fontSize || 12, fontWeight: slot.fontWeight || 'normal',
        color: colorTpl?.[slot.colorKey] || colorTpl?.text || '#1a1a1a', align: slot.align || 'left'
      })
    }
  }

  // ── 장식 요소 ──
  for (const deco of (template.decorations || [])) {
    elements.push({
      id: `el_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'shape', shape: 'rect',
      x: Math.round((margin + deco.x * usableW) * 10) / 10,
      y: Math.round((startY + deco.y * usableH) * 10) / 10,
      w: Math.round((deco.w * usableW) * 10) / 10,
      h: Math.round((deco.h * usableH) * 10) / 10,
      color: colorTpl?.[deco.colorKey] || colorTpl?.accent || '#F4A259', opacity: deco.opacity ?? 0.2
    })
  }

  return elements
}
