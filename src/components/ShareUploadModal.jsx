import { useRef, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase'

function formatBytes(n) {
  if (!n && n !== 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = n, i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`
}

function uploadWithProgress(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    })
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`업로드 실패 (${xhr.status})`))
    }
    xhr.onerror = () => reject(new Error('네트워크 오류'))
    xhr.send(file)
  })
}

export default function ShareUploadModal({ onClose }) {
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [stage, setStage] = useState('idle') // idle | uploading | confirming | done | error
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [shareUrl, setShareUrl] = useState('')
  const [copied, setCopied] = useState(false)

  const pick = () => inputRef.current?.click()

  const onFileChange = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setError('')
  }

  const onDrop = (e) => {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0]
    if (f) { setFile(f); setError('') }
  }

  const handleUpload = async () => {
    if (!file) return
    setError('')
    setStage('uploading')
    setProgress(0)
    try {
      const create = httpsCallable(functions, 'createShareUploadUrl')
      const { data: created } = await create({
        fileName: file.name,
        size: file.size,
        contentType: file.type || 'application/octet-stream',
      })

      await uploadWithProgress(created.uploadUrl, file, setProgress)

      setStage('confirming')
      const confirm = httpsCallable(functions, 'confirmShare')
      await confirm({ shareId: created.shareId })

      const url = `${window.location.origin}/share/${created.shareId}`
      setShareUrl(url)
      setStage('done')
    } catch (err) {
      console.error(err)
      setError(err.message || '업로드 실패')
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

  const reset = () => {
    setFile(null)
    setStage('idle')
    setProgress(0)
    setError('')
    setShareUrl('')
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-[#f5f5f5] dark:bg-[#181818] rounded-[16px] p-8 max-w-lg w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-[11px] tracking-[0.2em] uppercase text-[#6a6a6a] dark:text-[#b3b3b3] font-bold">SHARE UNCOMPRESSED</p>
            <h2 className="text-2xl font-black tracking-tight text-[#181818] dark:text-white mt-1">무압축 파일 공유</h2>
          </div>
          <button onClick={onClose} className="text-[#6a6a6a] hover:text-[#F4A259] text-2xl leading-none">×</button>
        </div>

        {stage === 'done' ? (
          <div className="space-y-5">
            <div className="bg-[#ececec] dark:bg-[#1f1f1f] rounded-[8px] p-5 text-center">
              <div className="w-12 h-12 rounded-full bg-[#F4A259] flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                </svg>
              </div>
              <p className="text-[11px] tracking-[0.2em] uppercase text-[#6a6a6a] dark:text-[#b3b3b3] font-bold">UPLOAD COMPLETE</p>
              <p className="text-lg font-black tracking-tight text-[#181818] dark:text-white mt-1">공유 링크가 생성되었습니다</p>
            </div>

            <div className="bg-white dark:bg-[#0a0a0a] rounded-[6px] p-3 flex items-center gap-2">
              <input
                readOnly
                value={shareUrl}
                className="flex-1 bg-transparent text-sm text-[#181818] dark:text-white font-medium outline-none"
                onFocus={(e) => e.target.select()}
              />
              <button
                onClick={handleCopy}
                className="px-4 py-2 rounded-[6px] bg-[#F4A259] text-black text-xs font-bold uppercase tracking-[0.1em] hover:brightness-110"
              >
                {copied ? 'COPIED' : 'COPY'}
              </button>
            </div>

            <div className="flex gap-3">
              <button onClick={reset} className="flex-1 py-3 rounded-[8px] bg-[#ececec] dark:bg-[#1f1f1f] text-[#181818] dark:text-white font-bold text-sm hover:brightness-95 dark:hover:brightness-125 transition-all">
                다른 파일 공유
              </button>
              <button onClick={onClose} className="flex-1 py-3 rounded-[8px] bg-[#181818] dark:bg-white text-white dark:text-black font-bold text-sm hover:opacity-90 transition-all">
                닫기
              </button>
            </div>
          </div>
        ) : (
          <>
            {!file ? (
              <div
                onClick={pick}
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                className="border-2 border-dashed border-[#dcdcdc] dark:border-[#2a2a2a] rounded-[8px] p-12 text-center cursor-pointer hover:border-[#F4A259] transition-all"
              >
                <svg className="w-12 h-12 mx-auto text-[#F4A259] mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
                </svg>
                <p className="text-base font-black tracking-tight text-[#181818] dark:text-white">파일을 끌어다 놓거나 클릭</p>
                <p className="text-xs text-[#6a6a6a] dark:text-[#b3b3b3] mt-1">최대 500GB · 7일간 유효</p>
                <input ref={inputRef} type="file" className="hidden" onChange={onFileChange} />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-[#ececec] dark:bg-[#1f1f1f] rounded-[8px] p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-[6px] bg-[#dcdcdc] dark:bg-[#2a2a2a] flex items-center justify-center text-[#F4A259] flex-shrink-0">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-black tracking-tight text-[#181818] dark:text-white truncate">{file.name}</p>
                      <p className="text-xs text-[#6a6a6a] dark:text-[#b3b3b3] mt-0.5">{formatBytes(file.size)}</p>
                    </div>
                    {stage === 'idle' && (
                      <button onClick={() => setFile(null)} className="text-[#6a6a6a] hover:text-[#F4A259] text-xl">×</button>
                    )}
                  </div>

                  {(stage === 'uploading' || stage === 'confirming') && (
                    <div className="mt-4">
                      <div className="h-2 bg-[#dcdcdc] dark:bg-[#2a2a2a] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#F4A259] transition-all"
                          style={{ width: `${stage === 'confirming' ? 100 : progress}%` }}
                        />
                      </div>
                      <p className="text-[10px] tracking-[0.18em] uppercase text-[#6a6a6a] dark:text-[#b3b3b3] font-bold mt-2">
                        {stage === 'confirming' ? 'FINALIZING...' : `UPLOADING · ${progress}%`}
                      </p>
                    </div>
                  )}
                </div>

                {error && (
                  <p className="text-xs text-[#F4A259] font-bold">{error}</p>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={onClose}
                    disabled={stage === 'uploading' || stage === 'confirming'}
                    className="flex-1 py-3 rounded-[8px] bg-[#ececec] dark:bg-[#1f1f1f] text-[#181818] dark:text-white font-bold text-sm hover:brightness-95 dark:hover:brightness-125 disabled:opacity-50 transition-all"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleUpload}
                    disabled={stage === 'uploading' || stage === 'confirming'}
                    className="flex-1 py-3 rounded-[8px] bg-[#F4A259] text-black font-black text-sm hover:brightness-110 disabled:opacity-60 transition-all"
                  >
                    {stage === 'uploading' || stage === 'confirming' ? '업로드 중...' : '공유 링크 만들기'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
