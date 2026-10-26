import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, Checkbox, Group, SegmentedControl, Stack, Table, Text } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { collection, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useQuery } from '../data/firestore'
import { useData } from '../data/session'
import { approveLeaves, cancelLeavesByAdmin, rejectLeaves } from '../data/actions'
import { leaveKindLabel, leaveStatusLabel, parseLeave, type LeaveStatus } from '../data/models'
import { dateTimeLabel } from '../core/workCalendar'
import { Empty, Loading, MonthSelect, PageTitle, PendingBadge, ReasonModal, StatusBadge, UserSelect, runWrite } from '../ui/common'
import { groupLeaves, leaveDatesLabel, type LeaveGroup } from '../ui/leaves'
import { RegisterLeaveModal } from './RegisterLeaveModal'

type Tab = LeaveStatus | 'all'

/** 休暇の承認・却下・登録 */
export function LeavesPage() {
  const { currentMonth, userName, uid } = useData()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('status') as Tab) ?? 'pending'
  const month = params.get('month') ?? (tab === 'pending' ? 'all' : currentMonth)
  const user = params.get('user') ?? 'all'
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    next.set(k, v)
    if (k === 'status' && v === 'all' && month === 'all') next.set('month', currentMonth)
    setParams(next, { replace: true })
  }
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [rejecting, setRejecting] = useState<LeaveGroup | null>(null)
  const [cancelling, setCancelling] = useState<LeaveGroup | null>(null)
  const [registering, setRegistering] = useState(false)

  const q =
    month === 'all' && tab !== 'all'
      ? query(collection(db, 'leaveRequests'), where('status', '==', tab))
      : query(collection(db, 'leaveRequests'), where('month', '==', month === 'all' ? '' : month))
  const { items, pending, loading } = useQuery(q, `leaves-${month}-${tab}`, parseLeave)
  const groups = useMemo(
    () =>
      groupLeaves(items.filter((l) => (tab === 'all' || l.status === tab) && (user === 'all' || l.userId === user))).sort(
        (a, b) => a.leaves[0].date.localeCompare(b.leaves[0].date) || a.userId.localeCompare(b.userId),
      ),
    [items, tab, user],
  )
  const toApprove = groups.filter((g) => g.status === 'pending' && checked.has(g.id))

  const approve = async (gs: LeaveGroup[]) => {
    const leaves = gs.flatMap((g) => g.leaves)
    if (await runWrite(approveLeaves(leaves, uid), `${leaves.length}日分の休暇を承認しました`)) setChecked(new Set())
  }

  return (
    <Stack p="md">
      <PageTitle title="休暇">
        <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setRegistering(true)}>
          休暇を登録
        </Button>
      </PageTitle>
      <Group gap="xs">
        <SegmentedControl
          size="xs"
          value={tab}
          onChange={(v) => set('status', v)}
          data={[
            { value: 'pending', label: '申請中' },
            { value: 'approved', label: '承認' },
            { value: 'rejected', label: '却下' },
            { value: 'cancelled', label: '取り消し' },
            { value: 'all', label: 'すべて' },
          ]}
        />
        <MonthSelect value={month} onChange={(v) => set('month', v)} includeAll={tab !== 'all'} />
        <UserSelect value={user} onChange={(v) => set('user', v)} />
      </Group>
      {tab === 'pending' && groups.length > 0 && (
        <Group gap="xs">
          <Checkbox
            label="すべて選ぶ"
            checked={toApprove.length === groups.length}
            indeterminate={toApprove.length > 0 && toApprove.length < groups.length}
            onChange={(e) => setChecked(e.currentTarget.checked ? new Set(groups.map((g) => g.id)) : new Set())}
          />
          <Button size="xs" disabled={toApprove.length === 0} onClick={() => approve(toApprove)}>
            選んだ{toApprove.length}件を承認
          </Button>
        </Group>
      )}
      {loading ? (
        <Loading />
      ) : groups.length === 0 ? (
        <Empty>該当する休暇はありません</Empty>
      ) : (
        <Table.ScrollContainer minWidth={900}>
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                {tab === 'pending' && <Table.Th w={40} />}
                <Table.Th>従業員</Table.Th>
                <Table.Th>日付</Table.Th>
                <Table.Th>種類</Table.Th>
                <Table.Th>理由</Table.Th>
                <Table.Th>申請</Table.Th>
                <Table.Th>状態</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {groups.map((g) => {
                const first = g.leaves[0]
                return (
                  <Table.Tr key={g.id}>
                    {tab === 'pending' && (
                      <Table.Td>
                        <Checkbox
                          aria-label="選ぶ"
                          checked={checked.has(g.id)}
                          onChange={(e) => {
                            const next = new Set(checked)
                            if (e.currentTarget.checked) next.add(g.id)
                            else next.delete(g.id)
                            setChecked(next)
                          }}
                        />
                      </Table.Td>
                    )}
                    <Table.Td fw={600}>{userName(g.userId)}</Table.Td>
                    <Table.Td className="num">{leaveDatesLabel(g.leaves)}</Table.Td>
                    <Table.Td>{leaveKindLabel[g.kind]}</Table.Td>
                    <Table.Td>
                      <Text size="sm">{g.reason || <Text span c="dimmed">（なし）</Text>}</Text>
                      {first.cancelReason && (
                        <Text size="xs" c="dimmed">
                          取り消しの理由：{first.cancelReason}
                        </Text>
                      )}
                      {first.rejectReason && (
                        <Text size="xs" c="red">
                          却下の理由：{first.rejectReason}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs">{first.createdBy ? `管理者（${userName(first.createdBy)}）が登録` : dateTimeLabel(first.createdAt)}</Text>
                      {g.leaves.some((l) => pending.has(l.id)) && <PendingBadge show />}
                    </Table.Td>
                    <Table.Td>
                      <StatusBadge status={g.status} label={leaveStatusLabel[g.status]} />
                      {first.reviewedBy && !first.createdBy && (
                        <Text size="xs" c="dimmed">
                          {userName(first.reviewedBy)}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs" justify="flex-end" wrap="nowrap">
                        {g.status === 'pending' && (
                          <>
                            <Button size="xs" onClick={() => approve([g])}>
                              承認
                            </Button>
                            <Button size="xs" variant="light" color="red" onClick={() => setRejecting(g)}>
                              却下
                            </Button>
                          </>
                        )}
                        {g.status === 'approved' && (
                          <Button size="xs" variant="subtle" color="gray" onClick={() => setCancelling(g)}>
                            取り消す
                          </Button>
                        )}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      <Text size="xs" c="dimmed">
        まとめて申請された日は1行にまとめています。有給は理由がなくても申請できます（年次有給休暇は理由を求めないため）。承認済みの休暇は、本人からは取り消せません。連絡を受けたら「取り消す」を使ってください。
      </Text>

      <ReasonModal
        opened={!!rejecting}
        title="休暇を却下"
        confirmLabel="却下する"
        description={rejecting && `${userName(rejecting.userId)}さん ${leaveDatesLabel(rejecting.leaves)}（${leaveKindLabel[rejecting.kind]}）`}
        onClose={() => setRejecting(null)}
        onConfirm={(reason) => (rejecting ? runWrite(rejectLeaves(rejecting.leaves, reason, uid), '却下しました') : undefined)}
      />
      <ReasonModal
        opened={!!cancelling}
        title="承認済みの休暇を取り消す"
        confirmLabel="取り消す"
        description={cancelling && `${userName(cancelling.userId)}さん ${leaveDatesLabel(cancelling.leaves)}（${leaveKindLabel[cancelling.kind]}）。記録は「取り消し」として残ります。`}
        onClose={() => setCancelling(null)}
        onConfirm={(reason) => (cancelling ? runWrite(cancelLeavesByAdmin(cancelling.leaves, reason, uid), '取り消しました') : undefined)}
      />
      <RegisterLeaveModal opened={registering} onClose={() => setRegistering(false)} />
    </Stack>
  )
}

