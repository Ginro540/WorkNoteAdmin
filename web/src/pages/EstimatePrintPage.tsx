import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Group, Text } from '@mantine/core'
import { doc } from 'firebase/firestore'
import { db } from '../firebase'
import { useDocument } from '../data/firestore'
import { useData } from '../data/session'
import { parseEstimate, yen } from '../data/models'
import { Loading } from '../ui/common'
import './print.css'

declare global {
  interface Window {
    webkit?: { messageHandlers?: { printPDF?: { postMessage: (v: unknown) => void } } }
  }
}

const jpDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return y ? `${y}年${m}月${d}日` : ''
}

/** 見積書の印刷用の画面（A4 縦）。ブラウザの印刷から PDF に保存・共有する */
export function EstimatePrintPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { issuer } = useData()
  const { data: e, loading } = useDocument(doc(db, 'estimates', id), `estimate-${id}`, parseEstimate)

  useEffect(() => {
    if (!e) return
    // 印刷・PDF のファイル名に使われる
    const prev = document.title
    document.title = `見積書_${e.number}_${e.clientName}`
    return () => {
      document.title = prev
    }
  }, [e])

  if (loading) return <Loading />
  if (!e) return <Text p="xl">見積書が見つかりません</Text>

  const print = () => {
    // iPad・Mac の専用アプリ（WKWebView）では、アプリ側で PDF を作って共有シートを出す
    const native = window.webkit?.messageHandlers?.printPDF
    if (native) native.postMessage({ fileName: `${document.title}.pdf` })
    else window.print()
  }
  // 明細は最低8行を表に出す（空の行で埋める）
  const blankRows = Math.max(0, 8 - e.items.length)

  return (
    <div className="print-root">
      <Group className="print-toolbar" justify="space-between" p="sm">
        <Button variant="default" onClick={() => navigate(`/estimates/${e.id}`)}>
          戻る
        </Button>
        <Text size="sm" c="dimmed">
          「印刷・PDF」から「PDF として保存」や共有ができます
        </Text>
        <Button onClick={print}>印刷・PDF</Button>
      </Group>
      <div className="sheet">
        <header className="est-head">
          <h1>御 見 積 書</h1>
          <div className="est-meta">
            <div>No. {e.number}</div>
            <div>発行日 {jpDate(e.issueDate)}</div>
          </div>
        </header>
        <section className="est-top">
          <div className="est-client">
            <div className="est-client-name">
              {e.clientName}　<span>{e.clientHonorific}</span>
            </div>
            <p className="est-lead">下記のとおり御見積申し上げます。</p>
            <table className="est-info">
              <tbody>
                <tr>
                  <th>件名</th>
                  <td>{e.title}</td>
                </tr>
                {e.siteName && (
                  <tr>
                    <th>現場</th>
                    <td>
                      {e.siteName}
                      {e.siteAddress && <div className="sub">{e.siteAddress}</div>}
                    </td>
                  </tr>
                )}
                <tr>
                  <th>有効期限</th>
                  <td>{jpDate(e.validUntil)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="est-issuer">
            <div className="est-issuer-name">{issuer.companyName}</div>
            {issuer.postalCode && <div>〒{issuer.postalCode}</div>}
            {issuer.address && <div className="pre">{issuer.address}</div>}
            {(issuer.phone || issuer.fax) && (
              <div>
                {issuer.phone && `TEL ${issuer.phone}`}
                {issuer.phone && issuer.fax && '　'}
                {issuer.fax && `FAX ${issuer.fax}`}
              </div>
            )}
            {issuer.email && <div>{issuer.email}</div>}
            {issuer.invoiceNumber && <div>登録番号 {issuer.invoiceNumber}</div>}
            {e.staffName && <div className="est-staff">担当 {e.staffName}</div>}
          </div>
        </section>
        <div className="est-total">
          <span>御見積金額</span>
          <strong>{yen(e.total)}</strong>
          <span className="tax">（税込）</span>
        </div>
        <table className="est-items">
          <thead>
            <tr>
              <th className="name">品名</th>
              <th className="qty">数量</th>
              <th className="unit">単位</th>
              <th className="price">単価</th>
              <th className="amount">金額</th>
            </tr>
          </thead>
          <tbody>
            {e.items.map((i, n) => (
              <tr key={n}>
                <td className="name">{i.name}</td>
                <td className="qty">{i.quantity.toLocaleString('ja-JP', { maximumFractionDigits: 2 })}</td>
                <td className="unit">{i.unit}</td>
                <td className="price">{i.unitPrice.toLocaleString('ja-JP')}</td>
                <td className="amount">{i.amount.toLocaleString('ja-JP')}</td>
              </tr>
            ))}
            {Array.from({ length: blankRows }, (_, n) => (
              <tr key={`b${n}`} className="blank">
                <td colSpan={5}>&nbsp;</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} rowSpan={3} className="foot-space" />
              <th>小計</th>
              <td className="amount">{e.subtotal.toLocaleString('ja-JP')}</td>
            </tr>
            <tr>
              <th>消費税（{e.taxRate}%）</th>
              <td className="amount">{e.tax.toLocaleString('ja-JP')}</td>
            </tr>
            <tr className="grand">
              <th>合計</th>
              <td className="amount">{e.total.toLocaleString('ja-JP')}</td>
            </tr>
          </tfoot>
        </table>
        {e.notes && (
          <section className="est-notes">
            <div className="label">備考</div>
            <div className="pre">{e.notes}</div>
          </section>
        )}
      </div>
    </div>
  )
}
