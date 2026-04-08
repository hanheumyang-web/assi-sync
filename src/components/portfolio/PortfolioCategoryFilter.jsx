/**
 * Agency Teo-style category filter — vertical left-side floating labels
 * On mobile: horizontal scroll bar above grid
 */
export default function PortfolioCategoryFilter({ categories, activeCategory, onSelect, theme, variant = 'floating' }) {
  if (!categories?.length) return null

  const text = theme?.text || '#1A1A1A'
  const accent = theme?.accent || '#F4A259'

  const all = ['All', ...categories]

  // Floating variant (used in public page — overlays left side of grid)
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

  // Horizontal variant (used in editor preview)
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
