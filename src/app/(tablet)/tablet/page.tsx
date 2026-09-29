import { getSharedTabletContext } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import TabletHome from './_components/TabletHome'
import TabletSignOutButton from './_components/TabletSignOutButton'
import type { TabletSession } from './_components/TabletHome'

export default async function TabletPage() {
  const context = await getSharedTabletContext()
  if (!context.ok) {
    return (
      <section className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-7 shadow-sm" role="alert">
        <p className="text-xs font-bold uppercase tracking-[.14em] text-blue-700">Tablet Bersama Teknisi</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Perangkat belum dapat digunakan</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">Silakan hubungi admin.</p>
        <div className="mt-6"><TabletSignOutButton /></div>
      </section>
    )
  }

  const admin = createAdminClient()
  const { data: factories } = await admin
    .from('factories').select('name').in('id', context.device.factory_ids)

  const session: TabletSession = {
    device: {
      id: context.device.id,
      label: context.device.label,
      factory_ids: context.device.factory_ids,
    },
    roster: context.roster,
    factoryName: factories?.map(factory => factory.name).join(' / ') || 'Pabrik terdaftar',
  }

  return <TabletHome session={session} />
}
