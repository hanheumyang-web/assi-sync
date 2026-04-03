import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

export default function LoginScreen() {
  const { loginWithGoogle } = useAuth()
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleGoogle = async () => {
    setLoading(true)
    setError(null)
    try {
      await loginWithGoogle()
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError('로그인에 실패했습니다. 다시 시도해주세요.')
      }
    }
    setLoading(false)
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#F4F3EE] px-6">
      <div className="bg-white rounded-[32px] shadow-2xl p-12 max-w-lg w-full text-center">
        {/* 로고 */}
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#828DF8] to-[#6366F1] mx-auto mb-6 flex items-center justify-center">
          <span className="text-white text-3xl font-black">A</span>
        </div>
        <p className="text-[11px] tracking-[0.25em] uppercase text-[#828DF8] font-bold mb-2">WELCOME TO</p>
        <h1 className="text-5xl font-black tracking-tighter text-gray-900 mb-2">ASSI</h1>
        <p className="text-gray-400 text-sm mb-8">크리에이티브 스태프를 위한 포트폴리오 관리</p>

        {/* Google 로그인 */}
        <button
          onClick={handleGoogle}
          disabled={loading}
          className="w-full py-4 bg-white border-2 border-gray-200 rounded-[16px] font-bold text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          {loading ? '로그인 중...' : 'Google로 시작하기'}
        </button>

        {/* 카카오 (추후) */}
        <button
          disabled
          className="w-full mt-3 py-4 bg-[#FEE500] rounded-[16px] font-bold text-sm text-[#3C1E1E] flex items-center justify-center gap-3 opacity-50 cursor-not-allowed"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#3C1E1E">
            <path d="M12 3C6.48 3 2 6.36 2 10.5c0 2.67 1.76 5.02 4.4 6.36-.14.52-.9 3.34-.93 3.55 0 0-.02.17.09.23.11.07.24.02.24.02.31-.04 3.65-2.4 4.22-2.81.63.09 1.29.14 1.97.14 5.52 0 10-3.36 10-7.5S17.52 3 12 3z"/>
          </svg>
          카카오로 시작하기 (준비 중)
        </button>

        {error && (
          <p className="mt-4 text-red-500 text-xs">{error}</p>
        )}

        <p className="text-[11px] text-gray-400 mt-6">
          로그인 시 <span className="text-[#828DF8] cursor-pointer">이용약관</span> 및 <span className="text-[#828DF8] cursor-pointer">개인정보처리방침</span>에 동의합니다
        </p>
      </div>
    </div>
  )
}
