import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ActionIcon, Alert, Badge, Button, Card, Chip, Drawer, Group, Menu, Modal, NumberInput, SegmentedControl, Stack, Table, Text, TextInput, Textarea } from '@mantine/core'
import { IconDots } from '@tabler/icons-react'
import { MapContainer, TileLayer, CircleMarker, Circle, Tooltip, useMap } from 'react-leaflet'
import { latLngBounds } from 'leaflet'
import { useData } from '../data/session'
import { useMonthAttendance } from '../data/useMonthAttendance'
import { addPunch, deletePunch, editPunchTime, setBreakMinutes } from '../data/actions'
import type { DayRow } from '../data/attendanceDays'
import {
  correctionKindLabel,
  correctionStatusLabel,
  hasClockSkew,
  locationDelayLabel,
  locationLabel,
  reportStatusLabel,
  reportSummaryLine,
  type AttendancePunch,
  type DailyReport,
} from '../data/models'
import { dayStatusLabel, punchKindLabel, type PunchKind } from '../core/attendance'
import { dateFromDayKey, dateTimeLabel, dayKey, durationLabel, jstParts, makeDate, monthLabel, shortDayLabelFromKey, timeLabel, weekday } from '../core/workCalendar'
import { Empty, Field, Loading, MonthSelect, PageTitle, PendingBadge, StatusBadge, UserSelect, runWrite } from '../ui/common'

type FlagFilter = 'all' | 'missingPunch' | 'corrected' | 'clockSkew' | 'noLocation' | 'pendingCorrection'

const flagLabels: Record<Exclude<FlagFilter, 'all'>, { label: string; color: string }> = {
  missingPunch: { label: '退勤漏れ', color: 'red' },
  corrected: { label: '修正済み', color: 'grape' },
  clockSkew: { label: '時刻のずれ', color: 'orange' },
  noLocation: { label: '位置なし', color: 'gray' },
  pendingCorrection: { label: '修正申請中', color: 'blue' },
}

const v = (m: number | null | undefined) => (m === null || m === undefined ? '—' : durationLabel(m))

/** 従業員ごとの月の勤怠 */
export function AttendanceUserPage() {
  const { uid: userId = '', date } = useParams()
  const { currentMonth, userName, holidayOn, period } = useData()
  const [params, setParams] = useSearchParams()
  const month = params.get('month') ?? (date ? (period.monthKeyForDayKey(date) ?? currentMonth) : currentMonth)
  const [flag, setFlag] = useState<FlagFilter>('all')
  const navigate = useNavigate()
  const { users, loading, pendingPunchIds } = useMonthAttendance(month, userId)
  const data = users.get(userId)
  const rows = (data?.rows ?? []).filter((r) => flag === 'all' || r.flags[flag])
  const selected = date ? data?.rows.find((r) => r.workDate === date) : undefined

  const dayClass = (key: string) => {
    const d = dateFromDayKey(key)!
    const w = weekday(d)
    if (w === 1 || holidayOn(key)) return 'sun'
    if (w === 7) return 'sat'
    return undefined
  }
  const open = (key: string) => navigate(`/attendance/${userId}/${key}?month=${month}`)

  return (
    <Stack p="md">
      <PageTitle title={`${userName(userId)}の勤怠`} back={`/attendance?month=${month}`}>
        <UserSelect value={userId} onChange={(v) => navigate(`/attendance/${v}?month=${month}`)} allLabel={null} />
        <MonthSelect value={month} onChange={(v) => setParams({ month: v }, { replace: true })} />
      </PageTitle>
      {data && (
        <Group gap="xl">
          <Field label="出勤日数">
            <Text fw={700}>{data.totals.workDays}日</Text>
          </Field>
          <Field label="合計実働">
            <Text fw={700}>{durationLabel(data.totals.workMinutes)}</Text>
          </Field>
          <Field label="時間外">
            <Text fw={700}>{durationLabel(data.totals.overtimeMinutes)}</Text>
          </Field>
          <Field label="退勤漏れ">
            <Text fw={700} c={data.totals.missingPunchDays ? 'red' : undefined}>
              {data.totals.missingPunchDays}日
            </Text>
          </Field>
          <Field label="日報未提出">
            <Text fw={700}>{data.missingReports}日</Text>
          </Field>
        </Group>
      )}
      <Chip.Group value={flag} onChange={(v) => setFlag(v as FlagFilter)}>
        <Group gap={6}>
          <Chip value="all" size="xs">
            すべての日
          </Chip>
          {Object.entries(flagLabels).map(([k, f]) => (
            <Chip key={k} value={k} size="xs" color={f.color}>
              {f.label}
            </Chip>
          ))}
        </Group>
      </Chip.Group>
      {loading ? (
        <Loading />
      ) : (
        <Table.ScrollContainer minWidth={1000}>
          <Table highlightOnHover className="att-table" verticalSpacing={6}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>日付</Table.Th>
                <Table.Th>最初の出勤</Table.Th>
                <Table.Th>最後の退勤</Table.Th>
                <Table.Th ta="right">拘束</Table.Th>
                <Table.Th ta="right">中抜け</Table.Th>
                <Table.Th ta="right">休憩</Table.Th>
                <Table.Th ta="right">実働</Table.Th>
                <Table.Th ta="right">時間外</Table.Th>
                <Table.Th>状態</Table.Th>
                <Table.Th>印</Table.Th>
                <Table.Th>備考（日報）</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((r) => {
                const report = data?.reportsByDate.get(r.workDate)
                const s = r.summary
                return (
                  <Table.Tr key={r.workDate} className="clickable" onClick={() => open(r.workDate)} bg={r.workDate === date ? 'var(--mantine-primary-color-light)' : undefined}>
                    <Table.Td className={dayClass(r.workDate)} fw={500}>
                      {shortDayLabelFromKey(r.workDate)}
                    </Table.Td>
                    <Table.Td className="num">{s.firstIn ? timeLabel(s.firstIn) : '—'}</Table.Td>
                    <Table.Td className="num">{s.lastOut ? timeLabel(s.lastOut) : '—'}</Table.Td>
                    <Table.Td ta="right" className="num">
                      {v(s.spanMinutes)}
                    </Table.Td>
                    <Table.Td ta="right" className="num">
                      {v(s.gapMinutes)}
                    </Table.Td>
                    <Table.Td ta="right" className="num">
                      {v(s.deductedBreakMinutes)}
                      {r.breakOverride !== null && s.status === 'finished' ? '*' : ''}
                    </Table.Td>
                    <Table.Td ta="right" className="num" fw={600}>
                      {v(s.workMinutes)}
                    </Table.Td>
                    <Table.Td ta="right" className="num">
                      {s.overtimeMinutes ? durationLabel(s.overtimeMinutes) : '—'}
                    </Table.Td>
                    <Table.Td c={s.status === 'missingPunch' ? 'red' : s.status === 'off' ? 'dimmed' : undefined}>
                      {s.status === 'off' && holidayOn(r.workDate) ? holidayOn(r.workDate)!.name : dayStatusLabel[s.status]}
                      {s.sessions.length > 1 ? `（${s.sessions.length}回）` : ''}
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4} wrap="nowrap">
                        {(Object.keys(flagLabels) as (keyof typeof flagLabels)[])
                          .filter((k) => r.flags[k])
                          .map((k) => (
                            <Badge key={k} size="xs" variant="light" color={flagLabels[k].color}>
                              {flagLabels[k].label}
                            </Badge>
                          ))}
                        {r.punches.some((p) => pendingPunchIds.has(p.id)) && <PendingBadge show />}
                      </Group>
                    </Table.Td>
                    <Table.Td className="memo">
                      <ReportMemo report={report} hasWork={s.status !== 'off'} />
                    </Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      {rows.length === 0 && !loading && <Empty>該当する日はありません</Empty>}
      <Text size="xs" c="dimmed">
        休憩の「*」は「休憩を取れなかった」の承認（または管理者の修正）で決めた休憩です。{monthLabel(month)}分を表示しています。
      </Text>
      <Drawer
        opened={!!date}
        onClose={() => navigate(`/attendance/${userId}?month=${month}`)}
        position="right"
        size="xl"
        title={date ? `${shortDayLabelFromKey(date)}　${userName(userId)}` : ''}
      >
        {date && <DayDetail userId={userId} workDate={date} row={selected} report={data?.reportsByDate.get(date)} />}
      </Drawer>
    </Stack>
  )
}

function ReportMemo({ report, hasWork }: { report: DailyReport | undefined; hasWork: boolean }) {
  if (!report) return hasWork ? <Text size="xs" c="orange">日報未提出</Text> : null
  const line = reportSummaryLine(report) || '内容なし'
  return (
    <Text size="xs" lineClamp={2}>
      {report.status === 'draft' ? '（下書き）' : ''}
      {line}
    </Text>
  )
}

// MARK: - 日ごとの詳細

function DayDetail({ userId, workDate, row, report }: { userId: string; workDate: string; row: DayRow | undefined; report: DailyReport | undefined }) {
  const { userName, holidayOn } = useData()
  const [editing, setEditing] = useState<{ mode: 'edit' | 'add' | 'delete' | 'break'; punch?: AttendancePunch } | null>(null)
  const punches = row?.punches ?? []
  const s = row?.summary
  const holiday = holidayOn(workDate)

  return (
    <Stack>
      {holiday && <Badge color="red" variant="light">{holiday.name}</Badge>}
      {s && (
        <Group gap="lg">
          <Field label="状態">{dayStatusLabel[s.status]}</Field>
          <Field label="拘束">{v(s.spanMinutes)}</Field>
          <Field label="中抜け">{v(s.gapMinutes)}</Field>
          <Field label={row?.breakOverride !== null ? '休憩（修正済み）' : '休憩（自動）'}>{v(s.deductedBreakMinutes)}</Field>
          <Field label="実働">
            <Text fw={700}>{v(s.workMinutes)}</Text>
          </Field>
          <Field label="時間外">{v(s.overtimeMinutes)}</Field>
        </Group>
      )}
      <Group gap="xs">
        <Button size="xs" onClick={() => setEditing({ mode: 'add' })}>
          打刻を追加
        </Button>
        <Button size="xs" variant="light" onClick={() => setEditing({ mode: 'break' })}>
          休憩を修正
        </Button>
      </Group>

      {punches.length === 0 ? (
        <Text c="dimmed" size="sm">
          この日の打刻はありません
        </Text>
      ) : (
        <Stack gap="xs">
          {punches.map((p) => (
            <Card key={p.id} withBorder padding="sm">
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Stack gap={2}>
                  <Group gap={6}>
                    <Badge color={p.kind === 'in' ? 'teal' : 'orange'} variant="filled">
                      {punchKindLabel(p.kind)}
                    </Badge>
                    <Text fw={700} size="lg" className="num">
                      {timeLabel(p.punchedAt)}
                    </Text>
                    {dayKey(p.punchedAt) !== workDate && <Text size="xs" c="dimmed">（{shortDayLabelFromKey(dayKey(p.punchedAt))}）</Text>}
                    {p.corrected && (
                      <Badge size="xs" variant="light" color="grape">
                        修正済み
                      </Badge>
                    )}
                    {hasClockSkew(p) && (
                      <Badge size="xs" variant="light" color="orange">
                        時刻のずれ
                      </Badge>
                    )}
                  </Group>
                  <Text size="sm">{locationLabel(p)}</Text>
                  <Text size="xs" c="dimmed">
                    {[
                      p.location && `誤差 ${Math.round(p.location.accuracy)}m`,
                      locationDelayLabel(p),
                      p.receivedAt && `サーバー受信 ${dateTimeLabel(p.receivedAt)}`,
                    ]
                      .filter(Boolean)
                      .join('・')}
                  </Text>
                  {p.originalPunchedAt && (
                    <Text size="xs" c="dimmed">
                      元の時刻 {dateTimeLabel(p.originalPunchedAt)}
                    </Text>
                  )}
                  {p.correctionId && (
                    <Text size="xs">
                      <Link to={`/corrections/${p.correctionId}?tab=done`}>修正申請で修正</Link>
                    </Text>
                  )}
                  {p.correctedBy && (
                    <Text size="xs" c="dimmed">
                      管理者（{userName(p.correctedBy)}）が{p.correctedAt ? `${dateTimeLabel(p.correctedAt)}に` : ''}修正：{p.correctionReason}
                    </Text>
                  )}
                </Stack>
                <Menu position="bottom-end">
                  <Menu.Target>
                    <ActionIcon variant="subtle" aria-label="操作">
                      <IconDots size={18} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item onClick={() => setEditing({ mode: 'edit', punch: p })}>時刻を修正</Menu.Item>
                    <Menu.Item color="red" onClick={() => setEditing({ mode: 'delete', punch: p })}>
                      削除
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Group>
            </Card>
          ))}
        </Stack>
      )}

      <PunchMap punches={punches} />

      <Card withBorder padding="sm">
        <Text size="xs" c="dimmed" fw={500}>
          日報
        </Text>
        {report ? (
          <Group justify="space-between">
            <Text size="sm">{reportSummaryLine(report) || '内容なし'}</Text>
            <Group gap={6}>
              <StatusBadge status={report.status} label={reportStatusLabel[report.status]} />
              <Button component={Link} to={`/reports/${report.id}?status=all&month=${report.month}`} size="xs" variant="light">
                開く
              </Button>
            </Group>
          </Group>
        ) : (
          <Text size="sm" c="dimmed">
            日報未提出
          </Text>
        )}
      </Card>

      {row && row.corrections.length > 0 && (
        <Card withBorder padding="sm">
          <Text size="xs" c="dimmed" fw={500} mb={4}>
            修正申請
          </Text>
          <Stack gap={4}>
            {row.corrections.map((c) => (
              <Group key={c.id} justify="space-between">
                <Text size="sm">
                  <Link to={`/corrections/${c.id}?tab=${c.status === 'pending' ? 'pending' : 'done'}&month=${c.month}`}>{correctionKindLabel[c.kind]}</Link>
                  <Text span size="xs" c="dimmed" ml={6}>
                    {dateTimeLabel(c.createdAt)}
                  </Text>
                </Text>
                <StatusBadge status={c.status} label={correctionStatusLabel[c.status]} />
              </Group>
            ))}
          </Stack>
        </Card>
      )}

      <PunchEditModal userId={userId} workDate={workDate} state={editing} onClose={() => setEditing(null)} />
    </Stack>
  )
}

/** 打刻場所の地図（出勤は緑、退勤はオレンジ。精度の円も出す） */
function PunchMap({ punches }: { punches: AttendancePunch[] }) {
  const located = punches.filter((p) => p.location)
  if (located.length === 0) return null
  return (
    <div className="punch-map">
      <MapContainer center={[located[0].location!.lat, located[0].location!.lng]} zoom={16} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {located.map((p) => {
          const color = p.kind === 'in' ? '#12b886' : '#fd7e14'
          const c: [number, number] = [p.location!.lat, p.location!.lng]
          return (
            <span key={p.id}>
              <Circle center={c} radius={Math.max(p.location!.accuracy, 5)} pathOptions={{ color, weight: 1, fillOpacity: 0.08 }} />
              <CircleMarker center={c} radius={8} pathOptions={{ color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 }}>
                <Tooltip>
                  {punchKindLabel(p.kind)} {timeLabel(p.punchedAt)}
                  <br />
                  {locationLabel(p)}
                </Tooltip>
              </CircleMarker>
            </span>
          )
        })}
        <FitBounds points={located.map((p) => [p.location!.lat, p.location!.lng] as [number, number])} />
      </MapContainer>
    </div>
  )
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap()
  const key = points.map((p) => p.join(',')).join(';')
  useEffect(() => {
    if (points.length > 1) map.fitBounds(latLngBounds(points), { padding: [30, 30], maxZoom: 17 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map])
  return null
}

// MARK: - 打刻の修正・追加・削除、休憩の修正

/** "YYYY-MM-DDTHH:mm"（日本時間）⇔ Date */
function toLocalInput(d: Date) {
  const p = jstParts(d)
  return `${dayKey(d)}T${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}
function fromLocalInput(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s)
  return m ? makeDate(+m[1], +m[2], +m[3], +m[4], +m[5]) : null
}

function PunchEditModal({
  userId,
  workDate,
  state,
  onClose,
}: {
  userId: string
  workDate: string
  state: { mode: 'edit' | 'add' | 'delete' | 'break'; punch?: AttendancePunch } | null
  onClose: () => void
}) {
  const { uid, period } = useData()
  const [time, setTime] = useState('')
  const [kind, setKind] = useState<PunchKind>('in')
  const [minutes, setMinutes] = useState<number | string>(0)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!state) return
    setReason('')
    setMinutes(0)
    setKind(state.punch?.kind ?? 'in')
    setTime(state.punch ? toLocalInput(state.punch.punchedAt) : `${workDate}T09:00`)
  }, [state, workDate])

  const parsed = fromLocalInput(time)
  const title = useMemo(() => {
    switch (state?.mode) {
      case 'edit':
        return '打刻の時刻を修正'
      case 'add':
        return '打刻を追加'
      case 'delete':
        return '打刻を削除'
      case 'break':
        return '休憩を修正'
      default:
        return ''
    }
  }, [state?.mode])
  // 勤務日の前日〜翌々日の範囲だけ（日付をまたぐ勤務のため翌日も許す）
  const base = dateFromDayKey(workDate)!
  const inRange = !!parsed && parsed.getTime() >= base.getTime() - 86400_000 && parsed.getTime() < base.getTime() + 2 * 86400_000
  const valid = reason.trim().length > 0 && (state?.mode === 'delete' || state?.mode === 'break' ? true : inRange) && (state?.mode !== 'break' || typeof minutes === 'number')

  const submit = async () => {
    if (!state) return
    setBusy(true)
    const r = reason.trim()
    let ok = false
    switch (state.mode) {
      case 'edit':
        ok = await runWrite(editPunchTime(state.punch!, parsed!, r, uid), '打刻を修正しました')
        break
      case 'add':
        ok = await runWrite(addPunch(userId, workDate, kind, parsed!, r, period, uid), '打刻を追加しました')
        break
      case 'delete':
        ok = await runWrite(deletePunch(state.punch!, r, uid), '打刻を削除しました')
        break
      case 'break':
        ok = await runWrite(setBreakMinutes(userId, workDate, Number(minutes), r, period, uid), '休憩を修正しました')
        break
    }
    setBusy(false)
    if (ok) onClose()
  }

  return (
    <Modal opened={!!state} onClose={onClose} title={title} centered>
      <Stack>
        {state?.mode === 'add' && (
          <SegmentedControl
            value={kind}
            onChange={(v) => setKind(v as PunchKind)}
            data={[
              { value: 'in', label: '出勤' },
              { value: 'out', label: '退勤' },
            ]}
          />
        )}
        {(state?.mode === 'edit' || state?.mode === 'add') && (
          <>
            <TextInput type="datetime-local" label="時刻（日本時間）" value={time} onChange={(e) => setTime(e.currentTarget.value)} error={time && !inRange ? '勤務日の前後の時刻にしてください' : undefined} />
            <Text size="xs" c="dimmed">
              勤務日は {shortDayLabelFromKey(workDate)} のままです。日付をまたぐ勤務は翌日の時刻を入れてください。
            </Text>
          </>
        )}
        {state?.mode === 'delete' && state.punch && (
          <Alert color="red">
            {punchKindLabel(state.punch.kind)} {dateTimeLabel(state.punch.punchedAt)} の打刻を削除します。削除前の内容は記録として残ります。
          </Alert>
        )}
        {state?.mode === 'break' && (
          <>
            <NumberInput label="この日の休憩（分）" min={0} max={600} value={minutes} onChange={setMinutes} />
            <Text size="xs" c="dimmed">
              承認済みの「休憩を取れなかった」として登録し、自動の休憩の代わりにこの時間を差し引きます。
            </Text>
          </>
        )}
        <Textarea label="理由（必須）" autosize minRows={2} value={reason} onChange={(e) => setReason(e.currentTarget.value)} />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            キャンセル
          </Button>
          <Button color={state?.mode === 'delete' ? 'red' : undefined} disabled={!valid} loading={busy} onClick={submit}>
            {state?.mode === 'delete' ? '削除する' : '保存する'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
