import { useEffect, useMemo, useState } from 'react'
import { collection, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useQuery } from './firestore'
import { useData } from './session'
import { openWorkDate } from './attendanceDays'
import { isHalfDayLeave, parseLeave, parsePunch, parseReport, punchPoint, type AppUser, type AttendancePunch, type DailyReport, type LeaveRequest } from './models'
import { sessionMinutes, sessionsFrom, summarize } from '../core/attendance'
import { addDays, dateFromDayKey, dayKey } from '../core/workCalendar'

export type NowStatus = 'working' | 'overnight' | 'finished' | 'missingPunch' | 'notYet' | 'leave' | 'dayOff'

export const nowStatusLabel: Record<NowStatus, string> = {
  working: '勤務中',
  overnight: '前日から勤務中',
  finished: '退勤',
  missingPunch: '打刻漏れ',
  notYet: '未出勤',
  leave: '休暇',
  dayOff: '休み',
}

export interface NowRow {
  user: AppUser
  status: NowStatus
  /** 表示している勤務日（前日から勤務中なら前日） */
  workDate: string
  firstIn: Date | null
  lastOut: Date | null
  /** 最後の打刻（場所はこの打刻のもの） */
  lastPunch: AttendancePunch | null
  /** 勤務中：休憩を引く前の経過時間。退勤：実働 */
  minutes: number | null
  report: DailyReport | null
  /** その日の申請中・承認済みの休暇 */
  leave: LeaveRequest | null
}

/** 今日（と日付をまたぐ勤務のための前日）の打刻から、在籍している人ごとの今の状態を作る。打刻があるとすぐ更新される */
export function useNowAttendance() {
  const { activeUsers, company, today, businessDays } = useData()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const todayDate = dateFromDayKey(today)
  const yesterday = todayDate ? dayKey(addDays(-1, todayDate)) : today
  const days = [yesterday, today]
  const punches = useQuery(query(collection(db, 'attendancePunches'), where('workDate', 'in', days)), `now-punches-${today}`, parsePunch)
  const reports = useQuery(query(collection(db, 'dailyReports'), where('date', 'in', days)), `now-reports-${today}`, parseReport)
  const leaves = useQuery(query(collection(db, 'leaveRequests'), where('date', 'in', days)), `now-leaves-${today}`, parseLeave)

  const rows = useMemo(() => {
    const isDayOff = todayDate ? !businessDays.isBusinessDay(todayDate) : false
    return activeUsers.map((user): NowRow => {
      const mine = punches.items.filter((p) => p.userId === user.id)
      const open = openWorkDate(mine, today, now)
      const workDate = open ?? today
      const dayPunches = mine.filter((p) => p.workDate === workDate).sort((a, b) => a.punchedAt.getTime() - b.punchedAt.getTime())
      const report = reports.items.find((r) => r.userId === user.id && r.date === workDate) ?? null
      const lastPunch = dayPunches[dayPunches.length - 1] ?? null
      const dayLeaves = leaves.items.filter((l) => l.userId === user.id && l.date === workDate && (l.status === 'approved' || l.status === 'pending'))
      const leave = dayLeaves.find((l) => l.status === 'approved') ?? dayLeaves[0] ?? null
      const base = { user, workDate, lastPunch, report, leave }
      if (dayPunches.length === 0) {
        const onLeave = leave?.status === 'approved' && !isHalfDayLeave(leave.kind)
        return { ...base, status: onLeave ? 'leave' : isDayOff ? 'dayOff' : 'notYet', firstIn: null, lastOut: null, minutes: null }
      }

      const summary = summarize(dayPunches.map(punchPoint), company.breakRules)
      if (open) {
        const sessions = sessionsFrom(dayPunches.map(punchPoint))
        const done = sessions.reduce((sum, s) => sum + (sessionMinutes(s) ?? 0), 0)
        const elapsed = Math.max(0, Math.trunc((now.getTime() - lastPunch!.punchedAt.getTime()) / 60000))
        return { ...base, status: open === today ? 'working' : 'overnight', firstIn: summary.firstIn, lastOut: summary.lastOut, minutes: done + elapsed }
      }
      return {
        ...base,
        status: summary.status === 'finished' ? 'finished' : 'missingPunch',
        firstIn: summary.firstIn,
        lastOut: summary.lastOut,
        minutes: summary.workMinutes,
      }
    })
  }, [activeUsers, punches.items, reports.items, leaves.items, company.breakRules, today, todayDate, businessDays, now])

  return { rows, loading: punches.loading || reports.loading || leaves.loading, error: punches.error ?? reports.error ?? leaves.error }
}
