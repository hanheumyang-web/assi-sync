const functions = require('firebase-functions')
const admin = require('firebase-admin')
const sharp = require('sharp')

admin.initializeApp()
const db = admin.firestore()
const bucket = admin.storage().bucket()

// ─── Bunny Stream 설정 (.env 파일에서 로드) ───
const BUNNY_API_KEY = process.env.BUNNY_API_KEY || ''
const BUNNY_LIBRARY_ID = process.env.BUNNY_LIBRARY_ID || ''
const BUNNY_API_BASE = 'https://video.bunnycdn.com/library'

// ─── 썸네일 사이즈 ───
const THUMB_WIDTH = 400
const THUMB_QUALITY = 75

/**
 * Storage 트리거: 이미지 파일 업로드 감지 → 작은 썸네일 자동 생성
 *
 * 원본: users/{uid}/projects/{projectId}/{fileName}
 * 썸네일: thumbs/{uid}/{projectId}/{fileName}  (400px, JPEG 75%)
 */
exports.onImageUpload = functions
  .region('asia-northeast3')
  .runWith({ timeoutSeconds: 120, memory: '512MB' })
  .storage.object().onFinalize(async (object) => {
    const { name: filePath, contentType } = object

    // 이미지만 처리 (영상, 썸네일 폴더 제외)
    if (!contentType || !contentType.startsWith('image/')) return null
    if (filePath.startsWith('thumbs/') || filePath.startsWith('thumbnails/') || filePath.startsWith('ig-temp/')) return null

    // 경로에서 uid, projectId 추출
    const parts = filePath.split('/')
    if (parts.length < 5 || parts[0] !== 'users' || parts[2] !== 'projects') return null
    const uid = parts[1]
    const projectId = parts[3]
    const fileName = parts.slice(4).join('/')

    const thumbPath = `thumbs/${uid}/${projectId}/${fileName}`

    // 이미 썸네일 있으면 스킵
    const [thumbExists] = await bucket.file(thumbPath).exists()
    if (thumbExists) return null

    try {
      // 원본 다운로드
      const file = bucket.file(filePath)
      const [buffer] = await file.download()

      // sharp로 리사이즈
      const thumbBuffer = await sharp(buffer)
        .resize(THUMB_WIDTH, null, { withoutEnlargement: true })
        .jpeg({ quality: THUMB_QUALITY })
        .toBuffer()

      // 썸네일 업로드
      const thumbFile = bucket.file(thumbPath)
      await thumbFile.save(thumbBuffer, {
        metadata: { contentType: 'image/jpeg', contentDisposition: 'inline' },
      })
      await thumbFile.makePublic()

      const thumbUrl = `https://storage.googleapis.com/${bucket.name}/${thumbPath}`

      // Firestore asset 문서 업데이트
      const assetsSnap = await db.collection('assets')
        .where('storagePath', '==', filePath)
        .limit(1)
        .get()

      if (!assetsSnap.empty) {
        await assetsSnap.docs[0].ref.update({ thumbUrl })
      }

      console.log(`[Thumb] ${fileName}: ${(buffer.length/1024).toFixed(0)}KB → ${(thumbBuffer.length/1024).toFixed(0)}KB`)
    } catch (err) {
      console.error('[Thumb] 실패:', filePath, err.message)
    }
    return null
  })

/**
 * Storage 트리거: 영상 파일 업로드 감지 → Bunny Stream 업로드
 *
 * 트리거 경로: users/{uid}/projects/{projectId}/{fileName}
 * 영상 파일(video/*)만 처리
 */
exports.onVideoUpload = functions
  .region('asia-northeast3') // 서울 리전
  .runWith({ timeoutSeconds: 540, memory: '1GB' }) // 영상 처리용 리소스
  .storage.object().onFinalize(async (object) => {
    const { name: filePath, contentType, size } = object

    // 영상 파일만 처리
    if (!contentType || !contentType.startsWith('video/')) {
      console.log('영상 아님, 스킵:', filePath, contentType)
      return null
    }

    // ig-temp 임시 파일 스킵
    if (filePath.startsWith('ig-temp/')) {
      console.log('IG 임시 파일 스킵:', filePath)
      return null
    }

    // Bunny 설정 확인
    if (!BUNNY_API_KEY || !BUNNY_LIBRARY_ID) {
      console.error('Bunny Stream 설정 없음. firebase functions:config:set 필요')
      return null
    }

    console.log(`[Bunny] 영상 감지: ${filePath} (${contentType}, ${(size / 1024 / 1024).toFixed(1)}MB)`)

    // 경로에서 uid, projectId 추출
    // 예: users/abc123/projects/proj456/video.mp4
    const parts = filePath.split('/')
    const uid = parts[1]
    const projectId = parts[3]
    const fileName = parts[parts.length - 1]

    if (!uid || !projectId) {
      console.log('경로에서 uid/projectId 추출 실패:', filePath)
      return null
    }

    // Firestore에서 asset 문서 찾기 (storagePath로 정확 매칭)
    const assetsSnap = await db.collection('assets')
      .where('storagePath', '==', filePath)
      .limit(1)
      .get()

    if (assetsSnap.empty) {
      console.log('Asset 문서 없음, 스킵:', filePath)
      return null
    }

    const assetDoc = assetsSnap.docs[0]
    const assetData = assetDoc.data()

    // 이미 Bunny에 업로드된 경우 스킵
    if (assetData.videoHost === 'bunny' && assetData.bunnyVideoId) {
      console.log('이미 Bunny 업로드됨, 스킵:', assetData.bunnyVideoId)
      return null
    }

    try {
      // 1. Bunny Stream에 비디오 메타 생성
      console.log('[Bunny] 비디오 생성 중...')
      const createRes = await fetch(`${BUNNY_API_BASE}/${BUNNY_LIBRARY_ID}/videos`, {
        method: 'POST',
        headers: {
          'AccessKey': BUNNY_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: `${projectId}_${fileName}`,
        }),
      })
      const videoMeta = await createRes.json()
      const bunnyVideoId = videoMeta.guid

      if (!bunnyVideoId) {
        throw new Error('Bunny 비디오 생성 실패: ' + JSON.stringify(videoMeta))
      }
      console.log('[Bunny] 비디오 생성됨:', bunnyVideoId)

      // 2. Storage에서 영상 다운로드
      console.log('[Bunny] Storage에서 다운로드 중...')
      const file = bucket.file(filePath)
      const [fileBuffer] = await file.download()
      console.log(`[Bunny] 다운로드 완료: ${(fileBuffer.length / 1024 / 1024).toFixed(1)}MB`)

      // 3. Bunny Stream에 업로드
      console.log('[Bunny] 업로드 중...')
      const uploadRes = await fetch(
        `${BUNNY_API_BASE}/${BUNNY_LIBRARY_ID}/videos/${bunnyVideoId}`,
        {
          method: 'PUT',
          headers: {
            'AccessKey': BUNNY_API_KEY,
            'Content-Type': 'application/octet-stream',
          },
          body: fileBuffer,
        }
      )

      if (!uploadRes.ok) {
        const errText = await uploadRes.text()
        throw new Error(`Bunny 업로드 실패 (${uploadRes.status}): ${errText}`)
      }
      console.log('[Bunny] 업로드 완료!')

      // 4. 임베드 URL 생성 (썸네일은 인코딩 완료 후 webhook에서 저장)
      const embedUrl = `https://iframe.mediadelivery.net/embed/${BUNNY_LIBRARY_ID}/${bunnyVideoId}`

      // 5. Firestore asset 문서 업데이트
      await assetDoc.ref.update({
        videoHost: 'bunny',
        bunnyVideoId: bunnyVideoId,
        embedUrl: embedUrl,
        bunnyStatus: 'processing',
        bunnyUploadedAt: new Date().toISOString(),
      })
      console.log('[Bunny] Firestore 업데이트 완료:', embedUrl)

      // 6. Storage 원본 유지 (인스타 업로드에 필요)
      // 인스타 업로드 시 Storage URL을 직접 사용하므로 원본 삭제하지 않음
      // 인스타 업로드 완료 후 클라이언트에서 igUploaded: true 플래그 설정
      // → cleanupVideos 함수가 주기적으로 삭제 처리
      console.log('[Bunny] Storage 원본 유지 (인스타 업로드 대기):', filePath)

      return { success: true, bunnyVideoId, embedUrl }

    } catch (err) {
      console.error('[Bunny] 업로드 실패:', err)

      // 실패 시 asset에 에러 기록
      await assetDoc.ref.update({
        videoHost: 'bunny',
        bunnyStatus: 'error',
        bunnyError: err.message,
      })

      return { success: false, error: err.message }
    }
  })

/**
 * Bunny 인코딩 완료 웹훅 (Bunny Stream → ASSI)
 * Bunny Dashboard에서 Webhook URL 설정: https://<region>-<project>.cloudfunctions.net/bunnyWebhook
 */
exports.bunnyWebhook = functions
  .region('asia-northeast3')
  .https.onRequest(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed')
      return
    }

    const { VideoGuid, Status } = req.body || {}
    console.log('[Bunny Webhook]', VideoGuid, 'Status:', Status)

    if (!VideoGuid) {
      res.status(400).send('Missing VideoGuid')
      return
    }

    // Firestore에서 해당 asset 찾기
    const snap = await db.collection('assets')
      .where('bunnyVideoId', '==', VideoGuid)
      .limit(1)
      .get()

    if (snap.empty) {
      console.log('[Bunny Webhook] Asset 없음:', VideoGuid)
      res.status(404).send('Asset not found')
      return
    }

    const assetDoc = snap.docs[0]

    // Status: 3=Processing, 4=Finished, 5=Error
    if (Status === 4) {
      const assetData = assetDoc.data()
      let videoThumbnailUrl = assetData.videoThumbnailUrl || ''

      // Bunny API로 썸네일 다운로드 → Firebase Storage에 저장
      try {
        const thumbCdnUrl = `https://vz-cd1dda72-832.b-cdn.net/${VideoGuid}/thumbnail.jpg`
        console.log('[Bunny Webhook] 썸네일 다운로드 시도:', thumbCdnUrl)

        // Bunny API에서 비디오 정보 가져오기 (thumbnailFileName 확인)
        const videoInfoRes = await fetch(
          `${BUNNY_API_BASE}/${BUNNY_LIBRARY_ID}/videos/${VideoGuid}`,
          { headers: { 'AccessKey': BUNNY_API_KEY } }
        )
        const videoInfo = await videoInfoRes.json()
        const thumbFileName = videoInfo.thumbnailFileName || 'thumbnail.jpg'

        // Bunny CDN에서 썸네일 다운로드 (Referer 필수 — Hotlink Protection)
        const thumbUrl = `https://vz-cd1dda72-832.b-cdn.net/${VideoGuid}/${thumbFileName}`
        const thumbRes = await fetch(thumbUrl, {
          headers: { 'Referer': 'https://assi-portfolio.vercel.app' },
        })

        if (thumbRes.ok) {
          const thumbBuffer = Buffer.from(await thumbRes.arrayBuffer())
          console.log(`[Bunny Webhook] 썸네일 다운로드 완료: ${(thumbBuffer.length / 1024).toFixed(1)}KB`)

          // Firebase Storage에 저장
          const storagePath = `thumbnails/${assetData.uid}/${assetData.projectId}/${VideoGuid}.jpg`
          const file = bucket.file(storagePath)
          await file.save(thumbBuffer, {
            metadata: { contentType: 'image/jpeg', contentDisposition: 'inline' },
          })
          await file.makePublic()
          videoThumbnailUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`
          console.log('[Bunny Webhook] 썸네일 Storage 저장:', videoThumbnailUrl)
        } else {
          console.warn('[Bunny Webhook] 썸네일 다운로드 실패:', thumbRes.status)
        }
      } catch (thumbErr) {
        console.error('[Bunny Webhook] 썸네일 처리 실패:', thumbErr)
      }

      const updateData = {
        bunnyStatus: 'ready',
        bunnyEncodedAt: new Date().toISOString(),
      }
      if (videoThumbnailUrl) {
        updateData.videoThumbnailUrl = videoThumbnailUrl
      }
      await assetDoc.ref.update(updateData)

      // 프로젝트 썸네일도 업데이트 (영상 프로젝트 대표 이미지)
      if (videoThumbnailUrl && assetData.projectId) {
        try {
          const projectRef = db.collection('projects').doc(assetData.projectId)
          const projectDoc = await projectRef.get()
          if (projectDoc.exists) {
            const projectData = projectDoc.data()
            // 프로젝트 썸네일이 없거나 기존 Bunny CDN URL이면 교체
            if (!projectData.thumbnailUrl || projectData.thumbnailUrl.includes('b-cdn.net')) {
              await projectRef.update({ thumbnailUrl: videoThumbnailUrl })
              console.log('[Bunny Webhook] 프로젝트 썸네일 업데이트:', assetData.projectId)
            }
          }
        } catch (projErr) {
          console.error('[Bunny Webhook] 프로젝트 썸네일 업데이트 실패:', projErr)
        }
      }

      console.log('[Bunny Webhook] 인코딩 완료:', VideoGuid)
    } else if (Status === 5) {
      await assetDoc.ref.update({
        bunnyStatus: 'error',
        bunnyError: 'Encoding failed',
      })
      console.log('[Bunny Webhook] 인코딩 실패:', VideoGuid)
    }

    res.status(200).send('OK')
  })

/**
 * 영상 삭제 시 Bunny에서도 삭제
 */
exports.onAssetDelete = functions
  .region('asia-northeast3')
  .firestore.document('assets/{assetId}')
  .onDelete(async (snap) => {
    const data = snap.data()
    if (data.videoHost !== 'bunny' || !data.bunnyVideoId) return

    try {
      console.log('[Bunny] 영상 삭제:', data.bunnyVideoId)
      await fetch(
        `${BUNNY_API_BASE}/${BUNNY_LIBRARY_ID}/videos/${data.bunnyVideoId}`,
        {
          method: 'DELETE',
          headers: { 'AccessKey': BUNNY_API_KEY },
        }
      )
      console.log('[Bunny] 삭제 완료')
    } catch (err) {
      console.error('[Bunny] 삭제 실패:', err)
    }
  })

/**
 * 기존 이미지 에셋에 썸네일 생성 (1회용)
 * 호출: GET https://asia-northeast3-assi-app-6ea04.cloudfunctions.net/generateThumbs
 */
exports.generateThumbs = functions
  .region('asia-northeast3')
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .https.onRequest(async (req, res) => {
    const batchSize = parseInt(req.query.batch) || 10
    const snap = await db.collection('assets')
      .where('isVideo', '==', false)
      .get()

    // thumbUrl 없는 것만 필터
    const pending = snap.docs.filter(d => {
      const data = d.data()
      return data.storagePath && !data.thumbUrl
    }).slice(0, batchSize)

    const results = []
    for (const assetDoc of pending) {
      const data = assetDoc.data()

      try {
        const parts = data.storagePath.split('/')
        const uid = parts[1]
        const projectId = parts[3]
        const fileName = parts.slice(4).join('/')
        const thumbPath = `thumbs/${uid}/${projectId}/${fileName}`

        const file = bucket.file(data.storagePath)
        const [exists] = await file.exists()
        if (!exists) { results.push({ id: assetDoc.id, status: 'no-file' }); continue }

        const [buffer] = await file.download()
        const thumbBuffer = await sharp(buffer, { failOn: 'none' })
          .resize(THUMB_WIDTH, null, { withoutEnlargement: true })
          .jpeg({ quality: THUMB_QUALITY })
          .toBuffer()

        const thumbFile = bucket.file(thumbPath)
        await thumbFile.save(thumbBuffer, {
          metadata: { contentType: 'image/jpeg', contentDisposition: 'inline' },
        })
        await thumbFile.makePublic()
        const thumbUrl = `https://storage.googleapis.com/${bucket.name}/${thumbPath}`
        await assetDoc.ref.update({ thumbUrl })
        results.push({ id: assetDoc.id, status: 'ok', size: `${(buffer.length/1024).toFixed(0)}→${(thumbBuffer.length/1024).toFixed(0)}KB` })
      } catch (err) {
        results.push({ id: assetDoc.id, status: 'error', msg: err.message })
      }
    }
    const remaining = snap.docs.filter(d => !d.data().thumbUrl && d.data().storagePath).length - results.filter(r => r.status === 'ok').length
    res.json({ total: snap.size, processed: results.length, remaining, results })
  })

/**
 * 기존 Bunny 영상 썸네일 마이그레이션 (1회용 HTTP 트리거)
 * 호출: GET https://asia-northeast3-assi-app-6ea04.cloudfunctions.net/fixBunnyThumbnails
 */
exports.fixBunnyThumbnails = functions
  .region('asia-northeast3')
  .runWith({ timeoutSeconds: 540, memory: '512MB' })
  .https.onRequest(async (req, res) => {
    const snap = await db.collection('assets')
      .where('videoHost', '==', 'bunny')
      .get()

    const results = []

    for (const assetDoc of snap.docs) {
      const data = assetDoc.data()
      const videoId = data.bunnyVideoId
      if (!videoId) continue

      // 이미 Storage 썸네일 있으면 프로젝트 썸네일만 업데이트
      if (data.videoThumbnailUrl?.includes('storage.googleapis.com')) {
        if (data.projectId) {
          const projRef = db.collection('projects').doc(data.projectId)
          const projDoc = await projRef.get()
          if (projDoc.exists) {
            await projRef.update({ thumbnailUrl: data.videoThumbnailUrl })
          }
        }
        results.push({ videoId, status: 'skip+projfix', reason: 'already migrated, project thumb fixed' })
        continue
      }

      try {
        // Bunny API에서 비디오 정보
        const infoRes = await fetch(
          `${BUNNY_API_BASE}/${BUNNY_LIBRARY_ID}/videos/${videoId}`,
          { headers: { 'AccessKey': BUNNY_API_KEY } }
        )
        const info = await infoRes.json()

        if (info.status !== 4) {
          results.push({ videoId, status: 'skip', reason: `not encoded (status=${info.status})` })
          continue
        }

        const thumbFileName = info.thumbnailFileName || 'thumbnail.jpg'

        // Bunny CDN에서 썸네일 다운로드 (Referer 필수 — Hotlink Protection)
        const thumbUrl = `https://vz-cd1dda72-832.b-cdn.net/${videoId}/${thumbFileName}`
        const thumbRes = await fetch(thumbUrl, {
          headers: { 'Referer': 'https://assi-portfolio.vercel.app' },
        })

        if (!thumbRes.ok) {
          results.push({ videoId, status: 'fail', reason: `thumb download ${thumbRes.status}` })
          continue
        }

        const thumbBuffer = Buffer.from(await thumbRes.arrayBuffer())

        // Firebase Storage에 저장
        const storagePath = `thumbnails/${data.uid}/${data.projectId}/${videoId}.jpg`
        const file = bucket.file(storagePath)
        await file.save(thumbBuffer, {
          metadata: { contentType: 'image/jpeg', contentDisposition: 'inline' },
        })
        await file.makePublic()
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`

        // Asset 업데이트
        await assetDoc.ref.update({ videoThumbnailUrl: publicUrl })

        // 프로젝트 썸네일도 업데이트
        if (data.projectId) {
          const projRef = db.collection('projects').doc(data.projectId)
          const projDoc = await projRef.get()
          if (projDoc.exists) {
            const projData = projDoc.data()
            // 영상 프로젝트: 항상 Storage 썸네일로 교체 (기존 URL이 삭제된 파일일 수 있음)
            await projRef.update({ thumbnailUrl: publicUrl })
          }
        }

        results.push({ videoId, status: 'ok', url: publicUrl })
      } catch (err) {
        results.push({ videoId, status: 'error', reason: err.message })
      }
    }

    res.json({ total: snap.size, results })
  })

/**
 * 인스타 업로드 완료된 영상의 Storage 원본 정리
 * 매일 자정 실행 — igUploaded: true + Bunny 업로드 완료된 영상만 삭제
 */
exports.cleanupVideos = functions
  .region('asia-northeast3')
  .pubsub.schedule('every 24 hours')
  .onRun(async () => {
    // Bunny 업로드 + 인스타 업로드 완료된 영상 찾기
    const snap = await db.collection('assets')
      .where('videoHost', '==', 'bunny')
      .where('igUploaded', '==', true)
      .get()

    let cleaned = 0
    for (const doc of snap.docs) {
      const data = doc.data()
      if (!data.storagePath) continue

      try {
        const file = bucket.file(data.storagePath)
        const [exists] = await file.exists()
        if (exists) {
          await file.delete()
          await doc.ref.update({
            storagePath: admin.firestore.FieldValue.delete(),
            storageCleanedAt: new Date().toISOString(),
          })
          cleaned++
          console.log('[Cleanup] 삭제:', data.storagePath)
        }
      } catch (err) {
        console.error('[Cleanup] 실패:', data.storagePath, err)
      }
    }
    console.log(`[Cleanup] 완료: ${cleaned}개 정리`)
  })
