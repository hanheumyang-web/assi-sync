import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore'
import { db } from '../../firebase'

const SERVICE_LINKS = {
  instagram: (url) => url.startsWith('http') ? url : `https://instagram.com/${url}`,
  tiktok: (url) => url.startsWith('http') ? url : `https://tiktok.com/@${url}`,
  youtube: (url) => url.startsWith('http') ? url : `https://youtube.com/${url}`,
  vimeo: (url) => url.startsWith('http') ? url : `https://vimeo.com/${url}`,
  website: (url) => url.startsWith('http') ? url : `https://${url}`,
  email: (url) => `mailto:${url.replace('mailto:', '')}`,
}

const SERVICE_ICONS = {
  instagram: '📸', tiktok: '🎵', youtube: '▶️', vimeo: '▶️',
  website: '🌐', email: '✉️',
}

export default function LinkPagePublicPage() {
  const { slug } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!slug) { setNotFound(true); setLoading(false); return }
    const load = async () => {
      try {
        const q = query(collection(db, 'linkpages'), where('slug', '==', slug), where('published', '==', true))
        const snap = await getDocs(q)
        if (snap.empty) { setNotFound(true); setLoading(false); return }
        const d = snap.docs[0].data()
        setData(d)

        // 유저 프로필 사진 가져오기
        if (d.uid) {
          const userSnap = await getDoc(doc(db, 'users', d.uid))
          if (userSnap.exists()) {
            const u = userSnap.data()
            if (u.logoUrl) setData(prev => ({ ...prev, _logoUrl: u.logoUrl }))
          }
        }
      } catch (err) {
        console.error('링크페이지 로드 실패:', err)
        setNotFound(true)
      }
      setLoading(false)
    }
    load()
  }, [slug])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="w-8 h-8 rounded-full border-2 border-[#F4A259] border-t-transparent animate-spin" />
      </div>
    )
  }

  if (notFound || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white px-6">
        <p className="text-2xl font-black text-[#181818] mb-2">404</p>
        <p className="text-sm text-[#8a8a8a]">링크페이지를 찾을 수 없습니다</p>
        <a href="/" className="mt-4 text-sm text-[#F4A259] font-semibold hover:underline">홈으로 돌아가기</a>
      </div>
    )
  }

  const bg = data.backgroundColor || '#ffffff'
  const text = data.textColor || '#1a1a1a'
  const textSub = '#888888'
  const accent = data.accentColor || '#F4A259'
  const chipBg = bg === '#ffffff' ? '#f0f0f0' : adjustColor(bg, 15)
  const tiles = data.tiles || []

  const frameClass = {
    circle: 'rounded-full',
    rounded: 'rounded-[18px]',
    square: 'rounded-[6px]',
    hexagon: 'rounded-full',
  }[data.profileFrame] || 'rounded-full'

  const hexStyle = data.profileFrame === 'hexagon'
    ? { clipPath: 'polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)' }
    : {}

  const handleTileClick = (tile) => {
    if (!tile || tile.type === 'empty') return
    switch (tile.type) {
      case 'project':
        if (data.uid) window.open(`/p/${slug}#project-${tile.projectId}`, '_blank')
        break
      case 'category':
        if (data.uid) window.open(`/p/${slug}#category-${tile.category}`, '_blank')
        break
      case 'link':
        if (tile.url) {
          const fn = SERVICE_LINKS[tile.service]
          window.open(fn ? fn(tile.url) : tile.url, '_blank')
        }
        break
      case 'template':
      case 'portfolio':
        // portfolio slug로 이동
        if (data.uid) window.open(`/p/${slug}`, '_blank')
        break
      default:
        break
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center" style={{ background: bg, color: text, fontFamily: "'Figtree', 'Pretendard Variable', sans-serif" }}>
      <div className="w-full max-w-[430px] px-4 py-6">
        {/* Profile */}
        <div className="flex flex-col items-center mb-4">
          <div className="relative mb-3">
            <img
              src={data.profilePhotoUrl || data._logoUrl || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop&crop=face'}
              className={`w-24 h-24 object-cover ${frameClass}`}
              style={{ border: data.profileFrame !== 'hexagon' ? `3px solid ${accent}` : 'none', ...hexStyle }}
              alt=""
            />
          </div>
          <h1 className="text-xl font-extrabold text-center" style={{ color: text }}>
            {data.profileName || 'Untitled'}
          </h1>
          {data.showRole && data.profileRole && (
            <p className="text-xs mt-0.5 text-center" style={{ color: textSub }}>{data.profileRole}</p>
          )}
          {data.showBio && data.bio && (
            <p className="text-xs mt-1.5 text-center max-w-[280px] leading-relaxed" style={{ color: textSub }}>{data.bio}</p>
          )}
          <div className="flex gap-2 mt-2.5 flex-wrap justify-center">
            {data.showEmail && data.contactEmail && (
              <a href={`mailto:${data.contactEmail}`}
                className="text-[11px] px-2.5 py-1 rounded-full transition-opacity hover:opacity-70"
                style={{ background: chipBg, color: textSub }}>
                ✉ {data.contactEmail}
              </a>
            )}
            {data.showPhone && data.contactPhone && (
              <a href={`tel:${data.contactPhone}`}
                className="text-[11px] px-2.5 py-1 rounded-full transition-opacity hover:opacity-70"
                style={{ background: chipBg, color: textSub }}>
                📱 {data.contactPhone}
              </a>
            )}
          </div>
        </div>

        {/* Tile Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${data.columns || 3}, 1fr)`, gap: data.tileGap ?? 3 }}>
          {tiles.filter(t => t.type !== 'empty').map(tile => (
            <div key={tile.id}
              onClick={() => handleTileClick(tile)}
              className="relative overflow-hidden cursor-pointer transition-all hover:opacity-90 active:scale-[0.97]"
              style={{
                aspectRatio: data.tileRatio || '1',
                borderRadius: data.tileRadius ?? 3,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
              <TilePublic tile={tile} accent={accent} chipBg={chipBg} text={text} />
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <a href="/" className="text-[10px] font-semibold tracking-wider uppercase" style={{ color: textSub, opacity: 0.5 }}>
            Powered by ASSI
          </a>
        </div>
      </div>
    </div>
  )
}

function TilePublic({ tile, accent, chipBg, text }) {
  switch (tile.type) {
    case 'project':
      return (
        <>
          <img src={tile.thumbnailUrl} alt="" className="w-full h-full object-cover" />
          <div className="absolute bottom-0 left-0 right-0 px-2 pb-1.5 pt-4" style={{ background: 'linear-gradient(transparent, rgba(0,0,0,.55))' }}>
            <span className="text-[10px] font-semibold text-white leading-tight">{tile.name}</span>
          </div>
        </>
      )
    case 'category':
      return (
        <div className="flex flex-col items-center justify-center gap-1 w-full h-full" style={{ background: tile.color || accent }}>
          <span className="text-xl">📁</span>
          <span className="text-[10px] font-bold text-white text-center leading-tight">{tile.category}</span>
          <span className="text-[8px] text-white/60">{tile.count} projects</span>
        </div>
      )
    case 'link':
      return (
        <div className="flex flex-col items-center justify-center gap-1 w-full h-full" style={{ background: chipBg }}>
          <span className="text-2xl">{SERVICE_ICONS[tile.service] || '🔗'}</span>
          <span className="text-[10px] font-semibold text-center" style={{ color: text }}>{tile.label}</span>
        </div>
      )
    case 'template':
      return (
        <div className="flex flex-col items-center justify-center gap-1 w-full h-full" style={{ background: tile.bgColor || '#f5f5f5' }}>
          <span className="text-xl">⬡</span>
          <span className="text-[9px] font-bold" style={{ color: tile.isDark ? '#fff' : '#1a1a1a' }}>포트폴리오</span>
          <span className="text-[7px] text-[#888]">{tile.label}</span>
        </div>
      )
    case 'portfolio':
      return (
        <div className="flex flex-col items-center justify-center gap-1 w-full h-full" style={{ background: accent }}>
          <span className="text-xl text-white">⬡</span>
          <span className="text-[10px] font-semibold text-white">포트폴리오</span>
        </div>
      )
    case 'image':
      return <img src={tile.url} alt="" className="w-full h-full object-cover" />
    case 'video':
      return <video src={tile.url} muted loop playsInline autoPlay className="w-full h-full object-cover" />
    default:
      return null
  }
}

function adjustColor(hex, amount) {
  try {
    const num = parseInt(hex.replace('#', ''), 16)
    const r = Math.min(255, Math.max(0, (num >> 16) + amount))
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount))
    const b = Math.min(255, Math.max(0, (num & 0xff) + amount))
    return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`
  } catch { return '#f0f0f0' }
}
