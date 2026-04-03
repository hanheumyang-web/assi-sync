import { useState, useEffect } from 'react'
import { useAuth } from './contexts/AuthContext'
import Sidebar from './components/Sidebar'
import MobileTabBar from './components/MobileTabBar'
import Onboarding from './components/Onboarding'
import Dashboard from './components/Dashboard'
import FeedPlanner from './components/FeedPlanner'
import PdfBuilder from './components/PdfBuilder'
import ProjectView from './components/ProjectView'
import LoginScreen from './components/LoginScreen'
import ProfileSettings from './components/ProfileSettings'

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
  const { user, userDoc, loading } = useAuth()
  const [page, setPage] = useState('dashboard')
  const [onboardingStep, setOnboardingStep] = useState(1)
  const [onboardingDone, setOnboardingDone] = useState(false)
  const isMobile = useIsMobile()

  // 로딩 중
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F4F3EE]">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#828DF8] to-[#6366F1] mx-auto mb-4 flex items-center justify-center animate-pulse">
            <span className="text-white text-2xl font-black">A</span>
          </div>
          <p className="text-gray-400 text-sm">로딩 중...</p>
        </div>
      </div>
    )
  }

  // 미로그인 → 로그인 화면
  if (!user) {
    return <LoginScreen />
  }

  // 로그인됐지만 유저 문서 없음 → 온보딩 (신규 유저)
  if (!userDoc && !onboardingDone) {
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
    <div className={`flex ${isMobile ? 'flex-col' : ''} h-screen bg-[#F4F3EE]`}>
      {!isMobile && <Sidebar page={page} setPage={setPage} />}
      <main className={`flex-1 overflow-y-auto ${isMobile ? 'p-4 pb-20' : 'p-8'}`}>
        {page === 'dashboard' && <Dashboard setPage={setPage} isMobile={isMobile} />}
        {page === 'feed' && <FeedPlanner isMobile={isMobile} />}
        {page === 'pdf' && <PdfBuilder isMobile={isMobile} />}
        {page === 'projects' && <ProjectView isMobile={isMobile} />}
        {page === 'profile' && <ProfileSettings />}
      </main>
      {isMobile && <MobileTabBar page={page} setPage={setPage} />}
    </div>
  )
}

export default App
