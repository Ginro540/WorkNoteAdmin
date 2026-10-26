import { useEffect, useState } from 'react'
import { ActionIcon, Badge, Button, Group, Select, Stack, Switch, Table, Text, TextInput } from '@mantine/core'
import { IconArrowDown, IconArrowUp, IconPlus, IconTrash } from '@tabler/icons-react'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { useData } from '../../data/session'
import { protectedReportKeys, reportFieldTypeLabel, type ReportField, type ReportFieldType } from '../../data/models'
import { PageTitle, runWrite } from '../../ui/common'

/** 管理者が追加できる項目の種類 */
const addableTypes: ReportFieldType[] = ['text', 'longText', 'photos']

/** 日報の項目（settings/reportTemplate） */
export function ReportFieldsPage() {
  const { reportFields } = useData()
  const [fields, setFields] = useState<ReportField[]>(reportFields)
  const [dirty, setDirty] = useState(false)
  useEffect(() => {
    if (!dirty) setFields(reportFields)
  }, [reportFields, dirty])

  const update = (next: ReportField[]) => {
    setFields(next)
    setDirty(true)
  }
  const patch = (i: number, p: Partial<ReportField>) => update(fields.map((f, j) => (j === i ? { ...f, ...p } : f)))
  const move = (i: number, delta: number) => {
    const next = [...fields]
    ;[next[i], next[i + delta]] = [next[i + delta], next[i]]
    update(next)
  }
  const add = () => update([...fields, { key: `field_${Date.now().toString(36)}`, label: '', type: 'text', required: false, order: 0 }])

  const valid = fields.every((f) => f.label.trim())
  const save = async () => {
    const list = fields.map((f, i) => ({ ...f, label: f.label.trim(), order: i + 1 }))
    if (await runWrite(setDoc(doc(db, 'settings', 'reportTemplate'), { fields: list }), '日報の項目を保存しました')) setDirty(false)
  }

  return (
    <Stack p="md" maw={900}>
      <PageTitle title="日報の項目">
        {dirty && (
          <Button size="xs" variant="default" onClick={() => setDirty(false)}>
            元に戻す
          </Button>
        )}
        <Button size="xs" onClick={save} disabled={!dirty || !valid}>
          保存
        </Button>
      </PageTitle>
      <Text size="sm" c="dimmed">
        従業員アプリの日報の入力欄です。保存するとすぐに従業員アプリに反映されます。日付・作業時間・訪問先・現場名・作業内容は従業員アプリが特別に扱うので、削除や種類の変更はできません。項目を削除しても、保存済みの日報の内容は残ります。
      </Text>
      <Table.ScrollContainer minWidth={640}>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={90}>並び順</Table.Th>
              <Table.Th>名前</Table.Th>
              <Table.Th w={160}>種類</Table.Th>
              <Table.Th w={80}>必須</Table.Th>
              <Table.Th w={50} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {fields.map((f, i) => {
              const locked = protectedReportKeys.includes(f.key)
              const typeOptions = addableTypes.includes(f.type) ? addableTypes : [f.type]
              return (
                <Table.Tr key={f.key}>
                  <Table.Td>
                    <Group gap={2} wrap="nowrap">
                      <ActionIcon variant="subtle" disabled={i === 0} onClick={() => move(i, -1)} aria-label="上へ">
                        <IconArrowUp size={16} />
                      </ActionIcon>
                      <ActionIcon variant="subtle" disabled={i === fields.length - 1} onClick={() => move(i, 1)} aria-label="下へ">
                        <IconArrowDown size={16} />
                      </ActionIcon>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <TextInput value={f.label} onChange={(e) => patch(i, { label: e.currentTarget.value })} error={!f.label.trim()} aria-label="名前" />
                    <Text size="xs" c="dimmed" mt={2}>
                      キー：{f.key}
                      {locked && (
                        <Badge size="xs" variant="light" ml={6}>
                          固定
                        </Badge>
                      )}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Select
                      data={typeOptions.map((t) => ({ value: t, label: reportFieldTypeLabel[t] }))}
                      value={f.type}
                      onChange={(v) => v && patch(i, { type: v as ReportFieldType })}
                      disabled={locked || typeOptions.length === 1}
                      allowDeselect={false}
                      aria-label="種類"
                    />
                  </Table.Td>
                  <Table.Td>
                    <Switch checked={f.required} onChange={(e) => patch(i, { required: e.currentTarget.checked })} disabled={f.key === 'date'} aria-label="必須" />
                  </Table.Td>
                  <Table.Td>
                    <ActionIcon variant="subtle" color="red" disabled={locked} onClick={() => update(fields.filter((_, j) => j !== i))} aria-label="削除">
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              )
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <Button variant="light" leftSection={<IconPlus size={14} />} onClick={add} w="fit-content">
        項目を追加
      </Button>
    </Stack>
  )
}
