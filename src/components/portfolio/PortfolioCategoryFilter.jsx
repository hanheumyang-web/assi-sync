/**
 * Portfolio category filter — supports multiple variants:
 * - floating: Fixed left vertical (desktop), horizontal (mobile)
 * - horizontal: Simple horizontal bar (editor preview)
 * - underline: Horizontal with bottom border accent
 * - underline-center: Same but centered
 * - pill: Rounded pill buttons with filled active state
 */
export default function PortfolioCategoryFilter({ categories, activeCategory, onSelect, theme, variant = 'floating' }) {
  if (!categories?.length) return null

  const text = theme?.text || '#1A1A1A'
  const accent = theme?.accent || '#F4A259'

  const all = ['All', ...categories]

  // ── Floating variant (overlays left side of grid) ──
  if (variant === 'floating') {
    return (
      <>
        {/* Desktop: vertical floating */}
        <div className="hidden md:flex flex-col gap-3 fixed left-8 lg:left-12 top-1/2 -translate-y-1/2 z-30">
          {all.map(cat => {
            const active = cat === 'All' ? !activeCategory : activeCategory === cat
            return (
              <button
                key={cat}
                onClick={() => onSelect(cat === 'All' ? null : cat)}
                className="text-left text-[11px] tracking-[0.15em] uppercase whitespace-nowrap transition-all hover:opacity-70"
                style={{
                  color: active ? accent : text + '40',
                  fontWeight: active ? 700 : 400,
                }}
              >
                {cat}
              </button>
            )
          })}
        </div>

        {/* Mobile: horizontal scroll */}
        <div className="md:hidden w-full px-6 pb-6">
          <div className="flex items-center gap-5 overflow-x-auto scrollbar-hide">
            {all.map(cat => {
              const active = cat === 'All' ? !activeCategory : activeCategory === cat
              return (
                <button
                  key={cat}
                  onClick={() => onSelect(cat === 'All' ? null : cat)}
                  className="text-[11px] tracking-[0.15em] uppercase whitespace-nowrap transition-all pb-1 border-b hover:opacity-70"
                  style={{
                    color: active ? accent : text + '40',
                    borderColor: active ? accent : 'transparent',
                    fontWeight: active ? 700 : 400,
                  }}
                >
                  {cat}
                </button>
              )
            })}
          </div>
        </div>
      </>
    )
  }

  // ── Underline variant ──
  if (variant === 'underline') {
    return (
      <div className="w-full px-6 md:px-12 pb-6">
        <div className="flex items-center gap-6 overflow-x-auto scrollbar-hide">
          {all.map(cat => {
            const active = cat === 'All' ? !activeCategory : activeCategory === cat
            return (
              <button key={cat} onClick={() => onSelect(cat === 'All' ? null : cat)}
                className="text-[11px] tracking-[0.15em] uppercase whitespace-nowrap transition-all pb-2 border-b-2 hover:opacity-70"
                style={{
                  color: active ? text : text + '40',
                  borderColor: active ? accent : 'transparent',
                  fontWeight: active ? 700 : 400,
                }}>
                {cat}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Underline-center variant ──
  if (variant === 'underline-center') {
    return (
      <div className="w-full px-6 md:px-12 pb-6">
        <div className="flex items-center justify-center gap-6 overflow-x-auto scrollbar-hide">
          {all.map(cat => {
            const active = cat === 'All' ? !activeCategory : activeCategory === cat
            return (
              <button key={cat} onClick={() => onSelect(cat === 'All' ? null : cat)}
                className="text-[11px] tracking-[0.15em] uppercase whitespace-nowrap transition-all pb-2 border-b-2 hover:opacity-70"
                style={{
                  color: active ? text : text + '40',
                  borderColor: active ? accent : 'transparent',
                  fontWeight: active ? 700 : 400,
                }}>
                {cat}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Pill variant ──
  if (variant === 'pill') {
    return (
      <div className="w-full px-6 md:px-12 pb-6">
        <div className="flex items-center gap-2 flex-wrap">
          {all.map(cat => {
            const active = cat === 'All' ? !activeCategory : activeCategory === cat
            return (
              <button key={cat} onClick={() => onSelect(cat === 'All' ? null : cat)}
                className="text-[11px] tracking-[0.1em] uppercase whitespace-nowrap transition-all px-4 py-1.5 rounded-full hover:opacity-70"
                style={{
                  backgroundColor: active ? accent : 'transparent',
                  color: active ? '#fff' : text + '50',
                  border: `1px solid ${active ? accent : text + '20'}`,
                  fontWeight: active ? 700 : 500,
                }}>
                {cat}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Horizontal variant (default, used in editor preview) ──
  return (
    <div className="w-full max-w-[1200px] mx-auto px-6 md:px-12 pb-6">
      <div className="flex items-center gap-5 overflow-x-auto scrollbar-hide">
        {all.map(cat => {
          const active = cat === 'All' ? !activeCategory : activeCategory === cat
          return (
            <button
              key={cat}
              onClick={() => onSelect(cat === 'All' ? null : cat)}
              className="text-[11px] tracking-[0.15em] uppercase whitespace-nowrap transition-all pb-1 border-b hover:opacity-70"
              style={{
                color: active ? accent : text + '40',
                borderColor: active ? accent : 'transparent',
                fontWeight: active ? 700 : 400,
              }}
            >
              {cat}
            </button>
          )
        })}
      </div>
    </div>
  )
}
