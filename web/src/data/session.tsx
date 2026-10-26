// ログイン状態と、どの画面でも使うデータ（従業員・勤務先・設定・休日）。
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { collection, doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { BusinessDays, ClosingPeriod } from '../core/closingPeriod'
import { dayKey, jstParts } from '../core/workCalendar'
import {
  defaultCategories,
  defaultCompanySettings,
  defaultReportFields,
  emptyIssuer,
  parseCategories,
  parseCompany,
  parseHolidays,
  parseIssuer,
  parseReportFields,
  parseSite,
  parseUser,
  type AppUser,
  type CompanySettings,
  type EstimateIssuer,
  type ExpenseCategory,
  type Holiday,
  type ReportField,
  type Site,
} from './models'

// MARK: - ログイン

interface AuthState {
  ready: boolean
  user: User | null
  profile: AppUser | null
  /** users/{uid} を読み終えたか */
  profileLoaded: boolean
}

const AuthContext = createContext<AuthState>({ ready: false, user: null, profile: null, profileLoaded: false })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ ready: false, user: null, profile: null, profileLoaded: false })

  useEffect(() => {
    let unsubProfile: (() => void) | null = null
    const unsub = onAuthStateChanged(auth, (user) => {
      unsubProfile?.()
      unsubProfile = null
      setState({ ready: true, user, profile: null, profileLoaded: !user })
      if (!user) return
      unsubProfile = onSnapshot(
        doc(db, 'users', user.uid),
        (snap) => {
          setState((s) => ({ ...s, profile: snap.exists() ? parseUser(snap.id, snap.data()) : null, profileLoaded: true }))
        },
        () => setState((s) => ({ ...s, profile: null, profileLoaded: true })),
      )
    })
    return () => {
      unsubProfile?.()
      unsub()
    }
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)

// MARK: - 共通のデータ

export interface AdminData {
  uid: string
  me: AppUser
  users: AppUser[]
  userById: Map<string, AppUser>
  sites: Site[]
  company: CompanySettings
  companyExists: boolean
  reportFields: ReportField[]
  categories: ExpenseCategory[]
  issuer: EstimateIssuer
  /** 年 → 休日（前年〜翌年） */
  holidaysByYear: Map<number, Holiday[]>
  period: ClosingPeriod
  businessDays: BusinessDays
  holidayOn: (dayKey: string) => Holiday | undefined
  userName: (uid: string | null | undefined) => string
  categoryName: (id: string) => string
  /** 今日の締め月 */
  currentMonth: string
  today: string
}

const DataContext = createContext<AdminData | null>(null)

export function AdminDataProvider({ me, children }: { me: AppUser; children: ReactNode }) {
  const [users, setUsers] = useState<AppUser[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [company, setCompany] = useState<CompanySettings>(defaultCompanySettings)
  const [companyExists, setCompanyExists] = useState(true)
  const [reportFields, setReportFields] = useState<ReportField[]>(defaultReportFields)
  const [categories, setCategories] = useState<ExpenseCategory[]>(defaultCategories)
  const [issuer, setIssuer] = useState<EstimateIssuer>(emptyIssuer)
  const [holidaysByYear, setHolidaysByYear] = useState<Map<number, Holiday[]>>(new Map())
  const [today, setToday] = useState(() => dayKey(new Date()))

  useEffect(() => {
    // 日付が変わったら「今日」を更新する
    const timer = setInterval(() => setToday(dayKey(new Date())), 60_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const settings = (id: string) => doc(db, 'settings', id)
    const year = jstParts(new Date()).year
    const unsubs = [
      onSnapshot(collection(db, 'users'), (s) =>
        setUsers(s.docs.map((d) => parseUser(d.id, d.data({ serverTimestamps: 'estimate' }))).sort((a, b) => a.displayName.localeCompare(b.displayName, 'ja'))),
      ),
      onSnapshot(collection(db, 'sites'), (s) =>
        setSites(s.docs.map((d) => parseSite(d.id, d.data())).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'ja'))),
      ),
      onSnapshot(settings('company'), (s) => {
        setCompany(parseCompany(s.data()))
        setCompanyExists(s.exists())
      }),
      onSnapshot(settings('reportTemplate'), (s) => setReportFields(parseReportFields(s.data()))),
      onSnapshot(settings('expenseCategories'), (s) => setCategories(parseCategories(s.data()))),
      onSnapshot(settings('estimateIssuer'), (s) => setIssuer(parseIssuer(s.data()))),
      ...[year - 1, year, year + 1].map((y) =>
        onSnapshot(settings(`calendar_${y}`), (s) =>
          setHolidaysByYear((prev) => new Map(prev).set(y, parseHolidays(s.data()))),
        ),
      ),
    ]
    return () => unsubs.forEach((u) => u())
  }, [])

  const value = useMemo<AdminData>(() => {
    const userById = new Map(users.map((u) => [u.id, u]))
    const allHolidays = [...holidaysByYear.values()].flat()
    const holidayMap = new Map(allHolidays.map((h) => [h.date, h]))
    const period = new ClosingPeriod(company.closingDay)
    const categoryById = new Map(categories.map((c) => [c.id, c]))
    return {
      uid: me.id,
      me,
      users,
      userById,
      sites,
      company,
      companyExists,
      reportFields,
      categories,
      issuer,
      holidaysByYear,
      period,
      businessDays: new BusinessDays(allHolidays.map((h) => h.date)),
      holidayOn: (key) => holidayMap.get(key),
      userName: (uid) => (uid ? userById.get(uid)?.displayName || '（不明なユーザー）' : '—'),
      categoryName: (id) => categoryById.get(id)?.name ?? defaultCategories.find((c) => c.id === id)?.name ?? 'その他',
      currentMonth: period.monthKeyForDayKey(today) ?? today.slice(0, 7),
      today,
    }
  }, [me, users, sites, company, companyExists, reportFields, categories, issuer, holidaysByYear, today])

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): AdminData {
  const v = useContext(DataContext)
  if (!v) throw new Error('AdminDataProvider がありません')
  return v
}
