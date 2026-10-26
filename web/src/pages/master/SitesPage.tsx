import { useEffect, useState } from 'react'
import { ActionIcon, Badge, Button, Group, Modal, Stack, Switch, Table, Text, TextInput } from '@mantine/core'
import { IconArrowDown, IconArrowUp, IconPencil, IconPlus } from '@tabler/icons-react'
import { collection, doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore'
import { db } from '../../firebase'
import { useData } from '../../data/session'
import type { Site } from '../../data/models'
import { PageTitle, runWrite } from '../../ui/common'

/** 勤務先（sites）。日報が ID で参照しているので削除はせず、「使わない」にする */
export function SitesPage() {
  const { sites } = useData()
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<Site | 'new' | null>(null)
  const s = search.trim()
  const list = sites.filter((x) => (showInactive || x.active) && (!s || x.name.includes(s) || x.address.includes(s)))

  /** 並び順を 1, 2, 3… に振り直して入れ替える */
  const move = (site: Site, delta: number) => {
    const ordered = [...sites]
    const i = ordered.findIndex((x) => x.id === site.id)
    const j = i + delta
    if (j < 0 || j >= ordered.length) return
    ;[ordered[i], ordered[j]] = [ordered[j], ordered[i]]
    const batch = writeBatch(db)
    ordered.forEach((x, n) => {
      if (x.order !== n + 1) batch.update(doc(db, 'sites', x.id), { order: n + 1 })
    })
    runWrite(batch.commit(), '並び順を変えました')
  }

  return (
    <Stack p="md" maw={1000}>
      <PageTitle title="勤務先">
        <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setEditing('new')}>
          追加
        </Button>
      </PageTitle>
      <Text size="sm" c="dimmed">
        従業員アプリの日報で選ぶ勤務先です。「使う」をオフにすると選択肢に出なくなります（過去の日報はそのまま）。
      </Text>
      <Group>
        <TextInput placeholder="名前・住所で検索" value={search} onChange={(e) => setSearch(e.currentTarget.value)} w={260} />
        <Switch label="使わない勤務先も表示" checked={showInactive} onChange={(e) => setShowInactive(e.currentTarget.checked)} />
      </Group>
      <Table.ScrollContainer minWidth={640}>
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={90}>並び順</Table.Th>
              <Table.Th>名前</Table.Th>
              <Table.Th>住所</Table.Th>
              <Table.Th w={90}>使う</Table.Th>
              <Table.Th w={50} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {list.map((site) => (
              <Table.Tr key={site.id}>
                <Table.Td>
                  <Group gap={2} wrap="nowrap">
                    <ActionIcon variant="subtle" onClick={() => move(site, -1)} disabled={!!s} aria-label="上へ">
                      <IconArrowUp size={16} />
                    </ActionIcon>
                    <ActionIcon variant="subtle" onClick={() => move(site, 1)} disabled={!!s} aria-label="下へ">
                      <IconArrowDown size={16} />
                    </ActionIcon>
                  </Group>
                </Table.Td>
                <Table.Td fw={500}>
                  {site.name}
                  {!site.active && (
                    <Badge size="xs" color="gray" ml={6}>
                      使わない
                    </Badge>
                  )}
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {site.address}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Switch
                    checked={site.active}
                    onChange={(e) => runWrite(updateDoc(doc(db, 'sites', site.id), { active: e.currentTarget.checked }))}
                    aria-label="使う"
                  />
                </Table.Td>
                <Table.Td>
                  <ActionIcon variant="subtle" onClick={() => setEditing(site)} aria-label="編集">
                    <IconPencil size={16} />
                  </ActionIcon>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <SiteModal site={editing} onClose={() => setEditing(null)} nextOrder={Math.max(0, ...sites.map((x) => x.order)) + 1} />
    </Stack>
  )
}

function SiteModal({ site, onClose, nextOrder }: { site: Site | 'new' | null; onClose: () => void; nextOrder: number }) {
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  useEffect(() => {
    if (!site) return
    setName(site === 'new' ? '' : site.name)
    setAddress(site === 'new' ? '' : site.address)
  }, [site])
  const save = async () => {
    const ok =
      site === 'new'
        ? await runWrite(setDoc(doc(collection(db, 'sites')), { name: name.trim(), address: address.trim(), active: true, order: nextOrder }), '追加しました')
        : site && (await runWrite(updateDoc(doc(db, 'sites', site.id), { name: name.trim(), address: address.trim() })))
    if (ok) onClose()
  }
  return (
    <Modal opened={!!site} onClose={onClose} title={site === 'new' ? '勤務先を追加' : '勤務先を編集'} centered>
      <Stack>
        <TextInput label="名前" required value={name} onChange={(e) => setName(e.currentTarget.value)} placeholder="例：〇〇様邸" data-autofocus />
        <TextInput label="住所" value={address} onChange={(e) => setAddress(e.currentTarget.value)} />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            キャンセル
          </Button>
          <Button onClick={save} disabled={!name.trim()}>
            保存
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
