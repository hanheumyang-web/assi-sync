import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import Hls from 'hls.js'
import { usePortfolioPublic } from '../../hooks/usePortfolioPublic'
import PortfolioHeader from './PortfolioHeader'
import PortfolioCategoryFilter from './PortfolioCategoryFilter'
import PortfolioGrid from './PortfolioGrid'
import PortfolioContactModal from './PortfolioContactModal'
import { PORTFOLIO_TEMPLATES } from './portfolioTemplates'

const BUNNY_CDN = 'https://vz-cd1dda72-832.b-cdn.net'

/** Bunny HLS 직접 재생 컴포넌트 — iframe 없이 hls.js로 스트리밍 */
function BunnyVideoPlayer({ bunnyVideoId }) {
  const videoRef = useRef(null)
  const hlsRef = useRef(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !bunnyVideoId) return

    const hlsUrl = `${BUNNY_CDN}/${bunnyVideoId}/playlist.m3u8`

    if (Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        startLevel: -1,
        enableWorker: true,
      })
      hlsRef.current = hls
      hls.loadSource(hlsUrl)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => { video.play().catch(() => {}) })
      return () => { hls.destroy(); hlsRef.current = null }
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari 네이티브 HLS
      video.src = hlsUrl
      video.play().catch(() => {})
    }
  }, [bunnyVideoId])

  return (
    <div className="w-full max-w-4xl" style={{ aspectRatio: '16/9' }}>
      <video ref={videoRef} controls playsInline
        className="w-full h-full object-contain rounded-lg bg-black" />
    </div>
  )
}

const FONT_MAP = {
  'pretendard': "'Pretendard Variable', 'Pretendard', sans-serif",
  'noto-sans': "'Noto Sans KR', sans-serif",
  'noto-serif': "'Noto Serif KR', serif",
  'suit': "'SUIT Variable', 'SUIT', sans-serif",
  'gmarket': "'GmarketSansMedium', sans-serif",
  'inter': "'Inter', sans-serif",
  'poppins': "'Poppins', sans-serif",
  'montserrat': "'Montserrat', sans-serif",
  'dm-sans': "'DM Sans', sans-serif",
  'space-grotesk': "'Space Grotesk', sans-serif",
  'playfair': "'Playfair Display', serif",
  'cormorant': "'Cormorant Garamond', serif",
}

export default function PortfolioPublicPage() {
  const { slug } = useParams()
  const { portfolio, profile, projects, projectAssets, loading, error } = usePortfolioPublic(slug)
  const [activeCategory, setActiveCategory] = useState(null)
  const [showContact, setShowContact] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const [preloaded, setPreloaded] = useState(new Set())

  useEffect(() => {
    if (!portfolio || !profile) return
    const name = portfolio.businessName || profile.displayName || 'Portfolio'
    document.title = `${name} — Portfolio`
  }, [portfolio, profile])

  // 인접 이미지 프리로드 (앞뒤 2장)
  const preloadAround = useCallback((assets, idx) => {
    const toLoad = [idx - 1, idx + 1, idx + 2, idx - 2]
      .map(i => (i + assets.length) % assets.length)
      .filter(i => i !== idx)
    for (const i of toLoad) {
      const a = assets[i]
      if (!a || a.embedUrl || a.isVideo) continue
      const url = a.url
      if (!url || preloaded.has(url)) continue
      const img = new Image()
      img.src = url
      setPreloaded(prev => new Set(prev).add(url))
    }
  }, [preloaded])

  const closeLightbox = useCallback(() => { setLightbox(null); setPreloaded(new Set()) }, [])

  // 라이트박스 열릴 때 히스토리 push → 뒤로가기로 닫기
  useEffect(() => {
    if (!lightbox) return
    window.history.pushState({ lightbox: true }, '')
    const onPop = () => { setLightbox(null); setPreloaded(new Set()) }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [lightbox !== null]) // eslint-disable-line react-hooks/exhaustive-deps

  const goToSlide = useCallback((dir) => {
    setLightbox(prev => {
      if (!prev) return prev
      const newIdx = (prev.idx + dir + prev.assets.length) % prev.assets.length
      preloadAround(prev.assets, newIdx)
      return { ...prev, idx: newIdx }
    })
  }, [preloadAround])

  // 키보드 네비게이션 (라이트박스)
  useEffect(() => {
    if (!lightbox) return
    const handleKey = (e) => {
      if (e.key === 'ArrowRight') goToSlide(1)
      else if (e.key === 'ArrowLeft') goToSlide(-1)
      else if (e.key === 'Escape') closeLightbox()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [lightbox, goToSlide, closeLightbox])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-6 h-6 border border-gray-200 border-t-gray-800 rounded-full animate-spin" />
      </div>
    )
  }

  if (error === 'not_found') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white">
        <p className="text-gray-200 text-6xl font-black mb-4">404</p>
        <p className="text-gray-400 text-sm font-light tracking-widest uppercase">Page not found</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-gray-400 text-sm">Something went wrong</p>
      </div>
    )
  }

  const templateId = portfolio?.template || 'default'
  const template = PORTFOLIO_TEMPLATES.find(t => t.id === templateId) || PORTFOLIO_TEMPLATES[0]

  const bg = portfolio?.backgroundColor || '#FFFFFF'
  const text = portfolio?.textColor || '#1A1A1A'
  const accent = portfolio?.accentColor || '#F4A259'
  const theme = { bg, text, accent }
  const categories = portfolio?.enabledCategories || []
  const photoGap = portfolio?.photoGap ?? 8
  const fontSize = portfolio?.fontSize ?? 100
  const pagePadding = portfolio?.pagePadding ?? 48
  const borderRadius = portfolio?.borderRadius ?? 12
  const fontFamily = portfolio?.fontFamily || 'pretendard'

  const openLightbox = (project) => {
    const raw = projectAssets[project.id] || []
    // 재생 불가능한 에셋 필터 (url, embedUrl, storagePath 모두 없는 것 제외)
    const assets = raw.filter(a => a.url || a.embedUrl || a.storagePath)
    if (assets.length) {
      setLightbox({ project, assets, idx: 0 })
      preloadAround(assets, 0)
    }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: bg, fontFamily: FONT_MAP[fontFamily] || FONT_MAP.pretendard }}>
      {/* Header */}
      <PortfolioHeader
        portfolio={portfolio}
        profile={profile}
        onContact={() => setShowContact(true)}
        theme={theme}
        fontSize={fontSize}
        pagePadding={pagePadding}
        template={template}
      />

      {/* Divider */}
      {template.headerVariant !== 'sidebar' && (
        <div className="w-full mx-auto" style={{ padding: `0 ${pagePadding}px`, margin: `${16 * fontSize / 100}px 0 ${24 * fontSize / 100}px` }}>
          <div className="h-px" style={{ backgroundColor: text + '10' }} />
        </div>
      )}

      {/* Category Filter */}
      <PortfolioCategoryFilter
        categories={categories}
        activeCategory={activeCategory}
        onSelect={setActiveCategory}
        theme={theme}
        variant={template.filterVariant || 'floating'}
      />

      {/* Grid */}
      <PortfolioGrid
        projects={projects}
        projectAssets={projectAssets}
        columns={portfolio?.columns || 3}
        rowAspectRatio={portfolio?.rowAspectRatio || 0.667}
        featuredProjects={portfolio?.featuredProjects || []}
        projectLayout={(() => {
          const raw = portfolio?.projectLayout || {}
          // 마이그레이션: flat이면 _all로 wrap
          const isLegacy = Object.values(raw).some(v => v && typeof v === 'object' && 'row' in v)
          const nested = isLegacy ? { _all: raw } : raw
          return nested[activeCategory || '_all'] || {}
        })()}
        photoGap={photoGap}
        pagePadding={pagePadding}
        borderRadius={borderRadius}
        masonry={true}
        mode="viewer"
        categoryFilter={activeCategory}
        onProjectClick={openLightbox}
        theme={theme}
        template={template}
      />

      {/* Footer */}
      <footer className="text-center py-20 mt-12">
        <p className="text-[10px] tracking-[0.3em] uppercase font-light" style={{ color: text + '20' }}>
          Powered by ASSI
        </p>
      </footer>

      {/* Contact Modal */}
      {showContact && (
        <PortfolioContactModal portfolio={portfolio} profile={profile} onClose={() => setShowContact(false)} theme={theme} />
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: bg }}>
          {/* Top bar */}
          <div className="flex items-center justify-between px-6 md:px-12 py-5">
            <button onClick={closeLightbox}
              className="flex items-center gap-2 text-[11px] tracking-[0.15em] uppercase font-medium hover:opacity-60 transition-opacity"
              style={{ color: text }}>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Back to list
            </button>
            <span className="text-[11px] tracking-[0.1em]" style={{ color: text + '50' }}>
              {lightbox.idx + 1} / {lightbox.assets.length}
            </span>
          </div>

          {/* Image area */}
          <div className="flex-1 flex items-center justify-center relative px-16 md:px-24">
            {(() => {
              const asset = lightbox.assets[lightbox.idx]
              if (!asset) return null
              const isVideo = asset.isVideo || asset.fileType?.startsWith('video/') || asset.videoHost === 'bunny' || asset.embedUrl
              const bunnyReady = asset.bunnyVideoId && asset.bunnyStatus !== 'error'

              /* 1순위: Bunny HLS 직접 재생 (hls.js, iframe 없음) */
              if (bunnyReady) {
                return <BunnyVideoPlayer key={asset.bunnyVideoId} bunnyVideoId={asset.bunnyVideoId} />
              }
              /* 2순위: Storage URL 직접 재생 */
              if (isVideo && asset.url) {
                return (
                  <div className="w-full max-w-4xl" style={{ aspectRatio: '16/9' }}>
                    <video src={asset.url} controls autoPlay playsInline className="w-full h-full object-contain rounded-lg bg-black" />
                  </div>
                )
              }
              /* 3순위: storagePath fallback */
              if (isVideo) {
                const storageBucket = 'assi-app-6ea04.firebasestorage.app'
                const fallbackUrl = asset.storagePath
                  ? `https://firebasestorage.googleapis.com/v0/b/${storageBucket}/o/${encodeURIComponent(asset.storagePath)}?alt=media`
                  : null
                if (fallbackUrl) {
                  return (
                    <div className="w-full max-w-4xl" style={{ aspectRatio: '16/9' }}>
                      <video src={fallbackUrl} controls autoPlay playsInline className="w-full h-full object-contain rounded-lg bg-black" />
                    </div>
                  )
                }
                return (
                  <div className="flex flex-col items-center gap-3">
                    <p className="text-sm" style={{ color: text + '60' }}>영상을 불러올 수 없습니다</p>
                  </div>
                )
              }
              return <img src={asset.url} alt="" className="max-w-full max-h-[75vh] object-contain" />
            })()}

            {lightbox.assets.length > 1 && (
              <>
                <button onClick={() => goToSlide(-1)}
                  className="absolute left-4 md:left-8 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center hover:opacity-60 transition-opacity"
                  style={{ color: text + '60' }}>
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <button onClick={() => goToSlide(1)}
                  className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center hover:opacity-60 transition-opacity"
                  style={{ color: text + '60' }}>
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </>
            )}
          </div>

          {/* Bottom: project info + thumbnail strip */}
          <div className="px-6 md:px-12 py-4">
            <div className="flex items-center gap-3 mb-3">
              <p className="text-sm font-medium tracking-wide uppercase" style={{ color: text }}>{lightbox.project.name}</p>
              {lightbox.project.category && (
                <p className="text-[10px] tracking-[0.15em] uppercase" style={{ color: text + '40' }}>
                  {lightbox.project.category}
                </p>
              )}
            </div>
            {/* Thumbnail strip */}
            {lightbox.assets.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-hide">
                {lightbox.assets.map((asset, i) => {
                  const isVideo = asset.isVideo || asset.fileType?.startsWith('video/') || asset.videoHost === 'bunny'
                  const thumbSrc = isVideo ? (asset.videoThumbnailUrl || (asset.bunnyVideoId ? `https://vz-cd1dda72-832.b-cdn.net/${asset.bunnyVideoId}/thumbnail.jpg` : null)) : asset.url
                  return (
                    <button key={asset.id} onClick={() => { setLightbox(prev => { preloadAround(prev.assets, i); return { ...prev, idx: i } }) }}
                      className={`flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden transition-all
                        ${i === lightbox.idx ? 'ring-2 ring-offset-1 opacity-100' : 'opacity-40 hover:opacity-70'}`}
                      style={{ ringColor: accent }}>
                      {thumbSrc ? (
                        <img src={thumbSrc} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                          <svg className="w-3 h-3 text-white/60" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="5 3 19 12 5 21 5 3" />
                          </svg>
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
