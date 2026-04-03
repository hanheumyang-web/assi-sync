import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

export default function Onboarding({ step, setStep, onFinish }) {
  const { createUserDoc } = useAuth()
  const [name, setName] = useState('')
  const [profession, setProfession] = useState('포토그래퍼')
  const [saving, setSaving] = useState(false)

  const professions = ['포토그래퍼', '영상감독', '헤어 디자이너', '메이크업 아티스트', '스타일리스트', '기타']

  const handleFinish = async () => {
    setSaving(true)
    try {
      await createUserDoc({ name: name || '사용자', profession })
      onFinish()
    } catch (err) {
      console.error('프로필 저장 실패:', err)
    }
    setSaving(false)
  }

  const steps = [
    // Step 0: 웰컴 — 이미 로그인된 상태이므로 바로 Step 1로
    () => (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#F4F3EE] px-6">
        <div className="bg-white rounded-[32px] shadow-2xl p-12 max-w-lg w-full text-center">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#828DF8] to-[#6366F1] mx-auto mb-6 flex items-center justify-center">
            <span className="text-white text-3xl font-black">A</span>
          </div>
          <p className="text-[11px] tracking-[0.25em] uppercase text-[#828DF8] font-bold mb-2">WELCOME TO</p>
          <h1 className="text-5xl font-black tracking-tighter text-gray-900 mb-2">ASSI</h1>
          <p className="text-gray-400 text-sm mb-8">크리에이티브 스태프를 위한 포트폴리오 관리</p>

          <button
            onClick={() => setStep(1)}
            className="w-full py-4 bg-[#828DF8] text-white rounded-[16px] font-bold text-sm hover:bg-[#6366F1] transition-all shadow-lg shadow-[#828DF8]/25"
          >
            프로필 설정하기
          </button>
        </div>
      </div>
    ),

    // Step 1: 프로필 설정
    () => (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#F4F3EE] px-6">
        <div className="bg-white rounded-[32px] shadow-2xl p-10 max-w-lg w-full">
          <StepIndicator current={0} />
          <p className="text-[11px] tracking-[0.2em] uppercase text-[#828DF8] font-bold mb-1">STEP 01</p>
          <h2 className="text-2xl font-black tracking-tighter text-gray-900 mb-6">프로필 설정</h2>

          <div className="space-y-4">
            <div>
              <label className="text-[11px] tracking-[0.15em] uppercase text-gray-400 font-semibold">NAME</label>
              <input
                className="w-full mt-1 px-4 py-3 bg-[#F4F3EE] rounded-[12px] text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#828DF8]/30"
                placeholder="이름 또는 활동명"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[11px] tracking-[0.15em] uppercase text-gray-400 font-semibold">PROFESSION</label>
              <div className="flex flex-wrap gap-2 mt-2">
                {professions.map((t) => (
                  <button
                    key={t}
                    onClick={() => setProfession(t)}
                    className={`px-4 py-2 rounded-full text-xs font-bold transition-all
                      ${profession === t ? 'bg-[#828DF8] text-white shadow-md' : 'bg-[#F4F3EE] text-gray-500 hover:bg-gray-200'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[11px] tracking-[0.15em] uppercase text-gray-400 font-semibold">LOGO</label>
              <div className="mt-1 w-full h-24 bg-[#F4F3EE] rounded-[16px] border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-xs cursor-pointer hover:border-[#828DF8] transition-colors">
                클릭하여 로고 업로드
              </div>
            </div>
          </div>

          <button onClick={() => setStep(2)} className="w-full mt-8 py-4 bg-[#828DF8] text-white rounded-[16px] font-bold text-sm hover:bg-[#6366F1] transition-all shadow-lg shadow-[#828DF8]/25">
            다음
          </button>
        </div>
      </div>
    ),

    // Step 2: 인스타그램 연동
    () => (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#F4F3EE] px-6">
        <div className="bg-white rounded-[32px] shadow-2xl p-10 max-w-lg w-full">
          <StepIndicator current={1} />
          <p className="text-[11px] tracking-[0.2em] uppercase text-[#828DF8] font-bold mb-1">STEP 02</p>
          <h2 className="text-2xl font-black tracking-tighter text-gray-900 mb-2">인스타그램 연동</h2>
          <p className="text-sm text-gray-400 mb-6">기존 피드를 분석하여 포트폴리오를 자동 구성합니다</p>

          <div className="bg-gradient-to-br from-[#833AB4] via-[#FD1D1D] to-[#FCAF45] rounded-[20px] p-[1px]">
            <button className="w-full bg-white rounded-[19px] py-5 flex items-center justify-center gap-3 hover:bg-gray-50 transition-all">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                <rect x="2" y="2" width="20" height="20" rx="5" stroke="#833AB4" strokeWidth="2"/>
                <circle cx="12" cy="12" r="5" stroke="#833AB4" strokeWidth="2"/>
                <circle cx="18" cy="6" r="1.5" fill="#833AB4"/>
              </svg>
              <span className="font-bold text-sm text-gray-900">Instagram 계정 연결하기</span>
            </button>
          </div>

          <div className="mt-6 bg-[#F4F3EE] rounded-[16px] p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gray-300 animate-pulse" />
              <div className="flex-1">
                <div className="h-3 bg-gray-300 rounded w-24 animate-pulse mb-2" />
                <div className="h-2 bg-gray-200 rounded w-16 animate-pulse" />
              </div>
              <span className="text-[10px] bg-[#828DF8]/10 text-[#828DF8] px-3 py-1 rounded-full font-bold">연결 대기</span>
            </div>
          </div>

          <div className="flex gap-3 mt-8">
            <button onClick={() => setStep(1)} className="flex-1 py-4 bg-[#F4F3EE] text-gray-500 rounded-[16px] font-bold text-sm hover:bg-gray-200 transition-all">이전</button>
            <button onClick={() => setStep(3)} className="flex-1 py-4 bg-[#828DF8] text-white rounded-[16px] font-bold text-sm hover:bg-[#6366F1] transition-all shadow-lg shadow-[#828DF8]/25">다음</button>
          </div>
          <p className="text-center text-[11px] text-gray-400 mt-3 cursor-pointer hover:text-[#828DF8]">나중에 연결하기</p>
        </div>
      </div>
    ),

    // Step 3: 폴더 업로드
    () => (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#F4F3EE] px-6">
        <div className="bg-white rounded-[32px] shadow-2xl p-10 max-w-lg w-full">
          <StepIndicator current={2} />
          <p className="text-[11px] tracking-[0.2em] uppercase text-[#828DF8] font-bold mb-1">STEP 03</p>
          <h2 className="text-2xl font-black tracking-tighter text-gray-900 mb-2">포트폴리오 폴더 업로드</h2>
          <p className="text-sm text-gray-400 mb-6">기존 작업물이 담긴 폴더를 업로드하면 AI가 자동으로 정리합니다</p>

          <div className="border-2 border-dashed border-[#828DF8]/40 bg-[#828DF8]/5 rounded-[20px] p-8 text-center hover:border-[#828DF8] transition-all cursor-pointer">
            <div className="w-16 h-16 bg-[#828DF8]/10 rounded-[16px] mx-auto mb-4 flex items-center justify-center">
              <span className="text-3xl">📁</span>
            </div>
            <p className="text-sm font-bold text-gray-900 mb-1">폴더를 드래그하거나 클릭하여 선택</p>
            <p className="text-xs text-gray-400">Mac / Windows 모두 지원 | JPG, PNG, MP4, MOV</p>
          </div>

          <div className="mt-4 bg-[#F4F3EE] rounded-[16px] p-4 space-y-2">
            <p className="text-[11px] tracking-[0.15em] uppercase text-gray-400 font-semibold mb-2">DETECTED FILES</p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">📸 이미지</span>
              <span className="text-xs font-bold text-gray-900">342개</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">🎬 영상</span>
              <span className="text-xs font-bold text-gray-900">28개</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">💾 총 용량</span>
              <span className="text-xs font-bold text-gray-900">12.4 GB</span>
            </div>
          </div>

          <div className="flex gap-3 mt-8">
            <button onClick={() => setStep(2)} className="flex-1 py-4 bg-[#F4F3EE] text-gray-500 rounded-[16px] font-bold text-sm hover:bg-gray-200 transition-all">이전</button>
            <button onClick={() => setStep(4)} className="flex-1 py-4 bg-[#828DF8] text-white rounded-[16px] font-bold text-sm hover:bg-[#6366F1] transition-all shadow-lg shadow-[#828DF8]/25">AI 자동 정리 시작</button>
          </div>
        </div>
      </div>
    ),

    // Step 4: AI 자동 분류 결과
    () => (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#F4F3EE] px-6">
        <div className="bg-white rounded-[32px] shadow-2xl p-10 max-w-xl w-full">
          <StepIndicator current={3} />
          <p className="text-[11px] tracking-[0.2em] uppercase text-[#828DF8] font-bold mb-1">STEP 04</p>
          <h2 className="text-2xl font-black tracking-tighter text-gray-900 mb-2">AI 자동 분류 결과</h2>
          <p className="text-sm text-gray-400 mb-6">AI가 프로젝트별로 자동 분류했습니다. 확인 후 수정해주세요.</p>

          <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
            {[
              { name: 'VOGUE KOREA 화보', client: 'VOGUE', count: 24, type: '화보', date: '2026.02', embargo: '업로드 가능', color: 'bg-green-100 text-green-700' },
              { name: 'Samsung Galaxy 광고', client: 'Samsung', count: 18, type: '광고', date: '2026.03', embargo: '04.15 업로드', color: 'bg-amber-100 text-amber-700' },
              { name: 'W Korea 커버', client: 'W Korea', count: 32, type: '화보', date: '2026.01', embargo: '업로드 가능', color: 'bg-green-100 text-green-700' },
              { name: 'Lee Studio 웨딩', client: 'Lee Studio', count: 45, type: '웨딩', date: '2025.12', embargo: '없음', color: 'bg-gray-100 text-gray-500' },
              { name: 'Nike Campaign SS26', client: 'Nike', count: 15, type: '광고', date: '2026.03', embargo: '05.01 업로드', color: 'bg-red-100 text-red-600' },
              { name: 'Artist Profile - IU', client: 'EDAM Ent.', count: 20, type: '프로필', date: '2026.02', embargo: '업로드 가능', color: 'bg-green-100 text-green-700' },
            ].map((p, i) => (
              <div key={i} className="bg-[#F4F3EE] rounded-[16px] p-4 flex items-center gap-4 hover:shadow-md transition-all">
                <div className="w-14 h-14 rounded-[12px] bg-gradient-to-br from-gray-200 to-gray-300 flex-shrink-0 flex items-center justify-center text-2xl">
                  {p.type === '영상' ? '🎬' : '📸'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 tracking-tight truncate">{p.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-gray-400">{p.client}</span>
                    <span className="text-[10px] text-gray-300">|</span>
                    <span className="text-[10px] text-gray-400">{p.date}</span>
                    <span className="text-[10px] text-gray-300">|</span>
                    <span className="text-[10px] text-gray-400">{p.count}장</span>
                  </div>
                </div>
                <span className={`text-[10px] px-3 py-1 rounded-full font-bold flex-shrink-0 ${p.color}`}>
                  {p.embargo}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between mt-6 text-xs text-gray-400">
            <span>6개 프로젝트 자동 감지</span>
            <span className="text-[#828DF8] cursor-pointer font-semibold">+ 수동으로 프로젝트 추가</span>
          </div>

          <div className="flex gap-3 mt-6">
            <button onClick={() => setStep(3)} className="flex-1 py-4 bg-[#F4F3EE] text-gray-500 rounded-[16px] font-bold text-sm hover:bg-gray-200 transition-all">이전</button>
            <button
              onClick={handleFinish}
              disabled={saving}
              className="flex-1 py-4 bg-[#828DF8] text-white rounded-[16px] font-bold text-sm hover:bg-[#6366F1] transition-all shadow-lg shadow-[#828DF8]/25 disabled:opacity-50"
            >
              {saving ? '저장 중...' : '확인하고 시작하기'}
            </button>
          </div>
        </div>
      </div>
    ),
  ]

  return steps[step]()
}

function StepIndicator({ current }) {
  const labels = ['프로필', '인스타 연동', '폴더 업로드', '분류 확인']
  return (
    <div className="flex items-center gap-1 mb-8">
      {labels.map((label, i) => (
        <div key={i} className="flex items-center gap-1 flex-1">
          <div className={`h-1.5 rounded-full flex-1 transition-all ${i <= current ? 'bg-[#828DF8]' : 'bg-gray-200'}`} />
        </div>
      ))}
    </div>
  )
}
