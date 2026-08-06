'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useI18n } from '@/lib/i18n'
import { wibTodayStr } from '@/lib/pm'
import type { Task, TaskStatus } from '@/types'
import {
  CheckCircle2, Circle, Clock, Play, ShieldCheck, RotateCcw, Trash2, CalendarClock, User,
} from 'lucide-react'
import QuickAddTask from '@/components/tasks/QuickAddTask'

export interface Assignee { id: string; name: string | null }
export interface TaskRow extends Task {
  assignee_name: string | null
  creator_name: string | null
}

const STATUS_ORDER: Record<TaskStatus, number> = { doing: 0, verifying: 1, todo: 2, done: 3 }
const PRIORITY_DOT: Record<string, string> = { high: 'bg-red-500', normal: 'bg-blue-400', low: 'bg-gray-300' }

export default function TasksView({
  tasks: initial, assignees, currentUserId, currentUserName, canVerify,
}: {
  tasks: TaskRow[]
  assignees: Assignee[]
  currentUserId: string
  currentUserName: string | null
  canVerify: boolean
}) {
  const { t } = useI18n()
  const supabase = createClient()
  const [tasks, setTasks] = useState<TaskRow[]>(initial)
  const [tab, setTab] = useState<'open' | 'done' | 'all'>('open')
  const [mineOnly, setMineOnly] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const today = wibTodayStr()
  const nameById = useMemo(() => new Map(assignees.map(a => [a.id, a.name])), [assignees])

  const visible = useMemo(() => {
    return tasks
      .filter(tk => {
        if (tab === 'open' && tk.status === 'done') return false
        if (tab === 'done' && tk.status !== 'done') return false
        if (mineOnly && tk.assigned_to_id !== currentUserId && tk.created_by_id !== currentUserId) return false
        return true
      })
      .sort((a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        (a.due_date || '9999').localeCompare(b.due_date || '9999'))
  }, [tasks, tab, mineOnly, currentUserId])

  const openCount = tasks.filter(tk => tk.status !== 'done').length
  const doneCount = tasks.length - openCount

  // Status change goes straight through the RLS-protected table; the verify
  // gate (verifying -> done by supervisor only) is enforced by the DB trigger,
  // so a technician can't bypass it even by calling this directly.
  async function move(task: TaskRow, next: TaskStatus) {
    setBusy(task.id)
    const prev = task.status
    setTasks(ts => ts.map(x => x.id === task.id ? { ...x, status: next } : x))
    const { error } = await supabase.from('tasks').update({ status: next }).eq('id', task.id)
    setBusy(null)
    if (error) {
      setTasks(ts => ts.map(x => x.id === task.id ? { ...x, status: prev } : x))
      toast.error(error.message || t('tasks.updateFailed', '更新失敗'))
    }
  }

  async function remove(task: TaskRow) {
    if (!confirm(t('tasks.confirmDelete', '確定刪除這個任務？'))) return
    setBusy(task.id)
    const snapshot = tasks
    setTasks(ts => ts.filter(x => x.id !== task.id))
    const { error } = await supabase.from('tasks').delete().eq('id', task.id)
    setBusy(null)
    if (error) {
      setTasks(snapshot)
      toast.error(error.message || t('tasks.deleteFailed', '刪除失敗'))
    }
  }

  function onCreated(created: Task[]) {
    const rows: TaskRow[] = created.map(c => ({
      ...c,
      assignee_name: c.assigned_to_id ? (nameById.get(c.assigned_to_id) ?? null) : null,
      creator_name: currentUserName,
    }))
    setTasks(ts => [...rows, ...ts])
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-lg font-bold text-gray-900">{t('tasks.title', '任務')}</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          {t('tasks.subtitle', '會議行動項與待辦 — 打字或貼上會議紀錄，指派給人')}
        </p>
      </div>

      <QuickAddTask
        assignees={assignees}
        currentUserId={currentUserId}
        onCreated={onCreated}
      />

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap text-sm">
        {(['open', 'done', 'all'] as const).map(k => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-3 py-1 rounded-full border ${tab === k ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}
          >
            {k === 'open' ? `${t('tasks.filterOpen', '未完成')} (${openCount})`
              : k === 'done' ? `${t('tasks.filterDone', '已完成')} (${doneCount})`
              : t('tasks.filterAll', '全部')}
          </button>
        ))}
        <button
          onClick={() => setMineOnly(v => !v)}
          className={`px-3 py-1 rounded-full border ml-auto ${mineOnly ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200'}`}
        >
          {t('tasks.filterMine', '只看我的')}
        </button>
      </div>

      {/* List */}
      {visible.length === 0 ? (
        <div className="text-center text-gray-400 text-sm py-12 border border-dashed border-gray-200 rounded-xl">
          {t('tasks.empty', '目前沒有任務')}
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map(task => {
            const overdue = task.due_date && task.status !== 'done' && task.due_date < today
            const canAct = task.assigned_to_id === currentUserId || task.created_by_id === currentUserId || canVerify
            return (
              <li key={task.id} className="bg-white rounded-xl border border-gray-200 p-3 flex items-start gap-3">
                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[task.priority]}`} />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${task.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                    {task.title}
                  </p>
                  {task.note && <p className="text-xs text-gray-500 mt-0.5 whitespace-pre-wrap">{task.note}</p>}
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500 flex-wrap">
                    <span className="inline-flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {task.assignee_name || t('tasks.unassigned', '未指派')}
                    </span>
                    {task.due_date && (
                      <span className={`inline-flex items-center gap-1 ${overdue ? 'text-red-600 font-medium' : ''}`}>
                        <CalendarClock className="w-3 h-3" />
                        {task.due_date}{overdue ? ` (${t('tasks.overdue', '逾期')})` : ''}
                      </span>
                    )}
                    <StatusChip status={task.status} t={t} />
                    {task.needs_verification && task.status !== 'done' && (
                      <span className="text-amber-600">{t('tasks.needsVerify', '需驗收')}</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {canAct && task.status === 'todo' && (
                    <IconBtn title={t('tasks.start', '開始')} onClick={() => move(task, 'doing')} disabled={busy === task.id}>
                      <Play className="w-4 h-4 text-blue-600" />
                    </IconBtn>
                  )}
                  {canAct && (task.status === 'todo' || task.status === 'doing') && (
                    <IconBtn
                      title={t('tasks.markDone', '完成')}
                      onClick={() => move(task, task.needs_verification ? 'verifying' : 'done')}
                      disabled={busy === task.id}
                    >
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                    </IconBtn>
                  )}
                  {task.status === 'verifying' && canVerify && (
                    <IconBtn title={t('tasks.verify', '驗收通過')} onClick={() => move(task, 'done')} disabled={busy === task.id}>
                      <ShieldCheck className="w-4 h-4 text-green-700" />
                    </IconBtn>
                  )}
                  {canAct && task.status === 'done' && (
                    <IconBtn title={t('tasks.reopen', '重開')} onClick={() => move(task, 'todo')} disabled={busy === task.id}>
                      <RotateCcw className="w-4 h-4 text-gray-500" />
                    </IconBtn>
                  )}
                  {(task.created_by_id === currentUserId || canVerify) && (
                    <IconBtn title={t('common.delete', '刪除')} onClick={() => remove(task)} disabled={busy === task.id}>
                      <Trash2 className="w-4 h-4 text-gray-400" />
                    </IconBtn>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function IconBtn({ children, title, onClick, disabled }: {
  children: React.ReactNode; title: string; onClick: () => void; disabled?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className="w-9 h-9 inline-flex items-center justify-center rounded-lg hover:bg-gray-100 disabled:opacity-40"
    >
      {children}
    </button>
  )
}

function StatusChip({ status, t }: { status: TaskStatus; t: (k: string, f?: string) => string }) {
  const map: Record<TaskStatus, { label: string; cls: string; icon: React.ReactNode }> = {
    todo: { label: t('tasks.status.todo', '待辦'), cls: 'bg-gray-100 text-gray-600', icon: <Circle className="w-3 h-3" /> },
    doing: { label: t('tasks.status.doing', '進行中'), cls: 'bg-blue-50 text-blue-700', icon: <Play className="w-3 h-3" /> },
    verifying: { label: t('tasks.status.verifying', '待驗收'), cls: 'bg-amber-50 text-amber-700', icon: <Clock className="w-3 h-3" /> },
    done: { label: t('tasks.status.done', '完成'), cls: 'bg-green-50 text-green-700', icon: <CheckCircle2 className="w-3 h-3" /> },
  }
  const s = map[status]
  return <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${s.cls}`}>{s.icon}{s.label}</span>
}
