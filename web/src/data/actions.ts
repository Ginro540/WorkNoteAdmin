// 管理者の書き込み。どれも firestore.rules の「管理者」の条件に合わせた形で書く。
// オフラインでも端末に保存され、つながったら送られる（見積番号の採番と従業員の追加を除く）。
import {
  Timestamp,
  collection,
  deleteField,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore'
import { deleteApp, initializeApp } from 'firebase/app'
import {
  createUserWithEmailAndPassword,
  getAuth,
  inMemoryPersistence,
  sendPasswordResetEmail,
  setPersistence,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { auth, db, firebaseConfig } from '../firebase'
import type { ClosingPeriod } from '../core/closingPeriod'
import type { PunchKind } from '../core/attendance'
import type { AttendanceCorrection, AttendancePunch, DailyReport, Estimate, Expense, Role } from './models'

const ts = (d: Date) => Timestamp.fromDate(d)

// MARK: - 日報

export function approveReports(reports: DailyReport[], adminUid: string) {
  const batch = writeBatch(db)
  for (const r of reports) {
    batch.update(doc(db, 'dailyReports', r.id), {
      status: 'approved',
      approvedBy: adminUid,
      approvedAt: serverTimestamp(),
    })
  }
  return batch.commit()
}

/** 差し戻し：下書きに戻す（従業員アプリの日報に「差し戻し」の状態はないため） */
export function returnReport(report: DailyReport, reason: string, adminUid: string) {
  return updateDoc(doc(db, 'dailyReports', report.id), {
    status: 'draft',
    returnReason: reason,
    returnedBy: adminUid,
    returnedAt: serverTimestamp(),
    approvedBy: deleteField(),
    approvedAt: deleteField(),
  })
}

// MARK: - 経費

export function approveExpenses(expenses: Expense[], adminUid: string) {
  const batch = writeBatch(db)
  for (const e of expenses) {
    batch.update(doc(db, 'expenses', e.id), {
      status: 'approved',
      reviewedBy: adminUid,
      reviewedAt: serverTimestamp(),
    })
  }
  return batch.commit()
}

export function returnExpense(expense: Expense, reason: string, adminUid: string) {
  return updateDoc(doc(db, 'expenses', expense.id), {
    status: 'returned',
    returnReason: reason,
    reviewedBy: adminUid,
    reviewedAt: serverTimestamp(),
  })
}

// MARK: - 打刻の修正申請

/** 承認したときに打刻をどう変えるか */
export interface PunchChange {
  kind: PunchKind
  time: Date
  /** 書き換える打刻（null なら追加） */
  punch: AttendancePunch | null
}

/** 申請の正しい時刻を、対象の打刻の書き換えか追加にする */
export function plannedChanges(c: AttendanceCorrection, dayPunches: AttendancePunch[]): PunchChange[] {
  if (c.kind === 'noBreak') return []
  const targets = dayPunches.filter((p) => c.targetPunchIds.includes(p.id))
  const changes: PunchChange[] = []
  const wanted: [PunchKind, Date | null][] = [
    ['in', c.requestedClockIn],
    ['out', c.requestedClockOut],
  ]
  for (const [kind, time] of wanted) {
    if (!time) continue
    changes.push({ kind, time, punch: targets.find((p) => p.kind === kind) ?? null })
  }
  return changes
}

/** 新しく追加する打刻（従業員の打刻と同じ形。位置は「位置なし」） */
function newPunchData(userId: string, workDate: string, kind: PunchKind, time: Date, period: ClosingPeriod, extra: DocumentData): DocumentData {
  return {
    userId,
    workDate,
    month: period.monthKeyForDayKey(workDate) ?? workDate.slice(0, 7),
    kind,
    punchedAt: ts(time),
    receivedAt: serverTimestamp(),
    locationStatus: 'unavailable',
    corrected: true,
    ...extra,
  }
}

export function approveCorrection(c: AttendanceCorrection, dayPunches: AttendancePunch[], period: ClosingPeriod, adminUid: string) {
  const batch = writeBatch(db)
  for (const change of plannedChanges(c, dayPunches)) {
    if (change.punch) {
      const fields: DocumentData = { punchedAt: ts(change.time), corrected: true, correctionId: c.id }
      if (!change.punch.originalPunchedAt) fields.originalPunchedAt = ts(change.punch.punchedAt)
      batch.update(doc(db, 'attendancePunches', change.punch.id), fields)
    } else {
      batch.set(doc(collection(db, 'attendancePunches')), newPunchData(c.userId, c.workDate, change.kind, change.time, period, { correctionId: c.id }))
    }
  }
  // ルールで「申請中」からの変更だけを許しているので、本人が取り消した申請は承認できない
  batch.update(doc(db, 'attendanceCorrections', c.id), {
    status: 'approved',
    reviewedBy: adminUid,
    reviewedAt: serverTimestamp(),
  })
  return batch.commit()
}

export function rejectCorrection(c: AttendanceCorrection, reason: string, adminUid: string) {
  return updateDoc(doc(db, 'attendanceCorrections', c.id), {
    status: 'rejected',
    rejectReason: reason,
    reviewedBy: adminUid,
    reviewedAt: serverTimestamp(),
  })
}

// MARK: - 管理者による打刻の直接修正

export function editPunchTime(punch: AttendancePunch, time: Date, reason: string, adminUid: string) {
  const fields: DocumentData = {
    punchedAt: ts(time),
    corrected: true,
    correctedBy: adminUid,
    correctedAt: serverTimestamp(),
    correctionReason: reason,
  }
  if (!punch.originalPunchedAt) fields.originalPunchedAt = ts(punch.punchedAt)
  return updateDoc(doc(db, 'attendancePunches', punch.id), fields)
}

export function addPunch(userId: string, workDate: string, kind: PunchKind, time: Date, reason: string, period: ClosingPeriod, adminUid: string) {
  return setDoc(
    doc(collection(db, 'attendancePunches')),
    newPunchData(userId, workDate, kind, time, period, {
      correctedBy: adminUid,
      correctedAt: serverTimestamp(),
      correctionReason: reason,
    }),
  )
}

/** 打刻を削除する。削除前の内容を punchDeletions/{打刻のID} に残す（ルールで同時の書き込みを必須にしている） */
export async function deletePunch(punch: AttendancePunch, reason: string, adminUid: string) {
  const ref = doc(db, 'attendancePunches', punch.id)
  const raw = (await getDoc(ref)).data() ?? {}
  const batch = writeBatch(db)
  batch.set(doc(db, 'punchDeletions', punch.id), {
    punchId: punch.id,
    punch: raw,
    userId: punch.userId,
    workDate: punch.workDate,
    reason,
    deletedBy: adminUid,
    deletedAt: serverTimestamp(),
  })
  batch.delete(ref)
  return batch.commit()
}

/** その日の休憩を指定した分にする（承認済みの「休憩を取れなかった」を管理者が作る） */
export function setBreakMinutes(userId: string, workDate: string, minutes: number, reason: string, period: ClosingPeriod, adminUid: string) {
  return setDoc(doc(collection(db, 'attendanceCorrections')), {
    userId,
    workDate,
    month: period.monthKeyForDayKey(workDate) ?? workDate.slice(0, 7),
    targetPunchIds: [],
    kind: 'noBreak',
    requestedBreakMinutes: minutes,
    reason,
    status: 'approved',
    createdBy: adminUid,
    reviewedBy: adminUid,
    reviewedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  })
}

// MARK: - 従業員

/** アカウントはできたが users/{uid} を書けなかった（再試行できるように uid を持つ） */
export class ProfileWriteError extends Error {
  readonly uid: string
  readonly cause: unknown
  constructor(uid: string, cause: unknown) {
    super('アカウントは作成できましたが、従業員の情報を保存できませんでした。')
    this.uid = uid
    this.cause = cause
  }
}

/**
 * 従業員のアカウントを作る。管理者のログインを切らないよう、2つ目の Firebase の接続でアカウントを作り、
 * users/{uid} は管理者の接続で書く。
 */
export async function createEmployee(email: string, password: string, displayName: string, role: Role): Promise<string> {
  const secondary = initializeApp(firebaseConfig, `create-user-${Date.now()}`)
  try {
    const secondaryAuth = getAuth(secondary)
    await setPersistence(secondaryAuth, inMemoryPersistence)
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password)
    await updateProfile(cred.user, { displayName }).catch(() => undefined)
    await signOut(secondaryAuth)
    try {
      await writeUserProfile(cred.user.uid, email, displayName, role)
    } catch (e) {
      throw new ProfileWriteError(cred.user.uid, e)
    }
    return cred.user.uid
  } finally {
    await deleteApp(secondary).catch(() => undefined)
  }
}

/** users/{uid} を書く（アカウントの作成後に失敗したときの再試行にも使う） */
export function writeUserProfile(uid: string, email: string, displayName: string, role: Role) {
  return setDoc(doc(db, 'users', uid), { displayName, email, role, createdAt: serverTimestamp() })
}

export function updateUser(uid: string, fields: { displayName?: string; role?: Role }) {
  return updateDoc(doc(db, 'users', uid), fields)
}

export function sendPasswordReset(email: string) {
  return sendPasswordResetEmail(auth, email)
}

// MARK: - 見積書

export type EstimateInput = Omit<Estimate, 'id' | 'number' | 'createdBy' | 'createdAt' | 'updatedAt'>

/** 新しい見積書を保存する。番号は settings/estimateCounter で年ごとに1つずつ増やす（つながっているときだけ） */
export async function createEstimate(input: EstimateInput, adminUid: string): Promise<string> {
  const ref = doc(collection(db, 'estimates'))
  const year = input.issueDate.slice(0, 4)
  await runTransaction(db, async (tx) => {
    const counterRef = doc(db, 'settings', 'estimateCounter')
    const counter = await tx.get(counterRef)
    const next = ((counter.data()?.[year] as number | undefined) ?? 0) + 1
    tx.set(counterRef, { [year]: next }, { merge: true })
    tx.set(ref, {
      ...input,
      number: `${year}-${String(next).padStart(4, '0')}`,
      createdBy: adminUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  })
  return ref.id
}

export function updateEstimate(id: string, input: EstimateInput) {
  return updateDoc(doc(db, 'estimates', id), { ...input, updatedAt: serverTimestamp() })
}
