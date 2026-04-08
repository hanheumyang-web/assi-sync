import { useState, useEffect } from 'react'
import { useAuth } from './contexts/AuthContext'
import Sidebar from './components/Sidebar'
import MobileTabBar from './components/MobileTabBar'
import Onboarding from './components/Onboarding'
import Dashboard from './components/Dashboard'
import FeedPlanner from './components/FeedPlanner'
import PdfBuilder from './components/PdfBuilder'
import ProjectView from './components/ProjectView'
import DownloadPage from './components/DownloadPage'
import ProfileSettings from './components/ProfileSettings'
import PortfolioEditor from './components/portfolio/PortfolioEditor'
import AdminPage from './components/AdminPage'

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return isMobile
}

function App() {
  const { user, userDoc, docLoadError, loading } = useAuth()
  const [page, setPageRaw] = useState(() => {
    const h = window.location.hash.replace('#', '')
    return h || 'dashboard'
  })
  const [onboardingStep, setOnboardingStep] = useState(1)
  const [onboardingDone, setOnboardingDone] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [theme, setTheme] = useState(() => localStorage.getItem('assi-theme') || 'dark')
  const isMobile = useIsMobile()

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') root.classList.add('dark')
    else root.classList.remove('dark')
    localStorage.setItem('assi-theme', theme)
  }, [theme])

  // 전역에서 접근 가능하게 (ProfileSettings 토글 등)
  window.__assiTheme = theme
  window.__assiSetTheme = setTheme

  // 앱 내부 뒤로가기 — hash 기반 히스토리
  const setPage = (p) => {
    if (p === page) return
    window.history.pushState({ page: p }, '', `#${p}`)
    setPageRaw(p)
  }

  useEffect(() => {
    // 초기 진입 시 현재 페이지를 히스토리에 심어두기 (replaceState)
    if (!window.history.state?.page) {
      window.history.replaceState({ page }, '', `#${page}`)
    }
    const onPop = (e) => {
      const p = e.state?.page || window.location.hash.replace('#', '') || 'dashboard'
      setPageRaw(p)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // 로딩 중
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#FAFAFA]">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#F4A259] to-[#6366F1] mx-auto mb-4 flex items-center justify-center animate-pulse">
            <span className="text-white text-2xl font-black">A</span>
          </div>
          <p className="text-gray-400 text-sm">로딩 중...</p>
        </div>
      </div>
    )
  }

  // 미로그인 → 랜딩페이지 (다운로드 + 로그인)
  if (!user) {
    return <DownloadPage showLogin />
  }

  // Firestore 로드 에러 → 온보딩 띄우지 말고 에러 화면 (기존 유저 덮어쓰기 방지)
  if (docLoadError) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#FAFAFA] px-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full bg-red-100 mx-auto mb-4 flex items-center justify-center">
            <span className="text-red-500 text-2xl">⚠</span>
          </div>
          <p className="text-gray-900 text-base font-bold mb-2">프로필을 불러올 수 없습니다</p>
          <p className="text-gray-500 text-sm mb-6">네트워크 연결을 확인한 뒤 다시 시도해주세요.</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-[#F4A259] text-white rounded-[14px] font-bold text-sm hover:bg-[#6366F1] transition-all"
          >
            새로고침
          </button>
        </div>
      </div>
    )
  }

  // 로그인됐지만 유저 문서 없음 → 온보딩 (신규 유저)
  if (!userDoc) {
    return (
      <Onboarding
        step={onboardingStep}
        setStep={setOnboardingStep}
        onFinish={() => setOnboardingDone(true)}
      />
    )
  }

  // 메인 앱
  return (
    <div className={`flex ${isMobile ? 'flex-col' : ''} h-screen bg-white dark:bg-[#000000]`}
      style={{ fontFamily: "'Figtree', 'Pretendard Variable', 'Pretendard', sans-serif" }}>
      {!isMobile && <Sidebar page={page} setPage={setPage} collapsed={sidebarCollapsed} setCollapsed={setSidebarCollapsed} />}
      <main className={`flex-1 min-w-0 overflow-y-auto overflow-x-hidden bg-white dark:bg-[#000000] text-[#181818] dark:text-white ${isMobile ? 'p-4 pb-20' : 'p-8'}`}>
        {page === 'dashboard' && <Dashboard setPage={setPage} isMobile={isMobile} />}
        {page === 'feed' && <FeedPlanner isMobile={isMobile} />}
        {page === 'pdf' && <PdfBuilder isMobile={isMobile} />}
        {page === 'projects' && <ProjectView isMobile={isMobile} />}
        {page === 'portfolio' && <PortfolioEditor isMobile={isMobile} />}
        {page === 'profile' && <ProfileSettings />}
        {page === 'admin' && userDoc?.role === 'admin' && <AdminPage />}
      </main>
      {isMobile && <MobileTabBar page={page} setPage={setPage} />}
    </div>
  )
}

export default App
