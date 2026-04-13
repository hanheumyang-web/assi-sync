/**
 * Portfolio header — name + info, responsive to fontSize/pagePadding settings
 * Supports template-based variants: left, left-large, left-compact, center, center-large, sidebar
 */
export default function PortfolioHeader({ portfolio, profile, onContact, theme, fontSize, pagePadding, template }) {
  const name = portfolio?.businessName || profile?.displayName || 'Portfolio'
  const tagline = portfolio?.tagline || profile?.profession || ''
  const bio = profile?.bio || ''
  const logoUrl = profile?.logoUrl
  const instagram = portfolio?.showInstagram !== false ? profile?.instagram : null
  const website = portfolio?.showWebsite !== false ? profile?.website : null

  const text = theme?.text || '#1A1A1A'
  const accent = theme?.accent || '#F4A259'
  const textMuted = text + '80'

  const fs = (fontSize ?? portfolio?.fontSize ?? 100) / 100
  const pad = pagePadding ?? portfolio?.pagePadding ?? 48

  const headerVariant = template?.headerVariant || 'left'

  // Social links component (reused across variants)
  const SocialLinks = ({ className = '' }) => (
    <div className={`flex items-center gap-5 ${className}`} style={{ marginTop: `${16 * fs}px` }}>
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
  )

  // Contact button component
  const ContactBtn = ({ className = '' }) => onContact ? (
    <button onClick={onContact}
      className={`tracking-[0.15em] uppercase font-medium border transition-all hover:opacity-70 ${className}`}
      style={{ color: text, borderColor: text + '30', fontSize: `${11 * fs}px`, padding: `${6 * fs}px ${16 * fs}px` }}>
      Contact
    </button>
  ) : null

  // ── Center variant ──
  if (headerVariant === 'center' || headerVariant === 'center-large') {
    const isLarge = headerVariant === 'center-large'
    return (
      <header className="w-full mx-auto text-center" style={{ padding: `${Math.max(pad * 0.8, 24)}px ${pad}px ${Math.max(pad * 0.4, 12)}px` }}>
        {/* Top bar */}
        <div className="flex items-center justify-between flex-wrap gap-2" style={{ marginBottom: `${Math.max(40 * fs, 20)}px` }}>
          <div className="flex items-center gap-3">
            {logoUrl && <img src={logoUrl} alt="" className="w-8 h-8 rounded-full object-cover" />}
            <span className="tracking-[0.3em] uppercase font-medium" style={{ color: text + '50', fontSize: `${10 * fs}px` }}>Portfolio</span>
          </div>
          <ContactBtn />
        </div>

        {/* Name */}
        <h1 className="font-black tracking-tighter leading-[0.85] uppercase break-words mx-auto"
          style={{ color: text, fontSize: isLarge ? `clamp(36px, 12vw, 200px)` : `${Math.max(48 * fs, 28)}px` }}>
          {name}
        </h1>
        {tagline && (
          <p className="font-light max-w-lg mx-auto leading-relaxed"
            style={{ color: textMuted, fontSize: `${Math.max(14 * fs, 11)}px`, marginTop: `${16 * fs}px` }}>
            {tagline}
          </p>
        )}
        {bio && (
          <p className="font-light max-w-md mx-auto leading-relaxed"
            style={{ color: text + '50', fontSize: `${Math.max(12 * fs, 10)}px`, marginTop: `${6 * fs}px` }}>
            {bio}
          </p>
        )}
        <SocialLinks className="justify-center" />
      </header>
    )
  }

  // ── Left-large variant ──
  if (headerVariant === 'left-large') {
    return (
      <header className="w-full mx-auto" style={{ padding: `${Math.max(pad * 0.8, 24)}px ${pad}px ${Math.max(pad * 0.4, 12)}px` }}>
        <div className="flex items-center justify-between flex-wrap gap-2" style={{ marginBottom: `${Math.max(40 * fs, 24)}px` }}>
          <div className="flex items-center gap-3">
            {logoUrl && <img src={logoUrl} alt="" className="w-8 h-8 rounded-full object-cover" />}
            <span className="tracking-[0.3em] uppercase font-medium" style={{ color: text + '50', fontSize: `${10 * fs}px` }}>Portfolio</span>
          </div>
          <ContactBtn />
        </div>
        <h1 className="font-black tracking-tighter leading-[0.85] uppercase break-words"
          style={{ color: text, fontSize: `clamp(36px, 8vw, 140px)` }}>
          {name}
        </h1>
        {tagline && (
          <p className="font-light max-w-lg leading-relaxed"
            style={{ color: textMuted, fontSize: `${Math.max(16 * fs, 12)}px`, marginTop: `${16 * fs}px` }}>
            {tagline}
          </p>
        )}
        {bio && (
          <p className="font-light max-w-md leading-relaxed"
            style={{ color: text + '50', fontSize: `${Math.max(12 * fs, 10)}px`, marginTop: `${6 * fs}px` }}>
            {bio}
          </p>
        )}
        <SocialLinks />
      </header>
    )
  }

  // ── Left-compact variant ──
  if (headerVariant === 'left-compact') {
    return (
      <header className="w-full mx-auto" style={{ padding: `${Math.max(pad * 0.5, 12)}px ${pad}px ${Math.max(pad * 0.3, 8)}px` }}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4 min-w-0">
            {logoUrl && <img src={logoUrl} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />}
            <h1 className="font-black tracking-tight leading-none uppercase truncate"
              style={{ color: text, fontSize: `${Math.max(28 * fs, 20)}px` }}>
              {name}
            </h1>
            {tagline && (
              <p className="font-light hidden sm:block truncate"
                style={{ color: textMuted, fontSize: `${Math.max(12 * fs, 10)}px` }}>
                {tagline}
              </p>
            )}
          </div>
          <div className="flex items-center gap-4 flex-shrink-0">
            {instagram && (
              <a href={`https://instagram.com/${instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer"
                className="tracking-[0.05em] hover:opacity-60 transition-opacity hidden md:block" style={{ color: textMuted, fontSize: `${11 * fs}px` }}>
                @{instagram.replace('@', '')}
              </a>
            )}
            <ContactBtn />
          </div>
        </div>
      </header>
    )
  }

  // ── Sidebar variant (for coloured template) ──
  if (headerVariant === 'sidebar') {
    return (
      <header className="w-full mx-auto" style={{ padding: `${Math.max(pad * 0.6, 16)}px ${pad}px ${Math.max(pad * 0.4, 12)}px` }}>
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-4">
              {logoUrl && <img src={logoUrl} alt="" className="w-8 h-8 rounded-full object-cover" />}
              <span className="tracking-[0.3em] uppercase font-medium" style={{ color: text + '50', fontSize: `${10 * fs}px` }}>Portfolio</span>
            </div>
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
          </div>
          <div className="flex flex-col items-start md:items-end gap-3 flex-shrink-0">
            <ContactBtn />
            <SocialLinks />
          </div>
        </div>
      </header>
    )
  }

  // ── Default left variant ──
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
        <ContactBtn />
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
      <SocialLinks />
    </header>
  )
}
