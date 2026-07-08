import { zhTW, id as idLocale, enUS } from 'date-fns/locale'
import type { Locale as DateFnsLocale } from 'date-fns'

export interface PMTask {
  record_id: string
  schedule_id?: string
  checklist?: string[]
  projected: boolean
  ad_hoc?: boolean
  machine_id: string
  machine_name: string
  machine_code: string | null
  pm_type: string | null
  description: string | null
  scheduled_date: string
  completed_at: string | null
  status: 'pending' | 'completed' | 'overdue' | 'skipped' | 'scheduled'
  cost: number | null
  delay_reason: string | null
  performed_by?: string | null
  assigned_user_ids?: string[]
  assigned_to?: string | null
}

export interface PMEvent {
  date: string
  tasks: PMTask[]
}

export interface MachineOption {
  id: string
  machine_name: string
  machine_code: string | null
}

// Inline action state for completing/skipping a task from the detail panel.
// `task` is kept so projected occurrences can be materialised on save.
export interface PMTaskAction {
  taskId: string
  task: PMTask
  mode: 'complete' | 'skip'
  findings: string
  cost: string
  reason: string
  checks: boolean[]
}

export const PM_TYPE_LABELS: Record<string, string> = {
  daily: '每日', weekly: '每週', monthly: '每月',
  quarterly: '每季', half_yearly: '每半年', yearly: '每年', custom: '自訂天數',
}

export const PM_TYPE_KEYS: Record<string, string> = {
  daily: 'pm.cadDaily', weekly: 'pm.cadWeekly', monthly: 'pm.cadMonthly',
  quarterly: 'pm.cadQuarterly', half_yearly: 'pm.cadHalfYearly', yearly: 'pm.cadYearly', custom: 'pm.cadCustom',
}

export const DATE_LOCALES: Record<string, DateFnsLocale> = {
  zh: zhTW,
  en: enUS,
  id: idLocale,
}

export const STATUS_KEYS: Record<string, string> = {
  completed: 'pm.stCompleted',
  pending: 'pm.stPending',
  scheduled: 'pm.stScheduled',
  overdue: 'pm.stOverdue',
  skipped: 'pm.stSkipped',
}

export const STATUS_DOT: Record<string, string> = {
  completed: 'bg-green-500',
  pending: 'bg-blue-500',
  scheduled: 'bg-indigo-300',
  overdue: 'bg-red-500',
  skipped: 'bg-gray-400',
}

export const STATUS_BADGE: Record<string, string> = {
  completed: 'bg-green-100 text-green-700',
  pending: 'bg-blue-100 text-blue-700',
  scheduled: 'bg-indigo-100 text-indigo-700',
  overdue: 'bg-red-100 text-red-700',
  skipped: 'bg-gray-100 text-gray-600',
}

export const STATUS_LABELS: Record<string, string> = {
  completed: '已完成',
  pending: '待處理',
  scheduled: '預定',
  overdue: '逾期',
  skipped: '已跳過',
}

export const DAY_ABBRS = ['日', '一', '二', '三', '四', '五', '六']

// A task can be actioned (completed/skipped) if it's not yet done. Projected
// occurrences (no stored record yet) are actionable too — the API materialises
// the record on save, so nothing shown on the calendar is ever a dead end.
export function isActionable(task: PMTask) {
  if (task.ad_hoc) return false
  return task.status === 'pending' || task.status === 'overdue' || task.status === 'scheduled'
}

export function getWeekDates(date: Date): string[] {
  const d = new Date(date)
  const day = d.getDay()
  const sunday = new Date(d)
  sunday.setDate(d.getDate() - day)
  return Array.from({ length: 7 }, (_, i) => {
    const wd = new Date(sunday)
    wd.setDate(sunday.getDate() + i)
    return wd.toISOString().split('T')[0]
  })
}
