import { IconDashboard, IconProjects, IconFeed, IconGlobe, IconSettings } from './Icons'

const TABS = [
  { id: 'dashboard', label: '홈', Icon: IconDashboard },
  { id: 'projects', label: '프로젝트', Icon: IconProjects },
  { id: 'portfolio', label: '포트폴리오', Icon: IconGlobe },
  { id: 'feed', label: '피드', Icon: IconFeed },
  { id: 'profile', label: '설정', Icon: IconSettings },
]

export default function MobileTabBar({ page, setPage }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-black border-t border-[#dcdcdc] dark:border-[#2a2a2a] flex items-center justify-around py-2 px-1 z-40 safe-area-pb">
      {TABS.map((tab) => {
        const active = page === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => setPage(tab.id)}
            className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-[12px] transition-all min-w-0
              ${active ? 'text-[#F4A259]' : 'text-[#8a8a8a]'}`}
          >
            <tab.Icon className="w-6 h-6" />
            <span className={`text-[11px] font-bold ${active ? 'text-[#F4A259]' : 'text-[#8a8a8a]'}`}>{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
