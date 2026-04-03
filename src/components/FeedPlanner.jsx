import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useProjects } from '../hooks/useProjects'
import { collection, query, where, getDocs, doc, setDoc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'

export default function FeedPlanner({ isMobile }) {
  const { user, userDoc } = useAuth()
  const { projects } = useProjects()

  const [view, setView] = useState('grid')
  const [feed, setFeed] = useState([])           // 피드 아이템 배열
  const [projectAssets, setProjectAssets] = useState({}) // projectId → assets[]
  const [filterProject, setFilterProject] = useState('all')
  const [dragIdx, setDragIdx] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editCarouselIdx, setEditCarouselIdx] = useState(null) // 캐러셀 순서 편집 중인 피드 인덱스
  const [editCaptionIdx, setEditCaptionIdx] = useState(null) // 캡션 편집 중인 피드 인덱스
  const [savedPhrases, setSavedPhrases] = useState([]) // 자주 쓰는 문구
  const [loading, setLoading] = useState(true)

  const displayName = userDoc?.displayName || user?.displayName || '사용자'
  const initial = displayName.charAt(0).toUpperCase()

  // ── 피드 데이터 로드 (Firestore) ──
  useEffect(() => {
    if (!user) return
    const feedRef = doc(db, 'feeds', user.uid)
    const unsub = onSnapshot(feedRef, (snap) => {
      if (snap.exists()) {
        setFeed(snap.data().items || [])
        setSavedPhrases(snap.data().savedPhrases || [])
      } else {
        setFeed([])
        setSavedPhrases([])
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
        } catch (e) {
          console.warn('에셋 로드 실패:', e)
        }
      }
      setProjectAssets(map)
    }
    loadAssets()
  }, [user, projects])

  // ── 피드 저장 ──
  const saveFeed = async (newFeed) => {
    setFeed(newFeed)
    if (!user) return
    try {
      await setDoc(doc(db, 'feeds', user.uid), {
        uid: user.uid,
        items: newFeed,
        savedPhrases,
        updatedAt: new Date().toISOString(),
      })
    } catch (e) {
      console.error('피드 저장 실패:', e)
    }
  }

  // ── 문구 저장 ──
  const savePhrases = async (newPhrases) => {
    setSavedPhrases(newPhrases)
    if (!user) return
    try {
      await setDoc(doc(db, 'feeds', user.uid), {
        uid: user.uid,
        items: feed,
        savedPhrases: newPhrases,
        updatedAt: new Date().toISOString(),
      }, { merge: true })
    } catch (e) {
      console.error('문구 저장 실패:', e)
    }
  }

  // ── 캡션 업데이트 ──
  const updateCaption = (idx, caption) => {
    const updated = [...feed]
    updated[idx] = { ...updated[idx], caption }
    saveFeed(updated)
  }

  // ── 드래그앤드롭 ──
  const handleDragStart = (idx) => setDragIdx(idx)
  const handleDrop = (targetIdx) => {
    if (dragIdx === null || dragIdx === targetIdx) return
    const items = [...feed]
    const [moved] = items.splice(dragIdx, 1)
    items.splice(targetIdx, 0, moved)
    saveFeed(items)
    setDragIdx(null)
  }

  // ── 피드 아이템 추가 (다중 이미지 = 캐러셀 한 게시물) ──
  const addToFeed = (assets, project) => {
    if (!assets || assets.length === 0) return
    const newItem = {
      id: `feed_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      // 캐러셀: images 배열에 여러 장
      images: assets.map(a => ({ assetId: a.id, url: a.url, isVideo: a.isVideo || false })),
      url: assets[0].url,  // 대표 이미지 (그리드 썸네일)
      imageCount: assets.length,
      projectId: project.id,
      projectName: project.name,
      client: project.client || '',
      embargoDate: project.embargoDate || null,
      embargoStatus: project.embargoStatus || 'none',
      caption: '',
      status: project.embargoStatus === 'active' ? 'embargo' : 'ready',
      addedAt: new Date().toISOString(),
    }
    saveFeed([...feed, newItem])
  }

  // ── 피드 아이템 삭제 ──
  const removeFromFeed = (idx) => {
    const items = [...feed]
    items.splice(idx, 1)
    saveFeed(items)
  }

  // ── 필터 ──
  const filteredFeed = filterProject === 'all'
    ? feed
    : feed.filter(f => f.projectId === filterProject)

  // ── 통계 ──
  const totalCount = feed.length
  const embargoCount = feed.filter(f => f.embargoStatus === 'active').length
  const readyCount = feed.filter(f => f.status === 'ready').length

  // ── 프로젝트 목록 (필터용) ──
  const feedProjectIds = [...new Set(feed.map(f => f.projectId))]
  const feedProjects = projects.filter(p => feedProjectIds.includes(p.id))

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] tracking-[0.2em] uppercase text-gray-400 font-semibold">INSTAGRAM FEED PLANNER</p>
          <h1 className="text-3xl font-black tracking-tighter text-gray-900">인스타그램 피드 플래너</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-white rounded-full p-1 shadow-sm">
            <button onClick={() => setView('grid')} className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${view === 'grid' ? 'bg-[#828DF8] text-white shadow-md' : 'text-gray-400'}`}>그리드</button>
            <button onClick={() => setView('list')} className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${view === 'list' ? 'bg-[#828DF8] text-white shadow-md' : 'text-gray-400'}`}>리스트</button>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-5 py-2.5 bg-[#828DF8] text-white rounded-full text-xs font-bold shadow-lg shadow-[#828DF8]/25 hover:bg-[#6366F1] transition-all"
          >
            + 게시물 추가
          </button>
        </div>
      </div>

      <div className="flex gap-6">
        {/* 인스타 그리드 프리뷰 */}
        <div className="flex-1">
          <div className="bg-white rounded-[24px] p-6 shadow-sm">
            {/* 인스타 프로필 헤더 */}
            <div className="flex items-center gap-4 mb-6 pb-4 border-b border-gray-100">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#828DF8] to-[#6366F1] flex items-center justify-center text-white text-xl font-black">
                {initial}
              </div>
              <div>
                <p className="font-bold text-gray-900 tracking-tight">@{displayName.toLowerCase().replace(/\s/g, '_')}</p>
                <div className="flex gap-4 mt-1">
                  <span className="text-xs text-gray-400"><strong className="text-gray-900">{totalCount}</strong> 게시물</span>
                  <span className="text-xs text-gray-400"><strong className="text-gray-900">—</strong> 팔로워</span>
                  <span className="text-xs text-gray-400"><strong className="text-gray-900">—</strong> 팔로잉</span>
                </div>
              </div>
            </div>

            {/* 구분선 */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-400" />
                <span className="text-[10px] text-gray-400 font-semibold">업로드 가능</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-amber-400" />
                <span className="text-[10px] text-amber-600 font-semibold">엠바고</span>
              </div>
            </div>

            {/* 3열 그리드 또는 빈 상태 */}
            {loading ? (
              <div className="text-center py-16">
                <div className="w-10 h-10 rounded-full bg-[#828DF8]/20 mx-auto mb-3 animate-pulse" />
                <p className="text-xs text-gray-400">로딩 중...</p>
              </div>
            ) : filteredFeed.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 rounded-[16px] bg-[#F4F3EE] mx-auto mb-4 flex items-center justify-center text-2xl">
                  ⊞
                </div>
                <p className="text-sm text-gray-400 mb-1">피드가 비어있습니다</p>
                <p className="text-xs text-gray-300 mb-4">프로젝트에서 이미지를 추가해보세요</p>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="text-sm text-[#828DF8] font-bold hover:underline"
                >
                  + 게시물 추가하기
                </button>
              </div>
            ) : view === 'grid' ? (
              <div className="grid grid-cols-3 gap-1.5">
                {filteredFeed.map((item, idx) => (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDrop(idx)}
                    onClick={() => { if (item.imageCount > 1) setEditCarouselIdx(idx) }}
                    className={`aspect-square rounded-[12px] relative cursor-grab active:cursor-grabbing
                      hover:opacity-90 transition-all group overflow-hidden
                      ${dragIdx === idx ? 'opacity-40 scale-95' : ''}
                      ${item.embargoStatus === 'active' ? 'ring-2 ring-amber-400 ring-offset-2' : ''}
                    `}
                  >
                    <img src={item.url} alt="" className="w-full h-full object-cover" draggable={false} />

                    {/* 호버 오버레이 */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 rounded-[12px] transition-all flex items-center justify-center">
                      <div className="opacity-0 group-hover:opacity-100 transition-all text-center">
                        <span className="text-white text-xs font-bold block">{item.projectName}</span>
                        <span className="text-white/70 text-[10px]">{item.client}</span>
                        {item.imageCount > 1 && (
                          <span className="text-white/50 text-[10px] block mt-0.5">클릭: 순서 편집</span>
                        )}
                      </div>
                    </div>

                    {/* 캡션 뱃지 — 캡션 있으면 좌하단에 첫 줄 표시 */}
                    {item.caption && (
                      <div className="absolute bottom-2 left-10 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded max-w-[60%] truncate pointer-events-none">
                        {item.caption.split('\n')[0].slice(0, 25)}{item.caption.split('\n')[0].length > 25 || item.caption.includes('\n') ? '...' : ''}
                      </div>
                    )}

                    {/* 캡션 편집 버튼 (호버) */}
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditCaptionIdx(idx) }}
                      className="absolute bottom-8 left-2 bg-white/80 text-gray-600 text-[9px] font-bold px-2 py-1 rounded-[6px]
                        opacity-0 group-hover:opacity-100 transition-all hover:bg-white"
                    >✎ 캡션</button>

                    {/* 캐러셀 인디케이터 (2장 이상) — 우상단 */}
                    {item.imageCount > 1 && (
                      <div className="absolute top-2 right-2 bg-white/90 rounded-[6px] px-1.5 py-0.5 flex items-center gap-0.5 pointer-events-none">
                        <svg className="w-3 h-3 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <rect x="3" y="3" width="14" height="14" rx="2" />
                          <rect x="7" y="7" width="14" height="14" rx="2" />
                        </svg>
                        <span className="text-[9px] font-bold text-gray-600">{item.imageCount}</span>
                      </div>
                    )}

                    {/* 엠바고 뱃지 — 좌상단 */}
                    {item.embargoStatus === 'active' && (
                      <div className="absolute top-2 left-2 bg-amber-400 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">
                        EMBARGO
                      </div>
                    )}

                    {/* 삭제 버튼 (호버) — 좌하단 */}
                    <button
                      onClick={(e) => { e.stopPropagation(); removeFromFeed(idx) }}
                      className="absolute bottom-2 left-2 w-6 h-6 bg-red-500/80 text-white rounded-full text-[10px]
                        opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center hover:bg-red-600"
                    >×</button>

                    {/* 순서 번호 — 우하단 */}
                    <div className="absolute bottom-2 right-2 bg-white/80 rounded-full w-6 h-6 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-gray-600">{idx + 1}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* 리스트 뷰 */
              <div className="space-y-2">
                {filteredFeed.map((item, idx) => (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDrop(idx)}
                    className={`flex items-center gap-3 p-3 rounded-[14px] bg-[#F4F3EE] hover:shadow-md transition-all cursor-grab
                      ${dragIdx === idx ? 'opacity-40' : ''}`}
                  >
                    <span className="text-xs font-black text-gray-400 w-6 text-center">{idx + 1}</span>
                    <div className="w-14 h-14 rounded-[10px] overflow-hidden flex-shrink-0">
                      <img src={item.url} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{item.projectName}</p>
                      <p className="text-[10px] text-gray-400">{item.client}{item.imageCount > 1 ? ` · ${item.imageCount}장` : ''}</p>
                      {item.caption && (
                        <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-2 whitespace-pre-wrap">{item.caption}</p>
                      )}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditCaptionIdx(idx) }}
                      className="text-[10px] text-[#828DF8] font-bold hover:underline flex-shrink-0"
                    >{item.caption ? '캡션 수정' : '+ 캡션'}</button>
                    {item.embargoStatus === 'active' && (
                      <span className="text-[10px] px-3 py-1 rounded-full font-bold bg-amber-100 text-amber-700 flex-shrink-0">엠바고</span>
                    )}
                    {item.embargoStatus !== 'active' && (
                      <span className="text-[10px] px-3 py-1 rounded-full font-bold bg-green-100 text-green-700 flex-shrink-0">업로드 가능</span>
                    )}
                    <button
                      onClick={() => removeFromFeed(idx)}
                      className="w-7 h-7 rounded-full bg-red-50 text-red-400 text-xs flex items-center justify-center hover:bg-red-100 flex-shrink-0"
                    >×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 사이드 패널 */}
        <div className="w-[280px] space-y-4">
          {/* 피드 통계 */}
          <div className="bg-white rounded-[24px] p-5 shadow-sm">
            <p className="text-[10px] tracking-[0.2em] uppercase text-gray-400 font-semibold mb-2">FEED STATUS</p>
            <h3 className="text-sm font-bold text-gray-900 tracking-tight mb-3">피드 현황</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400">전체 게시물</span>
                <span className="text-sm font-black text-gray-900">{totalCount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400">업로드 가능</span>
                <span className="text-sm font-black text-green-600">{readyCount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400">엠바고 대기</span>
                <span className="text-sm font-black text-amber-600">{embargoCount}</span>
              </div>
            </div>
            {/* 그리드 행 예측 */}
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-[10px] text-gray-400">인스타그램 피드 행: <span className="font-bold text-gray-600">{Math.ceil(totalCount / 3)}</span>행</p>
            </div>
          </div>

          {/* 프로젝트 필터 */}
          <div className="bg-white rounded-[24px] p-5 shadow-sm">
            <p className="text-[10px] tracking-[0.2em] uppercase text-gray-400 font-semibold mb-2">FILTER BY PROJECT</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setFilterProject('all')}
                className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition-all
                  ${filterProject === 'all' ? 'bg-[#828DF8] text-white' : 'bg-[#F4F3EE] text-gray-500 hover:bg-gray-200'}`}
              >
                전체
              </button>
              {feedProjects.map(p => (
                <button
                  key={p.id}
                  onClick={() => setFilterProject(p.id)}
                  className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition-all
                    ${filterProject === p.id ? 'bg-[#828DF8] text-white' : 'bg-[#F4F3EE] text-gray-500 hover:bg-gray-200'}`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* 엠바고 일정 */}
          {embargoCount > 0 && (
            <div className="bg-white rounded-[24px] p-5 shadow-sm">
              <p className="text-[10px] tracking-[0.2em] uppercase text-gray-400 font-semibold mb-2">EMBARGO SCHEDULE</p>
              <h3 className="text-sm font-bold text-gray-900 tracking-tight mb-3">엠바고 일정</h3>
              <div className="space-y-2">
                {feed.filter(f => f.embargoStatus === 'active' && f.embargoDate).map((f, i) => (
                  <div key={i} className="flex items-center gap-2 bg-amber-50 rounded-[10px] p-3">
                    <div className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-gray-900 truncate">{f.projectName}</p>
                      <p className="text-[10px] text-amber-600">{f.embargoDate} 이후 업로드</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 게시물 추가 모달 */}
      {showAddModal && (
        <AddFeedModal
          projects={projects}
          projectAssets={projectAssets}
          onAdd={addToFeed}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* 캐러셀 순서 편집 모달 */}
      {editCarouselIdx !== null && feed[editCarouselIdx] && (
        <CarouselEditor
          item={feed[editCarouselIdx]}
          onSave={(newImages) => {
            const updated = [...feed]
            updated[editCarouselIdx] = {
              ...updated[editCarouselIdx],
              images: newImages,
              url: newImages[0]?.url || updated[editCarouselIdx].url,
              imageCount: newImages.length,
            }
            saveFeed(updated)
            setEditCarouselIdx(null)
          }}
          onClose={() => setEditCarouselIdx(null)}
        />
      )}

      {/* 캡션 편집 모달 */}
      {editCaptionIdx !== null && feed[editCaptionIdx] && (
        <CaptionEditor
          item={feed[editCaptionIdx]}
          savedPhrases={savedPhrases}
          onSave={(caption) => {
            updateCaption(editCaptionIdx, caption)
            setEditCaptionIdx(null)
          }}
          onSavePhrases={savePhrases}
          onClose={() => setEditCaptionIdx(null)}
        />
      )}
    </div>
  )
}

// ── 게시물 추가 모달 (다중 선택) ──
function AddFeedModal({ projects, projectAssets, onAdd, onClose }) {
  const [selectedProject, setSelectedProject] = useState(null)
  const [selectedAssetIds, setSelectedAssetIds] = useState([])

  const project = projects.find(p => p.id === selectedProject)
  const assets = selectedProject ? (projectAssets[selectedProject] || []) : []

  const toggleAsset = (assetId) => {
    setSelectedAssetIds(prev =>
      prev.includes(assetId) ? prev.filter(id => id !== assetId) : [...prev, assetId]
    )
  }

  const selectAll = () => {
    if (selectedAssetIds.length === assets.length) {
      setSelectedAssetIds([])
    } else {
      setSelectedAssetIds(assets.map(a => a.id))
    }
  }

  const handleConfirm = () => {
    if (selectedAssetIds.length === 0 || !project) return
    const selectedAssets = selectedAssetIds.map(id => assets.find(a => a.id === id)).filter(Boolean)
    onAdd(selectedAssets, project)
    setSelectedAssetIds([])
    onClose()
  }

  // 프로젝트 바꾸면 선택 초기화
  const handleProjectChange = (pid) => {
    setSelectedProject(pid)
    setSelectedAssetIds([])
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-[32px] p-8 max-w-2xl w-full shadow-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <p className="text-[11px] tracking-[0.2em] uppercase text-[#828DF8] font-bold mb-1">ADD TO FEED</p>
        <h2 className="text-2xl font-black tracking-tighter text-gray-900 mb-1">게시물 추가</h2>
        <p className="text-xs text-gray-400 mb-6">여러 장 선택 시 캐러셀(슬라이드) 게시물로 추가됩니다</p>

        {/* 프로젝트 선택 */}
        <div className="mb-4">
          <p className="text-[10px] tracking-[0.15em] uppercase text-gray-400 font-semibold mb-2">SELECT PROJECT</p>
          <div className="flex flex-wrap gap-2">
            {projects.length === 0 ? (
              <p className="text-xs text-gray-400">프로젝트를 먼저 생성해주세요</p>
            ) : projects.map(p => (
              <button
                key={p.id}
                onClick={() => handleProjectChange(p.id)}
                className={`px-4 py-2 rounded-full text-xs font-bold transition-all
                  ${selectedProject === p.id ? 'bg-[#828DF8] text-white shadow-md' : 'bg-[#F4F3EE] text-gray-500 hover:bg-gray-200'}`}
              >
                {p.name} ({p.imageCount || 0})
              </button>
            ))}
          </div>
        </div>

        {/* 선택 상태 바 */}
        {selectedProject && assets.length > 0 && (
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-2">
              <button onClick={selectAll} className="text-[10px] text-[#828DF8] font-bold hover:underline">
                {selectedAssetIds.length === assets.length ? '전체 해제' : '전체 선택'}
              </button>
            </div>
            {selectedAssetIds.length > 0 && (
              <p className="text-xs font-bold text-gray-900">
                <span className="text-[#828DF8]">{selectedAssetIds.length}장</span> 선택됨
                {selectedAssetIds.length > 1 && <span className="text-gray-400 font-normal"> — 캐러셀 게시물</span>}
              </p>
            )}
          </div>
        )}

        {/* 이미지 그리드 */}
        <div className="flex-1 overflow-y-auto">
          {!selectedProject ? (
            <div className="text-center py-12">
              <p className="text-sm text-gray-400">프로젝트를 선택하세요</p>
            </div>
          ) : assets.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-gray-400">이 프로젝트에 이미지가 없습니다</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {assets.map((asset, i) => {
                const isSelected = selectedAssetIds.includes(asset.id)
                const selectOrder = isSelected ? selectedAssetIds.indexOf(asset.id) + 1 : null
                return (
                  <button
                    key={asset.id}
                    onClick={() => toggleAsset(asset.id)}
                    className={`aspect-square rounded-[12px] overflow-hidden relative group transition-all
                      ${isSelected ? 'ring-3 ring-[#828DF8] ring-offset-2 scale-[0.97]' : 'hover:ring-2 hover:ring-gray-300 hover:ring-offset-1'}`}
                  >
                    <img src={asset.url} alt="" className="w-full h-full object-cover" />

                    {/* 선택 번호 뱃지 */}
                    <div className={`absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all
                      ${isSelected ? 'bg-[#828DF8] text-white shadow-md' : 'bg-white/70 text-gray-400 border border-gray-300 group-hover:border-[#828DF8]'}`}>
                      {isSelected ? selectOrder : ''}
                    </div>

                    {/* 비디오 표시 */}
                    {asset.isVideo && (
                      <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                        VIDEO
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-4 bg-[#F4F3EE] text-gray-500 rounded-[16px] font-bold text-sm hover:bg-gray-200 transition-all">
            취소
          </button>
          <button
            onClick={handleConfirm}
            disabled={selectedAssetIds.length === 0}
            className="flex-1 py-4 bg-[#828DF8] text-white rounded-[16px] font-bold text-sm hover:bg-[#6366F1] transition-all shadow-lg shadow-[#828DF8]/25 disabled:opacity-50"
          >
            {selectedAssetIds.length === 0
              ? '이미지를 선택하세요'
              : selectedAssetIds.length === 1
                ? '1장 게시물 추가'
                : `${selectedAssetIds.length}장 캐러셀 추가`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 캐러셀 순서 편집 모달 ──
function CarouselEditor({ item, onSave, onClose }) {
  const [images, setImages] = useState(item.images || [])
  const [dragIdx, setDragIdx] = useState(null)
  const [editingCaption, setEditingCaption] = useState(null)

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
    if (images.length <= 1) return // 최소 1장
    setImages(prev => prev.filter((_, i) => i !== idx))
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-[32px] p-8 max-w-lg w-full shadow-2xl" onClick={e => e.stopPropagation()}>
        <p className="text-[11px] tracking-[0.2em] uppercase text-[#828DF8] font-bold mb-1">CAROUSEL EDITOR</p>
        <h2 className="text-2xl font-black tracking-tighter text-gray-900 mb-1">캐러셀 순서 편집</h2>
        <p className="text-xs text-gray-400 mb-6">{item.projectName} · 드래그하여 순서를 변경하세요</p>

        {/* 대표 이미지 프리뷰 */}
        <div className="mb-4 rounded-[16px] overflow-hidden aspect-square max-h-[200px] bg-[#F4F3EE]">
          <img src={images[0]?.url} alt="" className="w-full h-full object-cover" />
        </div>
        <p className="text-[10px] text-gray-400 text-center mb-4">첫 번째 이미지가 피드 썸네일로 표시됩니다</p>

        {/* 이미지 리스트 — 드래그앤드롭 */}
        <div className="space-y-2 max-h-[250px] overflow-y-auto">
          {images.map((img, idx) => (
            <div
              key={img.assetId || idx}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(idx)}
              className={`flex items-center gap-3 p-2 rounded-[12px] bg-[#F4F3EE] transition-all cursor-grab active:cursor-grabbing
                ${dragIdx === idx ? 'opacity-40 scale-[0.98]' : 'hover:shadow-md'}`}
            >
              {/* 드래그 핸들 */}
              <div className="text-gray-300 flex flex-col items-center w-4 flex-shrink-0">
                <span className="text-[8px] leading-none">⠿</span>
              </div>

              {/* 순서 번호 */}
              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold
                ${idx === 0 ? 'bg-[#828DF8] text-white' : 'bg-gray-200 text-gray-500'}`}>
                {idx + 1}
              </div>

              {/* 썸네일 */}
              <div className="w-12 h-12 rounded-[8px] overflow-hidden flex-shrink-0">
                <img src={img.url} alt="" className="w-full h-full object-cover" />
              </div>

              {/* 정보 */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-gray-900">{idx === 0 ? '대표 이미지' : `${idx + 1}번째`}</p>
                <p className="text-[10px] text-gray-400">{img.isVideo ? '영상' : '이미지'}</p>
              </div>

              {/* 삭제 (2장 이상일 때만) */}
              {images.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); removeImage(idx) }}
                  className="w-6 h-6 rounded-full bg-red-50 text-red-400 text-[10px] flex items-center justify-center hover:bg-red-100 flex-shrink-0"
                >×</button>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-4 bg-[#F4F3EE] text-gray-500 rounded-[16px] font-bold text-sm hover:bg-gray-200 transition-all">
            취소
          </button>
          <button
            onClick={() => onSave(images)}
            className="flex-1 py-4 bg-[#828DF8] text-white rounded-[16px] font-bold text-sm hover:bg-[#6366F1] transition-all shadow-lg shadow-[#828DF8]/25"
          >
            순서 저장
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 캡션 편집 모달 ──
function CaptionEditor({ item, savedPhrases, onSave, onSavePhrases, onClose }) {
  const [caption, setCaption] = useState(item.caption || '')
  const [newPhrase, setNewPhrase] = useState('')
  const [showPhraseInput, setShowPhraseInput] = useState(false)

  const addPhrase = () => {
    if (!newPhrase.trim()) return
    onSavePhrases([...savedPhrases, newPhrase.trim()])
    setNewPhrase('')
    setShowPhraseInput(false)
  }

  const removePhrase = (idx) => {
    onSavePhrases(savedPhrases.filter((_, i) => i !== idx))
  }

  const insertPhrase = (phrase) => {
    setCaption(prev => prev ? prev + '\n' + phrase : phrase)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-[32px] p-8 max-w-lg w-full shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex gap-4 mb-6">
          {/* 썸네일 */}
          <div className="w-16 h-16 rounded-[12px] overflow-hidden flex-shrink-0">
            <img src={item.url} alt="" className="w-full h-full object-cover" />
          </div>
          <div>
            <p className="text-[11px] tracking-[0.2em] uppercase text-[#828DF8] font-bold mb-0.5">CAPTION</p>
            <h2 className="text-xl font-black tracking-tighter text-gray-900">{item.projectName}</h2>
            <p className="text-[10px] text-gray-400">{item.client}{item.imageCount > 1 ? ` · ${item.imageCount}장 캐러셀` : ''}</p>
          </div>
        </div>

        {/* 캡션 입력 */}
        <div className="mb-4">
          <label className="text-[10px] tracking-[0.15em] uppercase text-gray-400 font-semibold">WRITE CAPTION</label>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder={"게시물 캡션을 작성하세요...\n\n#해시태그 #포트폴리오"}
            className="w-full mt-1 px-4 py-3 bg-[#F4F3EE] rounded-[12px] text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#828DF8]/30 resize-none h-40 whitespace-pre-wrap"
          />
          <p className="text-[10px] text-gray-400 text-right mt-1">{caption.length}자</p>
        </div>

        {/* 자주 쓰는 문구 */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] tracking-[0.15em] uppercase text-gray-400 font-semibold">SAVED PHRASES</label>
            <button
              onClick={() => setShowPhraseInput(!showPhraseInput)}
              className="text-[10px] text-[#828DF8] font-bold hover:underline"
            >+ 문구 등록</button>
          </div>

          {/* 문구 등록 입력 */}
          {showPhraseInput && (
            <div className="mb-3">
              <textarea
                value={newPhrase}
                onChange={(e) => setNewPhrase(e.target.value)}
                placeholder={"자주 쓰는 문구를 입력하세요...\n줄바꿈도 가능합니다"}
                className="w-full px-4 py-3 bg-[#F4F3EE] rounded-[12px] text-xs text-gray-900 outline-none focus:ring-2 focus:ring-[#828DF8]/30 resize-none h-28 whitespace-pre-wrap"
                autoFocus
              />
              <div className="flex justify-end gap-2 mt-2">
                <button onClick={() => { setShowPhraseInput(false); setNewPhrase('') }} className="px-3 py-1.5 bg-gray-100 text-gray-500 rounded-[8px] text-xs font-bold hover:bg-gray-200">취소</button>
                <button onClick={addPhrase} className="px-4 py-1.5 bg-[#828DF8] text-white rounded-[8px] text-xs font-bold hover:bg-[#6366F1]">문구 등록</button>
              </div>
            </div>
          )}

          {savedPhrases.length === 0 ? (
            <p className="text-xs text-gray-300 text-center py-3">등록된 문구가 없습니다</p>
          ) : (
            <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
              {savedPhrases.map((phrase, idx) => (
                <div key={idx} className="flex items-start gap-2 bg-[#F4F3EE] rounded-[10px] px-3 py-2">
                  <button
                    onClick={() => insertPhrase(phrase)}
                    className="flex-1 text-left text-xs text-gray-700 hover:text-[#828DF8] transition-all whitespace-pre-wrap line-clamp-3"
                    title="클릭하여 캡션에 삽입"
                  >
                    {phrase}
                  </button>
                  <button
                    onClick={() => removePhrase(idx)}
                    className="text-[10px] text-gray-300 hover:text-red-400 flex-shrink-0"
                  >×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-4 bg-[#F4F3EE] text-gray-500 rounded-[16px] font-bold text-sm hover:bg-gray-200 transition-all">
            취소
          </button>
          <button
            onClick={() => onSave(caption)}
            className="flex-1 py-4 bg-[#828DF8] text-white rounded-[16px] font-bold text-sm hover:bg-[#6366F1] transition-all shadow-lg shadow-[#828DF8]/25"
          >
            캡션 저장
          </button>
        </div>
      </div>
    </div>
  )
}
