import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase'
import JSZip from 'jszip'

function formatBytes(n) {
  if (!n && n !== 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = n, i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`
}

function formatRelative(ms) {
  if (!ms) return ''
  const diff = ms - Date.now()
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
  if (days <= 0) return '곧 만료'
  return `${days}일`
}

export default function ShareDownloadPage() {
  const { shareId } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [downloadAllProgress, setDownloadAllProgress] = useState(null) // { current, total }

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const fn = httpsCallable(functions, 'getShareDownloadUrl')
        const res = await fn({ shareId })
        if (!cancelled) setData(res.data)
      } catch (err) {
        if (!cancelled) setError(err.message || '공유를 불러올 수 없습니다.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [shareId])

  const handleAssetDownload = async (a) => {
    try {
      const fn = httpsCallable(functions, 'getAssetDownloadUrl')
      const res = await fn({ shareId, assetId: a.id })
      const link = document.createElement('a')
      link.href = res.data.url
      link.download = a.fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (err) {
      alert('다운로드 링크 발급 실패: ' + (err.message || ''))
    }
  }

  const handleDownloadAll = async () => {
    const assets = data?.assets || []
    if (assets.length === 0) return
    setDownloadAllProgress({ current: 0, total: assets.length, phase: 'fetching' })

    const zip = new JSZip()
    const fn = httpsCallable(functions, 'getAssetDownloadUrl')

    for (let i = 0; i < assets.length; i++) {
      try {
        setDownloadAllProgress({ current: i, total: assets.length, phase: 'fetching' })
        const res = await fn({ shareId, assetId: assets[i].id })
        const blob = await fetch(res.data.url).then(r => r.blob())
        zip.file(assets[i].fileName, blob)
      } catch (err) {
        console.error(`Failed to fetch ${assets[i].fileName}:`, err)
      }
    }

    setDownloadAllProgress({ current: assets.length, total: assets.length, phase: 'zipping' })
    const zipBlob = await zip.generateAsync({ type: 'blob' })
    const zipName = `${data.projectName || 'ASSI-Share'}.zip`
    const link = document.createElement('a')
    link.href = URL.createObjectURL(zipBlob)
    link.download = zipName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(link.href)
    setTimeout(() => setDownloadAllProgress(null), 1500)
  }

  const fileExt = (name) => {
    const m = /\.([^.]+)$/.exec(name || '')
    return m ? m[1].toUpperCase() : '—'
  }

  const handleDownload = async () => {
    setDownloading(true)
    try {
      // 새 presigned URL 받아서 다운로드 (방금 받은 게 만료되었을 수 있음)
      const fn = httpsCallable(functions, 'getShareDownloadUrl')
      const res = await fn({ shareId })
      window.location.href = res.data.downloadUrl
    } catch (err) {
      alert('다운로드 링크 발급 실패: ' + (err.message || ''))
    } finally {
      setTimeout(() => setDownloading(false), 1500)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] dark:bg-[#000000] flex items-center justify-center">
        <p className="text-[#6a6a6a] dark:text-[#b3b3b3] text-sm tracking-[0.15em] uppercase font-bold">Loading...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] dark:bg-[#000000] flex items-center justify-center px-6">
        <div className="text-center">
          <p className="text-[11px] tracking-[0.2em] uppercase text-[#F4A259] font-bold mb-2">UNAVAILABLE</p>
          <h1 className="text-2xl font-black tracking-tight text-[#181818] dark:text-white mb-2">공유를 열 수 없습니다</h1>
          <p className="text-sm text-[#6a6a6a] dark:text-[#b3b3b3]">{error}</p>
        </div>
      </div>
    )
  }

  const senderInitial = (data.sender?.name || '?').slice(0, 1)
  const isProject = data.kind === 'project'
  const isVideo = data.previewType === 'video' && data.previewStatus === 'ready' && data.previewUrl
  const isVideoProcessing = data.previewType === 'video' && data.previewStatus === 'processing'
  const isImage = data.previewType === 'image' && data.previewStatus === 'ready' && data.previewUrl

  // ─── 프로젝트 공유: 업로드 진행 중 ───
  if (isProject && data.status === 'pending_upload') {
    return (
      <div className="bg-[#FAFAFA] dark:bg-[#000000] min-h-screen text-[#181818] dark:text-white flex items-center justify-center" style={{ fontFamily: 'Pretendard Variable, Pretendard, sans-serif' }}>
        <div className="text-center px-8">
          <div className="w-12 h-12 rounded-full border-4 border-[#F4A259] border-t-transparent animate-spin mx-auto mb-4"></div>
          <p className="text-[11px] tracking-[0.2em] uppercase text-[#6a6a6a] dark:text-[#b3b3b3] font-bold mb-2">UPLOADING IN PROGRESS</p>
          <h1 className="text-2xl font-black tracking-tight mb-2">무압축 파일을 준비하고 있어요</h1>
          <p className="text-sm text-[#6a6a6a] dark:text-[#b3b3b3]">
            {data.projectName} · {data.uploadedCount || 0} / {data.assetCount}개 업로드 완료
          </p>
          <p className="text-xs text-[#6a6a6a] dark:text-[#b3b3b3] mt-3">잠시 후 새로고침 해주세요</p>
        </div>
      </div>
    )
  }

  // ─── 프로젝트 공유 렌더 ───
  if (isProject) {
    return (
      <div className="bg-[#FAFAFA] dark:bg-[#000000] min-h-screen text-[#181818] dark:text-white" style={{ fontFamily: 'Pretendard Variable, Pretendard, sans-serif' }}>
        <nav className="max-w-[1200px] mx-auto px-8 pt-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-[8px] bg-[#F4A259] flex items-center justify-center">
              <span className="text-black font-black text-base">A</span>
            </div>
            <span className="font-black text-lg tracking-tight">ASSI</span>
          </div>
          <span className="text-[11px] tracking-[0.2em] uppercase text-[#6a6a6a] dark:text-[#b3b3b3] font-bold">PROJECT SHARE</span>
        </nav>

        <main className="max-w-[1100px] mx-auto px-8 py-14">
          {/* 헤더 */}
          <div className="mb-8">
            <p className="text-[11px] tracking-[0.2em] uppercase text-[#6a6a6a] dark:text-[#b3b3b3] font-bold">UNCOMPRESSED SHARE</p>
            <h1 className="text-4xl md:text-5xl font-black tracking-tighter mt-2 leading-[1.1]">
              {data.sender?.name || '익명'} 님이 무압축 파일을 보냈어요
            </h1>
            <div className="flex items-center gap-3 mt-4 text-sm text-[#6a6a6a] dark:text-[#b3b3b3]">
              <span className="font-bold text-[#181818] dark:text-white">{data.projectName}</span>
              <span>·</span>
              <span>{data.assetCount}개 파일</span>
              <span>·</span>
              <span>{formatBytes(data.totalSize)}</span>
            </div>
            <p className="mt-3 text-xs text-[#F4A259] font-bold tracking-wide">
              ⚠ 링크는 7일 후 자동 만료됩니다 · {formatRelative(data.expiresAt)} 남음
            </p>
          </div>

          {/* Sender */}
          {data.sender?.name && (
            <div className="bg-[#f5f5f5] dark:bg-[#181818] rounded-[8px] p-5 mb-8 flex items-center gap-4">
              <div className="w-12 h-12 rounded-[8px] bg-[#ececec] dark:bg-[#1f1f1f] flex items-center justify-center text-[#F4A259] font-black text-lg">{senderInitial}</div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] tracking-[0.18em] uppercase text-[#6a6a6a] dark:text-[#b3b3b3] font-bold">SHARED BY</p>
                <p className="text-base font-black tracking-tight">{data.sender.name}</p>
              </div>
              {data.sender?.slug && (
                <a href={`/p/${data.sender.slug}`} target="_blank" rel="noreferrer" className="text-[11px] text-[#F4A259] font-bold uppercase tracking-[0.1em] hover:opacity-70">
                  포트폴리오 →
                </a>
              )}
            </div>
          )}

          {/* 전체 다운로드 */}
          <button
            onClick={handleDownloadAll}
            disabled={downloadAllProgress !== null}
            className="w-full bg-[#F4A259] hover:brightness-110 disabled:opacity-60 text-black font-black text-base tracking-tight py-5 rounded-[8px] transition-all flex items-center justify-center gap-3 mb-8"
          >
            {downloadAllProgress ? (
              <>
                <div className="w-5 h-5 rounded-full border-2 border-black border-t-transparent animate-spin"></div>
                {downloadAllProgress.phase === 'zipping'
                  ? 'ZIP 생성 중...'
                  : `${downloadAllProgress.current + 1}/${downloadAllProgress.total} 파일 준비 중...`}
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                </svg>
                전체 다운로드 · {data.assetCount}개 파일 · {formatBytes(data.totalSize)}
              </>
            )}
          </button>

          {/* 파일 그리드 */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
            {(data.assets || []).map((a) => (
              <div key={a.id} className="bg-[#f5f5f5] dark:bg-[#181818] rounded-[8px] overflow-hidden group">
                <div className="aspect-square bg-[#ececec] dark:bg-[#0a0a0a] relative">
                  {a.isVideo ? (
                    a.videoThumbnailUrl ? (
                      <img src={a.videoThumbnailUrl} alt={a.fileName} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <svg className="w-10 h-10 text-[#F4A259]" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                      </div>
                    )
                  ) : (
                    <img src={a.thumbUrl || a.url} alt={a.fileName} className="w-full h-full object-cover" loading="lazy" />
                  )}
                  {a.isVideo && (
                    <div className="absolute top-2 right-2 bg-black/70 text-white text-[9px] px-2 py-0.5 rounded font-bold tracking-wider">VIDEO</div>
                  )}
                </div>
                <div className="p-3">
                  <p className="text-xs font-bold text-[#181818] dark:text-white truncate">{a.fileName}</p>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[10px] text-[#6a6a6a] dark:text-[#b3b3b3] font-bold">{formatBytes(a.fileSize)}</span>
                    <button
                      onClick={() => handleAssetDownload(a)}
                      className="text-[10px] text-[#F4A259] font-black uppercase tracking-[0.1em] hover:opacity-70"
                    >
                      다운로드 ↓
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 파일 목록 테이블 */}
          <div className="bg-[#f5f5f5] dark:bg-[#181818] rounded-[8px] overflow-hidden mb-8">
            <div className="px-5 py-4 border-b border-[#ececec] dark:border-[#1f1f1f] flex items-center justify-between">
              <p className="text-[11px] tracking-[0.2em] uppercase text-[#6a6a6a] dark:text-[#b3b3b3] font-bold">FILE LIST</p>
              <p className="text-[11px] tracking-[0.15em] uppercase text-[#6a6a6a] dark:text-[#b3b3b3] font-bold">{data.assetCount} FILES · {formatBytes(data.totalSize)}</p>
            </div>
            <div className="hidden md:grid grid-cols-[1fr_100px_120px_120px] gap-4 px-5 py-3 border-b border-[#ececec] dark:border-[#1f1f1f] text-[10px] tracking-[0.18em] uppercase text-[#6a6a6a] dark:text-[#b3b3b3] font-bold">
              <div>NAME</div>
              <div>TYPE</div>
              <div>SIZE</div>
              <div className="text-right">DOWNLOAD</div>
            </div>
            <div className="divide-y divide-[#ececec] dark:divide-[#1f1f1f]">
              {(data.assets || []).map((a) => (
                <div key={a.id} className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_100px_120px_120px] gap-4 px-5 py-4 items-center hover:bg-[#ececec] dark:hover:bg-[#1f1f1f] transition-colors">
                  <div className="min-w-0 flex items-center gap-3">
                    {a.isVideo ? (
                      <div className="w-9 h-9 rounded-[6px] bg-[#ececec] dark:bg-[#1f1f1f] flex items-center justify-center text-[#F4A259] flex-shrink-0">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                      </div>
                    ) : (
                      <div className="w-9 h-9 rounded-[6px] bg-[#ececec] dark:bg-[#1f1f1f] flex items-center justify-center text-[#F4A259] flex-shrink-0">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                      </div>
                    )}
                    <p className="text-sm font-bold text-[#181818] dark:text-white truncate">{a.fileName}</p>
                  </div>
                  <div className="hidden md:block text-xs text-[#6a6a6a] dark:text-[#b3b3b3] font-bold">{fileExt(a.fileName)}</div>
                  <div className="hidden md:block text-xs text-[#6a6a6a] dark:text-[#b3b3b3] font-bold">{formatBytes(a.fileSize)}</div>
                  <div className="md:text-right">
                    <button
                      onClick={() => handleAssetDownload(a)}
                      className="px-3 py-1.5 rounded-[6px] bg-[#F4A259] text-black text-[10px] font-black uppercase tracking-[0.1em] hover:brightness-110 transition-all"
                    >
                      ↓ 다운로드
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-center text-[11px] text-[#6a6a6a] dark:text-[#b3b3b3] tracking-wide">
            링크는 7일 후 자동 만료 · 다운로드 횟수 {data.downloadCount}회
          </p>

          <div className="text-center mt-12 text-[11px] text-[#6a6a6a] dark:text-[#b3b3b3] tracking-[0.15em] uppercase font-bold">
            Powered by <span className="text-[#F4A259] font-black">ASSI</span> — Create your portfolio
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="bg-[#FAFAFA] dark:bg-[#000000] min-h-screen text-[#181818] dark:text-white" style={{ fontFamily: 'Pretendard Variable, Pretendard, sans-serif' }}>

      {/* Top Nav */}
      <nav className="max-w-[1100px] mx-auto px-8 pt-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-[8px] bg-[#F4A259] flex items-center justify-center">
            <span className="text-black font-black text-base">A</span>
          </div>
          <span className="font-black text-lg tracking-tight">ASSI</span>
        </div>
        <span className="text-[11px] tracking-[0.2em] uppercase text-[#6a6a6a] dark:text-[#b3b3b3] font-bold">SECURE FILE TRANSFER</span>
      </nav>

      <main className="max-w-[680px] mx-auto px-8 py-14">

        <div className="mb-6">
          <p className="text-[11px] tracking-[0.2em] uppercase text-[#6a6a6a] dark:text-[#b3b3b3] font-bold">FILE TRANSFER</p>
          <h1 className="text-4xl font-black tracking-tight mt-1.5">무압축 파일이 도착했어요</h1>
        </div>

        {/* Sender */}
        <div className="bg-[#f5f5f5] dark:bg-[#181818] rounded-[8px] p-6 mb-4">
          <p className="text-[11px] tracking-[0.2em] uppercase text-[#6a6a6a] dark:text-[#b3b3b3] font-bold mb-3">SHARED BY</p>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-[8px] bg-[#ececec] dark:bg-[#1f1f1f] flex items-center justify-center text-[#F4A259] font-black text-lg">{senderInitial}</div>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-black tracking-tight">{data.sender?.name || '익명'}</p>
              {data.sender?.title && (
                <p className="text-sm text-[#6a6a6a] dark:text-[#b3b3b3] font-medium mt-0.5">{data.sender.title}</p>
              )}
            </div>
            {data.sender?.slug && (
              <a href={`/p/${data.sender.slug}`} target="_blank" rel="noreferrer" className="text-[11px] text-[#F4A259] font-bold uppercase tracking-[0.1em] hover:opacity-70 transition-all">
                포트폴리오 →
              </a>
            )}
          </div>
        </div>

        {/* File / Preview */}
        <div className="bg-[#f5f5f5] dark:bg-[#181818] rounded-[8px] p-6 mb-4">
          <p className="text-[11px] tracking-[0.2em] uppercase text-[#6a6a6a] dark:text-[#b3b3b3] font-bold mb-4">PREVIEW</p>

          {isVideo ? (
            <div className="aspect-video rounded-[6px] overflow-hidden bg-black mb-5">
              <iframe
                src={data.previewUrl}
                className="w-full h-full"
                allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : isImage ? (
            <div className="rounded-[6px] overflow-hidden bg-[#ececec] dark:bg-[#0a0a0a] mb-5">
              <img src={data.previewUrl} alt={data.fileName} className="w-full h-auto" />
            </div>
          ) : isVideoProcessing ? (
            <div className="aspect-video rounded-[6px] bg-[#ececec] dark:bg-[#0a0a0a] mb-5 flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-full border-4 border-[#F4A259] border-t-transparent animate-spin mb-3"></div>
              <p className="text-[11px] tracking-[0.2em] uppercase text-[#6a6a6a] dark:text-[#b3b3b3] font-bold">PREVIEW PROCESSING</p>
              <p className="text-xs text-[#6a6a6a] dark:text-[#b3b3b3] mt-1">미리보기 준비 중 · 잠시 후 새로고침</p>
            </div>
          ) : (
            <div className="aspect-video rounded-[6px] bg-[#ececec] dark:bg-[#0a0a0a] mb-5 flex items-center justify-center">
              <svg className="w-16 h-16 text-[#F4A259]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
            </div>
          )}

          <div className="mb-5">
            <p className="text-xl font-black tracking-tight leading-tight break-all">{data.fileName}</p>
            <p className="text-sm text-[#6a6a6a] dark:text-[#b3b3b3] font-medium mt-1">{data.contentType}</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-[#ececec] dark:bg-[#1f1f1f] rounded-[6px] px-4 py-3">
              <p className="text-[10px] tracking-[0.18em] uppercase text-[#6a6a6a] dark:text-[#b3b3b3] font-bold">SIZE</p>
              <p className="text-xl font-black tracking-tight mt-1">{formatBytes(data.size)}</p>
            </div>
            <div className="bg-[#ececec] dark:bg-[#1f1f1f] rounded-[6px] px-4 py-3">
              <p className="text-[10px] tracking-[0.18em] uppercase text-[#6a6a6a] dark:text-[#b3b3b3] font-bold">EXPIRES</p>
              <p className="text-xl font-black tracking-tight mt-1">{formatRelative(data.expiresAt)}</p>
            </div>
            <div className="bg-[#ececec] dark:bg-[#1f1f1f] rounded-[6px] px-4 py-3">
              <p className="text-[10px] tracking-[0.18em] uppercase text-[#6a6a6a] dark:text-[#b3b3b3] font-bold">DOWNLOADS</p>
              <p className="text-xl font-black tracking-tight mt-1">{data.downloadCount || 0}</p>
            </div>
          </div>
        </div>

        <button
          onClick={handleDownload}
          disabled={downloading}
          className="w-full bg-[#F4A259] hover:brightness-110 disabled:opacity-60 text-black font-black text-base tracking-tight py-5 rounded-[8px] transition-all flex items-center justify-center gap-3"
        >
          {downloading ? (
            <>
              <div className="w-5 h-5 rounded-full border-2 border-black border-t-transparent animate-spin"></div>
              다운로드 시작 중...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
              무압축 다운로드 · {formatBytes(data.size)}
            </>
          )}
        </button>

        <p className="mt-4 text-center text-[11px] text-[#6a6a6a] dark:text-[#b3b3b3] tracking-wide">
          링크는 7일 후 자동 만료 · Cloudflare R2 보안 전송
        </p>

        <div className="text-center mt-12 text-[11px] text-[#6a6a6a] dark:text-[#b3b3b3] tracking-[0.15em] uppercase font-bold">
          Powered by <span className="text-[#F4A259] font-black">ASSI</span> — Create your portfolio
        </div>
      </main>
    </div>
  )
}
