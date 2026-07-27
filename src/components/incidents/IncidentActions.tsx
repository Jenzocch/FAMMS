'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Loader2, Pencil, Trash2, Lock } from 'lucide-react'
import { PERMISSIONS } from '@/lib/permissions'
import { logAuditEvent } from '@/lib/audit'
import { useI18n } from '@/lib/i18n'
import IncidentEditForm, { type IncidentEditFormProps } from './edit/IncidentEditForm'

// The Edit / Delete bar under a case, plus the delete confirmation. Editing
// swaps this whole bar for IncidentEditForm — see there for the form itself,
// and for why the original reporter can open it without edit permission.
type IncidentActionsProps = Omit<IncidentEditFormProps, 'onClose'>

export default function IncidentActions(props: IncidentActionsProps) {
  const { incidentId, title, userRole = 'technician', userName, factoryId } = props
  const canDelete = PERMISSIONS.deleteIncident(userRole)
  const router = useRouter()
  const supabase = createClient()
  const { t } = useI18n()

  const [editing, setEditing] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function confirmDelete() {
    setDeleting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      // Log before delete so the audit record is created while the row exists.
      await logAuditEvent(supabase, {
        userId: user?.id ?? null,
        userName: userName || null,
        actionType: 'delete',
        resourceType: 'incident',
        resourceId: incidentId,
        oldValue: { title },
        changeSummary: `工單已刪除${title ? `：${title}` : ''}`,
        factoryId: factoryId ?? undefined,
      })
      const { error } = await supabase.from('incidents').delete().eq('id', incidentId)
      if (error) throw error
      toast.success(t('caseEdit.deleted'))
      setShowDeleteConfirm(false)
      router.push('/incidents')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('caseEdit.deleteFailed'))
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  if (editing) {
    return <IncidentEditForm {...props} onClose={() => setEditing(false)} />
  }

  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        onClick={() => setEditing(true)}
        className="flex-1 gap-2 border-gray-300 font-medium"
      >
        <Pencil className="w-4 h-4" /> {t('caseEdit.edit')}
      </Button>
      <Button
        variant="outline"
        onClick={() => setShowDeleteConfirm(true)}
        disabled={!canDelete}
        className="gap-2 border-red-300 text-red-600 font-medium hover:bg-red-50 hover:text-red-700"
        title={!canDelete ? t('caseEdit.onlySupervisorDelete') : ''}
      >
        {canDelete ? <Trash2 className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
        {t('caseEdit.delete')}
      </Button>

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">{t('caseEdit.delete')}</DialogTitle>
            <DialogDescription>{t('caseEdit.confirmDelete')}</DialogDescription>
          </DialogHeader>
          {title && <p className="text-sm text-gray-600 px-6">{title}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>
              {t('common.cancel')}
            </Button>
            <Button onClick={confirmDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700 text-white">
              {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('caseEdit.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
