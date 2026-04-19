// ASSI Sync — .fig 파일 썸네일 추출
//
// 배경: Figma `.fig` 파일은 Figma 버전·저장 경로별로 포맷이 다름.
//   - File > Save local copy (데스크톱 Figma): ZIP 컨테이너 가능 (thumbnail.png 포함)
//   - Community download: LZ4/Kiwi 바이너리 (ZIP 아님)
//
// 전략: ZIP 파싱 best-effort 시도. 성공하면 썸네일 PNG buffer 반환, 실패하면 null.
//   실패해도 sync 는 계속 진행 (소스파일로만 업로드).

const yauzl = require('yauzl')
const fs = require('fs')

// ZIP 안에서 썸네일로 쓸 수 있는 엔트리 이름 후보 (소문자 비교)
const THUMB_ENTRY_CANDIDATES = [
  'thumbnail.png',
  'preview.png',
  'previews/preview.png',
  'canvas.thumbnail.png',
]

/**
 * .fig 파일에서 썸네일 PNG 버퍼 추출 시도.
 * @param {string} filePath — .fig 파일 경로
 * @returns {Promise<Buffer | null>} 썸네일 buffer 또는 null (포맷이 다르거나 추출 실패)
 */
function extractFigThumbnail(filePath) {
  return new Promise((resolve) => {
    // ZIP 헤더 매직 넘버 (PK\x03\x04) 먼저 확인 — 빠르게 포맷 판정
    try {
      const fd = fs.openSync(filePath, 'r')
      const magic = Buffer.alloc(4)
      fs.readSync(fd, magic, 0, 4, 0)
      fs.closeSync(fd)
      if (magic[0] !== 0x50 || magic[1] !== 0x4b) {
        // ZIP 아님 — kiwi 바이너리일 가능성 높음. 추출 불가.
        return resolve(null)
      }
    } catch (e) {
      return resolve(null)
    }

    yauzl.open(filePath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) return resolve(null)

      let found = false
      zipfile.on('entry', (entry) => {
        if (found) return
        const name = entry.fileName.toLowerCase()
        if (!THUMB_ENTRY_CANDIDATES.includes(name)) {
          zipfile.readEntry()
          return
        }
        // 후보 엔트리 발견 — buffer 로 읽기
        zipfile.openReadStream(entry, (e, stream) => {
          if (e || !stream) {
            zipfile.readEntry()
            return
          }
          const chunks = []
          stream.on('data', (c) => chunks.push(c))
          stream.on('end', () => {
            found = true
            zipfile.close()
            resolve(Buffer.concat(chunks))
          })
          stream.on('error', () => {
            zipfile.readEntry()
          })
        })
      })
      zipfile.on('end', () => {
        if (!found) resolve(null)
      })
      zipfile.on('error', () => resolve(null))
      zipfile.readEntry()
    })
  })
}

module.exports = { extractFigThumbnail }
