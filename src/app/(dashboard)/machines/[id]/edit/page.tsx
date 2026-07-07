import { createClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/auth'
import { redirect } from 'next/navigation'
import MachineForm from '@/components/machines/MachineForm'

export const metadata = { title: 'Edit Machine | FAMMS' }

export default async function EditMachinePage({ params }: { params: { id: string } }) {
  const claims = await getAuthClaims()
  if (!claims) redirect('/login')
  const supabase = await createClient()

  const { data: machine } = await supabase
    .from('machines')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!machine) redirect('/machines')

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Edit Mesin</h1>
      <MachineForm machine={machine} />
    </div>
  )
}
