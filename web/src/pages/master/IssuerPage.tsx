import { useEffect, useState } from 'react'
import { Button, Card, Grid, Stack, Text, TextInput, Textarea } from '@mantine/core'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { useData } from '../../data/session'
import type { EstimateIssuer } from '../../data/models'
import { PageTitle, runWrite } from '../../ui/common'

/** 見積書の発行元（settings/estimateIssuer） */
export function IssuerPage() {
  const { issuer } = useData()
  const [s, setS] = useState<EstimateIssuer>(issuer)
  const [dirty, setDirty] = useState(false)
  useEffect(() => {
    if (!dirty) setS(issuer)
  }, [issuer, dirty])
  const set = (k: keyof EstimateIssuer) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setS({ ...s, [k]: e.currentTarget.value })
    setDirty(true)
  }
  const invoiceOk = !s.invoiceNumber || /^T\d{13}$/.test(s.invoiceNumber.trim())
  const save = async () => {
    const trimmed = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.trim()])) as unknown as EstimateIssuer
    if (await runWrite(setDoc(doc(db, 'settings', 'estimateIssuer'), trimmed), '発行元を保存しました')) setDirty(false)
  }
  return (
    <Stack p="md" maw={760}>
      <PageTitle title="見積書の発行元">
        <Button size="xs" onClick={save} disabled={!dirty || !invoiceOk}>
          保存
        </Button>
      </PageTitle>
      <Text size="sm" c="dimmed">
        見積書の PDF の右上に出る会社の情報です。
      </Text>
      <Card withBorder>
        <Grid>
          <Grid.Col span={12}>
            <TextInput label="社名" value={s.companyName} onChange={set('companyName')} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <TextInput label="郵便番号" value={s.postalCode} onChange={set('postalCode')} placeholder="812-0011" />
          </Grid.Col>
          <Grid.Col span={12}>
            <Textarea label="住所" autosize minRows={2} value={s.address} onChange={set('address')} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="電話" value={s.phone} onChange={set('phone')} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="FAX" value={s.fax} onChange={set('fax')} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="メール" value={s.email} onChange={set('email')} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label="インボイス登録番号"
              value={s.invoiceNumber}
              onChange={set('invoiceNumber')}
              placeholder="T1234567890123"
              error={!invoiceOk ? 'T ＋ 13桁の数字で入力してください' : undefined}
            />
          </Grid.Col>
        </Grid>
      </Card>
    </Stack>
  )
}
