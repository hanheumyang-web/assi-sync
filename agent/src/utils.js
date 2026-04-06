import { relative, sep } from 'path'

const CONTENT_TYPE_MAP = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', bmp: 'image/bmp',
  tif: 'image/tiff', tiff: 'image/tiff', avif: 'image/avif', svg: 'image/svg+xml',
  mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo', mkv: 'video/x-matroska',
  webm: 'video/webm', m4v: 'video/x-m4v', wmv: 'video/x-ms-wmv', flv: 'video/x-flv',
  cr2: 'image/x-canon-cr2', nef: 'image/x-nikon-nef', arw: 'image/x-sony-arw',
  dng: 'image/x-adobe-dng', raf: 'image/x-fuji-raf',
}

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tif', 'tiff', 'avif', 'cr2', 'nef', 'arw', 'dng', 'raf'])
const VIDEO_EXTS = new Set(['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', 'wmv', 'flv'])
const IGNORED = new Set(['thumbs.db', 'desktop.ini', '.ds_store'])

export function guessContentType(fileName) {
  const ext = fileName?.split('.').pop()?.toLowerCase()
  return CONTENT_TYPE_MAP[ext] || 'application/octet-stream'
}

export function isImageFile(fileName) {
  const ext = fileName?.split('.').pop()?.toLowerCase()
  return IMAGE_EXTS.has(ext)
}

export function isVideoFile(fileName) {
  const ext = fileName?.split('.').pop()?.toLowerCase()
  return VIDEO_EXTS.has(ext)
}

export function isSupportedFile(fileName) {
  return isImageFile(fileName) || isVideoFile(fileName)
}

export function isIgnoredFile(fileName) {
  const base = fileName.split(/[/\\]/).pop().toLowerCase()
  return base.startsWith('.') || IGNORED.has(base)
}

export function getProjectName(watchDir, filePath) {
  const rel = relative(watchDir, filePath).split(sep)
  // 리프 폴더 (파일 바로 위 폴더)를 프로젝트명으로 사용
  return rel.length >= 2 ? rel[rel.length - 2] : null
}

export function getRelativePath(watchDir, filePath) {
  return relative(watchDir, filePath).split(sep).join('/')
}
