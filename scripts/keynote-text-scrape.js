#!/usr/bin/env node
// iwa 바이너리에서 텍스트 전체 긁어오기 — 2가지 방식 비교:
//   (A) keynote-parser2 가 파싱한 메시지 객체 전체를 재귀 순회하며 string 필드 수집
//   (B) 메시지 바이너리 raw buffer 에서 UTF-8 문자열 정규식 스크레이핑
// 두 결과를 슬라이드(.iwa 파일)별로 출력.

const path = require('path')
const fs = require('fs')
const kp = require('keynote-parser2')
const yauzl = require('yauzl')

async function main() {
  const keyPath = process.argv[2]
  if (!keyPath) { console.error('Usage: node scripts/keynote-text-scrape.js "<path>.key"'); process.exit(1) }
  const abs = path.resolve(keyPath)
  if (!fs.existsSync(abs)) { console.error('not found:', abs); process.exit(1) }
  console.log('📂', abs)

  const zip = await new Promise((res, rej) => yauzl.open(abs, { lazyEntries: true }, (e, z) => e ? rej(e) : res(z)))

  // 모든 iwa 읽어서 분석
  const iwaBuffers = [] // { name, buf }
  await new Promise((res, rej) => {
    zip.on('entry', entry => {
      if (!/^Index\/.*\.iwa$/i.test(entry.fileName)) { zip.readEntry(); return }
      zip.openReadStream(entry, (e, rs) => {
        if (e) return rej(e)
        const chunks = []
        rs.on('data', c => chunks.push(c))
        rs.on('end', () => { iwaBuffers.push({ name: entry.fileName, buf: Buffer.concat(chunks) }); zip.readEntry() })
        rs.on('error', rej)
      })
    })
    zip.on('end', res)
    zip.on('error', rej)
    zip.readEntry()
  })
  console.log(`🔍 ${iwaBuffers.length}개 iwa 발견\n`)

  let grandTotalA = 0, grandTotalB = 0, newInBCount = 0
  const results = []
  for (const { name, buf } of iwaBuffers) {
    const short = name.replace(/^Index\//, '')
    try {
      const archives = kp.parseIwa(buf)

      // (A) 파싱된 메시지 객체 재귀 → 모든 string 필드
      const stringsA = new Set()
      for (const [id, archive] of Object.entries(archives)) {
        for (const m of archive.messages || []) {
          collectStrings(m, stringsA)
        }
      }

      // (B) raw buffer 에서 UTF-8 연속 문자열 추출
      // iwa 는 Snappy framed + Protobuf 인데, 텍스트는 대부분 length-prefixed UTF-8 로 들어감.
      // Snappy 해제된 payload 가 아니면 압축 잔여물이 섞이지만, 실제 텍스트는 대부분 평문으로 남음.
      // keynote-parser2 의 내부 포맷을 모르므로 전체 buf 대상으로 돌리고, 한글/영문/숫자/공백/구두점만 연속 허용.
      const stringsB = new Set()
      scanUtf8Strings(buf, stringsB)

      const onlyInB = [...stringsB].filter(s => ![...stringsA].some(a => a.includes(s) || s.includes(a)))
      grandTotalA += stringsA.size
      grandTotalB += stringsB.size
      newInBCount += onlyInB.length

      results.push({ name: short, archivesCount: Object.keys(archives).length, a: [...stringsA], b: [...stringsB], onlyInB })
    } catch (e) {
      console.warn(`  ⚠️  ${short} parse fail:`, e.message)
    }
  }

  // 실제 슬라이드 (Slide-*.iwa) 먼저 보기 — Template/Theme 파일 제외
  const slideIwas = results.filter(r => /^Slide/i.test(r.name) && !/Template/i.test(r.name))
  console.log(`━━━ 실제 슬라이드 iwa (${slideIwas.length}개) ━━━`)
  for (const r of slideIwas) {
    // user-entered text 만 필터: 한글 or 2글자 이상 영단어/문장
    const userText = [...new Set([...r.a, ...r.b])].filter(s => {
      if (s.length < 2) return false
      if (/^(KN|TSWP|TSD|TSS|TSP|TST)\./.test(s)) return false
      if (/Archive$|Storage$|Info$/.test(s)) return false
      if (/^(Transition|none|Slide|슬라이드|개체 틀|바닥글|제목 슬라이드|제목 및 내용|구역 머리글|제목 텍스트)$/i.test(s)) return false
      if (/^\d+_/.test(s)) return false
      // ASCII 잡음 필터 (연속된 대/소문자 3자 이하 + 특수문자)
      if (/^[A-Za-z]{1,3}[\-.\\\/0-9]/.test(s)) return false
      return true
    })
    console.log(`\n📄 ${r.name} (archives:${r.archivesCount}) 의미있는 텍스트: ${userText.length}개`)
    if (userText.length > 0) console.log('  →', userText.slice(0, 20).map(s => `"${truncate(s, 60)}"`).join(', '))
  }
  console.log(`\n━━━ 기타 iwa 샘플 (처음 6개) ━━━`)
  const interesting = results.filter(r => !/^Slide/i.test(r.name) && r.a.length + r.b.length > 0)
  for (const r of interesting.slice(0, 6)) {
    console.log(`\n📄 ${r.name}  (archives: ${r.archivesCount})`)
    console.log(`  [A] 파싱된 string 필드 (${r.a.length}개):`, r.a.slice(0, 12).map(s => `"${truncate(s)}"`).join(', ') + (r.a.length > 12 ? ` ... +${r.a.length - 12}` : ''))
    console.log(`  [B] raw UTF-8 스캔 (${r.b.length}개):`, r.b.slice(0, 12).map(s => `"${truncate(s)}"`).join(', ') + (r.b.length > 12 ? ` ... +${r.b.length - 12}` : ''))
    if (r.onlyInB.length > 0) {
      console.log(`  [B에만 있음 (${r.onlyInB.length}개)]:`, r.onlyInB.slice(0, 8).map(s => `"${truncate(s)}"`).join(', '))
    }
  }

  console.log(`\n━━━ 총계 ━━━`)
  console.log(`  (A) parseIwa 로 뽑은 string:  ${grandTotalA}개`)
  console.log(`  (B) raw UTF-8 스캔:           ${grandTotalB}개`)
  console.log(`  (B 에만 있는 신규 문자열):    ${newInBCount}개`)
  console.log(`\n💡 (A) 에 원하는 텍스트(예: 브랜드명/프로젝트명)가 있으면 그대로 사용,`)
  console.log(`     (B) 에만 있는 게 많으면 iwa 파서 보강 필요없이 raw 스캔으로 충분.`)
}

function collectStrings(obj, out, depth = 0) {
  if (depth > 30) return
  if (obj == null) return
  if (typeof obj === 'string') {
    const s = obj.trim()
    if (isMeaningful(s)) out.add(s)
    return
  }
  if (typeof obj !== 'object') return
  if (Array.isArray(obj)) { for (const v of obj) collectStrings(v, out, depth + 1); return }
  for (const k of Object.keys(obj)) collectStrings(obj[k], out, depth + 1)
}

// iwa buffer 에서 UTF-8 문자열만 추출
// Protobuf wire format: string field = (tag varint) (length varint) (utf8 bytes)
// 길이 prefix 가 바로 앞에 있으므로, 단순히 "2바이트 이상 연속 printable" 를 긁어도 노이즈가 많음.
// 여기선 최소 길이를 높여서 유의미한 문자열만 남김.
function scanUtf8Strings(buf, out) {
  const text = buf.toString('utf8')
  // 한글/영문/숫자/공백/자주 쓰는 구두점 2자 이상 연속
  const re = /[A-Za-z가-힣0-9][A-Za-z가-힣0-9 \-_.,&'()\/~:!?]{1,80}/g
  let m
  while ((m = re.exec(text)) != null) {
    const s = m[0].trim()
    if (isMeaningful(s)) out.add(s)
  }
}

function isMeaningful(s) {
  if (!s || s.length < 2) return false
  if (/^\d+$/.test(s)) return false            // 숫자만
  if (/^[.\-_,]{2,}$/.test(s)) return false    // 구두점만
  if (s.length > 100) return false             // 너무 긴 건 바이너리 노이즈
  // 내부 제어 문자 거르기 (UTF-8 디코딩이라 거의 안 걸리지만 안전망)
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) < 0x20) return false
  // ASCII 중 의미있는 단어 패턴 (1글자씩만 찍히면 바이너리 노이즈)
  if (!/[A-Za-z가-힣]/.test(s)) return false
  return true
}

function truncate(s, n = 40) { return s.length > n ? s.slice(0, n) + '…' : s }

main().catch(e => { console.error('FAIL:', e); process.exit(1) })
