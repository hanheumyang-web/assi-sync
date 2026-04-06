import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useProjects } from '../hooks/useProjects'
import { collection, query, where, getDocs, doc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore'
import { ref, uploadBytes, deleteObject } from 'firebase/storage'
import { db, storage } from '../firebase'
import { fixAssetContentType } from '../hooks/useAssets'

// Instagram 이미지 압축 (정방형 크롭 or 원본 비율)
// cropOffset: { x: 0~1, y: 0~1 } — 0.5=중앙
async function compressForIG(asset, ratio = 'square', cropOffset = null) {
  const res = await fetch(asset.url)
  const blob = await res.blob()
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const maxDim = 1080
      const canvas = document.createElement('canvas')
      let sx = 0, sy = 0, sw = img.width, sh = img.height, dw, dh
      const ox = cropOffset?.x ?? 0.5
      const oy = cropOffset?.y ?? 0.5

      if (ratio === 'square') {
        // 1:1 크롭 (사용자 지정 위치)
        const srcSize = Math.min(img.width, img.height)
        const maxSx = img.width - srcSize
        const maxSy = img.height - srcSize
        sx = maxSx * ox
        sy = maxSy * oy
        sw = sh = srcSize
        dw = dh = maxDim
      } else {
        // 원본 비율 유지, 긴 변 1080px
        const scale = maxDim / Math.max(img.width, img.height)
        dw = Math.round(img.width * scale)
        dh = Math.round(img.height * scale)
      }
      canvas.width = dw
      canvas.height = dh
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh)
      canvas.toBlob((b) => {
        console.log(`[IG] 압축: ${asset.fileName} ${img.width}x${img.height} → ${dw}x${dh} (${(blob.size/1024/1024).toFixed(1)}MB → ${(b.size/1024/1024).toFixed(1)}MB)`)
        resolve(b)
      }, 'image/jpeg', 0.95)
    }
    img.src = asset.url
  })
}

// ── Instagram API 헬퍼 ──
const IG_API_BASE = 'https://graph.instagram.com/v25.0'

// Instagram Graph API POST — FormData body (multipart/form-data, CORS-safe)
async function igPost(endpoint, params, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const fd = new FormData()
    for (const [k, v] of Object.entries(params)) fd.append(k, v)
    console.log('[IG POST]', endpoint.split('/').pop(), Object.keys(params).join(','), attempt > 1 ? `(재시도 ${attempt})` : '')
    const res = await fetch(endpoint, { method: 'POST', body: fd })
    const data = await res.json()
    console.log('[IG RES]', JSON.stringify(data).substring(0, 300))
    if (data.error) {
      // 일시적 오류면 재시도
      if (data.error.is_transient && attempt < retries) {
        console.log(`[IG] 일시적 오류, ${5 * attempt}초 후 재시도...`)
        await new Promise(r => setTimeout(r, 5000 * attempt))
        continue
      }
      throw new Error(data.error.message)
    }
    return data
  }
}

async function publishSingleMedia(igUserId, token, url, caption, isVideo = false) {
  const params = isVideo
    ? { media_type: 'VIDEO', video_url: url, caption, access_token: token }
    : { image_url: url, caption, access_token: token }
  const created = await igPost(`${IG_API_BASE}/${igUserId}/media`, params)
  return igPost(`${IG_API_BASE}/${igUserId}/media_publish`, { creation_id: created.id, access_token: token })
}

// 컨테이너 상태 폴링 (비디오는 비동기 처리됨)
async function waitForContainer(containerId, token, maxWait = 60000) {
  const start = Date.now()
  while (Date.now() - start < maxWait) {
    const res = await fetch(`${IG_API_BASE}/${containerId}?fields=status_code,status&access_token=${token}`)
    const data = await res.json()
    console.log(`[IG] 컨테이너 ${containerId} 상태:`, data.status_code, data.status || '')
    if (data.status_code === 'FINISHED') return true
    if (data.status_code === 'ERROR') throw new Error('미디어 처리 실패: ' + (data.status || '알 수 없는 오류'))
    await new Promise(r => setTimeout(r, 3000)) // 3초 대기
  }
  throw new Error('미디어 처리 시간 초과 (60초)')
}

async function publishCarousel(igUserId, token, mediaItems, caption) {
  const childIds = []
  for (let i = 0; i < mediaItems.length; i++) {
    const item = mediaItems[i]
    const params = item.isVideo
      ? { media_type: 'VIDEO', video_url: item.url, is_carousel_item: 'true', access_token: token }
      : { image_url: item.url, is_carousel_item: 'true', access_token: token }
    console.log(`[IG] 캐러셀 아이템 ${i+1}/${mediaItems.length} 생성 중...`, item.isVideo ? 'VIDEO' : 'IMAGE', item.url.slice(0, 80))
    const data = await igPost(`${IG_API_BASE}/${igUserId}/media`, params)
    childIds.push(data.id)
  }
  // 모든 컨테이너 처리 완료 대기 (특히 비디오)
  console.log('[IG] 컨테이너 처리 대기 중...')
  for (const id of childIds) {
    await waitForContainer(id, token)
  }
  // children을 콤마 구분 문자열로 전달
  console.log('[IG] 캐러셀 컨테이너 생성 중...', childIds.length, '개 아이템', childIds)
  const carouselData = await igPost(`${IG_API_BASE}/${igUserId}/media`, {
    media_type: 'CAROUSEL',
    caption,
    children: childIds.join(','),
    access_token: token,
  })
  // 캐러셀 컨테이너도 처리 완료 대기
  await waitForContainer(carouselData.id, token)
  return igPost(`${IG_API_BASE}/${igUserId}/media_publish`, { creation_id: carouselData.id, access_token: token })
}

export default function FeedPlanner({ isMobile }) {
  const { user, userDoc } = useAuth()
  const { projects } = useProjects()

  const [projectAssets, setProjectAssets] = useState({})
  const [feedCustom, setFeedCustom] = useState({})   // projectId → { caption, imageOrder, excluded }
  const [feedOrder, setFeedOrder] = useState([])      // projectId[] 순서
  const [loading, setLoading] = useState(true)
  const [savedPhrases, setSavedPhrases] = useState([])
  const [dragIdx, setDragIdx] = useState(null)
  const [editingProjectId, setEditingProjectId] = useState(null)

  // ── Instagram 연결 상태 ──
  const [igToken, setIgToken] = useState(() => localStorage.getItem('assi_ig_token') || '')
  const [igUserId, setIgUserId] = useState(() => localStorage.getItem('assi_ig_user_id') || '')
  const [igUsername, setIgUsername] = useState(() => localStorage.getItem('assi_ig_username') || '')
  const [igConnected, setIgConnected] = useState(false)
  const [showIgSettings, setShowIgSettings] = useState(false)
  const [igFeed, setIgFeed] = useState([])
  const [syncing, setSyncing] = useState(false)
  const [uploadingId, setUploadingId] = useState(null)
  const [uploadQueue, setUploadQueue] = useState([]) // { id, name, status: 'uploading'|'done'|'error', error? }

  const displayName = userDoc?.displayName || user?.displayName || '사용자'

  // ── Firestore: 피드 커스텀 데이터 로드 ──
  useEffect(() => {
    if (!user) return
    const feedRef = doc(db, 'feeds', user.uid)
    const unsub = onSnapshot(feedRef, (snap) => {
      if (snap.exists()) {
        setFeedCustom(snap.data().custom || {})
        setFeedOrder(snap.data().order || [])
        setSavedPhrases(snap.data().savedPhrases || [])
      }
      setLoading(false)
    })
    return unsub
  }, [user])

  // ── 프로젝트별 에셋 로드 ──
  useEffect(() => {
    if (!user || projects.length === 0) return
    const loadAssets = async () => {
      const map = {}
      for (const p of projects) {
        try {
          const snap = await getDocs(query(collection(db, 'assets'), where('projectId', '==', p.id)))
          map[p.id] = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        } catch (e) { console.warn('에셋 로드 실패:', e) }
      }
      setProjectAssets(map)
    }
    loadAssets()
  }, [user, projects])

  // ── 피드 저장 ──
  const saveFeedData = async (custom, order) => {
    setFeedCustom(custom)
    setFeedOrder(order)
    if (!user) return
    try {
      await setDoc(doc(db, 'feeds', user.uid), {
        uid: user.uid,
        custom,
        order,
        savedPhrases,
        updatedAt: new Date().toISOString(),
      }, { merge: true })
    } catch (e) { console.error('피드 저장 실패:', e) }
  }

  const savePhrases = async (newPhrases) => {
    setSavedPhrases(newPhrases)
    if (!user) return
    try {
      await setDoc(doc(db, 'feeds', user.uid), { savedPhrases: newPhrases, updatedAt: new Date().toISOString() }, { merge: true })
    } catch (e) { console.error('문구 저장 실패:', e) }
  }

  // ── OAuth 콜백 후 localStorage에서 토큰 다시 읽기 ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('ig_connected') === '1') {
      const t = localStorage.getItem('assi_ig_token') || ''
      const u = localStorage.getItem('assi_ig_user_id') || ''
      const n = localStorage.getItem('assi_ig_username') || ''
      if (t && u) { setIgToken(t); setIgUserId(u); setIgUsername(n) }
      // Clean up URL param
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  // ── Instagram 연결 확인 ──
  useEffect(() => {
    if (!igToken || !igUserId) { setIgConnected(false); return }
    fetch(`${IG_API_BASE}/me?fields=user_id,username&access_token=${igToken}`)
      .then(r => r.json())
      .then(data => {
        if (data.username) {
          setIgConnected(true)
          setIgUsername(data.username)
          if (data.user_id) { setIgUserId(data.user_id); localStorage.setItem('assi_ig_user_id', data.user_id) }
          localStorage.setItem('assi_ig_username', data.username)
        } else setIgConnected(false)
      })
      .catch(() => setIgConnected(false))
  }, [igToken, igUserId])

  const saveIgSettings = (token, userId) => {
    setIgToken(token); setIgUserId(userId)
    localStorage.setItem('assi_ig_token', token)
    localStorage.setItem('assi_ig_user_id', userId)
  }
  const disconnectIg = () => {
    setIgToken(''); setIgUserId(''); setIgUsername(''); setIgConnected(false)
    localStorage.removeItem('assi_ig_token'); localStorage.removeItem('assi_ig_user_id'); localStorage.removeItem('assi_ig_username')
  }

  // ── Instagram 피드 동기화 ──
  const syncInstagramFeed = async () => {
    if (!igConnected) return
    setSyncing(true)
    try {
      const res = await fetch(`${IG_API_BASE}/${igUserId}/media?fields=id,caption,media_type,media_url,thumbnail_url,timestamp,permalink,children{media_url,media_type}&limit=30&access_token=${igToken}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error.message)
      setIgFeed((data.data || []).map(post => ({
        id: post.id,
        url: post.media_type === 'VIDEO' ? (post.thumbnail_url || '') : (post.media_url || ''),
        images: post.children?.data
          ? post.children.data.map(c => ({ url: c.media_url, isVideo: c.media_type === 'VIDEO' }))
          : [{ url: post.media_url || '', isVideo: post.media_type === 'VIDEO' }],
        imageCount: post.children?.data?.length || 1,
        caption: post.caption || '',
        permalink: post.permalink,
        timestamp: post.timestamp,
        mediaType: post.media_type,
      })))
    } catch (err) {
      console.error('Instagram 피드 동기화 실패:', err)
      alert('피드 동기화 실패: ' + err.message)
    } finally { setSyncing(false) }
  }

  useEffect(() => { if (igConnected) syncInstagramFeed() }, [igConnected])

  // ── 업로드 예정 목록 (프로젝트 자동 동기화) ──
  const projectsWithAssets = projects.filter(p => {
    const assets = projectAssets[p.id]
    return assets && assets.length > 0
  })

  // feedOrder에 있는 프로젝트 순서 유지 + 없는 프로젝트는 뒤에 추가
  const orderedPlanned = (() => {
    const ordered = []
    const remaining = [...projectsWithAssets]
    for (const pid of feedOrder) {
      const idx = remaining.findIndex(p => p.id === pid)
      if (idx >= 0) { ordered.push(remaining.splice(idx, 1)[0]) }
    }
    return [...ordered, ...remaining]
  })()

  // ── 드래그앤드롭 (업로드 예정 순서) ──
  const handleDragStart = (idx) => setDragIdx(idx)
  const handleDrop = (targetIdx) => {
    if (dragIdx === null || dragIdx === targetIdx) return
    const items = [...orderedPlanned]
    const [moved] = items.splice(dragIdx, 1)
    items.splice(targetIdx, 0, moved)
    const newOrder = items.map(p => p.id)
    saveFeedData(feedCustom, newOrder)
    setDragIdx(null)
  }

  // ── 프로젝트에서 제거 (업로드 예정에서 숨기기) ──
  const excludeProject = (projectId) => {
    const newCustom = { ...feedCustom, [projectId]: { ...(feedCustom[projectId] || {}), excluded: true } }
    saveFeedData(newCustom, feedOrder)
  }
  const includeProject = (projectId) => {
    const newCustom = { ...feedCustom, [projectId]: { ...(feedCustom[projectId] || {}), excluded: false } }
    saveFeedData(newCustom, feedOrder)
  }

  // 제외 안 된 것만 표시
  const visiblePlanned = orderedPlanned.filter(p => !feedCustom[p.id]?.excluded)

  // ── Instagram 업로드 ──
  const uploadToInstagram = async (project) => {
    if (!igConnected) return
    if (project.embargoStatus === 'active') {
      alert('엠바고 상태인 게시물은 업로드할 수 없습니다.')
      return
    }
    const assets = projectAssets[project.id] || []
    if (!assets.length) return

    const custom = feedCustom[project.id] || {}
    const caption = custom.caption || ''
    const aspectRatio = custom.aspectRatio || 'square'
    const savedCropOffsets = custom.cropOffsets || {}

    // 이미지 순서 적용
    let orderedAssets = assets
    if (custom.imageOrder && custom.imageOrder.length > 0) {
      orderedAssets = custom.imageOrder
        .map(id => assets.find(a => a.id === id))
        .filter(Boolean)
      // 순서에 없는 에셋 추가
      const remaining = assets.filter(a => !custom.imageOrder.includes(a.id))
      orderedAssets = [...orderedAssets, ...remaining]
    }

    setUploadingId(project.id)
    setUploadQueue(q => [...q.filter(i => i.id !== project.id), { id: project.id, name: project.name, status: 'uploading' }])
    const tempPaths = [] // ig-temp 정리용 (try 밖에서 선언)
    try {
      // 업로드 전 Firebase Storage content type 자동 수정 (기존 파일 복구)
      console.log('[IG] 메타데이터 수정 시작...', orderedAssets.length, '개 에셋')
      for (const asset of orderedAssets) {
        console.log('[IG] 에셋:', asset.fileName, '| fileType:', asset.fileType, '| url:', asset.url?.substring(0, 80))
        await fixAssetContentType(asset)
      }
      console.log('[IG] 메타데이터 수정 완료, 업로드 시작')

      // GCS public URL
      const toGcsUrl = (storagePath) => {
        const encoded = storagePath.split('/').map(s => encodeURIComponent(s)).join('/')
        return `https://storage.googleapis.com/assi-app-6ea04.firebasestorage.app/${encoded}`
      }

      // 이미지 압축 + 임시 업로드 (8MB 초과 시)
      const mediaItems = []
      for (const a of orderedAssets) {
        const isVideo = a.isVideo || a.fileType?.startsWith('video/') || false
        if (isVideo) {
          mediaItems.push({ url: toGcsUrl(a.storagePath), isVideo: true })
          continue
        }
        const compressed = await compressForIG(a, aspectRatio, savedCropOffsets[a.id])
        if (compressed) {
          // 압축본을 임시 경로에 업로드
          const tempPath = `ig-temp/${Date.now()}_${a.fileName}`
          const tempRef = ref(storage, tempPath)
          await uploadBytes(tempRef, compressed, { contentType: 'image/jpeg', contentDisposition: 'inline' })
          tempPaths.push(tempPath)
          mediaItems.push({ url: toGcsUrl(tempPath), isVideo: false })
          console.log('[IG] 압축 업로드 완료:', tempPath)
        } else {
          mediaItems.push({ url: toGcsUrl(a.storagePath), isVideo: false })
        }
      }
      console.log('[IG] 전송 URL 샘플:', mediaItems[0]?.url)

      // GCS 전파 대기 (임시 업로드 파일이 있을 경우)
      if (tempPaths.length > 0) {
        console.log('[IG] GCS 전파 대기 3초...')
        await new Promise(r => setTimeout(r, 3000))
      }

      if (mediaItems.length === 1) {
        await publishSingleMedia(igUserId, igToken, mediaItems[0].url, caption, mediaItems[0].isVideo)
      } else {
        await publishCarousel(igUserId, igToken, mediaItems, caption)
      }

      setUploadQueue(q => q.map(i => i.id === project.id ? { ...i, status: 'done' } : i))
      // 영상 에셋에 igUploaded 플래그 설정 (Storage 원본 정리용)
      for (const a of orderedAssets) {
        if (a.isVideo || a.fileType?.startsWith('video/')) {
          try { await updateDoc(doc(db, 'assets', a.id), { igUploaded: true }) } catch {}
        }
      }
      // 업로드 후 IG 피드 새로 동기화
      syncInstagramFeed()
    } catch (err) {
      console.error('Instagram 업로드 실패:', err)
      setUploadQueue(q => q.map(i => i.id === project.id ? { ...i, status: 'error', error: err.message } : i))
    } finally {
      setUploadingId(null)
      // 임시 압축 파일 정리
      for (const tp of tempPaths) {
        try { await deleteObject(ref(storage, tp)) } catch {}
      }
    }
  }

  // ── 탭 ──
  const [activeTab, setActiveTab] = useState('planned')

  // ── 통계 ──
  const plannedCount = visiblePlanned.length
  const embargoCount = visiblePlanned.filter(p => p.embargoStatus === 'active').length
  const readyCount = visiblePlanned.filter(p => p.embargoStatus !== 'active').length
  const publishedCount = igFeed.length
  const hiddenProjects = projects.filter(p => feedCustom[p.id]?.excluded)

  // ── 프로젝트 에셋 가져오기 (순서 적용) ──
  const getOrderedAssets = (projectId) => {
    const assets = projectAssets[projectId] || []
    const custom = feedCustom[projectId] || {}
    if (custom.imageOrder && custom.imageOrder.length > 0) {
      const ordered = custom.imageOrder.map(id => assets.find(a => a.id === id)).filter(Boolean)
      const remaining = assets.filter(a => !custom.imageOrder.includes(a.id))
      return [...ordered, ...remaining]
    }
    return assets
  }

  return (
    <div className={`${isMobile ? 'flex flex-col' : 'flex gap-0'}`}>
      {/* ══════ 왼쪽: Instagram 스타일 ══════ */}
      <div className="flex-1 min-w-0">

        {/* ── 프로필 헤더 ── */}
        <div className="bg-white rounded-[24px] p-6 mb-4 shadow-sm">
          <div className="flex items-center gap-5">
            {/* 프로필 아바타 */}
            <div className="w-[72px] h-[72px] rounded-full p-[3px] bg-gradient-to-tr from-[#FCAF45] via-[#E1306C] to-[#833AB4] flex-shrink-0">
              <div className="w-full h-full rounded-full bg-white p-[2px]">
                <div className="w-full h-full rounded-full bg-gradient-to-br from-[#833AB4] via-[#E1306C] to-[#F77737] flex items-center justify-center">
                  <span className="text-white text-lg font-black">{igConnected ? igUsername?.[0]?.toUpperCase() || 'IG' : '?'}</span>
                </div>
              </div>
            </div>

            {/* 정보 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-lg font-black tracking-tight text-gray-900">
                  {igConnected ? `@${igUsername}` : '연결 필요'}
                </h2>
                {igConnected && <div className="w-2 h-2 rounded-full bg-green-400" />}
                {!igConnected && (
                  <button onClick={() => setShowIgSettings(true)}
                    className="px-3 py-1 bg-[#828DF8] text-white text-xs font-bold rounded-[8px] hover:bg-[#6366F1] transition-all">
                    연결하기
                  </button>
                )}
              </div>
              <div className="flex gap-6">
                <div className="text-center">
                  <p className="text-lg font-black tracking-tight text-gray-900">{publishedCount}</p>
                  <p className="text-xs text-gray-400 font-semibold">게시물</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-black tracking-tight text-[#828DF8]">{readyCount}</p>
                  <p className="text-xs text-gray-400 font-semibold">준비</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-black tracking-tight text-amber-500">{embargoCount}</p>
                  <p className="text-xs text-gray-400 font-semibold">엠바고</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── 예정 섹션 ── */}
        <div className="bg-white rounded-[16px] shadow-sm mb-4 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <p className="text-sm tracking-[0.15em] uppercase text-gray-900 font-bold">예정</p>
              {plannedCount > 0 && <span className="text-xs text-[#828DF8] font-bold">{plannedCount}</span>}
            </div>
            {hiddenProjects.length > 0 && (
              <button onClick={() => setActiveTab(activeTab === 'hidden' ? 'planned' : 'hidden')}
                className="text-xs text-gray-400 hover:text-gray-600 font-semibold">
                {activeTab === 'hidden' ? '돌아가기' : `숨김 ${hiddenProjects.length}`}
              </button>
            )}
          </div>
          <div className="p-[2px]">
            {loading ? (
              <div className="text-center py-12">
                <div className="w-8 h-8 rounded-full bg-[#828DF8]/20 mx-auto mb-2 animate-pulse" />
                <p className="text-xs text-gray-400">로딩 중...</p>
              </div>
            ) : activeTab === 'hidden' ? (
              /* 숨김 보기 */
              hiddenProjects.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-sm text-gray-400">숨긴 프로젝트가 없습니다</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-[2px]">
                  {hiddenProjects.map(project => {
                    const assets = projectAssets[project.id] || []
                    const thumb = assets[0]?.url
                    return (
                      <div key={project.id} className="aspect-square relative overflow-hidden group bg-gray-100">
                        {thumb ? (
                          <img src={thumb} alt="" className="w-full h-full object-cover opacity-50" loading="lazy" />
                        ) : (
                          <div className="w-full h-full bg-[#F4F3EE] flex items-center justify-center">
                            <span className="text-gray-300 text-lg">-</span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
                          <button onClick={() => includeProject(project.id)}
                            className="opacity-0 group-hover:opacity-100 bg-white text-gray-800 text-xs font-bold px-3 py-1.5 rounded-full transition-all">
                            복원
                          </button>
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent p-2 pointer-events-none">
                          <p className="text-white/70 text-xs font-bold truncate">{project.name}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            ) : visiblePlanned.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-gray-400 mb-1">프로젝트에 이미지를 업로드하면</p>
                <p className="text-sm text-gray-400">자동으로 여기에 표시됩니다</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-[2px]">
                {visiblePlanned.map((project, idx) => {
                  const assets = getOrderedAssets(project.id)
                  const firstAsset = assets[0]
                  const thumb = firstAsset?.url
                  const thumbIsVideo = firstAsset?.isVideo || firstAsset?.fileType?.startsWith('video/')
                  const custom = feedCustom[project.id] || {}
                  const isEmbargo = project.embargoStatus === 'active'
                  const isUploading = uploadingId === project.id

                  return (
                    <div key={project.id} draggable
                      onDragStart={() => handleDragStart(idx)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleDrop(idx)}
                      className={`aspect-square relative cursor-grab active:cursor-grabbing group overflow-hidden
                        ${dragIdx === idx ? 'opacity-40 scale-95' : ''}`}>
                      {/* 썸네일 */}
                      {thumb ? (
                        thumbIsVideo ? (
                          <video src={thumb} className="w-full h-full object-cover" muted preload="metadata" draggable={false} />
                        ) : (
                          <img src={thumb} alt="" className="w-full h-full object-cover" loading="lazy" draggable={false} />
                        )
                      ) : (
                        <div className="w-full h-full bg-[#F4F3EE] flex items-center justify-center">
                          <span className="text-xl text-gray-300">+</span>
                        </div>
                      )}

                      {/* 호버 오버레이 */}
                      <div className={`absolute inset-0 transition-all ${dragIdx !== null ? '' : 'group-hover:bg-black/50'}`}>
                        <div className={`absolute inset-0 flex flex-col items-center justify-center gap-2 transition-all
                          ${dragIdx !== null ? 'hidden' : 'opacity-0 group-hover:opacity-100'}`}>
                          <button onClick={(e) => { e.stopPropagation(); setEditingProjectId(project.id) }}
                            className="bg-white text-gray-800 text-xs font-bold px-3 py-1.5 rounded-full hover:bg-[#828DF8] hover:text-white transition-all">
                            편집
                          </button>
                          {igConnected && !isEmbargo && (
                            <button onClick={(e) => { e.stopPropagation(); uploadToInstagram(project) }}
                              disabled={isUploading}
                              className="bg-gradient-to-r from-[#833AB4] via-[#E1306C] to-[#F77737] text-white text-xs font-bold px-3 py-1.5 rounded-full disabled:opacity-50">
                              {isUploading ? '업로드 중...' : '업로드'}
                            </button>
                          )}
                          <button onClick={(e) => { e.stopPropagation(); excludeProject(project.id) }}
                            className="text-white/60 text-xs hover:text-white transition-all">숨기기</button>
                        </div>
                      </div>

                      {/* 뱃지 */}
                      {isEmbargo && (
                        <div className="absolute top-1.5 left-1.5 bg-amber-400 text-white text-[9px] font-bold px-2 py-0.5 rounded-full pointer-events-none">
                          EMBARGO
                        </div>
                      )}
                      {assets.length > 1 && (
                        <div className="absolute top-1.5 right-1.5 bg-white/90 rounded-[4px] px-1.5 py-0.5 flex items-center gap-0.5 pointer-events-none">
                          <svg className="w-2.5 h-2.5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <rect x="3" y="3" width="14" height="14" rx="2" /><rect x="7" y="7" width="14" height="14" rx="2" />
                          </svg>
                          <span className="text-[9px] font-bold text-gray-600">{assets.length}</span>
                        </div>
                      )}

                      {/* 하단 정보 */}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2 pointer-events-none">
                        <p className="text-white text-xs font-bold truncate">{project.name}</p>
                      </div>

                      {/* 순서 번호 */}
                      <div className="absolute bottom-1.5 right-1.5 bg-black/50 rounded-full w-6 h-6 flex items-center justify-center pointer-events-none">
                        <span className="text-[10px] font-bold text-white">{idx + 1}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          }
          </div>
        </div>

        {/* ── 완료 섹션 ── */}
        <div className="bg-white rounded-[16px] shadow-sm mb-4 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <p className="text-sm tracking-[0.15em] uppercase text-gray-900 font-bold">완료</p>
              {publishedCount > 0 && <span className="text-xs text-emerald-500 font-bold">{publishedCount}</span>}
            </div>
            {igConnected && (
              <button onClick={syncInstagramFeed} disabled={syncing}
                className="text-xs text-[#828DF8] font-semibold hover:underline disabled:opacity-50">
                {syncing ? '동기화 중...' : '새로고침'}
              </button>
            )}
          </div>
          <div className="p-[2px]">
            {!igConnected ? (
              <div className="text-center py-12">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#FCAF45] via-[#E1306C] to-[#833AB4] flex items-center justify-center mx-auto mb-3 opacity-40">
                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor"><rect x="2" y="2" width="20" height="20" rx="5" stroke="currentColor" strokeWidth="2" fill="none"/><circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="2" fill="none"/></svg>
                </div>
                <p className="text-sm text-gray-400 mb-1">Instagram을 연결하면</p>
                <p className="text-sm text-gray-400">게시된 피드를 확인할 수 있습니다</p>
              </div>
            ) : igFeed.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-gray-400">{syncing ? '동기화 중...' : '게시된 피드가 없습니다'}</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-[2px]">
                {igFeed.map(post => (
                  <a key={post.id} href={post.permalink} target="_blank" rel="noopener noreferrer"
                    className="aspect-square relative group overflow-hidden bg-gray-100">
                    {post.url ? (
                      post.mediaType === 'VIDEO' ? (
                        <video src={post.images?.[0]?.url || post.url} className="w-full h-full object-cover" muted preload="metadata"
                          onLoadedData={e => { e.target.currentTime = 0.5 }} />
                      ) : (
                        <img src={post.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                      )
                    ) : (
                      <div className="w-full h-full bg-[#F4F3EE] flex items-center justify-center">
                        <span className="text-gray-300 text-lg">📷</span>
                      </div>
                    )}
                    {/* 호버 오버레이 */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all flex items-end opacity-0 group-hover:opacity-100">
                      <div className="w-full p-2">
                        <p className="text-white/80 text-[9px] line-clamp-2">{post.caption || ''}</p>
                      </div>
                    </div>
                    {/* 캐러셀 아이콘 */}
                    {post.imageCount > 1 && (
                      <div className="absolute top-1.5 right-1.5 bg-white/90 rounded-[4px] px-1 py-0.5 flex items-center gap-0.5 pointer-events-none">
                        <svg className="w-2.5 h-2.5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <rect x="3" y="3" width="14" height="14" rx="2" /><rect x="7" y="7" width="14" height="14" rx="2" />
                        </svg>
                        <span className="text-[8px] font-bold text-gray-600">{post.imageCount}</span>
                      </div>
                    )}
                    {/* 비디오 아이콘 */}
                    {post.mediaType === 'VIDEO' && (
                      <div className="absolute top-1.5 right-1.5 pointer-events-none">
                        <svg className="w-3.5 h-3.5 text-white drop-shadow" viewBox="0 0 24 24" fill="currentColor">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                      </div>
                    )}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ══════ 오른쪽: ASSI 도구 사이드바 ══════ */}
      {!isMobile && (
        <div className="w-[280px] flex-shrink-0 ml-5 space-y-4">

          {/* Instagram 연결 */}
          <div className="bg-white rounded-[24px] p-5 shadow-sm">
            <p className="text-xs tracking-[0.2em] uppercase text-gray-400 font-semibold mb-3">INSTAGRAM</p>
            {igConnected ? (
              <div>
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      const ready = visiblePlanned.filter(p => p.embargoStatus !== 'active')
                      if (!ready.length) { alert('업로드 가능한 게시물이 없습니다.'); return }
                      if (!window.confirm(`${ready.length}개 게시물을 인스타그램에 업로드하시겠습니까?`)) return
                      ;(async () => { for (const p of ready) await uploadToInstagram(p) })()
                    }}
                    disabled={uploadingId !== null}
                    className="w-full px-3 py-2.5 bg-gradient-to-r from-[#833AB4] via-[#E1306C] to-[#F77737] text-white rounded-full text-sm font-bold hover:shadow-lg transition-all disabled:opacity-50">
                    {uploadingId ? '업로드 중...' : `전체 업로드 (${readyCount})`}
                  </button>
                  <div className="flex gap-2">
                    <button onClick={() => setShowIgSettings(true)}
                      className="flex-1 px-3 py-2 bg-[#F4F3EE] text-gray-500 rounded-full text-xs font-bold hover:bg-gray-200 transition-all">
                      설정
                    </button>
                    <button onClick={disconnectIg}
                      className="flex-1 px-3 py-2 bg-[#F4F3EE] text-gray-400 rounded-full text-xs font-bold hover:bg-red-50 hover:text-red-500 transition-all">
                      연결 해제
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowIgSettings(true)}
                className="w-full px-4 py-2.5 bg-gradient-to-r from-[#833AB4] via-[#E1306C] to-[#F77737] text-white rounded-full text-xs font-bold hover:shadow-lg transition-all">
                Instagram 연결하기
              </button>
            )}
          </div>

          {/* 피드 현황 */}
          <div className="bg-white rounded-[24px] p-5 shadow-sm">
            <p className="text-xs tracking-[0.2em] uppercase text-gray-400 font-semibold mb-3">FEED STATUS</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#F4F3EE] rounded-[12px] p-3 text-center">
                <p className="text-lg font-black text-[#828DF8]">{readyCount}</p>
                <p className="text-xs text-gray-400 font-semibold">업로드 가능</p>
              </div>
              <div className="bg-[#F4F3EE] rounded-[12px] p-3 text-center">
                <p className="text-lg font-black text-amber-500">{embargoCount}</p>
                <p className="text-xs text-gray-400 font-semibold">엠바고</p>
              </div>
            </div>
          </div>

          {/* 엠바고 일정 */}
          {embargoCount > 0 && (
            <div className="bg-white rounded-[24px] p-5 shadow-sm">
              <p className="text-xs tracking-[0.2em] uppercase text-gray-400 font-semibold mb-3">EMBARGO</p>
              <div className="space-y-2">
                {visiblePlanned.filter(p => p.embargoStatus === 'active' && p.embargoDate).map(p => (
                  <div key={p.id} className="flex items-center gap-2 bg-amber-50 rounded-[10px] p-2.5">
                    <div className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-gray-900 truncate">{p.name}</p>
                      <p className="text-xs text-amber-600">{p.embargoDate} 업로드</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 게시물 편집 모달 ── */}
      {editingProjectId && (
        <PostEditor
          project={projects.find(p => p.id === editingProjectId)}
          assets={projectAssets[editingProjectId] || []}
          currentOrder={feedCustom[editingProjectId]?.imageOrder || null}
          caption={feedCustom[editingProjectId]?.caption || ''}
          savedPhrases={savedPhrases}
          onSave={(order, caption, aspectRatio, cropOffsets) => {
            const newCustom = { ...feedCustom, [editingProjectId]: { ...(feedCustom[editingProjectId] || {}), imageOrder: order, caption, aspectRatio, cropOffsets } }
            saveFeedData(newCustom, feedOrder)
            setEditingProjectId(null)
          }}
          onSavePhrases={savePhrases}
          onClose={() => setEditingProjectId(null)}
        />
      )}

      {/* ── Instagram 설정 모달 ── */}
      {showIgSettings && (
        <IgSettingsModal
          currentToken={igToken}
          currentUserId={igUserId}
          onSave={(token, userId) => { saveIgSettings(token, userId); setShowIgSettings(false) }}
          onClose={() => setShowIgSettings(false)}
        />
      )}

      {/* ── 플로팅 업로드 토스트 ── */}
      {uploadQueue.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50 w-[320px] space-y-2">
          {uploadQueue.map(item => (
            <div key={item.id}
              className={`rounded-[16px] p-3 shadow-lg backdrop-blur-sm flex items-center gap-3 transition-all
                ${item.status === 'done' ? 'bg-green-500/90 text-white' : item.status === 'error' ? 'bg-red-500/90 text-white' : 'bg-gray-900/90 text-white'}`}>
              {item.status === 'uploading' && (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin flex-shrink-0" />
              )}
              {item.status === 'done' && (
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
              {item.status === 'error' && (
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">{item.name}</p>
                <p className="text-xs opacity-80">
                  {item.status === 'uploading' ? '업로드 중...' : item.status === 'done' ? '완료!' : item.error || '실패'}
                </p>
              </div>
              {item.status !== 'uploading' && (
                <button onClick={() => setUploadQueue(q => q.filter(i => i.id !== item.id))}
                  className="text-white/60 hover:text-white text-sm flex-shrink-0">✕</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── 게시물 편집 모달 (순서 + 캡션 통합) ──
function PostEditor({ project, assets, currentOrder, caption: initialCaption, savedPhrases, onSave, onSavePhrases, onClose }) {
  const [images, setImages] = useState(() => {
    if (currentOrder && currentOrder.length > 0) {
      const ordered = currentOrder.map(id => assets.find(a => a.id === id)).filter(Boolean)
      const remaining = assets.filter(a => !currentOrder.includes(a.id))
      return [...ordered, ...remaining]
    }
    return [...assets]
  })
  const [dragIdx, setDragIdx] = useState(null)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const scrollRef = useRef(null)
  const [caption, setCaption] = useState(initialCaption)
  const [aspectRatio, setAspectRatio] = useState('square') // 'square' | 'original'
  // 이미지별 크롭 위치 (0~1, 0.5=중앙)
  const [cropOffsets, setCropOffsets] = useState({}) // { [assetId]: { x: 0.5, y: 0.5 } }
  const [isCropDragging, setIsCropDragging] = useState(false)
  const cropRef = useRef(null)
  const [newPhrase, setNewPhrase] = useState('')
  const [showPhraseInput, setShowPhraseInput] = useState(false)

  const isVideo = (item) => item?.isVideo || item?.fileType?.startsWith('video/')

  const handleDragStart = (idx) => setDragIdx(idx)
  const handleDrop = (targetIdx) => {
    if (dragIdx === null || dragIdx === targetIdx) return
    const items = [...images]
    const [moved] = items.splice(dragIdx, 1)
    items.splice(targetIdx, 0, moved)
    setImages(items)
    setDragIdx(null)
  }

  const removeImage = (idx) => {
    if (images.length <= 1) return
    setImages(prev => prev.filter((_, i) => i !== idx))
    if (selectedIdx >= images.length - 1) setSelectedIdx(Math.max(0, images.length - 2))
  }

  const moveLeft = (idx) => {
    if (idx <= 0) return
    const items = [...images]
    ;[items[idx - 1], items[idx]] = [items[idx], items[idx - 1]]
    setImages(items)
    setSelectedIdx(idx - 1)
  }

  const moveRight = (idx) => {
    if (idx >= images.length - 1) return
    const items = [...images]
    ;[items[idx], items[idx + 1]] = [items[idx + 1], items[idx]]
    setImages(items)
    setSelectedIdx(idx + 1)
  }

  // 크롭 위치 드래그
  const getCropOffset = (id) => cropOffsets[id] || { x: 0.5, y: 0.5 }
  const handleCropMouseDown = (e) => {
    if (aspectRatio !== 'square') return
    e.preventDefault()
    setIsCropDragging(true)
    const startX = e.clientX, startY = e.clientY
    const img = images[selectedIdx]
    if (!img) return
    const start = getCropOffset(img.id)

    const onMove = (me) => {
      const el = cropRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      // 드래그 방향 반전 (이미지를 드래그하는 느낌)
      const dx = -(me.clientX - startX) / rect.width
      const dy = -(me.clientY - startY) / rect.height
      setCropOffsets(prev => ({
        ...prev,
        [img.id]: {
          x: Math.max(0, Math.min(1, start.x + dx)),
          y: Math.max(0, Math.min(1, start.y + dy)),
        }
      }))
    }
    const onUp = () => {
      setIsCropDragging(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const addPhrase = () => {
    if (!newPhrase.trim()) return
    onSavePhrases([...savedPhrases, newPhrase.trim()])
    setNewPhrase('')
    setShowPhraseInput(false)
  }
  const removePhrase = (idx) => onSavePhrases(savedPhrases.filter((_, i) => i !== idx))
  const insertPhrase = (phrase) => setCaption(prev => prev ? prev + '\n' + phrase : phrase)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-[32px] p-6 md:p-8 max-w-4xl w-full shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <p className="text-sm tracking-[0.2em] uppercase text-[#828DF8] font-bold mb-1">POST EDITOR</p>
        <h2 className="text-2xl font-black tracking-tighter text-gray-900 mb-1">게시물 편집</h2>
        <p className="text-xs text-gray-400 mb-5">{project?.name} · {images.length}개 콘텐츠</p>

        <div className="flex gap-6">
          {/* ── 왼쪽: 콘텐츠 순서 ── */}
          <div className="flex-1 min-w-0">
            <p className="text-xs tracking-[0.15em] uppercase text-gray-400 font-semibold mb-2">CONTENT ORDER</p>

            {/* 메인 프리뷰 (크롭 조정 가능) */}
            <div ref={cropRef}
              className={`mb-3 rounded-[16px] overflow-hidden bg-black relative
                ${aspectRatio === 'square' ? 'aspect-square' : 'aspect-[4/5]'} max-h-[400px]
                ${aspectRatio === 'square' && !isVideo(images[selectedIdx]) ? 'cursor-grab active:cursor-grabbing' : ''}`}
              onMouseDown={!isVideo(images[selectedIdx]) ? handleCropMouseDown : undefined}>
              {images[selectedIdx] && (
                isVideo(images[selectedIdx]) ? (
                  <video src={images[selectedIdx].url} className="w-full h-full object-contain" muted controls preload="metadata" />
                ) : aspectRatio === 'square' ? (
                  <img src={images[selectedIdx].url} alt=""
                    className="w-full h-full object-cover select-none"
                    draggable={false}
                    style={{ objectPosition: `${getCropOffset(images[selectedIdx].id).x * 100}% ${getCropOffset(images[selectedIdx].id).y * 100}%` }} />
                ) : (
                  <img src={images[selectedIdx].url} alt="" className="w-full h-full object-contain" />
                )
              )}
              {/* 정방형 크롭 안내 */}
              {aspectRatio === 'square' && !isVideo(images[selectedIdx]) && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 text-white text-[9px] font-bold px-3 py-1 rounded-full pointer-events-none">
                  {isCropDragging ? '위치 조정 중...' : '드래그로 위치 조정'}
                </div>
              )}
              {selectedIdx > 0 && (
                <button onClick={(e) => { e.stopPropagation(); moveLeft(selectedIdx) }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/80 hover:bg-white rounded-full flex items-center justify-center text-gray-600 shadow-md text-sm">
                  ‹
                </button>
              )}
              {selectedIdx < images.length - 1 && (
                <button onClick={(e) => { e.stopPropagation(); moveRight(selectedIdx) }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/80 hover:bg-white rounded-full flex items-center justify-center text-gray-600 shadow-md text-sm">
                  ›
                </button>
              )}
              <div className="absolute top-3 right-3 bg-black/60 text-white text-xs font-bold px-2.5 py-1 rounded-full pointer-events-none">
                {selectedIdx + 1} / {images.length}
              </div>
              {selectedIdx === 0 && (
                <div className="absolute top-3 left-3 bg-[#828DF8] text-white text-[9px] font-bold px-2 py-0.5 rounded-full pointer-events-none">
                  대표
                </div>
              )}
            </div>

            {/* 가로 스크롤 썸네일 스트립 */}
            <div className="relative mb-2">
              <div ref={scrollRef} className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
                {images.map((img, idx) => (
                  <div
                    key={img.id}
                    draggable
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDrop(idx)}
                    onClick={() => setSelectedIdx(idx)}
                    className={`flex-shrink-0 w-14 h-14 rounded-[10px] overflow-hidden relative cursor-grab active:cursor-grabbing transition-all
                      ${selectedIdx === idx ? 'ring-2 ring-[#828DF8] ring-offset-2 scale-105' : 'opacity-70 hover:opacity-100'}
                      ${dragIdx === idx ? 'opacity-30 scale-90' : ''}`}
                  >
                    {isVideo(img) ? (
                      <video src={img.url} className="w-full h-full object-cover" muted preload="metadata" />
                    ) : (
                      <img src={img.url} alt="" className="w-full h-full object-cover" draggable={false} />
                    )}
                    <div className={`absolute bottom-0.5 left-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold
                      ${idx === 0 ? 'bg-[#828DF8] text-white' : 'bg-black/50 text-white'}`}>
                      {idx + 1}
                    </div>
                    {isVideo(img) && (
                      <div className="absolute top-0.5 right-0.5 bg-black/50 rounded-full w-4 h-4 flex items-center justify-center">
                        <span className="text-white text-[7px]">▶</span>
                      </div>
                    )}
                    {images.length > 1 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); removeImage(idx) }}
                        className="absolute top-0.5 left-0.5 w-4 h-4 bg-red-500 text-white rounded-full text-[8px] opacity-0 hover:opacity-100 flex items-center justify-center"
                        style={{ opacity: selectedIdx === idx ? undefined : 0 }}
                      >×</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <p className="text-xs text-gray-400 text-center">드래그 또는 화살표로 순서 변경 · 첫 번째가 피드 대표</p>
          </div>

          {/* ── 오른쪽: 비율 + 캡션 ── */}
          <div className="w-[280px] flex-shrink-0">
            {/* 비율 선택 */}
            <p className="text-xs tracking-[0.15em] uppercase text-gray-400 font-semibold mb-2">ASPECT RATIO</p>
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setAspectRatio('square')}
                className={`flex-1 py-2 rounded-[12px] text-xs font-bold transition-all ${aspectRatio === 'square' ? 'bg-[#828DF8] text-white' : 'bg-[#F4F3EE] text-gray-500 hover:bg-gray-200'}`}
              >
                1:1 정방형
              </button>
              <button
                onClick={() => setAspectRatio('original')}
                className={`flex-1 py-2 rounded-[12px] text-xs font-bold transition-all ${aspectRatio === 'original' ? 'bg-[#828DF8] text-white' : 'bg-[#F4F3EE] text-gray-500 hover:bg-gray-200'}`}
              >
                원본 비율
              </button>
            </div>
            <p className="text-xs tracking-[0.15em] uppercase text-gray-400 font-semibold mb-2">CAPTION</p>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder={"게시물 캡션을 작성하세요...\n\n#해시태그 #포트폴리오"}
              className="w-full px-4 py-3 bg-[#F4F3EE] rounded-[12px] text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#828DF8]/30 resize-none h-[200px] whitespace-pre-wrap"
            />
            <p className="text-xs text-gray-400 text-right mt-1 mb-3">{caption.length}자</p>

            <div className="flex items-center justify-between mb-2">
              <label className="text-xs tracking-[0.15em] uppercase text-gray-400 font-semibold">SAVED PHRASES</label>
              <button onClick={() => setShowPhraseInput(!showPhraseInput)} className="text-xs text-[#828DF8] font-bold hover:underline">
                + 문구 등록
              </button>
            </div>
            {showPhraseInput && (
              <div className="mb-3">
                <textarea
                  value={newPhrase}
                  onChange={(e) => setNewPhrase(e.target.value)}
                  placeholder={"자주 쓰는 문구를 입력하세요..."}
                  className="w-full px-3 py-2 bg-[#F4F3EE] rounded-[10px] text-xs text-gray-900 outline-none focus:ring-2 focus:ring-[#828DF8]/30 resize-none h-16 whitespace-pre-wrap"
                  autoFocus
                />
                <div className="flex justify-end gap-2 mt-1.5">
                  <button onClick={() => { setShowPhraseInput(false); setNewPhrase('') }} className="px-3 py-1 bg-gray-100 text-gray-500 rounded-[8px] text-xs font-bold">취소</button>
                  <button onClick={addPhrase} className="px-3 py-1 bg-[#828DF8] text-white rounded-[8px] text-xs font-bold">등록</button>
                </div>
              </div>
            )}
            {savedPhrases.length === 0 ? (
              <p className="text-xs text-gray-300 text-center py-3">등록된 문구가 없습니다</p>
            ) : (
              <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
                {savedPhrases.map((phrase, idx) => (
                  <div key={idx} className="flex items-start gap-2 bg-[#F4F3EE] rounded-[10px] px-3 py-2">
                    <button onClick={() => insertPhrase(phrase)} className="flex-1 text-left text-xs text-gray-700 hover:text-[#828DF8] whitespace-pre-wrap line-clamp-2">
                      {phrase}
                    </button>
                    <button onClick={() => removePhrase(idx)} className="text-xs text-gray-300 hover:text-red-400 flex-shrink-0">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 하단 버튼 */}
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-4 bg-[#F4F3EE] text-gray-500 rounded-[16px] font-bold text-sm hover:bg-gray-200 transition-all">
            취소
          </button>
          <button
            onClick={() => onSave(images.map(img => img.id), caption, aspectRatio, cropOffsets)}
            className="flex-1 py-4 bg-[#828DF8] text-white rounded-[16px] font-bold text-sm hover:bg-[#6366F1] transition-all shadow-lg shadow-[#828DF8]/25"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Instagram 설정 모달 ──
const IG_APP_ID = '1346006907350596'
const IG_REDIRECT_URI = window.location.origin + '/auth/instagram/callback'
const IG_OAUTH_URL = `https://www.instagram.com/oauth/authorize?client_id=${IG_APP_ID}&redirect_uri=${encodeURIComponent(IG_REDIRECT_URI)}&response_type=code&scope=instagram_business_basic,instagram_business_content_publish`

function startInstagramOAuth() {
  window.location.href = IG_OAUTH_URL
}

function IgSettingsModal({ currentToken, currentUserId, onSave, onClose }) {
  const [showManual, setShowManual] = useState(false)
  const [token, setToken] = useState(currentToken || '')
  const [userId, setUserId] = useState(currentUserId || '')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  const testConnection = async () => {
    if (!token.trim() || !userId.trim()) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch(`${IG_API_BASE}/${userId.trim()}?fields=id,username&access_token=${token.trim()}`)
      const data = await res.json()
      if (data.username) setTestResult({ ok: true, username: data.username })
      else setTestResult({ ok: false, error: data.error?.message || '연결 실패' })
    } catch (e) {
      setTestResult({ ok: false, error: e.message })
    } finally { setTesting(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-[32px] p-8 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
        <p className="text-sm tracking-[0.2em] uppercase font-bold mb-1" style={{ color: '#E1306C' }}>INSTAGRAM</p>
        <h2 className="text-2xl font-black tracking-tighter text-gray-900 mb-1">Instagram 연결</h2>
        <p className="text-xs text-gray-400 mb-6">Instagram Professional 계정으로 로그인하세요</p>

        {/* OAuth 버튼 */}
        <button onClick={startInstagramOAuth}
          className="w-full py-4 bg-gradient-to-r from-[#833AB4] via-[#E1306C] to-[#F77737] text-white rounded-[16px] font-bold text-sm hover:shadow-lg transition-all flex items-center justify-center gap-3">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="2" width="20" height="20" rx="5" stroke="currentColor" strokeWidth="2"/>
            <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="2"/>
            <circle cx="18" cy="6" r="1.5" fill="currentColor"/>
          </svg>
          Facebook으로 Instagram 연결
        </button>

        <p className="text-xs text-gray-400 text-center mt-3 mb-4">Instagram Professional 계정이 Facebook 페이지에 연결되어 있어야 합니다</p>

        {/* 수동 입력 토글 */}
        <button onClick={() => setShowManual(!showManual)}
          className="w-full text-sm text-gray-400 hover:text-gray-600 font-semibold py-2">
          {showManual ? '접기' : '토큰 직접 입력'}
        </button>

        {showManual && (
          <>
            <div className="space-y-4 mt-2">
              <div>
                <label className="text-sm tracking-[0.15em] uppercase text-gray-400 font-semibold">INSTAGRAM USER ID</label>
                <input
                  className="w-full mt-1 px-4 py-3 bg-[#F4F3EE] rounded-[12px] text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#E1306C]/30 font-mono"
                  placeholder="예: 26672199749041605"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm tracking-[0.15em] uppercase text-gray-400 font-semibold">ACCESS TOKEN</label>
                <textarea
                  className="w-full mt-1 px-4 py-3 bg-[#F4F3EE] rounded-[12px] text-xs text-gray-900 outline-none focus:ring-2 focus:ring-[#E1306C]/30 font-mono resize-none h-24"
                  placeholder="EAAG..."
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
              </div>
            </div>

            {testResult && (
              <div className={`mt-4 p-3 rounded-[12px] ${testResult.ok ? 'bg-green-50' : 'bg-red-50'}`}>
                {testResult.ok
                  ? <p className="text-xs font-bold text-green-700">@{testResult.username} 연결 성공!</p>
                  : <p className="text-xs font-bold text-red-600">{testResult.error}</p>}
              </div>
            )}

            <div className="flex gap-3 mt-4">
              <button
                onClick={testConnection}
                disabled={!token.trim() || !userId.trim() || testing}
                className="py-3 px-5 bg-gray-900 text-white rounded-[16px] font-bold text-sm hover:bg-gray-800 transition-all disabled:opacity-50"
              >{testing ? '테스트 중...' : '테스트'}</button>
              <button
                onClick={() => onSave(token.trim(), userId.trim())}
                disabled={!token.trim() || !userId.trim()}
                className="flex-1 py-3 bg-[#828DF8] text-white rounded-[16px] font-bold text-sm hover:bg-[#6366F1] transition-all disabled:opacity-50"
              >저장</button>
            </div>
          </>
        )}

        <div className="mt-4">
          <button onClick={onClose} className="w-full py-3 bg-[#F4F3EE] text-gray-500 rounded-[16px] font-bold text-sm hover:bg-gray-200 transition-all">닫기</button>
        </div>
      </div>
    </div>
  )
}
