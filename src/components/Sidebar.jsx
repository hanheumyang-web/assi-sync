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
      <aside className="w-[68px] bg-white rounded-r-[32px] shadow-lg flex flex-col py-6 px-2 items-center transition-all">
        {/* 로고 */}
        <div className="mb-8">
          <h1 className="text-lg font-black tracking-tighter text-gray-900">A</h1>
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
                    ? 'bg-[#828DF8] text-white shadow-lg shadow-[#828DF8]/25'
                    : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'
                  }`}
                title={item.label}
              >
                <item.Icon className="w-5 h-5" />
                {item.id === 'dashboard' && stats.activeEmbargoes > 0 && (
                  <span className={`absolute -top-1 -right-1 text-[8px] font-bold w-4 h-4 rounded-full flex items-center justify-center
                    ${active ? 'bg-white text-[#828DF8]' : 'bg-amber-400 text-white'}`}>
                    {stats.activeEmbargoes}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* 펼치기 버튼 */}
        <button onClick={() => setCollapsed(false)}
          className="w-10 h-10 rounded-[12px] hover:bg-[#F4F3EE] flex items-center justify-center text-gray-400 hover:text-gray-600 transition-all mb-4"
          title="사이드바 펼치기">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* 프로필 */}
        <div className="pt-4 border-t border-gray-100 w-full flex flex-col items-center">
          <button
            onClick={() => setPage('profile')}
            className={`w-10 h-10 rounded-full transition-all ${page === 'profile' ? 'ring-2 ring-[#828DF8]' : ''}`}
            title={displayName}
          >
            {userDoc?.logoUrl ? (
              <img src={userDoc.logoUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#828DF8] to-[#6366F1] flex items-center justify-center text-white text-sm font-bold">
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
    <aside className="w-[260px] bg-white rounded-r-[32px] shadow-lg flex flex-col py-8 px-6 transition-all">
      {/* 로고 + 접기 버튼 */}
      <div className="mb-12 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tighter text-gray-900">
            ASSI
          </h1>
          <p className="text-[11px] tracking-[0.2em] uppercase text-gray-400 mt-0.5">
            creative portfolio
          </p>
        </div>
        <button onClick={() => setCollapsed(true)}
          className="mt-1 w-7 h-7 rounded-[8px] hover:bg-[#F4F3EE] flex items-center justify-center text-gray-400 hover:text-gray-600 transition-all"
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
                  ? 'bg-[#828DF8] text-white shadow-lg shadow-[#828DF8]/25'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                }`}
            >
              <item.Icon className="w-5 h-5" />
              <div className="flex-1">
                <p className={`text-[11px] tracking-[0.15em] uppercase ${active ? 'text-white/70' : 'text-gray-400'}`}>
                  {item.en}
                </p>
                <p className={`text-[15px] font-bold tracking-tight ${active ? 'text-white' : 'text-gray-700'}`}>
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
        <p className="text-[10px] tracking-[0.15em] uppercase text-gray-400 font-semibold px-2 mb-2">QUICK ACCESS</p>
        <button
          onClick={() => setPage('projects')}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[12px] hover:bg-[#F4F3EE] transition-all text-left"
        >
          <span className="w-8 h-8 rounded-[8px] bg-[#828DF8]/10 flex items-center justify-center text-[#828DF8]"><IconProjects className="w-4 h-4" /></span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-700">전체 프로젝트</p>
          </div>
          <span className="text-xs font-black text-gray-900">{stats.totalProjects}</span>
        </button>
        <button
          onClick={() => setPage('feed')}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[12px] hover:bg-[#F4F3EE] transition-all text-left"
        >
          <span className="w-8 h-8 rounded-[8px] bg-amber-100 flex items-center justify-center text-amber-600"><IconCalendar className="w-4 h-4" /></span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-700">업로드 예정</p>
          </div>
          <span className="text-xs font-black text-amber-600">{stats.activeEmbargoes}</span>
        </button>
        <button
          onClick={() => setPage('pdf')}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[12px] hover:bg-[#F4F3EE] transition-all text-left"
        >
          <span className="w-8 h-8 rounded-[8px] bg-emerald-100 flex items-center justify-center text-emerald-600"><IconPdf className="w-4 h-4" /></span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-700">최근 포트폴리오 보기</p>
          </div>
        </button>
      </div>

      {/* 프로필 */}
      <div className="pt-6 border-t border-gray-100">
        <button
          onClick={() => setPage('profile')}
          className={`w-full flex items-center gap-3 px-2 py-2 rounded-[12px] transition-all text-left
            ${page === 'profile' ? 'bg-[#F4F3EE]' : 'hover:bg-[#F4F3EE]/60'}`}
        >
          {userDoc?.logoUrl ? (
            <img src={userDoc.logoUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#828DF8] to-[#6366F1] flex items-center justify-center text-white text-sm font-bold">
              {initial}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900 tracking-tight truncate">{displayName}</p>
            <p className="text-[11px] text-gray-400">{profession}</p>
          </div>
          <IconSettings className="w-4 h-4 text-gray-300" />
        </button>
        <button
          onClick={logout}
          className="w-full mt-3 py-2 text-xs text-gray-400 hover:text-red-500 transition-colors"
        >
          로그아웃
        </button>
      </div>
    </aside>
  )
}
