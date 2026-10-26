import { Link } from 'react-router-dom'
import { Alert, Card, Group, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core'
import { IconBeach, IconClockEdit, IconNotebook, IconReceipt } from '@tabler/icons-react'
import { useData } from '../data/session'
import { useMonthAttendance } from '../data/useMonthAttendance'
import { monthLabel, shiftMonthKey, shortDayLabelFromKey } from '../core/workCalendar'
import { usePendingCounts } from './Layout'
import { useNowAttendance } from '../data/useNowAttendance'

/** 出勤状況の人数（押すと「出勤状況」を開く） */
function NowSummary() {
  const { rows, loading } = useNowAttendance()
  const count = (...s: string[]) => rows.filter((r) => s.includes(r.status)).length
  const items = [
    { label: '勤務中', n: count('working', 'overnight'), color: 'green' },
    { label: '退勤', n: count('finished'), color: undefined },
    { label: '打刻漏れ', n: count('missingPunch'), color: 'orange' },
    { label: '未出勤', n: count('notYet'), color: 'red' },
    { label: '休暇', n: count('leave'), color: 'cyan' },
  ]
  return (
    <Card component={Link} to="/now" withBorder padding="lg">
      <Group justify="space-between" mb="xs">
        <Title order={5}>出勤状況</Title>
        <Text size="xs" c="dimmed">
          押すと一覧を開きます
        </Text>
      </Group>
      <SimpleGrid cols={{ base: 3, sm: 5 }}>
        {items.map((i) => (
          <Stack key={i.label} gap={0}>
            <Text size="sm" c="dimmed">
              {i.label}
            </Text>
            <Text fz={28} fw={700} className="num" c={i.n > 0 ? i.color : 'dimmed'}>
              {loading ? '…' : i.n}
              <Text span size="sm" c="dimmed" ml={4}>
                人
              </Text>
            </Text>
          </Stack>
        ))}
      </SimpleGrid>
    </Card>
  )
}

function CountCard({ to, label, count, icon }: { to: string; label: string; count: number; icon: React.ReactNode }) {
  return (
    <Card component={Link} to={to} withBorder padding="lg">
      <Group justify="space-between">
        <Stack gap={0}>
          <Text size="sm" c="dimmed">
            {label}
          </Text>
          <Text fz={36} fw={700} className="num">
            {count}
            <Text span size="sm" c="dimmed" ml={4}>
              件
            </Text>
          </Text>
        </Stack>
        {icon}
      </Group>
    </Card>
  )
}

/** 前日までの退勤漏れ（申請中・承認済みの修正がある日を除く。従業員アプリのホームと同じ） */
function MissingPunches({ month }: { month: string }) {
  const { userName, today } = useData()
  const { users } = useMonthAttendance(month)
  const rows = [...users.values()].flatMap((u) =>
    u.rows
      .filter((r) => r.flags.missingPunch && r.workDate < today && !r.corrections.some((c) => c.status === 'pending' || c.status === 'approved'))
      .map((r) => ({ userId: u.userId, workDate: r.workDate })),
  )
  if (rows.length === 0) return null
  return (
    <>
      {rows.map((r) => (
        <Table.Tr key={`${r.userId}-${r.workDate}`}>
          <Table.Td>
            <Link to={`/attendance/${r.userId}/${r.workDate}?month=${month}`}>{shortDayLabelFromKey(r.workDate)}</Link>
          </Table.Td>
          <Table.Td>{userName(r.userId)}</Table.Td>
          <Table.Td c="dimmed">{monthLabel(month)}分</Table.Td>
        </Table.Tr>
      ))}
    </>
  )
}

export function HomePage() {
  const counts = usePendingCounts()
  const { currentMonth, companyExists } = useData()
  return (
    <Stack p="md" maw={1000}>
      <Title order={3}>ホーム</Title>
      {!companyExists && <Alert color="yellow">会社の設定（settings/company）がまだ登録されていません。初期値で動いています。「会社の設定」で保存してください。</Alert>}
      <NowSummary />
      <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }}>
        <CountCard to="/reports" label="提出済みの日報" count={counts.reports} icon={<IconNotebook size={32} color="var(--mantine-color-indigo-5)" />} />
        <CountCard to="/expenses" label="申請済みの経費" count={counts.expenses} icon={<IconReceipt size={32} color="var(--mantine-color-indigo-5)" />} />
        <CountCard to="/corrections" label="申請中の修正申請" count={counts.corrections} icon={<IconClockEdit size={32} color="var(--mantine-color-indigo-5)" />} />
        <CountCard to="/leaves" label="申請中の休暇" count={counts.leaves} icon={<IconBeach size={32} color="var(--mantine-color-indigo-5)" />} />
      </SimpleGrid>
      <Card withBorder>
        <Title order={5} mb="xs">
          退勤漏れ（前日まで・修正申請がないもの）
        </Title>
        <Table>
          <Table.Tbody>
            <MissingPunches month={shiftMonthKey(currentMonth, -1)} />
            <MissingPunches month={currentMonth} />
          </Table.Tbody>
        </Table>
        <Text size="xs" c="dimmed" mt="xs">
          今月と前月の分を表示しています。日付を押すとその日の勤怠を開きます。
        </Text>
      </Card>
    </Stack>
  )
}
