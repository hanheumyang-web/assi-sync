// Vercel Serverless: Dynamic OG meta tags for portfolio public pages
// GET /api/og?slug=xxx → fetches index.html, injects OG tags, returns
// Crawlers get OG tags, users get the full React SPA

import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const SITE_URL = 'https://assifolio.com'

let cachedBaseHtml = null

async function getBaseHtml() {
  if (cachedBaseHtml) return cachedBaseHtml
  try {
    const r = await fetch(`${SITE_URL}/index.html`)
    if (r.ok) cachedBaseHtml = await r.text()
  } catch (e) { console.error('[OG] fetch index.html failed:', e.message) }
  return cachedBaseHtml || ''
}

function ensureInit() {
  if (getApps().length > 0) return
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  if (!raw) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_KEY')
  initializeApp({ credential: cert(JSON.parse(raw)) })
}

export default async function handler(req, res) {
  const slug = req.query.slug
  if (!slug) return res.redirect('/')

  let title = 'ASSI — Portfolio'
  let description = '크리에이티브 스태프를 위한 포트폴리오'
  let image = ''
  const url = `${SITE_URL}/p/${encodeURIComponent(slug)}`

  try {
    ensureInit()
    const db = getFirestore()

    // published 조건 없이 slug로만 검색 (비공개여도 OG는 표시)
    const portSnap = await db.collection('portfolios')
      .where('slug', '==', slug)
      .limit(1).get()

    if (!portSnap.empty) {
      const portfolio = portSnap.docs[0].data()
      const uid = portfolio.uid || portSnap.docs[0].id

      const userDoc = await db.collection('users').doc(uid).get()
      const profile = userDoc.exists ? userDoc.data() : {}

      const name = portfolio.businessName || profile.displayName || slug
      const tagline = portfolio.tagline || profile.profession || ''

      title = tagline ? `${name} — ${tagline}` : name
      description = profile.bio || `${name}의 포트폴리오`
      if (profile.logoUrl) image = profile.logoUrl

      // 썸네일용 프로젝트 — portfolioPublic 조건 없이 최신 프로젝트
      const projSnap = await db.collection('projects')
        .where('uid', '==', uid)
        .limit(1).get()

      if (!projSnap.empty && projSnap.docs[0].data().thumbnailUrl) {
        image = projSnap.docs[0].data().thumbnailUrl
      }
    }
  } catch (err) {
    console.error('[OG] Error:', err.message)
  }

  const e = (s) => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const ogTags = `
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${e(title)}" />
    <meta property="og:description" content="${e(description)}" />
    ${image ? `<meta property="og:image" content="${e(image)}" />` : ''}
    <meta property="og:url" content="${e(url)}" />
    <meta property="og:site_name" content="ASSI" />
    <meta property="og:locale" content="ko_KR" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${e(title)}" />
    <meta name="twitter:description" content="${e(description)}" />
    ${image ? `<meta name="twitter:image" content="${e(image)}" />` : ''}
    <link rel="canonical" href="${e(url)}" />`

  // Fetch the built SPA HTML (static file, no loop)
  const baseHtml = await getBaseHtml()

  let html
  if (baseHtml) {
    // Inject OG tags into the real SPA HTML (preserves JS/CSS bundles)
    html = baseHtml
      .replace(/<title>.*?<\/title>/, `<title>${e(title)}</title>`)
      .replace(/<meta name="description"[^>]*\/?>/g, '')
      .replace(/<meta property="og:[^>]*\/?>/g, '')
      .replace(/<meta name="twitter:[^>]*\/?>/g, '')
      .replace('</head>', `${ogTags}\n  </head>`)
  } else {
    // Fallback if fetch fails
    html = `<!doctype html><html lang="ko"><head>
      <meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
      <title>${e(title)}</title>${ogTags}
    </head><body><div id="root"></div></body></html>`
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
  return res.status(200).send(html)
}
