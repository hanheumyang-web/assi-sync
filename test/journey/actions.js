/* 사용자가 실제로 하는 행동들.
 *
 * 여기 있는 것만 한다. 사람이 안 하는 일(기록 파일 직접 고치기 같은 것)은 넣지 않는다 —
 * 그런 걸 넣으면 못 지킬 규칙 때문에 시험이 거짓말을 한다.
 *
 * 행동을 추가할 때는 "실제로 이렇게 쓰는 사람이 있나?" 를 먼저 물어라.
 */
const fs = require('fs')
const path = require('path')

const CATEGORIES = ['AD', 'BEAUTY', 'FASHION', 'PERSONAL WORK', 'TEST']
const WORDS = ['봄촬영', '가을화보', '스튜디오', '야외', '리허설', '본식', '제품컷', '룩북', '인터뷰', '테스트']

let counter = 0
const uid = () => `${Date.now().toString(36).slice(-4)}${(counter++).toString(36)}`

/** 사진처럼 생긴 진짜 JPEG 를 만든다 (sharp 로 인코딩 — 가짜 바이트는 서버가 거부한다) */
async function makePhoto(sharp, dest, seed) {
  const buf = await sharp({
    create: {
      width: 320 + (seed % 7) * 40, height: 240 + (seed % 5) * 30, channels: 3,
      background: { r: (seed * 37) % 255, g: (seed * 71) % 255, b: (seed * 113) % 255 },
    },
  }).jpeg({ quality: 70 + (seed % 20) }).toBuffer()
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, buf)
  return buf.length
}

const ls = d => (fs.existsSync(d) ? fs.readdirSync(d).filter(n => !n.startsWith('.')) : [])

/* 각 행동 = { name, weight, canRun(w), run(w) }
   w 는 세계 상태 — { root, sharp, prefix, expected, rng, engine, api, log } */
const ACTIONS = [
  {
    name: '새 폴더를 만들고 사진을 넣는다',
    weight: 5,
    canRun: w => w.expected.projects.size < 6,
    async run(w) {
      const cat = w.pick(CATEGORIES)
      const name = `${w.prefix}${w.pick(WORDS)}_${uid()}`
      const dir = path.join(w.root, cat, name)
      const n = 2 + Math.floor(w.rng() * 3)
      for (let i = 0; i < n; i++) {
        const rel = `${cat}/${name}/사진_${i + 1}.jpg`
        await makePhoto(w.sharp, path.join(w.root, rel), w.seedNext())
        w.expected.files.add(rel)
      }
      w.expected.projects.add(name)
      w.expected.assetCounts.set(name, n)
      w.expected.folders.set(name, `${cat}/${name}`)
      return `${cat}/${name} · 사진 ${n}장`
    },
  },
  {
    name: '기존 폴더에 사진을 더 넣는다',
    weight: 4,
    canRun: w => w.expected.folders.size > 0,
    async run(w) {
      const [name, key] = w.pickEntry(w.expected.folders)
      const dir = path.join(w.root, key)
      if (!fs.existsSync(dir)) return null
      const rel = `${key}/추가_${uid()}.jpg`
      await makePhoto(w.sharp, path.join(w.root, rel), w.seedNext())
      w.expected.files.add(rel)
      w.expected.assetCounts.set(name, (w.expected.assetCounts.get(name) || 0) + 1)
      return `${key} 에 1장 추가`
    },
  },
  {
    name: '사진 한 장을 지운다',
    weight: 3,
    canRun: w => w.expected.folders.size > 0,
    async run(w) {
      const [name, key] = w.pickEntry(w.expected.folders)
      const dir = path.join(w.root, key)
      const files = ls(dir)
      if (files.length <= 1) return null            // 마지막 한 장은 남긴다 (폴더 삭제와 구분)
      const target = w.pick(files)
      fs.unlinkSync(path.join(dir, target))
      w.expected.files.delete(`${key}/${target}`)
      w.expected.deletedFolders.add(key)            // 이 폴더에 대해선 물어봐도 된다
      return `${key}/${target} 지움`
    },
  },
  {
    name: '폴더를 다른 카테고리로 옮긴다',
    weight: 3,
    canRun: w => w.expected.folders.size > 0,
    async run(w) {
      const [name, key] = w.pickEntry(w.expected.folders)
      const from = path.join(w.root, key)
      if (!fs.existsSync(from)) return null
      const newCat = w.pick(CATEGORIES.filter(c => c !== key.split('/')[0]))
      const newKey = `${newCat}/${name}`
      const to = path.join(w.root, newKey)
      if (fs.existsSync(to)) return null
      fs.mkdirSync(path.dirname(to), { recursive: true })
      fs.renameSync(from, to)
      for (const rel of [...w.expected.files]) {
        if (rel.startsWith(key + '/')) {
          w.expected.files.delete(rel)
          w.expected.files.add(newKey + '/' + rel.slice(key.length + 1))
        }
      }
      w.expected.folders.set(name, newKey)
      return `${key} → ${newKey}`
    },
  },
  {
    name: '폴더를 지웠다가 같은 이름으로 다시 만든다',
    weight: 2,
    why: '테스터가 실제로 한 일 — 정리하다가 이렇게 된다',
    canRun: w => w.expected.folders.size > 0,
    async run(w) {
      const [name, key] = w.pickEntry(w.expected.folders)
      const dir = path.join(w.root, key)
      if (!fs.existsSync(dir)) return null
      fs.rmSync(dir, { recursive: true, force: true })
      for (const rel of [...w.expected.files]) if (rel.startsWith(key + '/')) w.expected.files.delete(rel)
      fs.mkdirSync(dir, { recursive: true })
      const n = 2
      for (let i = 0; i < n; i++) {
        const rel = `${key}/새로정리_${i + 1}.jpg`
        await makePhoto(w.sharp, path.join(w.root, rel), w.seedNext())
        w.expected.files.add(rel)
      }
      w.expected.deletedFolders.add(key)
      w.expected.assetCounts.set(name, (w.expected.assetCounts.get(name) || 0) + n)
      return `${key} 지우고 새 사진 ${n}장으로 다시 만듦`
    },
  },
  {
    name: '앱을 껐다 켠다',
    weight: 3,
    canRun: () => true,
    async run(w) {
      await w.restartEngine()
      return '엔진 재시작'
    },
  },
  {
    name: '웹에서 프로젝트를 휴지통에 넣는다',
    weight: 2,
    canRun: w => w.expected.projects.size > 1,
    async run(w) {
      const name = w.pick([...w.expected.projects])
      const p = (await w.web()).projects.find(x => x.name === name && !x.deletedAt)
      if (!p) return null
      await w.api().softDeleteProject(p.id)
      w.expected.projects.delete(name)
      const key = w.expected.folders.get(name)
      if (key) w.expected.deletedFolders.add(key)
      /* 로컬 원본은 곧 _Trash 로 옮겨진다 — 잃은 게 아니므로 규칙은 그대로 지켜진다 */
      await w.engine().triggerDownloadPollNow().catch(() => {})
      return `웹에서 ${name} 휴지통행`
    },
  },
  {
    name: '「웹→로컬」 버튼을 누른다',
    weight: 1,
    canRun: () => true,
    async run(w) {
      await w.engine().pullFromWebNow().catch(() => {})
      return '웹→로컬 받기'
    },
  },
  {
    name: '폴더 이름을 바꾼다',
    weight: 2,
    canRun: w => w.expected.folders.size > 0,
    async run(w) {
      const [name, key] = w.pickEntry(w.expected.folders)
      const from = path.join(w.root, key)
      if (!fs.existsSync(from)) return null
      const cat = key.split('/')[0]
      const newName = `${name}_고침`
      const newKey = `${cat}/${newName}`
      if (fs.existsSync(path.join(w.root, newKey))) return null
      fs.renameSync(from, path.join(w.root, newKey))
      for (const rel of [...w.expected.files]) {
        if (rel.startsWith(key + '/')) {
          w.expected.files.delete(rel)
          w.expected.files.add(newKey + '/' + rel.slice(key.length + 1))
        }
      }
      w.expected.folders.delete(name)
      w.expected.folders.set(newName, newKey)
      /* 이름이 바뀌면 웹에도 새 이름으로 생긴다 — 옛 이름은 더 이상 기대하지 않는다 */
      w.expected.projects.delete(name)
      w.expected.projects.add(newName)
      w.expected.assetCounts.set(newName, w.expected.assetCounts.get(name) || 0)
      w.expected.assetCounts.delete(name)
      w.expected.deletedFolders.add(key)
      return `${key} → ${newKey}`
    },
  },
]

module.exports = { ACTIONS, CATEGORIES, makePhoto, ls }
