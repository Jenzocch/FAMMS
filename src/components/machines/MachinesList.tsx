'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, Edit2, Trash2, QrCode } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import StatusBadge from '@/components/shared/StatusBadge'
import { useI18n } from '@/lib/i18n'

export interface MachineRow {
  id: string
  machine_code: string | null
  machine_name: string
  status: 'running' | 'repairing' | 'standby' | 'scrapped'
  brand: string | null
  model: string | null
  area?: { name: string } | null
  owner?: { full_name: string | null } | null
}

interface MachinesListProps {
  machines: MachineRow[]
  deleteAction: (machineId: string) => Promise<void>
  /** manager/admin only — hides add/edit/delete for viewers (PERMISSIONS.manageMachines) */
  canManage?: boolean
}

export default function MachinesList({ machines, deleteAction, canManage = false }: MachinesListProps) {
  const { t } = useI18n()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">{t('machines.title', '機器列表')}</h1>
        {canManage && (
          <Link href="/machines/new">
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              {t('machines.addBtn', '新增機器')}
            </Button>
          </Link>
        )}
      </div>

      {machines.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <QrCode className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500">{t('machines.empty', '尚未登錄任何機器')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {machines.map((m) => (
            <div key={m.id} className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between hover:border-blue-300 transition">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="font-semibold text-gray-900">{m.machine_code}</h3>
                  <StatusBadge status={m.status} type="machine" />
                </div>
                <p className="text-sm text-gray-600">{m.machine_name}</p>
                <div className="flex gap-4 mt-2 text-xs text-gray-500">
                  {m.brand && <span>{m.brand} {m.model}</span>}
                  {m.area?.name && <span>{m.area.name}</span>}
                  {m.owner?.full_name && <span>PIC: {m.owner.full_name}</span>}
                </div>
              </div>
              <div className="flex gap-2">
                <Link href={`/machines/${m.id}/qr`}>
                  <Button variant="outline" size="icon" className="h-10 w-10" aria-label="QR">
                    <QrCode className="w-4 h-4" />
                  </Button>
                </Link>
                {canManage && (
                  <>
                    <Link href={`/machines/${m.id}/edit`}>
                      <Button variant="outline" size="icon" className="h-10 w-10" aria-label={t('common.edit', '編輯')}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                    </Link>
                    <DeleteMachineButton machineId={m.id} deleteAction={deleteAction} />
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DeleteMachineButton({
  machineId,
  deleteAction,
}: {
  machineId: string
  deleteAction: (machineId: string) => Promise<void>
}) {
  const { t } = useI18n()
  const [checking, setChecking] = useState(false)

  // A machine with repair history must be scrapped, not deleted (the DB
  // RESTRICTs it regardless — this check turns that into a clear message).
  async function onDelete() {
    setChecking(true)
    try {
      const supabase = createClient()
      const { count } = await supabase
        .from('incidents')
        .select('id', { count: 'exact', head: true })
        .eq('machine_id', machineId)
      if ((count ?? 0) > 0) {
        toast.error(t('machines.hasHistoryCannotDelete', '此機器有 {n} 筆維修紀錄，無法刪除。請改將狀態設為「報廢」以保留歷史。').replace('{n}', String(count)))
        return
      }
      if (!confirm(t('machines.confirmDelete', '確定要刪除這台機器嗎？'))) return
      await deleteAction(machineId)
    } finally {
      setChecking(false)
    }
  }

  return (
    <Button
      variant="outline"
      size="icon" className="h-10 w-10 text-red-600 hover:bg-red-50"
      onClick={onDelete}
      disabled={checking}
      aria-label={t('common.delete', '刪除')}
      
    >
      <Trash2 className="w-4 h-4" />
    </Button>
  )
}
