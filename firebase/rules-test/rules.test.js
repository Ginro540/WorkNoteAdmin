// firestore.rules のテスト（Firestore エミュレーターで動かす）。
//   cd firebase/rules-test && npm test
// 従業員側の制限が緩んでいないことと、管理者アプリの書き込みが通ることを確かめる。
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, test } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { Timestamp, deleteDoc, deleteField, doc, getDoc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore'

let env
const t = (s) => Timestamp.fromDate(new Date(s))

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-worknote',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  })
})
afterAll(() => env.cleanup())

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'users/admin'), { displayName: '管理者', email: 'a@example.com', role: 'admin', createdAt: t('2026-10-01') })
    await setDoc(doc(db, 'users/emp'), { displayName: '山田', email: 'e@example.com', role: 'employee', createdAt: t('2026-10-01') })
    await setDoc(doc(db, 'users/emp2'), { displayName: '佐藤', email: 'e2@example.com', role: 'employee', createdAt: t('2026-10-01') })
    const retired = { retiredAt: t('2026-10-20'), retiredBy: 'admin', retireDate: '2026-10-20', retireReason: '' }
    await setDoc(doc(db, 'users/gone'), { displayName: '退職', email: 'g@example.com', role: 'employee', createdAt: t('2026-10-01'), ...retired })
    await setDoc(doc(db, 'users/oldadmin'), { displayName: '元管理者', email: 'o@example.com', role: 'admin', createdAt: t('2026-10-01'), ...retired })
    await setDoc(doc(db, 'attendancePunches/g1'), { userId: 'gone', workDate: '2026-10-14', month: '2026-10', locationStatus: 'acquired', corrected: false, receivedAt: t('2026-10-14T00:00:00Z'), kind: 'in', punchedAt: t('2026-10-14T00:00:00Z') })
    const punch = { userId: 'emp', workDate: '2026-10-14', month: '2026-10', locationStatus: 'acquired', corrected: false, receivedAt: t('2026-10-14T00:00:00Z') }
    await setDoc(doc(db, 'attendancePunches/p1'), { ...punch, kind: 'in', punchedAt: t('2026-10-14T00:00:00Z') })
    await setDoc(doc(db, 'attendancePunches/p2'), { ...punch, kind: 'out', punchedAt: t('2026-10-14T09:00:00Z') })
    await setDoc(doc(db, 'attendancePunches/p3'), { ...punch, kind: 'in', punchedAt: t('2026-10-14T00:01:00Z') })
    const corr = { userId: 'emp', workDate: '2026-10-14', month: '2026-10', targetPunchIds: ['p1', 'p2'], kind: 'wrongTime', reason: '押し忘れ', createdAt: t('2026-10-15') }
    await setDoc(doc(db, 'attendanceCorrections/c1'), { ...corr, status: 'pending' })
    await setDoc(doc(db, 'attendanceCorrections/c2'), { ...corr, status: 'cancelled' })
    const report = { userId: 'emp', date: '2026-10-14', month: '2026-10', values: { content: '作業' }, siteIds: [], photoPaths: [], createdAt: t('2026-10-14'), updatedAt: t('2026-10-14') }
    await setDoc(doc(db, 'dailyReports/r1'), { ...report, status: 'submitted' })
    await setDoc(doc(db, 'dailyReports/r2'), { ...report, status: 'draft' })
    await setDoc(doc(db, 'dailyReports/r3'), { ...report, status: 'approved', approvedBy: 'admin', approvedAt: t('2026-10-16') })
    const expense = { userId: 'emp', usedOn: '2026-10-14', month: '2026-10', amount: 1200, vendor: 'ENEOS', categoryId: 'fuel', invoiceNumber: '', memo: '', ocrText: '', createdAt: t('2026-10-14') }
    await setDoc(doc(db, 'expenses/e1'), { ...expense, status: 'submitted' })
    await setDoc(doc(db, 'expenses/e2'), { ...expense, status: 'draft' })
    const leave = { userId: 'emp', date: '2026-11-04', month: '2026-11', kind: 'paid', reason: '', groupId: 'l1', createdAt: t('2026-10-25') }
    await setDoc(doc(db, 'leaveRequests/l1'), { ...leave, status: 'pending' })
    await setDoc(doc(db, 'leaveRequests/l2'), { ...leave, groupId: 'l2', status: 'approved', reviewedBy: 'admin', reviewedAt: t('2026-10-26') })
    await setDoc(doc(db, 'estimates/q1'), { number: '2026-0001', status: 'issued', title: '工事' })
    await setDoc(doc(db, 'estimates/q2'), { number: '2026-0002', status: 'draft', title: '工事' })
  })
})

const as = (uid) => env.authenticatedContext(uid).firestore()
const admin = () => as('admin')
const emp = () => as('emp')

describe('従業員（今までどおり制限されている）', () => {
  test('自分の打刻を追加できる（corrected: false）', async () => {
    await assertSucceeds(
      setDoc(doc(emp(), 'attendancePunches/new'), { userId: 'emp', workDate: '2026-10-20', month: '2026-10', kind: 'in', punchedAt: t('2026-10-20'), receivedAt: serverTimestamp(), corrected: false, locationStatus: 'pending' }),
    )
  })
  test('corrected: true の打刻は作れない', async () => {
    await assertFails(
      setDoc(doc(emp(), 'attendancePunches/new'), { userId: 'emp', workDate: '2026-10-20', month: '2026-10', kind: 'in', punchedAt: t('2026-10-20'), receivedAt: serverTimestamp(), corrected: true, locationStatus: 'unavailable', correctionId: 'x' }),
    )
  })
  test('打刻の時刻は変えられない・削除できない', async () => {
    await assertFails(updateDoc(doc(emp(), 'attendancePunches/p1'), { punchedAt: t('2026-10-14T01:00:00Z'), corrected: true, originalPunchedAt: t('2026-10-14T00:00:00Z'), correctedBy: 'emp', correctedAt: serverTimestamp(), correctionReason: 'x' }))
    await assertFails(deleteDoc(doc(emp(), 'attendancePunches/p1')))
  })
  test('他の人のデータは読めない', async () => {
    await assertFails(getDoc(doc(as('emp2'), 'attendancePunches/p1')))
    await assertFails(getDoc(doc(as('emp2'), 'dailyReports/r1')))
  })
  test('日報・経費・修正申請を承認できない', async () => {
    await assertFails(updateDoc(doc(emp(), 'dailyReports/r1'), { status: 'approved', approvedBy: 'emp', approvedAt: serverTimestamp() }))
    await assertFails(updateDoc(doc(emp(), 'expenses/e1'), { status: 'approved', reviewedBy: 'emp', reviewedAt: serverTimestamp() }))
    await assertFails(updateDoc(doc(emp(), 'attendanceCorrections/c1'), { status: 'approved', reviewedBy: 'emp', reviewedAt: serverTimestamp() }))
  })
  test('承認済みの「休憩を取れなかった」を自分で作れない', async () => {
    await assertFails(
      setDoc(doc(emp(), 'attendanceCorrections/new'), { userId: 'emp', workDate: '2026-10-14', month: '2026-10', targetPunchIds: [], kind: 'noBreak', requestedBreakMinutes: 0, reason: 'x', status: 'approved', createdBy: 'emp', reviewedBy: 'emp', reviewedAt: serverTimestamp(), createdAt: serverTimestamp() }),
    )
  })
  test('ユーザーを作れない・自分の権限を変えられない', async () => {
    await assertFails(setDoc(doc(emp(), 'users/x'), { displayName: 'x', email: 'x@example.com', role: 'employee', createdAt: serverTimestamp() }))
    await assertFails(updateDoc(doc(emp(), 'users/emp'), { role: 'admin' }))
    await assertSucceeds(updateDoc(doc(emp(), 'users/emp'), { displayName: '山田 太郎' }))
  })
  test('見積書・打刻の削除の記録は読めない', async () => {
    await assertFails(getDoc(doc(emp(), 'estimates/q1')))
    await assertFails(getDoc(doc(emp(), 'punchDeletions/p1')))
  })
  test('提出済みの日報は今までどおり直せる・承認済みは直せない', async () => {
    await assertSucceeds(updateDoc(doc(emp(), 'dailyReports/r1'), { values: { content: '修正' }, updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(doc(emp(), 'dailyReports/r3'), { values: { content: '修正' } }))
  })
})

describe('管理者：日報', () => {
  test('提出済みを承認できる', async () => {
    await assertSucceeds(updateDoc(doc(admin(), 'dailyReports/r1'), { status: 'approved', approvedBy: 'admin', approvedAt: serverTimestamp() }))
  })
  test('下書きは承認できない・承認者を偽れない', async () => {
    await assertFails(updateDoc(doc(admin(), 'dailyReports/r2'), { status: 'approved', approvedBy: 'admin', approvedAt: serverTimestamp() }))
    await assertFails(updateDoc(doc(admin(), 'dailyReports/r1'), { status: 'approved', approvedBy: 'emp', approvedAt: serverTimestamp() }))
  })
  test('差し戻し（下書きへ）は理由が必須', async () => {
    const ret = (reason) => ({ status: 'draft', returnReason: reason, returnedBy: 'admin', returnedAt: serverTimestamp(), approvedBy: deleteField(), approvedAt: deleteField() })
    await assertFails(updateDoc(doc(admin(), 'dailyReports/r1'), ret('')))
    await assertSucceeds(updateDoc(doc(admin(), 'dailyReports/r1'), ret('写真を足してください')))
    await assertSucceeds(updateDoc(doc(admin(), 'dailyReports/r3'), ret('現場名の誤り')))
  })
  test('内容は変えられない', async () => {
    await assertFails(updateDoc(doc(admin(), 'dailyReports/r1'), { status: 'approved', approvedBy: 'admin', approvedAt: serverTimestamp(), values: { content: 'x' } }))
  })
})

describe('管理者：経費', () => {
  test('承認・差し戻し', async () => {
    await assertSucceeds(updateDoc(doc(admin(), 'expenses/e1'), { status: 'approved', reviewedBy: 'admin', reviewedAt: serverTimestamp() }))
    await assertSucceeds(updateDoc(doc(admin(), 'expenses/e1'), { status: 'returned', returnReason: '領収書が違う', reviewedBy: 'admin', reviewedAt: serverTimestamp() }))
  })
  test('下書きは承認できない・金額は変えられない・理由なしの差し戻しはできない', async () => {
    await assertFails(updateDoc(doc(admin(), 'expenses/e2'), { status: 'approved', reviewedBy: 'admin', reviewedAt: serverTimestamp() }))
    await assertFails(updateDoc(doc(admin(), 'expenses/e1'), { status: 'approved', reviewedBy: 'admin', reviewedAt: serverTimestamp(), amount: 1 }))
    await assertFails(updateDoc(doc(admin(), 'expenses/e1'), { status: 'returned', returnReason: '', reviewedBy: 'admin', reviewedAt: serverTimestamp() }))
  })
})

describe('管理者：修正申請と打刻', () => {
  test('承認と打刻の書き換え・追加をまとめて書ける', async () => {
    const db = admin()
    const batch = writeBatch(db)
    batch.update(doc(db, 'attendancePunches/p1'), { punchedAt: t('2026-10-13T23:30:00Z'), corrected: true, correctionId: 'c1', originalPunchedAt: t('2026-10-14T00:00:00Z') })
    batch.set(doc(db, 'attendancePunches/new'), { userId: 'emp', workDate: '2026-10-14', month: '2026-10', kind: 'out', punchedAt: t('2026-10-14T10:00:00Z'), receivedAt: serverTimestamp(), locationStatus: 'unavailable', corrected: true, correctionId: 'c1' })
    batch.update(doc(db, 'attendanceCorrections/c1'), { status: 'approved', reviewedBy: 'admin', reviewedAt: serverTimestamp() })
    await assertSucceeds(batch.commit())
  })
  test('取り消された申請は承認できない・却下は理由が必須', async () => {
    await assertFails(updateDoc(doc(admin(), 'attendanceCorrections/c2'), { status: 'approved', reviewedBy: 'admin', reviewedAt: serverTimestamp() }))
    await assertFails(updateDoc(doc(admin(), 'attendanceCorrections/c1'), { status: 'rejected', reviewedBy: 'admin', reviewedAt: serverTimestamp() }))
    await assertSucceeds(updateDoc(doc(admin(), 'attendanceCorrections/c1'), { status: 'rejected', rejectReason: '時刻の根拠がない', reviewedBy: 'admin', reviewedAt: serverTimestamp() }))
  })
  test('直接修正：理由と元の時刻が必須、従業員・種類は変えられない', async () => {
    const base = { punchedAt: t('2026-10-14T00:10:00Z'), corrected: true, correctedBy: 'admin', correctedAt: serverTimestamp(), correctionReason: '打刻ミス' }
    await assertFails(updateDoc(doc(admin(), 'attendancePunches/p1'), base))
    await assertFails(updateDoc(doc(admin(), 'attendancePunches/p1'), { ...base, originalPunchedAt: t('2026-10-14T00:00:00Z'), correctionReason: '' }))
    await assertFails(updateDoc(doc(admin(), 'attendancePunches/p1'), { ...base, originalPunchedAt: t('2026-10-14T00:00:00Z'), userId: 'emp2' }))
    await assertFails(updateDoc(doc(admin(), 'attendancePunches/p1'), { ...base, originalPunchedAt: t('2026-10-14T00:00:00Z'), kind: 'out' }))
    await assertSucceeds(updateDoc(doc(admin(), 'attendancePunches/p1'), { ...base, originalPunchedAt: t('2026-10-14T00:00:00Z') }))
    // 2回目は元の時刻を変えずに直せる。元の時刻は書き換えられない
    await assertSucceeds(updateDoc(doc(admin(), 'attendancePunches/p1'), { ...base, punchedAt: t('2026-10-14T00:20:00Z') }))
    await assertFails(updateDoc(doc(admin(), 'attendancePunches/p1'), { ...base, originalPunchedAt: t('2026-10-14T00:20:00Z') }))
  })
  test('直接追加は理由が必須', async () => {
    const p = { userId: 'emp', workDate: '2026-10-15', month: '2026-10', kind: 'in', punchedAt: t('2026-10-15'), receivedAt: serverTimestamp(), locationStatus: 'unavailable', corrected: true, correctedBy: 'admin', correctedAt: serverTimestamp() }
    await assertFails(setDoc(doc(admin(), 'attendancePunches/a1'), { ...p, correctionReason: '' }))
    await assertSucceeds(setDoc(doc(admin(), 'attendancePunches/a1'), { ...p, correctionReason: '打刻漏れ（電話で確認）' }))
  })
  test('削除は記録と同時のときだけ。記録は変えられない', async () => {
    await assertFails(deleteDoc(doc(admin(), 'attendancePunches/p3')))
    const db = admin()
    const batch = writeBatch(db)
    batch.set(doc(db, 'punchDeletions/p3'), { punchId: 'p3', punch: { kind: 'in' }, userId: 'emp', workDate: '2026-10-14', reason: '二重押し', deletedBy: 'admin', deletedAt: serverTimestamp() })
    batch.delete(doc(db, 'attendancePunches/p3'))
    await assertSucceeds(batch.commit())
    await assertFails(updateDoc(doc(admin(), 'punchDeletions/p3'), { reason: 'x' }))
    await assertFails(deleteDoc(doc(admin(), 'punchDeletions/p3')))
    // 記録だけ作ることもできない
    await assertFails(setDoc(doc(admin(), 'punchDeletions/p1'), { punchId: 'p1', punch: {}, userId: 'emp', workDate: '2026-10-14', reason: 'x', deletedBy: 'admin', deletedAt: serverTimestamp() }))
  })
  test('休憩の修正（承認済みの noBreak を作る）', async () => {
    await assertSucceeds(
      setDoc(doc(admin(), 'attendanceCorrections/b1'), { userId: 'emp', workDate: '2026-10-14', month: '2026-10', targetPunchIds: [], kind: 'noBreak', requestedBreakMinutes: 0, reason: '休憩なし', status: 'approved', createdBy: 'admin', reviewedBy: 'admin', reviewedAt: serverTimestamp(), createdAt: serverTimestamp() }),
    )
  })
})

describe('管理者：従業員', () => {
  test('登録できる', async () => {
    await assertSucceeds(setDoc(doc(admin(), 'users/new'), { displayName: '新人', email: 'n@example.com', role: 'employee', createdAt: serverTimestamp() }))
    await assertFails(setDoc(doc(admin(), 'users/new2'), { displayName: '新人', email: 'n@example.com', role: 'owner', createdAt: serverTimestamp() }))
  })
  test('他の人の権限は変えられる・自分の権限は変えられない・メールは変えられない', async () => {
    await assertSucceeds(updateDoc(doc(admin(), 'users/emp'), { role: 'admin' }))
    await assertFails(updateDoc(doc(admin(), 'users/admin'), { role: 'employee' }))
    await assertFails(updateDoc(doc(admin(), 'users/emp2'), { email: 'x@example.com' }))
  })
})

describe('管理者：見積書', () => {
  test('読み書きでき、削除は下書きだけ', async () => {
    await assertSucceeds(getDoc(doc(admin(), 'estimates/q1')))
    await assertSucceeds(setDoc(doc(admin(), 'estimates/q3'), { number: '2026-0003', status: 'draft', title: 'x' }))
    await assertFails(deleteDoc(doc(admin(), 'estimates/q1')))
    await assertSucceeds(deleteDoc(doc(admin(), 'estimates/q2')))
  })
})

describe('退職', () => {
  const punch = (userId) => ({ userId, workDate: '2026-10-21', month: '2026-10', kind: 'in', punchedAt: t('2026-10-21'), receivedAt: serverTimestamp(), corrected: false, locationStatus: 'pending' })
  test('退職した人は自分のデータを読み書きできない（自分の users だけ読める）', async () => {
    const g = as('gone')
    await assertSucceeds(getDoc(doc(g, 'users/gone')))
    await assertFails(getDoc(doc(g, 'attendancePunches/g1')))
    await assertFails(setDoc(doc(g, 'attendancePunches/new'), punch('gone')))
    await assertFails(updateDoc(doc(g, 'users/gone'), { displayName: 'x' }))
    await assertFails(updateDoc(doc(g, 'users/gone'), { retiredAt: deleteField(), retiredBy: deleteField(), retireDate: deleteField(), retireReason: deleteField() }))
    await assertFails(getDoc(doc(g, 'settings/company')))
  })
  test('users/{uid} がないアカウントは何もできない', async () => {
    await assertFails(setDoc(doc(as('nodoc'), 'attendancePunches/new'), punch('nodoc')))
  })
  test('退職した管理者は管理者の操作ができない', async () => {
    const o = as('oldadmin')
    await assertFails(getDoc(doc(o, 'attendancePunches/p1')))
    await assertFails(updateDoc(doc(o, 'dailyReports/r1'), { status: 'approved', approvedBy: 'oldadmin', approvedAt: serverTimestamp() }))
  })
  test('管理者は退職にでき、取り消せる。自分は退職にできない', async () => {
    const r = { retiredAt: serverTimestamp(), retiredBy: 'admin', retireDate: '2026-10-31', retireReason: '自己都合' }
    await assertSucceeds(updateDoc(doc(admin(), 'users/emp'), r))
    await assertFails(setDoc(doc(emp(), 'attendancePunches/new'), punch('emp')))
    await assertSucceeds(updateDoc(doc(admin(), 'users/gone'), { retiredAt: deleteField(), retiredBy: deleteField(), retireDate: deleteField(), retireReason: deleteField() }))
    await assertSucceeds(setDoc(doc(as('gone'), 'attendancePunches/new2'), punch('gone')))
    await assertFails(updateDoc(doc(admin(), 'users/admin'), { ...r, retiredBy: 'admin' }))
    await assertFails(updateDoc(doc(admin(), 'users/emp2'), { ...r, retiredBy: 'someone' }))
    await assertFails(updateDoc(doc(admin(), 'users/emp2'), { ...r, retireDate: '10/31' }))
  })
  test('退職した人の過去の打刻は管理者が読める', async () => {
    await assertSucceeds(getDoc(doc(admin(), 'attendancePunches/g1')))
  })
})

describe('休暇', () => {
  const req = (userId, extra = {}) => ({ userId, date: '2026-11-10', month: '2026-11', kind: 'paid', reason: '', groupId: 'g', status: 'pending', createdAt: Timestamp.now(), ...extra })
  test('本人は申請できる（有給は理由なしでよい、欠勤は理由が必須）', async () => {
    await assertSucceeds(setDoc(doc(emp(), 'leaveRequests/n1'), req('emp')))
    await assertFails(setDoc(doc(emp(), 'leaveRequests/n2'), req('emp', { kind: 'absence' })))
    await assertSucceeds(setDoc(doc(emp(), 'leaveRequests/n3'), req('emp', { kind: 'absence', reason: '体調不良' })))
  })
  test('本人は他人の分・承認済み・知らない種類・余計なフィールドを作れない', async () => {
    await assertFails(setDoc(doc(emp(), 'leaveRequests/n1'), req('emp2')))
    await assertFails(setDoc(doc(emp(), 'leaveRequests/n2'), req('emp', { status: 'approved' })))
    await assertFails(setDoc(doc(emp(), 'leaveRequests/n3'), req('emp', { kind: 'vacation' })))
    await assertFails(setDoc(doc(emp(), 'leaveRequests/n4'), req('emp', { reviewedBy: 'emp' })))
    await assertFails(setDoc(doc(emp(), 'leaveRequests/n5'), req('emp', { date: '11/10' })))
  })
  test('本人は申請中だけ取り消せる。承認・削除はできない', async () => {
    await assertFails(updateDoc(doc(emp(), 'leaveRequests/l1'), { status: 'approved', reviewedBy: 'emp', reviewedAt: serverTimestamp() }))
    await assertFails(updateDoc(doc(emp(), 'leaveRequests/l2'), { status: 'cancelled', cancelledAt: Timestamp.now() }))
    await assertSucceeds(updateDoc(doc(emp(), 'leaveRequests/l1'), { status: 'cancelled', cancelledAt: Timestamp.now() }))
    await assertFails(deleteDoc(doc(emp(), 'leaveRequests/l1')))
  })
  test('他の人の休暇は読めない', async () => {
    await assertSucceeds(getDoc(doc(emp(), 'leaveRequests/l1')))
    await assertFails(getDoc(doc(as('emp2'), 'leaveRequests/l1')))
  })
  test('管理者は承認・却下（理由が必須）できる', async () => {
    await assertFails(updateDoc(doc(admin(), 'leaveRequests/l1'), { status: 'rejected', reviewedBy: 'admin', reviewedAt: serverTimestamp() }))
    await assertSucceeds(updateDoc(doc(admin(), 'leaveRequests/l1'), { status: 'rejected', rejectReason: '繁忙期のため', reviewedBy: 'admin', reviewedAt: serverTimestamp() }))
    await assertFails(updateDoc(doc(admin(), 'leaveRequests/l1'), { status: 'approved', reviewedBy: 'admin', reviewedAt: serverTimestamp() }))
  })
  test('管理者は承認済みを理由付きで取り消せる', async () => {
    await assertFails(updateDoc(doc(admin(), 'leaveRequests/l2'), { status: 'cancelled', cancelledAt: serverTimestamp(), cancelledBy: 'admin', cancelReason: '' }))
    await assertSucceeds(updateDoc(doc(admin(), 'leaveRequests/l2'), { status: 'cancelled', cancelledAt: serverTimestamp(), cancelledBy: 'admin', cancelReason: '出勤したため' }))
  })
  test('管理者は承認済みの休暇を直接登録できる', async () => {
    const r = req('emp', { status: 'approved', createdAt: serverTimestamp(), createdBy: 'admin', reviewedBy: 'admin', reviewedAt: serverTimestamp() })
    await assertSucceeds(setDoc(doc(admin(), 'leaveRequests/a1'), r))
    await assertFails(setDoc(doc(admin(), 'leaveRequests/a2'), { ...r, createdBy: 'emp' }))
    await assertFails(setDoc(doc(emp(), 'leaveRequests/a3'), r))
  })
  test('退職した人は申請できない', async () => {
    await assertFails(setDoc(doc(as('gone'), 'leaveRequests/n1'), req('gone')))
  })
})
