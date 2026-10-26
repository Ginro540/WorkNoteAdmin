import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Alert, Badge, Button, Card, Checkbox, Code, Divider, Grid, Group, Progress, SegmentedControl, Select, Spoiler, Stack, Table, Text } from '@mantine/core'
import { collection, doc, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useDocument, useQuery } from '../data/firestore'
import { useData } from '../data/session'
import { approveExpenses, returnExpense } from '../data/actions'
import { expenseStatusLabel, parseExpense, yen, type Expense, type ExpenseStatus } from '../data/models'
import { dateTimeLabel, monthLabel, shortDayLabelFromKey } from '../core/workCalendar'
import { Empty, Field, ListDetail, Loading, MonthSelect, PageTitle, PendingBadge, ReasonModal, StatusBadge, StoredImage, UserSelect, runWrite } from '../ui/common'

type StatusFilter = ExpenseStatus | 'all'

function useFilters() {
  const { currentMonth } = useData()
  const [params, setParams] = useSearchParams()
  const status = (params.get('status') as StatusFilter) ?? 'submitted'
  const month = params.get('month') ?? (status === 'submitted' ? 'all' : currentMonth)
  const user = params.get('user') ?? 'all'
  const category = params.get('category') ?? 'all'
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    next.set(k, v)
    if (k === 'status' && v === 'all' && month === 'all') next.set('month', currentMonth)
    setParams(next, { replace: true })
  }
  return { status, month, user, category, set, search: params.toString() }
}

export function ExpensesPage() {
  const { id } = useParams()
  const f = useFilters()
  const { userName, uid, categories, categoryName } = useData()
  const navigate = useNavigate()
  const [checked, setChecked] = useState<Set<string>>(new Set())

  const q =
    f.month === 'all' && f.status !== 'all'
      ? query(collection(db, 'expenses'), where('status', '==', f.status))
      : query(collection(db, 'expenses'), where('month', '==', f.month === 'all' ? '' : f.month))
  const { items, pending, loading } = useQuery(q, `expenses-${f.month}-${f.status}`, parseExpense)
  const list = useMemo(
    () =>
      items
        .filter(
          (e) =>
            (f.status === 'all' || e.status === f.status) && (f.user === 'all' || e.userId === f.user) && (f.category === 'all' || e.categoryId === f.category),
        )
        .sort((a, b) => b.usedOn.localeCompare(a.usedOn) || b.createdAt.getTime() - a.createdAt.getTime()),
    [items, f.status, f.user, f.category],
  )
  const submitted = list.filter((e) => e.status === 'submitted')
  const toApprove = submitted.filter((e) => checked.has(e.id))
  const listTotal = list.reduce((s, e) => s + e.amount, 0)

  const approveChecked = async () => {
    if (await runWrite(approveExpenses(toApprove, uid), `${toApprove.length}件の経費を承認しました`)) setChecked(new Set())
  }

  const listPane = (
    <Stack gap={0}>
      <Stack p="md" gap="xs">
        <PageTitle title="経費" />
        <SegmentedControl
          value={f.status}
          onChange={(v) => f.set('status', v)}
          data={[
            { value: 'submitted', label: '申請済み' },
            { value: 'approved', label: '承認済み' },
            { value: 'returned', label: '差し戻し' },
            { value: 'all', label: 'すべて' },
          ]}
          size="xs"
          fullWidth
        />
        <Group gap="xs">
          <MonthSelect value={f.month} onChange={(v) => f.set('month', v)} includeAll={f.status !== 'all'} />
          <UserSelect value={f.user} onChange={(v) => f.set('user', v)} />
          <Select
            aria-label="区分"
            w={150}
            allowDeselect={false}
            value={f.category}
            onChange={(v) => v && f.set('category', v)}
            data={[{ value: 'all', label: 'すべての区分' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
          />
        </Group>
        {submitted.length > 0 && (
          <Group gap="xs">
            <Checkbox
              label="申請済みをすべて選ぶ"
              size="xs"
              checked={toApprove.length === submitted.length}
              indeterminate={toApprove.length > 0 && toApprove.length < submitted.length}
              onChange={(e) => setChecked(e.currentTarget.checked ? new Set(submitted.map((x) => x.id)) : new Set())}
            />
            <Button size="xs" disabled={toApprove.length === 0} onClick={approveChecked}>
              選んだ{toApprove.length || ''}件を承認
            </Button>
          </Group>
        )}
        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            {list.length}件
          </Text>
          <Text size="sm" fw={600} className="num">
            合計 {yen(listTotal)}
          </Text>
        </Group>
      </Stack>
      <Divider />
      {loading ? (
        <Loading />
      ) : list.length === 0 ? (
        <Empty>該当する経費はありません</Empty>
      ) : (
        list.map((e) => (
          <Group key={e.id} wrap="nowrap" gap={0} className={`list-row ${e.id === id ? 'active' : ''}`} onClick={() => navigate(`/expenses/${e.id}?${f.search}`)}>
            {e.status === 'submitted' && (
              <Checkbox
                mr="sm"
                checked={checked.has(e.id)}
                onClick={(ev) => ev.stopPropagation()}
                onChange={(ev) => {
                  const next = new Set(checked)
                  if (ev.currentTarget.checked) next.add(e.id)
                  else next.delete(e.id)
                  setChecked(next)
                }}
                aria-label="選ぶ"
              />
            )}
            <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
              <Group justify="space-between" wrap="nowrap">
                <Text fw={600} size="sm" truncate>
                  {shortDayLabelFromKey(e.usedOn)}　{userName(e.userId)}
                </Text>
                <Text fw={600} size="sm" className="num">
                  {yen(e.amount)}
                </Text>
              </Group>
              <Group justify="space-between" wrap="nowrap">
                <Text size="xs" c="dimmed" truncate>
                  {e.vendor || '（お店なし）'}・{categoryName(e.categoryId)}
                </Text>
                <Group gap={4} wrap="nowrap">
                  <PendingBadge show={pending.has(e.id)} />
                  <StatusBadge status={e.status} label={expenseStatusLabel[e.status]} />
                </Group>
              </Group>
            </Stack>
          </Group>
        ))
      )}
    </Stack>
  )

  const detail = id ? (
    <ExpenseDetail id={id} backTo={`/expenses?${f.search}`} />
  ) : f.month !== 'all' ? (
    <MonthTotals month={f.month} items={items} />
  ) : (
    <Empty>左の一覧から経費を選んでください。月を選ぶと、その月の合計を表示します。</Empty>
  )
  return <ListDetail hasDetail={!!id} list={listPane} detail={detail} />
}

/** 月の合計（申請済み・承認済み）。従業員ごと・区分ごと */
function MonthTotals({ month, items }: { month: string; items: Expense[] }) {
  const { userName, categories, categoryName } = useData()
  const counted = items.filter((e) => e.month === month && (e.status === 'submitted' || e.status === 'approved'))
  const total = counted.reduce((s, e) => s + e.amount, 0)
  const approved = counted.filter((e) => e.status === 'approved').reduce((s, e) => s + e.amount, 0)

  const sumBy = (key: (e: Expense) => string) => {
    const m = new Map<string, { total: number; approved: number; count: number }>()
    for (const e of counted) {
      const v = m.get(key(e)) ?? { total: 0, approved: 0, count: 0 }
      v.total += e.amount
      v.count += 1
      if (e.status === 'approved') v.approved += e.amount
      m.set(key(e), v)
    }
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total)
  }
  const byUser = sumBy((e) => e.userId)
  const order = new Map(categories.map((c) => [c.id, c.order]))
  const byCategory = sumBy((e) => e.categoryId).sort((a, b) => (order.get(a[0]) ?? 99) - (order.get(b[0]) ?? 99))
  const colors = ['indigo', 'teal', 'orange', 'grape', 'cyan', 'pink', 'lime', 'gray']

  return (
    <Stack p="md" maw={900}>
      <PageTitle title={`${monthLabel(month)}分の合計`} />
      <Text size="sm" c="dimmed">
        申請済みと承認済みの経費の合計です（下書き・差し戻しは含みません）。
      </Text>
      <Grid>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <Card withBorder>
            <Text size="sm" c="dimmed">
              合計
            </Text>
            <Text fz={28} fw={700} className="num">
              {yen(total)}
            </Text>
            <Text size="xs" c="dimmed">
              うち承認済み {yen(approved)}・{counted.length}件
            </Text>
          </Card>
        </Grid.Col>
      </Grid>
      {total > 0 && (
        <Progress.Root size={18}>
          {byCategory.map(([cid, v], i) => (
            <Progress.Section key={cid} value={(v.total / total) * 100} color={colors[i % colors.length]} title={categoryName(cid)} />
          ))}
        </Progress.Root>
      )}
      <Grid>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card withBorder>
            <Text fw={600} mb="xs">
              区分ごと
            </Text>
            <Table>
              <Table.Tbody>
                {byCategory.map(([cid, v], i) => (
                  <Table.Tr key={cid}>
                    <Table.Td>
                      <Badge color={colors[i % colors.length]} variant="dot">
                        {categoryName(cid)}
                      </Badge>
                    </Table.Td>
                    <Table.Td ta="right" className="num">
                      {v.count}件
                    </Table.Td>
                    <Table.Td ta="right" className="num" fw={600}>
                      {yen(v.total)}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card withBorder>
            <Text fw={600} mb="xs">
              従業員ごと
            </Text>
            <Table>
              <Table.Tbody>
                {byUser.map(([u, v]) => (
                  <Table.Tr key={u}>
                    <Table.Td>{userName(u)}</Table.Td>
                    <Table.Td ta="right" className="num">
                      {v.count}件
                    </Table.Td>
                    <Table.Td ta="right" className="num" fw={600}>
                      {yen(v.total)}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Card>
        </Grid.Col>
      </Grid>
      {counted.length === 0 && <Empty>この月の申請済み・承認済みの経費はありません</Empty>}
      <Text size="xs" c="dimmed">
        区分の一覧にない区分は「その他」として表示します。{categories.length}個の区分があります。
      </Text>
    </Stack>
  )
}

function ExpenseDetail({ id, backTo }: { id: string; backTo: string }) {
  const { userName, categoryName, uid } = useData()
  const { data: e, loading, pending } = useDocument(doc(db, 'expenses', id), `expense-${id}`, parseExpense)
  const [returning, setReturning] = useState(false)
  if (loading) return <Loading />
  if (!e) return <Empty>経費が見つかりません</Empty>
  return (
    <Stack p="md" maw={1000}>
      <PageTitle title={`${shortDayLabelFromKey(e.usedOn)}　${e.vendor || '経費'}`} back={backTo}>
        <PendingBadge show={pending} />
        <StatusBadge status={e.status} label={expenseStatusLabel[e.status]} />
      </PageTitle>
      {e.status === 'returned' && e.returnReason && (
        <Alert color="orange" title="差し戻しの理由">
          <Text size="sm" className="pre">
            {e.returnReason}
          </Text>
        </Alert>
      )}
      <Group>
        {e.status === 'submitted' && <Button onClick={() => runWrite(approveExpenses([e], uid), '承認しました')}>承認する</Button>}
        {(e.status === 'submitted' || e.status === 'approved') && (
          <Button variant="light" color="orange" onClick={() => setReturning(true)}>
            差し戻す
          </Button>
        )}
      </Group>
      <Grid>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card withBorder>
            <Stack gap="sm">
              <Field label="金額（税込）">
                <Text fz={26} fw={700} className="num">
                  {yen(e.amount)}
                </Text>
              </Field>
              <Group gap="xl">
                <Field label="従業員">
                  <Link to={`/attendance/${e.userId}/${e.usedOn}`}>{userName(e.userId)}</Link>
                </Field>
                <Field label="利用日">{shortDayLabelFromKey(e.usedOn)}</Field>
                <Field label="区分">{categoryName(e.categoryId)}</Field>
              </Group>
              <Field label="お店・会社名">{e.vendor || '—'}</Field>
              <Field label="インボイス番号">
                {e.invoiceNumber ? (
                  <Text className="num">{e.invoiceNumber}</Text>
                ) : (
                  <Badge color="yellow" variant="light">
                    インボイス番号なし
                  </Badge>
                )}
              </Field>
              <Field label="メモ">
                <Text size="sm" className="pre">
                  {e.memo || '—'}
                </Text>
              </Field>
              <Group gap="xl">
                <Field label="申請">{e.submittedAt ? dateTimeLabel(e.submittedAt) : '—'}</Field>
                <Field label="更新">{e.updatedAt ? dateTimeLabel(e.updatedAt) : '—'}</Field>
                {e.reviewedAt && <Field label={e.status === 'approved' ? '承認' : '確認'}>{`${dateTimeLabel(e.reviewedAt)}（${userName(e.reviewedBy)}）`}</Field>}
              </Group>
            </Stack>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Stack>
            <Card withBorder>
              <Text size="xs" c="dimmed" fw={500} mb={6}>
                領収書
              </Text>
              {e.receiptPath ? <StoredImage path={e.receiptPath} alt="領収書" /> : <div className="image-missing">領収書の画像なし</div>}
            </Card>
            <Card withBorder>
              <Text size="xs" c="dimmed" fw={500} mb={6}>
                読み取った文字（OCR）
              </Text>
              {e.ocrText ? (
                <Spoiler maxHeight={220} showLabel="すべて表示" hideLabel="閉じる">
                  <Code block>{e.ocrText}</Code>
                </Spoiler>
              ) : (
                <Text size="sm" c="dimmed">
                  なし
                </Text>
              )}
            </Card>
          </Stack>
        </Grid.Col>
      </Grid>
      <ReasonModal
        opened={returning}
        title="経費を差し戻す"
        confirmLabel="差し戻す"
        confirmColor="orange"
        description={<Text size="sm">本人のアプリに理由が表示され、直して申請し直せます。</Text>}
        onClose={() => setReturning(false)}
        onConfirm={(reason) => runWrite(returnExpense(e, reason, uid), '差し戻しました')}
      />
    </Stack>
  )
}
