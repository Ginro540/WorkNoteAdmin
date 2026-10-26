import { useState } from 'react'
import { ActionIcon, Badge, Button, Group, SegmentedControl, Select, Stack, Table, Text, TextInput } from '@mantine/core'
import { IconTrash } from '@tabler/icons-react'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { useDocument } from '../../data/firestore'
import { holidayKindLabel, parseHolidays, type Holiday, type HolidayKind } from '../../data/models'
import { dateFromDayKey, jstParts, shortDayLabelFromKey } from '../../core/workCalendar'
import { Loading, PageTitle, runWrite } from '../../ui/common'

/** 休業日（settings/calendar_{yyyy}）。修正申請の期限の計算と、勤怠の休日の色分けに使う */
export function HolidaysPage() {
  const thisYear = jstParts(new Date()).year
  const [year, setYear] = useState(thisYear)
  const { data, loading } = useDocument(doc(db, 'settings', `calendar_${year}`), `calendar-${year}`, (_id, d) => parseHolidays(d))
  const holidays = [...(data ?? [])].sort((a, b) => a.date.localeCompare(b.date))
  const [date, setDate] = useState('')
  const [name, setName] = useState('')
  const [kind, setKind] = useState<HolidayKind>('company')

  const save = (list: Holiday[], message: string) =>
    runWrite(setDoc(doc(db, 'settings', `calendar_${year}`), { holidays: list.sort((a, b) => a.date.localeCompare(b.date)) }), message)

  const validDate = !!dateFromDayKey(date) && date.startsWith(`${year}-`)
  const add = async () => {
    const list = holidays.filter((h) => h.date !== date)
    if (await save([...list, { date, name: name.trim(), kind }], '追加しました')) {
      setDate('')
      setName('')
    }
  }

  return (
    <Stack p="md" maw={800}>
      <PageTitle title="休業日">
        <Select
          aria-label="年"
          w={110}
          allowDeselect={false}
          value={String(year)}
          onChange={(v) => v && setYear(Number(v))}
          data={[thisYear - 1, thisYear, thisYear + 1, thisYear + 2].map((y) => ({ value: String(y), label: `${y}年` }))}
        />
      </PageTitle>
      <Text size="sm" c="dimmed">
        国民の祝日と会社の休業日（年末年始・夏季休暇など）です。修正申請の期限（営業日の数え方）と、勤怠の休日の色分けに使います。年をまたぐ休みは、それぞれの年に登録してください。
      </Text>
      <Group align="flex-end" wrap="wrap">
        <TextInput type="date" label="日付" value={date} onChange={(e) => setDate(e.currentTarget.value)} error={date && !validDate ? `${year}年の日付にしてください` : undefined} />
        <TextInput label="名前" value={name} onChange={(e) => setName(e.currentTarget.value)} placeholder="例：年末年始休暇" />
        <SegmentedControl
          value={kind}
          onChange={(v) => setKind(v as HolidayKind)}
          data={[
            { value: 'company', label: '会社の休業日' },
            { value: 'national', label: '国民の祝日' },
          ]}
        />
        <Button onClick={add} disabled={!validDate || !name.trim()}>
          追加
        </Button>
      </Group>
      {date && holidays.some((h) => h.date === date) && (
        <Text size="xs" c="orange">
          この日はすでに登録されています。追加すると置き換えます。
        </Text>
      )}
      {loading ? (
        <Loading />
      ) : (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>日付</Table.Th>
              <Table.Th>名前</Table.Th>
              <Table.Th>種類</Table.Th>
              <Table.Th w={50} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {holidays.map((h) => (
              <Table.Tr key={h.date}>
                <Table.Td className="num">{shortDayLabelFromKey(h.date)}</Table.Td>
                <Table.Td>{h.name}</Table.Td>
                <Table.Td>
                  <Badge variant="light" color={h.kind === 'company' ? 'indigo' : 'red'}>
                    {holidayKindLabel[h.kind]}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <ActionIcon variant="subtle" color="red" onClick={() => save(holidays.filter((x) => x.date !== h.date), '削除しました')} aria-label="削除">
                    <IconTrash size={16} />
                  </ActionIcon>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      {!loading && holidays.length === 0 && (
        <Text c="dimmed" size="sm">
          {year}年の休日はまだ登録されていません。
        </Text>
      )}
    </Stack>
  )
}
