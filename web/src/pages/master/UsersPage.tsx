import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Alert, Button, Card, Divider, Group, Modal, PasswordInput, SegmentedControl, Stack, Text, TextInput } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { useData } from '../../data/session'
import { ProfileWriteError, createEmployee, sendPasswordReset, updateUser, writeUserProfile } from '../../data/actions'
import { roleLabel, type AppUser, type Role } from '../../data/models'
import { dateTimeLabel } from '../../core/workCalendar'
import { Empty, Field, ListDetail, PageTitle, errorMessage, runWrite } from '../../ui/common'
import { notifications } from '@mantine/notifications'

export function UsersPage() {
  const { id } = useParams()
  const { users } = useData()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const list = users.filter((u) => !search.trim() || u.displayName.includes(search.trim()) || u.email.includes(search.trim()))
  const selected = users.find((u) => u.id === id)

  const listPane = (
    <Stack gap={0}>
      <Stack p="md" gap="xs">
        <PageTitle title="従業員">
          <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setAdding(true)}>
            追加
          </Button>
        </PageTitle>
        <TextInput placeholder="名前・メールアドレスで検索" value={search} onChange={(e) => setSearch(e.currentTarget.value)} />
        <Text size="xs" c="dimmed">
          {list.length}人
        </Text>
      </Stack>
      <Divider />
      {list.map((u) => (
        <div key={u.id} className={`list-row ${u.id === id ? 'active' : ''}`} onClick={() => navigate(`/master/users/${u.id}`)}>
          <Group justify="space-between">
            <Text fw={600} size="sm">
              {u.displayName || '（名前なし）'}
            </Text>
            <Text size="xs" c={u.role === 'admin' ? 'indigo' : 'dimmed'}>
              {roleLabel(u.role)}
            </Text>
          </Group>
          <Text size="xs" c="dimmed">
            {u.email}
          </Text>
        </div>
      ))}
      <AddUserModal opened={adding} onClose={() => setAdding(false)} onCreated={(uid) => navigate(`/master/users/${uid}`)} />
    </Stack>
  )
  return <ListDetail hasDetail={!!id} list={listPane} detail={selected ? <UserDetail key={selected.id} user={selected} /> : <Empty>左の一覧から従業員を選んでください</Empty>} />
}

function UserDetail({ user }: { user: AppUser }) {
  const { uid } = useData()
  const [name, setName] = useState(user.displayName)
  const [role, setRole] = useState<Role>(user.role)
  useEffect(() => {
    setName(user.displayName)
    setRole(user.role)
  }, [user.displayName, user.role])
  const isMe = user.id === uid
  const changed = name.trim() !== user.displayName || role !== user.role

  const save = () =>
    runWrite(
      updateUser(user.id, { ...(name.trim() !== user.displayName ? { displayName: name.trim() } : {}), ...(role !== user.role ? { role } : {}) }),
      '保存しました',
    )
  const reset = async () => {
    try {
      await sendPasswordReset(user.email)
      notifications.show({ color: 'green', message: `${user.email} にパスワードの再設定メールを送りました` })
    } catch (e) {
      notifications.show({ color: 'red', message: errorMessage(e) })
    }
  }

  return (
    <Stack p="md" maw={640}>
      <PageTitle title={user.displayName || '（名前なし）'} back="/master/users" />
      <Card withBorder>
        <Stack>
          <Group gap="xl">
            <Field label="メールアドレス">{user.email}</Field>
            <Field label="登録日">{user.createdAt ? dateTimeLabel(user.createdAt) : '—'}</Field>
          </Group>
          <TextInput label="名前" value={name} onChange={(e) => setName(e.currentTarget.value)} />
          <div>
            <Text size="sm" fw={500} mb={4}>
              権限
            </Text>
            <SegmentedControl
              value={role}
              onChange={(v) => setRole(v as Role)}
              disabled={isMe}
              data={[
                { value: 'employee', label: '従業員' },
                { value: 'admin', label: '管理者' },
              ]}
            />
            {isMe && (
              <Text size="xs" c="dimmed" mt={4}>
                自分の権限は変えられません（管理者がいなくなるのを防ぐため）。
              </Text>
            )}
          </div>
          <Group>
            <Button onClick={save} disabled={!changed || !name.trim()}>
              保存
            </Button>
          </Group>
        </Stack>
      </Card>
      <Card withBorder>
        <Stack gap="xs">
          <Text fw={600}>パスワード</Text>
          <Text size="sm" c="dimmed">
            管理者はパスワードを見たり変えたりできません。本人に再設定メールを送ります。
          </Text>
          <Button variant="light" w="fit-content" onClick={reset}>
            再設定メールを送る
          </Button>
        </Stack>
      </Card>
      <Text size="xs" c="dimmed">
        アカウントの無効化・削除はまだできません（Firebase の無料プランでは管理者アプリから操作できないため）。
      </Text>
    </Stack>
  )
}

function AddUserModal({ opened, onClose, onCreated }: { opened: boolean; onClose: () => void; onCreated: (uid: string) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('employee')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryUid, setRetryUid] = useState<string | null>(null)

  useEffect(() => {
    if (!opened) return
    setEmail('')
    setPassword('')
    setName('')
    setRole('employee')
    setError(null)
    setRetryUid(null)
  }, [opened])

  const valid = /^\S+@\S+\.\S+$/.test(email.trim()) && password.length >= 8 && name.trim().length > 0

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const uid = retryUid
        ? (await writeUserProfile(retryUid, email.trim(), name.trim(), role), retryUid)
        : await createEmployee(email.trim(), password, name.trim(), role)
      notifications.show({ color: 'green', message: `${name.trim()}さんを登録しました` })
      onClose()
      onCreated(uid)
    } catch (e) {
      if (e instanceof ProfileWriteError) {
        setRetryUid(e.uid)
        setError(`${e.message}「もう一度保存」を押してください（${errorMessage(e.cause)}）`)
      } else {
        setError(errorMessage(e))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title="従業員を追加" centered>
      <Stack>
        {error && <Alert color="red">{error}</Alert>}
        <TextInput label="メールアドレス" type="email" value={email} onChange={(e) => setEmail(e.currentTarget.value)} disabled={!!retryUid} required />
        <PasswordInput label="初期パスワード（8文字以上）" value={password} onChange={(e) => setPassword(e.currentTarget.value)} disabled={!!retryUid} required />
        <TextInput label="名前" value={name} onChange={(e) => setName(e.currentTarget.value)} placeholder="例：山田 太郎" required />
        <SegmentedControl
          value={role}
          onChange={(v) => setRole(v as Role)}
          data={[
            { value: 'employee', label: '従業員' },
            { value: 'admin', label: '管理者' },
          ]}
        />
        <Text size="xs" c="dimmed">
          初期パスワードは本人に伝えてください。本人はログイン画面の「パスワードを忘れたとき」からも設定し直せます。つながっているときだけ追加できます。
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            キャンセル
          </Button>
          <Button onClick={submit} loading={busy} disabled={!valid && !retryUid}>
            {retryUid ? 'もう一度保存' : '追加する'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
