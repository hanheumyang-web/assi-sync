/* 상단바(트레이) 아이콘을 만든다 — 브랜드 마크 `[ ]`.

   돌리는 법: node tools/make-tray-icon.mjs   (desktop 폴더에서)

   ⚠️ 맥 상단바 아이콘은 **틀 이미지(Template)** 다. 검정+투명으로만 그린다 —
      맥이 밝은/어두운 막대에 맞춰 알아서 뒤집는다. 색을 넣으면 뒤집히지 않는다.
      파일 이름이 `...Template.png` 여야 맥이 그렇게 다룬다.

   ⚠️ **16px 에서 확인하고 정해라** — 2026-09-08.
      크게 그려놓고 예쁘다고 넣었더니, 상단바 크기에서는 두 대괄호가 붙어
      그냥 네모로 보였다. 가운데 틈이 살아 있어야 마크로 읽힌다.
      (그전 아이콘은 아예 옛 'ASSI' 로고에 글자까지 들어가 있어 뭉개졌다.) */
import sharp from 'sharp'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const 여기 = path.dirname(fileURLToPath(import.meta.url))
const 그림 = (size, color) => {
  const s = size / 32
  const w = 3.4 * s                    // 선 굵기
  const top = 5.0 * s, bot = 27.0 * s  // 위·아래
  const lx = 6.5 * s, larm = 11.0 * s  // 왼쪽 대괄호 (기둥 x, 팔 끝 x)
  const rx = 25.5 * s, rarm = 21.0 * s // 오른쪽 대괄호
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <g fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">
      <path d="M ${larm} ${top} H ${lx} V ${bot} H ${larm}"/>
      <path d="M ${rarm} ${top} H ${rx} V ${bot} H ${rarm}"/>
    </g>
  </svg>`
}

const assets = path.join(여기, '..', 'assets')
await sharp(Buffer.from(그림(16, '#000'))).png().toFile(path.join(assets, 'tray-iconTemplate.png'))
await sharp(Buffer.from(그림(32, '#000'))).png().toFile(path.join(assets, 'tray-iconTemplate@2x.png'))
/* 윈도우 작업표시줄은 틀 이미지를 모른다 — 대개 어두운 막대라 흰색으로 그린다. */
await sharp(Buffer.from(그림(32, '#fff'))).png().toFile(path.join(assets, 'tray-icon.png'))
console.log('상단바 아이콘 3개를 새로 만들었다')
