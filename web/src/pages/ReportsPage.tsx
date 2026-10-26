import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Alert, Badge, Button, Card, Checkbox, Divider, Group, SegmentedControl, Stack, Text, Timeline } from '@mantine/core'
import { collection, doc, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useDocument, useQuery } from '../data/firestore'
import { useData } from '../data/session'
import { approveReports, returnReport } from '../data/actions'
import { parseReport, parseRevision, reportStatusLabel, reportSummaryLine, type DailyReport, type ReportRevision, type ReportStatus } from '../data/models'
import { dateTimeLabel, shortDayLabelFromKey } from '../core/workCalendar'
import { Empty, Field, ListDetail, Loading, MonthSelect, PageTitle, PendingBadge, ReasonModal, StatusBadge, StoredImage, UserSelect, runWrite } from '../ui/common'

type StatusFilter = ReportStatus | 'all'

/** 一覧の絞り込みを URL に持たせる（詳細を開いても戻れるように） */
function useFilters() {
  const { currentMonth } = useData()
  const [params, setParams] = useSearchParams()
  const status = (params.get('status') as StatusFilter) ?? 'submitted'
  const month = params.get('month') ?? (status === 'submitted' ? 'all' : currentMonth)
  const user = params.get('user') ?? 'all'
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    next.set(k, v)
    if (k === 'status' && v === 'all' && month === 'all') next.set('month', currentMonth)
    setParams(next, { replace: true })
  }
  return { status, month, user, set, search: params.toString() }
}

export function ReportsPage() {
  const { id } = useParams()
  const f = useFilters()
  const { userName, uid } = useData()
  const navigate = useNavigate()
  const [checked, setChecked] = useState<Set<string>>(new Set())

  // 「すべての月」は状態で、月を選んだら月で読む（並べ替えはアプリの中で）
  const q =
    f.month === 'all' && f.status !== 'all'
      ? query(collection(db, 'dailyReports'), where('status', '==', f.status))
      : query(collection(db, 'dailyReports'), where('month', '==', f.month === 'all' ? '' : f.month))
  const { items, pending, loading } = useQuery(q, `reports-${f.month}-${f.status}`, parseReport)
  const list = useMemo(
    () =>
      items
        .filter((r) => (f.status === 'all' || r.status === f.status) && (f.user === 'all' || r.userId === f.user))
        .sort((a, b) => b.date.localeCompare(a.date) || userName(a.userId).localeCompare(userName(b.userId), 'ja')),
    [items, f.status, f.user, userName],
  )
  const submitted = list.filter((r) => r.status === 'submitted')
  const toApprove = submitted.filter((r) => checked.has(r.id))

  const approveChecked = async () => {
    if (await runWrite(approveReports(toApprove, uid), `${toApprove.length}件の日報を承認しました`)) setChecked(new Set())
  }

  const listPane = (
    <Stack gap={0}>
      <Stack p="md" gap="xs">
        <PageTitle title="日報" />
        <SegmentedControl
          value={f.status}
          onChange={(v) => f.set('status', v)}
          data={[
            { value: 'submitted', label: '提出済み' },
            { value: 'approved', label: '承認済み' },
            { value: 'draft', label: '下書き' },
            { value: 'all', label: 'すべて' },
          ]}
          size="xs"
          fullWidth
        />
        <Group gap="xs">
          <MonthSelect value={f.month} onChange={(v) => f.set('month', v)} includeAll={f.status !== 'all'} />
          <UserSelect value={f.user} onChange={(v) => f.set('user', v)} />
        </Group>
        {submitted.length > 0 && (
          <Group gap="xs">
            <Checkbox
              label="提出済みをすべて選ぶ"
              size="xs"
              checked={toApprove.length === submitted.length}
              indeterminate={toApprove.length > 0 && toApprove.length < submitted.length}
              onChange={(e) => setChecked(e.currentTarget.checked ? new Set(submitted.map((r) => r.id)) : new Set())}
            />
            <Button size="xs" disabled={toApprove.length === 0} onClick={approveChecked}>
              選んだ{toApprove.length || ''}件を承認
            </Button>
          </Group>
        )}
        <Text size="xs" c="dimmed">
          {list.length}件
        </Text>
      </Stack>
      <Divider />
      {loading ? (
        <Loading />
      ) : list.length === 0 ? (
        <Empty>該当する日報はありません</Empty>
      ) : (
        list.map((r) => (
          <Group key={r.id} wrap="nowrap" gap={0} className={`list-row ${r.id === id ? 'active' : ''}`} onClick={() => navigate(`/reports/${r.id}?${f.search}`)}>
            {r.status === 'submitted' && (
              <Checkbox
                mr="sm"
                checked={checked.has(r.id)}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const next = new Set(checked)
                  if (e.currentTarget.checked) next.add(r.id)
                  else next.delete(r.id)
                  setChecked(next)
                }}
                aria-label="選ぶ"
              />
            )}
            <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
              <Group justify="space-between" wrap="nowrap">
                <Text fw={600} size="sm">
                  {shortDayLabelFromKey(r.date)}　{userName(r.userId)}
                </Text>
                <Group gap={4} wrap="nowrap">
                  <PendingBadge show={pending.has(r.id)} />
                  <StatusBadge status={r.status} label={reportStatusLabel[r.status]} />
                </Group>
              </Group>
              <Text size="xs" c="dimmed" truncate>
                {reportSummaryLine(r) || '内容なし'}
              </Text>
            </Stack>
          </Group>
        ))
      )}
    </Stack>
  )

  return <ListDetail hasDetail={!!id} list={listPane} detail={id ? <ReportDetail id={id} backTo={`/reports?${f.search}`} /> : <Empty>左の一覧から日報を選んでください</Empty>} />
}

function ReportDetail({ id, backTo }: { id: string; backTo: string }) {
  const { userName, reportFields, uid, sites } = useData()
  const report = useDocument(doc(db, 'dailyReports', id), `report-${id}`, parseReport)
  const revisions = useQuery(collection(db, 'dailyReports', id, 'revisions'), `revisions-${id}`, parseRevision)
  const [returning, setReturning] = useState(false)

  if (report.loading) return <Loading />
  const r = report.data
  if (!r) return <Empty>日報が見つかりません</Empty>

  const fieldKeys = new Set(reportFields.map((f) => f.key))
  const extraKeys = Object.keys(r.values).filter((k) => !fieldKeys.has(k))

  return (
    <Stack p="md" maw={900}>
      <PageTitle title={`${shortDayLabelFromKey(r.date)}の日報`} back={backTo}>
        <PendingBadge show={report.pending} />
        <StatusBadge status={r.status} label={reportStatusLabel[r.status]} />
      </PageTitle>
      <Group gap="xl">
        <Field label="従業員">
          <Link to={`/attendance/${r.userId}/${r.date}?month=${r.month}`}>{userName(r.userId)}</Link>
        </Field>
        <Field label="提出">{r.submittedAt ? dateTimeLabel(r.submittedAt) : '—'}</Field>
        <Field label="更新">{dateTimeLabel(r.updatedAt)}</Field>
        {r.approvedAt && <Field label="承認">{`${dateTimeLabel(r.approvedAt)}（${userName(r.approvedBy)}）`}</Field>}
      </Group>
      {r.status === 'draft' && r.returnReason && (
        <Alert color="orange" title={`差し戻し${r.returnedAt ? `（${dateTimeLabel(r.returnedAt)}、${userName(r.returnedBy)}）` : ''}`}>
          <Text size="sm" className="pre">
            {r.returnReason}
          </Text>
        </Alert>
      )}

      <Group>
        {r.status === 'submitted' && <Button onClick={() => runWrite(approveReports([r], uid), '承認しました')}>承認する</Button>}
        {r.status !== 'draft' && (
          <Button variant="light" color="orange" onClick={() => setReturning(true)}>
            差し戻す
          </Button>
        )}
      </Group>

      <Card withBorder>
        <Stack gap="md">
          {reportFields
            .filter((f) => f.key !== 'date')
            .map((f) =>
              f.type === 'photos' ? (
                <Field key={f.key} label={f.label}>
                  {r.photoPaths.length === 0 ? (
                    <Text size="sm" c="dimmed">
                      なし
                    </Text>
                  ) : (
                    <div className="photo-grid">
                      {r.photoPaths.map((p, i) => (
                        <StoredImage key={p} path={p} alt={`写真${i + 1}`} />
                      ))}
                    </div>
                  )}
                </Field>
              ) : (
                <Field key={f.key} label={f.label}>
                  <Text size="sm" className="pre">
                    {r.values[f.key] || '—'}
                  </Text>
                  {f.type === 'sites' && r.siteIds.length > 0 && (
                    <Group gap={4} mt={4}>
                      {r.siteIds.map((sid) => (
                        <Badge key={sid} variant="light" color="teal" size="sm">
                          {sites.find((s) => s.id === sid)?.name ?? '（削除された勤務先）'}
                        </Badge>
                      ))}
                    </Group>
                  )}
                </Field>
              ),
            )}
          {extraKeys.map((k) => (
            <Field key={k} label={`（削除した項目：${k}）`}>
              <Text size="sm" className="pre">
                {r.values[k]}
              </Text>
            </Field>
          ))}
        </Stack>
      </Card>

      <Revisions report={r} revisions={revisions.items} />

      <ReasonModal
        opened={returning}
        title="日報を差し戻す"
        confirmLabel="差し戻す"
        confirmColor="orange"
        description={<Text size="sm">日報を下書きに戻します。本人が直して提出し直せます。</Text>}
        onClose={() => setReturning(false)}
        onConfirm={(reason) => runWrite(returnReport(r, reason, uid), '差し戻しました')}
      />
    </Stack>
  )
}

/** 修正履歴：修正前（取り消し線）と修正後を並べる */
function Revisions({ report, revisions }: { report: DailyReport; revisions: ReportRevision[] }) {
  const { reportFields, userName } = useData()
  if (revisions.length === 0) return null
  const sorted = [...revisions].sort((a, b) => a.editedAt.getTime() - b.editedAt.getTime())
  const labelOf = (key: string) => (key === 'date' ? '日付' : (reportFields.find((f) => f.key === key)?.label ?? key))
  const entries = sorted.map((rev, i) => {
    const next = sorted[i + 1]
    const after = next ? next.values : { ...report.values, ...(rev.values.date ? { date: report.date } : {}) }
    const afterPhotos = next ? next.photoPaths : report.photoPaths
    const keys = [...new Set([...Object.keys(rev.values), ...Object.keys(after)])].filter((k) => (rev.values[k] ?? '') !== (after[k] ?? ''))
    return { rev, after, keys, photosChanged: rev.photoPaths.join() !== afterPhotos.join(), photoCount: [rev.photoPaths.length, afterPhotos.length] }
  })
  return (
    <Card withBorder>
      <Text fw={600} mb="sm">
        修正履歴（{revisions.length}回）
      </Text>
      <Timeline bulletSize={14} lineWidth={2}>
        {entries.reverse().map(({ rev, after, keys, photosChanged, photoCount }) => (
          <Timeline.Item key={rev.id} title={`${dateTimeLabel(rev.editedAt)}　${userName(rev.editedBy)}`}>
            <Stack gap={6} mt={4}>
              {keys.length === 0 && !photosChanged && (
                <Text size="xs" c="dimmed">
                  内容の変更なし
                </Text>
              )}
              {keys.map((k) => (
                <div key={k}>
                  <Text size="xs" c="dimmed">
                    {labelOf(k)}
                  </Text>
                  <Text size="sm" className="pre strike">
                    {rev.values[k] || '（空）'}
                  </Text>
                  <Text size="sm" className="pre">
                    {after[k] || '（空）'}
                  </Text>
                </div>
              ))}
              {photosChanged && (
                <Text size="sm">
                  写真：{photoCount[0]}枚 → {photoCount[1]}枚
                </Text>
              )}
            </Stack>
          </Timeline.Item>
        ))}
      </Timeline>
    </Card>
  )
}
