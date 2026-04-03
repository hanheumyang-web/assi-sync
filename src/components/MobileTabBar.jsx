import { IconDashboard, IconProjects, IconFeed, IconPdf, IconSettings } from './Icons'

const TABS = [
  { id: 'dashboard', label: '홈', Icon: IconDashboard },
  { id: 'projects', label: '프로젝트', Icon: IconProjects },
  { id: 'feed', label: '피드', Icon: IconFeed },
  { id: 'pdf', label: '포트폴리오', Icon: IconPdf },
  { id: 'profile', label: '설정', Icon: IconSettings },
]

export default function MobileTabBar({ page, setPage }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex items-center justify-around py-2 px-1 z-40 safe-area-pb">
      {TABS.map((tab) => {
        const active = page === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => setPage(tab.id)}
            className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-[12px] transition-all min-w-0
              ${active ? 'text-[#828DF8]' : 'text-gray-400'}`}
          >
            <tab.Icon className="w-5 h-5" />
            <span className={`text-[9px] font-bold ${active ? 'text-[#828DF8]' : 'text-gray-400'}`}>{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
