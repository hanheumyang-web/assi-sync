/* 폴더 경로 열쇠 + 양방향 분류 (2026-09-09)
   ① 올린다 → 프로젝트에 폴더 경로 열쇠가 심긴다
   ② 웹에서 이름을 바꾼다 → 다시 훑어도 **중복이 안 생긴다** (예전엔 두 벌이 됐다)
   ③ 폴더 분류를 바꾼다 → 웹이 따라온다 (폴더는 그대로)
   ④ 웹에서 분류를 바꾼다 → 폴더가 따라 옮겨진다 (묻지 않고) */
const fs=require('fs'),path=require('path'),os=require('os')
const DESK=path.join(os.homedir(),'work/assi-proto/desktop')
const M=require(path.join(DESK,'lib/api-client.js'));const ApiClient=M.ApiClient||M
const E=require(path.join(DESK,'lib/sync-engine.js'));const SyncEngine=E.SyncEngine||E
const sharp=require(path.join(DESK,'node_modules/sharp'))
const cfg=JSON.parse(fs.readFileSync(path.join(os.homedir(),'Library/Application Support/assi-sync/config.json'),'utf8'))
if(!String(cfg.email||'').includes('privaterelay')){console.error('시험 계정 아님');process.exit(2)}
let fail=0
const ok=(t,c,x)=>{console.log((c?'  ✅ ':'  ❌ ')+t+(x?'  '+x:''));if(!c)fail++}
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const api=()=>new ApiClient({idToken:cfg.idToken,refreshToken:cfg.refreshToken,onTokenRefreshed:()=>{}})
const RUN=Date.now().toString().slice(-5), 폴더명='ZZ열쇠'+RUN, 웹이름='웹이름'+RUN
const root=path.join(os.homedir(),'Desktop',`_시험 열쇠${RUN}`), state=path.join(os.tmpdir(),`key-${RUN}.json`)
const mk=()=>{const e=new SyncEngine({uid:cfg.uid,watchDir:root,statePath:state,api:api(),onNewFolder:()=>true,onFileStatus:()=>{},onError:()=>{},onFolderDeletionRequested:()=>{}});e.downloadRemoteAsset=async()=>({skipped:true});return e}
const 목록=async()=>((await api().getProjectsByUid()).projects||[]).filter(p=>!p.deletedAt)
const 사진수=async pid=>((await api().getAssetsByProject(pid)).assets||[]).filter(a=>!a.deletedAt).length
const 만든것=[]
;(async()=>{
  fs.mkdirSync(path.join(root,'AD',폴더명),{recursive:true})
  fs.writeFileSync(path.join(root,'AD',폴더명,'컷.jpg'), await sharp({create:{width:330,height:230,channels:3,background:{r:20,g:170,b:120}}}).jpeg().toBuffer())
  let e=mk(); await e.start()
  for(let i=0;i<30;i++){await sleep(4000);const p=(await 목록()).find(x=>x.name===폴더명);if(p&&await 사진수(p.id))break}
  let p=(await 목록()).find(x=>x.name===폴더명)
  if(!p){console.log('중단');process.exit(1)} 만든것.push(p.id)
  const full=await api().getProject(p.id)
  ok('폴더 경로 열쇠가 심겼다', full.folderKey==='AD/'+폴더명, `folderKey=${full.folderKey}`)
  ok('분류 기준값도 적혔다', !!full.syncedCategory, `syncedCategory=${full.syncedCategory}`)
  try{await e.stop?.()}catch{}

  // ② 웹에서 이름 변경 → 다시 훑어도 중복 없어야
  await api().updateProject(p.id,{name:웹이름})
  fs.rmSync(state,{force:true})
  e=mk(); await e.start(); await sleep(28000)
  const 전부=await 목록()
  ok('웹에서 바꾼 이름이 그대로다', !!전부.find(x=>x.name===웹이름))
  ok('폴더명으로 새 프로젝트가 안 생겼다', !전부.find(x=>x.name===폴더명), 전부.find(x=>x.name===폴더명)?'중복 생김':'')
  try{await e.stop?.()}catch{}

  // ③ 폴더 분류 변경 → 웹이 따라온다
  fs.mkdirSync(path.join(root,'BEAUTY'),{recursive:true})
  fs.renameSync(path.join(root,'AD',폴더명), path.join(root,'BEAUTY',폴더명))
  fs.rmSync(state,{force:true})
  e=mk(); await e.start(); await sleep(28000)
  let cur=await api().getProject(p.id)
  ok('폴더를 옮기면 웹 분류가 따라온다', (cur.category||'').toUpperCase()==='BEAUTY', `웹=${cur.category}`)
  ok('내 폴더는 그대로다', fs.existsSync(path.join(root,'BEAUTY',폴더명,'컷.jpg')))
  try{await e.stop?.()}catch{}

  // ④ 웹에서 분류 변경 → 폴더가 따라 옮겨진다
  await api().updateProject(p.id,{category:'AD'})
  e=mk(); await e.start(); await sleep(28000)
  ok('웹에서 바꾸면 폴더가 따라 옮겨진다', fs.existsSync(path.join(root,'AD',폴더명,'컷.jpg')), fs.existsSync(path.join(root,'BEAUTY',폴더명))?'BEAUTY 에 그대로':'')
  cur=await api().getProject(p.id)
  ok('사진이 두 벌이 되지 않았다', (await 사진수(p.id))===1, `${await 사진수(p.id)}장`)
  ok('프로젝트도 하나뿐이다', (await 목록()).filter(x=>x.id===p.id||x.name===폴더명||x.name===웹이름).length===1)
  try{await e.stop?.()}catch{}

  for(const id of 만든것) await api().softDeleteProject(id).catch(()=>{})
  fs.rmSync(root,{recursive:true,force:true}); fs.rmSync(state,{force:true})
  console.log(fail?`\n${fail}가지 실패`:'\n전부 통과')
  process.exit(fail?1:0)
})().catch(e=>{console.error('터짐',e);process.exit(1)})
