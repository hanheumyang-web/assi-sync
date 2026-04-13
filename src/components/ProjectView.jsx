import { useState, useRef, useEffect } from 'react'
import { useProjects } from '../hooks/useProjects'
import { useAssets } from '../hooks/useAssets'
import { useAuth } from '../contexts/AuthContext'
import { collection, addDoc, doc, updateDoc, increment, getDocs, query, where, limit, orderBy } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../firebase'
import { guessContentType, compressImage } from '../hooks/useAssets'
import { PageTransition, GridSkeleton, EmptyState } from './UIKit'
import ProjectShareModal from './ProjectShareModal'

// 프로젝트 썸네일 — thumbnailUrl 깨지면 assets에서 첫 이미지 자가치유
function ProjectThumb({ project }) {
  const [src, setSrc] = useState(project.thumbnailUrl || '')
  const [failed, setFailed] = useState(false)
  useEffect(() => { setSrc(project.thumbnailUrl || ''); setFailed(false) }, [project.thumbnailUrl])
  const healFromAssets = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'assets'), where('projectId', '==', project.id), limit(20)))
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      const firstImg = docs.find(a => !a.isVideo && (a.url || a.thumbUrl))
      const url = firstImg?.url || firstImg?.thumbUrl
      if (url && url !== src) {
        setSrc(url)
        setFailed(false)
        // 자가치유 — firestore 업데이트
        try { await updateDoc(doc(db, 'projects', project.id), { thumbnailUrl: url }) } catch {}
      } else {
        setFailed(true)
      }
    } catch {
      setFailed(true)
    }
  }
  useEffect(() => {
    if (!project.thumbnailUrl) healFromAssets()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id])
  if (!src || failed) return null
  return (
    <img
      src={src}
      alt=""
      className="w-full h-full object-cover"
      loading="lazy"
      decoding="async"
      onError={() => { setFailed(true); healFromAssets() }}
    />
  )
}

const GRADIENT_COLORS = [
  'from-rose-200 to-rose-400',
  'from-blue-200 to-blue-400',
  'from-amber-200 to-amber-400',
  'from-emerald-200 to-emerald-400',
  'from-purple-200 to-purple-400',
  'from-pink-200 to-pink-400',
  'from-red-200 to-red-400',
  'from-teal-200 to-teal-400',
]

function ExplorerView({ projects, categories, onMove, onSelect }) {
  const [dragId, setDragId] = useState(null)
  const [overCat, setOverCat] = useState(null)
  const [openCats, setOpenCats] = useState(() => new Set(categories))

  const grouped = {}
  for (const c of categories) grouped[c] = []
  const uncategorized = []
  for (const p of projects) {
    if (p.category && grouped[p.category]) grouped[p.category].push(p)
    else if (p.category) { grouped[p.category] = grouped[p.category] || []; grouped[p.category].push(p) }
    else uncategorized.push(p)
  }

  const toggleCat = (c) => {
    const next = new Set(openCats)
    next.has(c) ? next.delete(c) : next.add(c)
    setOpenCats(next)
  }

  const handleDrop = async (e, cat) => {
    e.preventDefault()
    setOverCat(null)
    if (!dragId) return
    await onMove(dragId, cat)
    setDragId(null)
  }

  const allCats = Object.keys(grouped)

  return (
    <div className="bg-[#f5f5f5] dark:bg-[#181818] rounded-[12px] shadow-md p-4 space-y-1">
      <div className="px-3 py-2 mb-2 text-[11px] tracking-[0.15em] uppercase text-[#8a8a8a] font-bold border-b border-[#dcdcdc] dark:border-[#2a2a2a]">
        📂 폴더 트리 — 드래그로 분류 이동
      </div>
      {uncategorized.length > 0 && (
        <div className="bg-[#f5f5f5] dark:bg-[#181818] border border-[#F4A259] rounded-[8px] p-3 mb-2">
          <div className="text-[11px] font-bold text-[#F4A259] mb-2">⚠️ 위치 오류 ({uncategorized.length}) — 분류 없음</div>
          <div className="flex flex-wrap gap-1.5">
            {uncategorized.map((p) => (
              <div
                key={p.id}
                draggable
                onDragStart={() => setDragId(p.id)}
                onClick={() => onSelect(p.id)}
                className="px-3 py-1.5 bg-[#f5f5f5] dark:bg-[#181818] rounded-full text-[11px] font-bold text-[#4a4a4a] dark:text-[#cbcbcb] border border-[#F4A259] cursor-grab hover:bg-[#ececec] dark:hover:bg-[#1f1f1f]"
              >📁 {p.name}</div>
            ))}
          </div>
        </div>
      )}
      {allCats.map((cat) => {
        const items = grouped[cat] || []
        const open = openCats.has(cat)
        return (
          <div
            key={cat}
            onDragOver={(e) => { e.preventDefault(); setOverCat(cat) }}
            onDragLeave={() => setOverCat(null)}
            onDrop={(e) => handleDrop(e, cat)}
            className={`rounded-[8px] border transition-all ${overCat === cat ? 'border-[#F4A259] bg-[#f5f5f5] dark:bg-[#181818]' : 'border-transparent'}`}
          >
            <button
              onClick={() => toggleCat(cat)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#ececec] dark:hover:bg-[#1f1f1f] rounded-[8px]"
            >
              <span className="text-xs text-[#8a8a8a]">{open ? '▼' : '▶'}</span>
              <span className="text-[11px] text-blue-600 font-bold">✅</span>
              <span className="text-sm font-bold text-[#181818] dark:text-white">{cat}</span>
              <span className="text-[11px] text-[#8a8a8a] ml-auto">{items.length}</span>
            </button>
            {open && (
              <div className="pl-8 pr-3 pb-2 space-y-1">
                {items.length === 0 && <div className="text-[11px] text-[#6a6a6a] py-1">— 비어 있음 —</div>}
                {items.map((p) => {
                  const total = (p.imageCount || 0) + (p.videoCount || 0)
                  return (
                    <div
                      key={p.id}
                      draggable
                      onDragStart={() => setDragId(p.id)}
                      onClick={() => onSelect(p.id)}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-[10px] hover:bg-[#ececec] dark:hover:bg-[#1f1f1f] cursor-grab text-sm"
                    >
                      <span className="text-[11px]">{total > 0 ? '🟢' : '⏳'}</span>
                      <span className="font-semibold text-[#e5e5e5] truncate flex-1">{p.name}</span>
                      <span className="text-[10px] text-[#8a8a8a]">{total}장</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function ProjectView({ isMobile }) {
  const { user } = useAuth()
  const { projects, loading, addProject, deleteProject, updateProject } = useProjects()
  const [selectedId, setSelectedIdRaw] = useState(null)

  // 프로젝트 상세 진입/이탈 시 브라우저 히스토리 관리
  const setSelectedId = (id) => {
    if (id && !selectedId) {
      // 프로젝트 상세로 진입 → 히스토리 push
      window.history.pushState({ page: 'projects', projectId: id }, '', '#projects')
    }
    setSelectedIdRaw(id)
  }

  useEffect(() => {
    const onPop = (e) => {
      // 브라우저 뒤로가기 시 프로젝트 상세에서 목록으로 복귀
      if (selectedId && (!e.state?.projectId)) {
        setSelectedIdRaw(null)
        // 이 이벤트를 소비해서 App.jsx의 popstate가 페이지를 바꾸지 않게 함
        window.history.pushState({ page: 'projects' }, '', '#projects')
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [selectedId])
  const [filter, setFilter] = useState('전체')
  const [viewMode, setViewMode] = useState('grid') // 'grid' | 'explorer'
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingProject, setEditingProject] = useState(null)
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkSelected, setBulkSelected] = useState(new Set())
  const [bulkCategory, setBulkCategory] = useState('')
  const [bulkCustomCat, setBulkCustomCat] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)
  const folderInputRef = useRef(null)
  const [folderImporting, setFolderImporting] = useState(false)
  const [importProgress, setImportProgress] = useState({ step: '', current: 0, total: 0, projectName: '', totalBytes: 0, uploadedBytes: 0, eta: '' })
  const importCancelRef = useRef(false)

  const DEFAULT_CATEGORIES = ['FASHION', 'BEAUTY', 'CELEBRITY', 'AD', 'PORTRAIT', 'PERSONAL WORK']
  const customCats = [...new Set(projects.map(p => p.category).filter(c => c && !DEFAULT_CATEGORIES.includes(c)))]
  const filters = ['전체', ...DEFAULT_CATEGORIES, ...customCats]
  const filtered = projects
    .filter(p => filter === '전체' || p.category === filter)
    .filter(p => {
      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase()
      return (p.name || '').toLowerCase().includes(q) || (p.client || '').toLowerCase().includes(q)
    })

  const selected = projects.find(p => p.id === selectedId)

  const getColor = (idx) => GRADIENT_COLORS[idx % GRADIENT_COLORS.length]

  const formatBytes = (bytes) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
  }

  const formatEta = (seconds) => {
    if (!seconds || !isFinite(seconds)) return '계산 중...'
    if (seconds < 60) return `약 ${Math.ceil(seconds)}초`
    if (seconds < 3600) return `약 ${Math.ceil(seconds / 60)}분`
    return `약 ${Math.floor(seconds / 3600)}시간 ${Math.ceil((seconds % 3600) / 60)}분`
  }

  const cancelImport = () => {
    importCancelRef.current = true
  }

  const toggleBulkSelect = (id) => {
    setBulkSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const selectAllFiltered = () => {
    if (bulkSelected.size === filtered.length) {
      setBulkSelected(new Set())
    } else {
      setBulkSelected(new Set(filtered.map(p => p.id)))
    }
  }

  const applyBulkCategory = async () => {
    if (!bulkCategory || bulkSelected.size === 0) return
    setBulkSaving(true)
    try {
      for (const id of bulkSelected) {
        await updateProject(id, { category: bulkCategory })
      }
      setBulkSelected(new Set())
      setBulkMode(false)
      setBulkCategory('')
    } catch (err) {
      alert('일괄 수정 실패: ' + err.message)
    } finally {
      setBulkSaving(false)
    }
  }

  const bulkDelete = async () => {
    if (bulkSelected.size === 0) return
    if (!window.confirm(`${bulkSelected.size}개 프로젝트를 삭제하시겠습니까?`)) return
    setBulkSaving(true)
    try {
      for (const id of bulkSelected) {
        await deleteProject(id)
      }
      setBulkSelected(new Set())
      setBulkMode(false)
    } catch (err) {
      alert('일괄 삭제 실패: ' + err.message)
    } finally {
      setBulkSaving(false)
    }
  }

  const exitBulkMode = () => {
    setBulkMode(false)
    setBulkSelected(new Set())
    setBulkCategory('')
    setBulkCustomCat('')
  }

  // ── 로컬 폴더 불러오기 ──
  const handleFolderImport = async (e) => {
    if (!user) return
    const files = Array.from(e.target.files)
    e.target.value = ''
    if (!files.length) return

    // webkitRelativePath로 하위 폴더별 그룹핑
    const IMAGE_EXTS = /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?|avif|svg)$/i
    const VIDEO_EXTS = /\.(mp4|mov|avi|mkv|webm|m4v|wmv|flv)$/i
    const isMediaFile = (f) => {
      if (f.type.startsWith('image/') || f.type.startsWith('video/')) return true
      return IMAGE_EXTS.test(f.name) || VIDEO_EXTS.test(f.name)
    }
    const isVideoFile = (f) => f.type.startsWith('video/') || VIDEO_EXTS.test(f.name)

    const folderMap = {}
    for (const file of files) {
      if (!isMediaFile(file)) continue
      const parts = file.webkitRelativePath.split('/')
      const folderName = parts.length >= 3 ? parts[1] : parts[0]
      if (!folderMap[folderName]) folderMap[folderName] = []
      folderMap[folderName].push(file)
    }

    const folders = Object.entries(folderMap)
    if (!folders.length) {
      alert('이미지/영상 파일이 없습니다.')
      return
    }

    const allMediaFiles = folders.reduce((arr, [, ff]) => [...arr, ...ff], [])
    const totalBytes = allMediaFiles.reduce((sum, f) => sum + f.size, 0)

    const confirmMsg = `${folders.length}개 폴더, 총 ${allMediaFiles.length}개 파일 (${formatBytes(totalBytes)})\n\n` +
      folders.map(([name, f]) => `📁 ${name} (${f.length}장, ${formatBytes(f.reduce((s, ff) => s + ff.size, 0))})`).join('\n') +
      '\n\n진행하시겠습니까?'
    if (!window.confirm(confirmMsg)) return

    setFolderImporting(true)
    importCancelRef.current = false
    let totalUploaded = 0
    let uploadedBytes = 0
    const totalFiles = allMediaFiles.length
    const startTime = Date.now()

    try {
      for (let fi = 0; fi < folders.length; fi++) {
        if (importCancelRef.current) break

        const [folderName, folderFiles] = folders[fi]
        setImportProgress({ step: 'project', current: totalUploaded, total: totalFiles, projectName: folderName, totalBytes, uploadedBytes, eta: formatEta(0) })

        // 프로젝트 생성
        const projectId = await addProject({
          name: folderName,
          client: '',
          category: '기타',
        })

        // 파일 업로드
        let imgCount = 0, vidCount = 0
        let firstImageUrl = null

        for (let i = 0; i < folderFiles.length; i++) {
          if (importCancelRef.current) break

          const file = folderFiles[i]
          const isVideo = isVideoFile(file)

          // ETA 계산
          const elapsed = (Date.now() - startTime) / 1000
          const speed = uploadedBytes > 0 ? uploadedBytes / elapsed : 0
          const remaining = totalBytes - uploadedBytes
          const eta = speed > 0 ? formatEta(remaining / speed) : '계산 중...'

          setImportProgress({
            step: 'upload',
            current: totalUploaded,
            total: totalFiles,
            projectName: folderName,
            totalBytes,
            uploadedBytes,
            eta,
          })

          // 이미지 자동 압축
          const compressed = await compressImage(file)
          const contentType = compressed.type || guessContentType(compressed.name)
          const storagePath = `users/${user.uid}/projects/${projectId}/${Date.now()}_${file.name}`
          const storageRef = ref(storage, storagePath)
          await uploadBytes(storageRef, compressed, { contentType, contentDisposition: 'inline' })
          const url = await getDownloadURL(storageRef)

          await addDoc(collection(db, 'assets'), {
            uid: user.uid,
            projectId,
            fileName: file.name,
            fileSize: file.size,
            fileType: contentType,
            isVideo,
            url,
            storagePath,
            createdAt: new Date().toISOString(),
          })

          if (isVideo) {
            vidCount++
            if (!firstImageUrl) firstImageUrl = url // 영상이라도 썸네일로
          } else {
            imgCount++
            firstImageUrl = firstImageUrl || url // 이미지 우선
          }

          totalUploaded++
          uploadedBytes += file.size
        }

        // 프로젝트 카운트 + 썸네일 업데이트
        if (imgCount > 0 || vidCount > 0) {
          const projectRef = doc(db, 'projects', projectId)
          await updateDoc(projectRef, {
            imageCount: imgCount,
            videoCount: vidCount,
            ...(firstImageUrl ? { thumbnailUrl: firstImageUrl } : {}),
            updatedAt: new Date().toISOString(),
          })
        }
      }

      if (importCancelRef.current) {
        alert(`업로드 취소됨. ${totalUploaded}개 파일까지 업로드 완료.`)
      } else {
        alert(`완료! ${folders.length}개 프로젝트, ${totalFiles}개 파일 업로드됨`)
      }
    } catch (err) {
      console.error('폴더 임포트 실패:', err)
      alert('업로드 중 오류 발생: ' + err.message)
    } finally {
      setFolderImporting(false)
      importCancelRef.current = false
      setImportProgress({ step: '', current: 0, total: 0, projectName: '', totalBytes: 0, uploadedBytes: 0, eta: '' })
    }
  }

  if (selected) {
    return (
      <ProjectDetail
        project={selected}
        projects={projects}
        getColor={getColor}
        onBack={() => setSelectedId(null)}
        onEdit={() => setEditingProject(selected)}
        onDelete={async () => {
          if (window.confirm('이 프로젝트를 삭제하시겠습니까?')) {
            await deleteProject(selected.id)
            setSelectedId(null)
          }
        }}
        editingProject={editingProject}
        setEditingProject={setEditingProject}
        updateProject={updateProject}
      />
    )
  }

  return (
    <PageTransition>
    <div className="space-y-6">
      {/* 헤더 */}
      <div className={`${isMobile ? 'space-y-3' : 'flex items-end justify-between'}`}>
        <div>
          <p className="text-[11px] tracking-[0.2em] uppercase text-[#8a8a8a] font-semibold">PROJECTS</p>
          <h1 className={`${isMobile ? 'text-2xl' : 'text-3xl'} font-black tracking-tighter text-[#181818] dark:text-white`}>프로젝트</h1>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8a8a8a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="프로젝트 검색..."
              className={`pl-9 pr-4 py-2.5 bg-[#f5f5f5] dark:bg-[#181818] rounded-full text-xs text-[#181818] dark:text-white outline-none shadow-md ${isMobile ? 'w-full' : 'w-52'}`}
            />
          </div>
          <div className="flex bg-[#f5f5f5] dark:bg-[#181818] rounded-full shadow-md border border-[#dcdcdc] dark:border-[#2a2a2a] p-1 flex-shrink-0">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${viewMode === 'grid' ? 'bg-[#F4A259] text-white' : 'text-[#6a6a6a] dark:text-[#b3b3b3]'}`}
            >프로젝트</button>
            <button
              onClick={() => setViewMode('explorer')}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${viewMode === 'explorer' ? 'bg-[#F4A259] text-white' : 'text-[#6a6a6a] dark:text-[#b3b3b3]'}`}
            >탐색기</button>
          </div>
          {!bulkMode ? (
            <button
              onClick={() => setBulkMode(true)}
              className="px-4 py-2.5 rounded-full text-xs font-bold transition-all flex-shrink-0 border bg-[#f5f5f5] dark:bg-[#181818] text-[#6a6a6a] dark:text-[#b3b3b3] border-[#dcdcdc] dark:border-[#2a2a2a] hover:bg-[#ececec] dark:hover:bg-[#1f1f1f] shadow-md"
            >
              선택
            </button>
          ) : (
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={exitBulkMode}
                className="px-4 py-2.5 rounded-full text-xs font-bold transition-all border bg-[#F4A259] text-white border-[#F4A259] shadow-md"
              >
                선택 취소
              </button>
              {bulkSelected.size > 0 && (
                <button
                  onClick={bulkDelete}
                  disabled={bulkSaving}
                  className="px-4 py-2.5 bg-red-500 text-white rounded-full text-xs font-bold hover:bg-red-600 transition-all disabled:opacity-50"
                >
                  {bulkSaving ? '삭제 중...' : `${bulkSelected.size}개 삭제`}
                </button>
              )}
            </div>
          )}
          <input
            ref={folderInputRef}
            type="file"
            className="hidden"
            onChange={handleFolderImport}
            {...{ webkitdirectory: '', directory: '' }}
          />
          {!bulkMode && (
            <>
              <button
                onClick={() => folderInputRef.current?.click()}
                disabled={folderImporting}
                className="px-5 py-2.5 bg-[#f5f5f5] dark:bg-[#181818] text-[#4a4a4a] dark:text-[#cbcbcb] rounded-full text-xs font-bold shadow-md hover:bg-[#ececec] dark:hover:bg-[#1f1f1f] transition-all flex-shrink-0 border border-[#dcdcdc] dark:border-[#2a2a2a] disabled:opacity-50"
              >
                📁 폴더 불러오기
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-5 py-2.5 bg-[#F4A259] text-white rounded-full text-xs font-bold shadow-lg hover:bg-[#6366F1] transition-all flex-shrink-0"
              >
                + 새 프로젝트
              </button>
            </>
          )}
          {bulkMode && (
            <>
              <button
                onClick={selectAllFiltered}
                className="px-4 py-2.5 bg-[#f5f5f5] dark:bg-[#181818] text-[#6a6a6a] dark:text-[#b3b3b3] rounded-full text-xs font-bold shadow-md border border-[#dcdcdc] dark:border-[#2a2a2a] hover:bg-[#ececec] dark:hover:bg-[#1f1f1f] transition-all flex-shrink-0"
              >
                {bulkSelected.size === filtered.length ? '전체 해제' : '전체 선택'}
              </button>
            </>
          )}
        </div>
      </div>

      {viewMode === 'explorer' && (
        <ExplorerView
          projects={projects}
          categories={[...DEFAULT_CATEGORIES, ...customCats]}
          onMove={async (projectId, category) => {
            await updateProject(projectId, { category })
          }}
          onSelect={setSelectedId}
        />
      )}

      {viewMode === 'grid' && <>
      {/* 필터 */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-5 py-2.5 rounded-full text-sm font-bold transition-all flex-shrink-0
              ${filter === f ? 'bg-[#F4A259] text-white shadow-md' : 'bg-[#f5f5f5] dark:bg-[#181818] text-[#6a6a6a] dark:text-[#b3b3b3] hover:bg-[#e4e4e4] dark:hover:bg-[#252525] shadow-sm border border-[#dcdcdc] dark:border-[#2a2a2a]'}`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* 프로젝트 카드 그리드 */}
      {loading ? (
        <GridSkeleton count={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={filter === '전체' ? '📸' : '🔍'}
          title={filter === '전체' ? '아직 프로젝트가 없습니다' : `'${filter}' 프로젝트가 없습니다`}
          description={filter === '전체' ? '첫 번째 프로젝트를 만들어 포트폴리오를 시작하세요' : '다른 카테고리를 확인해보세요'}
          action={filter === '전체' ? () => setShowAddModal(true) : null}
          actionLabel="+ 첫 프로젝트 만들기"
        />
      ) : (
        <div className={`grid ${isMobile ? 'grid-cols-2' : 'grid-cols-3'} gap-4`}>
          {filtered.map((p, i) => (
            <div
              key={p.id}
              className={`bg-[#f5f5f5] dark:bg-[#181818] rounded-[12px] overflow-hidden shadow-md hover:shadow-xl transition-all text-left group relative cursor-pointer ${
                bulkMode && bulkSelected.has(p.id) ? 'ring-2 ring-[#F4A259] shadow-lg' : ''
              }`}
              onClick={() => bulkMode ? toggleBulkSelect(p.id) : setSelectedId(p.id)}
            >
              <div className={`${isMobile ? 'h-32' : 'h-44'} relative overflow-hidden bg-gradient-to-br ${getColor(i)}`}>
                <ProjectThumb project={p} />
                {bulkMode && (
                  <div className={`absolute top-3 left-3 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                    bulkSelected.has(p.id)
                      ? 'bg-[#F4A259] border-[#F4A259] text-white'
                      : 'bg-[#f5f5f5] dark:bg-[#181818]/80 border-[#dcdcdc] dark:border-[#2a2a2a]'
                  }`}>
                    {bulkSelected.has(p.id) && (
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    )}
                  </div>
                )}
                {!bulkMode && p.embargoStatus === 'active' && (
                  <div className="absolute top-3 left-3 bg-amber-400 text-white text-[9px] font-bold px-3 py-1 rounded-full">
                    EMBARGO
                  </div>
                )}
                <div className="absolute bottom-3 right-3 bg-[#f5f5f5] dark:bg-[#181818]/80 text-[10px] font-bold px-2 py-1 rounded-full">
                  {(p.imageCount || 0) + (p.videoCount || 0)}장
                </div>
                {/* 호버 수정 버튼 */}
                {!bulkMode && (
                  <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-all flex gap-1.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingProject(p) }}
                      className="w-8 h-8 bg-[#f5f5f5] dark:bg-[#181818]/90 hover:bg-[#f5f5f5] dark:hover:bg-[#181818] rounded-full flex items-center justify-center shadow-md text-[#6a6a6a] dark:text-[#b3b3b3] hover:text-[#F4A259] transition-all"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); if (window.confirm('이 프로젝트를 삭제하시겠습니까?')) deleteProject(p.id) }}
                      className="w-8 h-8 bg-[#f5f5f5] dark:bg-[#181818]/90 hover:bg-[#f5f5f5] dark:hover:bg-[#181818] rounded-full flex items-center justify-center shadow-md text-[#6a6a6a] dark:text-[#b3b3b3] hover:text-red-500 transition-all"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  </div>
                )}
              </div>
              <div className={isMobile ? 'p-3' : 'p-5'}>
                <p className="text-[11px] tracking-[0.15em] uppercase text-[#8a8a8a] font-semibold truncate">{p.client || 'CLIENT'}</p>
                <p className="text-base font-bold text-[#181818] dark:text-white tracking-tight mt-1 group-hover:text-[#F4A259] transition-colors line-clamp-1">{p.name}</p>
                <div className="flex items-center gap-2 mt-2.5 overflow-hidden">
                  <span className="text-xs bg-[#e4e4e4] dark:bg-[#252525] text-[#6a6a6a] dark:text-[#b3b3b3] px-3 py-1 rounded-full font-semibold flex-shrink-0">{p.category}</span>
                  {!isMobile && <span className="text-xs text-[#8a8a8a] truncate">{p.createdAt?.slice(0, 10)}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      </>}

      {/* 일괄 편집 액션바 */}
      {bulkMode && bulkSelected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#f5f5f5] dark:bg-[#181818] rounded-[12px] shadow-2xl px-5 py-3 z-40 flex items-center gap-3" style={{ maxWidth: '90vw' }}>
          <div className="text-sm font-black tracking-tighter text-[#181818] dark:text-white whitespace-nowrap">
            {bulkSelected.size}개 선택
          </div>
          <div className="w-px h-6 bg-[#dcdcdc] dark:bg-[#2a2a2a]" />
          <div className="flex flex-wrap gap-1.5 items-center">
            {[...DEFAULT_CATEGORIES, ...customCats].map((c) => (
              <button
                key={c}
                onClick={() => setBulkCategory(c)}
                className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition-all
                  ${bulkCategory === c ? 'bg-[#F4A259] text-white shadow-sm' : 'bg-[#f5f5f5] dark:bg-[#181818] border border-[#dcdcdc] dark:border-[#2a2a2a] text-[#6a6a6a] dark:text-[#b3b3b3] hover:bg-[#ececec] dark:hover:bg-[#1f1f1f] shadow-sm'}`}
              >
                {c}
              </button>
            ))}
            <input
              className="w-20 px-2 py-1.5 bg-[#f5f5f5] dark:bg-[#181818] rounded-[8px] text-[10px] text-[#181818] dark:text-white outline-none"
              placeholder="직접 입력"
              value={bulkCustomCat}
              onChange={(e) => setBulkCustomCat(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === 'Enter' && bulkCustomCat.trim()) { setBulkCategory(bulkCustomCat.trim()); setBulkCustomCat('') } }}
            />
          </div>
          <button
            onClick={applyBulkCategory}
            disabled={!bulkCategory || bulkSaving}
            className="px-5 py-2.5 bg-[#F4A259] text-white rounded-full text-xs font-bold shadow-lg hover:bg-[#6366F1] transition-all disabled:opacity-50 whitespace-nowrap"
          >
            {bulkSaving ? '적용 중...' : '일괄 적용'}
          </button>
          <button
            onClick={bulkDelete}
            disabled={bulkSaving}
            className="px-5 py-2.5 bg-red-500 text-white rounded-full text-xs font-bold shadow-lg shadow-red-500/25 hover:bg-red-600 transition-all disabled:opacity-50 whitespace-nowrap"
          >
            삭제
          </button>
        </div>
      )}

      {/* 프로젝트 추가 모달 */}
      {showAddModal && (
        <ProjectModal
          onClose={() => setShowAddModal(false)}
          onSave={async (data) => { await addProject(data); setShowAddModal(false) }}
        />
      )}

      {/* 프로젝트 수정 모달 */}
      {editingProject && (
        <ProjectModal
          project={editingProject}
          onClose={() => setEditingProject(null)}
          onSave={async (data) => { await updateProject(editingProject.id, data); setEditingProject(null) }}
        />
      )}

      {/* 폴더 임포트 진행 오버레이 */}
      {folderImporting && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#f5f5f5] dark:bg-[#181818] rounded-[16px] p-8 max-w-sm w-full shadow-2xl text-center">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[#f5f5f5] dark:bg-[#181818] flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-[#F4A259] border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="text-[11px] tracking-[0.2em] uppercase text-[#F4A259] font-bold mb-1">IMPORTING</p>
            <h3 className="text-lg font-black tracking-tighter text-[#181818] dark:text-white mb-2">폴더 불러오는 중</h3>
            <p className="text-sm font-bold text-[#4a4a4a] dark:text-[#cbcbcb] mb-1">{importProgress.projectName}</p>
            <p className="text-xs text-[#8a8a8a] mb-1">
              {importProgress.step === 'upload'
                ? `파일 업로드 ${importProgress.current} / ${importProgress.total}`
                : `프로젝트 생성 중...`}
            </p>
            {/* 용량 + ETA */}
            <div className="flex items-center justify-center gap-3 text-[10px] text-[#8a8a8a] mb-4">
              <span>{formatBytes(importProgress.uploadedBytes)} / {formatBytes(importProgress.totalBytes)}</span>
              <span>·</span>
              <span>{importProgress.eta || '계산 중...'}</span>
            </div>
            <div className="w-full h-2 bg-[#dcdcdc] dark:bg-[#2a2a2a] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#F4A259] rounded-full transition-all duration-300"
                style={{ width: `${importProgress.total ? Math.round((importProgress.current / importProgress.total) * 100) : 0}%` }}
              />
            </div>
            <p className="text-[10px] text-[#8a8a8a] mt-2 mb-4">
              {importProgress.total ? Math.round((importProgress.current / importProgress.total) * 100) : 0}%
            </p>
            <button
              onClick={cancelImport}
              className="px-6 py-2.5 bg-[#f5f5f5] dark:bg-[#181818] text-[#6a6a6a] dark:text-[#b3b3b3] rounded-full text-xs font-bold hover:bg-red-50 hover:text-red-500 transition-all"
            >
              업로드 취소
            </button>
          </div>
        </div>
      )}
    </div>
    </PageTransition>
  )
}

function ProjectDetail({ project, projects, getColor, onBack, onEdit, onDelete, editingProject, setEditingProject, updateProject }) {
  const { assets, uploading, uploadProgress, uploadFiles, deleteAsset, reorderAssets } = useAssets(project.id)
  const [dragAssetId, setDragAssetId] = useState(null)
  const fileInputRef = useRef(null)
  const [lightboxIdx, setLightboxIdxRaw] = useState(null)
  const setLightboxIdx = (idx) => {
    if (idx !== null && lightboxIdx === null) {
      // 라이트박스 열릴 때 히스토리 push
      window.history.pushState({ page: 'projects', lightbox: true }, '', '#projects')
    }
    setLightboxIdxRaw(idx)
  }
  useEffect(() => {
    const onPop = () => {
      if (lightboxIdx !== null) { setLightboxIdxRaw(null) }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [lightboxIdx])
  const [assetFilter, setAssetFilter] = useState('all') // all | image | video
  const [sortBy, setSortBy] = useState('manual') // manual | newest | oldest | name
  const [showShareModal, setShowShareModal] = useState(false)

  // 라이트박스 이웃 이미지 프리로드 → 좌우 이동 즉시 반응
  useEffect(() => {
    if (lightboxIdx == null) return
    const neighbors = [lightboxIdx + 1, lightboxIdx - 1]
    neighbors.forEach(i => {
      const url = imageAssets[i]?.url
      if (url) { const img = new Image(); img.decoding = 'async'; img.src = url }
    })
  }, [lightboxIdx]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files)
    if (files.length > 0) uploadFiles(files)
    e.target.value = ''
  }

  const handleDrop = (e) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files).filter(
      f => f.type.startsWith('image/') || f.type.startsWith('video/')
    )
    if (files.length > 0) uploadFiles(files)
  }

  // 필터 + 정렬
  const filteredAssets = assets
    .filter(a => assetFilter === 'all' ? true : assetFilter === 'image' ? !a.isVideo : a.isVideo)
    .sort((a, b) => {
      if (sortBy === 'manual') return 0 // hook이 이미 order 순으로 반환
      if (sortBy === 'newest') return (b.createdAt || '').localeCompare(a.createdAt || '')
      if (sortBy === 'oldest') return (a.createdAt || '').localeCompare(b.createdAt || '')
      return (a.fileName || '').localeCompare(b.fileName || '')
    })

  // 라이트박스용 이미지만
  const imageAssets = filteredAssets.filter(a => !a.isVideo)

  // 라이트박스 키보드 네비게이션 (←→ 화살표, ESC 닫기)
  useEffect(() => {
    if (lightboxIdx == null) return
    const handleKey = (e) => {
      if (e.key === 'ArrowLeft' && lightboxIdx > 0) setLightboxIdx(lightboxIdx - 1)
      else if (e.key === 'ArrowRight' && lightboxIdx < imageAssets.length - 1) setLightboxIdx(lightboxIdx + 1)
      else if (e.key === 'Escape') setLightboxIdx(null)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [lightboxIdx, imageAssets.length])

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="text-sm text-[#F4A259] font-bold hover:underline">← 프로젝트 목록</button>

      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] tracking-[0.2em] uppercase text-[#8a8a8a] font-semibold">{project.client || 'CLIENT'}</p>
          <h1 className="text-3xl font-black tracking-tighter text-[#181818] dark:text-white">{project.name}</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          {project.embargoStatus === 'active' && (
            <span className="text-[11px] bg-[#f5f5f5] dark:bg-[#181818] text-[#F4A259] px-4 py-2 rounded-full font-bold border border-[#F4A259]">
              엠바고: {project.embargoDate?.includes('T') ? project.embargoDate.replace('T', ' ') : project.embargoDate}
            </span>
          )}
          <span className="text-[11px] bg-[#f5f5f5] dark:bg-[#181818] text-[#F4A259] px-4 py-2 rounded-full font-bold">{project.category}</span>
          <button onClick={() => setShowShareModal(true)} className="text-[11px] bg-[#F4A259] text-black px-4 py-2 rounded-full font-bold hover:brightness-110 flex items-center gap-1.5">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M16 8l-4-4-4 4m4-4v12"/></svg>
            무압축 공유
          </button>
          <button onClick={onEdit} className="text-[11px] bg-[#f5f5f5] dark:bg-[#181818] text-[#6a6a6a] dark:text-[#b3b3b3] px-4 py-2 rounded-full font-bold hover:bg-[#dcdcdc] dark:hover:bg-[#2a2a2a] border border-[#dcdcdc] dark:border-[#2a2a2a]">수정</button>
          <button onClick={onDelete} className="text-[11px] bg-red-50 text-red-500 px-4 py-2 rounded-full font-bold hover:bg-red-100">삭제</button>
        </div>
      </div>

      {showShareModal && <ProjectShareModal project={project} assets={assets} onClose={() => setShowShareModal(false)} />}

      {/* 통계 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#f5f5f5] dark:bg-[#181818] rounded-[20px] p-5 shadow-sm">
          <p className="text-[10px] tracking-[0.2em] uppercase text-[#8a8a8a] font-semibold">IMAGES</p>
          <p className="text-2xl font-black tracking-tighter text-[#181818] dark:text-white">{assets.filter(a => !a.isVideo).length}</p>
        </div>
        <div className="bg-[#f5f5f5] dark:bg-[#181818] rounded-[20px] p-5 shadow-sm">
          <p className="text-[10px] tracking-[0.2em] uppercase text-[#8a8a8a] font-semibold">VIDEOS</p>
          <p className="text-2xl font-black tracking-tighter text-[#181818] dark:text-white">{assets.filter(a => a.isVideo).length}</p>
        </div>
        <div className="bg-[#f5f5f5] dark:bg-[#181818] rounded-[20px] p-5 shadow-sm">
          <p className="text-[10px] tracking-[0.2em] uppercase text-[#8a8a8a] font-semibold">CATEGORY</p>
          <p className="text-2xl font-black tracking-tighter text-[#181818] dark:text-white truncate">{project.category}</p>
        </div>
        <div className="bg-[#f5f5f5] dark:bg-[#181818] rounded-[20px] p-5 shadow-sm">
          <p className="text-[10px] tracking-[0.2em] uppercase text-[#8a8a8a] font-semibold">STATUS</p>
          <p className="text-2xl font-black tracking-tighter text-[#181818] dark:text-white">{project.embargoStatus === 'active' ? '🔒' : '✅'}</p>
        </div>
      </div>

      {/* 작업물 영역 */}
      <div className="bg-[#f5f5f5] dark:bg-[#181818] rounded-[12px] p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-black tracking-tighter text-[#181818] dark:text-white">작업물</h2>
          <div className="flex items-center gap-3">
            {/* 필터 토글 */}
            <div className="flex bg-[#f5f5f5] dark:bg-[#181818] rounded-full p-0.5">
              {[{ id: 'all', label: '전체' }, { id: 'image', label: '사진' }, { id: 'video', label: '영상' }].map(f => (
                <button
                  key={f.id}
                  onClick={() => setAssetFilter(f.id)}
                  className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition-all
                    ${assetFilter === f.id ? 'bg-[#f5f5f5] dark:bg-[#181818] text-[#181818] dark:text-white shadow-sm' : 'text-[#8a8a8a]'}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {/* 정렬 */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="text-[10px] font-bold text-[#6a6a6a] dark:text-[#b3b3b3] bg-[#f5f5f5] dark:bg-[#181818] rounded-full px-3 py-1.5 outline-none cursor-pointer"
            >
              <option value="manual">수동 정렬</option>
              <option value="newest">최신순</option>
              <option value="oldest">오래된순</option>
              <option value="name">파일명순</option>
            </select>
            {uploading && (
              <div className="flex items-center gap-2">
                <div className="w-24 h-2 bg-[#dcdcdc] dark:bg-[#2a2a2a] rounded-full overflow-hidden">
                  <div className="h-full bg-[#F4A259] rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
                </div>
                <span className="text-[10px] text-[#8a8a8a]">{uploadProgress}%</span>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*"
              className="hidden"
              onChange={handleFileSelect}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="px-4 py-2 bg-[#F4A259] text-white rounded-full text-xs font-bold hover:bg-[#6366F1] disabled:opacity-50 transition-all"
            >
              + 업로드
            </button>
          </div>
        </div>

        {filteredAssets.length === 0 && !uploading ? (
          <div
            className="border-2 border-dashed border-[#dcdcdc] dark:border-[#2a2a2a] rounded-[20px] p-12 text-center hover:border-[#F4A259] transition-all cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            <p className="text-[#8a8a8a] text-sm mb-2">이미지나 영상을 드래그하거나 클릭하여 업로드</p>
            <p className="text-xs text-[#6a6a6a]">JPG, PNG, MP4, MOV 지원</p>
          </div>
        ) : (
          <div
            className="grid grid-cols-2 md:grid-cols-4 gap-3"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            {filteredAssets.map((asset, idx) => {
              const imgIdx = !asset.isVideo ? imageAssets.indexOf(asset) : -1
              const isFirst = idx === 0 && sortBy === 'manual'
              return (
                <div
                  key={asset.id}
                  draggable={sortBy === 'manual'}
                  onDragStart={() => setDragAssetId(asset.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={async (e) => {
                    e.preventDefault()
                    if (!dragAssetId || dragAssetId === asset.id) return
                    const ids = filteredAssets.map(a => a.id)
                    const fromIdx = ids.indexOf(dragAssetId)
                    const toIdx = ids.indexOf(asset.id)
                    if (fromIdx < 0 || toIdx < 0) return
                    const reordered = [...ids]
                    const [moved] = reordered.splice(fromIdx, 1)
                    reordered.splice(toIdx, 0, moved)
                    setDragAssetId(null)
                    await reorderAssets(reordered)
                  }}
                  className={`aspect-square rounded-[14px] overflow-hidden relative group ${sortBy === 'manual' ? 'cursor-grab' : 'cursor-pointer'} ${dragAssetId === asset.id ? 'opacity-40' : ''}`}
                  onClick={() => { if (!asset.isVideo && imgIdx >= 0) setLightboxIdx(imgIdx) }}
                >
                  {isFirst && (
                    <div className="absolute top-2 left-2 z-10 bg-[#F4A259] text-white text-[9px] font-black tracking-wider px-2 py-1 rounded-full shadow-lg">
                      ⭐ 썸네일
                    </div>
                  )}
                  {asset.isVideo ? (
                    (asset.videoThumbnailUrl || asset.bunnyVideoId) ? (
                      <img
                        src={asset.videoThumbnailUrl || `https://vz-cd1dda72-832.b-cdn.net/${asset.bunnyVideoId}/thumbnail.jpg`}
                        alt={asset.fileName}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        decoding="async"
                        onError={(e) => { e.target.style.display = 'none' }}
                      />
                    ) : (
                      <video src={asset.url} className="w-full h-full object-cover" muted preload="metadata" />
                    )
                  ) : (
                    <img
                      src={asset.thumbUrl || asset.url}
                      alt={asset.fileName}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  )}
                  {asset.isVideo && (
                    <div className="absolute top-2 right-2 bg-[#f5f5f5] dark:bg-[#181818]/80 rounded-full w-6 h-6 flex items-center justify-center">
                      <span className="text-[10px]">▶</span>
                    </div>
                  )}
                  {/* 파일명 + 삭제 (hover) */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center gap-2">
                    <p className="text-[#181818] dark:text-white text-[10px] font-medium truncate max-w-[90%] px-2">{asset.fileName}</p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (window.confirm('이 파일을 삭제하시겠습니까?')) deleteAsset(asset)
                      }}
                      className="bg-[#f5f5f5] dark:bg-[#181818]/90 text-red-500 text-xs font-bold px-3 py-1.5 rounded-full hover:bg-[#f5f5f5] dark:hover:bg-[#181818]"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              )
            })}
            {/* 추가 업로드 카드 */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="aspect-square rounded-[14px] bg-[#f5f5f5] dark:bg-[#181818] flex items-center justify-center cursor-pointer hover:bg-[#dcdcdc] dark:hover:bg-[#2a2a2a] transition-all border-2 border-dashed border-[#dcdcdc] dark:border-[#2a2a2a]"
            >
              <span className="text-2xl text-[#8a8a8a]">+</span>
            </div>
          </div>
        )}
      </div>

      {/* 라이트박스 */}
      {lightboxIdx !== null && imageAssets[lightboxIdx] && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center"
          onClick={() => setLightboxIdx(null)}
        >
          {/* 닫기 */}
          <button
            onClick={() => setLightboxIdx(null)}
            className="absolute top-6 right-6 w-10 h-10 bg-[#f5f5f5] dark:bg-[#181818]/10 hover:bg-[#f5f5f5] dark:hover:bg-[#181818]/20 rounded-full flex items-center justify-center text-[#181818] dark:text-white text-lg transition-all"
          >
            ✕
          </button>

          {/* 카운터 */}
          <div className="absolute top-6 left-6 text-white/60 text-sm font-bold">
            {lightboxIdx + 1} / {imageAssets.length}
          </div>

          {/* 이전 */}
          {lightboxIdx > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx - 1) }}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-14 h-14 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white text-3xl transition-all"
            >
              ‹
            </button>
          )}

          {/* 이미지 */}
          <img
            src={imageAssets[lightboxIdx].url}
            alt={imageAssets[lightboxIdx].fileName}
            className="max-w-[85vw] max-h-[85vh] object-contain rounded-[8px]"
            onClick={(e) => e.stopPropagation()}
            decoding="async"
            fetchpriority="high"
          />

          {/* 다음 */}
          {lightboxIdx < imageAssets.length - 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx + 1) }}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-14 h-14 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white text-3xl transition-all"
            >
              ›
            </button>
          )}

          {/* 파일 정보 */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-center">
            <p className="text-white/80 text-sm font-bold">{imageAssets[lightboxIdx].fileName}</p>
          </div>
        </div>
      )}

      {/* 프로젝트 수정 모달 */}
      {editingProject && (
        <ProjectModal
          project={editingProject}
          onClose={() => setEditingProject(null)}
          onSave={async (data) => { await updateProject(editingProject.id, data); setEditingProject(null) }}
        />
      )}
    </div>
  )
}

function ProjectModal({ project, onClose, onSave }) {
  const [name, setName] = useState(project?.name || '')
  const [client, setClient] = useState(project?.client || '')
  const [category, setCategory] = useState(project?.category || 'FASHION')
  const [embargoDate, setEmbargoDate] = useState(project?.embargoDate?.slice(0, 10) || '')
  const [embargoTime, setEmbargoTime] = useState(project?.embargoDate?.slice(11, 16) || '00:00')
  const [saving, setSaving] = useState(false)
  const [customCat, setCustomCat] = useState('')

  const categories = ['FASHION', 'BEAUTY', 'CELEBRITY', 'AD', 'PORTRAIT', 'PERSONAL WORK']

  const handleSubmit = async () => {
    if (!name.trim()) return
    setSaving(true)
    await onSave({
      name: name.trim(),
      client: client.trim(),
      category,
      embargoDate: embargoDate ? `${embargoDate}T${embargoTime || '00:00'}` : null,
      embargoStatus: embargoDate ? 'active' : 'none',
    })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[#f5f5f5] dark:bg-[#181818] rounded-[16px] p-8 max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-[11px] tracking-[0.2em] uppercase text-[#F4A259] font-bold mb-1">{project ? 'EDIT PROJECT' : 'NEW PROJECT'}</p>
        <h2 className="text-2xl font-black tracking-tighter text-[#181818] dark:text-white mb-6">{project ? '프로젝트 수정' : '새 프로젝트'}</h2>

        <div className="space-y-4">
          <div>
            <label className="text-[11px] tracking-[0.15em] uppercase text-[#8a8a8a] font-semibold">PROJECT NAME</label>
            <input
              className="w-full mt-1 px-4 py-3 bg-[#f5f5f5] dark:bg-[#181818] border border-[#dcdcdc] dark:border-[#2a2a2a] rounded-[12px] text-sm text-[#181818] dark:text-white outline-none"
              placeholder="예: VOGUE KOREA 화보"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-[11px] tracking-[0.15em] uppercase text-[#8a8a8a] font-semibold">CLIENT</label>
            <input
              className="w-full mt-1 px-4 py-3 bg-[#f5f5f5] dark:bg-[#181818] border border-[#dcdcdc] dark:border-[#2a2a2a] rounded-[12px] text-sm text-[#181818] dark:text-white outline-none"
              placeholder="클라이언트명"
              value={client}
              onChange={(e) => setClient(e.target.value)}
            />
          </div>
          <div>
            <label className="text-[11px] tracking-[0.15em] uppercase text-[#8a8a8a] font-semibold">CATEGORY</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`px-4 py-2.5 rounded-full text-xs font-bold transition-all
                    ${category === c ? 'bg-[#F4A259] text-white shadow-md' : 'bg-[#f5f5f5] dark:bg-[#181818] border border-[#dcdcdc] dark:border-[#2a2a2a] text-[#6a6a6a] dark:text-[#b3b3b3] hover:bg-[#ececec] dark:hover:bg-[#1f1f1f] shadow-sm'}`}
                >
                  {c}
                </button>
              ))}
              {category && !categories.includes(category) && (
                <button className="px-4 py-2.5 rounded-full text-xs font-bold bg-[#F4A259] text-white shadow-md">
                  {category}
                </button>
              )}
            </div>
            <div className="flex gap-2 mt-2">
              <input
                className="flex-1 px-3 py-2 bg-[#f5f5f5] dark:bg-[#181818] border border-[#dcdcdc] dark:border-[#2a2a2a] rounded-[12px] text-xs text-[#181818] dark:text-white outline-none"
                placeholder="직접 입력"
                value={customCat}
                onChange={(e) => setCustomCat(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === 'Enter' && customCat.trim()) { setCategory(customCat.trim()); setCustomCat('') } }}
              />
              <button
                onClick={() => { if (customCat.trim()) { setCategory(customCat.trim()); setCustomCat('') } }}
                className="px-3 py-2 bg-[#F4A259] text-white rounded-[12px] text-xs font-bold hover:bg-[#6b77e6] transition-colors"
              >+</button>
            </div>
          </div>
          <div>
            <label className="text-[11px] tracking-[0.15em] uppercase text-[#8a8a8a] font-semibold">EMBARGO DATE (선택)</label>
            <div className="flex gap-2 mt-1">
              <input
                type="date"
                className="flex-1 px-4 py-3 bg-[#f5f5f5] dark:bg-[#181818] border border-[#dcdcdc] dark:border-[#2a2a2a] rounded-[12px] text-sm text-[#181818] dark:text-white outline-none"
                value={embargoDate}
                onChange={(e) => setEmbargoDate(e.target.value)}
              />
              <input
                type="time"
                className="w-[120px] px-3 py-3 bg-[#f5f5f5] dark:bg-[#181818] border border-[#dcdcdc] dark:border-[#2a2a2a] rounded-[12px] text-sm text-[#181818] dark:text-white outline-none"
                value={embargoTime}
                onChange={(e) => setEmbargoTime(e.target.value)}
                disabled={!embargoDate}
              />
            </div>
            {embargoDate && (
              <p className="text-[10px] text-[#8a8a8a] mt-1.5 ml-1">
                {embargoDate} {embargoTime} 업로드 예정
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-3 mt-8">
          <button onClick={onClose} className="flex-1 py-4 bg-[#f5f5f5] dark:bg-[#181818] text-[#6a6a6a] dark:text-[#b3b3b3] rounded-[8px] font-bold text-sm hover:bg-[#dcdcdc] dark:hover:bg-[#2a2a2a] transition-all">
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || saving}
            className="flex-1 py-4 bg-[#F4A259] text-white rounded-[8px] font-bold text-sm hover:bg-[#6366F1] transition-all shadow-lg disabled:opacity-50"
          >
            {saving ? '저장 중...' : project ? '수정 완료' : '프로젝트 생성'}
          </button>
        </div>
      </div>
    </div>
  )
}
