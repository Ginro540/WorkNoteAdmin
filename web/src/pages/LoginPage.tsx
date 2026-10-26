import { useState } from 'react'
import { Alert, Anchor, Button, Center, Image, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core'
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../firebase'
import { errorMessage } from '../ui/common'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const reset = async () => {
    setError(null)
    setInfo(null)
    if (!email.trim()) {
      setError('メールアドレスを入力してから押してください。')
      return
    }
    try {
      await sendPasswordResetEmail(auth, email.trim())
      setInfo(`${email.trim()} にパスワードの再設定メールを送りました。`)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Center mih="100%" p="md" bg="var(--mantine-color-body)">
      <Paper withBorder shadow="sm" p="xl" w="100%" maw={400}>
        <form onSubmit={signIn}>
          <Stack>
            <Stack align="center" gap={6}>
              <Image src="/icon-192.png" w={72} h={72} radius="lg" alt="" />
              <Title order={3}>ワークノート管理</Title>
              <Text size="sm" c="dimmed">
                管理者のアカウントでログインしてください
              </Text>
            </Stack>
            {error && <Alert color="red">{error}</Alert>}
            {info && <Alert color="green">{info}</Alert>}
            <TextInput label="メールアドレス" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.currentTarget.value)} required />
            <PasswordInput label="パスワード" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.currentTarget.value)} required />
            <Button type="submit" loading={busy}>
              ログイン
            </Button>
            <Anchor component="button" type="button" size="sm" onClick={reset}>
              パスワードを忘れたとき
            </Anchor>
          </Stack>
        </form>
      </Paper>
    </Center>
  )
}
