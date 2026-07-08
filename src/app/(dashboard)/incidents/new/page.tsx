import IncidentForm from '@/components/incidents/IncidentForm'

export const metadata = { title: 'Report | FAMMS' }

export default async function NewIncidentPage({
  searchParams,
}: {
  searchParams: Promise<{ machine?: string }>
}) {
  // QR codes on machines link here as /incidents/new?machine=<id> — the form
  // preselects that machine so a scan is a one-tap report.
  const { machine } = await searchParams
  return <IncidentForm presetMachineId={machine} />
}
