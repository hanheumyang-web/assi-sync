/* 휴지통이 사용자 파일을 잃지 않는지 — 가짜 폴더로 실제로 돌려 확인한다.
   실행: node test/trash-safety.test.js

   2026-09-07 테스터가 "로컬에 멀쩡히 있는 폴더를 통으로 삭제시킨다" 고 제보했다.
   원인은 v1.9.21 부터 있던 '웹에서 지워졌으니 로컬도 정리' 경로가
   그 자리에 있는 파일이 정말 우리가 올린 그 파일인지 확인하지 않은 것이었다.
   여기 있는 다섯 가지는 전부 그때 잃을 뻔한 경우들이다. */
const fs=require('fs'),path=require('path'),os=require('os')
const {SyncEngine}=(()=>{const m=require(require('path').join(__dirname,'..','lib','sync-engine.js'));return {SyncEngine:m.SyncEngine||m}})()
const P=SyncEngine.prototype
let fail=0
const ok=(n,c)=>{console.log((c?'  ✅ ':'  ❌ ')+n);if(!c)fail++}

function mk(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'assi-'))
  const stub={watchDir:root,state:{syncedFiles:{}},projectCache:new Map(),
    approvedFolders:new Set(),saveState(){},markSelfMoved(){},_recentTrashOps:new Map()}
  return {root,stub}
}
function put(root,rel,body){const a=path.join(root,rel);fs.mkdirSync(path.dirname(a),{recursive:true});fs.writeFileSync(a,body);return fs.statSync(a).size}

console.log('\n① 테스터 시나리오 — 폴더를 지웠다 다시 만들어 둔 경우')
{
  const {root,stub}=mk()
  const s1=put(root,'인물/dogfood/a.jpg','원본원본원본')
  stub.state.syncedFiles['인물/dogfood/a.jpg']={assetId:'a1',projectId:'P1',fileSize:s1}
  put(root,'인물/dogfood/a.jpg','사용자가 새로 넣은 완전히 다른 사진 파일')  // 다시 만듦
  P.removeDeletedProjectLocally.call(stub,{id:'P1',name:'dogfood',deletedAt:new Date().toISOString()})
  ok('멀쩡한 새 파일이 그대로 남아 있다', fs.existsSync(path.join(root,'인물/dogfood/a.jpg')))
  ok('_Trash 가 만들어지지 않았다', !fs.existsSync(path.join(root,'_Trash')))
  fs.rmSync(root,{recursive:true,force:true})
}

console.log('\n② 옛 버전이 남긴 기록 (크기 없음) — 근거가 없으면 손대지 않는다')
{
  const {root,stub}=mk()
  put(root,'인물/dogfood/a.jpg','아무거나')
  stub.state.syncedFiles['인물/dogfood/a.jpg']={assetId:'a1',projectId:'P1'} // fileSize 없음
  P.removeDeletedProjectLocally.call(stub,{id:'P1',name:'dogfood',deletedAt:new Date().toISOString()})
  ok('파일이 남아 있다', fs.existsSync(path.join(root,'인물/dogfood/a.jpg')))
  ok('_Trash 가 만들어지지 않았다', !fs.existsSync(path.join(root,'_Trash')))
  fs.rmSync(root,{recursive:true,force:true})
}

console.log('\n③ 정상 삭제 — 우리가 올린 그 파일이 맞을 때는 휴지통으로 간다')
{
  const {root,stub}=mk()
  const s1=put(root,'인물/dogfood/a.jpg','원본원본원본')
  const s2=put(root,'인물/dogfood/b.jpg','두번째')
  stub.state.syncedFiles['인물/dogfood/a.jpg']={assetId:'a1',projectId:'P1',fileSize:s1}
  stub.state.syncedFiles['인물/dogfood/b.jpg']={assetId:'a2',projectId:'P1',fileSize:s2}
  P.removeDeletedProjectLocally.call(stub,{id:'P1',name:'dogfood',deletedAt:new Date().toISOString()})
  ok('원래 자리에서 사라졌다', !fs.existsSync(path.join(root,'인물/dogfood/a.jpg')))
  const td=fs.readdirSync(path.join(root,'_Trash'))[0]
  const meta=JSON.parse(fs.readFileSync(path.join(root,'_Trash',td,'.meta.json'),'utf8'))
  ok('휴지통에 2개가 들어갔다', fs.readdirSync(path.join(root,'_Trash',td)).filter(n=>n!=='.meta.json').length===2)
  ok('원래 자리가 기록되었다', meta.items.length===2 && meta.items[0].relPath==='인물/dogfood/a.jpg')

  console.log('\n④ 웹에서 되살렸을 때 — 지우지 말고 원래 자리로 돌아와야 한다')
  P.restoreProjectFromLocalTrash.call(stub,path.join(root,'_Trash',td))
  ok('a.jpg 가 제자리로 돌아왔다', fs.existsSync(path.join(root,'인물/dogfood/a.jpg')))
  ok('내용도 그대로다', fs.readFileSync(path.join(root,'인물/dogfood/a.jpg'),'utf8')==='원본원본원본')
  ok('휴지통 폴더는 비워져 사라졌다', !fs.existsSync(path.join(root,'_Trash',td)))
  fs.rmSync(root,{recursive:true,force:true})
}

console.log('\n⑤ 되돌릴 때 같은 이름 파일이 이미 있으면 — 덮어쓰지 않는다')
{
  const {root,stub}=mk()
  const s1=put(root,'인물/dogfood/a.jpg','원본')
  stub.state.syncedFiles['인물/dogfood/a.jpg']={assetId:'a1',projectId:'P1',fileSize:s1}
  P.removeDeletedProjectLocally.call(stub,{id:'P1',name:'dogfood',deletedAt:new Date().toISOString()})
  put(root,'인물/dogfood/a.jpg','사용자가 그 사이에 넣은 새 파일')
  const td=fs.readdirSync(path.join(root,'_Trash'))[0]
  P.restoreProjectFromLocalTrash.call(stub,path.join(root,'_Trash',td))
  ok('사용자의 새 파일이 살아 있다', fs.readFileSync(path.join(root,'인물/dogfood/a.jpg'),'utf8')==='사용자가 그 사이에 넣은 새 파일')
  ok('옛 원본은 옆에 번호 붙어 돌아왔다', fs.existsSync(path.join(root,'인물/dogfood/a_2.jpg')))
  fs.rmSync(root,{recursive:true,force:true})
}

console.log(fail?`\n실패 ${fail}건`:'\n전부 통과')
process.exit(fail?1:0)
