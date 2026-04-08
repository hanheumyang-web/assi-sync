import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useProjects } from '../hooks/useProjects'
import { PageTransition } from './UIKit'
import { IconFeed, IconPdf, IconPlus } from './Icons'

export default function Dashboard({ setPage, isMobile }) {
  const { user, userDoc } = useAuth()
  const { projects, stats, addProject } = useProjects()
  const [showAddModal, setShowAddModal] = useState(false)
  const [calMonth, setCalMonth] = useState(() => new Date())
  const [embargoOpen, setEmbargoOpen] = useState(false)

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
    <div className={`space-y-6 ${isMobile ? 'pb-24' : 'pb-8'}`}>
      {/* 헤더 */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] tracking-[0.2em] uppercase text-[#6a6a6a] dark:text-[#b3b3b3] font-bold">DASHBOARD</p>
          <h1 className="text-4xl font-black tracking-tight text-[#181818] dark:text-white mt-1.5">안녕하세요, {displayName}님</h1>
        </div>
        <p className="text-base text-[#6a6a6a] dark:text-[#b3b3b3] font-medium">{dateStr}</p>
      </div>

      {/* 통계 카드 */}
      <div className={`grid ${isMobile ? 'grid-cols-2' : 'grid-cols-4'} gap-4`}>
        {[
          { en: 'PROJECTS', value: String(stats.totalProjects), sub: '전체 프로젝트' },
          { en: 'IMAGES', value: String(stats.totalImages), sub: '전체 이미지' },
          { en: 'EMBARGO', value: String(stats.activeEmbargoes), sub: '업로드 대기 중' },
          { en: 'PDF', value: '0', sub: '이번 달' },
        ].map((card) => (
          <div key={card.en} className="bg-[#f5f5f5] dark:bg-[#181818] rounded-[8px] p-6 transition-all hover:bg-[#ececec] dark:hover:bg-[#1f1f1f]"
            style={{ boxShadow: 'rgba(0,0,0,0.3) 0px 8px 8px' }}>
            <p className="text-[11px] tracking-[0.2em] uppercase text-[#6a6a6a] dark:text-[#b3b3b3] font-bold">{card.en}</p>
            <p className="text-5xl font-black tracking-tight text-[#181818] dark:text-white mt-2">{card.value}</p>
            <p className="text-base text-[#6a6a6a] dark:text-[#b3b3b3] font-medium mt-1">{card.sub}</p>
            <div className="h-1 w-12 rounded-full bg-[#F4A259] mt-3" />
          </div>
        ))}
      </div>

      <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-3'} gap-6`}>
        {/* 엠바고 캘린더 */}
        <div className={`${isMobile ? '' : 'col-span-2'} bg-[#f5f5f5] dark:bg-[#181818] rounded-[8px] p-6`}
          style={{ boxShadow: 'rgba(0,0,0,0.3) 0px 8px 8px' }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[11px] tracking-[0.2em] uppercase text-[#6a6a6a] dark:text-[#b3b3b3] font-bold">EMBARGO CALENDAR</p>
              <h2 className="text-2xl font-black tracking-tight text-[#181818] dark:text-white mt-1">엠바고 일정</h2>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={prevMonth} className="w-9 h-9 rounded-full bg-[#ececec] dark:bg-[#1f1f1f] flex items-center justify-center text-[#6a6a6a] dark:text-[#b3b3b3] hover:bg-[#dcdcdc] dark:hover:bg-[#2a2a2a] hover:text-white text-sm transition-all">◀</button>
              <button onClick={goToday} className="px-4 py-2 rounded-full bg-[#ececec] dark:bg-[#1f1f1f] text-xs font-bold text-[#181818] dark:text-white hover:bg-[#dcdcdc] dark:hover:bg-[#2a2a2a] uppercase tracking-[0.1em] transition-all">
                {calYear}년 {calMon + 1}월
              </button>
              <button onClick={nextMonth} className="w-9 h-9 rounded-full bg-[#ececec] dark:bg-[#1f1f1f] flex items-center justify-center text-[#6a6a6a] dark:text-[#b3b3b3] hover:bg-[#dcdcdc] dark:hover:bg-[#2a2a2a] hover:text-white text-sm transition-all">▶</button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {['일','월','화','수','목','금','토'].map(d => (
              <p key={d} className="text-[11px] tracking-[0.15em] uppercase text-[#6a6a6a] dark:text-[#b3b3b3] font-bold py-2">{d}</p>
            ))}
            {Array.from({ length: firstDay }, (_, i) => (
              <div key={`empty-${i}`} className="min-h-[3rem]" />
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
                  className={`min-h-[3.25rem] rounded-[6px] flex flex-col items-center justify-center text-sm font-bold relative transition-all cursor-default
                    ${isToday ? 'bg-[#F4A259] text-white' : ''}
                    ${hasEmbargo && !isToday ? 'text-[#F4A259]' : ''}
                    ${hasReleased && !hasEmbargo && !isToday ? 'text-[#4a4a4a] dark:text-[#cbcbcb]' : ''}
                    ${!isToday && !hasEmbargo && !hasReleased ? 'text-[#6a6a6a] dark:text-[#b3b3b3] hover:bg-[#ececec] dark:hover:bg-[#1f1f1f] hover:text-white' : ''}
                  `}
                  title={tooltip}
                >
                  {day}
                  {events.length > 0 && (
                    <div className="flex gap-0.5 mt-0.5">
                      {hasEmbargo && <span className="w-1.5 h-1.5 bg-[#F4A259] rounded-full" />}
                      {hasReleased && <span className="w-1.5 h-1.5 bg-[#cbcbcb] rounded-full" />}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* 범례 */}
          <div className="flex gap-5 mt-4 mb-5">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-[#F4A259] rounded-full" />
              <span className="text-sm text-[#6a6a6a] dark:text-[#b3b3b3] font-bold uppercase tracking-[0.05em]">엠바고 대기</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-[#cbcbcb] rounded-full" />
              <span className="text-sm text-[#6a6a6a] dark:text-[#b3b3b3] font-bold uppercase tracking-[0.05em]">업로드 가능</span>
            </div>
          </div>

          {/* 엠바고 목록 — 가장 가까운 하나 + 드롭다운 */}
          {(() => {
            const sorted = projects.filter(p => p.embargoStatus === 'active')
              .sort((a, b) => (a.embargoDate || '').localeCompare(b.embargoDate || ''))
            if (sorted.length === 0) {
              return <p className="text-sm text-[#6a6a6a] dark:text-[#b3b3b3] text-center py-4">엠바고 대기 중인 프로젝트가 없습니다</p>
            }
            const renderItem = (p) => {
              const embargoAt = p.embargoDate?.includes('T') ? new Date(p.embargoDate) : new Date(p.embargoDate + 'T00:00')
              const daysLeft = p.embargoDate ? Math.ceil((embargoAt - today) / 86400000) : null
              const timeStr = p.embargoDate?.includes('T') ? p.embargoDate.slice(11, 16) : null
              return (
                <div key={p.id} className="flex items-center gap-4 bg-[#ececec] dark:bg-[#1f1f1f] rounded-[6px] px-5 py-4 hover:bg-[#e4e4e4] dark:hover:bg-[#252525] transition-all">
                  <div className="flex-shrink-0">
                    <span className="text-lg font-black text-[#181818] dark:text-white">{p.embargoDate?.slice(5, 10).replace('-', '.')}</span>
                    {timeStr && <span className="text-sm text-[#6a6a6a] dark:text-[#b3b3b3] ml-1.5">{timeStr}</span>}
                  </div>
                  <span className="text-base text-[#4a4a4a] dark:text-[#cbcbcb] font-medium flex-1 truncate">{p.name}</span>
                  {daysLeft !== null && (
                    <span className={`text-[11px] px-3 py-1.5 rounded-full font-bold uppercase tracking-[0.1em]
                      ${daysLeft <= 3 ? 'bg-[#F4A259] text-black' : daysLeft <= 7 ? 'bg-[#e4e4e4] dark:bg-[#252525] text-[#F4A259]' : 'bg-[#e4e4e4] dark:bg-[#252525] text-[#6a6a6a] dark:text-[#b3b3b3]'}`}>
                      {daysLeft <= 0 ? '오늘 업로드' : `D-${daysLeft}`}
                    </span>
                  )}
                </div>
              )
            }
            return (
              <div className="space-y-2">
                {renderItem(sorted[0])}
                {sorted.length > 1 && (
                  <>
                    <button onClick={() => setEmbargoOpen(v => !v)}
                      className="w-full flex items-center justify-center gap-2 py-2 text-[11px] tracking-[0.15em] uppercase font-bold text-[#6a6a6a] dark:text-[#b3b3b3] hover:text-white transition-all">
                      {embargoOpen ? '접기' : `외 ${sorted.length - 1}건 더 보기`}
                      <span className={`transition-transform ${embargoOpen ? 'rotate-180' : ''}`}>▾</span>
                    </button>
                    {embargoOpen && <div className="space-y-2">{sorted.slice(1).map(renderItem)}</div>}
                  </>
                )}
              </div>
            )
          })()}
        </div>

        {/* 최근 프로젝트 */}
        <div className="bg-[#f5f5f5] dark:bg-[#181818] rounded-[8px] p-6"
          style={{ boxShadow: 'rgba(0,0,0,0.3) 0px 8px 8px' }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[11px] tracking-[0.2em] uppercase text-[#6a6a6a] dark:text-[#b3b3b3] font-bold">RECENT PROJECTS</p>
              <h2 className="text-2xl font-black tracking-tight text-[#181818] dark:text-white mt-1">최근 프로젝트</h2>
            </div>
            <button onClick={() => setPage('projects')} className="text-xs text-[#F4A259] font-bold uppercase tracking-[0.1em] hover:text-white transition-all">전체보기</button>
          </div>

          <div className="space-y-2">
            {projects.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-[#6a6a6a] dark:text-[#b3b3b3] text-sm mb-3">아직 프로젝트가 없습니다</p>
                <button onClick={() => setShowAddModal(true)} className="text-[11px] text-[#F4A259] font-bold uppercase tracking-[0.1em] hover:text-white transition-all">
                  + 첫 프로젝트 만들기
                </button>
              </div>
            ) : (
              projects.slice(0, 5).map((p) => (
                <div key={p.id} onClick={() => setPage('projects')} className="flex items-center gap-3 p-2 rounded-[6px] hover:bg-[#ececec] dark:hover:bg-[#1f1f1f] transition-all cursor-pointer">
                  <div className="w-12 h-12 rounded-[4px] bg-[#ececec] dark:bg-[#1f1f1f] flex items-center justify-center text-xl flex-shrink-0 overflow-hidden">
                    {p.thumbnailUrl ? <img src={p.thumbnailUrl} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" /> : '📸'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-bold text-[#181818] dark:text-white tracking-tight truncate">{p.name}</p>
                    <p className="text-sm text-[#6a6a6a] dark:text-[#b3b3b3] font-medium mt-0.5">{p.client || '클라이언트 미지정'} · {p.imageCount}장</p>
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
          <button key={btn.en} onClick={btn.action}
            className="bg-[#f5f5f5] dark:bg-[#181818] rounded-[8px] p-6 transition-all hover:bg-[#ececec] dark:hover:bg-[#1f1f1f] text-left group"
            style={{ boxShadow: 'rgba(0,0,0,0.3) 0px 8px 8px' }}>
            <div className="w-14 h-14 rounded-[10px] bg-[#ececec] dark:bg-[#1f1f1f] flex items-center justify-center text-[#F4A259] mb-4 transition-all group-hover:scale-110 origin-left">
              <btn.Icon className="w-7 h-7" />
            </div>
            <p className="text-[11px] tracking-[0.2em] uppercase text-[#6a6a6a] dark:text-[#b3b3b3] font-bold">{btn.en}</p>
            <p className="text-lg font-bold text-[#181818] dark:text-white tracking-tight mt-1">{btn.label}</p>
          </button>
        ))}
      </div>

      {showAddModal && <AddProjectModal onClose={() => setShowAddModal(false)} onAdd={addProject} />}
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
    await onAdd({ name: name.trim(), client: client.trim(), category, embargoDate: embargoDate || null })
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[#f5f5f5] dark:bg-[#181818] rounded-[16px] p-8 max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm tracking-[0.2em] uppercase text-[#F4A259] font-bold mb-1">NEW PROJECT</p>
        <h2 className="text-2xl font-black tracking-tighter text-[#181818] dark:text-white mb-6">새 프로젝트</h2>

        <div className="space-y-4">
          <div>
            <label className="text-sm tracking-[0.15em] uppercase text-[#8a8a8a] font-semibold">PROJECT NAME</label>
            <input className="w-full mt-1 px-4 py-3 bg-[#ececec] dark:bg-[#1f1f1f] border border-[#dcdcdc] dark:border-[#2a2a2a] rounded-[12px] text-sm text-[#181818] dark:text-white outline-none focus:border-[#F4A259]"
              placeholder="예: VOGUE KOREA 화보" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="text-sm tracking-[0.15em] uppercase text-[#8a8a8a] font-semibold">CLIENT</label>
            <input className="w-full mt-1 px-4 py-3 bg-[#ececec] dark:bg-[#1f1f1f] border border-[#dcdcdc] dark:border-[#2a2a2a] rounded-[12px] text-sm text-[#181818] dark:text-white outline-none focus:border-[#F4A259]"
              placeholder="클라이언트명" value={client} onChange={(e) => setClient(e.target.value)} />
          </div>
          <div>
            <label className="text-sm tracking-[0.15em] uppercase text-[#8a8a8a] font-semibold">CATEGORY</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {categories.map((c) => (
                <button key={c} onClick={() => setCategory(c)}
                  className={`px-4 py-2 rounded-full text-xs font-bold transition-all
                    ${category === c ? 'bg-[#F4A259] text-white shadow-md' : 'bg-[#ececec] dark:bg-[#1f1f1f] border border-[#dcdcdc] dark:border-[#2a2a2a] text-[#6a6a6a] dark:text-[#b3b3b3] hover:bg-[#e4e4e4] dark:hover:bg-[#252525]'}`}>
                  {c}
                </button>
              ))}
              {category && !categories.includes(category) && (
                <button className="px-4 py-2 rounded-full text-xs font-bold bg-[#F4A259] text-white shadow-md">{category}</button>
              )}
            </div>
            <div className="flex gap-2 mt-2">
              <input className="flex-1 px-3 py-2 bg-[#ececec] dark:bg-[#1f1f1f] border border-[#dcdcdc] dark:border-[#2a2a2a] rounded-[12px] text-xs text-[#181818] dark:text-white outline-none"
                placeholder="직접 입력" value={customCat} onChange={(e) => setCustomCat(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === 'Enter' && customCat.trim()) { setCategory(customCat.trim()); setCustomCat('') } }} />
              <button onClick={() => { if (customCat.trim()) { setCategory(customCat.trim()); setCustomCat('') } }}
                className="px-3 py-2 bg-[#F4A259] text-white rounded-[12px] text-xs font-bold hover:brightness-110 transition-all">+</button>
            </div>
          </div>
          <div>
            <label className="text-sm tracking-[0.15em] uppercase text-[#8a8a8a] font-semibold">EMBARGO DATE (선택)</label>
            <input type="date" className="w-full mt-1 px-4 py-3 bg-[#ececec] dark:bg-[#1f1f1f] border border-[#dcdcdc] dark:border-[#2a2a2a] rounded-[12px] text-sm text-[#181818] dark:text-white outline-none focus:border-[#F4A259]"
              value={embargoDate} onChange={(e) => setEmbargoDate(e.target.value)} />
          </div>
        </div>

        <div className="flex gap-3 mt-8">
          <button onClick={onClose} className="flex-1 py-4 bg-[#ececec] dark:bg-[#1f1f1f] border border-[#dcdcdc] dark:border-[#2a2a2a] text-[#6a6a6a] dark:text-[#b3b3b3] rounded-[12px] font-bold text-sm hover:bg-[#e4e4e4] dark:hover:bg-[#252525] transition-all">취소</button>
          <button onClick={handleSubmit} disabled={!name.trim() || saving}
            className="flex-1 py-4 bg-[#F4A259] text-white rounded-[12px] font-bold text-sm hover:brightness-110 transition-all shadow-lg disabled:opacity-50">
            {saving ? '생성 중...' : '프로젝트 생성'}
          </button>
        </div>
      </div>
    </div>
  )
}
