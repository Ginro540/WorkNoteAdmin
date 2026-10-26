import { useEffect, useState } from 'react'
import { Alert, Button, Group, Modal, Radio, Stack, Text, Textarea } from '@mantine/core'
import { DatePicker } from '@mantine/dates'
import '@mantine/dates/styles.css'
import 'dayjs/locale/ja'
import { collection, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useQuery } from '../data/firestore'
import { useData } from '../data/session'
import { registerLeaves } from '../data/actions'
import { isHalfDayLeave, leaveKindLabel, leaveKinds, parseLeave, type LeaveKind } from '../data/models'
import { dateFromDayKey, shortDayLabelFromKey, weekday } from '../core/workCalendar'
import { UserSelect, runWrite } from '../ui/common'

/** 管理者が承認済みの休暇を登録する（電話で連絡を受けたときなど） */
export function RegisterLeaveModal({ opened, onClose, userId, date }: { opened: boolean; onClose: () => void; userId?: string; date?: string }) {
  const { uid, activeUsers, period, holidayOn } = useData()
  const [user, setUser] = useState(userId ?? '')
  const [kind, setKind] = useState<LeaveKind>('paid')
  const [dates, setDates] = useState<string[]>([])
  const [reason, setReason] = useState('')
  useEffect(() => {
    if (!opened) return
    setUser(userId ?? activeUsers[0]?.id ?? '')
    setKind('paid')
    setDates(date ? [date] : [])
    setReason('')
  }, [opened, userId, date, activeUsers])

  // すでに申請中・承認済みの休暇がある日は選べない
  const existing = useQuery(
    opened && user ? query(collection(db, 'leaveRequests'), where('userId', '==', user)) : null,
    `leaves-register-${user}`,
    parseLeave,
  )
  const taken = new Set(existing.items.filter((l) => l.status === 'pending' || l.status === 'approved').map((l) => l.date))
  const isOff = (key: string) => {
    const d = dateFromDayKey(key)
    if (!d) return true
    const w = weekday(d)
    return w === 1 || w === 7 || !!holidayOn(key)
  }
  const needsReason = !['paid', 'paidAm', 'paidPm'].includes(kind)
  const valid = !!user && dates.length > 0 && (!needsReason || reason.trim().length > 0) && !dates.some((d) => taken.has(d))

  const submit = async () => {
    const sorted = [...dates].sort()
    const ok = await runWrite(
      registerLeaves(user, sorted, kind, reason.trim(), (d) => period.monthKeyForDayKey(d) ?? d.slice(0, 7), uid),
      `${sorted.length}日分の休暇を登録しました`,
    )
    if (ok) onClose()
  }

  return (
    <Modal opened={opened} onClose={onClose} title="休暇を登録（承認済み）" centered size="lg">
      <Stack>
        <UserSelect value={user} onChange={setUser} allLabel={null} />
        <Radio.Group label="種類" value={kind} onChange={(v) => setKind(v as LeaveKind)}>
          <Group mt={4} gap="sm">
            {leaveKinds.map((k) => (
              <Radio key={k} value={k} label={leaveKindLabel[k]} />
            ))}
          </Group>
        </Radio.Group>
        <div>
          <Text size="sm" fw={500} mb={4}>
            日付（複数選べます）
          </Text>
          <Group align="flex-start" gap="lg">
            <DatePicker
              type="multiple"
              value={dates}
              onChange={(v) => setDates(v.map(String))}
              numberOfColumns={2}
              locale="ja"
              firstDayOfWeek={0}
              excludeDate={(d) => taken.has(String(d)) || (kind !== 'absence' && isOff(String(d)))}
              getDayProps={(d) => (taken.has(String(d)) ? { title: '申請済み' } : {})}
            />
            <Stack gap={4}>
              {[...dates].sort().map((d) => (
                <Text key={d} size="sm" className="num">
                  {shortDayLabelFromKey(d)}
                </Text>
              ))}
              {dates.length > 0 && (
                <Text size="xs" c="dimmed">
                  計 {dates.length * (isHalfDayLeave(kind) ? 0.5 : 1)}日
                </Text>
              )}
            </Stack>
          </Group>
          <Text size="xs" c="dimmed" mt={4}>
            土日・休業日と、すでに休暇がある日は選べません（欠勤だけは土日・休業日も選べます）。
          </Text>
        </div>
        <Textarea label={needsReason ? '理由' : '理由（任意）'} required={needsReason} autosize minRows={2} value={reason} onChange={(e) => setReason(e.currentTarget.value)} />
        {dates.some((d) => taken.has(d)) && <Alert color="orange">すでに休暇がある日が含まれています。</Alert>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            キャンセル
          </Button>
          <Button onClick={submit} disabled={!valid}>
            登録する
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

export default RegisterLeaveModal
