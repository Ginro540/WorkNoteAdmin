// 1人分の打刻から、日ごとの集計を作る（従業員アプリの AttendanceStore と同じ判断）。
import { summarize, type BreakRule, type DaySummary } from '../core/attendance'
import { hasClockSkew, punchPoint, type AttendanceCorrection, type AttendancePunch } from './models'

/** 日付をまたぐ勤務を「勤務中」とみなす長さ。これを過ぎて退勤がなければ「退勤漏れ」 */
export const overnightLimitMs = 16 * 3600 * 1000

/** 勤務中の勤務日（最後の打刻が出勤で、今日か16時間以内）。punches はその人の最近の打刻 */
export function openWorkDate(punches: AttendancePunch[], today: string, now = new Date()): string | null {
  let last: AttendancePunch | null = null
  for (const p of punches) if (!last || p.punchedAt > last.punchedAt) last = p
  if (!last || last.kind !== 'in') return null
  if (last.workDate === today) return today
  return now.getTime() - last.punchedAt.getTime() < overnightLimitMs ? last.workDate : null
}

/** 承認された「休憩を取れなかった」申請の休憩時間（新しい申請を優先） */
export function approvedBreakOverride(corrections: AttendanceCorrection[], workDate: string): number | null {
  const list = corrections
    .filter((c) => c.workDate === workDate && c.kind === 'noBreak' && c.status === 'approved')
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  return list[0]?.requestedBreakMinutes ?? null
}

export interface DayRow {
  workDate: string
  punches: AttendancePunch[]
  summary: DaySummary
  breakOverride: number | null
  corrections: AttendanceCorrection[]
  flags: {
    missingPunch: boolean
    corrected: boolean
    clockSkew: boolean
    noLocation: boolean
    pendingCorrection: boolean
  }
}

export function dayRow(
  workDate: string,
  dayPunches: AttendancePunch[],
  corrections: AttendanceCorrection[],
  rules: BreakRule[],
  today: string,
  open: string | null,
): DayRow {
  const sorted = [...dayPunches].sort((a, b) => a.punchedAt.getTime() - b.punchedAt.getTime())
  const breakOverride = approvedBreakOverride(corrections, workDate)
  const summary = summarize(sorted.map(punchPoint), rules, breakOverride, workDate < today && workDate !== open)
  const dayCorrections = corrections.filter((c) => c.workDate === workDate)
  return {
    workDate,
    punches: sorted,
    summary,
    breakOverride,
    corrections: dayCorrections,
    flags: {
      missingPunch: summary.status === 'missingPunch',
      corrected: sorted.some((p) => p.corrected),
      clockSkew: sorted.some(hasClockSkew),
      noLocation: sorted.some((p) => p.locationStatus !== 'acquired' && p.locationStatus !== 'pending'),
      pendingCorrection: dayCorrections.some((c) => c.status === 'pending'),
    },
  }
}

/** 打刻を勤務日ごとにまとめる */
export function groupByWorkDate(punches: AttendancePunch[]): Map<string, AttendancePunch[]> {
  const map = new Map<string, AttendancePunch[]>()
  for (const p of punches) {
    const list = map.get(p.workDate)
    if (list) list.push(p)
    else map.set(p.workDate, [p])
  }
  return map
}

export interface MonthTotals {
  workDays: number
  workMinutes: number
  overtimeMinutes: number
  missingPunchDays: number
}

export function monthTotals(rows: DayRow[]): MonthTotals {
  let workDays = 0
  let workMinutes = 0
  let overtimeMinutes = 0
  let missingPunchDays = 0
  for (const r of rows) {
    if (r.summary.status !== 'off') workDays += 1
    workMinutes += r.summary.workMinutes ?? 0
    overtimeMinutes += r.summary.overtimeMinutes ?? 0
    if (r.flags.missingPunch) missingPunchDays += 1
  }
  return { workDays, workMinutes, overtimeMinutes, missingPunchDays }
}
