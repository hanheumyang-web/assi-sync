import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

export default function DownloadPage({ showLogin }) {
  const { loginWithGoogle } = useAuth()
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState(null)
  const repoUrl = 'https://github.com/hanheumyang-web/assi-sync/releases/latest'
  const portfolioUrl = 'https://assi-portfolio.vercel.app/p/assi'

  const handleGoogle = async () => {
    setLoginLoading(true)
    setLoginError(null)
    try {
      await loginWithGoogle()
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setLoginError('로그인에 실패했습니다.')
      }
    }
    setLoginLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#F4F3EE]" style={{ fontFamily: 'Pretendard, -apple-system, sans-serif' }}>
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-[#F4F3EE]/80 border-b border-gray-200/50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="/" className="text-xl font-black tracking-tight text-gray-900">ASSI</a>
          <div className="flex items-center gap-3">
            {showLogin && (
              <button
                onClick={handleGoogle}
                disabled={loginLoading}
                className="px-5 py-2.5 bg-[#828DF8] text-white text-sm font-bold rounded-full hover:bg-[#6366F1] transition-colors disabled:opacity-50"
              >
                {loginLoading ? '로그인 중...' : '로그인'}
              </button>
            )}
            <a
              href={repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-2.5 bg-gray-900 text-white text-sm font-bold rounded-full hover:bg-gray-800 transition-colors"
            >
              다운로드
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white rounded-full text-xs font-semibold text-gray-600 mb-8 shadow-sm border border-gray-100">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
            v1.0.0 — Mac & Windows
          </div>
          <h1 className="text-4xl md:text-6xl font-black text-gray-900 tracking-tighter leading-[1.1] mb-6">
            지긋지긋한 포트폴리오 관리,<br />
            <span style={{ color: '#828DF8' }}>하나의 폴더로</span>
          </h1>
          <p className="text-base md:text-lg text-gray-500 max-w-xl mx-auto leading-relaxed mb-12">
            정리하시던 포트폴리오 폴더 그대로<br className="md:hidden" /> 포트폴리오 제작부터 공유까지
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href={repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 px-8 py-4 bg-gray-900 text-white rounded-2xl font-bold text-base hover:bg-gray-800 transition-all shadow-lg hover:shadow-xl"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.71 19.5C17.88 20.74 17 21.95 15.66 21.97C14.32 22 13.89 21.18 12.37 21.18C10.84 21.18 10.37 21.95 9.1 22C7.79 22.05 6.8 20.68 5.96 19.47C4.25 17 2.94 12.45 4.7 9.39C5.57 7.87 7.13 6.91 8.82 6.88C10.1 6.86 11.32 7.75 12.11 7.75C12.89 7.75 14.37 6.68 15.92 6.84C16.57 6.87 18.39 7.1 19.56 8.82C19.47 8.88 17.39 10.1 17.41 12.63C17.44 15.65 20.06 16.66 20.09 16.67C20.06 16.74 19.67 18.11 18.71 19.5ZM13 3.5C13.73 2.67 14.94 2.04 15.94 2C16.07 3.17 15.6 4.35 14.9 5.19C14.21 6.04 13.07 6.7 11.95 6.61C11.8 5.46 12.36 4.26 13 3.5Z"/>
              </svg>
              Mac 다운로드
              <span className="text-xs opacity-60 font-normal">.dmg</span>
            </a>
            <a
              href={repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 px-8 py-4 bg-white text-gray-900 rounded-2xl font-bold text-base hover:bg-gray-50 transition-all shadow-lg hover:shadow-xl border border-gray-200"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 5.548l7.066-0.964 0.003 6.816-7.063 0.04L3 5.548zm7.063 6.636l0.006 6.822-7.063-0.971v-5.894l7.057 0.043zm0.857-7.72L21 3v8.313l-10.08 0.08V4.464zm10.083 7.907L21 21l-10.08-1.384-0.014-6.86 10.097 0.078z"/>
              </svg>
              Windows 다운로드
              <span className="text-xs opacity-60 font-normal">.exe</span>
            </a>
          </div>

          {showLogin && (
            <div className="mt-8 text-center">
              <p className="text-sm text-gray-400 mb-3">이미 계정이 있으신가요?</p>
              <button
                onClick={handleGoogle}
                disabled={loginLoading}
                className="inline-flex items-center gap-3 px-6 py-3 bg-white border border-gray-200 rounded-2xl font-bold text-sm text-gray-700 hover:bg-gray-50 hover:shadow-lg transition-all shadow-sm disabled:opacity-50"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                {loginLoading ? '로그인 중...' : 'Google로 로그인'}
              </button>
              {loginError && <p className="text-red-500 text-xs mt-2">{loginError}</p>}
            </div>
          )}
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400 mb-3">HOW IT WORKS</p>
            <h2 className="text-3xl font-black text-gray-900 tracking-tight">포트폴리오 관리 일원화</h2>
          </div>

          {/* Flow Diagram */}
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-0 mb-14">
            {/* 기존 폴더 */}
            <div className="flex flex-col items-center gap-2">
              <div className="w-20 h-20 rounded-[20px] bg-white shadow-lg border border-gray-200 flex items-center justify-center">
                <span className="text-3xl">📁</span>
              </div>
              <span className="text-xs font-bold text-gray-700">기존 포트폴리오 폴더</span>
            </div>

            {/* Arrow */}
            <div className="hidden md:flex items-center px-3">
              <div className="w-12 h-[2px] bg-gray-300" />
              <svg className="w-3 h-3 text-gray-300 -ml-0.5" viewBox="0 0 12 12" fill="currentColor"><polygon points="0,0 12,6 0,12" /></svg>
            </div>
            <div className="md:hidden">
              <svg className="w-3 h-3 text-gray-300 rotate-90" viewBox="0 0 12 12" fill="currentColor"><polygon points="0,0 12,6 0,12" /></svg>
            </div>

            {/* ASSI */}
            <div className="flex flex-col items-center gap-2">
              <div className="w-20 h-20 rounded-[20px] bg-gray-900 shadow-xl flex items-center justify-center">
                <span className="text-white text-lg font-black tracking-tight">ASSI</span>
              </div>
              <span className="text-xs font-bold text-gray-700">ASSI</span>
            </div>

            {/* Arrow */}
            <div className="hidden md:flex items-center px-3">
              <div className="w-12 h-[2px] bg-gray-300" />
              <svg className="w-3 h-3 text-gray-300 -ml-0.5" viewBox="0 0 12 12" fill="currentColor"><polygon points="0,0 12,6 0,12" /></svg>
            </div>
            <div className="md:hidden">
              <svg className="w-3 h-3 text-gray-300 rotate-90" viewBox="0 0 12 12" fill="currentColor"><polygon points="0,0 12,6 0,12" /></svg>
            </div>

            {/* 3 Outputs */}
            <div className="flex flex-col gap-3">
              {[
                { icon: '🗂️', label: '포트폴리오 정리', color: 'bg-emerald-50 border-emerald-200' },
                { icon: '🌐', label: '포트폴리오 사이트 제작', color: 'bg-blue-50 border-blue-200' },
                { icon: '📸', label: '인스타그램 업로드', color: 'bg-pink-50 border-pink-200' },
              ].map((item) => (
                <div key={item.label} className={`flex items-center gap-3 px-5 py-3 rounded-[16px] border shadow-sm ${item.color}`}>
                  <span className="text-lg">{item.icon}</span>
                  <span className="text-sm font-bold text-gray-800">{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Steps */}
          <div className="grid md:grid-cols-3 gap-6 max-w-3xl mx-auto">
            {[
              { step: '01', title: '폴더 동기화', desc: '기존 포트폴리오 폴더 그대로\nASSI가 정리해드릴게요' },
              { step: '02', title: '포트폴리오,\n인스타그램 관리', desc: '폴더만 관리하면\n포트폴리오 제작/공유부터\n인스타그램 업로드까지 한번에' },
              { step: '03', title: '자동 업데이트', desc: '기존 폴더에만 업데이트하시면\n자동으로 동기화' },
            ].map((item) => (
              <div key={item.step} className="bg-white rounded-[24px] p-7 shadow-sm border border-gray-100">
                <span className="text-xs font-black tracking-[0.15em] text-[#828DF8] uppercase">STEP {item.step}</span>
                <h3 className="text-xl font-black text-gray-900 mt-3 mb-2 tracking-tight whitespace-pre-line">{item.title}</h3>
                <p className="text-sm text-gray-500 whitespace-pre-line">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features - Visual Cards */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400 mb-3">FEATURES</p>
            <h2 className="text-3xl font-black text-gray-900 tracking-tight">모든 기능</h2>
          </div>

          {/* Feature 1 - Portfolio (Full width, 2 screenshots) */}
          <div className="bg-white rounded-[32px] overflow-hidden shadow-sm border border-gray-100 mb-6">
            <div className="p-8 md:p-12 pb-0 md:pb-0">
              <span className="text-xs font-black uppercase tracking-[0.15em] text-[#828DF8]">WEB PORTFOLIO</span>
              <h3 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight mt-3 mb-3">나만의 포트폴리오 웹사이트</h3>
              <p className="text-sm text-gray-500 leading-relaxed">에디터에서 설정하면 실시간 프리뷰로 바로 확인.<br />링크 하나로 클라이언트에게 공유하세요.</p>
            </div>
            <div className="mt-8 px-4 md:px-8 grid md:grid-cols-2 gap-4">
              <img src="/screenshots/editor.png" alt="포트폴리오 에디터" className="w-full rounded-t-2xl md:rounded-2xl border border-gray-200 shadow-lg" />
              <img src="/screenshots/portfolio.png" alt="포트폴리오 공개 페이지" className="w-full rounded-t-2xl md:rounded-2xl border border-gray-200 shadow-lg" />
            </div>
          </div>

          {/* Feature 2 - Projects (Full width) */}
          <div className="bg-white rounded-[32px] overflow-hidden shadow-sm border border-gray-100 mb-6">
            <div className="p-8 md:p-12 pb-0 md:pb-0">
              <span className="text-xs font-black uppercase tracking-[0.15em] text-[#828DF8]">PROJECTS</span>
              <h3 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight mt-3 mb-3">프로젝트 관리</h3>
              <p className="text-sm text-gray-500 leading-relaxed">폴더가 곧 프로젝트. 카테고리, 검색, 일괄 편집.</p>
            </div>
            <div className="mt-8 px-4 md:px-8">
              <img src="/screenshots/projects.png" alt="프로젝트 관리" className="w-full rounded-t-2xl border border-b-0 border-gray-200 shadow-lg" />
            </div>
          </div>

          {/* Feature 3 - PDF Portfolio (Full width) */}
          <div className="bg-white rounded-[32px] overflow-hidden shadow-sm border border-gray-100">
            <div className="p-8 md:p-12 pb-0 md:pb-0">
              <span className="text-xs font-black uppercase tracking-[0.15em] text-[#828DF8]">PDF EXPORT</span>
              <h3 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight mt-3 mb-3">PDF 포트폴리오</h3>
              <p className="text-sm text-gray-500 leading-relaxed">템플릿 선택, 프로젝트 선택, 브랜딩 설정.<br />클릭 한 번으로 인쇄용 포트폴리오 PDF를 생성합니다.</p>
            </div>
            <div className="mt-8 px-4 md:px-8">
              <img src="/screenshots/pdf.png" alt="PDF 포트폴리오 빌더" className="w-full rounded-t-2xl border border-b-0 border-gray-200 shadow-lg" />
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <div className="bg-gray-900 rounded-[32px] p-12 md:p-16 shadow-2xl">
            <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight mb-4">
              지금 시작하세요
            </h2>
            <p className="text-gray-400 mb-10 text-base">
              무료로 다운로드하고, 작업물을 한곳에서 관리하세요.
            </p>
            <a
              href={repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-10 py-4 bg-white text-gray-900 rounded-2xl font-bold text-base hover:bg-gray-100 transition-all"
            >
              무료 다운로드
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-6 border-t border-gray-200/50">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <span className="text-sm font-bold text-gray-900">ASSI</span>
          <span className="text-xs text-gray-400">© 2025 ASSI. All rights reserved.</span>
        </div>
      </footer>
    </div>
  )
}
