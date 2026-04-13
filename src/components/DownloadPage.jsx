import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

const VERSION = '1.5.7'

export default function DownloadPage({ showLogin }) {
  const { loginWithGoogle } = useAuth()
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState(null)
  const repoUrl = `https://github.com/hanheumyang-web/assi-sync/releases/latest`

  const handleGoogle = async () => {
    setLoginLoading(true)
    setLoginError(null)
    try {
      const result = await loginWithGoogle()
      if (result === null) return // Android redirect
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
            <a
              href="/guide"
              className="px-3.5 md:px-5 py-2 md:py-2.5 text-gray-600 text-xs md:text-sm font-bold rounded-full hover:bg-gray-100 transition-colors whitespace-nowrap"
            >
              설명서
            </a>
            <button
              onClick={handleGoogle}
              disabled={loginLoading}
              className="px-3.5 md:px-5 py-2 md:py-2.5 bg-[#F4A259] text-white text-xs md:text-sm font-bold rounded-full hover:bg-[#E8923A] transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {loginLoading ? '...' : '로그인 / 가입'}
            </button>
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
          {/* ASSI 로고 */}
          <div className="mb-6">
            <img src="/logo/logo-full.png" alt="ASSI" className="w-32 md:w-40 h-auto mx-auto" />
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

          <p className="mt-6 text-xs text-gray-400">
            macOS 12+ / Windows 10+ · Apple 공증 완료 · 별도 설정 없이 바로 실행
          </p>

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
              <span className="text-sm font-bold text-gray-700">기존 포트폴리오 폴더</span>
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
              <span className="text-sm font-bold text-gray-700">ASSI 데스크톱</span>
            </div>

            <div className="hidden md:flex items-center px-3">
              <div className="w-12 h-[3px] bg-[#F4A259] rounded-full" />
              <svg className="w-4 h-4 text-[#F4A259] -ml-0.5" viewBox="0 0 12 12" fill="currentColor"><polygon points="0,0 12,6 0,12" /></svg>
            </div>
            <div className="md:hidden">
              <svg className="w-4 h-4 text-[#F4A259] rotate-90" viewBox="0 0 12 12" fill="currentColor"><polygon points="0,0 12,6 0,12" /></svg>
            </div>

            <div className="flex flex-col items-center gap-2">
              <div className="w-20 h-20 rounded-[20px] bg-white shadow-lg border-2 border-gray-200 flex items-center justify-center">
                <span className="text-3xl">🌐</span>
              </div>
              <span className="text-sm font-bold text-gray-700">웹 포트폴리오</span>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-white rounded-[24px] p-6 shadow-md text-center">
              <div className="text-2xl mb-3">1️⃣</div>
              <p className="font-bold text-gray-900 text-lg mb-2">폴더 정리</p>
              <p className="text-sm text-gray-400 leading-relaxed">기존에 쓰던 프로젝트 폴더를 그대로 사용</p>
            </div>
            <div className="bg-white rounded-[24px] p-6 shadow-md text-center">
              <div className="text-2xl mb-3">2️⃣</div>
              <p className="font-bold text-gray-900 text-lg mb-2">자동 동기화</p>
              <p className="text-sm text-gray-400 leading-relaxed">데스크톱 앱이 폴더 변경을 감지해 클라우드에 업로드</p>
            </div>
            <div className="bg-white rounded-[24px] p-6 shadow-md text-center">
              <div className="text-2xl mb-3">3️⃣</div>
              <p className="font-bold text-gray-900 text-lg mb-2">웹에서 확인</p>
              <p className="text-sm text-gray-400 leading-relaxed">브라우저에서 포트폴리오 편집 · PDF 제작 · 공유</p>
            </div>
          </div>

          {/* 폴더 구조 안내 — 4칸 파인더 레이아웃 */}
          <div className="mt-14 bg-white rounded-[24px] shadow-md overflow-hidden">
            <div className="p-8 pb-4">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#F4A259] mb-4">FOLDER STRUCTURE</p>
              <h3 className="text-2xl font-black text-gray-900 tracking-tight" style={{ fontFamily: "'GmarketSansMedium'" }}>폴더 구조 = 자동 분류</h3>
            </div>

            {/* Finder window */}
            <div className="mx-6 mb-6 border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              {/* Finder bar */}
              <div className="flex items-center gap-1.5 px-3 py-2 bg-gray-50 border-b border-gray-200">
                <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
                <span className="ml-2 text-[11px] text-gray-400 font-medium">📂 내 포트폴리오</span>
              </div>

              {/* Column headers */}
              <div className="grid grid-cols-4 border-b border-gray-100">
                <div className="px-3 py-2 text-center text-xs font-bold tracking-wider uppercase bg-blue-50 text-blue-600 border-r border-gray-100">연결 폴더</div>
                <div className="px-3 py-2 text-center text-xs font-bold tracking-wider uppercase bg-amber-50 text-amber-600 border-r border-gray-100">1차 — 분류</div>
                <div className="px-3 py-2 text-center text-xs font-bold tracking-wider uppercase bg-purple-50 text-purple-600 border-r border-gray-100">중간 — _로 연결</div>
                <div className="px-3 py-2 text-center text-xs font-bold tracking-wider uppercase bg-green-50 text-green-600">마지막 — 프로젝트</div>
              </div>

              {/* Finder items */}
              <div className="grid grid-cols-4 border-b border-gray-100" style={{ minHeight: 110 }}>
                <div className="border-r border-gray-100 py-1.5">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 mx-1 bg-blue-500 text-white rounded text-xs font-medium">📂 내 포트폴리오</div>
                </div>
                <div className="border-r border-gray-100 py-1.5">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 mx-1 bg-blue-500 text-white rounded text-xs font-medium">📂 FASHION</div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 mx-1 text-xs text-gray-600">📂 BEAUTY</div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 mx-1 text-xs text-gray-600">📂 VIDEO</div>
                </div>
                <div className="border-r border-gray-100 py-1.5">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 mx-1 bg-blue-500 text-white rounded text-xs font-medium">📁 202603</div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 mx-1 pl-5 text-xs text-gray-600">📁 클리오</div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 mx-1 pl-8 text-xs text-gray-600">📁 모델촬영</div>
                </div>
                <div className="py-1.5">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 mx-1 bg-blue-500 text-white rounded text-xs font-medium">📁 스틸이미지</div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 mx-1 text-xs text-gray-600">📁 비디오</div>
                </div>
              </div>

              {/* Chart cells */}
              <div className="grid grid-cols-4 border-b border-gray-100">
                <div className="border-r border-gray-100 p-4 text-center">
                  <div className="text-xl font-black text-blue-600 mb-1">연결 폴더</div>
                  <div className="text-xs font-bold text-gray-400 mb-2">동기화 루트</div>
                  <div className="text-xs text-gray-400 leading-relaxed">ASSI Sync<br/>프로그램과<br/>연결되는 폴더</div>
                </div>
                <div className="border-r border-gray-100 p-4 text-center">
                  <div className="text-xl font-black text-amber-600 mb-1">1차 폴더</div>
                  <div className="text-xs font-bold text-gray-400 mb-2">분류</div>
                  <div className="text-xs text-gray-400 leading-relaxed">연결 폴더 바로 아래<br/>1차 폴더는<br/><strong className="text-gray-700">자동으로 분류</strong>로<br/>인식됨</div>
                  <div className="mt-2 bg-gray-50 rounded-lg p-2">
                    <div className="text-xs font-bold text-amber-600" style={{ fontFamily: "'SF Mono','Consolas',monospace" }}>FASHION<br/>BEAUTY<br/>VIDEO</div>
                  </div>
                </div>
                <div className="border-r border-gray-100 p-4 text-center">
                  <div className="text-xl font-black text-purple-600 mb-1">중간 폴더</div>
                  <div className="text-xs font-bold text-gray-400 mb-2">_로 연결</div>
                  <div className="text-xs text-gray-400 leading-relaxed">1차 폴더와<br/>마지막 폴더 사이의<br/>폴더 이름은<br/><strong className="text-purple-600">_</strong>로 연결</div>
                  <div className="mt-2 bg-gray-50 rounded-lg p-2">
                    <div className="text-xs font-bold" style={{ fontFamily: "'SF Mono','Consolas',monospace" }}>202603 / 클리오 / 모델촬영</div>
                    <div className="mt-1 text-[11px] font-bold text-purple-600">→ 202603_클리오_모델촬영_</div>
                  </div>
                </div>
                <div className="p-4 text-center">
                  <div className="text-xl font-black text-green-600 mb-1">마지막 폴더</div>
                  <div className="text-xs font-bold text-gray-400 mb-2">프로젝트명</div>
                  <div className="text-xs text-gray-400 leading-relaxed">파일이 있는<br/>마지막 폴더가<br/>프로젝트명이 됨</div>
                  <div className="mt-2 bg-gray-50 rounded-lg p-2">
                    <div className="text-[10px] font-bold text-gray-300 tracking-wider uppercase mb-1">최종 프로젝트 명</div>
                    <div className="text-xs font-bold text-green-600" style={{ fontFamily: "'SF Mono','Consolas',monospace" }}>202603_클리오_모델촬영_스틸이미지</div>
                  </div>
                </div>
              </div>

              {/* Result */}
              <div className="p-4 bg-green-50 border-t-2 border-dashed border-green-200">
                <div className="text-xs font-bold text-green-600 tracking-wider uppercase mb-1">결과</div>
                <p className="text-sm leading-relaxed">
                  📂 내 포트폴리오 / <strong className="text-amber-600">FASHION</strong> / 202603 / 클리오 / 모델촬영 / <strong>스틸이미지</strong> / photo.jpg
                </p>
                <p className="text-sm">
                  → 분류: <strong>FASHION</strong> | 프로젝트: <strong>202603_클리오_모델촬영_스틸이미지</strong>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#F4A259] mb-3">FEATURES</p>
            <h2 className="text-3xl font-black text-gray-900 tracking-tight" style={{ fontFamily: "'GmarketSansMedium'" }}>
              포트폴리오의 모든 것,<br className="md:hidden" /> 하나의 서비스로
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* 포트폴리오 편집 */}
            <div className="bg-[#FAFAFA] rounded-[28px] overflow-hidden group hover:shadow-lg transition-all">
              <img src="/screenshots/feature-editor.png" alt="드래그 앤 드롭 편집" className="w-full aspect-[4/3] object-cover object-top" />
              <div className="p-8 pt-5">
                <h3 className="text-2xl font-black text-gray-900 mb-3">드래그 앤 드롭 편집</h3>
                <p className="text-base text-gray-500 leading-relaxed mb-4">
                  프로젝트를 드래그해서 배치하고, 크기를 조절해 나만의 그리드 레이아웃을 만드세요. 모바일에서도 터치로 편집 가능.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <span className="px-3 py-1.5 bg-white rounded-full text-sm font-bold text-gray-500 shadow-sm">타일 크기 조절</span>
                  <span className="px-3 py-1.5 bg-white rounded-full text-sm font-bold text-gray-500 shadow-sm">드래그 이동</span>
                  <span className="px-3 py-1.5 bg-white rounded-full text-sm font-bold text-gray-500 shadow-sm">자동 정렬</span>
                </div>
              </div>
            </div>

            {/* PDF 제작 */}
            <div className="bg-[#FAFAFA] rounded-[28px] overflow-hidden group hover:shadow-lg transition-all">
              <img src="/screenshots/feature-pdf.png" alt="PDF 포트폴리오" className="w-full aspect-[4/3] object-cover object-top" />
              <div className="p-8 pt-5">
                <h3 className="text-2xl font-black text-gray-900 mb-3">PDF 포트폴리오</h3>
                <p className="text-base text-gray-500 leading-relaxed mb-4">
                  클릭 한 번으로 포트폴리오를 PDF로 변환. 클라이언트에게 바로 보낼 수 있는 깔끔한 결과물.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <span className="px-3 py-1.5 bg-white rounded-full text-sm font-bold text-gray-500 shadow-sm">원클릭 생성</span>
                  <span className="px-3 py-1.5 bg-white rounded-full text-sm font-bold text-gray-500 shadow-sm">고해상도</span>
                  <span className="px-3 py-1.5 bg-white rounded-full text-sm font-bold text-gray-500 shadow-sm">커스텀 레이아웃</span>
                </div>
              </div>
            </div>

            {/* 링크 공유 */}
            <div className="bg-[#FAFAFA] rounded-[28px] overflow-hidden group hover:shadow-lg transition-all">
              <img src="/screenshots/feature-share.png" alt="포트폴리오 공유" className="w-full aspect-[4/3] object-cover object-top" />
              <div className="p-8 pt-5">
                <h3 className="text-2xl font-black text-gray-900 mb-3">포트폴리오 공유</h3>
                <p className="text-base text-gray-500 leading-relaxed mb-4">
                  나만의 포트폴리오 링크를 생성해 클라이언트, 에이전시에 바로 공유. 항상 최신 작업물이 반영됩니다.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <span className="px-3 py-1.5 bg-white rounded-full text-sm font-bold text-gray-500 shadow-sm">고유 URL</span>
                  <span className="px-3 py-1.5 bg-white rounded-full text-sm font-bold text-gray-500 shadow-sm">실시간 반영</span>
                  <span className="px-3 py-1.5 bg-white rounded-full text-sm font-bold text-gray-500 shadow-sm">비밀번호 설정</span>
                </div>
              </div>
            </div>

            {/* 무압축 전송 */}
            <div className="bg-[#FAFAFA] rounded-[28px] overflow-hidden group hover:shadow-lg transition-all">
              <img src="/screenshots/feature-transfer.png" alt="무압축 파일 전송" className="w-full aspect-[4/3] object-cover object-center" />
              <div className="p-8 pt-5">
                <h3 className="text-2xl font-black text-gray-900 mb-3">무압축 파일 전송</h3>
                <p className="text-base text-gray-500 leading-relaxed mb-4">
                  대용량 원본 파일을 압축 없이 그대로 전송. 클라이언트가 다운로드 링크로 바로 받을 수 있습니다.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <span className="px-3 py-1.5 bg-white rounded-full text-sm font-bold text-gray-500 shadow-sm">원본 화질</span>
                  <span className="px-3 py-1.5 bg-white rounded-full text-sm font-bold text-gray-500 shadow-sm">대용량 지원</span>
                  <span className="px-3 py-1.5 bg-white rounded-full text-sm font-bold text-gray-500 shadow-sm">7일 자동 만료</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 영상 지원 */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-[32px] p-10 md:p-14 text-center text-white shadow-2xl">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/10 rounded-full text-xs font-bold mb-6 backdrop-blur">
              <span className="text-sm">🎬</span> VIDEO SUPPORT
            </div>
            <h3 className="text-2xl md:text-3xl font-black tracking-tight mb-4" style={{ fontFamily: "'GmarketSansMedium'" }}>
              영상도 그대로 업로드
            </h3>
            <p className="text-sm md:text-base text-gray-400 max-w-lg mx-auto leading-relaxed mb-8">
              수 GB 영상도 원본 그대로 업로드. 자동 인코딩으로 웹에서 바로 재생되고,<br className="hidden md:block" />
              썸네일도 자동 생성됩니다.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <span className="px-4 py-2 bg-white/10 rounded-full text-xs font-bold backdrop-blur">MP4 · MOV · AVI</span>
              <span className="px-4 py-2 bg-white/10 rounded-full text-xs font-bold backdrop-blur">자동 인코딩</span>
              <span className="px-4 py-2 bg-white/10 rounded-full text-xs font-bold backdrop-blur">썸네일 자동 생성</span>
              <span className="px-4 py-2 bg-white/10 rounded-full text-xs font-bold backdrop-blur">스트리밍 재생</span>
            </div>
          </div>
        </div>
      </section>

      {/* 타겟 사용자 */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#F4A259] mb-3">WHO IS IT FOR</p>
          <h2 className="text-3xl font-black text-gray-900 tracking-tight mb-12" style={{ fontFamily: "'GmarketSansMedium'" }}>
            이런 분들을 위해 만들었어요
          </h2>
          <div className="grid md:grid-cols-4 gap-6">
            {[
              { emoji: '📸', title: '사진작가', desc: '촬영 결과물 정리 · 공유' },
              { emoji: '🎥', title: '영상 크리에이터', desc: '대용량 영상 포트폴리오' },
              { emoji: '🎨', title: '디자이너', desc: '프로젝트별 작업물 관리' },
              { emoji: '💼', title: '프리랜서', desc: '클라이언트 제안용 PDF' },
            ].map((item, i) => (
              <div key={i} className="bg-[#FAFAFA] rounded-[20px] p-6 text-center">
                <div className="text-3xl mb-3">{item.emoji}</div>
                <p className="font-bold text-gray-900 text-sm mb-1">{item.title}</p>
                <p className="text-xs text-gray-400">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight mb-4" style={{ fontFamily: "'GmarketSansMedium'" }}>
            지금 바로 시작하세요
          </h2>
          <p className="text-sm text-gray-500 mb-8">무료로 시작 · 설치 후 바로 사용</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href={repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-8 py-4 bg-gray-900 text-white rounded-2xl font-bold hover:bg-gray-800 transition-all shadow-lg"
            >
              다운로드 <span className="text-xs opacity-60 font-normal">v{VERSION}</span>
            </a>
            <button
              onClick={handleGoogle}
              disabled={loginLoading}
              className="inline-flex items-center gap-2 px-8 py-4 bg-[#F4A259] text-white rounded-2xl font-bold hover:bg-[#E8923A] transition-all shadow-lg disabled:opacity-50"
            >
              {loginLoading ? '...' : '웹에서 시작하기'}
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <div className="text-center pb-8">
        <p className="text-[10px] tracking-[0.2em] uppercase text-gray-300 font-semibold">ASSI &copy; {new Date().getFullYear()}</p>
      </div>
    </div>
  )
}
