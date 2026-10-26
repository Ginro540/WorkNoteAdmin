// エミュレーターにテスト用のデータを入れる（本番には触れない）。
//   1. cd firebase && firebase emulators:start --project demo-worknote
//   2. node scripts/seed-emulator.mjs
//   3. cd web && npm run dev:emulator → http://127.0.0.1:5174
// ログイン：admin@example.com / password（ほかの人も password）
const project = 'demo-worknote'
const fs = `http://127.0.0.1:8080/v1/projects/${project}/databases/(default)/documents`
const authBase = 'http://127.0.0.1:9099'
const owner = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }

function value(v) {
  if (v === null) return { nullValue: null }
  if (v instanceof Date) return { timestampValue: v.toISOString() }
  if (typeof v === 'string') return { stringValue: v }
  if (typeof v === 'boolean') return { booleanValue: v }
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(value) } }
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, value(x)])) } }
}

async function ok(res) {
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json()
}

const put = (path, data) =>
  fetch(`${fs}/${path}`, { method: 'PATCH', headers: owner, body: JSON.stringify({ fields: value(data).mapValue.fields }) }).then(ok)

async function account(email, displayName) {
  const r = await fetch(`${authBase}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password', displayName, returnSecureToken: true }),
  }).then(ok)
  return r.localId
}

// 日本時間の「日付 時:分」
const jst = (day, hm) => new Date(`${day}T${hm}:00+09:00`)

await fetch(`${authBase}/emulator/v1/projects/${project}/accounts`, { method: 'DELETE' }).then(ok)
await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${project}/databases/(default)/documents`, { method: 'DELETE' }).then(ok)

const created = new Date('2026-10-01T00:00:00+09:00')
const admin = await account('admin@example.com', '管理 太郎')
const yamada = await account('yamada@example.com', '山田 花子')
const sato = await account('sato@example.com', '佐藤 次郎')
const gone = await account('retired@example.com', '退職 三郎')
// ログイン用のアカウントだけがある人（「すでに使われています」の案内を確かめる）
await account('orphan@example.com', '登録途中')

await put(`users/${admin}`, { displayName: '管理 太郎', email: 'admin@example.com', role: 'admin', createdAt: created })
await put(`users/${yamada}`, { displayName: '山田 花子', email: 'yamada@example.com', role: 'employee', createdAt: created })
await put(`users/${sato}`, { displayName: '佐藤 次郎', email: 'sato@example.com', role: 'employee', createdAt: created })
await put(`users/${gone}`, {
  displayName: '退職 三郎', email: 'retired@example.com', role: 'employee', createdAt: created,
  retiredAt: new Date('2026-10-20T18:00:00+09:00'), retiredBy: admin, retireDate: '2026-10-20', retireReason: '自己都合',
})

await put('settings/company', {
  closingDay: 0,
  correctionDeadlineBusinessDays: 3,
  breakRules: [{ overMinutes: 360, breakMinutes: 45 }, { overMinutes: 525, breakMinutes: 60 }],
  imageUploadEnabled: false,
})

let n = 0
async function day(uid, d, inAt, outAt) {
  for (const [kind, hm] of [['in', inAt], ['out', outAt]]) {
    if (!hm) continue
    const at = jst(d, hm)
    await put(`attendancePunches/p${++n}`, { userId: uid, workDate: d, month: d.slice(0, 7), kind, punchedAt: at, receivedAt: at, corrected: false, locationStatus: 'unavailable' })
  }
}
for (const d of ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-26']) {
  await day(yamada, d, '08:58', '18:05')
  await day(sato, d, '09:10', d === '2026-10-26' ? null : '17:30')
}
for (const d of ['2026-10-14', '2026-10-15', '2026-10-16']) await day(gone, d, '09:00', '18:00')

const report = (uid, d, status) => ({
  userId: uid, date: d, month: d.slice(0, 7), status, values: { content: '現場の作業', workTime: '9:00〜18:00' },
  siteIds: [], photoPaths: [], createdAt: jst(d, '18:10'), updatedAt: jst(d, '18:10'),
})
await put('dailyReports/r1', report(yamada, '2026-10-23', 'submitted'))
await put('dailyReports/r2', report(sato, '2026-10-23', 'submitted'))
await put('dailyReports/r3', report(gone, '2026-10-16', 'approved'))

await put('expenses/e1', {
  userId: yamada, usedOn: '2026-10-22', month: '2026-10', amount: 4800, vendor: 'ENEOS', categoryId: 'fuel',
  invoiceNumber: '', memo: '', ocrText: '', status: 'submitted', createdAt: jst('2026-10-22', '19:00'),
})

console.log('テスト用のデータを入れました。admin@example.com / password でログインできます')
