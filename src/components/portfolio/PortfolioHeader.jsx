/**
 * Portfolio header — name + info, responsive to fontSize/pagePadding settings
 */
export default function PortfolioHeader({ portfolio, profile, onContact, theme, fontSize, pagePadding }) {
  const name = portfolio?.businessName || profile?.displayName || 'Portfolio'
  const tagline = portfolio?.tagline || profile?.profession || ''
  const bio = profile?.bio || ''
  const logoUrl = profile?.logoUrl
  const instagram = portfolio?.showInstagram !== false ? profile?.instagram : null
  const website = portfolio?.showWebsite !== false ? profile?.website : null

  const text = theme?.text || '#1A1A1A'
  const accent = theme?.accent || '#F4A259'
  const textMuted = text + '80'

  // 폰트 스케일 (기본 100%)
  const fs = (fontSize ?? portfolio?.fontSize ?? 100) / 100
  // 여백 (기본 48px)
  const pad = pagePadding ?? portfolio?.pagePadding ?? 48

  return (
    <header className="w-full mx-auto" style={{ padding: `${Math.max(pad * 0.6, 16)}px ${pad}px ${Math.max(pad * 0.4, 12)}px` }}>
      {/* Top bar: logo + contact */}
      <div className="flex items-center justify-between flex-wrap gap-2" style={{ marginBottom: `${Math.max(32 * fs, 16)}px` }}>
        <div className="flex items-center gap-3">
          {logoUrl && (
            <img src={logoUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
          )}
          <span className="tracking-[0.3em] uppercase font-medium" style={{ color: text + '50', fontSize: `${10 * fs}px` }}>
            Portfolio
          </span>
        </div>
        {onContact && (
          <button
            onClick={onContact}
            className="tracking-[0.15em] uppercase font-medium border transition-all hover:opacity-70"
            style={{ color: text, borderColor: text + '30', fontSize: `${11 * fs}px`, padding: `${6 * fs}px ${16 * fs}px` }}
          >
            Contact
          </button>
        )}
      </div>

      {/* Name */}
      <h1 className="font-black tracking-tighter leading-[0.9] uppercase break-words"
        style={{ color: text, fontSize: `${Math.max(48 * fs, 28)}px` }}>
        {name}
      </h1>
      {tagline && (
        <p className="font-light max-w-md leading-relaxed"
          style={{ color: textMuted, fontSize: `${Math.max(14 * fs, 11)}px`, marginTop: `${12 * fs}px` }}>
          {tagline}
        </p>
      )}
      {bio && (
        <p className="font-light max-w-md leading-relaxed"
          style={{ color: text + '50', fontSize: `${Math.max(12 * fs, 10)}px`, marginTop: `${6 * fs}px` }}>
          {bio}
        </p>
      )}

      {/* Social links */}
      <div className="flex items-center gap-5" style={{ marginTop: `${16 * fs}px` }}>
        {instagram && (
          <a href={`https://instagram.com/${instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer"
            className="tracking-[0.05em] hover:opacity-60 transition-opacity" style={{ color: textMuted, fontSize: `${11 * fs}px` }}>
            @{instagram.replace('@', '')}
          </a>
        )}
        {website && (
          <a href={website.startsWith('http') ? website : `https://${website}`} target="_blank" rel="noopener noreferrer"
            className="tracking-[0.05em] hover:opacity-60 transition-opacity" style={{ color: textMuted, fontSize: `${11 * fs}px` }}>
            {website.replace(/^https?:\/\//, '')}
          </a>
        )}
      </div>
    </header>
  )
}
