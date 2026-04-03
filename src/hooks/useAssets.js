import { useState, useEffect } from 'react'
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, updateDoc, increment } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { db, storage } from '../firebase'
import { useAuth } from '../contexts/AuthContext'

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
      for (const file of files) {
        const isVideo = file.type.startsWith('video/')
        const storagePath = `users/${user.uid}/projects/${projectId}/${Date.now()}_${file.name}`
        const storageRef = ref(storage, storagePath)

        await uploadBytes(storageRef, file)
        const url = await getDownloadURL(storageRef)

        await addDoc(collection(db, 'assets'), {
          uid: user.uid,
          projectId,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
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
        // 첫 이미지를 썸네일로 자동 설정
        if (!isVideo && completed === 0) {
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
