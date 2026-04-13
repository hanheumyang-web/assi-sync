const functions = require('firebase-functions')
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https')
const { defineSecret } = require('firebase-functions/params')
const admin = require('firebase-admin')
const sharp = require('sharp')
const { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')

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
      // assets에 없으면 shares 컬렉션 확인 (원본 공유 비디오)
      const shareSnap = await db.collection('shares')
        .where('bunnyVideoId', '==', VideoGuid)
        .limit(1)
        .get()
      if (!shareSnap.empty) {
        const shareDoc = shareSnap.docs[0]
        if (Status === 4) {
          await shareDoc.ref.update({
            previewStatus: 'ready',
            bunnyEncodedAt: new Date().toISOString(),
          })
          console.log('[Bunny Webhook] Share 인코딩 완료:', VideoGuid)
        } else if (Status === 5) {
          await shareDoc.ref.update({
            previewStatus: 'error',
            previewError: 'Encoding failed',
          })
          console.log('[Bunny Webhook] Share 인코딩 실패:', VideoGuid)
        }
        res.status(200).send('OK')
        return
      }
      console.log('[Bunny Webhook] Asset/Share 없음:', VideoGuid)
      res.status(404).send('Not found')
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
          headers: { 'Referer': 'https://assifolio.com' },
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
 * 영상 asset의 url 필드 복구 + bunnyStatus 일괄 확인/수정
 * GET https://asia-northeast3-assi-app-6ea04.cloudfunctions.net/fixVideoUrls
 */
exports.fixVideoUrls = functions
  .region('asia-northeast3')
  .runWith({ timeoutSeconds: 120, memory: '256MB' })
  .https.onRequest(async (req, res) => {
    const BUCKET_NAME = bucket.name
    const diagnose = req.query.diagnose === 'true'
    const projectName = req.query.project || null
    const deleteIds = req.query.deleteIds || null   // 쉼표 구분 에셋 ID → Firestore 삭제

    // deleteIds 모드: 지정된 에셋 문서 삭제 (onAssetDelete 트리거가 Bunny 정리)
    if (deleteIds) {
      const ids = deleteIds.split(',').map(s => s.trim()).filter(Boolean)
      const deleted = []
      for (const id of ids) {
        try {
          const ref = db.collection('assets').doc(id)
          const snap = await ref.get()
          if (snap.exists) {
            await ref.delete()
            deleted.push({ id, status: 'deleted', fileName: snap.data().fileName })
          } else {
            deleted.push({ id, status: 'not_found' })
          }
        } catch (e) {
          deleted.push({ id, status: 'error', message: e.message })
        }
      }
      return res.json({ action: 'delete', total: ids.length, deleted })
    }

    const projectId = req.query.projectId || null

    let snap
    if (projectId) {
      // projectId로 직접 조회
      snap = await db.collection('assets').where('projectId', '==', projectId).get()
    } else if (projectName) {
      // 특정 프로젝트의 영상만 확인
      const projSnap = await db.collection('projects').where('name', '==', projectName).limit(1).get()
      if (projSnap.empty) return res.json({ error: 'project not found' })
      snap = await db.collection('assets').where('projectId', '==', projSnap.docs[0].id).get()
    } else {
      // isVideo=true 또는 videoHost='bunny'인 에셋 모두 조회
      const [snap1, snap2] = await Promise.all([
        db.collection('assets').where('isVideo', '==', true).get(),
        db.collection('assets').where('videoHost', '==', 'bunny').get(),
      ])
      const merged = new Map()
      snap1.docs.forEach(d => merged.set(d.id, d))
      snap2.docs.forEach(d => merged.set(d.id, d))
      snap = { docs: [...merged.values()], size: merged.size }
    }

    const results = []
    for (const d of snap.docs) {
      const data = d.data()
      const isVideo = data.isVideo || (data.fileType && data.fileType.startsWith('video/')) || data.videoHost === 'bunny' || !!data.embedUrl

      // diagnose 모드: 모든 에셋 정보 출력
      if (diagnose) {
        const info = {
          id: d.id,
          fileName: data.fileName,
          isVideo,
          fileType: data.fileType || null,
          videoHost: data.videoHost || null,
          bunnyVideoId: data.bunnyVideoId || null,
          bunnyStatus: data.bunnyStatus || null,
          url: data.url ? data.url.substring(0, 120) + '...' : null,
          embedUrl: data.embedUrl || null,
          storagePath: data.storagePath || null,
        }
        results.push(info)
        continue
      }

      // 영상 에셋만 처리
      if (!isVideo) continue

      const updates = {}

      // 1) url 복구: Storage 파일 메타데이터에서 download token 추출 → 영구 URL 생성
      if (data.storagePath) {
        try {
          const file = bucket.file(data.storagePath)
          const [exists] = await file.exists()
          if (exists) {
            const [metadata] = await file.getMetadata()
            let token = metadata.metadata && metadata.metadata.firebaseStorageDownloadTokens
            if (!token) {
              // download token이 없으면 새로 생성
              token = require('crypto').randomUUID()
              await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } })
            }
            const encodedPath = encodeURIComponent(data.storagePath)
            updates.url = `https://firebasestorage.googleapis.com/v0/b/${BUCKET_NAME}/o/${encodedPath}?alt=media&token=${token}`
          } else {
            results.push({ id: d.id, warning: 'storage file not found', storagePath: data.storagePath })
          }
        } catch (e) {
          results.push({ id: d.id, error: 'url fix failed: ' + e.message })
        }
      }

      // 2) bunnyStatus 확인/수정
      if (data.bunnyVideoId && data.bunnyStatus !== 'ready') {
        try {
          const infoRes = await fetch(
            `${BUNNY_API_BASE}/${BUNNY_LIBRARY_ID}/videos/${data.bunnyVideoId}`,
            { headers: { 'AccessKey': BUNNY_API_KEY } }
          )
          const info = await infoRes.json()
          if (info.status === 4) {
            updates.bunnyStatus = 'ready'
            updates.bunnyEncodedAt = new Date().toISOString()
          } else if (info.status === 5) {
            updates.bunnyStatus = 'error'
          }
          results.push({ id: d.id, videoId: data.bunnyVideoId, bunnyApiStatus: info.status, updates: Object.keys(updates) })
        } catch (e) {
          results.push({ id: d.id, error: e.message })
        }
      } else if (Object.keys(updates).length > 0) {
        results.push({ id: d.id, updates: Object.keys(updates) })
      }

      if (Object.keys(updates).length > 0) {
        await d.ref.update(updates)
      }
    }

    res.json({ total: snap.size, fixed: results.length, results })
  })

/**
 * Bunny 에셋 문서 수동 생성/업데이트 (1회용)
 * 호출: POST .../createBunnyAsset  body: { uid, projectId, fileName, bunnyVideoId, storagePath?, url? }
 */
exports.createBunnyAsset = functions
  .region('asia-northeast3')
  .runWith({ timeoutSeconds: 30, memory: '128MB' })
  .https.onRequest(async (req, res) => {
    const items = req.body.items || [req.body]
    const results = []
    for (const item of items) {
      const { uid, projectId, fileName, bunnyVideoId, storagePath, url } = item
      if (!uid || !projectId || !bunnyVideoId) {
        results.push({ error: 'missing uid/projectId/bunnyVideoId' })
        continue
      }
      const ref = await db.collection('assets').add({
        uid, projectId, fileName: fileName || 'video.mp4',
        fileType: 'video/mp4', isVideo: true,
        videoHost: 'bunny', bunnyVideoId,
        embedUrl: `https://iframe.mediadelivery.net/embed/${BUNNY_LIBRARY_ID}/${bunnyVideoId}`,
        bunnyStatus: 'processing',
        bunnyUploadedAt: new Date().toISOString(),
        storagePath: storagePath || null,
        url: url || null,
        createdAt: new Date().toISOString(),
      })
      results.push({ id: ref.id, bunnyVideoId, fileName })
    }
    res.json({ created: results })
  })

/**
 * Bunny 인코딩 실패 영상 재업로드 (Bunny fetch API 사용 — 메모리 무관)
 * 호출: GET .../reuploadToBunny?assetIds=id1,id2  (쉼표 구분)
 *       GET .../reuploadToBunny?all=true           (bunnyStatus=error 전체)
 *
 * 1) 기존 Bunny 영상 삭제 (있으면)
 * 2) Bunny에 새 영상 생성
 * 3) Bunny fetch API로 Storage URL에서 직접 다운로드 → 인코딩
 * 4) Asset 문서 업데이트 (새 bunnyVideoId, status=processing)
 * 5) 인코딩 완료 시 bunnyWebhook이 status=ready로 업데이트
 */
exports.reuploadToBunny = functions
  .region('asia-northeast3')
  .runWith({ timeoutSeconds: 300, memory: '256MB' })
  .https.onRequest(async (req, res) => {
    const assetIds = req.query.assetIds ? req.query.assetIds.split(',').map(s => s.trim()).filter(Boolean) : []
    const all = req.query.all === 'true'

    let docs = []
    if (all) {
      const snap = await db.collection('assets').where('bunnyStatus', '==', 'error').get()
      docs = snap.docs
    } else if (assetIds.length > 0) {
      for (const id of assetIds) {
        const snap = await db.collection('assets').doc(id).get()
        if (snap.exists) docs.push(snap)
      }
    } else {
      return res.json({ error: 'assetIds 또는 all=true 필요' })
    }

    const results = []
    for (const d of docs) {
      const data = d.data()
      const BUCKET_NAME = bucket.name

      // Storage URL 필요
      if (!data.storagePath) {
        results.push({ id: d.id, error: 'no storagePath' })
        continue
      }

      // Storage URL 생성 (download token 사용)
      let downloadUrl = data.url
      if (!downloadUrl) {
        try {
          const file = bucket.file(data.storagePath)
          const [exists] = await file.exists()
          if (!exists) { results.push({ id: d.id, error: 'storage file not found' }); continue }
          const [metadata] = await file.getMetadata()
          let token = metadata.metadata && metadata.metadata.firebaseStorageDownloadTokens
          if (!token) {
            token = require('crypto').randomUUID()
            await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } })
          }
          downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${BUCKET_NAME}/o/${encodeURIComponent(data.storagePath)}?alt=media&token=${token}`
        } catch (e) {
          results.push({ id: d.id, error: 'url generation failed: ' + e.message })
          continue
        }
      }

      try {
        // 1) 기존 Bunny 영상 삭제 (있으면)
        if (data.bunnyVideoId) {
          try {
            await fetch(`${BUNNY_API_BASE}/${BUNNY_LIBRARY_ID}/videos/${data.bunnyVideoId}`, {
              method: 'DELETE',
              headers: { 'AccessKey': BUNNY_API_KEY },
            })
          } catch (_) { /* 삭제 실패해도 진행 */ }
        }

        // 2) Bunny에 새 영상 생성
        const createRes = await fetch(`${BUNNY_API_BASE}/${BUNNY_LIBRARY_ID}/videos`, {
          method: 'POST',
          headers: { 'AccessKey': BUNNY_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: data.fileName || d.id }),
        })
        const createData = await createRes.json()
        const newVideoId = createData.guid
        if (!newVideoId) {
          results.push({ id: d.id, error: 'bunny create failed', response: createData })
          continue
        }

        // 3) Bunny fetch API — Bunny가 Storage URL에서 직접 다운로드
        const fetchRes = await fetch(`${BUNNY_API_BASE}/${BUNNY_LIBRARY_ID}/videos/${newVideoId}/fetch`, {
          method: 'POST',
          headers: { 'AccessKey': BUNNY_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: downloadUrl }),
        })
        const fetchStatus = fetchRes.status

        // 4) Asset 문서 업데이트
        await d.ref.update({
          videoHost: 'bunny',
          bunnyVideoId: newVideoId,
          embedUrl: `https://iframe.mediadelivery.net/embed/${BUNNY_LIBRARY_ID}/${newVideoId}`,
          bunnyStatus: 'processing',
          bunnyUploadedAt: new Date().toISOString(),
          bunnyError: null,
          url: downloadUrl,  // URL도 최신으로 업데이트
        })

        results.push({
          id: d.id,
          fileName: data.fileName,
          oldBunnyId: data.bunnyVideoId || null,
          newBunnyId: newVideoId,
          fetchStatus,
          status: 'reupload started',
        })
      } catch (e) {
        results.push({ id: d.id, error: e.message })
      }
    }

    res.json({ total: docs.length, results })
  })

/**
 * 기존 Bunny 영상 썸네일 마이그레이션 (1회용 HTTP 트리거)
 * 호출: GET https://asia-northeast3-assi-app-6ea04.cloudfunctions.net/fixBunnyThumbnails
 */
exports.fixBunnyThumbnails = functions
  .region('asia-northeast3')
  .runWith({ timeoutSeconds: 540, memory: '2GB' })
  .https.onRequest(async (req, res) => {
    const reupload = req.query.reupload === 'true' // ?reupload=true 로 재업로드 모드
    const targetVideoId = req.query.videoId || null // ?videoId=xxx 로 특정 영상만 처리

    let snap
    if (targetVideoId) {
      snap = await db.collection('assets')
        .where('bunnyVideoId', '==', targetVideoId)
        .limit(1)
        .get()
    } else {
      snap = await db.collection('assets')
        .where('videoHost', '==', 'bunny')
        .get()
    }

    const results = []

    for (const assetDoc of snap.docs) {
      const data = assetDoc.data()
      const videoId = data.bunnyVideoId
      if (!videoId) continue

      // Bunny API에서 현재 상태 확인
      let bunnyInfo
      try {
        const infoRes = await fetch(
          `${BUNNY_API_BASE}/${BUNNY_LIBRARY_ID}/videos/${videoId}`,
          { headers: { 'AccessKey': BUNNY_API_KEY } }
        )
        bunnyInfo = await infoRes.json()
      } catch (e) {
        results.push({ videoId, status: 'api_error', reason: e.message })
        continue
      }

      // status=0(미업로드) 또는 status=5(인코딩 에러) → 재업로드 필요
      if ((bunnyInfo.status === 0 || bunnyInfo.status === 5) && reupload && data.storagePath) {
        try {
          const file = bucket.file(data.storagePath)
          const [exists] = await file.exists()
          if (!exists) {
            results.push({ videoId, status: 'no_file', reason: `Storage 파일 없음: ${data.storagePath}` })
            continue
          }
          const [fileBuffer] = await file.download()
          const upRes = await fetch(
            `${BUNNY_API_BASE}/${BUNNY_LIBRARY_ID}/videos/${videoId}`,
            { method: 'PUT', headers: { 'AccessKey': BUNNY_API_KEY, 'Content-Type': 'application/octet-stream' }, body: fileBuffer }
          )
          if (upRes.ok) {
            await assetDoc.ref.update({ bunnyStatus: 'processing', bunnyUploadedAt: new Date().toISOString() })
            results.push({ videoId, status: 'reuploaded', size: `${(fileBuffer.length / 1024 / 1024).toFixed(1)}MB` })
          } else {
            results.push({ videoId, status: 'reupload_fail', reason: `${upRes.status}` })
          }
        } catch (e) {
          results.push({ videoId, status: 'reupload_error', reason: e.message })
        }
        continue
      } else if (bunnyInfo.status === 0 || bunnyInfo.status === 5) {
        results.push({ videoId, status: 'needs_reupload', reason: `status=${bunnyInfo.status}, use ?reupload=true` })
        continue
      }

      // bunnyStatus가 processing인데 실제로는 인코딩 완료된 경우 → status 수정
      if (data.bunnyStatus !== 'ready') {
        try {
          const checkRes = await fetch(
            `${BUNNY_API_BASE}/${BUNNY_LIBRARY_ID}/videos/${videoId}`,
            { headers: { 'AccessKey': BUNNY_API_KEY } }
          )
          const checkInfo = await checkRes.json()
          if (checkInfo.status === 4) {
            await assetDoc.ref.update({ bunnyStatus: 'ready', bunnyEncodedAt: new Date().toISOString() })
            results.push({ videoId, status: 'status_fixed', reason: `was ${data.bunnyStatus}, now ready` })
          }
        } catch (e) {
          results.push({ videoId, status: 'status_check_fail', reason: e.message })
        }
      }

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
          headers: { 'Referer': 'https://assifolio.com' },
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

// ═══════════════════════════════════════════════════════════════
// ─── R2 원본 공유 (Cloudflare R2 + Bunny 미리보기) ───
// ═══════════════════════════════════════════════════════════════

const R2_ACCESS_KEY_ID = defineSecret('R2_ACCESS_KEY_ID')
const R2_SECRET_ACCESS_KEY = defineSecret('R2_SECRET_ACCESS_KEY')
const R2_ACCOUNT_ID = defineSecret('R2_ACCOUNT_ID')
const R2_BUCKET = defineSecret('R2_BUCKET')

const MAX_SHARE_SIZE = 500 * 1024 * 1024 * 1024 // 500GB
const SHARE_EXPIRY_DAYS = 7
const UPLOAD_URL_TTL = 60 * 60 * 6  // 6h (대용량 업로드 대비)
const DOWNLOAD_URL_TTL = 60 * 60    // 1h
const IMAGE_THUMB_MAX_SIZE = 100 * 1024 * 1024 // 100MB 이하 이미지만 inline 썸네일
const IMAGE_THUMB_WIDTH = 1920
const BUNNY_CDN_HOST = 'vz-cd1dda72-832.b-cdn.net'

function makeR2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  })
}

function sanitizeFileName(name) {
  return String(name || 'file').replace(/[^\w.\-가-힣]/g, '_').slice(0, 200)
}

function detectFileKind(contentType, fileName) {
  const ct = (contentType || '').toLowerCase()
  if (ct.startsWith('video/')) return 'video'
  if (ct.startsWith('image/')) return 'image'
  const ext = (fileName || '').toLowerCase().split('.').pop()
  if (['mov', 'mp4', 'mkv', 'webm', 'avi', 'm4v'].includes(ext)) return 'video'
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'].includes(ext)) return 'image'
  return 'other'
}

/**
 * 공유 업로드 URL 발급 (callable)
 * 입력: { fileName, size, contentType }
 * 출력: { shareId, uploadUrl, key }
 */
exports.createShareUploadUrl = onCall(
  {
    region: 'asia-northeast3',
    secrets: [R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ACCOUNT_ID, R2_BUCKET],
  },
  async (request) => {
    const uid = request.auth?.uid
    if (!uid) throw new HttpsError('unauthenticated', '로그인이 필요합니다.')

    const { fileName, size, contentType } = request.data || {}
    if (!fileName || !size) {
      throw new HttpsError('invalid-argument', 'fileName과 size가 필요합니다.')
    }
    if (size > MAX_SHARE_SIZE) {
      throw new HttpsError('invalid-argument', `최대 ${MAX_SHARE_SIZE / (1024 ** 3)}GB까지 업로드 가능합니다.`)
    }

    const shareId = db.collection('shares').doc().id
    const safeName = sanitizeFileName(fileName)
    const key = `shares/${uid}/${shareId}/${safeName}`
    const bucketName = process.env.R2_BUCKET

    const s3 = makeR2Client()
    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        ContentType: contentType || 'application/octet-stream',
      }),
      { expiresIn: UPLOAD_URL_TTL }
    )

    const now = admin.firestore.Timestamp.now()
    const expiresAt = admin.firestore.Timestamp.fromMillis(
      now.toMillis() + SHARE_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    )

    const fileKind = detectFileKind(contentType, fileName)

    await db.collection('shares').doc(shareId).set({
      uid,
      fileName: safeName,
      originalFileName: fileName,
      size,
      contentType: contentType || 'application/octet-stream',
      key,
      fileKind,
      status: 'pending',
      previewType: fileKind === 'video' ? 'video' : (fileKind === 'image' ? 'image' : 'none'),
      previewStatus: fileKind === 'other' ? 'none' : 'pending',
      createdAt: now,
      expiresAt,
      downloadCount: 0,
    })

    return { shareId, uploadUrl, key, fileKind }
  }
)

/**
 * 업로드 완료 확인 (callable)
 * 입력: { shareId }
 * 출력: { ok, size }
 */
exports.confirmShare = onCall(
  {
    region: 'asia-northeast3',
    timeoutSeconds: 540,
    memory: '1GiB',
    secrets: [R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ACCOUNT_ID, R2_BUCKET],
  },
  async (request) => {
    const uid = request.auth?.uid
    if (!uid) throw new HttpsError('unauthenticated', '로그인이 필요합니다.')

    const { shareId } = request.data || {}
    if (!shareId) throw new HttpsError('invalid-argument', 'shareId가 필요합니다.')

    const ref = db.collection('shares').doc(shareId)
    const snap = await ref.get()
    if (!snap.exists) throw new HttpsError('not-found', '공유를 찾을 수 없습니다.')
    const data = snap.data()
    if (data.uid !== uid) throw new HttpsError('permission-denied', '권한이 없습니다.')

    const s3 = makeR2Client()
    const bucketName = process.env.R2_BUCKET

    // 1) 원본 업로드 검증
    let head
    try {
      head = await s3.send(new HeadObjectCommand({ Bucket: bucketName, Key: data.key }))
    } catch (err) {
      throw new HttpsError('failed-precondition', '업로드가 확인되지 않았습니다.')
    }

    const update = {
      status: 'ready',
      uploadedSize: head.ContentLength || 0,
      uploadedAt: admin.firestore.Timestamp.now(),
    }

    // 2) 미리보기 처리
    const fileKind = data.fileKind || 'other'

    if (fileKind === 'video') {
      // Bunny Fetch: 원본 R2에서 Bunny가 가져가서 트랜스코딩
      try {
        if (!BUNNY_API_KEY || !BUNNY_LIBRARY_ID) {
          throw new Error('Bunny config missing')
        }
        // R2 presigned GET URL (Bunny가 fetch할 동안 유효)
        const fetchUrl = await getSignedUrl(
          s3,
          new GetObjectCommand({ Bucket: bucketName, Key: data.key }),
          { expiresIn: 60 * 60 * 12 } // 12h
        )

        const fetchRes = await fetch(
          `${BUNNY_API_BASE}/${BUNNY_LIBRARY_ID}/videos/fetch`,
          {
            method: 'POST',
            headers: {
              'AccessKey': BUNNY_API_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              url: fetchUrl,
              title: `[SHARE] ${shareId}`,
            }),
          }
        )
        const fetchJson = await fetchRes.json()
        if (!fetchJson.id && !fetchJson.guid) {
          throw new Error('Bunny fetch 실패: ' + JSON.stringify(fetchJson))
        }
        update.bunnyVideoId = fetchJson.id || fetchJson.guid
        update.bunnyEmbedUrl = `https://iframe.mediadelivery.net/embed/${BUNNY_LIBRARY_ID}/${update.bunnyVideoId}`
        update.previewStatus = 'processing'
        console.log('[Share] Bunny fetch 시작:', shareId, update.bunnyVideoId)
      } catch (err) {
        console.error('[Share] Bunny fetch 실패:', err)
        update.previewStatus = 'error'
        update.previewError = err.message
      }
    } else if (fileKind === 'image') {
      // 1920px 썸네일 생성 (작은 이미지만)
      try {
        if ((head.ContentLength || 0) > IMAGE_THUMB_MAX_SIZE) {
          update.previewStatus = 'skipped'
        } else {
          const obj = await s3.send(new GetObjectCommand({ Bucket: bucketName, Key: data.key }))
          const chunks = []
          for await (const c of obj.Body) chunks.push(c)
          const buffer = Buffer.concat(chunks)

          const thumb = await sharp(buffer)
            .rotate()
            .resize({ width: IMAGE_THUMB_WIDTH, withoutEnlargement: true })
            .jpeg({ quality: 82 })
            .toBuffer()

          const thumbKey = `shares/${data.uid}/${shareId}/_preview.jpg`
          await s3.send(new PutObjectCommand({
            Bucket: bucketName,
            Key: thumbKey,
            Body: thumb,
            ContentType: 'image/jpeg',
          }))
          update.previewKey = thumbKey
          update.previewStatus = 'ready'
          console.log('[Share] 이미지 썸네일 생성:', shareId)
        }
      } catch (err) {
        console.error('[Share] 썸네일 실패:', err)
        update.previewStatus = 'error'
        update.previewError = err.message
      }
    } else {
      update.previewStatus = 'none'
    }

    await ref.update(update)
    return { ok: true, size: head.ContentLength || 0, previewStatus: update.previewStatus }
  }
)

/**
 * 공유 다운로드 URL 발급 (public callable, 인증 불필요)
 * 입력: { shareId }
 * 출력: { downloadUrl, fileName, size, expiresAt }
 */
exports.getShareDownloadUrl = onCall(
  {
    region: 'asia-northeast3',
    secrets: [R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ACCOUNT_ID, R2_BUCKET],
  },
  async (request) => {
    const { shareId } = request.data || {}
    if (!shareId) throw new HttpsError('invalid-argument', 'shareId가 필요합니다.')

    const ref = db.collection('shares').doc(shareId)
    const snap = await ref.get()
    if (!snap.exists) throw new HttpsError('not-found', '공유를 찾을 수 없습니다.')
    const data = snap.data()

    if (data.expiresAt && data.expiresAt.toMillis() < Date.now()) {
      throw new HttpsError('failed-precondition', '공유가 만료되었습니다.')
    }

    // ─── 프로젝트 공유 (R2 무압축 기반) ───
    if (data.kind === 'project') {
      // 아직 업로드 중이면 다운로드 카운트 증가 없이 상태만 반환
      if (data.status === 'pending_upload') {
        return {
          kind: 'project',
          status: 'pending_upload',
          projectName: data.projectName || '',
          projectClient: data.projectClient || '',
          assetCount: data.assetCount || 0,
          uploadedCount: data.uploadedCount || 0,
          totalSize: data.totalSize || 0,
          sender: data.sender || null,
          expiresAt: data.expiresAt ? data.expiresAt.toMillis() : null,
        }
      }

      await ref.update({
        downloadCount: admin.firestore.FieldValue.increment(1),
        lastDownloadedAt: admin.firestore.Timestamp.now(),
      })
      return {
        kind: 'project',
        status: data.status || 'ready',
        projectName: data.projectName || '',
        projectClient: data.projectClient || '',
        projectCategory: data.projectCategory || '',
        projectThumbnail: data.projectThumbnail || '',
        assets: data.assets || [],
        assetCount: data.assetCount || (data.assets || []).length,
        totalSize: data.totalSize || 0,
        sender: data.sender || null,
        expiresAt: data.expiresAt ? data.expiresAt.toMillis() : null,
        createdAt: data.createdAt ? data.createdAt.toMillis() : null,
        downloadCount: (data.downloadCount || 0) + 1,
      }
    }

    // ─── 단일 파일 공유 (R2 기반) ───
    if (data.status !== 'ready') {
      throw new HttpsError('failed-precondition', '아직 업로드가 완료되지 않았습니다.')
    }

    const s3 = makeR2Client()
    const bucketName = process.env.R2_BUCKET
    const downloadUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: bucketName,
        Key: data.key,
        ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(data.originalFileName || data.fileName)}`,
      }),
      { expiresIn: DOWNLOAD_URL_TTL }
    )

    // 미리보기 URL 생성
    let previewUrl = null
    let previewType = data.previewType || 'none'
    let previewStatus = data.previewStatus || 'none'

    if (previewType === 'image' && data.previewKey && previewStatus === 'ready') {
      previewUrl = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: bucketName, Key: data.previewKey }),
        { expiresIn: DOWNLOAD_URL_TTL }
      )
    } else if (previewType === 'video' && data.bunnyEmbedUrl) {
      previewUrl = data.bunnyEmbedUrl
    }

    // 보낸 사람 정보 (퍼블릭에 노출 가능한 최소한)
    let sender = null
    try {
      const userSnap = await db.collection('users').doc(data.uid).get()
      if (userSnap.exists) {
        const u = userSnap.data()
        sender = {
          name: u.displayName || u.name || '',
          title: u.title || u.role || '',
          slug: u.slug || u.username || '',
        }
      }
    } catch (e) {}

    await ref.update({
      downloadCount: admin.firestore.FieldValue.increment(1),
      lastDownloadedAt: admin.firestore.Timestamp.now(),
    })

    return {
      downloadUrl,
      fileName: data.originalFileName || data.fileName,
      size: data.size,
      contentType: data.contentType,
      fileKind: data.fileKind || 'other',
      previewType,
      previewStatus,
      previewUrl,
      expiresAt: data.expiresAt ? data.expiresAt.toMillis() : null,
      createdAt: data.createdAt ? data.createdAt.toMillis() : null,
      downloadCount: (data.downloadCount || 0) + 1,
      sender,
    }
  }
)

/**
 * 프로젝트 통째로 공유 (callable)
 * 입력: { projectId }
 * 출력: { shareId }
 *
 * 파일은 이미 Firebase Storage에 있으므로 R2 재업로드 없이
 * Firestore에 자산 목록(메타데이터 + url)만 스냅샷으로 저장한다.
 */
/**
 * 프로젝트 공유 자산을 강제 다운로드(Content-Disposition: attachment)로 받기 위한 서명 URL.
 * Firebase Storage download URL은 response-content-disposition을 무시하므로
 * GCS V4 서명 URL을 직접 발급한다.
 */
exports.getAssetDownloadUrl = onCall(
  {
    region: 'asia-northeast3',
    secrets: [R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ACCOUNT_ID, R2_BUCKET],
  },
  async (request) => {
    const { shareId, assetId } = request.data || {}
    if (!shareId || !assetId) {
      throw new HttpsError('invalid-argument', 'shareId/assetId가 필요합니다.')
    }
    const snap = await db.collection('shares').doc(shareId).get()
    if (!snap.exists) throw new HttpsError('not-found', '공유를 찾을 수 없습니다.')
    const share = snap.data()
    if (share.expiresAt && share.expiresAt.toMillis() < Date.now()) {
      throw new HttpsError('failed-precondition', '만료된 공유입니다.')
    }
    const asset = (share.assets || []).find((a) => a.id === assetId)
    if (!asset) throw new HttpsError('not-found', '자산을 찾을 수 없습니다.')

    const safeName = (asset.fileName || 'download').replace(/"/g, '')

    // Firebase Storage 기반 공유 파일 (신규)
    if (asset.shareStoragePath) {
      const file = bucket.file(asset.shareStoragePath)
      const [url] = await file.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + 60 * 60 * 1000,
        responseDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      })
      try {
        await db.collection('shares').doc(shareId).update({
          downloadCount: admin.firestore.FieldValue.increment(1),
        })
      } catch (e) {}
      return { url }
    }

    // R2에 무압축 파일이 있으면 R2에서 다운로드 (레거시)
    if (asset.r2Key) {
      const s3 = makeR2Client()
      const url = await getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: asset.r2Key,
          ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`,
        }),
        { expiresIn: DOWNLOAD_URL_TTL }
      )

      try {
        await db.collection('shares').doc(shareId).update({
          downloadCount: admin.firestore.FieldValue.increment(1),
        })
      } catch (e) {}

      return { url }
    }

    // 레거시: Firebase Storage에서 다운로드 (r2Key 없는 기존 공유)
    let storagePath = asset.storagePath || ''
    if (!storagePath) {
      try {
        const doc = await db.collection('assets').doc(asset.id).get()
        if (doc.exists) storagePath = doc.data().storagePath || ''
      } catch (e) {}
    }
    if (!storagePath && asset.url) {
      const m = /\/o\/([^?]+)/.exec(asset.url)
      if (m) storagePath = decodeURIComponent(m[1])
    }
    if (!storagePath) throw new HttpsError('failed-precondition', 'storagePath를 찾을 수 없습니다.')

    const file = bucket.file(storagePath)
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000,
      responseDisposition: `attachment; filename="${safeName}"`,
    })

    try {
      await db.collection('shares').doc(shareId).update({
        downloadCount: admin.firestore.FieldValue.increment(1),
      })
    } catch (e) {}

    return { url }
  }
)

exports.createProjectShare = onCall(
  {
    region: 'asia-northeast3',
  },
  async (request) => {
    const uid = request.auth?.uid
    if (!uid) throw new HttpsError('unauthenticated', '로그인이 필요합니다.')

    const { projectId, selectedAssetIds } = request.data || {}
    if (!projectId) throw new HttpsError('invalid-argument', 'projectId가 필요합니다.')

    const projSnap = await db.collection('projects').doc(projectId).get()
    if (!projSnap.exists) throw new HttpsError('not-found', '프로젝트를 찾을 수 없습니다.')
    const proj = projSnap.data()
    if (proj.uid !== uid) throw new HttpsError('permission-denied', '권한이 없습니다.')

    const assetsSnap = await db.collection('assets')
      .where('projectId', '==', projectId)
      .where('uid', '==', uid)
      .get()

    if (assetsSnap.empty) {
      throw new HttpsError('failed-precondition', '공유할 파일이 없습니다.')
    }

    // selectedAssetIds가 있으면 선택된 것만, 없으면 전체
    const selectedSet = selectedAssetIds ? new Set(selectedAssetIds) : null
    const rawAssets = assetsSnap.docs
      .filter((d) => !selectedSet || selectedSet.has(d.id))
      .map((d) => {
        const a = d.data()
        return {
          id: d.id,
          fileName: a.fileName || '',
          fileSize: a.fileSize || 0,
          originalSize: a.originalSize || 0, // 원본 크기 (무압축 공유용)
          fileType: a.fileType || '',
          isVideo: !!a.isVideo,
          url: a.url || '',
          embedUrl: a.embedUrl || '',
          videoThumbnailUrl: a.videoThumbnailUrl || '',
          thumbUrl: a.thumbUrl || '',
          bunnyVideoId: a.bunnyVideoId || '',
          storagePath: a.storagePath || '',
          createdAt: a.createdAt || '',
        }
      })

    // fileName 기준 중복 제거 (동기화가 여러 번 되면 같은 파일의 asset doc이 여러 개 생김)
    // 가장 최근 문서만 유지
    const deduped = new Map()
    for (const a of rawAssets) {
      const key = a.fileName
      if (!deduped.has(key) || a.createdAt > deduped.get(key).createdAt) {
        deduped.set(key, a)
      }
    }
    const allAssets = [...deduped.values()]

    if (allAssets.length === 0) {
      throw new HttpsError('failed-precondition', '선택된 파일이 없습니다.')
    }

    const shareId = db.collection('shares').doc().id
    const now = admin.firestore.Timestamp.now()
    const expiresAt = admin.firestore.Timestamp.fromMillis(
      now.toMillis() + SHARE_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    )

    // Firebase Storage 경로 기반 업로드 (R2 presigned URL 대신)
    const uploadAssets = allAssets.map((asset) => {
      const safeName = sanitizeFileName(asset.fileName)
      const shareStoragePath = `shares/${uid}/${shareId}/${asset.id}_${safeName}`
      return {
        ...asset,
        shareStoragePath,
        uploadStatus: 'pending', // pending | uploaded
      }
    })

    const totalSize = allAssets.reduce((sum, a) => sum + (a.fileSize || 0), 0)

    // 보낸 사람 정보
    let sender = null
    try {
      const u = (await db.collection('users').doc(uid).get()).data() || {}
      sender = {
        name: u.displayName || u.name || '',
        title: u.title || u.role || '',
        slug: u.slug || u.username || '',
      }
    } catch (e) {}

    await db.collection('shares').doc(shareId).set({
      uid,
      kind: 'project',
      projectId,
      projectName: proj.name || '',
      projectClient: proj.client || '',
      projectCategory: proj.category || '',
      projectThumbnail: proj.thumbnailUrl || '',
      assets: uploadAssets,
      totalSize,
      assetCount: uploadAssets.length,
      uploadedCount: 0,
      status: 'pending_upload', // ASSI Sync가 업로드 완료하면 ready로 변경
      sender,
      createdAt: now,
      expiresAt,
      downloadCount: 0,
    })

    return { shareId }
  }
)

/**
 * 만료된 공유 정리 (매일 새벽 4시 KST)
 * - R2 객체 (원본 + 썸네일) 삭제
 * - Bunny 비디오 삭제
 * - Firestore doc 삭제
 */
exports.cleanupExpiredShares = functions
  .region('asia-northeast3')
  .runWith({
    timeoutSeconds: 540,
    memory: '512MB',
    secrets: ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_ACCOUNT_ID', 'R2_BUCKET'],
  })
  .pubsub.schedule('0 4 * * *')
  .timeZone('Asia/Seoul')
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now()
    const snap = await db.collection('shares')
      .where('expiresAt', '<', now)
      .limit(200)
      .get()

    if (snap.empty) {
      console.log('[Share Cleanup] 만료된 공유 없음')
      return null
    }

    const s3 = makeR2Client()
    const bucketName = process.env.R2_BUCKET
    let cleaned = 0

    for (const doc of snap.docs) {
      const data = doc.data()
      try {
        // 프로젝트 공유는 Firestore 문서만 삭제 (원본은 사용자 프로젝트에 그대로)
        if (data.kind === 'project') {
          await doc.ref.delete()
          cleaned++
          console.log('[Share Cleanup] 프로젝트 공유 정리:', doc.id)
          continue
        }

        // R2 폴더 전체 삭제 (원본 + 미리보기)
        const prefix = `shares/${data.uid}/${doc.id}/`
        const list = await s3.send(new ListObjectsV2Command({ Bucket: bucketName, Prefix: prefix }))
        for (const obj of (list.Contents || [])) {
          await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: obj.Key }))
        }

        // Bunny 비디오 삭제
        if (data.bunnyVideoId && BUNNY_API_KEY && BUNNY_LIBRARY_ID) {
          try {
            await fetch(
              `${BUNNY_API_BASE}/${BUNNY_LIBRARY_ID}/videos/${data.bunnyVideoId}`,
              { method: 'DELETE', headers: { 'AccessKey': BUNNY_API_KEY } }
            )
          } catch (e) {
            console.warn('[Share Cleanup] Bunny 삭제 실패:', data.bunnyVideoId, e.message)
          }
        }

        await doc.ref.delete()
        cleaned++
        console.log('[Share Cleanup] 정리:', doc.id)
      } catch (err) {
        console.error('[Share Cleanup] 실패:', doc.id, err.message)
      }
    }

    console.log(`[Share Cleanup] 완료: ${cleaned}개 정리`)
    return null
  })
