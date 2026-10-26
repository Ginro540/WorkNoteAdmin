import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Alert, Badge, Button, Card, Divider, Grid, Group, SegmentedControl, Stack, Table, Text } from '@mantine/core'
import { collection, doc, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useDocument, useQuery } from '../data/firestore'
import { useData } from '../data/session'
import { approveCorrection, plannedChanges, rejectCorrection } from '../data/actions'
import { dayRow, openWorkDate } from '../data/attendanceDays'
import {
  correctionKindLabel,
  correctionStatusLabel,
  parseCorrection,
  parsePunch,
  type AttendanceCorrection,
  type AttendancePunch,
} from '../data/models'
import { punchKindLabel, type DaySummary } from '../core/attendance'
import { dateTimeLabel, durationLabel, shortDayLabel, shortDayLabelFromKey, timeLabel } from '../core/workCalendar'
import { Empty, Field, ListDetail, Loading, MonthSelect, PageTitle, PendingBadge, ReasonModal, StatusBadge, UserSelect, runWrite } from '../ui/common'

export function CorrectionsPage() {
  const { id } = useParams()
  const { currentMonth, userName, businessDays, period, company } = useData()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'pending'
  const month = params.get('month') ?? currentMonth
  const user = params.get('user') ?? 'all'
  const navigate = useNavigate()
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    next.set(k, v)
    setParams(next, { replace: true })
  }

  const q =
    tab === 'pending'
      ? query(collection(db, 'attendanceCorrections'), where('status', '==', 'pending'))
      : query(collection(db, 'attendanceCorrections'), where('month', '==', month))
  const { items, pending, loading } = useQuery(q, `corrections-${tab}-${tab === 'pending' ? '' : month}`, parseCorrection)
  const list = useMemo(
    () =>
      items
        .filter((c) => (tab === 'pending' ? c.status === 'pending' : c.status !== 'pending') && (user === 'all' || c.userId === user))
        .sort((a, b) => (tab === 'pending' ? a.createdAt.getTime() - b.createdAt.getTime() : b.createdAt.getTime() - a.createdAt.getTime())),
    [items, tab, user],
  )

  const listPane = (
    <Stack gap={0}>
      <Stack p="md" gap="xs">
        <PageTitle title="打刻の修正申請" />
        <SegmentedControl
          value={tab}
          onChange={(v) => set('tab', v)}
          data={[
            { value: 'pending', label: '申請中' },
            { value: 'done', label: '処理済み' },
          ]}
          size="xs"
          fullWidth
        />
        <Group gap="xs">
          {tab !== 'pending' && <MonthSelect value={month} onChange={(v) => set('month', v)} />}
          <UserSelect value={user} onChange={(v) => set('user', v)} />
        </Group>
        <Text size="xs" c="dimmed">
          {list.length}件{tab === 'pending' ? '（古い順）' : ''}
        </Text>
      </Stack>
      <Divider />
      {loading ? (
        <Loading />
      ) : list.length === 0 ? (
        <Empty>{tab === 'pending' ? '申請中の修正申請はありません' : '該当する修正申請はありません'}</Empty>
      ) : (
        list.map((c) => {
          const deadline = businessDays.correctionDeadline(c.month, period, company.correctionDeadlineBusinessDays)
          return (
            <div key={c.id} className={`list-row ${c.id === id ? 'active' : ''}`} onClick={() => navigate(`/corrections/${c.id}?${params.toString()}`)}>
              <Group justify="space-between" wrap="nowrap">
                <Text fw={600} size="sm">
                  {shortDayLabelFromKey(c.workDate)}　{userName(c.userId)}
                </Text>
                <Group gap={4} wrap="nowrap">
                  <PendingBadge show={pending.has(c.id)} />
                  <StatusBadge status={c.status} label={correctionStatusLabel[c.status]} />
                </Group>
              </Group>
              <Text size="xs" c="dimmed">
                {correctionKindLabel[c.kind]}・申請 {dateTimeLabel(c.createdAt)}
                {c.status === 'pending' && deadline && `・期限 ${shortDayLabel(deadline)}`}
              </Text>
            </div>
          )
        })
      )}
    </Stack>
  )
  return (
    <ListDetail
      hasDetail={!!id}
      list={listPane}
      detail={id ? <CorrectionDetail id={id} backTo={`/corrections?${params.toString()}`} /> : <Empty>左の一覧から修正申請を選んでください</Empty>}
    />
  )
}

function CorrectionDetail({ id, backTo }: { id: string; backTo: string }) {
  const { userName, uid, period, company, today } = useData()
  const { data: c, loading, pending } = useDocument(doc(db, 'attendanceCorrections', id), `correction-${id}`, parseCorrection)
  const [rejecting, setRejecting] = useState(false)
  if (loading) return <Loading />
  if (!c) return <Empty>修正申請が見つかりません</Empty>
  return (
    <Stack p="md" maw={1000}>
      <PageTitle title={`${shortDayLabelFromKey(c.workDate)}　${correctionKindLabel[c.kind]}`} back={backTo}>
        <PendingBadge show={pending} />
        <StatusBadge status={c.status} label={correctionStatusLabel[c.status]} />
      </PageTitle>
      <Card withBorder>
        <Stack gap="sm">
          <Group gap="xl">
            <Field label="従業員">
              <Link to={`/attendance/${c.userId}/${c.workDate}?month=${c.month}`}>{userName(c.userId)}</Link>
            </Field>
            <Field label="勤務日">{shortDayLabelFromKey(c.workDate)}</Field>
            <Field label="申請">{dateTimeLabel(c.createdAt)}</Field>
            {c.createdBy && <Field label="作成">{`管理者（${userName(c.createdBy)}）`}</Field>}
          </Group>
          <Group gap="xl">
            {c.requestedClockIn && <Field label="正しい出勤">{dateTimeLabel(c.requestedClockIn)}</Field>}
            {c.requestedClockOut && <Field label="正しい退勤">{dateTimeLabel(c.requestedClockOut)}</Field>}
            {c.requestedBreakMinutes !== null && <Field label="実際の休憩">{`${c.requestedBreakMinutes}分`}</Field>}
          </Group>
          <Field label="理由">
            <Text size="sm" className="pre">
              {c.reason}
            </Text>
          </Field>
          {c.reviewedAt && <Field label={c.status === 'approved' ? '承認' : '却下'}>{`${dateTimeLabel(c.reviewedAt)}（${userName(c.reviewedBy)}）`}</Field>}
          {c.rejectReason && (
            <Field label="却下の理由">
              <Text size="sm" className="pre">
                {c.rejectReason}
              </Text>
            </Field>
          )}
          {c.cancelledAt && <Field label="取り消し">{dateTimeLabel(c.cancelledAt)}</Field>}
        </Stack>
      </Card>
      <Comparison correction={c} />
      {c.status === 'pending' && (
        <Group>
          <ApproveButton correction={c} />
          <Button variant="light" color="red" onClick={() => setRejecting(true)}>
            却下する
          </Button>
        </Group>
      )}
      <ReasonModal
        opened={rejecting}
        title="修正申請を却下する"
        confirmLabel="却下する"
        onClose={() => setRejecting(false)}
        onConfirm={(reason) => runWrite(rejectCorrection(c, reason, uid), '却下しました')}
      />
      <Text size="xs" c="dimmed">
        承認すると打刻を書き換え（なければ追加し）、「修正済み」と表示されます。元の時刻は残ります。期限（{company.correctionDeadlineBusinessDays}
        営業日）は本人が申請するときだけの制限で、管理者は期限後も承認できます。今日 {shortDayLabelFromKey(today)}・締め {period.closingDay === 0 ? '月末' : `${period.closingDay}日`}
      </Text>
    </Stack>
  )
}

/** その日の打刻（今）と、承認したあとの打刻と集計を並べる */
function useDayPunches(c: AttendanceCorrection) {
  return useQuery(
    query(collection(db, 'attendancePunches'), where('userId', '==', c.userId), where('workDate', '==', c.workDate)),
    `day-punches-${c.userId}-${c.workDate}`,
    parsePunch,
  )
}

function ApproveButton({ correction }: { correction: AttendanceCorrection }) {
  const { uid, period } = useData()
  const punches = useDayPunches(correction)
  const [busy, setBusy] = useState(false)
  return (
    <Button
      loading={busy || punches.loading}
      onClick={async () => {
        setBusy(true)
        await runWrite(approveCorrection(correction, punches.items, period, uid), '承認して勤怠に反映しました')
        setBusy(false)
      }}
    >
      承認して反映する
    </Button>
  )
}

function Comparison({ correction: c }: { correction: AttendanceCorrection }) {
  const { company, today } = useData()
  const punches = useDayPunches(c)
  const dayCorrections = useQuery(
    query(collection(db, 'attendanceCorrections'), where('userId', '==', c.userId), where('workDate', '==', c.workDate)),
    `day-corrections-${c.userId}-${c.workDate}`,
    parseCorrection,
  )
  if (punches.loading) return <Loading />
  const now = punches.items
  const changes = plannedChanges(c, now)
  // 承認したあとの打刻（仮）
  const after: AttendancePunch[] = now.map((p) => {
    const ch = changes.find((x) => x.punch?.id === p.id)
    return ch ? { ...p, punchedAt: ch.time, corrected: true } : p
  })
  for (const ch of changes.filter((x) => !x.punch)) {
    after.push({
      id: `new-${ch.kind}`,
      userId: c.userId,
      workDate: c.workDate,
      month: c.month,
      kind: ch.kind,
      punchedAt: ch.time,
      receivedAt: null,
      location: null,
      locationStatus: 'unavailable',
      corrected: true,
      originalPunchedAt: null,
      correctionId: c.id,
      correctedBy: null,
      correctedAt: null,
      correctionReason: null,
    })
  }
  const otherCorrections = dayCorrections.items.filter((x) => x.id !== c.id)
  const asApproved = [...otherCorrections, { ...c, status: 'approved' as const }]
  const open = openWorkDate(now, today)
  const before = dayRow(c.workDate, now, otherCorrections, company.breakRules, today, open)
  const afterRow = dayRow(c.workDate, after, c.status === 'pending' ? asApproved : dayCorrections.items, company.breakRules, today, null)
  const changedIds = new Set(changes.map((x) => x.punch?.id ?? `new-${x.kind}`))

  return (
    <Grid>
      <Grid.Col span={{ base: 12, md: 6 }}>
        <DayCard title={c.status === 'pending' ? '今の打刻' : '今の打刻（反映後）'} punches={now} summary={before.summary} highlight={new Set()} />
      </Grid.Col>
      {c.status === 'pending' && (
        <Grid.Col span={{ base: 12, md: 6 }}>
          <DayCard title="承認したあと" punches={after} summary={afterRow.summary} highlight={changedIds} />
        </Grid.Col>
      )}
      {c.targetPunchIds.some((tid) => !now.some((p) => p.id === tid)) && (
        <Grid.Col span={12}>
          <Alert color="yellow">申請の対象の打刻の一部が見つかりません（削除された可能性があります）。見つからない打刻は追加として反映します。</Alert>
        </Grid.Col>
      )}
    </Grid>
  )
}

export function DayCard({ title, punches, summary, highlight }: { title: string; punches: AttendancePunch[]; summary: DaySummary; highlight: Set<string> }) {
  const sorted = [...punches].sort((a, b) => a.punchedAt.getTime() - b.punchedAt.getTime())
  const v = (m: number | null) => (m === null ? '—' : durationLabel(m))
  return (
    <Card withBorder h="100%">
      <Text fw={600} mb="xs">
        {title}
      </Text>
      {sorted.length === 0 ? (
        <Text size="sm" c="dimmed">
          打刻なし
        </Text>
      ) : (
        <Table>
          <Table.Tbody>
            {sorted.map((p) => (
              <Table.Tr key={p.id} bg={highlight.has(p.id) ? 'var(--mantine-color-yellow-light)' : undefined}>
                <Table.Td>{punchKindLabel(p.kind)}</Table.Td>
                <Table.Td className="num">{timeLabel(p.punchedAt)}</Table.Td>
                <Table.Td>
                  {p.corrected && (
                    <Badge size="xs" variant="light" color="grape">
                      修正済み
                    </Badge>
                  )}
                  {highlight.has(p.id) && (
                    <Badge size="xs" variant="light" color="yellow" ml={4}>
                      {p.id.startsWith('new-') ? '追加' : '変更'}
                    </Badge>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      <Group gap="lg" mt="sm">
        <Field label="拘束">{v(summary.spanMinutes)}</Field>
        <Field label="中抜け">{v(summary.gapMinutes)}</Field>
        <Field label="休憩">{v(summary.deductedBreakMinutes)}</Field>
        <Field label="実働">
          <Text fw={700}>{v(summary.workMinutes)}</Text>
        </Field>
      </Group>
    </Card>
  )
}
