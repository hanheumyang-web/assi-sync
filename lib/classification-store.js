// ASSI Sync — Keynote 분류 세션 상태 관리
// main ↔ renderer 사이에 사용자 편집(그룹 생성/이동/타이틀·카테고리 변경)을 반영.
// session.json에 영속화 → 앱 재시작 시 재개 가능.

const fs = require('fs')
const path = require('path')

const CATEGORIES = ['AUDIO', 'BEAUTY', 'FASHION', 'VIDEO', 'CELEBRITY', 'PERSONAL WORK']

function createGroup(title, category = null) {
  return {
    id: 'g-' + Math.random().toString(36).slice(2, 10),
    title: (title || '').trim() || '새 그룹',
    category: CATEGORIES.includes(category) ? category : null,
    imageFileNames: [],
    thumbnailFileName: null,  // ★ 사용자 선택 커버. null이면 imageFileNames[0] 사용
    slideRange: null,          // { start, end } — 1단계 박싱 결과 (fallback 모드면 null)
  }
}

class ClassificationSession {
  constructor(sessionId, parsed, extractedImages, sessionDir) {
    this.sessionId = sessionId
    this.sessionDir = sessionDir
    this.sourcePath = parsed.sourcePath || null
    this.mode = parsed.mode  // 'structured' | 'fallback'
    this.createdAt = new Date().toISOString()

    // 이미지 레지스트리 (fileName → meta)
    this.images = new Map()
    for (const ex of extractedImages) {
      this.images.set(ex.fileName, {
        fileName: ex.fileName,
        finalName: ex.finalName,
        extractedPath: ex.extractedPath,
        thumbPath: ex.thumbPath,
        size: ex.size,
        converted: ex.converted || false,
      })
    }

    // 슬라이드 번호 → 이미지 fileName[] 매핑 (1단계 박싱 UI에서 사용)
    this.slideImages = new Map() // slideIndex (0-based) → [fileName, ...]
    const seen = new Set()
    for (const g of parsed.groups || []) {
      if (g.slideIndex !== null && g.slideIndex !== undefined) {
        this.slideImages.set(g.slideIndex, (g.imageNames || []).filter(fn => this.images.has(fn)))
        for (const fn of g.imageNames || []) seen.add(fn)
      }
    }
    // "미분류"로 내려간 이미지들 — 슬라이드 매핑 없는 것들
    for (const fn of this.images.keys()) {
      if (!seen.has(fn)) {
        // 별도 bucket: slideIndex = -1 로 저장
        const misc = this.slideImages.get(-1) || []
        misc.push(fn)
        this.slideImages.set(-1, misc)
      }
    }
    this.totalSlides = parsed.slides?.length || 0

    // 초기 그룹 구성 (parsed.groups 기반)
    this.groups = []
    const assigned = new Set()
    for (const g of parsed.groups || []) {
      const group = createGroup(g.title, g.category)
      if (g.slideIndex !== null && g.slideIndex !== undefined) {
        group.slideRange = { start: g.slideIndex, end: g.slideIndex }
      }
      for (const fn of g.imageNames || []) {
        if (!this.images.has(fn)) continue
        if (assigned.has(fn)) continue
        assigned.add(fn)
        group.imageFileNames.push(fn)
      }
      if (group.imageFileNames.length > 0) this.groups.push(group)
    }
    // 누락된 이미지 "미분류"에 모두
    const orphans = []
    for (const fn of this.images.keys()) {
      if (!seen.has(fn)) orphans.push(fn)
    }
    if (orphans.length > 0) {
      let misc = this.groups.find(g => g.title === '미분류')
      if (!misc) {
        misc = createGroup('미분류')
        this.groups.push(misc)
      }
      for (const fn of orphans) misc.imageFileNames.push(fn)
    }
  }

  // ─── CRUD 메서드 (UI에서 IPC로 호출) ───
  updateGroup(groupId, patch) {
    const g = this.groups.find(x => x.id === groupId)
    if (!g) return false
    if (patch.title !== undefined) g.title = String(patch.title || '').trim() || g.title
    if (patch.category !== undefined) {
      g.category = CATEGORIES.includes(patch.category) ? patch.category : null
    }
    return true
  }

  createGroupAt(index, title = '새 그룹', category = null) {
    const g = createGroup(title, category)
    if (typeof index !== 'number' || index < 0 || index > this.groups.length) {
      this.groups.push(g)
    } else {
      this.groups.splice(index, 0, g)
    }
    return g.id
  }

  deleteGroup(groupId) {
    const idx = this.groups.findIndex(x => x.id === groupId)
    if (idx < 0) return false
    const [removed] = this.groups.splice(idx, 1)
    if (removed.imageFileNames.length > 0) {
      let misc = this.groups.find(g => g.title === '미분류')
      if (!misc) { misc = createGroup('미분류'); this.groups.push(misc) }
      for (const fn of removed.imageFileNames) misc.imageFileNames.push(fn)
    }
    return true
  }

  // 이미지 이동 (source 그룹에서 제거 후 target 그룹의 targetIndex에 삽입)
  moveImage(fileName, targetGroupId, targetIndex = -1) {
    // 현재 소속 그룹에서 제거
    for (const g of this.groups) {
      const i = g.imageFileNames.indexOf(fileName)
      if (i >= 0) g.imageFileNames.splice(i, 1)
    }
    const target = this.groups.find(g => g.id === targetGroupId)
    if (!target) return false
    if (targetIndex < 0 || targetIndex > target.imageFileNames.length) {
      target.imageFileNames.push(fileName)
    } else {
      target.imageFileNames.splice(targetIndex, 0, fileName)
    }
    return true
  }

  // ─── 1단계 슬라이드 박싱 API ───
  // 사용자가 [{start, end, title}] 리스트를 전달하면, 기존 그룹 전체 교체.
  // 각 범위의 슬라이드에 매핑된 이미지들을 모아서 프로젝트 생성.
  applySlideRanges(ranges) {
    const newGroups = []
    const consumed = new Set()
    // 정렬 + 중첩 체크
    const sorted = [...ranges].sort((a, b) => a.start - b.start)
    for (const r of sorted) {
      const start = Math.max(0, Math.min(r.start, this.totalSlides - 1))
      const end = Math.max(start, Math.min(r.end, this.totalSlides - 1))
      const g = createGroup(r.title || `프로젝트 ${newGroups.length + 1}`, r.category)
      g.slideRange = { start, end }
      for (let i = start; i <= end; i++) {
        const fnames = this.slideImages.get(i) || []
        for (const fn of fnames) {
          if (consumed.has(fn)) continue
          consumed.add(fn)
          g.imageFileNames.push(fn)
        }
      }
      if (g.imageFileNames.length > 0) newGroups.push(g)
    }
    // 범위 밖의 이미지 = "미분류"
    const orphan = []
    for (const fn of this.images.keys()) {
      if (!consumed.has(fn)) orphan.push(fn)
    }
    if (orphan.length > 0) {
      const misc = createGroup('미분류')
      misc.imageFileNames = orphan
      newGroups.push(misc)
    }
    this.groups = newGroups
    return true
  }

  // ─── 썸네일 별표 선택 ───
  setGroupThumbnail(groupId, fileName) {
    const g = this.groups.find(x => x.id === groupId)
    if (!g) return false
    if (fileName && !g.imageFileNames.includes(fileName)) return false
    g.thumbnailFileName = fileName || null
    return true
  }

  reorderGroups(orderedIds) {
    const map = new Map(this.groups.map(g => [g.id, g]))
    const next = []
    for (const id of orderedIds) {
      const g = map.get(id)
      if (g) { next.push(g); map.delete(id) }
    }
    for (const g of map.values()) next.push(g)  // 누락분 뒤로
    this.groups = next
    return true
  }

  // 빈 그룹 제거 + 이름 충돌 해결
  cleanup() {
    this.groups = this.groups.filter(g => g.imageFileNames.length > 0)
  }

  // ─── Serialize (renderer에 보내는 JSON) ───
  toJSON() {
    return {
      sessionId: this.sessionId,
      mode: this.mode,
      sourcePath: this.sourcePath,
      createdAt: this.createdAt,
      categories: CATEGORIES,
      groups: this.groups.map(g => ({
        id: g.id,
        title: g.title,
        category: g.category,
        imageFileNames: [...g.imageFileNames],
      })),
      images: [...this.images.values()].map(i => ({
        fileName: i.fileName,
        finalName: i.finalName,
        // 경로는 file:// URL 형태로 렌더러에 전달
        thumbUrl: i.thumbPath ? pathToFileUrl(i.thumbPath) : null,
        size: i.size,
        converted: i.converted,
      })),
    }
  }

  // 세션 디스크 저장 (재개용)
  persist() {
    const file = path.join(this.sessionDir, 'session.json')
    const payload = {
      sessionId: this.sessionId,
      mode: this.mode,
      sourcePath: this.sourcePath,
      createdAt: this.createdAt,
      groups: this.groups,
      images: [...this.images.values()],
    }
    try { fs.writeFileSync(file, JSON.stringify(payload, null, 2)) }
    catch (e) { console.warn('[ClassificationStore] persist failed:', e.message) }
  }

  // 확정 데이터 (local-foldering용)
  toApplyPayload() {
    this.cleanup()
    return {
      sessionId: this.sessionId,
      groups: this.groups.map((g, i) => ({
        title: g.title,
        category: g.category,
        order: i,
        images: g.imageFileNames.map(fn => {
          const meta = this.images.get(fn)
          return {
            fileName: fn,
            finalName: meta?.finalName || fn,
            extractedPath: meta?.extractedPath || null,
          }
        }).filter(x => x.extractedPath),
      })).filter(g => g.images.length > 0),
    }
  }
}

function pathToFileUrl(p) {
  // Windows: C:\path\to\file → file:///C:/path/to/file
  const normalized = p.replace(/\\/g, '/')
  return 'file:///' + encodeURI(normalized).replace(/#/g, '%23')
}

module.exports = {
  ClassificationSession,
  CATEGORIES,
  pathToFileUrl,
}
