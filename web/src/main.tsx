import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { ModalsProvider } from '@mantine/modals'
import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import './ui/app.css'
import { theme } from './ui/theme'
import { App } from './App'

// 新しい版を公開したあと、開いたままの古いページが消えたファイルを読もうとしたら、1回だけ読み込み直す
window.addEventListener('vite:preloadError', (e) => {
  try {
    const last = Number(sessionStorage.getItem('reloadedForUpdate') ?? 0)
    if (Date.now() - last < 10_000) return
    sessionStorage.setItem('reloadedForUpdate', String(Date.now()))
  } catch {
    // sessionStorage が使えないときも読み込み直す
  }
  e.preventDefault()
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <ModalsProvider labels={{ confirm: 'OK', cancel: 'キャンセル' }}>
        <Notifications position="top-right" />
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ModalsProvider>
    </MantineProvider>
  </StrictMode>,
)
