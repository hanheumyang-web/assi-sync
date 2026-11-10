/* 같은 이름 다른 분류 폴더가 한 작업으로 합쳐짐 막기 — 컴퓨터 앱 쪽 (11/4 대표님 「권고대로」 · 11/10 「가 하고 카카오로그인까지 붙여서 업뎃한번하자」)
 *
 * HOME/소현 과 PORTRAIT/소현 이 둘 다 있을 때, 경로로 못 찾은 쪽이 「이름이 같다」 는 이유로 남의 작업을 가져갔다
 * (분류만 옮긴 폴더를 다시 올리지 않으려고 둔 길 — 9/25). 그러면 사진이 한 작업에 섞이고, 동기화마다 경로가 뒤집혔다.
 * 고침: 이름으로 찾은 작업의 폴더가 이 컴퓨터에 **따로 살아 있으면** 옮긴 게 아니라 다른 폴더다 → 잇지 않는다.
 *   · 서버에도 지금 있는 작업 폴더 목록(presentKeys)을 같이 보낸다 — 서버 api/desktop/firestore.js findOrCreateProject 가 같은 규칙을 쓴다.
 *   · 앱이 켤 때 스스로 짝짓는 길(sync-engine syncStateWithServer)도 같은 규칙.
 * 작업 폴더 = 사진 · 영상 같은 파일이 바로 든 폴더. 열쇠는 감시 폴더 안 상대 경로(getProjectKey 와 같은 꼴, '/' 로 이음).
 */
const fs = require('fs')
const path = require('path')

/* 맥은 한글 폴더 이름을 풀어 쓴 꼴(NFD)로 준다 — 관리자가 넣은 경로(모아 쓴 꼴)와 비교할 때만 맞춘다 */
const 경로꼴 = s => String(s || '').normalize('NFC')

/** 지금 감시 폴더에 있는 작업 폴더 경로 전부 (파일을 열지 않고 이름만 본다 — 수백 폴더여도 금방 끝난다) */
function 지금있는작업폴더(watchDir, { isSupported, isIgnored, 깊이 = 8 }) {
  const 모음 = new Set()
  const 훑기 = (dir, rel, d) => {
    if (d > 깊이) return
    let entries = []
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (e.name.startsWith('.') || isIgnored(e.name)) continue
      const r = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) { 훑기(path.join(dir, e.name), r, d + 1); continue }
      if (rel && isSupported(e.name)) 모음.add(rel)   // 감시 폴더 바로 아래 파일은 작업이 아니다(getProjectKey 가 null)
    }
  }
  if (watchDir) 훑기(watchDir, '', 0)
  return [...모음]
}

/** 찾은 작업의 폴더가 지금 이 컴퓨터에 따로 살아 있나 (제 경로면 아니다) — 서버 따로살아있나와 같은 규칙 */
function 따로살아있나(있는경로, 찾은작업, key) {
  const k = 찾은작업?.folderKey
  return !!(있는경로 && k && 경로꼴(k) !== 경로꼴(key) && 있는경로.has(경로꼴(k)))
}

/**
 * 켤 때 짝짓기 — 찾는 순서는 예전 그대로(폴더 경로 → 폴더 이름(후보 하나) → 작업 이름).
 * 경로가 아닌 이름으로 찾은 작업은 ① 그 작업의 폴더가 따로 살아 있거나 ② 이번 훑기에서 다른 폴더가 먼저 가져갔으면 쓰지 않는다.
 * @param {{ byFolderKey: Map, byFolderName: Map, serverProjects: Map, 있는폴더: () => Iterable<string> }} p
 * @returns {(key: string, name: string) => object | undefined}
 */
function 짝찾기만들기({ byFolderKey, byFolderName, serverProjects, 있는폴더 }) {
  const 잡힌 = new Map()   // 작업 id → 이번에 가져간 폴더 경로
  return (key, name) => {
    const 바로 = byFolderKey.get(key)
    if (바로) return 바로
    const 있는경로 = new Set([...있는폴더()].map(경로꼴))
    for (const 후보 of [byFolderName.get(name), serverProjects.get(name)]) {
      if (!후보) continue
      if (따로살아있나(있는경로, 후보, key)) continue
      const 먼저 = 잡힌.get(후보.id)
      if (먼저 && 먼저 !== key) continue
      잡힌.set(후보.id, key)
      return 후보
    }
    return undefined
  }
}

module.exports = { 지금있는작업폴더, 따로살아있나, 짝찾기만들기, 경로꼴 }
