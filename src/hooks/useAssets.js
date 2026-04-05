import { useState, useEffect } from 'react'
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, updateDoc, increment } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL, deleteObject, updateMetadata } from 'firebase/storage'
import { db, storage } from '../firebase'
import { useAuth } from '../contexts/AuthContext'

// 확장자 → content type 매핑
const CONTENT_TYPE_MAP = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', bmp: 'image/bmp',
  tif: 'image/tiff', tiff: 'image/tiff', avif: 'image/avif', svg: 'image/svg+xml',
  mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo', mkv: 'video/x-matroska',
  webm: 'video/webm', m4v: 'video/x-m4v', wmv: 'video/x-ms-wmv', flv: 'video/x-flv',
}

export function guessContentType(fileName) {
  const ext = fileName?.split('.').pop()?.toLowerCase()
  return CONTENT_TYPE_MAP[ext] || 'application/octet-stream'
}

// Firebase Storage 메타데이터 강제 수정 (항상 확장자 기반으로 덮어쓰기)
export async function fixAssetContentType(asset) {
  if (!asset.storagePath) return
  const correctType = guessContentType(asset.fileName)
  if (correctType === 'application/octet-stream') return
  try {
    const storageRef = ref(storage, asset.storagePath)
    await updateMetadata(storageRef, { contentType: correctType, contentDisposition: 'inline' })
    // Firestore 문서도 업데이트
    if (asset.id) {
      await updateDoc(doc(db, 'assets', asset.id), {
        fileType: correctType,
        isVideo: correctType.startsWith('video/'),
      })
    }
    console.log(`[fixMeta] ${asset.fileName} → ${correctType}`)
  } catch (e) {
    console.warn('[fixMeta] 실패:', asset.fileName, e)
  }
}

// 이미지 업로드 시 자동 압축 (Instagram 8MB 제한 + 웹 최적화)
const MAX_IMAGE_DIM = 2048
const MAX_IMAGE_SIZE = 7 * 1024 * 1024 // 7MB
export function compressImage(file) {
  return new Promise((resolve) => {
    // 비디오는 압축 안 함
    if (!file.type?.startsWith('image/') && !guessContentType(file.name).startsWith('image/')) {
      resolve(file)
      return
    }
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      // 이미 작으면 압축 불필요
      if (file.size <= MAX_IMAGE_SIZE && img.width <= MAX_IMAGE_DIM && img.height <= MAX_IMAGE_DIM) {
        resolve(file)
        return
      }
      const canvas = document.createElement('canvas')
      let w = img.width, h = img.height
      if (w > MAX_IMAGE_DIM || h > MAX_IMAGE_DIM) {
        const scale = MAX_IMAGE_DIM / Math.max(w, h)
        w = Math.round(w * scale)
        h = Math.round(h * scale)
      }
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, w, h)
      canvas.toBlob((blob) => {
        const compressed = new File([blob], file.name, { type: 'image/jpeg' })
        console.log(`[압축] ${file.name}: ${(file.size/1024/1024).toFixed(1)}MB → ${(compressed.size/1024/1024).toFixed(1)}MB (${w}x${h})`)
        resolve(compressed)
      }, 'image/jpeg', 0.92)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(file) // 실패 시 원본 사용
    }
    img.src = url
  })
}

export function useAssets(projectId) {
  const { user } = useAuth()
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  useEffect(() => {
    if (!user || !projectId) {
      setAssets([])
      setLoading(false)
      return
    }

    const q = query(
      collection(db, 'assets'),
      where('projectId', '==', projectId)
    )

    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      data.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      setAssets(data)
      setLoading(false)
    })

    return unsub
  }, [user, projectId])

  const uploadFiles = async (files) => {
    if (!user || !projectId) return
    setUploading(true)
    setUploadProgress(0)

    const total = files.length
    let completed = 0

    try {
      for (let file of files) {
        // 이미지 자동 압축 (7MB 초과 or 2048px 초과)
        file = await compressImage(file)
        const contentType = file.type || guessContentType(file.name)
        const isVideo = contentType.startsWith('video/')
        const storagePath = `users/${user.uid}/projects/${projectId}/${Date.now()}_${file.name}`
        const storageRef = ref(storage, storagePath)

        await uploadBytes(storageRef, file, { contentType, contentDisposition: 'inline' })
        const url = await getDownloadURL(storageRef)

        await addDoc(collection(db, 'assets'), {
          uid: user.uid,
          projectId,
          fileName: file.name,
          fileSize: file.size,
          fileType: contentType,
          isVideo,
          url,
          storagePath,
          createdAt: new Date().toISOString(),
        })

        const projectRef = doc(db, 'projects', projectId)
        const updates = {
          [isVideo ? 'videoCount' : 'imageCount']: increment(1),
          updatedAt: new Date().toISOString(),
        }
        // 첫 파일을 썸네일로 자동 설정 (이미지/영상 모두)
        if (completed === 0) {
          updates.thumbnailUrl = url
        }
        await updateDoc(projectRef, updates)

        completed++
        setUploadProgress(Math.round((completed / total) * 100))
      }
    } catch (err) {
      console.error('업로드 실패:', err)
      alert('업로드에 실패했습니다: ' + err.message)
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  const deleteAsset = async (asset) => {
    // Storage에서 파일 삭제
    const storageRef = ref(storage, asset.storagePath)
    try {
      await deleteObject(storageRef)
    } catch (e) {
      console.warn('Storage 파일 삭제 실패:', e)
    }

    // Firestore에서 문서 삭제
    await deleteDoc(doc(db, 'assets', asset.id))

    // 프로젝트 카운트 감소
    const projectRef = doc(db, 'projects', asset.projectId)
    await updateDoc(projectRef, {
      [asset.isVideo ? 'videoCount' : 'imageCount']: increment(-1),
      updatedAt: new Date().toISOString(),
    })
  }

  return { assets, loading, uploading, uploadProgress, uploadFiles, deleteAsset }
}
