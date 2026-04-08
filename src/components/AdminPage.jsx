import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { auth } from '../firebase'

async function adminFetch(action, body = {}) {
  if (!auth.currentUser) throw new Error('Not authenticated')
  const token = await auth.currentUser.getIdToken()
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, ...body }),
  })
  let data
  try { data = await res.json() } catch { throw new Error(`Server error (${res.status})`) }
  if (!res.ok) throw new Error(data.error || `API Error (${res.status})`)
  return data
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1)
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function formatDate(str) {
  if (!str) return '-'
  const d = new Date(str)
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })
}

function daysAgo(str) {
  if (!str) return '-'
  const d = new Date(str)
  if (isNaN(d.getTime())) return '-'
  const days = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (days === 0) return '오늘'
  if (days === 1) return '어제'
  return `${days}일 전`
}

// ── 통계 카드 ──
function StatCard({ label, value, sub, color = '#F4A259' }) {
  return (
    <div className="bg-[#f5f5f5] dark:bg-[#181818] rounded-[12px] p-6 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#8a8a8a]">{label}</p>
      <p className="text-3xl font-black tracking-tight mt-1" style={{ color }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      {sub && <p className="text-xs text-[#8a8a8a] mt-1">{sub}</p>}
    </div>
  )
}

// ── 비용 계산 섹션 ──
function CostSection({ totalUsers, totalProjects, totalAssets }) {
  const firestoreFree = { reads: 50000, writes: 20000 }
  const authFree = { mau: 50000 }

  const estimatedReadsPerDay = (totalUsers * 10) + (totalProjects * 5) + (totalAssets * 2)
  const estimatedWritesPerDay = (totalUsers * 3) + (totalProjects * 2)

  const readsPercent = Math.min(100, (estimatedReadsPerDay / firestoreFree.reads) * 100)
  const writesPercent = Math.min(100, (estimatedWritesPerDay / firestoreFree.writes) * 100)
  const authPercent = Math.min(100, (totalUsers / authFree.mau) * 100)

  // 무료 티어 초과 시 비용 추정
  const excessReads = Math.max(0, estimatedReadsPerDay * 30 - firestoreFree.reads * 30)
  const excessWrites = Math.max(0, estimatedWritesPerDay * 30 - firestoreFree.writes * 30)
  const firestoreCost = (excessReads * 0.06 / 100000) + (excessWrites * 0.18 / 100000)

  const barColor = (pct) => pct > 80 ? '#EF4444' : pct > 50 ? '#F59E0B' : '#10B981'

  return (
    <div className="bg-[#f5f5f5] dark:bg-[#181818] rounded-[12px] p-6 shadow-sm">
      <h3 className="text-sm font-black text-[#181818] dark:text-white tracking-tight mb-4">💰 비용 추정 (무료 티어 기준)</h3>

      <div className="space-y-4">
        {[
          { label: 'Firestore 읽기', current: estimatedReadsPerDay, max: firestoreFree.reads, pct: readsPercent },
          { label: 'Firestore 쓰기', current: estimatedWritesPerDay, max: firestoreFree.writes, pct: writesPercent },
          { label: 'Auth MAU', current: totalUsers, max: authFree.mau, pct: authPercent },
        ].map(item => (
          <div key={item.label}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-[#6a6a6a] dark:text-[#b3b3b3]">{item.label}</span>
              <span className="font-bold text-[#181818] dark:text-white">{item.current.toLocaleString()} / {item.max.toLocaleString()}{item.label !== 'Auth MAU' ? ' /day' : ''}</span>
            </div>
            <div className="h-2 bg-[#e4e4e4] dark:bg-[#252525] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${item.pct}%`, backgroundColor: barColor(item.pct) }} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 pt-4 border-t border-[#dcdcdc] dark:border-[#2a2a2a]">
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#8a8a8a] mb-2">월 예상 비용</p>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-lg font-black text-[#181818] dark:text-white">${firestoreCost.toFixed(2)}</p>
            <p className="text-[10px] text-[#8a8a8a]">Firebase</p>
          </div>
          <div>
            <p className="text-lg font-black text-[#181818] dark:text-white">$0</p>
            <p className="text-[10px] text-[#8a8a8a]">Vercel</p>
          </div>
          <div>
            <p className="text-lg font-black text-[#181818] dark:text-white">~$1</p>
            <p className="text-[10px] text-[#8a8a8a]">Bunny CDN</p>
          </div>
        </div>
        <p className="text-[10px] text-[#8a8a8a] text-center mt-2">* 문서 수 기반 추정치. 실제 비용은 Firebase Console에서 확인</p>
      </div>
    </div>
  )
}

// ── 유저 상세 모달 ──
function UserDetailModal({ uid, onClose, onDisable, onDelete }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    adminFetch('getUserDetail', { uid })
      .then(setDetail)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [uid])

  const handleDisable = async () => {
    setActionLoading(true)
    try {
      await onDisable(uid, !detail?.auth?.disabled)
      onClose()
    } catch { /* parent handles */ }
    setActionLoading(false)
  }

  const handleDelete = async () => {
    setActionLoading(true)
    try {
      await onDelete(uid)
      onClose()
    } catch { /* parent handles */ }
    setActionLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#f5f5f5] dark:bg-[#181818] rounded-[12px] p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>

        {loading && (
          <div className="py-12 text-center">
            <div className="w-8 h-8 border-3 border-[#F4A259] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-[#8a8a8a] mt-3">로딩 중...</p>
          </div>
        )}

        {error && (
          <div className="py-12 text-center">
            <p className="text-red-500 font-bold mb-2">오류 발생</p>
            <p className="text-sm text-red-400">{error}</p>
            <button onClick={onClose} className="mt-4 px-4 py-2 bg-[#e4e4e4] dark:bg-[#252525] text-[#181818] dark:text-white rounded-[12px] text-sm font-bold">닫기</button>
          </div>
        )}

        {!loading && !error && detail?.user && (() => {
          const u = detail.user
          return (
            <>
              {/* 헤더 */}
              <div className="flex items-center gap-4 mb-6">
                {u.photoURL ? (
                  <img src={u.photoURL} alt={u.displayName} className="w-14 h-14 rounded-full object-cover" />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-[#F4A259] flex items-center justify-center text-white text-xl font-black">
                    {(u.displayName || '?')[0]}
                  </div>
                )}
                <div>
                  <h3 className="text-lg font-black text-[#181818] dark:text-white">{u.displayName || 'Unknown'}</h3>
                  <p className="text-sm text-[#6a6a6a] dark:text-[#b3b3b3]">{u.email}</p>
                  <p className="text-xs text-[#8a8a8a]">{u.profession}</p>
                </div>
                <button onClick={onClose} className="ml-auto text-[#8a8a8a] hover:text-white text-xl">✕</button>
              </div>

              {/* 상태 */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="bg-[#ececec] dark:bg-[#1f1f1f] rounded-[16px] p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#8a8a8a]">가입일</p>
                  <p className="text-sm font-bold mt-1 text-[#181818] dark:text-white">{formatDate(u.createdAt || detail.auth?.creationTime)}</p>
                </div>
                <div className="bg-[#ececec] dark:bg-[#1f1f1f] rounded-[16px] p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#8a8a8a]">마지막 로그인</p>
                  <p className="text-sm font-bold mt-1 text-[#181818] dark:text-white">{daysAgo(detail.auth?.lastSignIn)}</p>
                </div>
                <div className="bg-[#ececec] dark:bg-[#1f1f1f] rounded-[16px] p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#8a8a8a]">프로젝트</p>
                  <p className="text-sm font-bold mt-1 text-[#181818] dark:text-white">{detail.projects?.length || 0}개</p>
                </div>
                <div className="bg-[#ececec] dark:bg-[#1f1f1f] rounded-[16px] p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#8a8a8a]">저장소 사용</p>
                  <p className="text-sm font-bold mt-1 text-[#181818] dark:text-white">{formatBytes(detail.totalStorageEstimate)}</p>
                </div>
              </div>

              {/* 포트폴리오 */}
              {detail.portfolio && (
                <div className="bg-[#ececec] dark:bg-[#1f1f1f] rounded-[16px] p-4 mb-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#8a8a8a] mb-2">포트폴리오</p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-[#181818] dark:text-white">{detail.portfolio.slug || '-'}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${detail.portfolio.published ? 'bg-emerald-100 text-emerald-700' : 'bg-[#dcdcdc] dark:bg-[#2a2a2a] text-[#6a6a6a] dark:text-[#b3b3b3]'}`}>
                        {detail.portfolio.published ? '공개' : '비공개'}
                      </span>
                    </div>
                    {detail.portfolio.published && detail.portfolio.slug && (
                      <a href={`/p/${encodeURIComponent(detail.portfolio.slug)}`} target="_blank" rel="noopener noreferrer" className="text-xs text-[#F4A259] font-bold hover:underline">
                        보기 →
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* 프로젝트 목록 */}
              {detail.projects?.length > 0 && (
                <div className="mb-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#8a8a8a] mb-2">프로젝트 ({detail.projects.length})</p>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {detail.projects.map(p => (
                      <div key={p.id} className="flex items-center justify-between bg-[#ececec] dark:bg-[#1f1f1f] rounded-[12px] px-3 py-2">
                        <span className="text-sm font-medium text-[#4a4a4a] dark:text-[#cbcbcb] truncate">{p.name || p.id}</span>
                        <span className="text-[10px] text-[#8a8a8a]">{p.category || ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 관리 액션 */}
              <div className="flex gap-3 pt-4 border-t border-[#dcdcdc] dark:border-[#2a2a2a]">
                <button
                  onClick={handleDisable}
                  disabled={actionLoading}
                  className={`flex-1 py-3 rounded-[16px] text-sm font-bold transition-all disabled:opacity-50 ${
                    detail.auth?.disabled
                      ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                      : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                  }`}
                >
                  {actionLoading ? '처리중...' : detail.auth?.disabled ? '🔓 정지 해제' : '🔒 계정 정지'}
                </button>

                {!confirmDelete ? (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    disabled={actionLoading}
                    className="flex-1 py-3 rounded-[16px] text-sm font-bold bg-red-100 text-red-600 hover:bg-red-200 transition-all disabled:opacity-50"
                  >
                    🗑️ 계정 삭제
                  </button>
                ) : (
                  <button
                    onClick={handleDelete}
                    disabled={actionLoading}
                    className="flex-1 py-3 rounded-[16px] text-sm font-black bg-red-500 text-white hover:bg-red-600 transition-all disabled:opacity-50 animate-pulse"
                  >
                    {actionLoading ? '삭제중...' : '⚠️ 정말 삭제?'}
                  </button>
                )}
              </div>
            </>
          )
        })()}
      </div>
    </div>
  )
}

// ══════════════════════════════════════
// MAIN ADMIN PAGE
// ══════════════════════════════════════
export default function AdminPage() {
  const { user } = useAuth()
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('createdAt')
  const [sortDesc, setSortDesc] = useState(true)
  const [selectedUser, setSelectedUser] = useState(null)
  const [tab, setTab] = useState('overview')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [statsData, usersData] = await Promise.all([
        adminFetch('getStats'),
        adminFetch('getUsers'),
      ])
      setStats(statsData)
      setUsers(usersData.users || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // 검색 + 정렬 (immutable sort)
  const filteredUsers = useMemo(() => {
    let list = [...users]
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(u =>
        u.displayName?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.uid?.toLowerCase().includes(q)
      )
    }
    list.sort((a, b) => {
      let va = a[sortBy] ?? ''
      let vb = b[sortBy] ?? ''
      if (sortBy === 'projectCount') { va = Number(va); vb = Number(vb) }
      if (typeof va === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase() }
      if (va < vb) return sortDesc ? 1 : -1
      if (va > vb) return sortDesc ? -1 : 1
      return 0
    })
    return list
  }, [users, search, sortBy, sortDesc])

  // 최근 유저 (memoized)
  const recentUsers = useMemo(() =>
    [...users].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 5)
  , [users])

  const handleDisable = async (uid, disabled) => {
    await adminFetch('disableUser', { uid, disabled })
    setUsers(prev => prev.map(u => u.uid === uid ? { ...u, disabled } : u))
  }

  const handleDelete = async (uid) => {
    await adminFetch('deleteUser', { uid })
    setUsers(prev => prev.filter(u => u.uid !== uid))
    setStats(prev => prev ? { ...prev, totalUsers: prev.totalUsers - 1 } : prev)
  }

  const handleSort = (key) => {
    if (sortBy === key) setSortDesc(!sortDesc)
    else { setSortBy(key); setSortDesc(true) }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <div className="w-10 h-10 border-3 border-[#F4A259] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-[#8a8a8a]">어드민 데이터 로딩...</p>
      </div>
    </div>
  )

  if (error) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center bg-red-50 rounded-[24px] p-8">
        <p className="text-red-500 font-bold text-lg mb-2">접근 거부</p>
        <p className="text-sm text-red-400">{error}</p>
      </div>
    </div>
  )

  return (
    <div className="max-w-6xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#F4A259]">ADMIN</p>
          <h1 className="text-3xl font-black text-[#181818] dark:text-white tracking-tighter">어드민 대시보드</h1>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={loadData} className="w-9 h-9 rounded-[12px] bg-[#e4e4e4] dark:bg-[#252525] hover:bg-[#dcdcdc] dark:hover:bg-[#2a2a2a] flex items-center justify-center transition-colors" title="새로고침">
            <svg className="w-4 h-4 text-[#6a6a6a] dark:text-[#b3b3b3]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <div className="flex bg-[#e4e4e4] dark:bg-[#252525] rounded-[16px] p-1">
            {[{ id: 'overview', label: '개요' }, { id: 'users', label: '유저 관리' }].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-5 py-2 rounded-[12px] text-sm font-bold transition-all ${
                  tab === t.id ? 'bg-[#f5f5f5] dark:bg-[#181818] text-[#181818] dark:text-white shadow-sm' : 'text-[#8a8a8a] hover:text-white'
                }`}
              >{t.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── 개요 탭 ── */}
      {tab === 'overview' && stats && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="총 유저" value={stats.totalUsers} sub={`최근 7일 +${stats.recentUsers}`} />
            <StatCard label="총 프로젝트" value={stats.totalProjects} sub={`평균 ${stats.avgProjectsPerUser}개/유저`} color="#10B981" />
            <StatCard label="총 에셋" value={stats.totalAssets} color="#F59E0B" />
            <StatCard label="포트폴리오" value={`${stats.publishedPortfolios}/${stats.totalPortfolios}`} sub="발행 / 전체" color="#6366F1" />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <CostSection totalUsers={stats.totalUsers} totalProjects={stats.totalProjects} totalAssets={stats.totalAssets || 0} />

            <div className="bg-[#f5f5f5] dark:bg-[#181818] rounded-[12px] p-6 shadow-sm">
              <h3 className="text-sm font-black text-[#181818] dark:text-white tracking-tight mb-4">🟢 서비스 상태</h3>
              <div className="space-y-3">
                {[
                  { name: 'Firebase', url: 'https://console.firebase.google.com/project/assi-app-6ea04' },
                  { name: 'Vercel', url: 'https://vercel.com/hanheums-projects/assi-portfolio' },
                  { name: 'Bunny CDN', url: 'https://dash.bunny.net' },
                ].map(s => (
                  <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-between bg-[#ececec] dark:bg-[#1f1f1f] rounded-[16px] px-4 py-3 hover:bg-[#e4e4e4] dark:hover:bg-[#252525] transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full" />
                      <span className="text-sm font-bold text-[#4a4a4a] dark:text-[#cbcbcb]">{s.name}</span>
                    </div>
                    <span className="text-xs text-[#8a8a8a]">콘솔 →</span>
                  </a>
                ))}
              </div>

              <div className="mt-5 pt-4 border-t border-[#dcdcdc] dark:border-[#2a2a2a]">
                <h4 className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#8a8a8a] mb-3">바로가기</h4>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Firebase Console', url: 'https://console.firebase.google.com/project/assi-app-6ea04' },
                    { label: 'Vercel Dashboard', url: 'https://vercel.com/hanheums-projects/assi-portfolio' },
                    { label: 'Bunny Dashboard', url: 'https://dash.bunny.net' },
                    { label: 'GitHub Desktop', url: 'https://github.com/hanheumyang-web/assi-sync' },
                  ].map(l => (
                    <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-[#F4A259] font-bold hover:underline truncate">{l.label}</a>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 최근 가입 유저 */}
          <div className="bg-[#f5f5f5] dark:bg-[#181818] rounded-[12px] p-6 shadow-sm">
            <h3 className="text-sm font-black text-[#181818] dark:text-white tracking-tight mb-4">👤 최근 가입 유저</h3>
            <div className="space-y-2">
              {recentUsers.map(u => (
                <div key={u.uid} onClick={() => setSelectedUser(u.uid)}
                  className="flex items-center justify-between bg-[#ececec] dark:bg-[#1f1f1f] rounded-[16px] px-4 py-3 cursor-pointer hover:bg-[#e4e4e4] dark:hover:bg-[#252525] transition-colors">
                  <div className="flex items-center gap-3">
                    {u.photoURL ? (
                      <img src={u.photoURL} alt={u.displayName} className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-[#F4A259] flex items-center justify-center text-white text-xs font-black">
                        {(u.displayName || '?')[0]}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-bold text-[#4a4a4a] dark:text-[#cbcbcb]">{u.displayName || 'Unknown'}</p>
                      <p className="text-[10px] text-[#8a8a8a]">{u.email}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-[#6a6a6a] dark:text-[#b3b3b3]">{formatDate(u.createdAt)}</p>
                    <p className="text-[10px] text-[#8a8a8a]">{u.projectCount}개 프로젝트</p>
                  </div>
                </div>
              ))}
              {recentUsers.length === 0 && <p className="text-sm text-[#8a8a8a] text-center py-4">유저 없음</p>}
            </div>
          </div>
        </div>
      )}

      {/* ── 유저 관리 탭 ── */}
      {tab === 'users' && (
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="이름, 이메일, UID 검색..."
                className="w-full bg-[#ececec] dark:bg-[#1f1f1f] text-[#181818] dark:text-white rounded-[16px] px-5 py-3 pl-11 text-sm border border-[#dcdcdc] dark:border-[#2a2a2a] focus:border-[#F4A259] outline-none"
              />
              <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8a8a8a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <span className="self-center text-sm text-[#8a8a8a] font-bold">{filteredUsers.length}명</span>
          </div>

          <div className="bg-[#f5f5f5] dark:bg-[#181818] rounded-[12px] shadow-md overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-5 py-3 bg-[#ececec] dark:bg-[#1f1f1f] border-b border-[#dcdcdc] dark:border-[#2a2a2a] text-[10px] font-bold uppercase tracking-[0.12em] text-[#8a8a8a]">
              <div className="col-span-4 cursor-pointer hover:text-white" onClick={() => handleSort('displayName')}>
                유저 {sortBy === 'displayName' && (sortDesc ? '↓' : '↑')}
              </div>
              <div className="col-span-2 cursor-pointer hover:text-white" onClick={() => handleSort('createdAt')}>
                가입일 {sortBy === 'createdAt' && (sortDesc ? '↓' : '↑')}
              </div>
              <div className="col-span-2 cursor-pointer hover:text-white" onClick={() => handleSort('lastSignIn')}>
                마지막 활동 {sortBy === 'lastSignIn' && (sortDesc ? '↓' : '↑')}
              </div>
              <div className="col-span-1 cursor-pointer hover:text-white text-center" onClick={() => handleSort('projectCount')}>
                프로젝트 {sortBy === 'projectCount' && (sortDesc ? '↓' : '↑')}
              </div>
              <div className="col-span-1 text-center">포트폴리오</div>
              <div className="col-span-2 text-center">상태</div>
            </div>

            <div className="divide-y divide-[#dcdcdc] dark:divide-[#2a2a2a]">
              {filteredUsers.map(u => (
                <div key={u.uid}
                  onClick={() => setSelectedUser(u.uid)}
                  className="grid grid-cols-12 gap-2 px-5 py-3 items-center cursor-pointer hover:bg-[#ececec] dark:hover:bg-[#1f1f1f] transition-colors">
                  <div className="col-span-4 flex items-center gap-3 min-w-0">
                    {u.photoURL ? (
                      <img src={u.photoURL} alt={u.displayName} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-[#F4A259] flex items-center justify-center text-white text-xs font-black flex-shrink-0">
                        {(u.displayName || '?')[0]}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#4a4a4a] dark:text-[#cbcbcb] truncate">{u.displayName || 'Unknown'}</p>
                      <p className="text-[10px] text-[#8a8a8a] truncate">{u.email}</p>
                    </div>
                  </div>
                  <div className="col-span-2 text-xs text-[#6a6a6a] dark:text-[#b3b3b3]">{formatDate(u.createdAt)}</div>
                  <div className="col-span-2 text-xs text-[#6a6a6a] dark:text-[#b3b3b3]">{daysAgo(u.lastSignIn)}</div>
                  <div className="col-span-1 text-center text-sm font-bold text-[#4a4a4a] dark:text-[#cbcbcb]">{u.projectCount}</div>
                  <div className="col-span-1 text-center">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      u.portfolioPublished ? 'bg-emerald-100 text-emerald-700' : 'bg-[#e4e4e4] dark:bg-[#252525] text-[#8a8a8a]'
                    }`}>
                      {u.portfolioPublished ? '공개' : '-'}
                    </span>
                  </div>
                  <div className="col-span-2 text-center">
                    {u.disabled ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">정지됨</span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">활성</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {filteredUsers.length === 0 && (
              <div className="py-12 text-center text-[#8a8a8a] text-sm">검색 결과 없음</div>
            )}
          </div>
        </div>
      )}

      {selectedUser && (
        <UserDetailModal
          uid={selectedUser}
          onClose={() => setSelectedUser(null)}
          onDisable={handleDisable}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}
