import { NavLink as RouterLink, Outlet, useLocation } from 'react-router-dom'
import { AppShell, Badge, Burger, Group, Menu, NavLink, ScrollArea, Text, UnstyledButton } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import {
  IconBeach,
  IconBuilding,
  IconCalendarOff,
  IconCategory,
  IconClockEdit,
  IconClock,
  IconFileInvoice,
  IconHome,
  IconListDetails,
  IconMapPin,
  IconNotebook,
  IconReceipt,
  IconSettings,
  IconUserCheck,
  IconUsers,
} from '@tabler/icons-react'
import { signOut } from 'firebase/auth'
import { collection, query, where } from 'firebase/firestore'
import { useEffect } from 'react'
import { auth, db } from '../firebase'
import { useData } from '../data/session'
import { useQuery } from '../data/firestore'

/** 承認待ちの件数（メニューとホームで使う） */
export function usePendingCounts() {
  const reports = useQuery(query(collection(db, 'dailyReports'), where('status', '==', 'submitted')), 'count-reports', (id) => id)
  const expenses = useQuery(query(collection(db, 'expenses'), where('status', '==', 'submitted')), 'count-expenses', (id) => id)
  const corrections = useQuery(query(collection(db, 'attendanceCorrections'), where('status', '==', 'pending')), 'count-corrections', (id) => id)
  const leaves = useQuery(query(collection(db, 'leaveRequests'), where('status', '==', 'pending')), 'count-leaves', (id) => id)
  return { reports: reports.items.length, expenses: expenses.items.length, corrections: corrections.items.length, leaves: leaves.items.length }
}

function CountBadge({ n }: { n: number }) {
  return n > 0 ? (
    <Badge size="sm" circle={n < 10} color="red">
      {n}
    </Badge>
  ) : null
}

export function Layout() {
  const [opened, { toggle, close }] = useDisclosure()
  const { me } = useData()
  const counts = usePendingCounts()
  const location = useLocation()
  useEffect(close, [location.pathname, close])

  const item = (to: string, label: string, icon: React.ReactNode, right?: React.ReactNode, end = false) => (
    <NavLink component={RouterLink} to={to} end={end} label={label} leftSection={icon} rightSection={right} />
  )

  return (
    <AppShell header={{ height: 52 }} navbar={{ width: 230, breakpoint: 'sm', collapsed: { mobile: !opened } }} padding={0}>
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="xs">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="メニュー" />
            <img src="/icon-192.png" alt="" width={28} height={28} style={{ borderRadius: 7 }} />
            <Text fw={700}>ワークノート管理</Text>
          </Group>
          <Menu position="bottom-end">
            <Menu.Target>
              <UnstyledButton>
                <Text size="sm">{me.displayName || me.email}</Text>
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>{me.email}</Menu.Label>
              <Menu.Item onClick={() => signOut(auth)}>ログアウト</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar>
        <ScrollArea p="xs">
          {item('/', 'ホーム', <IconHome size={18} />, null, true)}
          {item('/now', '出勤状況', <IconUserCheck size={18} />)}
          <Text size="xs" c="dimmed" px="sm" pt="sm" pb={4}>
            承認
          </Text>
          {item('/reports', '日報', <IconNotebook size={18} />, <CountBadge n={counts.reports} />)}
          {item('/expenses', '経費', <IconReceipt size={18} />, <CountBadge n={counts.expenses} />)}
          {item('/corrections', '修正申請', <IconClockEdit size={18} />, <CountBadge n={counts.corrections} />)}
          {item('/leaves', '休暇', <IconBeach size={18} />, <CountBadge n={counts.leaves} />)}
          <Text size="xs" c="dimmed" px="sm" pt="sm" pb={4}>
            確認・作成
          </Text>
          {item('/attendance', '勤怠', <IconClock size={18} />)}
          {item('/estimates', '見積書', <IconFileInvoice size={18} />)}
          <Text size="xs" c="dimmed" px="sm" pt="sm" pb={4}>
            マスタ
          </Text>
          {item('/master/users', '従業員', <IconUsers size={18} />)}
          {item('/master/sites', '勤務先', <IconMapPin size={18} />)}
          {item('/master/holidays', '休業日', <IconCalendarOff size={18} />)}
          {item('/master/report-fields', '日報の項目', <IconListDetails size={18} />)}
          {item('/master/categories', '経費の区分', <IconCategory size={18} />)}
          {item('/master/company', '会社の設定', <IconSettings size={18} />)}
          {item('/master/issuer', '見積書の発行元', <IconBuilding size={18} />)}
          <Text size="xs" c="dimmed" px="sm" pt="lg">
            v0.1.0
          </Text>
        </ScrollArea>
      </AppShell.Navbar>
      <AppShell.Main h="100dvh" style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <Outlet />
        </div>
      </AppShell.Main>
    </AppShell>
  )
}
