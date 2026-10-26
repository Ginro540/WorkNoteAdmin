import { Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Button, Center, Loader, Paper, Stack, Text, Title } from '@mantine/core'
import { signOut } from 'firebase/auth'
import { auth } from './firebase'
import { AdminDataProvider, AuthProvider, useAuth } from './data/session'
import { LoginPage } from './pages/LoginPage'
import { Layout } from './pages/Layout'
import { HomePage } from './pages/HomePage'
import {
  AttendancePage,
  AttendanceUserPage,
  CategoriesPage,
  CompanyPage,
  CorrectionsPage,
  EstimatePrintPage,
  EstimatesPage,
  ExpensesPage,
  HolidaysPage,
  IssuerPage,
  LeavesPage,
  NowPage,
  ReportFieldsPage,
  ReportsPage,
  SitesPage,
  UsersPage,
} from './pages/lazyPages'

export function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}

function Gate() {
  const { ready, user, profile, profileLoaded } = useAuth()
  if (!ready || (user && !profileLoaded)) {
    return (
      <Center h="100%">
        <Loader />
      </Center>
    )
  }
  if (!user) return <LoginPage />
  if (!profile || profile.role !== 'admin' || profile.retiredAt) {
    return (
      <Center h="100%" p="md">
        <Paper withBorder p="xl" maw={420}>
          <Stack>
            <Title order={4}>管理者のアカウントではありません</Title>
            <Text size="sm">
              {profile?.retiredAt
                ? `${user.email} は退職の扱いになっているため、この画面は使えません。`
                : `${user.email} は管理者として登録されていないため、この画面は使えません。従業員の方は iPhone の「ワークノート」をお使いください。`}
            </Text>
            <Button variant="default" onClick={() => signOut(auth)}>
              ログアウト
            </Button>
          </Stack>
        </Paper>
      </Center>
    )
  }
  return (
    <AdminDataProvider me={profile}>
      <Routes>
        <Route
          path="/estimates/:id/print"
          element={
            <Suspense fallback={<Center h="100%"><Loader /></Center>}>
              <EstimatePrintPage />
            </Suspense>
          }
        />
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="now" element={<NowPage />} />
          <Route path="leaves" element={<LeavesPage />} />
          <Route path="reports/:id?" element={<ReportsPage />} />
          <Route path="expenses/:id?" element={<ExpensesPage />} />
          <Route path="corrections/:id?" element={<CorrectionsPage />} />
          <Route path="attendance" element={<AttendancePage />} />
          <Route path="attendance/:uid/:date?" element={<AttendanceUserPage />} />
          <Route path="estimates/:id?" element={<EstimatesPage />} />
          <Route path="master/users/:id?" element={<UsersPage />} />
          <Route path="master/sites" element={<SitesPage />} />
          <Route path="master/holidays" element={<HolidaysPage />} />
          <Route path="master/report-fields" element={<ReportFieldsPage />} />
          <Route path="master/categories" element={<CategoriesPage />} />
          <Route path="master/company" element={<CompanyPage />} />
          <Route path="master/issuer" element={<IssuerPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AdminDataProvider>
  )
}
