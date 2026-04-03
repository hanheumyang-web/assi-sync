import { useState, useEffect } from 'react'
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'

export function useProjects() {
  const { user } = useAuth()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setProjects([])
      setLoading(false)
      return
    }

    const q = query(
      collection(db, 'projects'),
      where('uid', '==', user.uid)
    )

    const unsub = onSnapshot(q, async (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }))

      // 자동 엠바고 업로드 전환: 날짜가 지난 active 엠바고를 released로 변경
      const now = new Date().toISOString().slice(0, 10)
      for (const p of data) {
        if (p.embargoStatus === 'active' && p.embargoDate && p.embargoDate <= now) {
          const ref = doc(db, 'projects', p.id)
          await updateDoc(ref, { embargoStatus: 'released', updatedAt: new Date().toISOString() })
          p.embargoStatus = 'released'
        }
      }

      data.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      setProjects(data)
      setLoading(false)
    })

    return unsub
  }, [user])

  const addProject = async (projectData) => {
    if (!user) return
    const newProject = {
      uid: user.uid,
      name: projectData.name,
      client: projectData.client || '',
      category: projectData.category || '화보',
      shootDate: projectData.shootDate || null,
      embargoDate: projectData.embargoDate || null,
      embargoStatus: projectData.embargoDate ? 'active' : 'none',
      imageCount: 0,
      videoCount: 0,
      thumbnailUrl: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const ref = await addDoc(collection(db, 'projects'), newProject)
    return ref.id
  }

  const updateProject = async (projectId, updates) => {
    const ref = doc(db, 'projects', projectId)
    await updateDoc(ref, { ...updates, updatedAt: new Date().toISOString() })
  }

  const deleteProject = async (projectId) => {
    const ref = doc(db, 'projects', projectId)
    await deleteDoc(ref)
  }

  // 통계
  const stats = {
    totalProjects: projects.length,
    totalImages: projects.reduce((sum, p) => sum + (p.imageCount || 0), 0),
    activeEmbargoes: projects.filter((p) => p.embargoStatus === 'active').length,
    releasedEmbargoes: projects.filter((p) => p.embargoStatus === 'released').length,
  }

  return { projects, loading, stats, addProject, updateProject, deleteProject }
}
