// 休暇の表示の部品（休暇・勤怠・出勤状況の画面で使う）
import { Badge } from '@mantine/core'
import { leaveDays, leaveKindShort, type LeaveKind, type LeaveRequest, type LeaveStatus } from '../data/models'
import { addDays, dateFromDayKey, dayKey, shortDayLabelFromKey } from '../core/workCalendar'

/** まとめて申請した日（groupId が同じ）を1つにする */
export interface LeaveGroup {
  id: string
  userId: string
  kind: LeaveKind
  reason: string
  status: LeaveStatus
  leaves: LeaveRequest[]
}

export function groupLeaves(leaves: LeaveRequest[]): LeaveGroup[] {
  const map = new Map<string, LeaveRequest[]>()
  // 同じグループでも状態が違う日（1日だけ取り消したなど）は分けて出す
  for (const l of leaves) {
    const key = `${l.groupId}|${l.status}|${l.kind}`
    map.set(key, [...(map.get(key) ?? []), l])
  }
  return [...map.entries()].map(([key, ls]) => {
    const sorted = [...ls].sort((a, b) => a.date.localeCompare(b.date))
    return { id: key, userId: sorted[0].userId, kind: sorted[0].kind, reason: sorted[0].reason, status: sorted[0].status, leaves: sorted }
  })
}

/** 「10/28（火）〜10/30（木） 3日」「10/28（火）, 10/31（金） 2日」 */
export function leaveDatesLabel(leaves: LeaveRequest[]): string {
  const dates = leaves.map((l) => l.date).sort()
  const days = leaves.reduce((s, l) => s + leaveDays(l.kind), 0)
  const consecutive = dates.every((d, i) => i === 0 || dayAfter(dates[i - 1]) === d)
  const range =
    dates.length === 1
      ? shortDayLabelFromKey(dates[0])
      : consecutive
        ? `${shortDayLabelFromKey(dates[0])}〜${shortDayLabelFromKey(dates[dates.length - 1])}`
        : dates.map(shortDayLabelFromKey).join(', ')
  return `${range}　${days}日`
}

function dayAfter(key: string) {
  const d = dateFromDayKey(key)
  return d ? dayKey(addDays(1, d)) : key
}

export function LeaveBadge({ leave }: { leave: LeaveRequest }) {
  return (
    <Badge size="sm" variant={leave.status === 'approved' ? 'filled' : 'outline'} color={leave.kind === 'absence' ? 'orange' : 'cyan'}>
      {leaveKindShort[leave.kind]}
      {leave.status === 'pending' ? '（申請中）' : ''}
    </Badge>
  )
}
