'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import TabletSignOutButton from './TabletSignOutButton'

export type RosterMember = { id: string; full_name: string }
export type TabletSession = {
  device: { id: string; label: string; factory_id: string }
  roster: RosterMember[]
  factoryName: string
}
type TabletIncident = {
  id: string
  incident_no: string
  title: string | null
  status: string
  reported_at: string
  machine: unknown
  factory: unknown
}
type IncidentResponse = { incidents: TabletIncident[] }
type Draft = {
  performerId: string
  incidentId: string | null
  note: string
  performerIds: string[]
}
type Scope = 'mine' | 'team'

function apiMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
    return payload.error
  }
  return fallback
}

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null)
}

export default function TabletHome({ session }: { session: TabletSession }) {
  const [sessionState, setSessionState] = useState<'ready' | 'unauthorized'>('ready')
  const [sessionError, setSessionError] = useState('')
  const [activePerformerId, setActivePerformerId] = useState<string | null>(null)
  const [scope, setScope] = useState<Scope>('mine')
  const [incidents, setIncidents] = useState<TabletIncident[]>([])
  const [incidentsState, setIncidentsState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [incidentError, setIncidentError] = useState('')
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [performerIds, setPerformerIds] = useState<string[]>([])
  const [formDirty, setFormDirty] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [switchDialogOpen, setSwitchDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitMessage, setSubmitMessage] = useState('')
  const pendingRequestId = useRef<string | null>(null)
  const incidentRequest = useRef(0)
  const switchDialog = useRef<HTMLDialogElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const dialog = switchDialog.current
    if (!dialog) return
    if (switchDialogOpen && !dialog.open) dialog.showModal()
    if (!switchDialogOpen && dialog.open) dialog.close()
  }, [switchDialogOpen])

  const loadIncidents = useCallback(async (personId: string, selectedScope: Scope, signal?: AbortSignal) => {
    const requestNumber = ++incidentRequest.current
    const query = new URLSearchParams({ performerId: personId, scope: selectedScope })
    try {
      const response = await fetch(`/api/tablet/incidents?${query.toString()}`, {
        method: 'GET', cache: 'no-store', credentials: 'same-origin', signal,
        headers: { Accept: 'application/json' },
      })
      const data = await readJson(response)
      if (signal?.aborted || requestNumber !== incidentRequest.current) return
      if (response.status === 401 || response.status === 403) {
        setSessionState('unauthorized')
        setSessionError(apiMessage(data, 'Sesi perangkat sudah tidak berlaku.'))
        setIncidentsState('idle')
        return
      }
      if (!response.ok) throw new Error(apiMessage(data, 'Pekerjaan tidak dapat dimuat.'))
      if (!data || typeof data !== 'object' || !('incidents' in data) || !Array.isArray(data.incidents)) {
        throw new Error('Respons daftar pekerjaan tidak valid.')
      }
      setIncidents((data as IncidentResponse).incidents)
      setIncidentsState('ready')
    } catch (error) {
      if (signal?.aborted || requestNumber !== incidentRequest.current) return
      setIncidentsState('error')
      setIncidentError(error instanceof Error ? error.message : 'Terjadi kesalahan saat memuat pekerjaan.')
    }
  }, [])

  const activePerformer = session?.roster.find((member) => member.id === activePerformerId) ?? null
  const selectedIncident = incidents.find((incident) => incident.id === selectedIncidentId) ?? null
  const dirty = formDirty
  const ownDraft = draft && draft.performerId === activePerformerId ? draft : null

  function startAs(member: RosterMember) {
    setActivePerformerId(member.id)
    setScope('mine')
    setIncidents([])
    setIncidentsState('loading')
    setIncidentError('')
    void loadIncidents(member.id, 'mine')
    setNote('')
    setPerformerIds([member.id])
    setSelectedIncidentId(null)
    setFormDirty(false)
    setSubmitMessage('')
    setTimeout(() => heading.current?.focus(), 0)
  }

  function clearCurrentForm() {
    setNote('')
    setPerformerIds(activePerformerId ? [activePerformerId] : [])
    setSelectedIncidentId(null)
    setFormDirty(false)
    setSubmitMessage('')
  }

  function switchUser() {
    if (dirty) {
      setSwitchDialogOpen(true)
      return
    }
    setActivePerformerId(null)
    setIncidentsState('idle')
  }

  function changeScope(nextScope: Scope) {
    setScope(nextScope)
    setIncidentsState('loading')
    setIncidentError('')
    if (activePerformerId) void loadIncidents(activePerformerId, nextScope)
  }

  function saveDraftAndSwitch() {
    if (activePerformerId) {
      setDraft({ performerId: activePerformerId, incidentId: selectedIncidentId, note, performerIds })
    }
    clearCurrentForm()
    setSwitchDialogOpen(false)
    setActivePerformerId(null)
    setIncidentsState('idle')
  }

  function discardDraftAndSwitch() {
    setDraft(null)
    clearCurrentForm()
    setSwitchDialogOpen(false)
    setActivePerformerId(null)
    setIncidentsState('idle')
  }

  function resumeDraft() {
    if (!ownDraft || ownDraft.performerId !== activePerformerId) return
    setNote(ownDraft.note)
    setPerformerIds(ownDraft.performerIds)
    setSelectedIncidentId(ownDraft.incidentId)
    setFormDirty(Boolean(ownDraft.note.trim() || ownDraft.incidentId || ownDraft.performerIds.some((id) => id !== activePerformerId)))
    setDraft(null)
  }

  async function submitProgress(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedIncident || !note.trim() || !performerIds.length || !activePerformerId || submitting) return
    if (!pendingRequestId.current) pendingRequestId.current = crypto.randomUUID()
    setSubmitting(true)
    setSubmitMessage('')
    try {
      const response = await fetch(`/api/tablet/incidents/${encodeURIComponent(selectedIncident.id)}/updates`, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ note: note.trim(), performerIds, requestId: pendingRequestId.current }),
      })
      const data = await readJson(response)
      if (response.status === 401 || response.status === 403) {
        setSessionState('unauthorized')
        setSessionError(apiMessage(data, 'Sesi perangkat sudah tidak berlaku.'))
        return
      }
      if (!response.ok) throw new Error(apiMessage(data, 'Catatan perbaikan belum tersimpan. Silakan coba lagi.'))
      pendingRequestId.current = null
      setDraft(null)
      clearCurrentForm()
      setSubmitMessage('Laporan perbaikan berhasil dikirim.')
      setIncidentsState('loading')
      setIncidentError('')
      await loadIncidents(activePerformerId, scope)
    } catch (error) {
      setSubmitMessage(error instanceof Error ? error.message : 'Laporan belum tersimpan. Coba lagi dengan permintaan yang sama.')
    } finally {
      setSubmitting(false)
    }
  }

  if (sessionState === 'unauthorized') {
    return <section className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-7 shadow-sm" role="alert"><p className="text-xs font-bold uppercase tracking-[.14em] text-blue-700">Tablet Bersama Teknisi</p><h1 className="mt-2 text-2xl font-bold tracking-tight">Perangkat belum dapat digunakan</h1><p className="mt-3 text-sm leading-6 text-slate-600">{sessionError} Silakan hubungi admin.</p><div className="mt-6"><TabletSignOutButton /></div></section>
  }

  return (
    <>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3"><div className="grid size-11 place-items-center rounded-2xl bg-blue-700 text-lg font-bold text-white" aria-hidden="true">F</div><div><p className="text-lg font-bold tracking-tight">FAMMS</p><p className="text-xs text-slate-500">{session.device.label} · {session.factoryName}</p></div></div>
        {activePerformer && <div className="flex items-center gap-3"><div className="text-right"><p className="text-xs text-slate-500">Pengguna saat ini</p><p className="font-semibold">{activePerformer.full_name}</p></div><button type="button" onClick={switchUser} className="min-h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">Ganti pengguna</button></div>}
      </header>

      {!activePerformer ? (
        <section aria-labelledby="pickerTitle" className="mx-auto max-w-4xl">
          <div className="mb-7 text-center"><p className="text-xs font-bold uppercase tracking-[.16em] text-blue-700">Tablet Bersama Teknisi · {session.factoryName}</p><h1 ref={heading} tabIndex={-1} id="pickerTitle" className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Pilih nama Anda</h1><p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-600">Pilih nama untuk menampilkan pekerjaan. Nama yang dipilih adalah keterangan pengguna, bukan verifikasi identitas atau pemberian hak akses.</p></div>
          {session.roster.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">Belum ada teknisi yang diizinkan untuk perangkat ini. Hubungi admin.</div> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{session.roster.map((member) => <button key={member.id} type="button" onClick={() => startAs(member)} className="flex min-h-28 items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"><span className="grid size-14 shrink-0 place-items-center rounded-[19px] bg-blue-50 text-xl font-bold text-blue-700" aria-hidden="true">{member.full_name.trim().charAt(0).toUpperCase()}</span><span><span className="block text-lg font-bold text-slate-900">{member.full_name}</span><span className="mt-1 block text-sm text-slate-500">Pilih untuk mulai</span></span></button>)}</div>}
          <p className="mt-6 text-center text-xs text-slate-500">Tampilan ini tidak menggantikan login akun pribadi.</p>
        </section>
      ) : (
        <>
          {ownDraft && <aside className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4" aria-label="Draf tersimpan"><p className="text-sm text-amber-950">Draf sementara di halaman ini atas nama {activePerformer.full_name}. Pemilihan nama bukan verifikasi identitas.</p><div className="flex gap-2"><button type="button" onClick={resumeDraft} className="min-h-11 rounded-xl bg-amber-800 px-4 text-sm font-semibold text-white">Lanjutkan draf</button><button type="button" onClick={() => setDraft(null)} className="min-h-11 rounded-xl border border-amber-300 px-4 text-sm font-semibold text-amber-950">Hapus</button></div></aside>}
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,.85fr)]">
            <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6" aria-labelledby="tasksTitle">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-blue-700">Daftar pekerjaan</p><h1 id="tasksTitle" className="mt-1 text-2xl font-bold tracking-tight">Pekerjaan aktif</h1></div><button type="button" onClick={() => { setIncidentsState('loading'); setIncidentError(''); if (activePerformerId) void loadIncidents(activePerformerId, scope) }} disabled={incidentsState === 'loading'} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 disabled:opacity-50">Muat ulang</button></div>
              <div className="mt-5 inline-flex rounded-xl bg-slate-100 p-1" role="group" aria-label="Filter pekerjaan"><button type="button" aria-pressed={scope === 'mine'} onClick={() => changeScope('mine')} className={`min-h-10 rounded-lg px-4 text-sm font-semibold ${scope === 'mine' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}>Tugas saya</button><button type="button" aria-pressed={scope === 'team'} onClick={() => changeScope('team')} className={`min-h-10 rounded-lg px-4 text-sm font-semibold ${scope === 'team' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}>Tugas tim</button></div>
              {incidentsState === 'loading' && <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600" aria-live="polite">Memuat pekerjaan dari server…</p>}
              {incidentsState === 'error' && <div className="mt-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-800" role="alert">{incidentError}<button type="button" className="ml-2 underline" onClick={() => { setIncidentsState('loading'); setIncidentError(''); if (activePerformerId) void loadIncidents(activePerformerId, scope) }}>Coba lagi</button></div>}
              {incidentsState === 'ready' && incidents.length === 0 && <p className="mt-4 rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Tidak ada pekerjaan pada daftar ini.</p>}
              {incidentsState === 'ready' && incidents.length > 0 && <ul className="mt-4 grid gap-2">{incidents.map((incident) => <li key={incident.id}><button type="button" aria-pressed={selectedIncidentId === incident.id} onClick={() => { setSelectedIncidentId(incident.id); setFormDirty(true); setSubmitMessage('') }} className={`w-full rounded-2xl border p-4 text-left transition ${selectedIncidentId === incident.id ? 'border-blue-400 bg-blue-50/50 ring-1 ring-blue-200' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'}`}><span className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-bold tracking-wide text-slate-500">{incident.incident_no}</span><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">{incident.status}</span></span><span className="mt-2 block text-base font-bold text-slate-900">{incident.title || 'Work order'}</span><span className="mt-1 block text-xs text-slate-500">{new Date(incident.reported_at).toLocaleString('id-ID')}</span></button></li>)}</ul>}
              <p className="mt-5 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">Daftar ditentukan server berdasarkan cakupan perangkat dan filter yang diminta; memilih nama tidak menambah akses.</p>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6" aria-labelledby="updateTitle">
              <p className="text-xs font-bold uppercase tracking-[.14em] text-blue-700">Catatan teknisi</p><h2 id="updateTitle" className="mt-1 text-2xl font-bold tracking-tight">Laporkan perbaikan</h2><p className="mt-2 text-sm leading-6 text-slate-600">Catat pekerjaan dan orang yang menangani. Ini bukan tindakan menerima atau menutup work order.</p>
              {selectedIncident && <div className="mt-4 rounded-xl bg-blue-50 p-3 text-sm"><span className="font-bold">{selectedIncident.incident_no}</span><span className="ml-2">{selectedIncident.title}</span></div>}
              <form className="mt-4 space-y-4" onSubmit={submitProgress}>
                <div><label htmlFor="tabletProgressNote" className="mb-2 block text-sm font-semibold">Apa yang sudah dikerjakan?</label><textarea id="tabletProgressNote" value={note} onChange={(event) => { setNote(event.target.value); setFormDirty(true) }} rows={4} maxLength={4000} className="w-full resize-y rounded-xl border border-slate-300 bg-white p-3 text-sm leading-6 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" placeholder="Contoh: Memeriksa pompa dan mengganti seal…" /></div>
                <fieldset><legend className="mb-2 text-sm font-semibold">Yang menangani (bisa pilih beberapa)</legend><div className="grid gap-2 sm:grid-cols-2">{session.roster.map((member) => <label key={member.id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-3 text-sm font-medium has-[:checked]:border-blue-300 has-[:checked]:bg-blue-50"><input type="checkbox" checked={performerIds.includes(member.id)} onChange={(event) => { setPerformerIds((current) => event.target.checked ? [...new Set([...current, member.id])] : current.filter((id) => id !== member.id)); setFormDirty(true); setSubmitMessage('') }} className="size-4 accent-blue-700" />{member.full_name}</label>)}</div></fieldset>
                <p className="text-xs leading-5 text-slate-500">Nama dipilih pengguna; bukan verifikasi identitas. Data penugasan work order tetap terpisah.</p>
                {submitMessage && <p role="status" aria-live="polite" className={`rounded-xl p-3 text-sm ${submitMessage.includes('berhasil') ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>{submitMessage}</p>}
                <button type="submit" disabled={submitting || incidentsState !== 'ready' || !selectedIncidentId || !note.trim() || performerIds.length === 0} className="min-h-12 w-full rounded-xl bg-blue-700 px-5 font-semibold text-white shadow-sm hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300">{submitting ? 'Mengirim…' : 'Simpan laporan perbaikan'}</button>
              </form>
              <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">Dikirim melalui akun perangkat. Hanya endpoint server yang dapat menyimpan laporan; aplikasi ini tidak menulis langsung ke database.</div>
            </section>
          </div>
        </>
      )}

      <dialog ref={switchDialog} onCancel={(event) => { event.preventDefault(); setSwitchDialogOpen(false) }} aria-labelledby="switchDialogTitle" aria-describedby="switchDialogText" className="w-[min(100%-2rem,30rem)] rounded-3xl border-0 p-0 shadow-2xl backdrop:bg-slate-950/40">
        <div className="p-6"><h2 id="switchDialogTitle" className="text-xl font-bold">Ganti pengguna?</h2><p id="switchDialogText" className="mt-2 text-sm leading-6 text-slate-600">Draf hanya sementara di halaman ini, atas nama {activePerformer?.full_name}. Nama pilihan bukan verifikasi identitas.</p><div className="mt-5 grid gap-2"><button type="button" onClick={saveDraftAndSwitch} className="min-h-12 rounded-xl bg-blue-700 px-4 font-semibold text-white">Simpan draf &amp; ganti pengguna</button><button type="button" onClick={() => setSwitchDialogOpen(false)} className="min-h-12 rounded-xl border border-slate-200 px-4 font-semibold text-slate-700">Kembali ke draf</button><button type="button" onClick={discardDraftAndSwitch} className="min-h-12 rounded-xl bg-rose-50 px-4 font-semibold text-rose-800">Buang draf &amp; ganti</button></div></div>
      </dialog>
    </>
  )
}
