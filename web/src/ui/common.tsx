import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Anchor, Badge, Button, Group, Loader, Modal, Select, Stack, Text, Textarea, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconChevronLeft } from '@tabler/icons-react'
import { FirebaseError } from 'firebase/app'
import { getStorageModule } from '../firebase'
import { useData } from '../data/session'
import { monthLabel, shiftMonthKey } from '../core/workCalendar'
import { statusColor } from './theme'

// MARK: - 書き込みの結果を知らせる

export function errorMessage(e: unknown): string {
  if (e instanceof FirebaseError) {
    switch (e.code) {
      case 'permission-denied':
        return '権限がないか、すでに状態が変わっています。画面を確認してもう一度お試しください。'
      case 'unavailable':
        return '通信できません。電波の良いところでもう一度お試しください。'
      case 'auth/email-already-in-use':
        return 'このメールアドレスはすでに使われています。'
      case 'auth/invalid-email':
        return 'メールアドレスの形式が正しくありません。'
      case 'auth/weak-password':
        return 'パスワードは6文字以上にしてください。'
      case 'auth/network-request-failed':
        return '通信できません。電波の良いところでもう一度お試しください。'
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'メールアドレスまたはパスワードが違います。'
      case 'auth/too-many-requests':
        return '試行回数が多すぎます。しばらくしてからもう一度お試しください。'
    }
    return e.message
  }
  return e instanceof Error ? e.message : String(e)
}

/**
 * 書き込みを待つ。オフラインのときは端末に保存され、サーバーに届くまで終わらないので、
 * 少し待って届かなければ「つながったら送信します」と知らせて先に進む。
 * 失敗したら（あとで失敗した場合も）エラーを出す。true なら保存できた（または送信待ち）。
 */
export async function runWrite(promise: Promise<unknown>, success = '保存しました'): Promise<boolean> {
  let settled = false
  const done = promise.then(
    () => {
      settled = true
      return 'ok' as const
    },
    (e) => {
      settled = true
      notifications.show({ color: 'red', title: '保存できませんでした', message: errorMessage(e), autoClose: 8000 })
      return 'error' as const
    },
  )
  const result = await Promise.race([done, new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), 2500))])
  if (result === 'ok') notifications.show({ color: 'green', message: success })
  if (result === 'timeout' && !settled) notifications.show({ color: 'yellow', message: '通信できないため、つながったら送信します' })
  return result !== 'error'
}

// MARK: - 表示の部品

export function StatusBadge({ status, label }: { status: keyof typeof statusColor; label: string }) {
  return (
    <Badge color={statusColor[status]} variant="light" radius="sm">
      {label}
    </Badge>
  )
}

export function PendingBadge({ show }: { show: boolean }) {
  return show ? (
    <Badge color="yellow" variant="outline" radius="sm" size="sm">
      未送信
    </Badge>
  ) : null
}

export function PageTitle({ title, children, back }: { title: ReactNode; children?: ReactNode; back?: string }) {
  return (
    <Group justify="space-between" align="center" wrap="wrap" gap="xs" mb="md">
      <Group gap={6}>
        {back && (
          <Anchor component={Link} to={back} className="back-link" aria-label="一覧に戻る">
            <IconChevronLeft size={22} />
          </Anchor>
        )}
        <Title order={3}>{title}</Title>
      </Group>
      {children && <Group gap="xs">{children}</Group>}
    </Group>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed" fw={500}>
        {label}
      </Text>
      <div>{children ?? '—'}</div>
    </div>
  )
}

export function Loading() {
  return (
    <Group justify="center" p="xl">
      <Loader size="sm" />
    </Group>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <Text c="dimmed" ta="center" p="xl" size="sm">
      {children}
    </Text>
  )
}

/** 一覧と詳細を左右に並べる。狭い画面では、詳細を開いているときは詳細だけを出す */
export function ListDetail({ list, detail, hasDetail }: { list: ReactNode; detail: ReactNode; hasDetail: boolean }) {
  return (
    <div className={`list-detail ${hasDetail ? 'has-detail' : ''}`}>
      <div className="pane list">{list}</div>
      <div className="pane detail">{detail}</div>
    </div>
  )
}

// MARK: - 選択

/** 月の選択（今月の前12か月〜翌月）。includeAll なら「すべての月」も出す */
export function MonthSelect({ value, onChange, includeAll = false }: { value: string; onChange: (v: string) => void; includeAll?: boolean }) {
  const { currentMonth } = useData()
  const months = Array.from({ length: 14 }, (_, i) => shiftMonthKey(currentMonth, 1 - i))
  if (value !== 'all' && !months.includes(value)) months.push(value)
  const data = [...(includeAll ? [{ value: 'all', label: 'すべての月' }] : []), ...months.map((m) => ({ value: m, label: `${monthLabel(m)}分` }))]
  return <Select aria-label="月" data={data} value={value} onChange={(v) => v && onChange(v)} allowDeselect={false} w={150} />
}

export function UserSelect({ value, onChange, allLabel = 'すべての人' }: { value: string; onChange: (v: string) => void; allLabel?: string | null }) {
  const { users } = useData()
  // 退職した人は後ろに「（退職）」を付けて出す（過去の月を見るため）
  const ordered = [...users.filter((u) => !u.retiredAt), ...users.filter((u) => u.retiredAt)]
  const data = [
    ...(allLabel ? [{ value: 'all', label: allLabel }] : []),
    ...ordered.map((u) => ({ value: u.id, label: `${u.displayName || u.email}${u.retiredAt ? '（退職）' : ''}` })),
  ]
  return <Select aria-label="従業員" data={data} value={value} onChange={(v) => v && onChange(v)} allowDeselect={false} searchable w={170} />
}

// MARK: - 画像

/** Cloud Storage の画像。画像の送信が無効（Spark プラン）の間は「従業員の端末にあります」と表示する */
export function StoredImage({ path, alt }: { path: string; alt: string }) {
  const { company } = useData()
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!company.imageUploadEnabled) return
    let cancelled = false
    setFailed(false)
    getStorageModule()
      .then(({ getDownloadURL, ref, storage }) => getDownloadURL(ref(storage, path)))
      .then(
      (u) => !cancelled && setUrl(u),
      () => !cancelled && setFailed(true),
    )
    return () => {
      cancelled = true
    }
  }, [path, company.imageUploadEnabled])

  if (!company.imageUploadEnabled) return <div className="image-missing">画像は従業員の端末にあります</div>
  if (failed) return <div className="image-missing">画像はまだ届いていません（従業員の端末にあります）</div>
  if (!url) return <div className="image-missing"><Loader size="xs" /></div>
  return (
    <a href={url} target="_blank" rel="noreferrer">
      <img src={url} alt={alt} />
    </a>
  )
}

// MARK: - 理由の入力

/** 理由を入力して実行するダイアログ（差し戻し・却下・打刻の修正など） */
export function ReasonModal({
  opened,
  title,
  label = '理由',
  confirmLabel,
  confirmColor = 'red',
  description,
  onClose,
  onConfirm,
}: {
  opened: boolean
  title: string
  label?: string
  confirmLabel: string
  confirmColor?: string
  description?: ReactNode
  onClose: () => void
  onConfirm: (reason: string) => Promise<boolean> | void
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (opened) setReason('')
  }, [opened])
  const submit = async () => {
    setBusy(true)
    try {
      const ok = await onConfirm(reason.trim())
      if (ok !== false) onClose()
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal opened={opened} onClose={onClose} title={title} centered>
      <Stack>
        {description}
        <Textarea label={`${label}（必須）`} autosize minRows={3} value={reason} onChange={(e) => setReason(e.currentTarget.value)} data-autofocus />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            キャンセル
          </Button>
          <Button color={confirmColor} disabled={!reason.trim()} loading={busy} onClick={submit}>
            {confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
