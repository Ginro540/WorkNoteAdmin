import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth'
import { connectFirestoreEmulator, initializeFirestore, memoryLocalCache, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'

/** npm run dev:emulator のとき：パソコンの中のエミュレーターにつなぐ（本番のデータには触れない） */
export const usesEmulator = import.meta.env.VITE_EMULATOR === '1'

// Web アプリ「ワークノート管理」の設定（公開して問題ない値。データはログインとセキュリティルールで守る）
export const firebaseConfig = {
  apiKey: 'AIzaSyDoybwLpK7HzRyz2c1kBorO42iJYPWWBSk',
  authDomain: 'worknote-6dc51.firebaseapp.com',
  projectId: 'worknote-6dc51',
  storageBucket: 'worknote-6dc51.firebasestorage.app',
  messagingSenderId: '107437839909',
  appId: '1:107437839909:web:2cb44a49b54bcc471391cc',
  // demo- で始まるプロジェクトは、エミュレーターの外には決してつながらない
  ...(usesEmulator ? { projectId: 'demo-worknote' } : {}),
}

/** Auth をエミュレーターにつなぐ（従業員を追加するときの2つ目の接続にも使う） */
export function connectAuthIfEmulator(a: Auth) {
  if (usesEmulator) connectAuthEmulator(a, 'http://127.0.0.1:9099', { disableWarnings: true })
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
auth.languageCode = 'ja'
connectAuthIfEmulator(auth)

// 読んだデータは端末に保存し、電波がなくても見られるようにする（複数のタブでも使える）
export const db = initializeFirestore(app, {
  localCache: usesEmulator ? memoryLocalCache() : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
})
if (usesEmulator) connectFirestoreEmulator(db, '127.0.0.1', 8080)

/** Cloud Storage は画像を見るときだけ読み込む（画像の送信を「しない」の間は読み込まない） */
export async function getStorageModule() {
  const m = await import('firebase/storage')
  return { ...m, storage: m.getStorage(app) }
}
