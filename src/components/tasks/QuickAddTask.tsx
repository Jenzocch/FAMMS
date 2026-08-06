'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useI18n } from '@/lib/i18n'
import type { Task } from '@/types'
import { Plus, ChevronDown, ChevronUp, ClipboardList, Loader2 } from 'lucide-react'
import SpeechMicButton from '@/components/shared/SpeechMicButton'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import type { Assignee } from '@/components/tasks/TasksView'

interface Draft {
  title: string
  assignedTo: string
  dueDate: string
  priority: string
  needsVerification: boolean
}

// POST a batch of tasks; returns the created rows or throws.
async function postTasks(tasks: Record<string, unknown>[]): Promise<Task[]> {
  const res = await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tasks }),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(json?.error || 'Gagal menyimpan tugas')
  return (json?.tasks ?? []) as Task[]
}

export default function QuickAddTask({
  assignees, currentUserId, onCreated,
}: {
  assignees: Assignee[]
  currentUserId: string
  onCreated: (tasks: Task[]) => void
}) {
  const { t } = useI18n()
  const [d, setD] = useState<Draft>({
    title: '', assignedTo: currentUserId, dueDate: '', priority: 'normal', needsVerification: false,
  })
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)

  async function addOne() {
    const title = d.title.trim()
    if (!title) return
    setSaving(true)
    try {
      const created = await postTasks([{
        title,
        assigned_to_id: d.assignedTo || undefined,
        due_date: d.dueDate || undefined,
        priority: d.priority,
        needs_verification: d.needsVerification,
      }])
      onCreated(created)
      // Keep the assignee/priority/verify choices (a meeting assigns several in
      // a row to the same person) — only clear the title and due date.
      setD(prev => ({ ...prev, title: '', dueDate: '' }))
      toast.success(t('tasks.added', '任務已新增'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('tasks.addFailed', '新增失敗'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
      {/* Primary row: one field + voice + add. This is the fast path. */}
      <div className="flex items-center gap-2">
        <input
          value={d.title}
          onChange={e => setD({ ...d, title: e.target.value })}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addOne() } }}
          placeholder={t('tasks.quickPlaceholder', '輸入任務，按 Enter 新增…')}
          className="flex-1 min-w-0 h-11 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <SpeechMicButton onText={txt => setD(prev => ({ ...prev, title: (prev.title ? prev.title + ' ' : '') + txt }))} />
        <button
          type="button"
          onClick={addOne}
          disabled={saving || !d.title.trim()}
          className="h-11 px-4 inline-flex items-center gap-1 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-40"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {t('tasks.add', '新增')}
        </button>
      </div>

      {/* Secondary controls */}
      <div className="flex items-center gap-2 flex-wrap text-sm">
        <select
          value={d.assignedTo}
          onChange={e => setD({ ...d, assignedTo: e.target.value })}
          className="h-9 px-2 rounded-lg border border-gray-200 text-gray-700 max-w-[45%]"
        >
          <option value={currentUserId}>{t('tasks.assignSelf', '指派給我')}</option>
          {assignees.filter(a => a.id !== currentUserId).map(a => (
            <option key={a.id} value={a.id}>{a.name || t('tasks.unnamed', '(未命名)')}</option>
          ))}
          <option value="">{t('tasks.unassigned', '未指派')}</option>
        </select>

        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="h-9 px-2 inline-flex items-center gap-1 text-gray-500 hover:text-gray-700"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          {t('tasks.more', '更多')}
        </button>

        <button
          type="button"
          onClick={() => setPasteOpen(true)}
          className="h-9 px-2 inline-flex items-center gap-1 text-gray-500 hover:text-gray-700 ml-auto"
        >
          <ClipboardList className="w-4 h-4" />
          {t('tasks.pasteMeeting', '貼上會議紀錄')}
        </button>
      </div>

      {expanded && (
        <div className="flex items-center gap-3 flex-wrap text-sm pt-1">
          <label className="inline-flex items-center gap-1 text-gray-600">
            {t('tasks.due', '期限')}
            <input
              type="date"
              value={d.dueDate}
              onChange={e => setD({ ...d, dueDate: e.target.value })}
              className="h-9 px-2 rounded-lg border border-gray-200"
            />
          </label>
          <label className="inline-flex items-center gap-1 text-gray-600">
            {t('tasks.priority', '優先')}
            <select
              value={d.priority}
              onChange={e => setD({ ...d, priority: e.target.value })}
              className="h-9 px-2 rounded-lg border border-gray-200"
            >
              <option value="low">{t('tasks.priorityLow', '低')}</option>
              <option value="normal">{t('tasks.priorityNormal', '中')}</option>
              <option value="high">{t('tasks.priorityHigh', '高')}</option>
            </select>
          </label>
          <label className="inline-flex items-center gap-1.5 text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={d.needsVerification}
              onChange={e => setD({ ...d, needsVerification: e.target.checked })}
              className="w-4 h-4"
            />
            {t('tasks.needsVerify', '需驗收')}
          </label>
        </div>
      )}

      {pasteOpen && (
        <PasteMeetingDialog
          assignees={assignees}
          currentUserId={currentUserId}
          onClose={() => setPasteOpen(false)}
          onCreated={tasks => { onCreated(tasks); setPasteOpen(false) }}
        />
      )}
    </div>
  )
}

// Paste a whole meeting note → one task per line. Strips common bullet/number
// prefixes so "- chase supplier" and "1. buy trolleys" come in clean.
function PasteMeetingDialog({
  assignees, currentUserId, onClose, onCreated,
}: {
  assignees: Assignee[]
  currentUserId: string
  onClose: () => void
  onCreated: (tasks: Task[]) => void
}) {
  const { t } = useI18n()
  const [text, setText] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [needsVerification, setNeedsVerification] = useState(false)
  const [saving, setSaving] = useState(false)

  const lines = text
    .split('\n')
    .map(l => l.replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, '').trim())
    .filter(Boolean)

  async function submit() {
    if (lines.length === 0) return
    setSaving(true)
    try {
      const created = await postTasks(lines.map(title => ({
        title,
        assigned_to_id: assignedTo || undefined,
        needs_verification: needsVerification,
        source: 'meeting',
      })))
      toast.success(t('tasks.addedN', '已新增 {n} 個任務').replace('{n}', String(created.length)))
      onCreated(created)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('tasks.addFailed', '新增失敗'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('tasks.pasteMeeting', '貼上會議紀錄')}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-gray-500">{t('tasks.pasteHint', '一行一個任務，會自動切開')}</p>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={7}
          autoFocus
          placeholder={t('tasks.pastePlaceholder', '- 跟供應商談封口膜交期\n- 採購 3 台推車\n- 下週五前交安全訓練文件')}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex items-center gap-3 flex-wrap text-sm">
          <select
            value={assignedTo}
            onChange={e => setAssignedTo(e.target.value)}
            className="h-9 px-2 rounded-lg border border-gray-200 text-gray-700"
          >
            <option value="">{t('tasks.unassigned', '未指派')}</option>
            <option value={currentUserId}>{t('tasks.assignSelf', '指派給我')}</option>
            {assignees.filter(a => a.id !== currentUserId).map(a => (
              <option key={a.id} value={a.id}>{a.name || t('tasks.unnamed', '(未命名)')}</option>
            ))}
          </select>
          <label className="inline-flex items-center gap-1.5 text-gray-600 cursor-pointer">
            <input type="checkbox" checked={needsVerification} onChange={e => setNeedsVerification(e.target.checked)} className="w-4 h-4" />
            {t('tasks.needsVerify', '需驗收')}
          </label>
          <span className="text-gray-400 ml-auto">{t('tasks.willCreate', '將建立 {n} 筆').replace('{n}', String(lines.length))}</span>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common.cancel', '取消')}</Button>
          <Button onClick={submit} disabled={saving || lines.length === 0}>
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            {t('tasks.createAll', '全部新增')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
