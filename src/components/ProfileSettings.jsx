import { useState, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '../firebase'

export default function ProfileSettings() {
  const { user, userDoc, updateUserProfile } = useAuth()
  const fileRef = useRef(null)

  const [name, setName] = useState(userDoc?.displayName || '')
  const [profession, setProfession] = useState(userDoc?.profession || '')
  const [email, setEmail] = useState(userDoc?.email || user?.email || '')
  const [phone, setPhone] = useState(userDoc?.phone || '')
  const [instagram, setInstagram] = useState(userDoc?.instagram || '')
  const [website, setWebsite] = useState(userDoc?.website || '')
  const [bio, setBio] = useState(userDoc?.bio || '')
  const [logoUrl, setLogoUrl] = useState(userDoc?.logoUrl || null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setUploading(true)
    try {
      const storageRef = ref(storage, `logos/${user.uid}/${Date.now()}_${file.name}`)
      await uploadBytes(storageRef, file)
      const url = await getDownloadURL(storageRef)
      setLogoUrl(url)
    } catch (err) {
      console.error('로고 업로드 실패:', err)
    }
    setUploading(false)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateUserProfile({
        displayName: name,
        profession,
        email,
        phone,
        instagram,
        website,
        bio,
        logoUrl,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      console.error('프로필 저장 실패:', err)
      alert('저장에 실패했습니다.')
    }
    setSaving(false)
  }

  const initial = (name || '?').charAt(0).toUpperCase()

  const PROFESSIONS = ['포토그래퍼', '영상감독', '헤어 디자이너', 'MUA (메이크업)', '스타일리스트', '아트디렉터', '모델', '기타']

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] tracking-[0.2em] uppercase text-gray-400 font-semibold">PROFILE SETTINGS</p>
          <h1 className="text-3xl font-black tracking-tighter text-gray-900">프로필 설정</h1>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className={`px-6 py-3 rounded-[14px] font-bold text-sm shadow-lg transition-all
            ${saved
              ? 'bg-emerald-500 text-white shadow-emerald-500/25'
              : 'bg-[#828DF8] text-white shadow-[#828DF8]/25 hover:bg-[#6366F1]'
            } disabled:opacity-50`}
        >
          {saving ? '저장 중...' : saved ? '저장 완료!' : '저장'}
        </button>
      </div>

      {/* 프로필 카드 + 로고 */}
      <div className="bg-white rounded-[24px] p-6 shadow-sm">
        <p className="text-[10px] tracking-[0.2em] uppercase text-gray-400 font-semibold mb-4">PROFILE & BRANDING</p>
        <div className="flex items-start gap-6">
          {/* 로고/아바타 */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              className="relative w-24 h-24 rounded-[20px] overflow-hidden bg-gradient-to-br from-[#828DF8] to-[#6366F1] flex items-center justify-center group transition-all hover:shadow-lg"
            >
              {logoUrl ? (
                <img src={logoUrl} alt="logo" className="w-full h-full object-cover" />
              ) : (
                <span className="text-white text-3xl font-black">{initial}</span>
              )}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="text-white text-xs font-bold">{uploading ? '...' : '변경'}</span>
              </div>
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            <p className="text-[10px] text-gray-400">{logoUrl ? '클릭하여 변경' : '로고 업로드'}</p>
            {logoUrl && (
              <button onClick={() => setLogoUrl(null)} className="text-[10px] text-red-400 hover:text-red-500">
                삭제
              </button>
            )}
          </div>

          {/* 기본 정보 */}
          <div className="flex-1 grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] tracking-[0.15em] uppercase text-gray-400 font-semibold mb-1 block">NAME</label>
              <input
                className="w-full px-4 py-3 bg-[#F4F3EE] rounded-[12px] text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-[#828DF8]/30"
                value={name} onChange={(e) => setName(e.target.value)} placeholder="이름"
              />
            </div>
            <div>
              <label className="text-[10px] tracking-[0.15em] uppercase text-gray-400 font-semibold mb-1 block">PROFESSION</label>
              <select
                className="w-full px-4 py-3 bg-[#F4F3EE] rounded-[12px] text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#828DF8]/30"
                value={profession} onChange={(e) => setProfession(e.target.value)}
              >
                <option value="">직군 선택</option>
                {PROFESSIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-[10px] tracking-[0.15em] uppercase text-gray-400 font-semibold mb-1 block">BIO</label>
              <textarea
                className="w-full px-4 py-3 bg-[#F4F3EE] rounded-[12px] text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#828DF8]/30 resize-none h-20"
                value={bio} onChange={(e) => setBio(e.target.value)} placeholder="간단한 소개 (PDF/웹 포트폴리오에 표시됩니다)"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 연락처 */}
      <div className="bg-white rounded-[24px] p-6 shadow-sm">
        <p className="text-[10px] tracking-[0.2em] uppercase text-gray-400 font-semibold mb-4">CONTACT INFO</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] tracking-[0.15em] uppercase text-gray-400 font-semibold mb-1 block">EMAIL</label>
            <input
              className="w-full px-4 py-3 bg-[#F4F3EE] rounded-[12px] text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#828DF8]/30"
              value={email} onChange={(e) => setEmail(e.target.value)} placeholder="이메일"
            />
          </div>
          <div>
            <label className="text-[10px] tracking-[0.15em] uppercase text-gray-400 font-semibold mb-1 block">PHONE</label>
            <input
              className="w-full px-4 py-3 bg-[#F4F3EE] rounded-[12px] text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#828DF8]/30"
              value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010-0000-0000"
            />
          </div>
          <div>
            <label className="text-[10px] tracking-[0.15em] uppercase text-gray-400 font-semibold mb-1 block">INSTAGRAM</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-400">@</span>
              <input
                className="w-full pl-8 pr-4 py-3 bg-[#F4F3EE] rounded-[12px] text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#828DF8]/30"
                value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="username"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] tracking-[0.15em] uppercase text-gray-400 font-semibold mb-1 block">WEBSITE</label>
            <input
              className="w-full px-4 py-3 bg-[#F4F3EE] rounded-[12px] text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#828DF8]/30"
              value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://"
            />
          </div>
        </div>
      </div>

      {/* PDF 미리보기 */}
      <div className="bg-white rounded-[24px] p-6 shadow-sm">
        <p className="text-[10px] tracking-[0.2em] uppercase text-gray-400 font-semibold mb-4">PDF PORTFOLIO PREVIEW</p>
        <p className="text-xs text-gray-400 mb-4">이 정보가 PDF 포트폴리오 커버에 자동 반영됩니다.</p>
        <div className="bg-[#F4F3EE] rounded-[16px] p-8 text-center">
          {logoUrl ? (
            <img src={logoUrl} alt="logo" className="w-16 h-16 rounded-[12px] object-cover mx-auto mb-3" />
          ) : (
            <div className="w-16 h-16 rounded-[12px] bg-gradient-to-br from-[#828DF8] to-[#6366F1] mx-auto mb-3 flex items-center justify-center">
              <span className="text-white text-2xl font-black">{initial}</span>
            </div>
          )}
          <p className="text-lg font-black tracking-tighter text-gray-900">{name || 'PORTFOLIO'}</p>
          <p className="text-[10px] tracking-[0.2em] uppercase text-[#828DF8] mt-1">{profession || 'CREATIVE'}</p>
          {bio && <p className="text-xs text-gray-500 mt-2 max-w-xs mx-auto">{bio}</p>}
          <p className="text-[10px] text-gray-400 mt-3">{email}{phone ? ` | ${phone}` : ''}</p>
          {instagram && <p className="text-[10px] text-gray-400">@{instagram}</p>}
        </div>
      </div>
    </div>
  )
}
