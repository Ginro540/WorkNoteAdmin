import { Navigate, Route, Routes } from 'react-router-dom'
import { Button, Center, Loader, Paper, Stack, Text, Title } from '@mantine/core'
import { signOut } from 'firebase/auth'
import { auth } from './firebase'
import { AdminDataProvider, AuthProvider, useAuth } from './data/session'
import { LoginPage } from './pages/LoginPage'
import { Layout } from './pages/Layout'
import { HomePage } from './pages/HomePage'
import { ReportsPage } from './pages/ReportsPage'
import { ExpensesPage } from './pages/ExpensesPage'
import { CorrectionsPage } from './pages/CorrectionsPage'
import { AttendancePage } from './pages/AttendancePage'
import { AttendanceUserPage } from './pages/AttendanceUserPage'
import { EstimatesPage } from './pages/EstimatesPage'
import { EstimatePrintPage } from './pages/EstimatePrintPage'
import { UsersPage } from './pages/master/UsersPage'
import { SitesPage } from './pages/master/SitesPage'
import { HolidaysPage } from './pages/master/HolidaysPage'
import { ReportFieldsPage } from './pages/master/ReportFieldsPage'
import { CategoriesPage } from './pages/master/CategoriesPage'
import { CompanyPage } from './pages/master/CompanyPage'
import { IssuerPage } from './pages/master/IssuerPage'

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
        <Route path="/estimates/:id/print" element={<EstimatePrintPage />} />
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
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
