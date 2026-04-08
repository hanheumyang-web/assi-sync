import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'

export default function InstagramCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState('연결 중...')
  const [error, setError] = useState(null)

  useEffect(() => {
    const code = searchParams.get('code')
    if (!code) {
      const err = searchParams.get('error_description') || searchParams.get('error') || '인증 코드가 없습니다'
      setError(err)
      return
    }

    const exchange = async () => {
      try {
        setStatus('토큰 교환 중...')
        const res = await fetch('/api/instagram-auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        })
        const data = await res.json()
        if (data.error) throw new Error(data.error)

        // Save to localStorage
        localStorage.setItem('assi_ig_token', data.access_token)
        localStorage.setItem('assi_ig_user_id', data.user_id)
        localStorage.setItem('assi_ig_username', data.username)

        setStatus(`@${data.username} 연결 완료!`)

        // Redirect to app after 1.5s
        setTimeout(() => {
          window.location.href = '/?ig_connected=1'
        }, 1500)
      } catch (err) {
        console.error('[IG Callback]', err)
        setError(err.message)
      }
    }

    exchange()
  }, [searchParams])

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center px-6"
      style={{ fontFamily: 'Pretendard, -apple-system, sans-serif' }}>
      <div className="bg-white rounded-[32px] shadow-2xl p-10 max-w-sm w-full text-center">
        {/* Instagram gradient icon */}
        <div className="w-16 h-16 rounded-[18px] bg-gradient-to-br from-[#833AB4] via-[#E1306C] to-[#FCAF45] mx-auto mb-6 flex items-center justify-center">
          <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="2" width="20" height="20" rx="5" stroke="currentColor" strokeWidth="2"/>
            <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="2"/>
            <circle cx="18" cy="6" r="1.5" fill="currentColor"/>
          </svg>
        </div>

        {error ? (
          <>
            <h2 className="text-xl font-black text-gray-900 tracking-tight mb-2">연결 실패</h2>
            <p className="text-sm text-red-500 mb-6">{error}</p>
            <button onClick={() => window.location.href = '/'}
              className="px-6 py-3 bg-gray-900 text-white text-sm font-bold rounded-[16px]">
              돌아가기
            </button>
          </>
        ) : (
          <>
            <h2 className="text-xl font-black text-gray-900 tracking-tight mb-2">Instagram</h2>
            <p className="text-sm text-gray-500">{status}</p>
            {status.includes('연결 중') && (
              <div className="mt-6 w-8 h-8 border-3 border-[#F4A259] border-t-transparent rounded-full animate-spin mx-auto" />
            )}
          </>
        )}
      </div>
    </div>
  )
}
