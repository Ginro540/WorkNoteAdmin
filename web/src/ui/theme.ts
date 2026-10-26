import { createTheme } from '@mantine/core'

export const theme = createTheme({
  primaryColor: 'indigo',
  fontFamily: '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", "Meiryo", system-ui, sans-serif',
  headings: { fontFamily: '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", "Meiryo", system-ui, sans-serif' },
  defaultRadius: 'md',
})

/** 状態の色（従業員アプリの Components.swift に合わせる） */
export const statusColor = {
  draft: 'gray',
  submitted: 'blue',
  approved: 'green',
  returned: 'orange',
  pending: 'blue',
  rejected: 'red',
  cancelled: 'gray',
  issued: 'green',
} as const
