import { useEffect, useState } from 'react'
import { ActionIcon, Alert, Button, Card, Group, NumberInput, Select, Stack, Switch, Table, Text } from '@mantine/core'
import { modals } from '@mantine/modals'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { useData } from '../../data/session'
import type { CompanySettings } from '../../data/models'
import type { BreakRule } from '../../core/attendance'
import { BusinessDays, ClosingPeriod } from '../../core/closingPeriod'
import { durationLabel, monthLabel, shortDayLabel } from '../../core/workCalendar'
import { PageTitle, runWrite } from '../../ui/common'

/** 法定の最低限を満たしているか（初期値と同じ考え方：拘束 6:00 超 → 45分、8:45 超 → 60分） */
function meetsLegalMinimum(rules: BreakRule[]) {
  const required = (span: number) => Math.max(0, ...rules.filter((r) => span > r.overMinutes).map((r) => r.breakMinutes))
  for (let span = 361; span <= 1440; span++) {
    if (required(span) < (span > 525 ? 60 : 45)) return false
  }
  return true
}

/** 会社の設定（settings/company） */
export function CompanyPage() {
  const { company, businessDays, currentMonth } = useData()
  const [s, setS] = useState<CompanySettings>(company)
  const [dirty, setDirty] = useState(false)
  useEffect(() => {
    if (!dirty) setS(company)
  }, [company, dirty])
  const set = (p: Partial<CompanySettings>) => {
    setS((x) => ({ ...x, ...p }))
    setDirty(true)
  }
  const setRule = (i: number, p: Partial<BreakRule>) => set({ breakRules: s.breakRules.map((r, j) => (j === i ? { ...r, ...p } : r)) })

  const period = new ClosingPeriod(s.closingDay)
  const range = period.dateRange(currentMonth)
  const deadline = new BusinessDays(businessDays.holidays).correctionDeadline(currentMonth, period, s.correctionDeadlineBusinessDays)
  const legalOk = meetsLegalMinimum(s.breakRules)

  const write = () =>
    runWrite(
      setDoc(doc(db, 'settings', 'company'), {
        closingDay: s.closingDay,
        correctionDeadlineBusinessDays: s.correctionDeadlineBusinessDays,
        breakRules: [...s.breakRules].sort((a, b) => a.overMinutes - b.overMinutes),
        imageUploadEnabled: s.imageUploadEnabled,
      }),
      '会社の設定を保存しました',
    ).then((ok) => ok && setDirty(false))

  const save = () => {
    const warnings = [
      s.closingDay !== company.closingDay && '締め日を変えます。すでに保存された打刻・日報・経費の「何月分か」は書き換わりません。',
      s.imageUploadEnabled !== company.imageUploadEnabled &&
        (s.imageUploadEnabled
          ? '画像の送信を「する」にします。Firebase を Blaze プランにして Storage を作り、Storage のルールを反映してから切り替えてください。切り替えると、各 iPhone にたまっている画像が送信されます。'
          : '画像の送信を「しない」にします。これから撮る画像は iPhone の中にだけ保存されます。'),
      !legalOk && '休憩のルールが法定の最低限（6時間超 45分、8時間超 60分）を下回っています。',
    ].filter(Boolean) as string[]
    if (warnings.length === 0) return write()
    modals.openConfirmModal({
      title: '確認',
      children: (
        <Stack gap="xs">
          {warnings.map((w) => (
            <Text key={w} size="sm">
              {w}
            </Text>
          ))}
        </Stack>
      ),
      labels: { confirm: '保存する', cancel: 'キャンセル' },
      onConfirm: write,
    })
  }

  return (
    <Stack p="md" maw={760}>
      <PageTitle title="会社の設定">
        {dirty && (
          <Button size="xs" variant="default" onClick={() => setDirty(false)}>
            元に戻す
          </Button>
        )}
        <Button size="xs" onClick={save} disabled={!dirty}>
          保存
        </Button>
      </PageTitle>
      <Text size="sm" c="dimmed">
        従業員アプリと共通の設定です。保存するとすぐに従業員アプリにも反映されます。
      </Text>

      <Card withBorder>
        <Stack>
          <Select
            label="締め日（勤怠と経費で共通）"
            w={200}
            allowDeselect={false}
            value={String(s.closingDay)}
            onChange={(v) => v && set({ closingDay: Number(v) })}
            data={[{ value: '0', label: '月末' }, ...Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}日` }))]}
          />
          {range && (
            <Text size="xs" c="dimmed">
              例：{monthLabel(currentMonth)}分 ＝ {shortDayLabel(range.start)}〜{shortDayLabel(range.end)}
            </Text>
          )}
          <NumberInput
            label="修正申請の期限（締め日の翌日から数えて何営業日目まで）"
            w={360}
            min={1}
            max={10}
            value={s.correctionDeadlineBusinessDays}
            onChange={(v) => typeof v === 'number' && set({ correctionDeadlineBusinessDays: v })}
            suffix=" 営業日"
          />
          {deadline && (
            <Text size="xs" c="dimmed">
              例：{monthLabel(currentMonth)}分は {shortDayLabel(deadline)} まで申請できます（土日・休業日を除く）
            </Text>
          )}
        </Stack>
      </Card>

      <Card withBorder>
        <Text fw={600}>休憩のルール</Text>
        <Text size="xs" c="dimmed" mb="xs">
          拘束時間（最後の退勤 − 最初の出勤）がこの時間を超えたら、この休憩が必要とします。中抜けの時間を休憩に充て、足りない分だけを自動で差し引きます。
        </Text>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>拘束時間が（分）を超えたら</Table.Th>
              <Table.Th>休憩（分）</Table.Th>
              <Table.Th w={50} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {s.breakRules.map((r, i) => (
              <Table.Tr key={i}>
                <Table.Td>
                  <Group gap="xs">
                    <NumberInput w={110} min={0} max={1440} value={r.overMinutes} onChange={(v) => typeof v === 'number' && setRule(i, { overMinutes: v })} aria-label="拘束時間（分）" />
                    <Text size="sm" c="dimmed">
                      （{durationLabel(r.overMinutes)}）
                    </Text>
                  </Group>
                </Table.Td>
                <Table.Td>
                  <NumberInput w={110} min={0} max={480} value={r.breakMinutes} onChange={(v) => typeof v === 'number' && setRule(i, { breakMinutes: v })} aria-label="休憩（分）" />
                </Table.Td>
                <Table.Td>
                  <ActionIcon variant="subtle" color="red" onClick={() => set({ breakRules: s.breakRules.filter((_, j) => j !== i) })} aria-label="削除">
                    <IconTrash size={16} />
                  </ActionIcon>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        <Group mt="xs">
          <Button variant="light" size="xs" leftSection={<IconPlus size={14} />} onClick={() => set({ breakRules: [...s.breakRules, { overMinutes: 480, breakMinutes: 60 }] })}>
            行を追加
          </Button>
          <Button variant="subtle" size="xs" onClick={() => set({ breakRules: [{ overMinutes: 360, breakMinutes: 45 }, { overMinutes: 525, breakMinutes: 60 }] })}>
            法定の初期値に戻す
          </Button>
        </Group>
        {!legalOk && (
          <Alert color="orange" mt="sm">
            法定の最低限（労働が6時間を超えると45分、8時間を超えると60分）を下回る日があります。
          </Alert>
        )}
      </Card>

      <Card withBorder>
        <Switch
          label="日報の写真・領収書の画像をクラウドに送る"
          description="Firebase を Blaze（従量課金）プランにして Cloud Storage を作ってからオンにします。オフの間は、画像は従業員の iPhone の中だけにあります。"
          checked={s.imageUploadEnabled}
          onChange={(e) => set({ imageUploadEnabled: e.currentTarget.checked })}
        />
      </Card>
    </Stack>
  )
}
