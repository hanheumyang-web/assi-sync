export default function PortfolioContactModal({ portfolio, profile, onClose, theme }) {
  const email = portfolio?.contactEmail || profile?.email || ''
  const phone = portfolio?.contactPhone || profile?.phone || ''
  const name = portfolio?.businessName || profile?.displayName || ''

  const bg = theme?.bg || '#FFFFFF'
  const text = theme?.text || '#1A1A1A'
  const accent = theme?.accent || '#828DF8'

  const mailto = email
    ? `mailto:${email}?subject=${encodeURIComponent(`[문의] ${name} 포트폴리오 관련`)}`
    : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="max-w-sm w-full mx-4 p-8 rounded-[24px] shadow-2xl" onClick={e => e.stopPropagation()}
        style={{ backgroundColor: bg }}>
        <h2 className="text-lg font-black tracking-tight mb-1" style={{ color: text }}>Contact</h2>
        <p className="text-sm mb-6" style={{ color: text + '60' }}>{name}</p>

        <div className="space-y-3">
          {mailto && (
            <a href={mailto}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-[16px] transition-colors hover:opacity-80"
              style={{ backgroundColor: text, color: bg }}>
              <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              <div className="text-left">
                <p className="text-xs opacity-60">Email</p>
                <p className="text-sm font-bold">{email}</p>
              </div>
            </a>
          )}
          {phone && (
            <a href={`tel:${phone}`}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-[16px] transition-colors hover:opacity-80"
              style={{ backgroundColor: text + '08', color: text }}>
              <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              <div className="text-left">
                <p className="text-xs" style={{ color: text + '50' }}>Phone</p>
                <p className="text-sm font-bold">{phone}</p>
              </div>
            </a>
          )}
        </div>

        <button onClick={onClose}
          className="w-full mt-4 py-2.5 text-sm transition-colors hover:opacity-60"
          style={{ color: text + '50' }}>
          Close
        </button>
      </div>
    </div>
  )
}
