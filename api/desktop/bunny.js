// Vercel Serverless: Bunny Stream video operations
// POST /api/desktop/bunny { action, ... }
// Auth: Bearer <Firebase ID Token>
// Bunny API key is stored as BUNNY_API_KEY env var

import crypto from 'crypto'
import { verifyAuth, db, bucket, cors } from '../_lib/admin.js'

const BUNNY_API_KEY = process.env.BUNNY_API_KEY
const BUNNY_LIBRARY_ID = process.env.BUNNY_LIBRARY_ID || '631122'
const BUNNY_API_BASE = `https://video.bunnycdn.com/library/${BUNNY_LIBRARY_ID}/videos`
const BUNNY_CDN = `https://vz-cd1dda72-832.b-cdn.net`
const BUCKET_NAME = 'assi-app-6ea04.firebasestorage.app'

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  let uid
  try { uid = await verifyAuth(req) }
  catch { return res.status(401).json({ error: 'Unauthorized' }) }

  if (!BUNNY_API_KEY) return res.status(500).json({ error: 'Bunny API key not configured' })

  const { action } = req.body

  try {
    switch (action) {

      // Create Bunny video + return TUS upload authorization
      case 'createVideo': {
        const { title } = req.body

        // 1. Create video entry on Bunny
        const createRes = await fetch(BUNNY_API_BASE, {
          method: 'POST',
          headers: { 'AccessKey': BUNNY_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ title }),
        })
        const meta = await createRes.json()
        const videoId = meta.guid
        if (!videoId) return res.status(500).json({ error: 'Bunny create failed', details: meta })

        // 2. Generate TUS upload authorization (client-safe)
        const expirationTime = Math.floor(Date.now() / 1000) + 3600 // 1 hour
        const signature = crypto.createHash('sha256')
          .update(BUNNY_LIBRARY_ID + BUNNY_API_KEY + expirationTime + videoId)
          .digest('hex')

        return res.json({
          videoId,
          tusAuth: {
            signature,
            expire: expirationTime.toString(),
            libraryId: BUNNY_LIBRARY_ID,
          },
          embedUrl: `https://iframe.mediadelivery.net/embed/${BUNNY_LIBRARY_ID}/${videoId}`,
        })
      }

      // Check Bunny video encoding status
      case 'checkStatus': {
        const { videoId } = req.body

        const statusRes = await fetch(`${BUNNY_API_BASE}/${videoId}`, {
          headers: { 'AccessKey': BUNNY_API_KEY },
        })
        const info = await statusRes.json()

        return res.json({
          status: info.status, // 0-3=processing, 4=done, 5=failed
          thumbnailFileName: info.thumbnailFileName || 'thumbnail.jpg',
        })
      }

      // Download Bunny thumbnail → save to Firebase Storage → return URL
      case 'saveThumbnail': {
        const { videoId, projectId } = req.body

        // 1. Get video info for thumbnail filename
        const infoRes = await fetch(`${BUNNY_API_BASE}/${videoId}`, {
          headers: { 'AccessKey': BUNNY_API_KEY },
        })
        const info = await infoRes.json()
        const thumbFile = info.thumbnailFileName || 'thumbnail.jpg'

        // 2. Download thumbnail from Bunny CDN
        const thumbRes = await fetch(`${BUNNY_CDN}/${videoId}/${thumbFile}`, {
          headers: { 'Referer': 'https://assi-portfolio.vercel.app' },
        })
        if (!thumbRes.ok) return res.status(404).json({ error: 'Thumbnail not found' })

        const thumbBuffer = Buffer.from(await thumbRes.arrayBuffer())

        // 3. Upload to Firebase Storage
        const storagePath = `thumbnails/${uid}/${projectId}/${videoId}.jpg`
        const file = bucket().file(storagePath)
        await file.save(thumbBuffer, {
          metadata: { contentType: 'image/jpeg', contentDisposition: 'inline' },
        })
        await file.makePublic()
        const thumbnailUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${storagePath}`

        return res.json({ thumbnailUrl })
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` })
    }
  } catch (err) {
    console.error(`[Bunny API] ${action} error:`, err)
    return res.status(500).json({ error: err.message })
  }
}
