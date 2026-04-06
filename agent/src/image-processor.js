import sharp from 'sharp'
import { readFile } from 'fs/promises'

const MAX_DIM = 2048
const MAX_SIZE = 7 * 1024 * 1024 // 7MB
const JPEG_QUALITY = 92

export async function processImage(filePath) {
  const buffer = await readFile(filePath)
  const meta = await sharp(buffer, { failOn: 'none' }).metadata()
  const { width, height } = meta

  // 이미 작으면 원본 그대로
  if (buffer.length <= MAX_SIZE && width <= MAX_DIM && height <= MAX_DIM) {
    return { buffer, width, height, originalSize: buffer.length, compressedSize: buffer.length, skipped: true }
  }

  // 리사이즈 + JPEG 압축
  const resized = await sharp(buffer, { failOn: 'none' })
    .resize(MAX_DIM, MAX_DIM, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer({ resolveWithObject: true })

  return {
    buffer: resized.data,
    width: resized.info.width,
    height: resized.info.height,
    originalSize: buffer.length,
    compressedSize: resized.data.length,
    skipped: false,
  }
}
