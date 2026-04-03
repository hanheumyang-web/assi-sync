import { useState, useRef } from 'react'
import { useProjects } from '../hooks/useProjects'
import { useAssets } from '../hooks/useAssets'
import { PageTransition, GridSkeleton, EmptyState } from './UIKit'

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

export default function ProjectView({ isMobile }) {
  const { projects, loading, addProject, deleteProject, updateProject } = useProjects()
  const [selectedId, setSelectedId] = useState(null)
  const [filter, setFilter] = useState('전체')
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingProject, setEditingProject] = useState(null)

  const filters = ['전체', '화보', '광고', '웨딩', '프로필', '영상', '기타']
  const filtered = projects
    .filter(p => filter === '전체' || p.category === filter)
    .filter(p => {
      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase()
      return (p.name || '').toLowerCase().includes(q) || (p.client || '').toLowerCase().includes(q)
    })

  const selected = projects.find(p => p.id === selectedId)

  const getColor = (idx) => GRADIENT_COLORS[idx % GRADIENT_COLORS.length]

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
          <p className="text-[11px] tracking-[0.2em] uppercase text-gray-400 font-semibold">PROJECTS</p>
          <h1 className={`${isMobile ? 'text-2xl' : 'text-3xl'} font-black tracking-tighter text-gray-900`}>프로젝트</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="프로젝트 검색..."
              className={`pl-9 pr-4 py-2.5 bg-white rounded-full text-xs text-gray-900 outline-none focus:ring-2 focus:ring-[#828DF8]/30 shadow-sm ${isMobile ? 'w-full' : 'w-52'}`}
            />
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-5 py-2.5 bg-[#828DF8] text-white rounded-full text-xs font-bold shadow-lg shadow-[#828DF8]/25 hover:bg-[#6366F1] transition-all flex-shrink-0"
          >
            + 새 프로젝트
          </button>
        </div>
      </div>

      {/* 필터 */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-5 py-2.5 rounded-full text-xs font-bold transition-all
              ${filter === f ? 'bg-[#828DF8] text-white shadow-md' : 'bg-white text-gray-500 hover:bg-gray-100 shadow-sm'}`}
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
        <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-3'} gap-5`}>
          {filtered.map((p, i) => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className="bg-white rounded-[24px] overflow-hidden shadow-sm hover:shadow-xl transition-all text-left group"
            >
              <div className={`h-40 relative overflow-hidden ${p.thumbnailUrl ? '' : `bg-gradient-to-br ${getColor(i)}`}`}>
                {p.thumbnailUrl && (
                  <img src={p.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                )}
                {p.embargoStatus === 'active' && (
                  <div className="absolute top-3 left-3 bg-amber-400 text-white text-[9px] font-bold px-3 py-1 rounded-full">
                    EMBARGO
                  </div>
                )}
                <div className="absolute bottom-3 right-3 bg-white/80 text-[10px] font-bold px-2 py-1 rounded-full">
                  {p.imageCount || 0}장
                </div>
              </div>
              <div className="p-5">
                <p className="text-[10px] tracking-[0.15em] uppercase text-gray-400 font-semibold">{p.client || 'CLIENT'}</p>
                <p className="text-sm font-bold text-gray-900 tracking-tight mt-0.5 group-hover:text-[#828DF8] transition-colors">{p.name}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] bg-[#F4F3EE] text-gray-500 px-2 py-0.5 rounded-full font-semibold">{p.category}</span>
                  <span className="text-[10px] text-gray-400">{p.createdAt?.slice(0, 10)}</span>
                </div>
              </div>
            </button>
          ))}
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
    </div>
    </PageTransition>
  )
}

function ProjectDetail({ project, projects, getColor, onBack, onEdit, onDelete, editingProject, setEditingProject, updateProject }) {
  const { assets, uploading, uploadProgress, uploadFiles, deleteAsset } = useAssets(project.id)
  const fileInputRef = useRef(null)
  const [lightboxIdx, setLightboxIdx] = useState(null)
  const [assetFilter, setAssetFilter] = useState('all') // all | image | video
  const [sortBy, setSortBy] = useState('newest') // newest | oldest | name

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
      if (sortBy === 'newest') return (b.createdAt || '').localeCompare(a.createdAt || '')
      if (sortBy === 'oldest') return (a.createdAt || '').localeCompare(b.createdAt || '')
      return (a.fileName || '').localeCompare(b.fileName || '')
    })

  // 라이트박스용 이미지만
  const imageAssets = filteredAssets.filter(a => !a.isVideo)

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="text-sm text-[#828DF8] font-bold hover:underline">← 프로젝트 목록</button>

      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] tracking-[0.2em] uppercase text-gray-400 font-semibold">{project.client || 'CLIENT'}</p>
          <h1 className="text-3xl font-black tracking-tighter text-gray-900">{project.name}</h1>
        </div>
        <div className="flex gap-2">
          {project.embargoStatus === 'active' && (
            <span className="text-[10px] bg-amber-100 text-amber-700 px-4 py-2 rounded-full font-bold">엠바고: {project.embargoDate}</span>
          )}
          <span className="text-[10px] bg-[#828DF8]/10 text-[#828DF8] px-4 py-2 rounded-full font-bold">{project.category}</span>
          <button onClick={onEdit} className="text-[10px] bg-[#F4F3EE] text-gray-500 px-4 py-2 rounded-full font-bold hover:bg-gray-200">수정</button>
          <button onClick={onDelete} className="text-[10px] bg-red-50 text-red-500 px-4 py-2 rounded-full font-bold hover:bg-red-100">삭제</button>
        </div>
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-[20px] p-4 shadow-sm">
          <p className="text-[10px] tracking-[0.2em] uppercase text-gray-400 font-semibold">IMAGES</p>
          <p className="text-2xl font-black tracking-tighter text-gray-900">{assets.filter(a => !a.isVideo).length}</p>
        </div>
        <div className="bg-white rounded-[20px] p-4 shadow-sm">
          <p className="text-[10px] tracking-[0.2em] uppercase text-gray-400 font-semibold">VIDEOS</p>
          <p className="text-2xl font-black tracking-tighter text-gray-900">{assets.filter(a => a.isVideo).length}</p>
        </div>
        <div className="bg-white rounded-[20px] p-4 shadow-sm">
          <p className="text-[10px] tracking-[0.2em] uppercase text-gray-400 font-semibold">CATEGORY</p>
          <p className="text-2xl font-black tracking-tighter text-gray-900">{project.category}</p>
        </div>
        <div className="bg-white rounded-[20px] p-4 shadow-sm">
          <p className="text-[10px] tracking-[0.2em] uppercase text-gray-400 font-semibold">STATUS</p>
          <p className="text-2xl font-black tracking-tighter text-gray-900">{project.embargoStatus === 'active' ? '🔒' : '✅'}</p>
        </div>
      </div>

      {/* 작업물 영역 */}
      <div className="bg-white rounded-[24px] p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-black tracking-tighter text-gray-900">작업물</h2>
          <div className="flex items-center gap-3">
            {/* 필터 토글 */}
            <div className="flex bg-[#F4F3EE] rounded-full p-0.5">
              {[{ id: 'all', label: '전체' }, { id: 'image', label: '사진' }, { id: 'video', label: '영상' }].map(f => (
                <button
                  key={f.id}
                  onClick={() => setAssetFilter(f.id)}
                  className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition-all
                    ${assetFilter === f.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {/* 정렬 */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="text-[10px] font-bold text-gray-500 bg-[#F4F3EE] rounded-full px-3 py-1.5 outline-none cursor-pointer"
            >
              <option value="newest">최신순</option>
              <option value="oldest">오래된순</option>
              <option value="name">파일명순</option>
            </select>
            {uploading && (
              <div className="flex items-center gap-2">
                <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-[#828DF8] rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
                </div>
                <span className="text-[10px] text-gray-400">{uploadProgress}%</span>
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
              className="px-4 py-2 bg-[#828DF8] text-white rounded-full text-xs font-bold hover:bg-[#6366F1] disabled:opacity-50 transition-all"
            >
              + 업로드
            </button>
          </div>
        </div>

        {filteredAssets.length === 0 && !uploading ? (
          <div
            className="border-2 border-dashed border-gray-300 rounded-[20px] p-12 text-center hover:border-[#828DF8] transition-all cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            <p className="text-gray-400 text-sm mb-2">이미지나 영상을 드래그하거나 클릭하여 업로드</p>
            <p className="text-xs text-gray-300">JPG, PNG, MP4, MOV 지원</p>
          </div>
        ) : (
          <div
            className="grid grid-cols-2 md:grid-cols-4 gap-3"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            {filteredAssets.map((asset) => {
              const imgIdx = !asset.isVideo ? imageAssets.indexOf(asset) : -1
              return (
                <div
                  key={asset.id}
                  className="aspect-square rounded-[14px] overflow-hidden relative group cursor-pointer"
                  onClick={() => { if (!asset.isVideo && imgIdx >= 0) setLightboxIdx(imgIdx) }}
                >
                  {asset.isVideo ? (
                    <video src={asset.url} className="w-full h-full object-cover" muted />
                  ) : (
                    <img src={asset.url} alt={asset.fileName} className="w-full h-full object-cover" />
                  )}
                  {asset.isVideo && (
                    <div className="absolute top-2 right-2 bg-white/80 rounded-full w-6 h-6 flex items-center justify-center">
                      <span className="text-[10px]">▶</span>
                    </div>
                  )}
                  {/* 파일명 + 삭제 (hover) */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center gap-2">
                    <p className="text-white text-[10px] font-medium truncate max-w-[90%] px-2">{asset.fileName}</p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (window.confirm('이 파일을 삭제하시겠습니까?')) deleteAsset(asset)
                      }}
                      className="bg-white/90 text-red-500 text-xs font-bold px-3 py-1.5 rounded-full hover:bg-white"
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
              className="aspect-square rounded-[14px] bg-[#F4F3EE] flex items-center justify-center cursor-pointer hover:bg-gray-200 transition-all border-2 border-dashed border-gray-300"
            >
              <span className="text-2xl text-gray-400">+</span>
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
            className="absolute top-6 right-6 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white text-lg transition-all"
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
              className="absolute left-6 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white text-xl transition-all"
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
          />

          {/* 다음 */}
          {lightboxIdx < imageAssets.length - 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx + 1) }}
              className="absolute right-6 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white text-xl transition-all"
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
  const [category, setCategory] = useState(project?.category || '화보')
  const [embargoDate, setEmbargoDate] = useState(project?.embargoDate || '')
  const [saving, setSaving] = useState(false)

  const categories = ['화보', '광고', '웨딩', '프로필', '영상', '기타']

  const handleSubmit = async () => {
    if (!name.trim()) return
    setSaving(true)
    await onSave({
      name: name.trim(),
      client: client.trim(),
      category,
      embargoDate: embargoDate || null,
      embargoStatus: embargoDate ? 'active' : 'none',
    })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-[32px] p-8 max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-[11px] tracking-[0.2em] uppercase text-[#828DF8] font-bold mb-1">{project ? 'EDIT PROJECT' : 'NEW PROJECT'}</p>
        <h2 className="text-2xl font-black tracking-tighter text-gray-900 mb-6">{project ? '프로젝트 수정' : '새 프로젝트'}</h2>

        <div className="space-y-4">
          <div>
            <label className="text-[11px] tracking-[0.15em] uppercase text-gray-400 font-semibold">PROJECT NAME</label>
            <input
              className="w-full mt-1 px-4 py-3 bg-[#F4F3EE] rounded-[12px] text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#828DF8]/30"
              placeholder="예: VOGUE KOREA 화보"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-[11px] tracking-[0.15em] uppercase text-gray-400 font-semibold">CLIENT</label>
            <input
              className="w-full mt-1 px-4 py-3 bg-[#F4F3EE] rounded-[12px] text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#828DF8]/30"
              placeholder="클라이언트명"
              value={client}
              onChange={(e) => setClient(e.target.value)}
            />
          </div>
          <div>
            <label className="text-[11px] tracking-[0.15em] uppercase text-gray-400 font-semibold">CATEGORY</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`px-4 py-2 rounded-full text-xs font-bold transition-all
                    ${category === c ? 'bg-[#828DF8] text-white shadow-md' : 'bg-[#F4F3EE] text-gray-500 hover:bg-gray-200'}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[11px] tracking-[0.15em] uppercase text-gray-400 font-semibold">EMBARGO DATE (선택)</label>
            <input
              type="date"
              className="w-full mt-1 px-4 py-3 bg-[#F4F3EE] rounded-[12px] text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#828DF8]/30"
              value={embargoDate}
              onChange={(e) => setEmbargoDate(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-3 mt-8">
          <button onClick={onClose} className="flex-1 py-4 bg-[#F4F3EE] text-gray-500 rounded-[16px] font-bold text-sm hover:bg-gray-200 transition-all">
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || saving}
            className="flex-1 py-4 bg-[#828DF8] text-white rounded-[16px] font-bold text-sm hover:bg-[#6366F1] transition-all shadow-lg shadow-[#828DF8]/25 disabled:opacity-50"
          >
            {saving ? '저장 중...' : project ? '수정 완료' : '프로젝트 생성'}
          </button>
        </div>
      </div>
    </div>
  )
}
