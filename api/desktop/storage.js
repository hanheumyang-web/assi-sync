// Vercel Serverless: Firebase Storage signed URL generation
// POST /api/desktop/storage { action, storagePath, contentType }
// Auth: Bearer <Firebase ID Token>

import crypto from 'crypto'
import { verifyAuth, bucket, cors } from '../_lib/admin.js'

const BUCKET_NAME = 'assi-app-6ea04.firebasestorage.app'

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  let uid
  try { uid = await verifyAuth(req) }
  catch { return res.status(401).json({ error: 'Unauthorized' }) }

  const { action } = req.body
  const b = bucket()

  try {
    switch (action) {

      case 'getUploadUrl': {
        const { storagePath, contentType } = req.body
        // Security: path must start with users/{uid}/
        if (!storagePath.startsWith(`users/${uid}/`) && !storagePath.startsWith(`thumbnails/${uid}/`)) {
          return res.status(403).json({ error: 'Forbidden: invalid storage path' })
        }

        const token = crypto.randomUUID()
        const file = b.file(storagePath)

        const [uploadUrl] = await file.getSignedUrl({
          version: 'v4',
          action: 'write',
          expires: Date.now() + 15 * 60 * 1000, // 15 minutes
          contentType,
          extensionHeaders: {
            'x-goog-meta-firebasestoragedownloadtokens': token,
          },
        })

        const encodedPath = encodeURIComponent(storagePath)
        const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${BUCKET_NAME}/o/${encodedPath}?alt=media&token=${token}`

        return res.json({
          uploadUrl,
          downloadUrl,
          token,
          headers: {
            'Content-Type': contentType,
            'x-goog-meta-firebasestoragedownloadtokens': token,
          },
        })
      }

      case 'makePublic': {
        const { storagePath } = req.body
        if (!storagePath.startsWith(`users/${uid}/`) && !storagePath.startsWith(`thumbnails/${uid}/`)) {
          return res.status(403).json({ error: 'Forbidden' })
        }
        const file = b.file(storagePath)
        await file.makePublic()
        const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${storagePath}`
        return res.json({ publicUrl })
      }

      case 'deleteFile': {
        const { storagePath } = req.body
        if (!storagePath.startsWith(`users/${uid}/`) && !storagePath.startsWith(`thumbnails/${uid}/`)) {
          return res.status(403).json({ error: 'Forbidden' })
        }
        try { await b.file(storagePath).delete() } catch {}
        return res.json({ ok: true })
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` })
    }
  } catch (err) {
    console.error('[Storage API] error:', err)
    return res.status(500).json({ error: err.message })
  }
}
