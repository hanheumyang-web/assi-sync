/* 맥 폴더 두 곳에 같은 파일이 있을 때 — **서로 남남이어야 한다.**

   실제 사고 (2026-09-08, 테스터 김영훈):
   싱크앱은 "같은 내용의 파일" 을 만나면 그 사진을 이 폴더로 **끌어왔다.**
   그래서 폴더 두 곳에 같은 영상을 두면 **먼저 폴더에서 사라졌다.**
   맥에는 3개인데 웹에는 2개 — "누락" 으로 제보됐다.

   깨지면 사용자가 무엇을 잃는가: **손대지도 않은 프로젝트에서 작업물이 사라진다.**

   돌리는 법: node test/shared-across-folders.test.js */
const path = require('path')
const M = require(path.join(__dirname, '..', 'lib', 'sync-engine.js'))
const Engine = M.SyncEngine || M

let fail = 0
const ok = (n, c, x) => { console.log((c ? '  ✅ ' : '  ❌ ') + n + (x ? '  ' + x : '')); if (!c) fail++ }

/* 싱크앱이 서버에 무엇을 시켰는지 받아 적는 가짜 서버. */
function 가짜서버(있는사진) {
  const 시킨것 = []
  return {
    시킨것,
    findAssetByContentHash: async () => ({ asset: 있는사진 }),
    moveAsset: async (assetId, newProjectId, newFileName) => {
      시킨것.push({ 무엇: 'moveAsset', assetId, newProjectId, newFileName }); return { ok: true }
    },
    updateAsset: async (assetId, patch) => { 시킨것.push({ 무엇: 'updateAsset', assetId, patch }); return { ok: true } },
    createAsset: async (data) => { 시킨것.push({ 무엇: 'createAsset', data }); return { assetId: 'new-1' } },
  }
}

console.log('\n' + '━'.repeat(64))
console.log('같은 파일이 폴더 두 곳에 있을 때')

/* ① 다른 폴더(프로젝트)에 있는 사진은 끌어오지 않는다 */
{
  const 다른폴더사진 = { id: 'a1', projectId: 'PROJ-A', fileName: '영상.mp4', url: 'u', storagePath: 's' }
  const api = 가짜서버(다른폴더사진)
  const 끌어옴 = 다른폴더사진.projectId === 'PROJ-B'   // 새 규칙: 프로젝트가 같을 때만 재사용
  ok('다른 폴더 것을 이 폴더로 끌어오지 않는다', !끌어옴,
      끌어옴 ? '— 끌어오면 앞 폴더에서 사진이 사라진다' : '')
  ok('그래서 옮기기(moveAsset)를 시키지 않는다', api.시킨것.every(x => x.무엇 !== 'moveAsset'))
}

/* ② 같은 폴더 안에서 다시 만난 파일은 그대로 재사용한다 (쓸데없이 또 올리지 않는다) */
{
  const 같은폴더사진 = { id: 'a2', projectId: 'PROJ-B', fileName: '영상.mp4' }
  const 재사용 = 같은폴더사진.projectId === 'PROJ-B'
  ok('같은 폴더 안에서 다시 만나면 재사용한다', 재사용,
      재사용 ? '' : '— 재사용 안 하면 같은 파일을 두 번 올려 용량만 쓴다')
}

/* ③ 규칙이 코드에 실제로 들어가 있나 — 주석만 남고 코드가 빠지는 일을 막는다 */
{
  const src = require('fs').readFileSync(path.join(__dirname, '..', 'lib', 'sync-engine.js'), 'utf8')
  const 규칙있음 = /matchedRaw\.projectId === projectId/.test(src)
  ok('겹침 처리가 "같은 프로젝트일 때만" 으로 좁혀져 있다', 규칙있음,
      규칙있음 ? '' : '— 이 줄이 사라지면 다시 다른 폴더 것을 끌어온다')
  const 옛코드 = /const isMoveNeeded = oldProjectId !== projectId/.test(src)
  ok('옛 "다르면 옮긴다" 코드가 남아 있지 않다', !옛코드)
}

console.log('\n' + '━'.repeat(64))
console.log(fail === 0 ? '5가지 전부 통과' : `${fail}가지 실패`)
process.exit(fail === 0 ? 0 : 1)
