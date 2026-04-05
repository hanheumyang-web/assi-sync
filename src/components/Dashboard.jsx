import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useProjects } from '../hooks/useProjects'
import { PageTransition, StatSkeleton } from './UIKit'
import { IconFeed, IconPdf, IconPlus } from './Icons'

export default function Dashboard({ setPage, isMobile }) {
  const { user, userDoc } = useAuth()
  const { projects, stats, addProject } = useProjects()
  const [showAddModal, setShowAddModal] = useState(false)
  const [calMonth, setCalMonth] = useState(() => new Date()) // 캘린더 현재 표시 월

  const displayName = userDoc?.displayName || user?.displayName || '사용자'

  const today = new Date()
  const dateStr = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일 ${'일월화수목금토'[today.getDay()]}요일`

  const calYear = calMonth.getFullYear()
  const calMon = calMonth.getMonth()
  const firstDay = new Date(calYear, calMon, 1).getDay()
  const daysInMonth = new Date(calYear, calMon + 1, 0).getDate()
  const prevMonth = () => setCalMonth(new Date(calYear, calMon - 1, 1))
  const nextMonth = () => setCalMonth(new Date(calYear, calMon + 1, 1))
  const goToday = () => setCalMonth(new Date())

  // 해당 월의 엠바고/촬영일 맵
  const calendarEvents = {}
  projects.forEach(p => {
    if (p.embargoDate) {
      const d = new Date(p.embargoDate)
      if (d.getFullYear() === calYear && d.getMonth() === calMon) {
        const day = d.getDate()
        if (!calendarEvents[day]) calendarEvents[day] = []
        calendarEvents[day].push({ type: p.embargoStatus === 'active' ? 'embargo' : 'released', name: p.name })
      }
    }
    if (p.shootDate) {
      const d = new Date(p.shootDate)
      if (d.getFullYear() === calYear && d.getMonth() === calMon) {
        const day = d.getDate()
        if (!calendarEvents[day]) calendarEvents[day] = []
        calendarEvents[day].push({ type: 'shoot', name: p.name })
      }
    }
  })

  return (
    <PageTransition>
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] tracking-[0.2em] uppercase text-gray-400 font-semibold">DASHBOARD</p>
          <h1 className="text-3xl font-black tracking-tighter text-gray-900">안녕하세요, {displayName}님</h1>
        </div>
        <p className="text-sm text-gray-400">{dateStr}</p>
      </div>

      {/* 통계 카드 */}
      <div className={`grid ${isMobile ? 'grid-cols-2' : 'grid-cols-4'} gap-4`}>
        {[
          { en: 'PROJECTS', label: '프로젝트', value: String(stats.totalProjects), sub: '전체 프로젝트', color: 'from-[#828DF8] to-[#6366F1]' },
          { en: 'IMAGES', label: '이미지', value: String(stats.totalImages), sub: '전체 이미지', color: 'from-[#34D399] to-[#059669]' },
          { en: 'EMBARGO', label: '엠바고 대기', value: String(stats.activeEmbargoes), sub: '업로드 대기 중', color: 'from-[#F59E0B] to-[#D97706]' },
          { en: 'PDF', label: 'PDF 생성', value: '0', sub: '이번 달', color: 'from-[#F472B6] to-[#EC4899]' },
        ].map((card) => (
          <div key={card.en} className="bg-white rounded-[24px] p-5 shadow-sm hover:shadow-lg transition-all">
            <p className="text-[10px] tracking-[0.2em] uppercase text-gray-400 font-semibold">{card.en}</p>
            <p className="text-3xl font-black tracking-tighter text-gray-900 mt-1">{card.value}</p>
            <p className="text-xs text-gray-400 mt-1">{card.sub}</p>
            <div className={`h-1 w-12 rounded-full bg-gradient-to-r ${card.color} mt-3`} />
          </div>
        ))}
      </div>

      <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-3'} gap-6`}>
        {/* 엠바고 캘린더 */}
        <div className={`${isMobile ? '' : 'col-span-2'} bg-white rounded-[24px] p-6 shadow-sm`}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] tracking-[0.2em] uppercase text-gray-400 font-semibold">EMBARGO CALENDAR</p>
              <h2 className="text-lg font-black tracking-tighter text-gray-900">엠바고 일정</h2>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={prevMonth} className="w-8 h-8 rounded-full bg-[#F4F3EE] flex items-center justify-center text-gray-400 hover:bg-gray-200 text-xs">◀</button>
              <button onClick={goToday} className="px-3 py-1.5 rounded-full bg-[#F4F3EE] text-[10px] font-bold text-gray-500 hover:bg-gray-200">
                {calYear}년 {calMon + 1}월
              </button>
              <button onClick={nextMonth} className="w-8 h-8 rounded-full bg-[#F4F3EE] flex items-center justify-center text-gray-400 hover:bg-gray-200 text-xs">▶</button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {['일','월','화','수','목','금','토'].map(d => (
              <p key={d} className="text-[10px] tracking-[0.1em] uppercase text-gray-400 font-semibold py-2">{d}</p>
            ))}
            {Array.from({ length: firstDay }, (_, i) => (
              <div key={`empty-${i}`} className="h-12" />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1
              const isToday = calYear === today.getFullYear() && calMon === today.getMonth() && day === today.getDate()
              const events = calendarEvents[day] || []
              const hasEmbargo = events.some(e => e.type === 'embargo')
              const hasReleased = events.some(e => e.type === 'released')
              const hasShoot = events.some(e => e.type === 'shoot')
              const tooltip = events.map(e => `${e.type === 'embargo' ? '🔒' : e.type === 'released' ? '✅' : '📸'} ${e.name}`).join('\n')

              return (
                <div
                  key={day}
                  className={`h-12 rounded-[10px] flex flex-col items-center justify-center text-xs font-bold relative transition-all cursor-default
                    ${isToday ? 'bg-[#828DF8] text-white shadow-md' : ''}
                    ${hasEmbargo && !isToday ? 'bg-amber-50 text-amber-600 ring-1 ring-amber-200' : ''}
                    ${hasReleased && !hasEmbargo && !isToday ? 'bg-emerald-50 text-emerald-600' : ''}
                    ${!isToday && !hasEmbargo && !hasReleased ? 'text-gray-600 hover:bg-[#F4F3EE]' : ''}
                  `}
                  title={tooltip}
                >
                  {day}
                  {events.length > 0 && (
                    <div className="flex gap-0.5 mt-0.5">
                      {hasEmbargo && <span className="w-1.5 h-1.5 bg-amber-400 rounded-full" />}
                      {hasReleased && <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />}
                      {hasShoot && <span className="w-1.5 h-1.5 bg-[#828DF8] rounded-full" />}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* 범례 */}
          <div className="flex gap-4 mt-3 mb-4">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-amber-400 rounded-full" />
              <span className="text-[10px] text-gray-400 font-semibold">엠바고 대기</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-emerald-400 rounded-full" />
              <span className="text-[10px] text-gray-400 font-semibold">해금 완료</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-[#828DF8] rounded-full" />
              <span className="text-[10px] text-gray-400 font-semibold">촬영일</span>
            </div>
          </div>

          {/* 엠바고 목록 */}
          <div className="space-y-2">
            {projects.filter(p => p.embargoStatus === 'active').length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">엠바고 대기 중인 프로젝트가 없습니다</p>
            ) : (
              projects.filter(p => p.embargoStatus === 'active')
                .sort((a, b) => (a.embargoDate || '').localeCompare(b.embargoDate || ''))
                .map((p) => {
                  const embargoAt = p.embargoDate?.includes('T') ? new Date(p.embargoDate) : new Date(p.embargoDate + 'T00:00')
                  const daysLeft = p.embargoDate ? Math.ceil((embargoAt - today) / 86400000) : null
                  const timeStr = p.embargoDate?.includes('T') ? p.embargoDate.slice(11, 16) : null
                  return (
                    <div key={p.id} className="flex items-center gap-3 bg-[#F4F3EE] rounded-[12px] px-4 py-3">
                      <div className="flex-shrink-0">
                        <span className="text-xs font-black text-gray-900">{p.embargoDate?.slice(5, 10).replace('-', '.')}</span>
                        {timeStr && <span className="text-[9px] text-gray-400 ml-1">{timeStr}</span>}
                      </div>
                      <span className="text-xs text-gray-600 flex-1">{p.name}</span>
                      {daysLeft !== null && (
                        <span className={`text-[10px] px-3 py-1 rounded-full font-bold
                          ${daysLeft <= 3 ? 'bg-red-100 text-red-600' : daysLeft <= 7 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                          {daysLeft <= 0 ? '오늘 해금' : `D-${daysLeft}`}
                        </span>
                      )}
                    </div>
                  )
                })
            )}
          </div>
        </div>

        {/* 최근 프로젝트 */}
        <div className="bg-white rounded-[24px] p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] tracking-[0.2em] uppercase text-gray-400 font-semibold">RECENT PROJECTS</p>
              <h2 className="text-lg font-black tracking-tighter text-gray-900">최근 프로젝트</h2>
            </div>
            <button onClick={() => setPage('projects')} className="text-[11px] text-[#828DF8] font-bold hover:underline">전체보기</button>
          </div>

          <div className="space-y-3">
            {projects.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-400 text-sm mb-3">아직 프로젝트가 없습니다</p>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="text-sm text-[#828DF8] font-bold hover:underline"
                >
                  + 첫 프로젝트 만들기
                </button>
              </div>
            ) : (
              projects.slice(0, 5).map((p) => (
                <div key={p.id} onClick={() => setPage('projects')} className="flex items-center gap-3 p-3 rounded-[14px] hover:bg-[#F4F3EE] transition-all cursor-pointer">
                  <div className="w-11 h-11 rounded-[10px] bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-xl flex-shrink-0 overflow-hidden">
                    {p.thumbnailUrl ? <img src={p.thumbnailUrl} alt="" className="w-full h-full object-cover" /> : '📸'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 tracking-tight truncate">{p.name}</p>
                    <p className="text-[10px] text-gray-400">{p.client || '클라이언트 미지정'} · {p.imageCount}장</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 빠른 액션 */}
      <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-3'} gap-4`}>
        {[
          { label: '인스타그램 피드 열기', en: 'INSTAGRAM FEED', Icon: IconFeed, action: () => setPage('feed') },
          { label: '포트폴리오 빌더', en: 'PORTFOLIO BUILDER', Icon: IconPdf, action: () => setPage('pdf') },
          { label: '새 프로젝트 추가', en: 'NEW PROJECT', Icon: IconPlus, action: () => setShowAddModal(true) },
        ].map((btn) => (
          <button
            key={btn.en}
            onClick={btn.action}
            className="bg-white rounded-[24px] p-6 shadow-sm hover:shadow-lg transition-all text-left group"
          >
            <div className="w-12 h-12 rounded-[14px] bg-[#828DF8]/10 flex items-center justify-center text-[#828DF8] group-hover:bg-[#828DF8] group-hover:text-white transition-all mb-3">
              <btn.Icon className="w-6 h-6" />
            </div>
            <p className="text-[10px] tracking-[0.2em] uppercase text-gray-400 font-semibold">{btn.en}</p>
            <p className="text-sm font-bold text-gray-900 tracking-tight">{btn.label}</p>
          </button>
        ))}
      </div>

      {/* 프로젝트 추가 모달 */}
      {showAddModal && (
        <AddProjectModal
          onClose={() => setShowAddModal(false)}
          onAdd={addProject}
        />
      )}
    </div>
    </PageTransition>
  )
}

function AddProjectModal({ onClose, onAdd }) {
  const [name, setName] = useState('')
  const [client, setClient] = useState('')
  const [category, setCategory] = useState('FASHION')
  const [embargoDate, setEmbargoDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [customCat, setCustomCat] = useState('')

  const categories = ['FASHION', 'BEAUTY', 'CELEBRITY', 'AD', 'PORTRAIT', 'PERSONAL WORK']

  const handleSubmit = async () => {
    if (!name.trim()) return
    setSaving(true)
    await onAdd({
      name: name.trim(),
      client: client.trim(),
      category,
      embargoDate: embargoDate || null,
    })
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-[32px] p-8 max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-[11px] tracking-[0.2em] uppercase text-[#828DF8] font-bold mb-1">NEW PROJECT</p>
        <h2 className="text-2xl font-black tracking-tighter text-gray-900 mb-6">새 프로젝트</h2>

        <div className="space-y-4">
          <div>
            <label className="text-[11px] tracking-[0.15em] uppercase text-gray-400 font-semibold">PROJECT NAME</label>
            <input
              className="w-full mt-1 px-4 py-3 bg-[#F4F3EE] rounded-[12px] text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#828DF8]/30"
              placeholder="예: VOGUE KOREA 화보"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-[11px] tracking-[0.15em] uppercase text-gray-400 font-semibold">CLIENT</label>
            <input
              className="w-full mt-1 px-4 py-3 bg-[#F4F3EE] rounded-[12px] text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#828DF8]/30"
              placeholder="클라이언트명"
              value={client}
              onChange={(e) => setClient(e.target.value)}
            />
          </div>
          <div>
            <label className="text-[11px] tracking-[0.15em] uppercase text-gray-400 font-semibold">CATEGORY</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`px-4 py-2 rounded-full text-xs font-bold transition-all
                    ${category === c ? 'bg-[#828DF8] text-white shadow-md' : 'bg-[#F4F3EE] text-gray-500 hover:bg-gray-200'}`}
                >
                  {c}
                </button>
              ))}
              {category && !categories.includes(category) && (
                <button className="px-4 py-2 rounded-full text-xs font-bold bg-[#828DF8] text-white shadow-md">
                  {category}
                </button>
              )}
            </div>
            <div className="flex gap-2 mt-2">
              <input
                className="flex-1 px-3 py-2 bg-[#F4F3EE] rounded-[12px] text-xs text-gray-900 outline-none focus:ring-2 focus:ring-[#828DF8]/30"
                placeholder="직접 입력"
                value={customCat}
                onChange={(e) => setCustomCat(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === 'Enter' && customCat.trim()) { setCategory(customCat.trim()); setCustomCat('') } }}
              />
              <button
                onClick={() => { if (customCat.trim()) { setCategory(customCat.trim()); setCustomCat('') } }}
                className="px-3 py-2 bg-[#828DF8] text-white rounded-[12px] text-xs font-bold hover:bg-[#6b77e6] transition-colors"
              >+</button>
            </div>
          </div>
          <div>
            <label className="text-[11px] tracking-[0.15em] uppercase text-gray-400 font-semibold">EMBARGO DATE (선택)</label>
            <input
              type="date"
              className="w-full mt-1 px-4 py-3 bg-[#F4F3EE] rounded-[12px] text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#828DF8]/30"
              value={embargoDate}
              onChange={(e) => setEmbargoDate(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-3 mt-8">
          <button onClick={onClose} className="flex-1 py-4 bg-[#F4F3EE] text-gray-500 rounded-[16px] font-bold text-sm hover:bg-gray-200 transition-all">
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || saving}
            className="flex-1 py-4 bg-[#828DF8] text-white rounded-[16px] font-bold text-sm hover:bg-[#6366F1] transition-all shadow-lg shadow-[#828DF8]/25 disabled:opacity-50"
          >
            {saving ? '생성 중...' : '프로젝트 생성'}
          </button>
        </div>
      </div>
    </div>
  )
}
