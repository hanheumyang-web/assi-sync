import { useEffect, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase'

function formatBytes(n) {
  if (!n && n !== 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = n, i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`
}

export default function ProjectShareModal({ project, onClose }) {
  const [stage, setStage] = useState('idle') // idle | creating | done | error
  const [shareUrl, setShareUrl] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const handleCreate = async () => {
    setStage('creating')
    setError('')
    try {
      const fn = httpsCallable(functions, 'createProjectShare')
      const { data } = await fn({ projectId: project.id })
      const url = `${window.location.origin}/share/${data.shareId}`
      setShareUrl(url)
      setStage('done')
    } catch (err) {
      console.error(err)
      setError(err.message || '공유 생성 실패')
      setStage('error')
    }
  }

  // 모달 열리면 자동으로 생성
  useEffect(() => { handleCreate() }, []) // eslint-disable-line

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }

  const totalCount = (project.imageCount || 0) + (project.videoCount || 0)

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-[#f5f5f5] dark:bg-[#181818] rounded-[16px] p-8 max-w-lg w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-[11px] tracking-[0.2em] uppercase text-[#6a6a6a] dark:text-[#b3b3b3] font-bold">SHARE PROJECT</p>
            <h2 className="text-2xl font-black tracking-tight text-[#181818] dark:text-white mt-1">프로젝트 공유</h2>
          </div>
          <button onClick={onClose} className="text-[#6a6a6a] hover:text-[#F4A259] text-2xl leading-none">×</button>
        </div>

        {/* 프로젝트 정보 */}
        <div className="bg-[#ececec] dark:bg-[#1f1f1f] rounded-[8px] p-5 mb-5 flex items-center gap-4">
          {project.thumbnailUrl ? (
            <img src={project.thumbnailUrl} alt="" className="w-16 h-16 rounded-[6px] object-cover flex-shrink-0" />
          ) : (
            <div className="w-16 h-16 rounded-[6px] bg-[#dcdcdc] dark:bg-[#2a2a2a] flex items-center justify-center text-[#F4A259] flex-shrink-0">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[10px] tracking-[0.18em] uppercase text-[#6a6a6a] dark:text-[#b3b3b3] font-bold">{project.client || 'CLIENT'}</p>
            <p className="text-lg font-black tracking-tight text-[#181818] dark:text-white truncate">{project.name}</p>
            <p className="text-xs text-[#6a6a6a] dark:text-[#b3b3b3] mt-0.5">
              사진 {project.imageCount || 0} · 영상 {project.videoCount || 0} · 총 {totalCount}개
            </p>
          </div>
        </div>

        {stage === 'creating' && (
          <div className="text-center py-6">
            <div className="w-10 h-10 rounded-full border-4 border-[#F4A259] border-t-transparent animate-spin mx-auto mb-3"></div>
            <p className="text-[11px] tracking-[0.2em] uppercase text-[#6a6a6a] dark:text-[#b3b3b3] font-bold">CREATING SHARE LINK...</p>
          </div>
        )}

        {stage === 'error' && (
          <div className="text-center py-4">
            <p className="text-sm text-[#F4A259] font-bold mb-3">{error}</p>
            <button onClick={handleCreate} className="px-5 py-2 rounded-[8px] bg-[#F4A259] text-black text-sm font-bold">다시 시도</button>
          </div>
        )}

        {stage === 'done' && (
          <>
            <div className="bg-white dark:bg-[#0a0a0a] rounded-[6px] p-3 flex items-center gap-2 mb-4">
              <input
                readOnly
                value={shareUrl}
                className="flex-1 bg-transparent text-sm text-[#181818] dark:text-white font-medium outline-none min-w-0"
                onFocus={(e) => e.target.select()}
              />
              <button
                onClick={handleCopy}
                className="px-4 py-2 rounded-[6px] bg-[#F4A259] text-black text-xs font-bold uppercase tracking-[0.1em] hover:brightness-110 flex-shrink-0"
              >
                {copied ? 'COPIED' : 'COPY'}
              </button>
            </div>

            <p className="text-[11px] text-center text-[#6a6a6a] dark:text-[#b3b3b3] mb-5">
              링크는 7일 후 자동 만료됩니다
            </p>

            <button onClick={onClose} className="w-full py-3 rounded-[8px] bg-[#181818] dark:bg-white text-white dark:text-black font-bold text-sm hover:opacity-90 transition-all">
              완료
            </button>
          </>
        )}
      </div>
    </div>
  )
}
