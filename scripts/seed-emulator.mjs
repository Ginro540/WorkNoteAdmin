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

// 今の時刻を基準にした打刻：「いまの出勤」を確かめる（勤務日は出勤した日の日本時間の日付）
const jstDay = (t) => new Date(t.getTime() + 9 * 3600e3).toISOString().slice(0, 10)
const ago = (h) => new Date(Date.now() - h * 3600e3)
const tanaka = await account('tanaka@example.com', '田中 夜勤')
const suzuki = await account('suzuki@example.com', '鈴木 未出勤')
await put(`users/${tanaka}`, { displayName: '田中 夜勤', email: 'tanaka@example.com', role: 'employee', createdAt: created })
await put(`users/${suzuki}`, { displayName: '鈴木 未出勤', email: 'suzuki@example.com', role: 'employee', createdAt: created })
const tenjin = { lat: 33.5902, lng: 130.4017, accuracy: 12, address: '福岡県福岡市中央区天神2丁目' }
const hakata = { lat: 33.5897, lng: 130.4207, accuracy: 15, address: '福岡県福岡市博多区博多駅前3丁目' }
async function punch(uid, workDate, kind, t, location) {
  await put(`attendancePunches/p${++n}`, {
    userId: uid, workDate, month: workDate.slice(0, 7), kind, punchedAt: t, receivedAt: t, corrected: false,
    ...(location ? { location: { ...location, locatedAt: t }, locationStatus: 'acquired' } : { locationStatus: 'denied' }),
  })
}
const todayKey = jstDay(new Date())
// 山田：今日 出勤したばかり。佐藤：今日 出勤・退勤済み。田中：前日の夜から勤務中（日付をまたぐ）
await punch(yamada, todayKey, 'in', new Date(Math.max(ago(0.5).getTime(), jst(todayKey, '00:00').getTime())), tenjin)
await punch(sato, todayKey, 'in', new Date(Math.max(ago(0.2).getTime() - 60e3, jst(todayKey, '00:00').getTime())), hakata)
await punch(sato, todayKey, 'out', ago(0.1), hakata)
const nightIn = ago(Math.max(5, (Date.now() - jst(todayKey, '00:00').getTime()) / 3600e3 + 2))
await punch(tanaka, jstDay(nightIn), 'in', nightIn, null)
await put('dailyReports/r4', {
  userId: sato, date: todayKey, month: todayKey.slice(0, 7), status: 'submitted', values: { content: '早朝の作業' },
  siteIds: [], photoPaths: [], createdAt: new Date(), updatedAt: new Date(),
})

// 休暇：山田は来週3日の有給を申請中、佐藤は今月に特別休暇（承認済み）、伊藤は今日が有給
const ito = await account('ito@example.com', '伊藤 有給')
await put(`users/${ito}`, { displayName: '伊藤 有給', email: 'ito@example.com', role: 'employee', createdAt: created })
const plusDays = (key, n) => new Date(new Date(`${key}T12:00:00+09:00`).getTime() + n * 86400e3 + 9 * 3600e3).toISOString().slice(0, 10)
const leave = (id, uid, date, kind, status, extra = {}) =>
  put(`leaveRequests/${id}`, { userId: uid, date, month: date.slice(0, 7), kind, reason: '', groupId: id, status, createdAt: new Date(), ...extra })
for (const [i, d] of [7, 8, 9].map((n, i) => [i, plusDays(todayKey, n)])) await leave(`lv_y${i}`, yamada, d, 'paid', 'pending', { groupId: 'lv_y0' })
await leave('lv_s', sato, '2026-10-02', 'special', 'approved', { reason: '親族の結婚式', reviewedBy: admin, reviewedAt: new Date() })
await leave('lv_i', ito, todayKey, 'paid', 'approved', { reviewedBy: admin, reviewedAt: new Date() })
await leave('lv_t', tanaka, plusDays(todayKey, 3), 'absence', 'pending', { reason: '通院' })

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
