// ── ASSI 커스텀 SVG 아이콘 시스템 ──
// stroke 기반, currentColor 사용, 사이즈는 부모에서 w-/h-로 제어

const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }

export function IconDashboard({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...s}>
      <rect x="3" y="3" width="7" height="9" rx="2" />
      <rect x="14" y="3" width="7" height="5" rx="2" />
      <rect x="3" y="16" width="7" height="5" rx="2" />
      <rect x="14" y="12" width="7" height="9" rx="2" />
    </svg>
  )
}

export function IconProjects({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...s}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}

export function IconFeed({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...s}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  )
}

export function IconPdf({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...s}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="13" y2="17" />
    </svg>
  )
}

export function IconSearch({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...s}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  )
}

export function IconPlus({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...s}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

export function IconUpload({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...s}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

export function IconImage({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...s}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  )
}

export function IconCalendar({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...s}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

export function IconLock({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...s}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

export function IconCheck({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...s}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

export function IconSettings({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...s}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  )
}

export function IconLogout({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...s}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

export function IconChevronLeft({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...s}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

export function IconChevronRight({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...s}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

export function IconX({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...s}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

export function IconTrash({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...s}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

export function IconEdit({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...s}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

export function IconVideo({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...s}>
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  )
}

export function IconDownload({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...s}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

export function IconLink({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...s}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}

export function IconGlobe({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...s}>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}
