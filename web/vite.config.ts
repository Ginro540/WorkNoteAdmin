import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Firebase Hosting の公開フォルダーは firebase.json と同じフォルダーの中にないといけない
  build: { outDir: '../firebase/hosting', emptyOutDir: true },
})
