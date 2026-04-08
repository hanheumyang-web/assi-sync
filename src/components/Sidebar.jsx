import { useAuth } from '../contexts/AuthContext'
import { useProjects } from '../hooks/useProjects'
import { IconDashboard, IconProjects, IconFeed, IconPdf, IconSettings, IconCalendar, IconGlobe } from './Icons'

const NAV = [
  { id: 'dashboard', label: '대시보드', en: 'DASHBOARD', Icon: IconDashboard },
  { id: 'projects', label: '프로젝트', en: 'PROJECTS', Icon: IconProjects },
  { id: 'portfolio', label: '포트폴리오', en: 'PORTFOLIO', Icon: IconGlobe },
  { id: 'feed', label: '피드', en: 'FEED', Icon: IconFeed },
  { id: 'pdf', label: 'PDF', en: 'PDF', Icon: IconPdf },
]

export default function Sidebar({ page, setPage, collapsed, setCollapsed }) {
  const { user, userDoc, logout } = useAuth()
  const { stats } = useProjects()

  const displayName = userDoc?.displayName || user?.displayName || '사용자'
  const profession = userDoc?.profession || 'Creative'
  const initial = displayName.charAt(0).toUpperCase()

  // ── 접힌 상태 ──
  if (collapsed) {
    return (
      <aside className="w-[68px] bg-white dark:bg-black rounded-none shadow-lg flex flex-col py-6 px-2 items-center transition-all">
        {/* 로고 */}
        <div className="mb-8">
          <h1 className="text-lg font-black tracking-tighter text-[#181818] dark:text-white">A</h1>
        </div>

        {/* 네비게이션 */}
        <nav className="flex flex-col gap-1.5 flex-1 w-full">
          {NAV.map((item) => {
            const active = page === item.id
            return (
              <button
                key={item.id}
                onClick={() => setPage(item.id)}
                className={`w-11 h-11 mx-auto rounded-[14px] flex items-center justify-center transition-all relative
                  ${active
                    ? 'bg-[#F4A259] text-white shadow-lg shadow-[#F4A259]/40'
                    : 'text-[#8a8a8a] hover:bg-[#ececec] dark:hover:bg-[#1f1f1f] hover:text-[#181818] dark:hover:text-white'
                  }`}
                title={item.label}
              >
                <item.Icon className="w-5 h-5" />
                {item.id === 'dashboard' && stats.activeEmbargoes > 0 && (
                  <span className={`absolute -top-1 -right-1 text-[8px] font-bold w-4 h-4 rounded-full flex items-center justify-center
                    ${active ? 'bg-white text-[#F4A259]' : 'bg-amber-400 text-white'}`}>
                    {stats.activeEmbargoes}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* 펼치기 버튼 */}
        <button onClick={() => setCollapsed(false)}
          className="w-10 h-10 rounded-[12px] hover:bg-[#ececec] dark:hover:bg-[#1f1f1f] flex items-center justify-center text-[#8a8a8a] hover:text-[#6a6a6a] dark:hover:text-[#b3b3b3] transition-all mb-4"
          title="사이드바 펼치기">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* 프로필 */}
        <div className="pt-4 border-t border-[#dcdcdc] dark:border-[#2a2a2a] w-full flex flex-col items-center">
          <button
            onClick={() => setPage('profile')}
            className={`w-10 h-10 rounded-full transition-all ${page === 'profile' ? 'ring-2 ring-[#F4A259]' : ''}`}
            title={displayName}
          >
            {userDoc?.logoUrl ? (
              <img src={userDoc.logoUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#F4A259] to-[#6366F1] flex items-center justify-center text-white text-sm font-bold">
                {initial}
              </div>
            )}
          </button>
        </div>
      </aside>
    )
  }

  // ── 펼친 상태 (기존) ──
  return (
    <aside className="w-[260px] bg-white dark:bg-black rounded-none shadow-lg flex flex-col py-8 px-6 transition-all">
      {/* 로고 + 접기 버튼 */}
      <div className="mb-12 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tighter text-[#181818] dark:text-white">
            ASSI
          </h1>
          <p className="text-[11px] tracking-[0.2em] uppercase text-[#6a6a6a] dark:text-[#b3b3b3] mt-0.5">
            creative portfolio
          </p>
        </div>
        <button onClick={() => setCollapsed(true)}
          className="mt-1 w-7 h-7 rounded-[8px] hover:bg-[#ececec] dark:hover:bg-[#1f1f1f] flex items-center justify-center text-[#8a8a8a] hover:text-[#6a6a6a] dark:hover:text-[#b3b3b3] transition-all"
          title="사이드바 접기">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* 네비게이션 */}
      <nav className="flex flex-col gap-2 flex-1">
        {NAV.map((item) => {
          const active = page === item.id
          return (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className={`flex items-center gap-3 px-4 py-3.5 rounded-[16px] transition-all text-left relative
                ${active
                  ? 'bg-[#F4A259] text-white shadow-lg shadow-[#F4A259]/40'
                  : 'text-[#6a6a6a] dark:text-[#b3b3b3] hover:bg-[#ececec] dark:hover:bg-[#1f1f1f] hover:text-[#181818] dark:hover:text-white'
                }`}
            >
              <item.Icon className="w-5 h-5" />
              <div className="flex-1">
                <p className={`text-[11px] tracking-[0.15em] uppercase ${active ? 'text-white/70' : 'text-[#8a8a8a]'}`}>
                  {item.en}
                </p>
                <p className={`text-[15px] font-bold tracking-tight ${active ? 'text-white' : 'text-[#181818] dark:text-white'}`}>
                  {item.label}
                </p>
              </div>
              {item.id === 'dashboard' && stats.activeEmbargoes > 0 && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${active ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-600'}`}>
                  {stats.activeEmbargoes}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* 퀵 액션 */}
      <div className="mt-auto space-y-2 mb-6">
        <p className="text-[11px] tracking-[0.15em] uppercase text-[#8a8a8a] font-semibold px-2 mb-2">QUICK ACCESS</p>
        <button
          onClick={() => setPage('projects')}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[12px] hover:bg-[#ececec] dark:hover:bg-[#1f1f1f] transition-all text-left"
        >
          <span className="text-[#F4A259]"><IconProjects className="w-5 h-5" /></span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-[#181818] dark:text-white truncate">전체 프로젝트</p>
          </div>
          <span className="text-xs font-black text-[#181818] dark:text-white">{stats.totalProjects}</span>
        </button>
        <button
          onClick={() => setPage('feed')}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[12px] hover:bg-[#ececec] dark:hover:bg-[#1f1f1f] transition-all text-left"
        >
          <span className="text-amber-600"><IconCalendar className="w-5 h-5" /></span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-[#181818] dark:text-white truncate">업로드 예정</p>
          </div>
          <span className="text-xs font-black text-amber-600">{stats.activeEmbargoes}</span>
        </button>
        <button
          onClick={() => setPage('pdf')}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[12px] hover:bg-[#ececec] dark:hover:bg-[#1f1f1f] transition-all text-left"
        >
          <span className="text-emerald-600"><IconPdf className="w-5 h-5" /></span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-[#181818] dark:text-white truncate">최근 포트폴리오 보기</p>
          </div>
        </button>
      </div>

      {/* 어드민 (관리자만 표시) */}
      {userDoc?.role === 'admin' && (
        <button
          onClick={() => setPage('admin')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[12px] transition-all text-left mb-2
            ${page === 'admin' ? 'bg-red-50 text-red-600' : 'hover:bg-[#ececec] dark:hover:bg-[#1f1f1f] text-[#6a6a6a] dark:text-[#b3b3b3]'}`}
        >
          <span className={page === 'admin' ? 'text-red-600' : 'text-[#8a8a8a]'}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </span>
          <p className="text-sm font-bold">어드민</p>
        </button>
      )}

      {/* 프로필 */}
      <div className="pt-6 border-t border-[#dcdcdc] dark:border-[#2a2a2a]">
        <button
          onClick={() => setPage('profile')}
          className={`w-full flex items-center gap-3 px-2 py-2 rounded-[12px] transition-all text-left
            ${page === 'profile' ? 'bg-[#ececec] dark:bg-[#1f1f1f]' : 'hover:bg-[#ececec] dark:hover:bg-[#1f1f1f]'}`}
        >
          {userDoc?.logoUrl ? (
            <img src={userDoc.logoUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#F4A259] to-[#6366F1] flex items-center justify-center text-white text-sm font-bold">
              {initial}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-[#181818] dark:text-white tracking-tight truncate">{displayName}</p>
            <p className="text-[11px] text-[#8a8a8a]">{profession}</p>
          </div>
          <IconSettings className="w-4 h-4 text-[#6a6a6a] dark:text-[#b3b3b3]" />
        </button>
        <button
          onClick={logout}
          className="w-full mt-3 py-2 text-xs text-[#8a8a8a] hover:text-red-500 transition-colors"
        >
          로그아웃
        </button>
      </div>
    </aside>
  )
}
