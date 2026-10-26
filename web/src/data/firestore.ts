import { useEffect, useState } from 'react'
import { onSnapshot, type DocumentData, type DocumentReference, type Query } from 'firebase/firestore'

export interface QueryState<T> {
  items: T[]
  /** まだサーバーに届いていない（オフラインで書いた）ドキュメントの ID */
  pending: Set<string>
  loading: boolean
  error: Error | null
}

/**
 * クエリを購読する。query が null のときは何もしない。
 * key はクエリの中身を表す文字列（変わったら購読し直す）。
 */
export function useQuery<T>(query: Query | null, key: string, parse: (id: string, d: DocumentData) => T | null): QueryState<T> {
  const [state, setState] = useState<QueryState<T>>({ items: [], pending: new Set(), loading: true, error: null })
  useEffect(() => {
    if (!query) {
      setState({ items: [], pending: new Set(), loading: false, error: null })
      return
    }
    setState((s) => ({ ...s, loading: true }))
    return onSnapshot(
      query,
      { includeMetadataChanges: true },
      (snap) => {
        const items: T[] = []
        const pending = new Set<string>()
        for (const doc of snap.docs) {
          const item = parse(doc.id, doc.data({ serverTimestamps: 'estimate' }))
          if (item) items.push(item)
          if (doc.metadata.hasPendingWrites) pending.add(doc.id)
        }
        setState({ items, pending, loading: false, error: null })
      },
      (error) => {
        console.error('Firestore listen error', key, error)
        setState({ items: [], pending: new Set(), loading: false, error })
      },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return state
}

export interface DocState<T> {
  data: T | null
  exists: boolean
  loading: boolean
  pending: boolean
}

export function useDocument<T>(ref: DocumentReference | null, key: string, parse: (id: string, d: DocumentData) => T | null): DocState<T> {
  const [state, setState] = useState<DocState<T>>({ data: null, exists: false, loading: true, pending: false })
  useEffect(() => {
    if (!ref) {
      setState({ data: null, exists: false, loading: false, pending: false })
      return
    }
    setState((s) => ({ ...s, loading: true }))
    return onSnapshot(
      ref,
      { includeMetadataChanges: true },
      (snap) => {
        const raw = snap.data({ serverTimestamps: 'estimate' })
        setState({ data: raw ? parse(snap.id, raw) : null, exists: snap.exists(), loading: false, pending: snap.metadata.hasPendingWrites })
      },
      (error) => {
        console.error('Firestore listen error', key, error)
        setState({ data: null, exists: false, loading: false, pending: false })
      },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return state
}
