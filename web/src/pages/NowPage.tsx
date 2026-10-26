import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Anchor, Badge, Chip, Group, Stack, Table, Text } from '@mantine/core'
import { useData } from '../data/session'
import { nowStatusLabel, useNowAttendance, type NowRow, type NowStatus } from '../data/useNowAttendance'
import { locationLabel, reportStatusLabel } from '../data/models'
import { punchKindLabel } from '../core/attendance'
import { durationLabel, shortDayLabelFromKey, timeLabel } from '../core/workCalendar'
import { Loading, PageTitle, errorMessage } from '../ui/common'
import { LeaveBadge } from '../ui/leaves'

const order: NowStatus[] = ['working', 'overnight', 'missingPunch', 'finished', 'notYet', 'leave', 'dayOff']

const statusColor: Record<NowStatus, string> = {
  working: 'green',
  overnight: 'teal',
  finished: 'gray',
  missingPunch: 'orange',
  notYet: 'red',
  leave: 'cyan',
  dayOff: 'gray',
}

export function StatusBadge({ status }: { status: NowStatus }) {
  return (
    <Badge color={statusColor[status]} variant={status === 'working' || status === 'overnight' ? 'filled' : 'light'}>
      {nowStatusLabel[status]}
    </Badge>
  )
}

function Place({ row }: { row: NowRow }) {
  const p = row.lastPunch
  if (!p) return <Text c="dimmed">—</Text>
  const label = locationLabel(p)
  return (
    <Stack gap={0}>
      <Text size="xs" c="dimmed">
        {punchKindLabel(p.kind)} {timeLabel(p.punchedAt)} の場所
      </Text>
      {p.location ? (
        <Anchor href={`https://www.google.com/maps?q=${p.location.lat},${p.location.lng}`} target="_blank" size="sm" onClick={(e) => e.stopPropagation()}>
          {label}
        </Anchor>
      ) : (
        <Text size="sm" c="dimmed">
          {label}
        </Text>
      )}
    </Stack>
  )
}

/** 出勤状況：在籍している全員の今日の打刻の状況と、最後に打刻した場所。打刻があるとすぐ更新される */
export function NowPage() {
  const { today, holidayOn, period } = useData()
  const navigate = useNavigate()
  const { rows, loading, error } = useNowAttendance()
  const [filter, setFilter] = useState<NowStatus | 'all'>('all')

  const counts = new Map<NowStatus, number>()
  for (const r of rows) counts.set(r.status, (counts.get(r.status) ?? 0) + 1)
  const sorted = [...rows].sort(
    (a, b) =>
      order.indexOf(a.status) - order.indexOf(b.status) ||
      (a.firstIn?.getTime() ?? 0) - (b.firstIn?.getTime() ?? 0) ||
      a.user.displayName.localeCompare(b.user.displayName, 'ja'),
  )
  const shown = filter === 'all' ? sorted : sorted.filter((r) => r.status === filter)
  const holiday = holidayOn(today)

  return (
    <Stack p="md">
      <PageTitle title="出勤状況" />
      <Text size="sm" c="dimmed">
        {shortDayLabelFromKey(today)}
        {holiday && `（${holiday.name}）`}。打刻があると自動で更新されます。場所は打刻したときの位置です。電波のない所で押した打刻は、つながってから表示されます。
      </Text>
      {error && <Alert color="red">{errorMessage(error)}</Alert>}
      <Chip.Group value={filter} onChange={(v) => setFilter(v as NowStatus | 'all')}>
        <Group gap="xs">
          <Chip value="all" size="sm">
            全員 {rows.length}
          </Chip>
          {order
            .filter((s) => counts.get(s))
            .map((s) => (
              <Chip key={s} value={s} size="sm" color={statusColor[s]}>
                {nowStatusLabel[s]} {counts.get(s)}
              </Chip>
            ))}
        </Group>
      </Chip.Group>
      {loading ? (
        <Loading />
      ) : (
        <Table.ScrollContainer minWidth={820}>
          <Table highlightOnHover verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>従業員</Table.Th>
                <Table.Th>状態</Table.Th>
                <Table.Th>出勤</Table.Th>
                <Table.Th>退勤</Table.Th>
                <Table.Th ta="right">経過・実働</Table.Th>
                <Table.Th>場所</Table.Th>
                <Table.Th>日報</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {shown.map((r) => {
                const open = r.status === 'working' || r.status === 'overnight'
                return (
                  <Table.Tr
                    key={r.user.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/attendance/${r.user.id}/${r.workDate}?month=${period.monthKeyForDayKey(r.workDate) ?? r.workDate.slice(0, 7)}`)}
                  >
                    <Table.Td fw={600}>{r.user.displayName || r.user.email}</Table.Td>
                    <Table.Td>
                      <Group gap={4}>
                        <StatusBadge status={r.status} />
                        {r.leave && (r.status !== 'leave' || r.leave.status === 'pending') && <LeaveBadge leave={r.leave} />}
                      </Group>
                      {r.status === 'overnight' && (
                        <Text size="xs" c="dimmed">
                          {shortDayLabelFromKey(r.workDate)}の勤務
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td className="num">{r.firstIn ? timeLabel(r.firstIn) : '—'}</Table.Td>
                    <Table.Td className="num">{open ? '—' : r.lastOut ? timeLabel(r.lastOut) : '—'}</Table.Td>
                    <Table.Td ta="right" className="num">
                      {r.minutes === null ? '—' : open ? `${durationLabel(r.minutes)} 経過` : durationLabel(r.minutes)}
                    </Table.Td>
                    <Table.Td>
                      <Place row={r} />
                    </Table.Td>
                    <Table.Td>
                      {r.report && r.report.status !== 'draft' ? (
                        <Text size="sm">{reportStatusLabel[r.report.status]}</Text>
                      ) : r.lastPunch ? (
                        <Text size="sm" c="dimmed">
                          未提出
                        </Text>
                      ) : (
                        <Text c="dimmed">—</Text>
                      )}
                    </Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      <Text size="xs" c="dimmed">
        「経過」は出勤してからの時間で、休憩はまだ引いていません。「退勤」には中抜けしている人も含みます（もう一度出勤すると「勤務中」に戻ります）。名前を押すとその日の勤怠を開きます。
      </Text>
    </Stack>
  )
}
