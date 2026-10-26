import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Firebase Hosting の公開フォルダーは firebase.json と同じフォルダーの中にないといけない
    outDir: '../firebase/hosting',
    emptyOutDir: true,
    // Firebase の SDK だけで圧縮前 500KB を超えるため、目安を上げる（画面のファイルは画面ごとに分けている）
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      output: {
        // ライブラリはアプリ本体と分ける。アプリを更新してもブラウザに残ったまま使える
        codeSplitting: {
          groups: [
            // Storage は画像を見るときだけ読み込むので、ここには入れない
            { name: 'firebase', test: /node_modules[\\/](firebase[\\/](?!storage)|@firebase[\\/](?!storage)|idb[\\/])/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler|cookie|set-cookie-parser)[\\/]/ },
            { name: 'mantine', test: /node_modules[\\/](@mantine[\\/](core|hooks|modals|notifications)|@floating-ui|react-remove-scroll|react-remove-scroll-bar|react-style-singleton|use-callback-ref|use-sidecar|react-number-format|react-textarea-autosize|tslib|clsx|get-nonce|detect-node-es|type-fest)[\\/]/ },
          ],
        },
      },
    },
  },
})
