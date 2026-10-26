import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Alert, Anchor, Badge, Button, Card, Checkbox, Divider, Group, List, Modal, PasswordInput, SegmentedControl, Stack, Text, TextInput, Textarea } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { useData } from '../../data/session'
import { ProfileWriteError, createEmployee, retireUser, sendPasswordReset, unretireUser, updateUser, writeUserProfile } from '../../data/actions'
import { roleLabel, type AppUser, type Role } from '../../data/models'
import { dateTimeLabel, dayKey, shortDayLabelFromKey } from '../../core/workCalendar'
import { Empty, Field, ListDetail, PageTitle, errorMessage, runWrite } from '../../ui/common'
import { notifications } from '@mantine/notifications'
import { FirebaseError } from 'firebase/app'

const consoleUsersUrl = 'https://console.firebase.google.com/project/worknote-6dc51/authentication/users'

export function UsersPage() {
  const { id } = useParams()
  const { users } = useData()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [showRetired, setShowRetired] = useState(false)
  const retiredCount = users.filter((u) => u.retiredAt).length
  const list = users
    .filter((u) => showRetired || !u.retiredAt || u.id === id)
    .filter((u) => !search.trim() || u.displayName.includes(search.trim()) || u.email.includes(search.trim()))
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
        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            {list.length}人
          </Text>
          {retiredCount > 0 && <Checkbox size="xs" label={`退職した人も表示（${retiredCount}人）`} checked={showRetired} onChange={(e) => setShowRetired(e.currentTarget.checked)} />}
        </Group>
      </Stack>
      <Divider />
      {list.map((u) => (
        <div key={u.id} className={`list-row ${u.id === id ? 'active' : ''}`} onClick={() => navigate(`/master/users/${u.id}`)}>
          <Group justify="space-between">
            <Text fw={600} size="sm">
              {u.displayName || '（名前なし）'}
            </Text>
            {u.retiredAt ? (
              <Badge size="sm" color="gray" variant="light">
                退職
              </Badge>
            ) : (
              <Text size="xs" c={u.role === 'admin' ? 'indigo' : 'dimmed'}>
                {roleLabel(u.role)}
              </Text>
            )}
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
  const { uid, userName } = useData()
  const [retiring, setRetiring] = useState(false)
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
      {user.retiredAt && (
        <Alert color="gray" title="退職した人です">
          <Text size="sm">
            退職日 {user.retireDate ? shortDayLabelFromKey(user.retireDate) : '—'}（{dateTimeLabel(user.retiredAt)} に {userName(user.retiredBy)} が設定）
            {user.retireReason && `。理由：${user.retireReason}`}
          </Text>
          <Text size="sm" mt={4}>
            従業員アプリでは何も読み書きできません。過去の勤怠・日報・経費はそのまま残っています。
          </Text>
        </Alert>
      )}
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
      <Card withBorder>
        <Stack gap="xs">
          <Text fw={600}>退職</Text>
          {user.retiredAt ? (
            <>
              <Text size="sm" c="dimmed">
                取り消すと、すぐにまた従業員アプリを使えるようになります。
              </Text>
              <Button variant="light" w="fit-content" onClick={() => runWrite(unretireUser(user.id), '退職を取り消しました')}>
                退職を取り消す
              </Button>
            </>
          ) : (
            <>
              <Text size="sm" c="dimmed">
                退職にすると、すぐに従業員アプリ・管理者アプリで何も読み書きできなくなります。過去の勤怠・日報・経費は消えず、管理者は今までどおり見られます。あとから取り消せます。
              </Text>
              <Button color="red" variant="light" w="fit-content" disabled={isMe} onClick={() => setRetiring(true)}>
                退職にする
              </Button>
              {isMe && (
                <Text size="xs" c="dimmed">
                  自分は退職にできません。
                </Text>
              )}
            </>
          )}
          <Text size="xs" c="dimmed">
            ログイン用のアカウント（メールとパスワード）は残ります。完全に消すときは{' '}
            <Anchor href={consoleUsersUrl} target="_blank" size="xs">
              Firebase コンソールの Authentication
            </Anchor>{' '}
            で、このメールアドレスの行を削除してください。
          </Text>
        </Stack>
      </Card>
      <RetireModal user={user} adminUid={uid} opened={retiring} onClose={() => setRetiring(false)} />
    </Stack>
  )
}

function RetireModal({ user, adminUid, opened, onClose }: { user: AppUser; adminUid: string; opened: boolean; onClose: () => void }) {
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')
  useEffect(() => {
    if (!opened) return
    setDate(dayKey(new Date()))
    setReason('')
  }, [opened])
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date)
  const submit = async () => {
    if (await runWrite(retireUser(user.id, adminUid, date, reason.trim()), `${user.displayName}さんを退職にしました`)) onClose()
  }
  return (
    <Modal opened={opened} onClose={onClose} title={`${user.displayName || user.email}さんを退職にする`} centered>
      <Stack>
        <Text size="sm">保存した時点から、この人は従業員アプリで打刻・日報・経費を含めて何も読み書きできなくなります。</Text>
        <TextInput type="date" label="退職日（記録用）" required value={date} onChange={(e) => setDate(e.currentTarget.value)} />
        <Textarea label="メモ（任意）" autosize minRows={2} value={reason} onChange={(e) => setReason(e.currentTarget.value)} />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            キャンセル
          </Button>
          <Button color="red" onClick={submit} disabled={!valid}>
            退職にする
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

function AddUserModal({ opened, onClose, onCreated }: { opened: boolean; onClose: () => void; onCreated: (uid: string) => void }) {
  const { users } = useData()
  const navigate = useNavigate()
  const [inUse, setInUse] = useState(false)
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
    setInUse(false)
  }, [opened])

  const valid = /^\S+@\S+\.\S+$/.test(email.trim()) && password.length >= 8 && name.trim().length > 0

  const submit = async () => {
    setBusy(true)
    setError(null)
    setInUse(false)
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
      } else if (e instanceof FirebaseError && e.code === 'auth/email-already-in-use') {
        setInUse(true)
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
        {inUse && <EmailInUse email={email.trim()} existing={users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase())} onOpen={(id) => (onClose(), navigate(`/master/users/${id}`))} />}
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

/** 「このメールアドレスはすでに使われています」のときの案内 */
function EmailInUse({ email, existing, onOpen }: { email: string; existing?: AppUser; onOpen: (id: string) => void }) {
  if (existing) {
    return (
      <Alert color="orange" title="すでに登録されています">
        <Text size="sm">
          {existing.displayName}さん（{existing.retiredAt ? '退職' : roleLabel(existing.role)}）として登録済みです。
          {existing.retiredAt && '戻すときは、開いて「退職を取り消す」を押してください。'}
        </Text>
        <Button size="xs" variant="light" mt="xs" onClick={() => onOpen(existing.id)}>
          開く
        </Button>
      </Alert>
    )
  }
  return (
    <Alert color="orange" title="ログイン用のアカウントだけが残っています">
      <Text size="sm">{email} のアカウントはありますが、従業員として登録されていません（以前の登録が途中で止まった場合など）。次の手順で追加し直してください。</Text>
      <List size="sm" type="ordered" mt="xs">
        <List.Item>
          <Anchor href={consoleUsersUrl} target="_blank" size="sm">
            Firebase コンソールの Authentication
          </Anchor>{' '}
          を開く
        </List.Item>
        <List.Item>{email} の行の右端「︙」から「アカウントを削除」を選ぶ</List.Item>
        <List.Item>この画面に戻って、もう一度「追加する」を押す</List.Item>
      </List>
    </Alert>
  )
}
