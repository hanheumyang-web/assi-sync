import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signInWithCredential, GoogleAuthProvider } from 'firebase/auth'
import { auth } from '../firebase'

/**
 * Android 전용 Google OAuth 콜백 페이지
 * Google에서 리다이렉트된 후 id_token을 추출하여 Firebase에 로그인
 */
export default function GoogleAuthCallback() {
  const navigate = useNavigate()
  const [error, setError] = useState(null)

  useEffect(() => {
    const processCallback = async () => {
      try {
        // URL hash fragment에서 id_token 추출
        const hash = window.location.hash.substring(1)
        const params = new URLSearchParams(hash)
        const idToken = params.get('id_token')
        const storedNonce = sessionStorage.getItem('google_auth_nonce')

        if (!idToken) {
          throw new Error('id_token을 찾을 수 없습니다')
        }

        // nonce 정리
        sessionStorage.removeItem('google_auth_nonce')
        sessionStorage.removeItem('google_auth_state')

        // Firebase에 로그인
        const credential = GoogleAuthProvider.credential(idToken)
        await signInWithCredential(auth, credential)

        // 메인 페이지로 이동
        navigate('/', { replace: true })
      } catch (err) {
        console.error('Google Auth Callback 오류:', err)
        setError(err.message)
        // 3초 후 메인으로 복귀
        setTimeout(() => navigate('/', { replace: true }), 3000)
      }
    }

    processCallback()
  }, [navigate])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA] px-6">
        <div className="text-center">
          <p className="text-red-500 text-sm mb-2">로그인 처리 중 오류가 발생했습니다</p>
          <p className="text-gray-400 text-xs">{error}</p>
          <p className="text-gray-400 text-xs mt-2">잠시 후 메인 페이지로 이동합니다...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]">
      <div className="text-center">
        <div className="w-10 h-10 border-3 border-[#F4A259] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-500 text-sm">로그인 처리 중...</p>
      </div>
    </div>
  )
}
