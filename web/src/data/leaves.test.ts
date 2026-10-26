import { describe, expect, test } from 'vitest'
import { dayRow, isFullDayLeave, monthTotals } from './attendanceDays'
import { parseLeave, type LeaveRequest } from './models'

const leave = (date: string, kind: LeaveRequest['kind'], status: LeaveRequest['status']): LeaveRequest =>
  parseLeave(`${date}-${kind}-${status}`, { userId: 'u', date, kind, status, reason: '', groupId: 'g', createdAt: new Date() })!

describe('休暇', () => {
  test('知らない種類や足りないデータは読まない・古いデータも読める', () => {
    expect(parseLeave('x', { userId: 'u', date: '2026-11-01', kind: 'vacation' })).toBeNull()
    const l = parseLeave('x', { userId: 'u', date: '2026-11-01', kind: 'paid' })!
    expect(l.status).toBe('pending')
    expect(l.groupId).toBe('x')
    expect(l.month).toBe('2026-11')
  })
  test('承認済みだけを日数に数え、半休は0.5日', () => {
    const leaves = [
      leave('2026-10-01', 'paid', 'approved'),
      leave('2026-10-02', 'paidAm', 'approved'),
      leave('2026-10-05', 'special', 'approved'),
      leave('2026-10-06', 'absence', 'approved'),
      leave('2026-10-07', 'paid', 'pending'),
      leave('2026-10-08', 'paid', 'rejected'),
      leave('2026-10-09', 'paid', 'cancelled'),
    ]
    const rows = ['01', '02', '05', '06', '07', '08', '09'].map((d) => dayRow(`2026-10-${d}`, [], [], [], '2026-10-31', null, leaves))
    const t = monthTotals(rows)
    expect(t.paidLeaveDays).toBe(1.5)
    expect(t.specialLeaveDays).toBe(1)
    expect(t.absenceDays).toBe(1)
    expect(rows[4].leave).toBeNull()
    expect(rows[4].leaves).toHaveLength(1)
    expect(rows[5].leaves).toHaveLength(0)
    expect(isFullDayLeave(rows[0])).toBe(true)
    expect(isFullDayLeave(rows[1])).toBe(false)
  })
})
