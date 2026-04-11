import { useState } from 'react'

/* ── Reusable Components ── */

function Accordion({ title, icon, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-6 py-5 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-lg flex-shrink-0">{icon}</span>
        <span className="flex-1 text-base font-bold text-gray-900">{title}</span>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
      {open && (
        <div className="px-6 pb-6 pl-[52px] text-sm text-gray-600 leading-relaxed space-y-4">
          {children}
        </div>
      )}
    </div>
  )
}

function SubAccordion({ title, children }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="flex-1 text-sm font-semibold text-gray-700">{title}</span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
      {open && (
        <div className="px-4 pb-4 text-sm text-gray-600 leading-relaxed space-y-3 border-t border-gray-100 pt-3">
          {children}
        </div>
      )}
    </div>
  )
}

function Kbd({ children }) {
  return <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono text-gray-700">{children}</code>
}

/** Red numbered circle annotation */
function R({ n }) {
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-black flex-shrink-0 shadow-sm shadow-red-200">{n}</span>
  )
}

/** Green checkmark */
function Check() {
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-500 text-white flex-shrink-0 shadow-sm shadow-green-200">
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
    </span>
  )
}

/** Step with red number */
function Step({ number, children }) {
  return (
    <div className="flex gap-3 items-start">
      <R n={number} />
      <div className="flex-1">{children}</div>
    </div>
  )
}

/** Mockup window chrome */
function MockupWindow({ children, title = '' }) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white">
      <div className="flex items-center gap-1.5 px-3 py-2 bg-gray-50 border-b border-gray-200">
        <div className="w-2 h-2 rounded-full bg-[#FF5F57]" />
        <div className="w-2 h-2 rounded-full bg-[#FFBD2E]" />
        <div className="w-2 h-2 rounded-full bg-[#28C840]" />
        {title && <span className="ml-2 text-[10px] text-gray-400 font-medium">{title}</span>}
      </div>
      <div className="relative">
        {children}
      </div>
    </div>
  )
}

/** Annotation label positioned inside mockups */
function Label({ n, top, left, right, bottom }) {
  const style = {}
  if (top !== undefined) style.top = top
  if (left !== undefined) style.left = left
  if (right !== undefined) style.right = right
  if (bottom !== undefined) style.bottom = bottom
  return (
    <div style={style} className="absolute z-10 flex items-center justify-center w-6 h-6 rounded-full bg-red-500 text-white text-[11px] font-black shadow-lg shadow-red-200 border-2 border-white ring-2 ring-red-300 animate-pulse">
      {n}
    </div>
  )
}

/** Checkmark label positioned inside mockups */
function CheckLabel({ top, left, right, bottom }) {
  const style = {}
  if (top !== undefined) style.top = top
  if (left !== undefined) style.left = left
  if (right !== undefined) style.right = right
  if (bottom !== undefined) style.bottom = bottom
  return (
    <div style={style} className="absolute z-10 flex items-center justify-center w-6 h-6 rounded-full bg-green-500 text-white shadow-lg shadow-green-200 border-2 border-white ring-2 ring-green-300">
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
    </div>
  )
}

/* ── Main Page ── */

export default function GuidePage() {
  return (
    <div className="min-h-screen bg-[#FAFAFA]" style={{ fontFamily: "'GmarketSansMedium', Pretendard, -apple-system, sans-serif" }}>
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-[#FAFAFA]/80 border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <img src="/logo/logo-black.png" alt="ASSI" className="h-7 md:h-8 object-contain" />
          </a>
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-gray-400">GUIDE</span>
        </div>
      </header>

      {/* Hero */}
      <div className="pt-28 pb-10 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#F4A259] mb-3">USER GUIDE</p>
          <h1 className="text-3xl md:text-4xl font-black text-gray-900 tracking-tight" style={{ fontFamily: "'GmarketSansMedium'" }}>
            ASSI 사용 설명서
          </h1>
          <p className="text-sm text-gray-500 mt-3">각 항목을 눌러 자세한 설명을 확인하세요</p>
        </div>
      </div>

      {/* Overview Diagram */}
      <div className="max-w-3xl mx-auto px-4 md:px-6 pb-8">
        <div className="bg-white rounded-[20px] shadow-sm border border-orange-100 p-6 md:p-8">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#F4A259] text-center mb-4">HOW IT WORKS</p>
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-2">
            {/* Local Folder */}
            <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
              <div className="w-16 h-16 bg-blue-50 rounded-2xl border-2 border-blue-200 flex items-center justify-center text-2xl">📁</div>
              <div className="text-center">
                <div className="text-xs font-black text-gray-800">내 컴퓨터 폴더</div>
                <div className="text-[10px] text-gray-400 mt-0.5">기존 포트폴리오 폴더</div>
              </div>
              <div className="flex flex-wrap justify-center gap-1">
                <span className="px-1.5 py-0.5 bg-blue-50 rounded text-[8px] text-blue-500 font-bold">JPG</span>
                <span className="px-1.5 py-0.5 bg-blue-50 rounded text-[8px] text-blue-500 font-bold">PNG</span>
                <span className="px-1.5 py-0.5 bg-purple-50 rounded text-[8px] text-purple-500 font-bold">MP4</span>
                <span className="px-1.5 py-0.5 bg-purple-50 rounded text-[8px] text-purple-500 font-bold">MOV</span>
                <span className="px-1.5 py-0.5 bg-green-50 rounded text-[8px] text-green-500 font-bold">RAW</span>
              </div>
            </div>

            {/* Arrow 1 */}
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              <div className="hidden md:block text-[#F4A259] text-xl">&rarr;</div>
              <div className="md:hidden text-[#F4A259] text-xl">&darr;</div>
              <div className="text-[8px] text-[#F4A259] font-bold">자동 감지</div>
            </div>

            {/* ASSI Sync */}
            <div className="flex flex-col items-center gap-2 flex-1 min-w-0 relative">
              <div className="absolute -top-1 -right-1 md:right-auto md:-top-2"><R n="!" /></div>
              <div className="w-16 h-16 bg-orange-50 rounded-2xl border-2 border-[#F4A259] flex items-center justify-center shadow-sm shadow-orange-200">
                <img src="/logo/eyes.png" alt="ASSI Sync" className="w-10 h-10 object-contain" />
              </div>
              <div className="text-center">
                <div className="text-xs font-black text-[#F4A259]">ASSI Sync</div>
                <div className="text-[10px] text-gray-400 mt-0.5">데스크톱 앱</div>
              </div>
              <div className="flex flex-wrap justify-center gap-1">
                <span className="px-1.5 py-0.5 bg-orange-50 rounded text-[8px] text-[#F4A259] font-bold">압축</span>
                <span className="px-1.5 py-0.5 bg-orange-50 rounded text-[8px] text-[#F4A259] font-bold">분류</span>
                <span className="px-1.5 py-0.5 bg-orange-50 rounded text-[8px] text-[#F4A259] font-bold">업로드</span>
              </div>
            </div>

            {/* Arrow 2 */}
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              <div className="hidden md:block text-[#F4A259] text-xl">&rarr;</div>
              <div className="md:hidden text-[#F4A259] text-xl">&darr;</div>
              <div className="text-[8px] text-[#F4A259] font-bold">실시간 동기화</div>
            </div>

            {/* ASSI Web */}
            <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
              <div className="w-16 h-16 bg-gray-900 rounded-2xl flex items-center justify-center shadow-sm">
                <span className="text-white text-sm font-black tracking-tight">ASSI</span>
              </div>
              <div className="text-center">
                <div className="text-xs font-black text-gray-800">ASSI 웹 서비스</div>
                <div className="text-[10px] text-gray-400 mt-0.5">assi.lat</div>
              </div>
              <div className="flex flex-wrap justify-center gap-1">
                <span className="px-1.5 py-0.5 bg-gray-100 rounded text-[8px] text-gray-600 font-bold">프로젝트</span>
                <span className="px-1.5 py-0.5 bg-gray-100 rounded text-[8px] text-gray-600 font-bold">포트폴리오</span>
                <span className="px-1.5 py-0.5 bg-gray-100 rounded text-[8px] text-gray-600 font-bold">공유</span>
                <span className="px-1.5 py-0.5 bg-gray-100 rounded text-[8px] text-gray-600 font-bold">PDF</span>
              </div>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-orange-100 text-center">
            <p className="text-xs text-gray-500">기존에 관리하던 포트폴리오 폴더를 <strong className="text-gray-700">ASSI Sync</strong>에 연결하면,</p>
            <p className="text-xs text-gray-500">폴더 안의 모든 이미지와 영상이 <strong className="text-gray-700">자동으로 정리 · 업로드</strong>되어</p>
            <p className="text-xs text-gray-500"><strong className="text-gray-700">ASSI 웹 서비스</strong>에서 포트폴리오 제작, 무압축 공유, PDF 생성 등을 이용할 수 있습니다.</p>
          </div>
        </div>
      </div>

      {/* Guide Content */}
      <div className="max-w-3xl mx-auto px-4 md:px-6 pb-20">

        {/* ═══ 1. 시작하기 ═══ */}
        <div className="bg-white rounded-[20px] shadow-sm border border-orange-100 mb-4 overflow-hidden">
          <div className="px-6 pt-5 pb-2">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#F4A259]">01</p>
            <h2 className="text-xl font-black text-gray-900 tracking-tight mt-1">시작하기</h2>
          </div>
          <Accordion title="회원가입 & 로그인" icon="🔐" defaultOpen={true}>
            {/* Mockup: Landing page */}
            <MockupWindow title="assi.lat">
              <div className="p-4 bg-[#FAFAFA]">
                <div className="flex items-center justify-between mb-6">
                  <div className="w-14 h-5 bg-gray-800 rounded" />
                  <div className="flex gap-2 relative">
                    <Label n="1" top={-10} right={-10} />
                    <div className="px-3 py-1.5 bg-[#F4A259] rounded-full text-[9px] text-white font-bold">로그인 / 가입</div>
                  </div>
                </div>
                <div className="text-center py-6">
                  <div className="text-[11px] font-black text-gray-800 mb-1">지긋지긋한 포트폴리오 관리,</div>
                  <div className="text-[11px] font-black text-gray-800">하나의 폴더로</div>
                </div>
              </div>
            </MockupWindow>
            <Step number="1">
              <p><a href="/" className="text-[#F4A259] font-bold hover:underline">assi.lat</a> 접속 후 <strong>"로그인 / 가입"</strong> 버튼을 클릭합니다.</p>
            </Step>

            {/* Mockup: Google login popup */}
            <MockupWindow title="Google 로그인">
              <div className="p-4 bg-white flex flex-col items-center gap-3 relative">
                <Label n="2" top={8} left={8} />
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-500 text-lg font-bold">G</div>
                <div className="text-[10px] font-bold text-gray-700">Google 계정 선택</div>
                <div className="w-full max-w-[180px] bg-gray-50 rounded-lg p-2 flex items-center gap-2 border border-gray-200">
                  <div className="w-6 h-6 rounded-full bg-orange-200" />
                  <div>
                    <div className="text-[9px] font-bold text-gray-700">내 계정</div>
                    <div className="text-[8px] text-gray-400">user@gmail.com</div>
                  </div>
                </div>
              </div>
            </MockupWindow>
            <Step number="2">
              <p>Google 계정을 선택하면 자동으로 회원가입이 완료됩니다.</p>
            </Step>

            {/* Mockup: Onboarding */}
            <MockupWindow title="온보딩">
              <div className="p-4 bg-white relative">
                <Label n="3" top={8} right={8} />
                <div className="text-center mb-3">
                  <div className="text-[10px] font-bold text-gray-700 mb-2">반갑습니다! 정보를 입력해주세요</div>
                </div>
                <div className="space-y-2 max-w-[200px] mx-auto">
                  <div>
                    <div className="text-[8px] text-gray-400 mb-0.5">이름</div>
                    <div className="h-6 bg-gray-100 rounded border border-gray-200 px-2 flex items-center text-[9px] text-gray-500">김포토</div>
                  </div>
                  <div>
                    <div className="text-[8px] text-gray-400 mb-0.5">직업</div>
                    <div className="flex flex-wrap gap-1">
                      {['포토그래퍼', '영상감독', '스타일리스트'].map(j => (
                        <span key={j} className={`px-2 py-0.5 rounded-full text-[7px] font-bold ${j === '포토그래퍼' ? 'bg-[#F4A259] text-white' : 'bg-gray-100 text-gray-500'}`}>{j}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-center pt-1">
                    <div className="px-4 py-1 bg-[#F4A259] rounded-full text-[8px] text-white font-bold flex items-center gap-1">
                      <Check /> 시작하기
                    </div>
                  </div>
                </div>
              </div>
            </MockupWindow>
            <Step number="3">
              <p>처음 가입하면 <strong>이름</strong>과 <strong>직업</strong>을 선택합니다.</p>
              <p className="text-xs text-gray-400">직업: 포토그래퍼, 영상감독, 스타일리스트, 메이크업 아티스트, 모델, 기타</p>
            </Step>
          </Accordion>
        </div>

        {/* ═══ 2. ASSI Sync ═══ */}
        <div className="bg-white rounded-[20px] shadow-sm border border-orange-100 mb-4 overflow-hidden">
          <div className="px-6 pt-5 pb-2">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#F4A259]">02</p>
            <h2 className="text-xl font-black text-gray-900 tracking-tight mt-1">ASSI Sync (데스크톱 앱)</h2>
          </div>
          <Accordion title="다운로드 & 설치" icon="💻">
            <p>Mac과 Windows 모두 지원합니다.</p>
            <div className="flex flex-wrap gap-2">
              <a href="https://github.com/hanheumyang-web/assi-sync/releases/latest/download/ASSI-Sync-Windows-1.4.0.exe" className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-xs font-bold rounded-full hover:bg-gray-700 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" /></svg>
                Windows 다운로드
              </a>
              <a href="https://github.com/hanheumyang-web/assi-sync/releases/latest/download/ASSI-Sync-Mac-1.4.0-arm64.zip" className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-xs font-bold rounded-full hover:bg-gray-700 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" /></svg>
                Mac (Apple Silicon)
              </a>
              <a href="https://github.com/hanheumyang-web/assi-sync/releases/latest/download/ASSI-Sync-Mac-1.4.0-x64.zip" className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-700 text-white text-xs font-bold rounded-full hover:bg-gray-600 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" /></svg>
                Mac (Intel)
              </a>
            </div>
            <SubAccordion title="Mac 설치">
              {/* Mockup: Mac install flow */}
              <MockupWindow title="Finder">
                <div className="p-3 bg-white relative">
                  <Label n="1" top={4} left={4} />
                  <div className="flex items-center gap-3 justify-center py-2">
                    <div className="flex flex-col items-center gap-1">
                      <div className="w-10 h-10 bg-blue-50 rounded-lg border border-blue-200 flex items-center justify-center text-[8px] font-bold text-blue-500">ZIP</div>
                      <div className="text-[7px] text-gray-500">ASSI-Sync.zip</div>
                    </div>
                    <div className="text-gray-300 text-lg">&rarr;</div>
                    <div className="flex flex-col items-center gap-1 relative">
                      <Label n="2" top={-8} right={-8} />
                      <div className="w-10 h-10 bg-orange-50 rounded-lg border border-orange-200 flex items-center justify-center">
                        <img src="/logo/eyes.png" alt="" className="w-6 h-6 object-contain" />
                      </div>
                      <div className="text-[7px] text-gray-500">ASSI Sync.app</div>
                    </div>
                    <div className="text-gray-300 text-lg">&rarr;</div>
                    <div className="flex flex-col items-center gap-1 relative">
                      <CheckLabel top={-8} right={-8} />
                      <div className="w-10 h-10 bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-center text-[16px]">📁</div>
                      <div className="text-[7px] text-gray-500">응용 프로그램</div>
                    </div>
                  </div>
                </div>
              </MockupWindow>
              <Step number="1">
                <p>본인 칩에 맞는 ZIP을 다운로드합니다.</p>
                <p className="text-xs text-gray-400">Apple Silicon (M1/M2/M3/M4): arm64 / Intel Mac: x64</p>
                <p className="text-xs text-gray-400">확인: Apple 로고 {'>'} 이 Mac에 관하여 {'>'} 칩/프로세서</p>
              </Step>
              <Step number="2"><p>압축 해제된 <strong>ASSI Sync.app</strong>을 <strong>응용 프로그램</strong> 폴더로 드래그합니다.</p></Step>
              <div className="flex items-center gap-2 text-xs text-green-600 font-bold"><Check /> Apple 공증 완료 - 별도 설정 없이 바로 실행됩니다.</div>
            </SubAccordion>
            <SubAccordion title="Windows 설치">
              <MockupWindow title="Windows">
                <div className="p-3 bg-white relative">
                  <div className="flex items-center gap-3 justify-center py-2">
                    <div className="flex flex-col items-center gap-1 relative">
                      <Label n="1" top={-8} right={-8} />
                      <div className="w-10 h-10 bg-blue-50 rounded-lg border border-blue-200 flex items-center justify-center text-[8px] font-bold text-blue-500">.exe</div>
                      <div className="text-[7px] text-gray-500">ASSI-Sync.exe</div>
                    </div>
                    <div className="text-gray-300 text-lg">&rarr;</div>
                    <div className="flex flex-col items-center gap-1 p-2 bg-blue-50 rounded-lg border border-blue-200 relative">
                      <Label n="2" top={-8} right={-8} />
                      <div className="text-[8px] text-gray-600 font-bold">SmartScreen</div>
                      <div className="text-[7px] text-blue-500 underline">추가 정보 {'>'} 실행</div>
                    </div>
                    <div className="text-gray-300 text-lg">&rarr;</div>
                    <div className="flex flex-col items-center gap-1 relative">
                      <CheckLabel top={-8} right={-8} />
                      <div className="w-10 h-10 bg-orange-50 rounded-lg border border-orange-200 flex items-center justify-center">
                        <img src="/logo/eyes.png" alt="" className="w-6 h-6 object-contain" />
                      </div>
                      <div className="text-[7px] text-gray-500">설치 완료</div>
                    </div>
                  </div>
                </div>
              </MockupWindow>
              <Step number="1"><p><Kbd>.exe</Kbd> 파일 다운로드 후 더블클릭하여 설치합니다.</p></Step>
              <Step number="2"><p>SmartScreen 경고가 나오면 <strong>"추가 정보 {'>'} 실행"</strong>을 클릭합니다.</p></Step>
            </SubAccordion>
          </Accordion>

          <Accordion title="로그인 & 폴더 선택" icon="📂">
            <MockupWindow title="ASSI Sync">
              <div className="p-4 bg-gray-900 text-white relative">
                <div className="flex flex-col items-center gap-2 py-2">
                  <img src="/logo/eyes.png" alt="" className="w-8 h-8 object-contain" />
                  <div className="text-[10px] font-bold">ASSI Sync</div>
                  <div className="relative">
                    <Label n="1" top={-8} right={-10} />
                    <div className="px-6 py-1.5 bg-white text-gray-900 rounded-full text-[9px] font-bold flex items-center gap-1.5">
                      <span className="text-blue-500 text-[10px]">G</span> Google 로그인
                    </div>
                  </div>
                </div>
                <div className="mt-3 border-t border-gray-700 pt-3 relative">
                  <Label n="2" top={0} right={4} />
                  <div className="flex items-center gap-2 bg-gray-800 rounded-lg p-2">
                    <div className="text-[14px]">📁</div>
                    <div className="flex-1">
                      <div className="text-[8px] text-gray-400">연결 폴더</div>
                      <div className="text-[9px] font-bold">C:\Users\사용자\포트폴리오</div>
                    </div>
                    <div className="px-2 py-0.5 bg-gray-700 rounded text-[8px]">선택</div>
                  </div>
                </div>
                <div className="mt-2 flex justify-center relative">
                  <Label n="3" top={-6} right={20} />
                  <div className="px-8 py-1.5 bg-[#F4A259] rounded-full text-[9px] font-bold">동기화 시작</div>
                </div>
              </div>
            </MockupWindow>
            <Step number="1"><p>앱을 실행하고 <strong>Google 로그인</strong>을 합니다. (웹과 동일 계정)</p></Step>
            <Step number="2"><p>연결할 <strong>포트폴리오 폴더</strong>를 선택합니다.</p></Step>
            <Step number="3"><p><strong>"동기화 시작"</strong>을 누르면 폴더 안의 이미지/영상이 자동으로 업로드됩니다.</p></Step>
          </Accordion>

          <Accordion title="폴더 구조 = 자동 분류" icon="🗂️">
            <p>ASSI Sync는 폴더 구조를 자동으로 인식합니다.</p>
            <MockupWindow title="폴더 구조 예시">
              <div className="p-4 bg-white font-mono text-xs leading-loose relative">
                <div className="absolute top-3 right-3 flex flex-col gap-1">
                  <span className="flex items-center gap-1 text-[8px] text-[#F4A259] font-bold"><R n="1" /> 카테고리</span>
                  <span className="flex items-center gap-1 text-[8px] text-blue-600 font-bold"><R n="2" /> 프로젝트</span>
                </div>
                <p>📁 포트폴리오/</p>
                <p className="pl-5">📁 <span className="text-[#F4A259] font-bold bg-orange-50 px-1 rounded">FASHION</span>/</p>
                <p className="pl-10">📁 <span className="text-blue-600 font-bold bg-blue-50 px-1 rounded">브랜드A 룩북</span>/</p>
                <p className="pl-14 text-gray-400">photo_001.jpg, photo_002.jpg ...</p>
                <p className="pl-10">📁 <span className="text-blue-600 font-bold bg-blue-50 px-1 rounded">매거진 화보</span>/</p>
                <p className="pl-14 text-gray-400">img_01.jpg, video_01.mp4 ...</p>
                <p className="pl-5">📁 <span className="text-[#F4A259] font-bold bg-orange-50 px-1 rounded">BEAUTY</span>/</p>
                <p className="pl-10">📁 <span className="text-blue-600 font-bold bg-blue-50 px-1 rounded">뷰티 캠페인</span>/</p>
                <p className="pl-14 text-gray-400">...</p>
              </div>
            </MockupWindow>
            <Step number="1"><p><strong className="text-[#F4A259]">1단계 폴더</strong> = 카테고리 (FASHION, BEAUTY 등)</p></Step>
            <Step number="2"><p><strong className="text-blue-600">2단계 폴더</strong> = 프로젝트 (브랜드A 룩북, 매거진 화보 등)</p></Step>
            <p className="text-xs text-gray-400">기본 카테고리: <Kbd>FASHION</Kbd> <Kbd>BEAUTY</Kbd> <Kbd>CELEBRITY</Kbd> <Kbd>AD</Kbd> <Kbd>PORTRAIT</Kbd> <Kbd>PERSONAL WORK</Kbd></p>
            <p className="text-xs text-gray-400">위에 없는 폴더명은 커스텀 카테고리로 자동 등록됩니다.</p>
          </Accordion>

          <Accordion title="자동 업데이트" icon="🔄">
            <MockupWindow title="ASSI Sync">
              <div className="p-3 bg-gray-900 text-white flex items-center gap-3 relative">
                <CheckLabel top={4} left={4} />
                <div className="flex-1 pl-6">
                  <div className="text-[9px] font-bold">새 버전이 있습니다 (v1.4.0)</div>
                  <div className="mt-1 w-full bg-gray-700 rounded-full h-1.5">
                    <div className="bg-green-400 h-1.5 rounded-full" style={{ width: '100%' }} />
                  </div>
                  <div className="text-[8px] text-green-400 mt-0.5">다운로드 완료 - 앱 종료 시 자동 설치</div>
                </div>
              </div>
            </MockupWindow>
            <div className="flex items-center gap-2 text-xs font-bold text-green-600"><Check /> 새 버전이 나오면 자동 다운로드, 앱 종료 시 자동 설치. 별도 조작이 필요 없습니다.</div>
          </Accordion>
        </div>

        {/* ═══ 3. 프로젝트 관리 ═══ */}
        <div className="bg-white rounded-[20px] shadow-sm border border-orange-100 mb-4 overflow-hidden">
          <div className="px-6 pt-5 pb-2">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#F4A259]">03</p>
            <h2 className="text-xl font-black text-gray-900 tracking-tight mt-1">프로젝트 관리</h2>
          </div>
          <Accordion title="프로젝트 목록 & 카테고리" icon="📋">
            <MockupWindow title="ASSI - 대시보드">
              <div className="flex bg-white">
                {/* Sidebar */}
                <div className="w-[100px] bg-gray-50 border-r border-gray-200 p-2 space-y-1 relative">
                  <Label n="1" top={4} left={4} />
                  <div className="text-[7px] font-bold text-gray-400 px-1">카테고리</div>
                  {['ALL', 'FASHION', 'BEAUTY', 'AD'].map((c, i) => (
                    <div key={c} className={`text-[8px] px-2 py-1 rounded ${i === 1 ? 'bg-[#F4A259] text-white font-bold' : 'text-gray-500'}`}>{c}</div>
                  ))}
                </div>
                {/* Project grid */}
                <div className="flex-1 p-2 relative">
                  <Label n="2" top={2} right={4} />
                  <div className="flex gap-1 mb-2">
                    <div className="flex-1 h-5 bg-gray-100 rounded text-[7px] text-gray-400 px-2 flex items-center">검색...</div>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {[1,2,3,4,5,6].map(i => (
                      <div key={i} className="relative">
                        <div className={`aspect-[4/3] rounded ${i <= 2 ? 'bg-orange-100' : i <= 4 ? 'bg-blue-100' : 'bg-gray-100'}`} />
                        <div className="text-[6px] text-gray-500 mt-0.5 truncate">프로젝트 {i}</div>
                        <div className="text-[5px] text-gray-300">12장 2영상</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </MockupWindow>
            <Step number="1"><p>좌측 <strong>카테고리</strong>에서 원하는 분류를 선택합니다.</p></Step>
            <Step number="2"><p>검색, 카드 미리보기로 프로젝트를 탐색합니다. 이미지 수, 영상 수가 자동 표시됩니다.</p></Step>
          </Accordion>

          <Accordion title="프로젝트 상세 & 편집" icon="✏️">
            <MockupWindow title="프로젝트 상세">
              <div className="p-3 bg-white relative">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="text-[10px] font-bold text-gray-800">브랜드A 룩북</div>
                    <div className="px-1.5 py-0.5 bg-orange-100 rounded text-[7px] text-[#F4A259] font-bold">FASHION</div>
                  </div>
                  <div className="relative">
                    <Label n="1" top={-8} right={-8} />
                    <div className="flex gap-1">
                      <div className="px-2 py-0.5 bg-gray-100 rounded text-[7px] text-gray-600">편집</div>
                      <div className="px-2 py-0.5 bg-[#F4A259] rounded text-[7px] text-white font-bold">무압축 공유</div>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-1 relative">
                  <Label n="2" top={-6} left={-6} />
                  {[1,2,3,4,5,6,7,8].map(i => (
                    <div key={i} className={`aspect-square rounded ${i % 3 === 0 ? 'bg-blue-100' : 'bg-orange-50'}`} />
                  ))}
                </div>
              </div>
            </MockupWindow>
            <Step number="1"><p>상단 <strong>편집</strong> 버튼으로 프로젝트 이름, 클라이언트, 카테고리를 수정합니다.</p></Step>
            <Step number="2"><p>이미지/영상 격자에서 파일을 클릭하면 크게 볼 수 있습니다.</p></Step>
          </Accordion>

          <Accordion title="엠바고 설정" icon="🔒">
            <MockupWindow title="엠바고 설정">
              <div className="p-3 bg-white relative">
                <div className="flex items-center gap-2 mb-2">
                  <div className="text-[10px] font-bold text-gray-800">브랜드A 룩북</div>
                  <div className="px-1.5 py-0.5 bg-red-100 rounded text-[7px] text-red-500 font-bold">EMBARGO</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-2 space-y-1.5 relative">
                  <Label n="1" top={-8} right={-8} />
                  <div className="flex items-center gap-2">
                    <div className="text-[8px] text-gray-500 w-12">시작일</div>
                    <div className="flex-1 h-5 bg-white border border-gray-200 rounded text-[8px] text-gray-600 px-2 flex items-center">2026-04-15</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-[8px] text-gray-500 w-12">종료일</div>
                    <div className="flex-1 h-5 bg-white border border-gray-200 rounded text-[8px] text-gray-600 px-2 flex items-center">2026-05-01</div>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1 text-[8px] text-green-500 font-bold relative">
                  <CheckLabel top={-4} left={-6} />
                  <span className="pl-5">종료일이 지나면 자동으로 엠바고 해제</span>
                </div>
              </div>
            </MockupWindow>
            <Step number="1"><p>프로젝트 편집에서 엠바고 <strong>날짜와 시간</strong>을 설정합니다.</p></Step>
            <div className="flex items-center gap-2 text-xs text-green-600 font-bold"><Check /> 설정된 날짜가 지나면 자동으로 엠바고가 해제됩니다.</div>
            <p className="text-xs text-gray-400">대시보드 캘린더에서 엠바고 일정을 한눈에 확인할 수 있습니다.</p>
          </Accordion>
        </div>

        {/* ═══ 4. 무압축 공유 ═══ */}
        <div className="bg-white rounded-[20px] shadow-sm border border-orange-100 mb-4 overflow-hidden">
          <div className="px-6 pt-5 pb-2">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#F4A259]">04</p>
            <h2 className="text-xl font-black text-gray-900 tracking-tight mt-1">무압축 공유</h2>
          </div>
          <Accordion title="프로젝트 무압축 공유" icon="📦">
            <p>프로젝트의 무압축 원본 파일을 클라이언트에게 공유할 수 있습니다.</p>

            {/* Step 1: Click share button */}
            <MockupWindow title="프로젝트 상세">
              <div className="p-3 bg-white relative">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-bold text-gray-800">브랜드A 룩북</div>
                  <div className="relative">
                    <Label n="1" top={-10} right={-10} />
                    <div className="px-3 py-1 bg-[#F4A259] rounded-full text-[8px] text-white font-bold">무압축 공유</div>
                  </div>
                </div>
              </div>
            </MockupWindow>
            <Step number="1"><p>프로젝트 상세에서 <strong>"무압축 공유"</strong> 버튼을 클릭합니다.</p></Step>

            {/* Step 2: Select files */}
            <MockupWindow title="무압축 공유 - 파일 선택">
              <div className="p-3 bg-white relative">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[9px] font-bold text-gray-700">공유할 파일 선택</div>
                  <div className="relative">
                    <Label n="2" top={-10} right={-10} />
                    <div className="flex gap-1">
                      <div className="px-2 py-0.5 bg-gray-100 rounded text-[7px] text-gray-600 font-bold">전체 선택</div>
                      <div className="px-2 py-0.5 bg-gray-100 rounded text-[7px] text-gray-400">전체 해제</div>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[1,2,3,4,5,6,7,8].map(i => (
                    <div key={i} className="relative">
                      <div className={`aspect-square rounded ${i <= 6 ? 'bg-orange-100' : 'bg-gray-100'}`} />
                      <div className={`absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded border-2 flex items-center justify-center ${i <= 6 ? 'bg-[#F4A259] border-[#F4A259]' : 'bg-white border-gray-300'}`}>
                        {i <= 6 && <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="4"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                  <div className="text-[8px] text-gray-400">6개 선택 / 총 142MB</div>
                  <div className="px-4 py-1 bg-[#F4A259] rounded-full text-[8px] text-white font-bold">공유하기</div>
                </div>
              </div>
            </MockupWindow>
            <Step number="2"><p>미리보기를 보면서 <strong>체크박스</strong>로 공유할 파일을 선택합니다. (전체 선택/해제 가능)</p></Step>

            {/* Step 3: Uploading */}
            <MockupWindow title="업로드 중...">
              <div className="p-3 bg-white relative">
                <Label n="3" top={4} left={4} />
                <div className="text-center py-2">
                  <div className="text-[10px] font-bold text-gray-700 mb-1">ASSI Sync가 무압축 파일을 업로드하고 있습니다</div>
                  <div className="text-[8px] text-gray-400 mb-2">4 / 6 파일 완료</div>
                  <div className="w-full bg-gray-100 rounded-full h-2 mb-1">
                    <div className="bg-[#F4A259] h-2 rounded-full transition-all" style={{ width: '66%' }} />
                  </div>
                  <div className="text-[8px] text-[#F4A259] font-bold">66%</div>
                </div>
              </div>
            </MockupWindow>
            <Step number="3"><p>ASSI Sync가 로컬의 무압축 파일을 자동 업로드합니다. <strong>진행률이 실시간 표시</strong>됩니다.</p></Step>

            {/* Step 4: Complete */}
            <MockupWindow title="공유 완료">
              <div className="p-3 bg-white relative">
                <Label n="4" top={4} right={4} />
                <div className="text-center py-2">
                  <div className="flex justify-center mb-1"><Check /></div>
                  <div className="text-[10px] font-bold text-green-600 mb-2">공유 링크가 생성되었습니다!</div>
                  <div className="flex items-center gap-1 bg-gray-50 rounded-lg p-1.5 max-w-[240px] mx-auto">
                    <div className="flex-1 text-[7px] text-gray-500 truncate font-mono">https://assi.lat/share/abc123</div>
                    <div className="px-2 py-0.5 bg-gray-900 text-white rounded text-[7px] font-bold flex-shrink-0">복사</div>
                  </div>
                  <div className="text-[7px] text-gray-400 mt-1">7일 후 자동 만료</div>
                </div>
              </div>
            </MockupWindow>
            <Step number="4"><p>업로드 완료 후 <strong>공유 링크</strong>가 생성됩니다. 복사해서 전달하세요.</p></Step>
            <p className="text-xs text-gray-400">ASSI Sync 데스크톱 앱이 실행 중이어야 무압축 업로드가 진행됩니다.</p>
          </Accordion>

          <Accordion title="단일 파일 공유" icon="📄">
            <MockupWindow title="무압축 파일 공유">
              <div className="p-3 bg-white relative">
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center relative">
                  <Label n="1" top={-8} left="50%" />
                  <div className="text-[20px] mb-1">📄</div>
                  <div className="text-[9px] text-gray-500">파일을 드래그하거나 클릭해서 선택</div>
                  <div className="text-[7px] text-gray-300 mt-0.5">최대 500GB</div>
                </div>
                <div className="mt-2 relative">
                  <Label n="2" top={-4} right={4} />
                  <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-2">
                    <div className="w-8 h-8 bg-blue-100 rounded flex items-center justify-center text-[8px] font-bold text-blue-500">PSD</div>
                    <div className="flex-1">
                      <div className="text-[8px] font-bold text-gray-700">작업물_final.psd</div>
                      <div className="w-full bg-gray-200 rounded-full h-1 mt-0.5">
                        <div className="bg-[#F4A259] h-1 rounded-full" style={{ width: '80%' }} />
                      </div>
                    </div>
                    <div className="text-[7px] text-[#F4A259] font-bold">80%</div>
                  </div>
                </div>
              </div>
            </MockupWindow>
            <Step number="1"><p>메뉴에서 <strong>"무압축 파일 공유"</strong>를 선택하고 파일을 드래그합니다.</p></Step>
            <Step number="2"><p>업로드 진행률 확인 후 공유 링크가 생성됩니다.</p></Step>
          </Accordion>

          <Accordion title="다운로드 (수신자)" icon="⬇️">
            <MockupWindow title="assi.lat/share/abc123">
              <div className="p-3 bg-[#FAFAFA] relative">
                <div className="bg-white rounded-xl p-3 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-orange-200" />
                    <div>
                      <div className="text-[8px] font-bold text-gray-700">김포토</div>
                      <div className="text-[6px] text-gray-400">브랜드A 룩북 · 6개 파일</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-1 mb-2">
                    {[1,2,3,4,5,6].map(i => (
                      <div key={i} className="aspect-square rounded bg-orange-50 relative">
                        <div className="absolute bottom-0.5 right-0.5">
                          <Label n="" top={undefined} left={undefined} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-1 relative">
                    <Label n="1" top={-8} left={20} />
                    <div className="flex-1 py-1 bg-gray-900 rounded-full text-[8px] text-white text-center font-bold">전체 다운로드</div>
                    <Label n="2" top={-8} right={4} />
                    <div className="py-1 px-3 bg-gray-100 rounded-full text-[8px] text-gray-600 text-center font-bold">개별</div>
                  </div>
                </div>
              </div>
            </MockupWindow>
            <Step number="1"><p><strong>전체 다운로드</strong>로 모든 파일을 한번에 받을 수 있습니다.</p></Step>
            <Step number="2"><p><strong>개별 다운로드</strong>로 원하는 파일만 선택해서 받을 수 있습니다.</p></Step>
            <div className="flex items-center gap-2 text-xs text-green-600 font-bold"><Check /> 별도 가입 없이 링크만으로 바로 다운로드 가능합니다.</div>
          </Accordion>

          <Accordion title="7일 자동 만료" icon="⏳">
            <MockupWindow title="공유 상태">
              <div className="p-3 bg-white">
                <div className="flex items-center gap-3">
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Check /><span className="text-[9px] text-gray-600">공유 생성</span>
                      <span className="text-[7px] text-gray-300">4/11</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-orange-100 flex items-center justify-center text-[10px]">📅</div>
                      <span className="text-[9px] text-gray-600">다운로드 가능</span>
                      <span className="text-[7px] text-green-500 font-bold">활성</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <R n="!" /><span className="text-[9px] text-red-400 font-bold">자동 만료 & 파일 삭제</span>
                      <span className="text-[7px] text-gray-300">4/18</span>
                    </div>
                  </div>
                </div>
              </div>
            </MockupWindow>
            <p>공유 링크는 생성 후 <strong>7일</strong>이 지나면 자동으로 만료됩니다.</p>
            <p>만료 후 파일은 서버에서 완전 삭제되며, 링크는 더 이상 작동하지 않습니다.</p>
          </Accordion>
        </div>

        {/* ═══ 5. 포트폴리오 ═══ */}
        <div className="bg-white rounded-[20px] shadow-sm border border-orange-100 mb-4 overflow-hidden">
          <div className="px-6 pt-5 pb-2">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#F4A259]">05</p>
            <h2 className="text-xl font-black text-gray-900 tracking-tight mt-1">포트폴리오</h2>
          </div>
          <Accordion title="포트폴리오 에디터" icon="🎨">
            <MockupWindow title="포트폴리오 에디터">
              <div className="flex bg-white">
                {/* Settings panel */}
                <div className="w-[120px] bg-gray-50 border-r border-gray-200 p-2 space-y-2 relative">
                  <Label n="1" top={4} left={4} />
                  <div>
                    <div className="text-[7px] text-gray-400 font-bold mb-0.5">비즈니스 이름</div>
                    <div className="h-4 bg-white border border-gray-200 rounded text-[7px] px-1 flex items-center text-gray-600">KIM STUDIO</div>
                  </div>
                  <div>
                    <div className="text-[7px] text-gray-400 font-bold mb-0.5">색상</div>
                    <div className="flex gap-1">
                      {['#fff', '#1a1a1a', '#F4A259', '#1e3a5f', '#2d5016'].map((c, i) => (
                        <div key={i} className={`w-3.5 h-3.5 rounded-full border ${i === 0 ? 'border-gray-300' : 'border-transparent'} ${i === 2 ? 'ring-2 ring-orange-300' : ''}`} style={{ backgroundColor: c }} />
                      ))}
                    </div>
                  </div>
                  <div className="relative">
                    <Label n="2" top={-4} right={-4} />
                    <div className="text-[7px] text-gray-400 font-bold mb-0.5">글꼴</div>
                    <div className="h-4 bg-white border border-gray-200 rounded text-[7px] px-1 flex items-center text-gray-600">Pretendard</div>
                  </div>
                  <div>
                    <div className="text-[7px] text-gray-400 font-bold mb-0.5">그리드 컬럼</div>
                    <div className="flex gap-0.5">
                      {[2,3,4].map(n => (
                        <div key={n} className={`flex-1 h-4 rounded text-[7px] flex items-center justify-center font-bold ${n === 3 ? 'bg-[#F4A259] text-white' : 'bg-gray-100 text-gray-400'}`}>{n}</div>
                      ))}
                    </div>
                  </div>
                </div>
                {/* Preview */}
                <div className="flex-1 p-2 relative">
                  <Label n="3" top={2} right={4} />
                  <div className="text-[7px] text-gray-300 text-center mb-1">실시간 프리뷰</div>
                  <div className="grid grid-cols-3 gap-0.5">
                    {[1,2,3,4,5,6].map(i => (
                      <div key={i} className={`aspect-[3/2] rounded-sm ${i % 2 === 0 ? 'bg-orange-100' : 'bg-blue-50'}`} />
                    ))}
                  </div>
                </div>
              </div>
            </MockupWindow>
            <Step number="1"><p>좌측 패널에서 <strong>비즈니스 이름, 태그라인, 연락처</strong>를 설정합니다.</p></Step>
            <Step number="2"><p><strong>색상, 글꼴, 그리드</strong> 등 디자인을 커스터마이징합니다.</p></Step>
            <Step number="3"><p>우측 <strong>실시간 프리뷰</strong>에서 결과를 바로 확인합니다.</p></Step>

            <SubAccordion title="디자인 설정 상세">
              <p><strong>색상 프리셋</strong>: Light, Dark, Warm, Navy, Forest 중 선택하거나 직접 지정</p>
              <p><strong>글꼴</strong>: 한글 5종, 영문 7종</p>
              <p><strong>그리드</strong>: 컬럼 수(2~6), 종횡비(3:2, 1:1, 4:3 등)</p>
              <p><strong>세부 조정</strong>: 간격, 글자 크기, 여백, 모서리 둥글기</p>
            </SubAccordion>
            <SubAccordion title="프로젝트 관리">
              <p>포트폴리오에 표시할 프로젝트를 선택하고 순서를 드래그로 조정합니다.</p>
              <p>각 프로젝트에서 대표 이미지를 선택할 수 있습니다.</p>
            </SubAccordion>
            <p className="text-xs text-gray-400">변경사항은 2초 후 자동 저장됩니다.</p>
          </Accordion>

          <Accordion title="웹사이트 공개 & 공유" icon="🌐">
            <MockupWindow title="포트폴리오 발행">
              <div className="p-3 bg-white relative">
                <div className="space-y-2">
                  <div className="relative">
                    <Label n="1" top={-4} left={-4} />
                    <div className="flex items-center gap-1 bg-gray-50 rounded-lg p-2">
                      <span className="text-[8px] text-gray-400">assi.lat/p/</span>
                      <span className="text-[9px] font-bold text-gray-800">kimphoto</span>
                      <span className="text-[7px] text-green-500 font-bold ml-auto">사용 가능</span>
                    </div>
                  </div>
                  <div className="flex justify-center relative">
                    <Label n="2" top={-8} right={30} />
                    <div className="px-6 py-1.5 bg-[#F4A259] rounded-full text-[9px] text-white font-bold">발행하기</div>
                  </div>
                </div>
              </div>
            </MockupWindow>
            <Step number="1"><p>고유 <strong>slug</strong>를 설정합니다. (예: <Kbd>kimphoto</Kbd>)</p></Step>
            <Step number="2"><p><strong>"발행"</strong> 버튼을 누르면 포트폴리오가 공개됩니다.</p></Step>

            <MockupWindow title="assi.lat/p/kimphoto">
              <div className="p-3 bg-white relative">
                <CheckLabel top={4} left={4} />
                <div className="text-center mb-2 pl-6">
                  <div className="text-[10px] font-black text-gray-800">KIM STUDIO</div>
                  <div className="text-[7px] text-gray-400">Fashion & Beauty Photographer</div>
                  <div className="flex justify-center gap-1 mt-1 relative">
                    <Label n="3" top={-6} right={-10} />
                    <div className="px-2 py-0.5 rounded-full bg-gray-100 text-[6px] text-gray-500">ALL</div>
                    <div className="px-2 py-0.5 rounded-full bg-[#F4A259] text-[6px] text-white font-bold">FASHION</div>
                    <div className="px-2 py-0.5 rounded-full bg-gray-100 text-[6px] text-gray-500">BEAUTY</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-0.5">
                  {[1,2,3,4,5,6].map(i => (
                    <div key={i} className={`aspect-[3/2] rounded-sm ${i <= 3 ? 'bg-orange-100' : 'bg-blue-50'}`} />
                  ))}
                </div>
              </div>
            </MockupWindow>
            <div className="flex items-center gap-2 text-xs text-green-600 font-bold"><Check /> <Kbd>assi.lat/p/kimphoto</Kbd> 링크를 클라이언트, SNS, 명함에 공유하세요.</div>
            <Step number="3"><p>방문자는 <strong>카테고리 필터</strong>로 작업물을 탐색하고, 클릭하면 라이트박스로 크게 볼 수 있습니다.</p></Step>
          </Accordion>
        </div>

        {/* ═══ 6. Feed Planner ═══ */}
        <div className="bg-white rounded-[20px] shadow-sm border border-orange-100 mb-4 overflow-hidden">
          <div className="px-6 pt-5 pb-2">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#F4A259]">06</p>
            <h2 className="text-xl font-black text-gray-900 tracking-tight mt-1">Feed Planner (Instagram)</h2>
          </div>
          <Accordion title="Instagram 계정 연결" icon="📸">
            <MockupWindow title="Feed Planner">
              <div className="p-3 bg-white relative">
                <div className="text-center py-2">
                  <div className="text-[20px] mb-1">📸</div>
                  <div className="text-[9px] font-bold text-gray-700 mb-2">Instagram 계정을 연결하세요</div>
                  <div className="relative inline-block">
                    <Label n="1" top={-10} right={-10} />
                    <div className="px-4 py-1.5 bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 rounded-full text-[8px] text-white font-bold">Instagram 연결</div>
                  </div>
                </div>
                <div className="mt-2 bg-yellow-50 rounded-lg p-2 flex items-center gap-1 relative">
                  <R n="!" />
                  <div className="text-[7px] text-yellow-700">비즈니스 또는 크리에이터 계정만 지원됩니다.</div>
                </div>
              </div>
            </MockupWindow>
            <Step number="1"><p>Feed Planner 메뉴에서 <strong>"Instagram 연결"</strong>을 클릭합니다.</p></Step>
            <p className="text-xs text-gray-400">개인 계정은 API를 지원하지 않습니다. 비즈니스 또는 크리에이터 계정으로 전환해주세요.</p>
          </Accordion>

          <Accordion title="게시물 업로드" icon="📤">
            <MockupWindow title="게시물 업로드">
              <div className="p-3 bg-white relative">
                <div className="flex gap-2">
                  {/* Image selection */}
                  <div className="flex-1 relative">
                    <Label n="1" top={-8} left={-4} />
                    <div className="aspect-square bg-orange-50 rounded-lg flex items-center justify-center">
                      <div className="text-[8px] text-gray-400">이미지 선택</div>
                    </div>
                  </div>
                  {/* Options */}
                  <div className="w-[100px] space-y-1.5 relative">
                    <Label n="2" top={-8} right={-4} />
                    <div>
                      <div className="text-[7px] text-gray-400 font-bold mb-0.5">크롭</div>
                      <div className="flex gap-0.5">
                        <div className="flex-1 py-0.5 bg-[#F4A259] rounded text-[6px] text-white text-center font-bold">1:1</div>
                        <div className="flex-1 py-0.5 bg-gray-100 rounded text-[6px] text-gray-400 text-center">원본</div>
                      </div>
                    </div>
                    <div>
                      <div className="text-[7px] text-gray-400 font-bold mb-0.5">유형</div>
                      <div className="space-y-0.5">
                        {['단일 이미지', '카로셀', '스토리', '릴스'].map((t, i) => (
                          <div key={t} className={`py-0.5 px-1 rounded text-[6px] ${i === 0 ? 'bg-[#F4A259] text-white font-bold' : 'bg-gray-50 text-gray-400'}`}>{t}</div>
                        ))}
                      </div>
                    </div>
                    <div className="relative">
                      <Label n="3" top={-6} right={-6} />
                      <div className="py-1 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full text-[7px] text-white text-center font-bold">게시하기</div>
                    </div>
                  </div>
                </div>
              </div>
            </MockupWindow>
            <Step number="1"><p>프로젝트에서 <strong>이미지를 선택</strong>합니다.</p></Step>
            <Step number="2"><p><strong>크롭 옵션</strong>(1:1 / 원본)과 <strong>게시 유형</strong>(단일/카로셀/스토리/릴스)을 설정합니다.</p></Step>
            <Step number="3"><p><strong>"게시하기"</strong> 버튼으로 Instagram에 바로 업로드합니다.</p></Step>
          </Accordion>
        </div>

        {/* ═══ 7. PDF Builder ═══ */}
        <div className="bg-white rounded-[20px] shadow-sm border border-orange-100 mb-4 overflow-hidden">
          <div className="px-6 pt-5 pb-2">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#F4A259]">07</p>
            <h2 className="text-xl font-black text-gray-900 tracking-tight mt-1">PDF Builder</h2>
          </div>
          <Accordion title="PDF 포트폴리오 제작" icon="📑">
            <MockupWindow title="PDF Builder">
              <div className="flex bg-white">
                {/* Left: project/image selection */}
                <div className="w-[100px] border-r border-gray-200 p-2 space-y-1 relative">
                  <Label n="1" top={4} left={4} />
                  <div className="text-[7px] font-bold text-gray-400">프로젝트 선택</div>
                  {['브랜드A 룩북', '매거진 화보', '뷰티 캠페인'].map((p, i) => (
                    <div key={p} className={`text-[7px] px-1.5 py-0.5 rounded ${i === 0 ? 'bg-[#F4A259] text-white font-bold' : 'text-gray-500'}`}>{p}</div>
                  ))}
                  <div className="mt-1 relative">
                    <Label n="2" top={-6} right={-6} />
                    <div className="text-[7px] font-bold text-gray-400 mb-0.5">레이아웃</div>
                    <div className="flex gap-0.5">
                      <div className="flex-1 py-0.5 bg-[#F4A259] rounded text-[6px] text-white text-center font-bold">A4 세로</div>
                      <div className="flex-1 py-0.5 bg-gray-100 rounded text-[6px] text-gray-400 text-center">가로</div>
                    </div>
                  </div>
                </div>
                {/* Right: PDF preview */}
                <div className="flex-1 p-2 relative">
                  <Label n="3" top={2} right={4} />
                  <div className="bg-gray-50 rounded-lg p-2">
                    <div className="bg-white shadow-sm rounded aspect-[3/4] flex flex-col gap-1 p-1.5">
                      <div className="flex-1 bg-orange-50 rounded-sm" />
                      <div className="flex gap-0.5">
                        <div className="flex-1 bg-blue-50 rounded-sm aspect-[4/3]" />
                        <div className="flex-1 bg-orange-50 rounded-sm aspect-[4/3]" />
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-center mt-1.5 relative">
                    <Label n="4" top={-8} right={-4} />
                    <div className="px-4 py-1 bg-gray-900 rounded-full text-[8px] text-white font-bold">PDF 다운로드</div>
                  </div>
                </div>
              </div>
            </MockupWindow>
            <Step number="1"><p><strong>프로젝트와 이미지</strong>를 선택합니다.</p></Step>
            <Step number="2"><p>페이지 <strong>레이아웃</strong>을 설정합니다. (A4 세로/가로)</p></Step>
            <Step number="3"><p><strong>스마트 레이아웃</strong>이 페이지당 1~4장 이미지를 자동 배치합니다. 드래그로 순서 조정 가능.</p></Step>
            <Step number="4"><p><strong>"PDF 다운로드"</strong> 버튼으로 인쇄용 고화질 PDF를 생성합니다.</p></Step>
          </Accordion>
        </div>

        {/* ═══ 8. 설정 ═══ */}
        <div className="bg-white rounded-[20px] shadow-sm border border-orange-100 mb-4 overflow-hidden">
          <div className="px-6 pt-5 pb-2">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#F4A259]">08</p>
            <h2 className="text-xl font-black text-gray-900 tracking-tight mt-1">설정</h2>
          </div>
          <Accordion title="프로필 & 테마" icon="⚙️">
            <MockupWindow title="설정">
              <div className="p-3 bg-white space-y-2 relative">
                <div className="relative">
                  <Label n="1" top={-4} left={-4} />
                  <div className="bg-gray-50 rounded-lg p-2 space-y-1.5">
                    <div className="text-[7px] font-bold text-gray-400">프로필</div>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-orange-200 flex items-center justify-center text-[8px]">KP</div>
                      <div>
                        <div className="text-[9px] font-bold text-gray-700">김포토</div>
                        <div className="text-[7px] text-gray-400">포토그래퍼</div>
                      </div>
                      <div className="ml-auto px-2 py-0.5 bg-gray-200 rounded text-[7px] text-gray-500">편집</div>
                    </div>
                  </div>
                </div>
                <div className="relative">
                  <Label n="2" top={-4} right={-4} />
                  <div className="bg-gray-50 rounded-lg p-2">
                    <div className="text-[7px] font-bold text-gray-400 mb-1">테마</div>
                    <div className="flex gap-1">
                      <div className="flex-1 py-1 bg-white border-2 border-[#F4A259] rounded-lg text-[8px] text-center font-bold text-gray-700">Light</div>
                      <div className="flex-1 py-1 bg-gray-800 rounded-lg text-[8px] text-center font-bold text-gray-300">Dark</div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 relative">
                  <Label n="3" top={-8} left={-4} />
                  <div className="flex-1 py-1.5 bg-red-50 rounded-lg text-[8px] text-red-500 text-center font-bold">로그아웃</div>
                  <div className="flex-1 py-1.5 bg-[#F4A259]/10 rounded-lg text-[8px] text-[#F4A259] text-center font-bold relative">
                    <Label n="4" top={-8} right={-4} />
                    추천하기 (링크 복사)
                  </div>
                </div>
              </div>
            </MockupWindow>
            <Step number="1"><p><strong>프로필</strong>: 이름, 연락처, 로고를 수정합니다.</p></Step>
            <Step number="2"><p><strong>테마</strong>: 라이트/다크 모드를 선택합니다.</p></Step>
            <Step number="3"><p><strong>로그아웃</strong>: 계정에서 로그아웃합니다.</p></Step>
            <Step number="4"><p><strong>추천하기</strong>: 링크 복사 버튼으로 ASSI를 지인에게 공유합니다.</p></Step>
          </Accordion>
        </div>

        {/* Back to home */}
        <div className="text-center mt-10">
          <a href="/" className="inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-[#F4A259] transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            홈으로 돌아가기
          </a>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-10 px-6 border-t border-orange-100">
        <div className="max-w-3xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/logo/eyes.png" alt="ASSI" className="w-6 h-6 object-contain" />
            <span className="text-sm font-bold text-gray-900">ASSI</span>
          </div>
          <span className="text-xs text-gray-400">&copy; 2025 ASSI. All rights reserved.</span>
        </div>
      </footer>
    </div>
  )
}
