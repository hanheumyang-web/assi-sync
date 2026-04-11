import { useEffect, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { doc, onSnapshot } from 'firebase/firestore'
import { functions, auth, db } from '../firebase'

function formatBytes(n) {
  if (!n && n !== 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = n, i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`
}

export default function ProjectShareModal({ project, assets = [], onClose }) {
  const [stage, setStage] = useState('select') // select | requesting | uploading | done | error
  const [selected, setSelected] = useState(() => new Set(assets.map(a => a.id)))
  const [error, setError] = useState('')
  const [shareUrl, setShareUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [msgCopied, setMsgCopied] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0, percent: 0 })

  const allSelected = selected.size === assets.length && assets.length > 0
  const noneSelected = selected.size === 0

  const toggleOne = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(assets.map(a => a.id)))
  }

  const selectedAssets = assets.filter(a => selected.has(a.id))
  const totalSize = selectedAssets.reduce((sum, a) => sum + (a.fileSize || 0), 0)
  const totalCount = selectedAssets.length

  const [shareId, setShareId] = useState(null)

  // Firestore onSnapshot으로 업로드 진행률 실시간 구독
  useEffect(() => {
    if (!shareId || stage !== 'uploading') return
    const unsub = onSnapshot(doc(db, 'shares', shareId), (snap) => {
      if (!snap.exists()) return
      const data = snap.data()
      const uploaded = data.uploadedCount || 0
      const total = data.assetCount || 1
      setUploadProgress({
        current: uploaded,
        total,
        percent: Math.round((uploaded / total) * 100),
      })
      if (data.status === 'ready') {
        setStage('done')
      }
    })
    return unsub
  }, [shareId, stage])

  const handleCreate = async () => {
    if (noneSelected) return
    setStage('requesting')
    setError('')
    try {
      const fn = httpsCallable(functions, 'createProjectShare')
      const { data } = await fn({
        projectId: project.id,
        selectedAssetIds: [...selected],
      })
      const url = `${window.location.origin}/share/${data.shareId}`
      setShareUrl(url)
      setShareId(data.shareId)
      setUploadProgress({ current: 0, total: totalCount, percent: 0 })
      setStage('uploading') // ASSI Sync가 업로드 완료하면 onSnapshot에서 done으로 전환
    } catch (err) {
      console.error(err)
      setError(err.message || '공유 생성 실패')
      setStage('error')
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }

  const senderName = auth.currentUser?.displayName || ''
  const messageText = `${senderName ? `${senderName} 님이 파일을 보냈어요\n` : ''}${project.name} · ${totalCount}개 파일\n⚠ 링크는 7일 후 자동 만료됩니다\n\n${shareUrl}`
  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(messageText)
      setMsgCopied(true)
      setTimeout(() => setMsgCopied(false), 1500)
    } catch {}
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-[#f5f5f5] dark:bg-[#181818] rounded-[16px] p-8 max-w-2xl w-full shadow-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-5 flex-shrink-0">
          <div>
            <p className="text-[11px] tracking-[0.2em] uppercase text-[#6a6a6a] dark:text-[#b3b3b3] font-bold">SHARE UNCOMPRESSED</p>
            <h2 className="text-2xl font-black tracking-tight text-[#181818] dark:text-white mt-1">무압축 공유</h2>
          </div>
          <button onClick={onClose} className="text-[#6a6a6a] hover:text-[#F4A259] text-2xl leading-none">×</button>
        </div>

        {/* Project info */}
        <div className="bg-[#ececec] dark:bg-[#1f1f1f] rounded-[8px] p-4 mb-4 flex items-center gap-4 flex-shrink-0">
          {project.thumbnailUrl ? (
            <img src={project.thumbnailUrl} alt="" className="w-14 h-14 rounded-[6px] object-cover flex-shrink-0" />
          ) : (
            <div className="w-14 h-14 rounded-[6px] bg-[#dcdcdc] dark:bg-[#2a2a2a] flex items-center justify-center text-[#F4A259] flex-shrink-0">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[10px] tracking-[0.18em] uppercase text-[#6a6a6a] dark:text-[#b3b3b3] font-bold">{project.client || 'PROJECT'}</p>
            <p className="text-lg font-black tracking-tight text-[#181818] dark:text-white truncate">{project.name}</p>
          </div>
        </div>

        {stage === 'select' && (
          <>
            {/* Select all / none */}
            <div className="flex items-center justify-between mb-3 flex-shrink-0">
              <button
                onClick={toggleAll}
                className="text-xs font-bold text-[#6a6a6a] dark:text-[#b3b3b3] hover:text-[#F4A259] transition-colors"
              >
                {allSelected ? '전체 해제' : '전체 선택'}
              </button>
              <p className="text-xs text-[#6a6a6a] dark:text-[#b3b3b3]">
                {totalCount}개 선택 · {formatBytes(totalSize)}
              </p>
            </div>

            {/* Asset grid with checkboxes */}
            <div className="overflow-y-auto flex-1 min-h-0 mb-4 -mx-1 px-1">
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                {assets.map((asset) => {
                  const isChecked = selected.has(asset.id)
                  const thumb = asset.thumbUrl || asset.videoThumbnailUrl || asset.url || ''
                  return (
                    <button
                      key={asset.id}
                      onClick={() => toggleOne(asset.id)}
                      className={`relative aspect-square rounded-[8px] overflow-hidden group transition-all ${
                        isChecked
                          ? 'ring-2 ring-[#F4A259] ring-offset-2 ring-offset-[#f5f5f5] dark:ring-offset-[#181818]'
                          : 'opacity-40 hover:opacity-70'
                      }`}
                    >
                      {thumb ? (
                        <img src={thumb} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-[#dcdcdc] dark:bg-[#2a2a2a] flex items-center justify-center">
                          <svg className="w-6 h-6 text-[#6a6a6a]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                          </svg>
                        </div>
                      )}
                      {/* Video badge */}
                      {asset.isVideo && (
                        <div className="absolute bottom-1 left-1 bg-black/70 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                          VIDEO
                        </div>
                      )}
                      {/* Checkbox */}
                      <div className={`absolute top-1.5 right-1.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                        isChecked
                          ? 'bg-[#F4A259] border-[#F4A259]'
                          : 'bg-black/30 border-white/70'
                      }`}>
                        {isChecked && (
                          <svg className="w-3 h-3 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                          </svg>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 flex-shrink-0">
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-[8px] bg-[#ececec] dark:bg-[#1f1f1f] text-[#181818] dark:text-white font-bold text-sm hover:brightness-95 dark:hover:brightness-125 transition-all"
              >
                취소
              </button>
              <button
                onClick={handleCreate}
                disabled={noneSelected}
                className="flex-1 py-3 rounded-[8px] bg-[#F4A259] text-black font-black text-sm hover:brightness-110 disabled:opacity-40 transition-all"
              >
                {totalCount}개 무압축 공유
              </button>
            </div>
          </>
        )}

        {stage === 'requesting' && (
          <div className="text-center py-10">
            <div className="w-10 h-10 rounded-full border-4 border-[#F4A259] border-t-transparent animate-spin mx-auto mb-3"></div>
            <p className="text-[11px] tracking-[0.2em] uppercase text-[#6a6a6a] dark:text-[#b3b3b3] font-bold">CREATING SHARE LINK...</p>
          </div>
        )}

        {stage === 'uploading' && (
          <div className="py-8">
            <div className="text-center mb-4">
              <p className="text-[11px] tracking-[0.2em] uppercase text-[#6a6a6a] dark:text-[#b3b3b3] font-bold">
                UPLOADING · {uploadProgress.current} / {uploadProgress.total}
              </p>
            </div>
            <div className="h-2 bg-[#dcdcdc] dark:bg-[#2a2a2a] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#F4A259] transition-all"
                style={{ width: `${uploadProgress.percent}%` }}
              />
            </div>
            <p className="text-center text-xs text-[#6a6a6a] dark:text-[#b3b3b3] mt-2">
              ASSI Sync에서 무압축 파일을 업로드하고 있습니다
            </p>
          </div>
        )}

        {stage === 'error' && (
          <div className="text-center py-6">
            <p className="text-sm text-[#F4A259] font-bold mb-3">{error}</p>
            <button onClick={() => setStage('select')} className="px-5 py-2 rounded-[8px] bg-[#F4A259] text-black text-sm font-bold">돌아가기</button>
          </div>
        )}

        {stage === 'done' && (
          <>
            <div className="bg-[#ececec] dark:bg-[#1f1f1f] rounded-[8px] p-6 text-center mb-4">
              <div className="w-12 h-12 rounded-full bg-[#F4A259] flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                </svg>
              </div>
              <p className="text-[11px] tracking-[0.2em] uppercase text-[#6a6a6a] dark:text-[#b3b3b3] font-bold">SHARE READY</p>
              <p className="text-lg font-black tracking-tight text-[#181818] dark:text-white mt-1">공유 링크가 생성되었습니다</p>
            </div>

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

            {/* 추천 메시지 */}
            <div className="bg-[#ececec] dark:bg-[#1f1f1f] rounded-[8px] p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] tracking-[0.18em] uppercase text-[#6a6a6a] dark:text-[#b3b3b3] font-bold">MESSAGE TEMPLATE</p>
                <button
                  onClick={handleCopyMessage}
                  className="px-3 py-1 rounded-[6px] bg-[#F4A259] text-black text-[10px] font-black uppercase tracking-[0.1em] hover:brightness-110"
                >
                  {msgCopied ? 'COPIED' : 'COPY'}
                </button>
              </div>
              <pre className="text-xs text-[#181818] dark:text-white font-medium whitespace-pre-wrap break-all leading-relaxed" style={{ fontFamily: 'inherit' }}>{messageText}</pre>
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
