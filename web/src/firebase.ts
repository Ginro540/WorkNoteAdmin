import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

// Web アプリ「ワークノート管理」の設定（公開して問題ない値。データはログインとセキュリティルールで守る）
export const firebaseConfig = {
  apiKey: 'AIzaSyDoybwLpK7HzRyz2c1kBorO42iJYPWWBSk',
  authDomain: 'worknote-6dc51.firebaseapp.com',
  projectId: 'worknote-6dc51',
  storageBucket: 'worknote-6dc51.firebasestorage.app',
  messagingSenderId: '107437839909',
  appId: '1:107437839909:web:2cb44a49b54bcc471391cc',
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
auth.languageCode = 'ja'

// 読んだデータは端末に保存し、電波がなくても見られるようにする（複数のタブでも使える）
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
})

export const storage = getStorage(app)
