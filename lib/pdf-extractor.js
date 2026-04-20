// Node-side PDF → per-page JPEG extraction, used by sync-engine to ingest
// PDF uploads from watched folders. Mirrors the browser version in
// src/utils/pdfExtract.js: render each page via pdfjs at 2x scale, clamp to
// 2048px max side, encode JPEG q92. Pages are written to temp files so the
// existing image-upload pipeline can consume them as regular buffers.

const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')

// pdfjs-dist 5.x is ESM-only; load via dynamic import and cache.
let _pdfjsPromise = null
function loadPdfjs() {
  if (!_pdfjsPromise) {
    _pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs')
  }
  return _pdfjsPromise
}

// @napi-rs/canvas provides a Skia-backed Canvas API compatible with pdfjs's
// canvasFactory contract. No native build tools required — prebuilt binaries.
const { createCanvas } = require('@napi-rs/canvas')

const RENDER_SCALE = 2
const JPEG_QUALITY = 92      // 0-100 for @napi-rs/canvas (vs 0-1 for browser)
const MAX_DIMENSION = 2048   // matches web pdfExtract + compressImage cap

function isPdfFile(name) {
  return /\.pdf$/i.test(name || '')
}

function padIndex(i, total) {
  return String(i).padStart(String(total).length, '0')
}

class NodeCanvasFactory {
  create(width, height) {
    const canvas = createCanvas(Math.floor(width), Math.floor(height))
    const context = canvas.getContext('2d')
    return { canvas, context }
  }
  reset(canvasAndContext, width, height) {
    canvasAndContext.canvas.width = Math.floor(width)
    canvasAndContext.canvas.height = Math.floor(height)
  }
  destroy(canvasAndContext) {
    canvasAndContext.canvas.width = 0
    canvasAndContext.canvas.height = 0
    canvasAndContext.canvas = null
    canvasAndContext.context = null
  }
}

// Renders a PDF to JPEG files in os.tmpdir() and returns metadata.
// Each entry: { tmpPath, pageIndex (1-based), total, pageFileName, byteSize }.
// Caller is responsible for deleting tmpPath once upload is done.
async function extractPdfToTmp(pdfPath, opts = {}) {
  const { onProgress } = opts
  const pdfjs = await loadPdfjs()
  const data = new Uint8Array(fs.readFileSync(pdfPath))
  const doc = await pdfjs.getDocument({
    data,
    disableFontFace: true,
    useSystemFonts: false,
    canvasFactory: new NodeCanvasFactory(),
  }).promise

  const total = doc.numPages
  const baseName = path.basename(pdfPath, path.extname(pdfPath))
  const runId = crypto.randomBytes(4).toString('hex')
  const tmpDir = path.join(os.tmpdir(), `assi-pdf-${runId}`)
  fs.mkdirSync(tmpDir, { recursive: true })

  const out = []
  const canvasFactory = new NodeCanvasFactory()

  for (let i = 1; i <= total; i++) {
    const page = await doc.getPage(i)
    let viewport = page.getViewport({ scale: RENDER_SCALE })
    const maxSide = Math.max(viewport.width, viewport.height)
    if (maxSide > MAX_DIMENSION) {
      const effectiveScale = (RENDER_SCALE * MAX_DIMENSION) / maxSide
      viewport = page.getViewport({ scale: effectiveScale })
    }

    const { canvas, context } = canvasFactory.create(viewport.width, viewport.height)
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: context, viewport, canvasFactory }).promise

    const jpegBuf = await canvas.encode('jpeg', JPEG_QUALITY)
    const pageFileName = `${baseName}_p${padIndex(i, total)}.jpg`
    const tmpPath = path.join(tmpDir, pageFileName)
    fs.writeFileSync(tmpPath, jpegBuf)

    out.push({
      tmpPath,
      pageIndex: i,
      total,
      pageFileName,
      byteSize: jpegBuf.length,
    })

    canvasFactory.destroy({ canvas, context })
    page.cleanup()
    if (onProgress) onProgress({ done: i, total })
  }

  await doc.cleanup()
  await doc.destroy()
  return { tmpDir, pages: out }
}

function cleanupTmpDir(tmpDir) {
  if (!tmpDir) return
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
}

module.exports = { isPdfFile, extractPdfToTmp, cleanupTmpDir }
