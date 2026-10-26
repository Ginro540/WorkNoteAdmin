import { useMemo } from 'react'
import { collection, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useQuery } from './firestore'
import { useData } from './session'
import { dayRow, groupByWorkDate, monthTotals, openWorkDate, type DayRow, type MonthTotals } from './attendanceDays'
import { parseCorrection, parsePunch, parseReport, type AttendanceCorrection, type AttendancePunch, type DailyReport } from './models'

export interface UserMonth {
  userId: string
  /** その月のすべての日（打刻のない日も含む） */
  rows: DayRow[]
  totals: MonthTotals
  pendingCorrections: number
  /** 打刻がある日に、提出済み・承認済みの日報がない日の数 */
  missingReports: number
  reportsByDate: Map<string, DailyReport>
}

/** 締め月の全員の打刻・修正申請・日報を読み、従業員ごとに日ごとの集計を作る */
export function useMonthAttendance(month: string, userId?: string) {
  const { period, company, today } = useData()
  const byUser = () => (userId ? [where('userId', '==', userId)] : []).concat(where('month', '==', month))
  const key = `${month}-${userId ?? 'all'}`
  const punches = useQuery(query(collection(db, 'attendancePunches'), ...byUser()), `punches-${key}`, parsePunch)
  const corrections = useQuery(query(collection(db, 'attendanceCorrections'), ...byUser()), `corrections-${key}`, parseCorrection)
  const reports = useQuery(query(collection(db, 'dailyReports'), ...byUser()), `reports-${key}`, parseReport)

  const users = useMemo(() => {
    const days = period.dayKeys(month)
    const punchesByUser = new Map<string, AttendancePunch[]>()
    for (const p of punches.items) punchesByUser.set(p.userId, [...(punchesByUser.get(p.userId) ?? []), p])
    const correctionsByUser = new Map<string, AttendanceCorrection[]>()
    for (const c of corrections.items) correctionsByUser.set(c.userId, [...(correctionsByUser.get(c.userId) ?? []), c])
    const reportsByUser = new Map<string, DailyReport[]>()
    for (const r of reports.items) reportsByUser.set(r.userId, [...(reportsByUser.get(r.userId) ?? []), r])

    const ids = new Set([...punchesByUser.keys(), ...correctionsByUser.keys(), ...(userId ? [userId] : [])])
    const result = new Map<string, UserMonth>()
    for (const uid of ids) {
      const list = punchesByUser.get(uid) ?? []
      const cs = correctionsByUser.get(uid) ?? []
      const open = openWorkDate(list, today)
      const grouped = groupByWorkDate(list)
      // 締め日を変えたあとの古いデータなど、月の範囲の外の勤務日も落とさない
      const allDays = [...new Set([...days, ...grouped.keys()])].sort()
      const rows = allDays.map((d) => dayRow(d, grouped.get(d) ?? [], cs, company.breakRules, today, open))
      const reportsByDate = new Map((reportsByUser.get(uid) ?? []).map((r) => [r.date, r]))
      result.set(uid, {
        userId: uid,
        rows,
        totals: monthTotals(rows),
        pendingCorrections: cs.filter((c) => c.status === 'pending').length,
        missingReports: rows.filter((r) => r.summary.status !== 'off' && r.workDate < today && !['submitted', 'approved'].includes(reportsByDate.get(r.workDate)?.status ?? '')).length,
        reportsByDate,
      })
    }
    return result
  }, [punches.items, corrections.items, reports.items, period, month, company.breakRules, today, userId])

  return {
    users,
    loading: punches.loading || corrections.loading || reports.loading,
    pendingPunchIds: punches.pending,
    corrections: corrections.items,
  }
}
