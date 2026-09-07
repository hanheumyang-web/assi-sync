/* 절대 깨지면 안 되는 규칙들.
 *
 * ⚠️ 이 파일이 이 시험 프로그램의 심장이다.
 *
 *    2026-09-07~08 에 사고가 여럿 났는데, 공통점이 하나 있었다 —
 *    **"생각해서 짜둔 시험" 은 전부 통과했다.** 터진 건 생각 못 한 조합이었다.
 *    폴더를 지웠다 다시 만든 뒤 웹에서 삭제 신호가 온 경우,
 *    카테고리가 바뀌어 파일이 옮겨진 경우, 영상 하나가 줄을 막은 경우…
 *
 *    그래서 경우를 다 적어두려 하지 않는다. 대신 **사용자 행동을 무작위로 섞어 돌리면서,
 *    매 동작 뒤에 아래 규칙을 전부 확인한다.** 어떤 조합에서 깨지든 여기서 걸린다.
 *
 *    규칙을 추가할 때는 "이게 깨지면 사용자가 무엇을 잃는가" 를 한 줄로 쓴다.
 *    잃는 게 없으면 그건 규칙이 아니라 취향이다.
 */
const fs = require('fs')
const path = require('path')

const IGNORE = new Set(['.DS_Store'])
const isHidden = n => n.startsWith('.') || IGNORE.has(n)

function walk(dir, rel = '', out = []) {
  let entries = []
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    if (isHidden(e.name)) continue
    const r = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) walk(path.join(dir, e.name), r, out)
    else out.push(r)
  }
  return out
}

/** 감시 폴더 안의 파일 목록 (휴지통 제외 / 포함) */
function localFiles(root, { includeTrash = false } = {}) {
  return walk(root).filter(r => includeTrash || !r.startsWith('_Trash/'))
}

/**
 * 규칙 하나 = { name, why, check(ctx) → true | 실패이유 문자열 }
 *
 * ctx: { root, state, web, expected, events }
 *   root     감시 폴더
 *   state    앱의 기록 (sync-state.json 내용)
 *   web      { projects: [...], assetsByProject: Map }
 *   expected 시험이 알고 있는 "지금 있어야 하는 것" — 사용자가 한 일의 기록
 *   events   지난 동작 동안 앱이 사용자에게 물어본 것들
 */
const RULES = [
  {
    name: '내가 안 지운 사진이 사라지지 않는다',
    why: '사용자가 사진을 잃는다. 가장 큰 사고.',
    check({ root, expected }) {
      const gone = [...expected.files].filter(rel => !fs.existsSync(path.join(root, rel)))
      if (!gone.length) return true
      /* 휴지통에 있으면 잃은 건 아니다 — 되돌릴 수 있다 */
      const trash = localFiles(root, { includeTrash: true }).filter(r => r.startsWith('_Trash/'))
      const stillGone = gone.filter(rel => {
        const name = rel.split('/').pop()
        return !trash.some(t => t.endsWith('/' + name))
      })
      return stillGone.length ? `사라진 사진 ${stillGone.length}장: ${stillGone.slice(0, 3).join(', ')}` : true
    },
  },
  {
    name: '기록에는 반드시 파일 크기가 있다',
    why: '크기가 없으면 "우리가 올린 그 파일인지" 를 확인할 수 없다. 확인 없이 지우면 남의 파일을 지운다.',
    check({ state }) {
      const bad = Object.entries(state.syncedFiles || {}).filter(([, v]) => !(v.fileSize > 0))
      return bad.length ? `크기 없는 기록 ${bad.length}개: ${bad.slice(0, 3).map(b => b[0]).join(', ')}` : true
    },
  },
  {
    name: '기록이 가리키는 파일은 디스크에 있다',
    why: '기록과 디스크가 어긋나면 앱이 "없어졌다" 고 오해해 헛된 삭제 확인을 띄운다.',
    check({ root, state }) {
      const missing = Object.keys(state.syncedFiles || {}).filter(r => !fs.existsSync(path.join(root, r)))
      return missing.length ? `기록에만 있는 것 ${missing.length}개: ${missing.slice(0, 3).join(', ')}` : true
    },
  },
  {
    name: '휴지통에 들어간 것은 되돌릴 자리를 안다',
    why: '되돌릴 자리를 모르면 복구가 불가능하다. 사실상 영구 삭제다.',
    check({ root }) {
      const trashRoot = path.join(root, '_Trash')
      if (!fs.existsSync(trashRoot)) return true
      const bad = []
      for (const name of fs.readdirSync(trashRoot)) {
        const dir = path.join(trashRoot, name)
        if (!fs.statSync(dir).isDirectory()) continue
        const files = fs.readdirSync(dir).filter(n => !isHidden(n))
        if (!files.length) continue                       // 빈 폴더는 상관없다
        const metaPath = path.join(dir, '.meta.json')
        if (!fs.existsSync(metaPath)) { bad.push(name + ' (기록 없음)'); continue }
        try {
          const m = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
          if (!Array.isArray(m.items) || !m.items.length) bad.push(name + ' (되돌릴 자리 없음)')
        } catch { bad.push(name + ' (기록 깨짐)') }
      }
      return bad.length ? `되돌릴 수 없는 휴지통 폴더: ${bad.join(', ')}` : true
    },
  },
  {
    name: '내가 안 지운 프로젝트는 웹에 남아 있다',
    why: '앱이 멋대로 서버를 지우면 다른 기기·웹에서도 사라진다. 되돌리기 전엔 아무도 모른다.',
    check({ web, expected }) {
      const alive = new Set((web.projects || []).filter(p => !p.deletedAt).map(p => p.name))
      const gone = [...expected.projects].filter(n => !alive.has(n))
      return gone.length ? `웹에서 사라진 프로젝트: ${gone.join(', ')}` : true
    },
  },
  {
    name: '내가 안 지웠는데 "웹에서도 지울까요?" 를 묻지 않는다',
    why: '멀쩡한 자료를 두고 물으면, 사용자가 무심코 눌러 진짜로 지운다.',
    check({ events, expected }) {
      const bogus = events.asks.filter(a => !expected.deletedFolders.has(a.folderKey))
      return bogus.length ? `헛된 삭제 확인: ${bogus.map(a => a.folderKey).join(', ')}` : true
    },
  },
  {
    name: '정체불명 폴더를 만들지 않는다',
    why: '_UNCATEGORIZED/<영숫자ID>/ 같은 폴더가 사용자 폴더에 생긴다. 뭔지 알 수 없고 중복 사본이 쌓인다.',
    check({ root }) {
      const bad = localFiles(root).filter(r => r.startsWith('_UNCATEGORIZED/'))
      return bad.length ? `정체불명 폴더에 ${bad.length}개: ${bad.slice(0, 2).join(', ')}` : true
    },
  },
  {
    name: '같은 프로젝트가 웹에 두 개 생기지 않는다',
    why: '폴더 하나가 웹에서 둘로 갈라진다. 어느 쪽이 진짜인지 알 수 없다.',
    check({ web }) {
      const seen = new Map()
      for (const p of (web.projects || []).filter(x => !x.deletedAt)) {
        seen.set(p.name, (seen.get(p.name) || 0) + 1)
      }
      const dupes = [...seen.entries()].filter(([, n]) => n > 1)
      return dupes.length ? `중복 프로젝트: ${dupes.map(d => `${d[0]}×${d[1]}`).join(', ')}` : true
    },
  },
  {
    name: '사진이 저절로 두 배가 되지 않는다',
    why: '같은 사진이 웹에 계속 쌓이면 용량과 요금이 새고, 포트폴리오에도 중복이 보인다.',
    check({ web, expected }) {
      const bad = []
      for (const [name, count] of expected.assetCounts) {
        const p = (web.projects || []).find(x => x.name === name && !x.deletedAt)
        if (!p) continue
        const live = (web.assetsByProject.get(p.id) || []).filter(a => !a.deletedAt).length
        if (live > count) bad.push(`${name}: ${count}장이어야 하는데 ${live}장`)
      }
      return bad.length ? bad.join(' / ') : true
    },
  },
]

/** 모든 규칙을 확인한다. 깨진 것만 돌려준다. */
function checkAll(ctx) {
  const broken = []
  for (const r of RULES) {
    let res
    try { res = r.check(ctx) } catch (e) { res = `검사 중 터짐: ${e.message}` }
    if (res !== true) broken.push({ name: r.name, why: r.why, detail: res })
  }
  return broken
}

module.exports = { RULES, checkAll, localFiles, walk }
