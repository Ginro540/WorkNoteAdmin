import { useNavigate, useSearchParams } from 'react-router-dom'
import { Stack, Table, Text } from '@mantine/core'
import { useData } from '../data/session'
import { useMonthAttendance } from '../data/useMonthAttendance'
import { durationLabel, monthLabel, shortDayLabel } from '../core/workCalendar'
import { Loading, MonthSelect, PageTitle } from '../ui/common'

/** 全員の月の集計 */
export function AttendancePage() {
  const { currentMonth, users, activeUsers, period } = useData()
  const [params, setParams] = useSearchParams()
  const month = params.get('month') ?? currentMonth
  const navigate = useNavigate()
  const { users: months, loading } = useMonthAttendance(month)
  const range = period.dateRange(month)

  // 打刻がなくても在籍している人は全員出す。退職した人や users にいない人は、その月に打刻があれば出す
  const ids = [...new Set([...activeUsers.map((u) => u.id), ...months.keys()])]
  const nameOf = (id: string) => {
    const u = users.find((x) => x.id === id)
    return u ? `${u.displayName}${u.retiredAt ? '（退職）' : ''}` : '（不明なユーザー）'
  }

  return (
    <Stack p="md">
      <PageTitle title="勤怠">
        <MonthSelect value={month} onChange={(v) => setParams({ month: v }, { replace: true })} />
      </PageTitle>
      <Text size="sm" c="dimmed">
        {monthLabel(month)}分{range && `（${shortDayLabel(range.start)}〜${shortDayLabel(range.end)}）`}。名前を押すと日ごとの勤怠を開きます。
      </Text>
      {loading ? (
        <Loading />
      ) : (
        <Table.ScrollContainer minWidth={1040}>
          <Table highlightOnHover className="att-table">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>従業員</Table.Th>
                <Table.Th ta="right">出勤日数</Table.Th>
                <Table.Th ta="right">合計実働</Table.Th>
                <Table.Th ta="right">時間外</Table.Th>
                <Table.Th ta="right">退勤漏れ</Table.Th>
                <Table.Th ta="right">修正申請中</Table.Th>
                <Table.Th ta="right">有給</Table.Th>
                <Table.Th ta="right">特別休暇</Table.Th>
                <Table.Th ta="right">欠勤</Table.Th>
                <Table.Th ta="right">休暇申請中</Table.Th>
                <Table.Th ta="right">日報未提出</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {ids
                .sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'ja'))
                .map((id) => {
                  const m = months.get(id)
                  const warn = (n: number) => (n > 0 ? 'red' : undefined)
                  return (
                    <Table.Tr key={id} className="clickable" onClick={() => navigate(`/attendance/${id}?month=${month}`)}>
                      <Table.Td fw={600}>{nameOf(id)}</Table.Td>
                      <Table.Td ta="right" className="num">
                        {m?.totals.workDays ?? 0}日
                      </Table.Td>
                      <Table.Td ta="right" className="num">
                        {durationLabel(m?.totals.workMinutes ?? 0)}
                      </Table.Td>
                      <Table.Td ta="right" className="num">
                        {durationLabel(m?.totals.overtimeMinutes ?? 0)}
                      </Table.Td>
                      <Table.Td ta="right" className="num" c={warn(m?.totals.missingPunchDays ?? 0)}>
                        {m?.totals.missingPunchDays ?? 0}
                      </Table.Td>
                      <Table.Td ta="right" className="num" c={m?.pendingCorrections ? 'blue' : undefined}>
                        {m?.pendingCorrections ?? 0}
                      </Table.Td>
                      <Table.Td ta="right" className="num">
                        {m?.totals.paidLeaveDays ?? 0}
                      </Table.Td>
                      <Table.Td ta="right" className="num">
                        {m?.totals.specialLeaveDays ?? 0}
                      </Table.Td>
                      <Table.Td ta="right" className="num" c={m?.totals.absenceDays ? 'orange' : undefined}>
                        {m?.totals.absenceDays ?? 0}
                      </Table.Td>
                      <Table.Td ta="right" className="num" c={m?.pendingLeaves ? 'blue' : undefined}>
                        {m?.pendingLeaves ?? 0}
                      </Table.Td>
                      <Table.Td ta="right" className="num" c={warn(m?.missingReports ?? 0)}>
                        {m?.missingReports ?? 0}
                      </Table.Td>
                    </Table.Tr>
                  )
                })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      <Text size="xs" c="dimmed">
        実働・休憩の計算は従業員アプリと同じです（休憩のルールは「会社の設定」）。日報未提出は、打刻がある前日までの日のうち、提出済み・承認済みの日報がない日の数です（全日の休暇の日は数えません）。休暇の日数は承認済みのものだけで、半休は0.5日です。
      </Text>
    </Stack>
  )
}
