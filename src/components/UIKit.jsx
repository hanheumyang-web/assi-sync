// ── 스켈레톤 로더 ──
export function Skeleton({ className = '' }) {
  return <div className={`bg-gray-200 animate-pulse rounded-[12px] ${className}`} />
}

export function CardSkeleton() {
  return (
    <div className="bg-white rounded-[24px] overflow-hidden shadow-sm">
      <Skeleton className="h-40 rounded-none rounded-t-[24px]" />
      <div className="p-5 space-y-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  )
}

export function GridSkeleton({ count = 6 }) {
  return (
    <div className="grid grid-cols-3 gap-5">
      {Array.from({ length: count }).map((_, i) => <CardSkeleton key={i} />)}
    </div>
  )
}

export function AssetGridSkeleton({ count = 8 }) {
  return (
    <div className="grid grid-cols-4 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="aspect-square rounded-[14px]" />
      ))}
    </div>
  )
}

export function StatSkeleton() {
  return (
    <div className="bg-white rounded-[24px] p-5 shadow-sm space-y-2">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-8 w-12" />
      <Skeleton className="h-3 w-20" />
    </div>
  )
}

// ── 빈 상태 ──
export function EmptyState({ icon = '📂', title, description, action, actionLabel }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="w-20 h-20 rounded-[24px] bg-[#F4F3EE] flex items-center justify-center text-4xl mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-black tracking-tighter text-gray-900 mb-1">{title}</h3>
      {description && <p className="text-sm text-gray-400 mb-4 text-center max-w-xs">{description}</p>}
      {action && (
        <button
          onClick={action}
          className="px-5 py-2.5 bg-[#828DF8] text-white rounded-full text-xs font-bold shadow-lg shadow-[#828DF8]/25 hover:bg-[#6366F1] transition-all"
        >
          {actionLabel || '시작하기'}
        </button>
      )}
    </div>
  )
}

// ── 페이지 래퍼 (진입 애니메이션) ──
export function PageTransition({ children }) {
  return (
    <div className="animate-fadeIn">
      {children}
    </div>
  )
}
