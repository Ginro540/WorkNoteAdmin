import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ActionIcon, Alert, Autocomplete, Button, Card, Divider, Grid, Group, NumberInput, SegmentedControl, Stack, Table, Text, TextInput, Textarea } from '@mantine/core'
import { IconArrowDown, IconArrowUp, IconPlus, IconTrash } from '@tabler/icons-react'
import { collection, deleteDoc, doc } from 'firebase/firestore'
import { modals } from '@mantine/modals'
import { db } from '../firebase'
import { useDocument, useQuery } from '../data/firestore'
import { useData } from '../data/session'
import { createEstimate, updateEstimate, type EstimateInput } from '../data/actions'
import { estimateStatusLabel, estimateTotals, parseEstimate, yen, type Estimate, type EstimateItem, type Honorific } from '../data/models'
import { addDays, dateFromDayKey, dayKey } from '../core/workCalendar'
import { Empty, ListDetail, Loading, PageTitle, PendingBadge, StatusBadge, errorMessage, runWrite } from '../ui/common'
import { notifications } from '@mantine/notifications'

export function EstimatesPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const { items, pending, loading } = useQuery(collection(db, 'estimates'), 'estimates', parseEstimate)
  const list = useMemo(() => {
    const s = search.trim()
    return items
      .filter((e) => !s || [e.number, e.title, e.clientName, e.siteName].some((x) => x.includes(s)))
      .sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.number.localeCompare(a.number))
  }, [items, search])

  const listPane = (
    <Stack gap={0}>
      <Stack p="md" gap="xs">
        <PageTitle title="見積書">
          <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => navigate('/estimates/new')}>
            新しく作る
          </Button>
        </PageTitle>
        <TextInput placeholder="番号・件名・宛先・現場で検索" value={search} onChange={(e) => setSearch(e.currentTarget.value)} />
      </Stack>
      <Divider />
      {loading ? (
        <Loading />
      ) : list.length === 0 ? (
        <Empty>見積書はまだありません</Empty>
      ) : (
        list.map((e) => (
          <div key={e.id} className={`list-row ${e.id === id ? 'active' : ''}`} onClick={() => navigate(`/estimates/${e.id}`)}>
            <Group justify="space-between" wrap="nowrap">
              <Text fw={600} size="sm" truncate>
                {e.title || '（件名なし）'}
              </Text>
              <Text fw={600} size="sm" className="num">
                {yen(e.total)}
              </Text>
            </Group>
            <Group justify="space-between" wrap="nowrap">
              <Text size="xs" c="dimmed" truncate>
                {e.number}・{e.clientName} {e.clientHonorific}・{e.issueDate.replaceAll('-', '/')}
              </Text>
              <Group gap={4} wrap="nowrap">
                <PendingBadge show={pending.has(e.id)} />
                <StatusBadge status={e.status} label={estimateStatusLabel[e.status]} />
              </Group>
            </Group>
          </div>
        ))
      )}
    </Stack>
  )
  return <ListDetail hasDetail={!!id} list={listPane} detail={id ? <EstimateEditorLoader key={id} id={id} /> : <Empty>左の一覧から見積書を選ぶか、「新しく作る」を押してください</Empty>} />
}

function EstimateEditorLoader({ id }: { id: string }) {
  const isNew = id === 'new' || id.startsWith('copy-')
  const sourceId = id.startsWith('copy-') ? id.slice(5) : null
  const target = isNew ? sourceId : id
  const { data, loading } = useDocument(target ? doc(db, 'estimates', target) : null, `estimate-${target}`, parseEstimate)
  if (target && loading) return <Loading />
  if (target && !data) return <Empty>見積書が見つかりません</Empty>
  return <EstimateEditor existing={isNew ? null : data} source={sourceId ? data : null} />
}

interface Draft extends EstimateInput {
  items: (EstimateItem & { key: string })[]
}

const newItem = () => ({ key: crypto.randomUUID(), name: '', quantity: 1, unit: '式', unitPrice: 0, amount: 0 })

function draftFrom(e: Estimate | null, staffName: string): Draft {
  const today = dayKey(new Date())
  if (!e) {
    return {
      status: 'draft',
      title: '',
      clientName: '',
      clientHonorific: '御中',
      siteId: null,
      siteName: '',
      siteAddress: '',
      issueDate: today,
      validUntil: dayKey(addDays(30, dateFromDayKey(today)!)),
      items: [newItem()],
      taxRate: 10,
      subtotal: 0,
      tax: 0,
      total: 0,
      notes: '',
      staffName,
    }
  }
  const { id: _id, number: _n, createdBy: _c, createdAt: _ca, updatedAt: _u, ...rest } = e
  void _id, void _n, void _c, void _ca, void _u
  return { ...rest, items: e.items.map((i) => ({ ...i, key: crypto.randomUUID() })) }
}

const units = ['式', '個', '本', '枚', '台', '箇所', 'm', 'm²', 'm³', 'kg', '時間', '日', '人工', 'セット']

function EstimateEditor({ existing, source }: { existing: Estimate | null; source: Estimate | null }) {
  const { uid, me, sites, issuer } = useData()
  const navigate = useNavigate()
  const [d, setD] = useState<Draft>(() => {
    const base = draftFrom(existing ?? source, me.displayName)
    if (source) {
      // 複製：日付は今日から、状態は下書き
      const fresh = draftFrom(null, me.displayName)
      return { ...base, status: 'draft', issueDate: fresh.issueDate, validUntil: fresh.validUntil }
    }
    return base
  })
  const [busy, setBusy] = useState(false)

  const totals = estimateTotals(d.items, d.taxRate)
  const set = <K extends keyof Draft>(k: K, value: Draft[K]) => setD((x) => ({ ...x, [k]: value }))
  const setItem = (i: number, patch: Partial<EstimateItem>) => setD((x) => ({ ...x, items: x.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) }))
  const move = (i: number, delta: number) =>
    setD((x) => {
      const items = [...x.items]
      const [it] = items.splice(i, 1)
      items.splice(i + delta, 0, it)
      return { ...x, items }
    })

  const missing = [
    !d.title.trim() && '件名',
    !d.clientName.trim() && '宛先',
    !d.issueDate && '発行日',
    !d.validUntil && '有効期限',
    !d.items.some((i) => i.name.trim()) && '明細（1行以上）',
  ].filter(Boolean) as string[]

  const input = (): EstimateInput => {
    const items = d.items.filter((i) => i.name.trim() || i.unitPrice)
    const t = estimateTotals(items, d.taxRate)
    return {
      ...d,
      title: d.title.trim(),
      clientName: d.clientName.trim(),
      items: items.map(({ key: _k, ...i }, n) => {
        void _k
        return { ...i, name: i.name.trim(), amount: t.amounts[n] }
      }),
      subtotal: t.subtotal,
      tax: t.tax,
      total: t.total,
    }
  }

  const save = async () => {
    setBusy(true)
    try {
      if (existing) {
        await runWrite(updateEstimate(existing.id, input()), '見積書を保存しました')
      } else {
        // 番号を採番するので、つながっているときだけ保存できる
        const id = await createEstimate(input(), uid)
        notifications.show({ color: 'green', message: '見積書を作りました' })
        navigate(`/estimates/${id}`, { replace: true })
      }
    } catch (e) {
      notifications.show({ color: 'red', title: '保存できませんでした', message: errorMessage(e) })
    } finally {
      setBusy(false)
    }
  }

  const remove = () =>
    modals.openConfirmModal({
      title: '見積書を削除',
      children: <Text size="sm">下書きの見積書「{existing?.title}」を削除します。元に戻せません。</Text>,
      labels: { confirm: '削除する', cancel: 'キャンセル' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        if (existing && (await runWrite(deleteDoc(doc(db, 'estimates', existing.id)), '削除しました'))) navigate('/estimates', { replace: true })
      },
    })

  return (
    <Stack p="md" maw={1100}>
      <PageTitle title={existing ? `見積書 ${existing.number}` : source ? '見積書の複製' : '新しい見積書'} back="/estimates">
        {existing && (
          <>
            <Button variant="default" size="xs" onClick={() => navigate(`/estimates/copy-${existing.id}`)}>
              複製
            </Button>
            <Button variant="light" size="xs" onClick={() => navigate(`/estimates/${existing.id}/print`)}>
              PDF・印刷
            </Button>
          </>
        )}
        <Button size="xs" onClick={save} loading={busy} disabled={missing.length > 0}>
          保存
        </Button>
      </PageTitle>
      {!issuer.companyName && <Alert color="yellow">発行元（社名・住所など）が未登録です。「マスタ → 見積書の発行元」で登録すると PDF に出ます。</Alert>}
      {missing.length > 0 && (
        <Text size="xs" c="orange">
          入力してください：{missing.join('、')}
        </Text>
      )}
      <Card withBorder>
        <Grid>
          <Grid.Col span={{ base: 12, md: 8 }}>
            <TextInput label="件名" required value={d.title} onChange={(e) => set('title', e.currentTarget.value)} placeholder="例：外壁補修工事" />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Text size="sm" fw={500} mb={4}>
              状態
            </Text>
            <SegmentedControl
              fullWidth
              value={d.status}
              onChange={(v) => set('status', v as Draft['status'])}
              data={[
                { value: 'draft', label: '下書き' },
                { value: 'issued', label: '発行済み' },
              ]}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 9, md: 6 }}>
            <TextInput label="宛先" required value={d.clientName} onChange={(e) => set('clientName', e.currentTarget.value)} placeholder="例：株式会社〇〇" />
          </Grid.Col>
          <Grid.Col span={{ base: 3, md: 2 }}>
            <Text size="sm" fw={500} mb={4}>
              敬称
            </Text>
            <SegmentedControl fullWidth value={d.clientHonorific} onChange={(v) => set('clientHonorific', v as Honorific)} data={['御中', '様']} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, md: 2 }}>
            <TextInput type="date" label="発行日" required value={d.issueDate} onChange={(e) => set('issueDate', e.currentTarget.value)} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, md: 2 }}>
            <TextInput type="date" label="有効期限" required value={d.validUntil} onChange={(e) => set('validUntil', e.currentTarget.value)} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Autocomplete
              label="現場"
              value={d.siteName}
              data={sites.filter((s) => s.active).map((s) => s.name)}
              onChange={(v) => {
                const site = sites.find((s) => s.name === v)
                setD((x) => ({ ...x, siteName: v, siteId: site?.id ?? null, siteAddress: site ? site.address : x.siteId ? '' : x.siteAddress }))
              }}
              placeholder="勤務先から選ぶか入力"
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 6 }}>
            <TextInput label="現場の住所" value={d.siteAddress} onChange={(e) => set('siteAddress', e.currentTarget.value)} />
          </Grid.Col>
        </Grid>
      </Card>

      <Card withBorder>
        <Text fw={600} mb="xs">
          明細
        </Text>
        <Table.ScrollContainer minWidth={760}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>品名</Table.Th>
                <Table.Th w={110}>数量</Table.Th>
                <Table.Th w={110}>単位</Table.Th>
                <Table.Th w={140}>単価（円）</Table.Th>
                <Table.Th w={120} ta="right">
                  金額
                </Table.Th>
                <Table.Th w={100} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {d.items.map((it, i) => (
                <Table.Tr key={it.key}>
                  <Table.Td>
                    <TextInput value={it.name} onChange={(e) => setItem(i, { name: e.currentTarget.value })} aria-label="品名" />
                  </Table.Td>
                  <Table.Td>
                    <NumberInput value={it.quantity} onChange={(v) => setItem(i, { quantity: Number(v) || 0 })} decimalScale={2} hideControls aria-label="数量" />
                  </Table.Td>
                  <Table.Td>
                    <Autocomplete value={it.unit} data={units} onChange={(v) => setItem(i, { unit: v })} aria-label="単位" />
                  </Table.Td>
                  <Table.Td>
                    <NumberInput value={it.unitPrice} onChange={(v) => setItem(i, { unitPrice: Math.trunc(Number(v) || 0) })} thousandSeparator="," allowDecimal={false} hideControls aria-label="単価" />
                  </Table.Td>
                  <Table.Td ta="right" className="num">
                    {yen(totals.amounts[i])}
                  </Table.Td>
                  <Table.Td>
                    <Group gap={2} wrap="nowrap">
                      <ActionIcon variant="subtle" disabled={i === 0} onClick={() => move(i, -1)} aria-label="上へ">
                        <IconArrowUp size={16} />
                      </ActionIcon>
                      <ActionIcon variant="subtle" disabled={i === d.items.length - 1} onClick={() => move(i, 1)} aria-label="下へ">
                        <IconArrowDown size={16} />
                      </ActionIcon>
                      <ActionIcon variant="subtle" color="red" disabled={d.items.length === 1} onClick={() => set('items', d.items.filter((_, j) => j !== i))} aria-label="削除">
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        <Button variant="light" size="xs" mt="xs" leftSection={<IconPlus size={14} />} onClick={() => set('items', [...d.items, newItem()])} w="fit-content">
          行を追加
        </Button>
        <Group justify="flex-end" mt="md">
          <Stack gap={4} w={280}>
            <Group justify="space-between">
              <Text size="sm">小計</Text>
              <Text size="sm" className="num">
                {yen(totals.subtotal)}
              </Text>
            </Group>
            <Group justify="space-between">
              <Group gap={4}>
                <Text size="sm">消費税</Text>
                <NumberInput size="xs" w={70} value={d.taxRate} onChange={(v) => set('taxRate', Number(v) || 0)} min={0} max={100} decimalScale={1} suffix="%" hideControls aria-label="税率" />
              </Group>
              <Text size="sm" className="num">
                {yen(totals.tax)}
              </Text>
            </Group>
            <Divider />
            <Group justify="space-between">
              <Text fw={700}>合計</Text>
              <Text fw={700} size="lg" className="num">
                {yen(totals.total)}
              </Text>
            </Group>
            <Text size="xs" c="dimmed">
              明細の金額と消費税は1円未満を切り捨てます。
            </Text>
          </Stack>
        </Group>
      </Card>

      <Card withBorder>
        <Grid>
          <Grid.Col span={{ base: 12, md: 8 }}>
            <Textarea label="備考" autosize minRows={3} value={d.notes} onChange={(e) => set('notes', e.currentTarget.value)} placeholder="支払条件・工期など" />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 4 }}>
            <TextInput label="担当者" value={d.staffName} onChange={(e) => set('staffName', e.currentTarget.value)} />
          </Grid.Col>
        </Grid>
      </Card>
      {existing?.status === 'draft' && (
        <Group>
          <Button variant="subtle" color="red" onClick={remove}>
            この見積書を削除
          </Button>
        </Group>
      )}
    </Stack>
  )
}
