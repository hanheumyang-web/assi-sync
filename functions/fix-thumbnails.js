/**
 * 기존 Bunny 영상 썸네일을 Firebase Storage로 마이그레이션 (1회 실행)
 *
 * 실행: cd functions && node fix-thumbnails.js
 */
const admin = require('firebase-admin')

admin.initializeApp({
  storageBucket: 'assi-app-6ea04.firebasestorage.app',
})

const db = admin.firestore()
const bucket = admin.storage().bucket()

const BUNNY_API_KEY = process.env.BUNNY_API_KEY || ''
const BUNNY_LIBRARY_ID = '631122'
const BUNNY_API_BASE = 'https://video.bunnycdn.com/library'

async function fixThumbnails() {
  // Bunny 영상 asset 전부 가져오기
  const snap = await db.collection('assets')
    .where('videoHost', '==', 'bunny')
    .get()

  console.log(`Bunny 영상 ${snap.size}개 발견`)

  for (const doc of snap.docs) {
    const data = doc.data()
    const videoId = data.bunnyVideoId
    if (!videoId) continue

    // 이미 Storage 썸네일이 있으면 스킵
    if (data.videoThumbnailUrl?.includes('storage.googleapis.com')) {
      console.log(`[스킵] ${videoId} - 이미 Storage 썸네일 있음`)
      continue
    }

    console.log(`[처리] ${videoId} (${data.fileName})`)

    try {
      // 1. Bunny API에서 비디오 정보
      const infoRes = await fetch(
        `${BUNNY_API_BASE}/${BUNNY_LIBRARY_ID}/videos/${videoId}`,
        { headers: { 'AccessKey': BUNNY_API_KEY } }
      )
      const info = await infoRes.json()
      const thumbFileName = info.thumbnailFileName || 'thumbnail.jpg'
      console.log(`  status=${info.status}, thumbFile=${thumbFileName}, thumbCount=${info.thumbnailCount}`)

      if (info.status !== 4) {
        console.log(`  [스킵] 인코딩 미완료 (status=${info.status})`)
        continue
      }

      // 2. Bunny API 경유 썸네일 다운로드
      const thumbUrl = `${BUNNY_API_BASE}/${BUNNY_LIBRARY_ID}/videos/${videoId}/thumbnail?thumbnailFileName=${thumbFileName}`
      const thumbRes = await fetch(thumbUrl, {
        headers: { 'AccessKey': BUNNY_API_KEY },
      })

      if (!thumbRes.ok) {
        console.log(`  [실패] 썸네일 다운로드 실패: ${thumbRes.status}`)
        continue
      }

      const thumbBuffer = Buffer.from(await thumbRes.arrayBuffer())
      console.log(`  썸네일 다운로드: ${(thumbBuffer.length / 1024).toFixed(1)}KB`)

      // 3. Firebase Storage에 저장
      const storagePath = `thumbnails/${data.uid}/${data.projectId}/${videoId}.jpg`
      const file = bucket.file(storagePath)
      await file.save(thumbBuffer, {
        metadata: { contentType: 'image/jpeg', contentDisposition: 'inline' },
      })
      await file.makePublic()
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`

      // 4. Asset 문서 업데이트
      await doc.ref.update({ videoThumbnailUrl: publicUrl })
      console.log(`  ✓ ${publicUrl}`)

      // 5. 프로젝트 썸네일도 업데이트
      if (data.projectId) {
        const projRef = db.collection('projects').doc(data.projectId)
        const projDoc = await projRef.get()
        if (projDoc.exists) {
          const projData = projDoc.data()
          if (!projData.thumbnailUrl || projData.thumbnailUrl.includes('b-cdn.net')) {
            await projRef.update({ thumbnailUrl: publicUrl })
            console.log(`  ✓ 프로젝트 썸네일도 업데이트`)
          }
        }
      }

    } catch (err) {
      console.error(`  [에러] ${err.message}`)
    }
  }

  console.log('\n완료!')
  process.exit(0)
}

fixThumbnails()
