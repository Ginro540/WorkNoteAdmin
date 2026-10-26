import { useEffect, useState } from 'react'
import { ActionIcon, Button, Group, Stack, Table, TagsInput, Text, TextInput, Tooltip } from '@mantine/core'
import { IconArrowDown, IconArrowUp, IconPlus, IconTrash } from '@tabler/icons-react'
import { collection, doc, setDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { useData } from '../../data/session'
import { useQuery } from '../../data/firestore'
import { otherCategoryId, type ExpenseCategory } from '../../data/models'
import { PageTitle, runWrite } from '../../ui/common'

/** 経費の区分（settings/expenseCategories） */
export function CategoriesPage() {
  const { categories } = useData()
  const [list, setList] = useState<ExpenseCategory[]>(categories)
  const [dirty, setDirty] = useState(false)
  useEffect(() => {
    if (!dirty) setList(categories)
  }, [categories, dirty])
  // 使われている区分を数える（全件読むので、このページを開いたときだけ）
  const expenses = useQuery(collection(db, 'expenses'), 'all-expenses-categories', (_id, d) => (typeof d.categoryId === 'string' ? d.categoryId : null))
  const usage = new Map<string, number>()
  for (const c of expenses.items) usage.set(c, (usage.get(c) ?? 0) + 1)

  const update = (next: ExpenseCategory[]) => {
    setList(next)
    setDirty(true)
  }
  const patch = (i: number, p: Partial<ExpenseCategory>) => update(list.map((c, j) => (j === i ? { ...c, ...p } : c)))
  // 「その他」はいつも最後
  const movable = list.filter((c) => c.id !== otherCategoryId)
  const move = (i: number, delta: number) => {
    const next = [...movable]
    ;[next[i], next[i + delta]] = [next[i + delta], next[i]]
    update([...next, ...list.filter((c) => c.id === otherCategoryId)])
  }

  const valid = list.every((c) => c.name.trim())
  const save = async () => {
    const ordered = [...list.filter((c) => c.id !== otherCategoryId), ...list.filter((c) => c.id === otherCategoryId)]
    const categoriesToSave = ordered.map((c, i) => ({
      id: c.id,
      name: c.name.trim(),
      keywords: c.keywords.map((k) => k.trim()).filter(Boolean),
      order: c.id === otherCategoryId ? 99 : i + 1,
    }))
    if (!categoriesToSave.some((c) => c.id === otherCategoryId)) categoriesToSave.push({ id: otherCategoryId, name: 'その他', keywords: [], order: 99 })
    if (await runWrite(setDoc(doc(db, 'settings', 'expenseCategories'), { categories: categoriesToSave }), '経費の区分を保存しました')) setDirty(false)
  }

  return (
    <Stack p="md" maw={1000}>
      <PageTitle title="経費の区分">
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
        従業員アプリは、領収書の支払先と文字に判定キーワードが含まれていると、その区分を自動で選びます（上の区分ほど優先）。どれにも当たらなければ「その他」になります。使われている区分は削除できません。
      </Text>
      <Table.ScrollContainer minWidth={720}>
        <Table verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={90}>並び順</Table.Th>
              <Table.Th w={200}>名前</Table.Th>
              <Table.Th>判定キーワード（Enter で追加）</Table.Th>
              <Table.Th w={70} ta="right">
                件数
              </Table.Th>
              <Table.Th w={50} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {list.map((c) => {
              const i = list.indexOf(c)
              const mi = movable.indexOf(c)
              const isOther = c.id === otherCategoryId
              const used = usage.get(c.id) ?? 0
              return (
                <Table.Tr key={c.id}>
                  <Table.Td>
                    {!isOther && (
                      <Group gap={2} wrap="nowrap">
                        <ActionIcon variant="subtle" disabled={mi === 0} onClick={() => move(mi, -1)} aria-label="上へ">
                          <IconArrowUp size={16} />
                        </ActionIcon>
                        <ActionIcon variant="subtle" disabled={mi === movable.length - 1} onClick={() => move(mi, 1)} aria-label="下へ">
                          <IconArrowDown size={16} />
                        </ActionIcon>
                      </Group>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <TextInput value={c.name} onChange={(e) => patch(i, { name: e.currentTarget.value })} error={!c.name.trim()} aria-label="名前" />
                  </Table.Td>
                  <Table.Td>
                    {isOther ? (
                      <Text size="sm" c="dimmed">
                        どの区分にも当たらないもの
                      </Text>
                    ) : (
                      <TagsInput value={c.keywords} onChange={(v) => patch(i, { keywords: v })} aria-label="判定キーワード" />
                    )}
                  </Table.Td>
                  <Table.Td ta="right" className="num">
                    {expenses.loading ? '…' : used}
                  </Table.Td>
                  <Table.Td>
                    <Tooltip label={isOther ? '「その他」は削除できません' : used ? '使われている区分は削除できません' : '削除'}>
                      <ActionIcon variant="subtle" color="red" disabled={isOther || used > 0 || expenses.loading} onClick={() => update(list.filter((x) => x.id !== c.id))} aria-label="削除">
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Table.Td>
                </Table.Tr>
              )
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <Button
        variant="light"
        leftSection={<IconPlus size={14} />}
        w="fit-content"
        onClick={() => update([...movable, { id: `cat_${Date.now().toString(36)}`, name: '', keywords: [], order: 0 }, ...list.filter((c) => c.id === otherCategoryId)])}
      >
        区分を追加
      </Button>
    </Stack>
  )
}
