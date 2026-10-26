// ホーム以外の画面は、開いたときに読み込む（最初の読み込みを軽くするため）。
// ログインしたあと、使っていない時間に残りの画面も先に読み込んでおく（電波が切れても開けるように）。
import { lazy, type ComponentType } from 'react'

const loaders = {
  NowPage: () => import('./NowPage'),
  LeavesPage: () => import('./LeavesPage'),
  ReportsPage: () => import('./ReportsPage'),
  ExpensesPage: () => import('./ExpensesPage'),
  CorrectionsPage: () => import('./CorrectionsPage'),
  AttendancePage: () => import('./AttendancePage'),
  AttendanceUserPage: () => import('./AttendanceUserPage'),
  EstimatesPage: () => import('./EstimatesPage'),
  EstimatePrintPage: () => import('./EstimatePrintPage'),
  UsersPage: () => import('./master/UsersPage'),
  SitesPage: () => import('./master/SitesPage'),
  HolidaysPage: () => import('./master/HolidaysPage'),
  ReportFieldsPage: () => import('./master/ReportFieldsPage'),
  CategoriesPage: () => import('./master/CategoriesPage'),
  CompanyPage: () => import('./master/CompanyPage'),
  IssuerPage: () => import('./master/IssuerPage'),
  RegisterLeaveModal: () => import('./RegisterLeaveModal'),
}

type Name = Exclude<keyof typeof loaders, 'RegisterLeaveModal'>

function page<N extends Name>(name: N) {
  return lazy(async () => {
    const m = (await loaders[name]()) as unknown as Record<N, ComponentType>
    return { default: m[name] }
  })
}

export const NowPage = page('NowPage')
export const LeavesPage = page('LeavesPage')
export const ReportsPage = page('ReportsPage')
export const ExpensesPage = page('ExpensesPage')
export const CorrectionsPage = page('CorrectionsPage')
export const AttendancePage = page('AttendancePage')
export const AttendanceUserPage = page('AttendanceUserPage')
export const EstimatesPage = page('EstimatesPage')
export const EstimatePrintPage = page('EstimatePrintPage')
export const UsersPage = page('UsersPage')
export const SitesPage = page('SitesPage')
export const HolidaysPage = page('HolidaysPage')
export const ReportFieldsPage = page('ReportFieldsPage')
export const CategoriesPage = page('CategoriesPage')
export const CompanyPage = page('CompanyPage')
export const IssuerPage = page('IssuerPage')

/** 残りの画面を先に読み込む（失敗しても、開いたときにもう一度読み込む） */
export function preloadPages() {
  for (const load of Object.values(loaders)) load().catch(() => undefined)
}
