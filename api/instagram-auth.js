// Vercel Serverless Function: Instagram OAuth token exchange
// POST /api/instagram-auth { code }
// Returns { access_token, user_id, username, ig_user_id }

const APP_ID = process.env.IG_APP_ID || '1728699775169445'
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
    // Step 1: Exchange code for short-lived token
    const tokenRes = await fetch('https://graph.facebook.com/v25.0/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: APP_ID,
        client_secret: APP_SECRET,
        redirect_uri: REDIRECT_URI,
        code,
      }),
    })
    const tokenData = await tokenRes.json()
    if (tokenData.error) {
      console.error('[IG Auth] Token exchange failed:', tokenData.error)
      return res.status(400).json({ error: tokenData.error.message })
    }

    const shortToken = tokenData.access_token

    // Step 2: Exchange for long-lived token (60 days)
    const longRes = await fetch(`https://graph.facebook.com/v25.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${shortToken}`)
    const longData = await longRes.json()
    const longToken = longData.access_token || shortToken

    // Step 3: Get Facebook Pages
    const pagesRes = await fetch(`https://graph.facebook.com/v25.0/me/accounts?access_token=${longToken}`)
    const pagesData = await pagesRes.json()
    if (!pagesData.data || pagesData.data.length === 0) {
      return res.status(400).json({ error: 'Facebook 페이지가 없습니다. Instagram Professional 계정이 연결된 Facebook 페이지가 필요합니다.' })
    }

    // Step 4: Get Instagram Business Account from Page
    let igUserId = null
    let igUsername = null
    let pageToken = null

    for (const page of pagesData.data) {
      const igRes = await fetch(`https://graph.facebook.com/v25.0/${page.id}?fields=instagram_business_account{id,username}&access_token=${page.access_token}`)
      const igData = await igRes.json()
      if (igData.instagram_business_account) {
        igUserId = igData.instagram_business_account.id
        igUsername = igData.instagram_business_account.username
        pageToken = page.access_token
        break
      }
    }

    if (!igUserId) {
      return res.status(400).json({ error: 'Instagram Professional 계정을 찾을 수 없습니다. Instagram 계정을 Facebook 페이지에 연결해주세요.' })
    }

    return res.status(200).json({
      access_token: pageToken,
      user_id: igUserId,
      username: igUsername,
    })
  } catch (err) {
    console.error('[IG Auth] Error:', err)
    return res.status(500).json({ error: err.message })
  }
}
