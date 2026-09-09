/* 기존 사용자가 **폴더를 새로 정리해서 다시 연동**하는 경우 (2026-09-09)
   ① AD/프로젝트X 로 올린다
   ② 사람이 BEAUTY/프로젝트X 로 옮긴다 (분류 재정리)
   ③ 폴더를 바꿔 다시 연결한 것처럼 기록을 비우고 다시 시작한다
   ④ 앱이 **내 폴더를 되돌려 옮기지 않아야** 하고, 웹 분류가 폴더를 따라와야 한다 */
const fs = require('fs'), path = require('path'), os = require('os')
const DESK = path.join(os.homedir(), 'work', 'assi-proto', 'desktop')
const M = require(path.join(DESK,'lib','api-client.js')); const ApiClient = M.ApiClient||M
const E = require(path.join(DESK,'lib','sync-engine.js')); const SyncEngine = E.SyncEngine||E
const sharp = require(path.join(DESK,'node_modules','sharp'))
const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(),'Library/Application Support/assi-sync/config.json'),'utf8'))
if (!String(cfg.email||'').includes('privaterelay')) { console.error('시험 계정 아님'); process.exit(2) }
let fail=0
const ok=(t,c,x)=>{console.log((c?'  ✅ ':'  ❌ ')+t+(x?'  '+x:''));if(!c)fail++}
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const api=()=>new ApiClient({idToken:cfg.idToken,refreshToken:cfg.refreshToken,onTokenRefreshed:()=>{}})
const RUN=Date.now().toString().slice(-5), P='ZZ재정리'+RUN
const root=path.join(os.homedir(),'Desktop',`_시험 재정리${RUN}`), state=path.join(os.tmpdir(),`re-${RUN}.json`)
const mk=()=>{const e=new SyncEngine({uid:cfg.uid,watchDir:root,statePath:state,api:api(),onNewFolder:()=>true,onFileStatus:()=>{},onError:()=>{},onFolderDeletionRequested:()=>{}});e.downloadRemoteAsset=async()=>({skipped:true});return e}
const 프로젝트=async()=>((await api().getProjectsByUid()).projects||[]).find(p=>p.name===P&&!p.deletedAt)
const 사진수=async pid=>((await api().getAssetsByProject(pid)).assets||[]).filter(a=>!a.deletedAt).length
const wait=async(fn,ms=150000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await fn())return true;await sleep(3000)}return false}
;(async()=>{
  fs.mkdirSync(path.join(root,'AD',P),{recursive:true})
  fs.writeFileSync(path.join(root,'AD',P,'컷1.jpg'), await sharp({create:{width:340,height:240,channels:3,background:{r:200,g:60,b:20}}}).jpeg().toBuffer())
  let e=mk(); await e.start()
  ok('AD 로 올라갔다', await wait(async()=>{const p=await 프로젝트();return p&&(await 사진수(p.id))===1}))
  const p1=await 프로젝트(); if(!p1){console.log('중단');process.exit(1)}
  console.log(`  · 웹 분류: ${p1.category}`)
  try{await e.stop?.()}catch{}

  // ② 사람이 분류를 다시 정리한다
  fs.mkdirSync(path.join(root,'BEAUTY'),{recursive:true})
  fs.renameSync(path.join(root,'AD',P), path.join(root,'BEAUTY',P))
  console.log('  · 사람이 AD → BEAUTY 로 옮겼다')

  // ③ 폴더를 바꿔 다시 연결한 것처럼
  fs.rmSync(state,{force:true})
  e=mk(); await e.start(); await sleep(25000)

  const 그대로 = fs.existsSync(path.join(root,'BEAUTY',P,'컷1.jpg'))
  const 되돌아감 = fs.existsSync(path.join(root,'AD',P,'컷1.jpg'))
  ok('내가 정리한 폴더가 그대로다 (BEAUTY)', 그대로)
  ok('앱이 폴더를 되돌려 옮기지 않았다 (AD 로 안 돌아감)', !되돌아감, 되돌아감?'AD 로 되돌아갔다':'')
  const p2=await 프로젝트()
  ok('웹 분류가 폴더를 따라왔다', p2 && (p2.category||'').toUpperCase()==='BEAUTY', p2?`지금 ${p2.category}`:'')
  ok('사진이 두 벌이 되지 않았다', p2 && (await 사진수(p2.id))===1, p2?`${await 사진수(p2.id)}장`:'')
  ok('프로젝트가 하나뿐이다', ((await api().getProjectsByUid()).projects||[]).filter(p=>p.name===P&&!p.deletedAt).length===1)
  try{await e.stop?.()}catch{}
  if(p2) await api().softDeleteProject(p2.id).catch(()=>{})
  fs.rmSync(root,{recursive:true,force:true}); fs.rmSync(state,{force:true})
  console.log(fail?`\n${fail}가지 실패`:'\n전부 통과')
  process.exit(fail?1:0)
})().catch(e=>{console.error('터짐',e);process.exit(1)})
