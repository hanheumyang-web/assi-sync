import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

const VERSION = '1.1.9'

export default function DownloadPage({ showLogin }) {
  const { loginWithGoogle } = useAuth()
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState(null)
  const repoUrl = `https://github.com/hanheumyang-web/assi-sync/releases/latest`

  const handleGoogle = async () => {
    setLoginLoading(true)
    setLoginError(null)
    try {
      await loginWithGoogle()
    } catch (err) {
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        // 사용자 취소 — 에러 무시
      } else if (err.code === 'auth/unauthorized-domain') {
        setLoginError('이 도메인은 Firebase에 등록되지 않았습니다. 관리자에게 문의하세요.')
      } else if (err.code === 'auth/network-request-failed') {
        setLoginError('네트워크 오류. 인터넷 연결을 확인해주세요.')
      } else {
        setLoginError(`로그인 실패: ${err?.message || '다시 시도해주세요.'}`)
      }
    }
    setLoginLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA]" style={{ fontFamily: "'GmarketSansMedium', Pretendard, -apple-system, sans-serif" }}>
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-[#FAFAFA]/80 border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-2">
          <a href="/" className="flex items-center gap-2 flex-shrink-0">
            <img src="/logo/logo-black.png" alt="ASSI" className="h-7 md:h-8 object-contain" />
          </a>
          <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
            {true && (
              <button
                onClick={handleGoogle}
                disabled={loginLoading}
                className="px-3.5 md:px-5 py-2 md:py-2.5 bg-[#F4A259] text-white text-xs md:text-sm font-bold rounded-full hover:bg-[#E8923A] transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {loginLoading ? '...' : '로그인 / 가입'}
              </button>
            )}
            <a
              href={repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:inline-block px-5 py-2.5 bg-gray-900 text-white text-sm font-bold rounded-full hover:bg-gray-800 transition-colors whitespace-nowrap"
            >
              다운로드
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          {/* 눈 캐릭터 */}
          <div className="mb-6">
            <img src="/logo/eyes.png" alt="ASSI" className="w-28 md:w-36 h-auto mx-auto" />
          </div>

          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white rounded-full text-xs font-semibold text-gray-600 mb-8 shadow-sm border border-orange-100">
            <span className="w-2 h-2 bg-[#F4A259] rounded-full animate-pulse"></span>
            v{VERSION} — Mac & Windows
          </div>
          <h1 className="text-4xl md:text-6xl font-black text-gray-900 tracking-tighter leading-[1.1] mb-6" style={{ fontFamily: "'GmarketSansMedium'" }}>
            지긋지긋한 포트폴리오 관리,<br />
            <span className="text-[#F4A259]">하나의 폴더로</span>
          </h1>
          <p className="text-base md:text-lg text-gray-500 max-w-xl mx-auto leading-relaxed mb-12">
            정리하시던 포트폴리오 폴더 그대로<br className="md:hidden" /> 포트폴리오 제작부터 공유까지
          </p>

          <div className="flex items-center justify-center">
            <a
              href={repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-3 px-10 py-5 bg-gray-900 text-white rounded-2xl font-bold text-lg hover:bg-gray-800 transition-all shadow-lg hover:shadow-xl"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.71 19.5C17.88 20.74 17 21.95 15.66 21.97C14.32 22 13.89 21.18 12.37 21.18C10.84 21.18 10.37 21.95 9.1 22C7.79 22.05 6.8 20.68 5.96 19.47C4.25 17 2.94 12.45 4.7 9.39C5.57 7.87 7.13 6.91 8.82 6.88C10.1 6.86 11.32 7.75 12.11 7.75C12.89 7.75 14.37 6.68 15.92 6.84C16.57 6.87 18.39 7.1 19.56 8.82C19.47 8.88 17.39 10.1 17.41 12.63C17.44 15.65 20.06 16.66 20.09 16.67C20.06 16.74 19.67 18.11 18.71 19.5ZM13 3.5C13.73 2.67 14.94 2.04 15.94 2C16.07 3.17 15.6 4.35 14.9 5.19C14.21 6.04 13.07 6.7 11.95 6.61C11.8 5.46 12.36 4.26 13 3.5Z"/>
              </svg>
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 5.548l7.066-0.964 0.003 6.816-7.063 0.04L3 5.548zm7.063 6.636l0.006 6.822-7.063-0.971v-5.894l7.057 0.043zm0.857-7.72L21 3v8.313l-10.08 0.08V4.464zm10.083 7.907L21 21l-10.08-1.384-0.014-6.86 10.097 0.078z"/>
              </svg>
              다운로드
              <span className="text-xs opacity-60 font-normal">Mac · Windows</span>
            </a>
          </div>

          {/* Mac 사용자 안내 */}
          <div className="mt-6 mx-auto max-w-xl bg-amber-50 border border-amber-200 rounded-[20px] p-5 text-left">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-5 h-5 text-amber-600 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.71 19.5C17.88 20.74 17 21.95 15.66 21.97C14.32 22 13.89 21.18 12.37 21.18C10.84 21.18 10.37 21.95 9.1 22C7.79 22.05 6.8 20.68 5.96 19.47C4.25 17 2.94 12.45 4.7 9.39C5.57 7.87 7.13 6.91 8.82 6.88C10.1 6.86 11.32 7.75 12.11 7.75C12.89 7.75 14.37 6.68 15.92 6.84C16.57 6.87 18.39 7.1 19.56 8.82C19.47 8.88 17.39 10.1 17.41 12.63C17.44 15.65 20.06 16.66 20.09 16.67C20.06 16.74 19.67 18.11 18.71 19.5Z"/>
              </svg>
              <p className="text-sm font-bold text-amber-900">Mac 사용자 첫 실행 안내</p>
            </div>
            <p className="text-xs text-amber-900/80 leading-relaxed mb-3">
              <span className="font-bold">macOS Sequoia(15+) 사용자는 DMG 대신 ZIP 파일을 받아주세요.</span> 릴리스 페이지에서 <code className="bg-white px-1.5 py-0.5 rounded text-[10px]">ASSI-Sync-Mac-*.zip</code> 을 다운받으면 DMG 차단 이슈 없이 바로 실행됩니다. 압축 해제 후 앱을 <span className="font-semibold">응용 프로그램 폴더로 드래그</span>만 하면 끝이에요.
            </p>
            <p className="text-xs text-amber-900/80 leading-relaxed mb-3">
              여전히 "손상됨" 경고가 뜨면 Apple 개발자 서명을 아직 안 붙여서 생기는 Gatekeeper 차단이므로, 아래 방법으로 해제하세요.
            </p>
            <div className="space-y-3">
              <div className="bg-white rounded-[12px] p-3 border border-amber-100">
                <p className="text-[11px] font-bold text-amber-800 mb-1.5">방법 1 · 터미널 명령어 (가장 확실 · 추천)</p>
                <p className="text-[11px] text-gray-600 mb-1.5">
                  <span className="font-semibold">Spotlight(⌘+Space)</span>에서 <span className="font-semibold">"터미널"</span> 검색 → 열기 → 아래 명령 붙여넣고 엔터 → 이후 DMG 더블클릭:
                </p>
                <code className="block bg-gray-900 text-emerald-300 text-[11px] font-mono px-3 py-2 rounded-[8px] overflow-x-auto whitespace-nowrap mb-2">
                  xattr -cr ~/Downloads/ASSI-Sync-Mac-*.dmg
                </code>
                <p className="text-[11px] text-gray-600">
                  설치 후 앱 실행 시에도 동일 경고가 뜨면:
                </p>
                <code className="block bg-gray-900 text-emerald-300 text-[11px] font-mono px-3 py-2 rounded-[8px] overflow-x-auto whitespace-nowrap mt-1">
                  xattr -cr /Applications/ASSI\ Sync.app
                </code>
              </div>
              <div className="bg-white rounded-[12px] p-3 border border-amber-100">
                <p className="text-[11px] font-bold text-amber-800 mb-1.5">방법 2 · 시스템 설정에서 허용</p>
                <ol className="text-[11px] text-gray-600 leading-relaxed list-decimal list-inside space-y-0.5">
                  <li>DMG 더블클릭 → 차단 경고가 뜨면 <span className="font-semibold">취소</span></li>
                  <li><span className="font-semibold">시스템 설정 → 개인정보 보호 및 보안</span> 진입</li>
                  <li>아래로 스크롤 → "ASSI Sync이(가) 차단되었습니다" 옆 <span className="font-semibold">"확인 없이 열기"</span> 클릭</li>
                  <li>비밀번호 입력 → 다시 DMG 실행</li>
                </ol>
              </div>
            </div>
            <p className="text-[10px] text-amber-800/60 mt-3 leading-relaxed">
              * Apple Developer 서명은 곧 도입 예정이며, 도입 후에는 이 과정 없이 바로 실행됩니다.
            </p>
          </div>

          {true && (
            <div className="mt-8 text-center">
              <p className="text-sm text-gray-400 mb-3">계정이 있거나 새로 시작하시나요?</p>
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
                {loginLoading ? '로그인 중...' : 'Google로 로그인 / 가입'}
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
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#F4A259] mb-3">HOW IT WORKS</p>
            <h2 className="text-3xl font-black text-gray-900 tracking-tight" style={{ fontFamily: "'GmarketSansMedium'" }}>포트폴리오 관리 일원화</h2>
          </div>

          {/* Flow Diagram */}
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-0 mb-14">
            <div className="flex flex-col items-center gap-2">
              <div className="w-20 h-20 rounded-[20px] bg-white shadow-lg border-2 border-gray-200 flex items-center justify-center">
                <span className="text-3xl">📁</span>
              </div>
              <span className="text-xs font-bold text-gray-700">기존 포트폴리오 폴더</span>
            </div>

            <div className="hidden md:flex items-center px-3">
              <div className="w-12 h-[3px] bg-[#F4A259] rounded-full" />
              <svg className="w-4 h-4 text-[#F4A259] -ml-0.5" viewBox="0 0 12 12" fill="currentColor"><polygon points="0,0 12,6 0,12" /></svg>
            </div>
            <div className="md:hidden">
              <svg className="w-4 h-4 text-[#F4A259] rotate-90" viewBox="0 0 12 12" fill="currentColor"><polygon points="0,0 12,6 0,12" /></svg>
            </div>

            <div className="flex flex-col items-center gap-2">
              <div className="w-20 h-20 rounded-[20px] bg-[#F4A259] shadow-xl flex items-center justify-center">
                <img src="/logo/eyes.png" alt="ASSI" className="w-12 h-12 object-contain" />
              </div>
              <span className="text-xs font-bold text-gray-700">ASSI</span>
            </div>

            <div className="hidden md:flex items-center px-3">
              <div className="w-12 h-[3px] bg-[#F4A259] rounded-full" />
              <svg className="w-4 h-4 text-[#F4A259] -ml-0.5" viewBox="0 0 12 12" fill="currentColor"><polygon points="0,0 12,6 0,12" /></svg>
            </div>
            <div className="md:hidden">
              <svg className="w-4 h-4 text-[#F4A259] rotate-90" viewBox="0 0 12 12" fill="currentColor"><polygon points="0,0 12,6 0,12" /></svg>
            </div>

            <div className="flex flex-col gap-3">
              {[
                { icon: '🗂️', label: '포트폴리오 정리', color: 'bg-orange-50 border-orange-200' },
                { icon: '🌐', label: '포트폴리오 사이트 제작', color: 'bg-amber-50 border-amber-200' },
                { icon: '📸', label: '인스타그램 업로드', color: 'bg-rose-50 border-rose-200' },
              ].map((item) => (
                <div key={item.label} className={`flex items-center gap-3 px-5 py-3 rounded-[16px] border-2 shadow-sm ${item.color}`}>
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
              <div key={item.step} className="bg-white rounded-[24px] p-7 shadow-sm border border-orange-100">
                <span className="text-xs font-black tracking-[0.15em] text-[#F4A259] uppercase">STEP {item.step}</span>
                <h3 className="text-xl font-black text-gray-900 mt-3 mb-2 tracking-tight whitespace-pre-line" style={{ fontFamily: "'GmarketSansMedium'" }}>{item.title}</h3>
                <p className="text-sm text-gray-500 whitespace-pre-line">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#F4A259] mb-3">FEATURES</p>
            <h2 className="text-3xl font-black text-gray-900 tracking-tight" style={{ fontFamily: "'GmarketSansMedium'" }}>모든 기능</h2>
          </div>

          {/* 폴더링 → 자동 분류 → 웹사이트 */}
          <div className="bg-white rounded-[32px] overflow-hidden shadow-sm border border-orange-100 mb-6">
            <div className="p-8 md:p-12 pb-0 md:pb-0">
              <span className="text-xs font-black uppercase tracking-[0.15em] text-[#F4A259]">FOLDER → PORTFOLIO</span>
              <h3 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight mt-3 mb-3" style={{ fontFamily: "'GmarketSansMedium'" }}>
                내 컴퓨터 폴더 관리만 하면<br />업로드부터 분류, 웹사이트 제작까지 한번에
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                1단계 폴더는 카테고리, 2단계 폴더는 프로젝트가 됩니다.<br />데스크톱 앱이 자동으로 분류·업로드·썸네일까지 처리해요.
              </p>
            </div>
            <div className="mt-8 px-4 md:px-8 grid md:grid-cols-2 gap-4">
              <img src="/landing-folders.png" alt="폴더 구조" className="w-full rounded-t-2xl border border-b-0 border-gray-200 shadow-lg" />
              <img src="/landing-projects.png" alt="웹 프로젝트 화면" className="w-full rounded-t-2xl border border-b-0 border-gray-200 shadow-lg" />
            </div>
          </div>

          <div className="bg-white rounded-[32px] overflow-hidden shadow-sm border border-orange-100 mb-6">
            <div className="p-8 md:p-12 pb-0 md:pb-0">
              <span className="text-xs font-black uppercase tracking-[0.15em] text-[#F4A259]">WEB PORTFOLIO</span>
              <h3 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight mt-3 mb-3" style={{ fontFamily: "'GmarketSansMedium'" }}>나만의 포트폴리오 웹사이트</h3>
              <p className="text-sm text-gray-500 leading-relaxed">에디터에서 설정하면 실시간 프리뷰로 바로 확인.<br />링크 하나로 클라이언트에게 공유하세요.</p>
            </div>
            <div className="mt-8 px-4 md:px-8 grid md:grid-cols-2 gap-4">
              <img src="/screenshots/editor.png" alt="포트폴리오 에디터" className="w-full rounded-t-2xl md:rounded-2xl border border-gray-200 shadow-lg" />
              <img src="/screenshots/portfolio.png" alt="포트폴리오 공개 페이지" className="w-full rounded-t-2xl md:rounded-2xl border border-gray-200 shadow-lg" />
            </div>
          </div>

          <div className="bg-white rounded-[32px] overflow-hidden shadow-sm border border-orange-100 mb-6">
            <div className="p-8 md:p-12 pb-0 md:pb-0">
              <span className="text-xs font-black uppercase tracking-[0.15em] text-[#F4A259]">PROJECTS</span>
              <h3 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight mt-3 mb-3" style={{ fontFamily: "'GmarketSansMedium'" }}>프로젝트 관리</h3>
              <p className="text-sm text-gray-500 leading-relaxed">폴더가 곧 프로젝트. 카테고리, 검색, 일괄 편집.</p>
            </div>
            <div className="mt-8 px-4 md:px-8">
              <img src="/screenshots/projects.png" alt="프로젝트 관리" className="w-full rounded-t-2xl border border-b-0 border-gray-200 shadow-lg" />
            </div>
          </div>

          <div className="bg-white rounded-[32px] overflow-hidden shadow-sm border border-orange-100">
            <div className="p-8 md:p-12 pb-0 md:pb-0">
              <span className="text-xs font-black uppercase tracking-[0.15em] text-[#F4A259]">PDF EXPORT</span>
              <h3 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight mt-3 mb-3" style={{ fontFamily: "'GmarketSansMedium'" }}>PDF 포트폴리오</h3>
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
          <div className="bg-[#F4A259] rounded-[32px] p-12 md:p-16 shadow-2xl relative overflow-hidden">
            {/* 배경 눈 장식 */}
            <div className="absolute top-6 right-8 opacity-15">
              <img src="/logo/eyes.png" alt="" className="w-28 h-auto" />
            </div>
            <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight mb-4 relative" style={{ fontFamily: "'GmarketSansMedium'" }}>
              지금 시작하세요
            </h2>
            <p className="text-white/70 mb-10 text-base relative">
              무료로 다운로드하고, 작업물을 한곳에서 관리하세요.
            </p>
            <a
              href={repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="relative inline-flex items-center gap-2 px-10 py-4 bg-white text-gray-900 rounded-2xl font-bold text-base hover:bg-gray-100 transition-all"
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
      <footer className="py-10 px-6 border-t border-orange-100">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/logo/eyes.png" alt="ASSI" className="w-6 h-6 object-contain" />
            <span className="text-sm font-bold text-gray-900">ASSI</span>
          </div>
          <span className="text-xs text-gray-400">© 2025 ASSI. All rights reserved.</span>
        </div>
      </footer>
    </div>
  )
}
