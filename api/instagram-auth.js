// Vercel Serverless Function: Instagram OAuth token exchange
// Uses Instagram Login (not Facebook Login) for direct IG account access
// POST /api/instagram-auth { code }
// Returns { access_token, user_id, username }

const APP_ID = process.env.IG_APP_ID || '1346006907350596'
const APP_SECRET = process.env.IG_APP_SECRET
const REDIRECT_URI = process.env.IG_REDIRECT_URI || 'https://assi-portfolio.vercel.app/auth/instagram/callback'

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { code } = req.body
  if (!code) return res.status(400).json({ error: 'Missing code' })
  if (!APP_SECRET) return res.status(500).json({ error: 'Server misconfigured: missing APP_SECRET' })

  try {
    // Step 1: Exchange code for short-lived token via Instagram API
    const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: APP_ID,
        client_secret: APP_SECRET,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI,
        code,
      }),
    })
    const tokenData = await tokenRes.json()
    console.log('[IG Auth] Token response:', JSON.stringify(tokenData).slice(0, 300))

    if (tokenData.error_type || tokenData.error_message) {
      return res.status(400).json({ error: tokenData.error_message || tokenData.error_type })
    }
    if (!tokenData.access_token) {
      return res.status(400).json({ error: `토큰 교환 실패: ${JSON.stringify(tokenData).slice(0, 200)}` })
    }

    const shortToken = tokenData.access_token
    const userId = tokenData.user_id

    // Step 2: Exchange for long-lived token (60 days)
    const longRes = await fetch(`https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${APP_SECRET}&access_token=${shortToken}`)
    const longData = await longRes.json()
    const longToken = longData.access_token || shortToken
    console.log('[IG Auth] Long-lived token obtained:', !!longData.access_token)

    // Step 3: Get user info
    const userRes = await fetch(`https://graph.instagram.com/v25.0/me?fields=user_id,username&access_token=${longToken}`)
    const userData = await userRes.json()
    console.log('[IG Auth] User data:', JSON.stringify(userData).slice(0, 300))

    const username = userData.username || userId

    return res.status(200).json({
      access_token: longToken,
      user_id: userId || userData.user_id || userData.id,
      username: username,
    })
  } catch (err) {
    console.error('[IG Auth] Error:', err)
    return res.status(500).json({ error: err.message })
  }
}
