'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Loader2, Plus, Trash2, Send, MessageCircle } from 'lucide-react'

interface Group {
  id: string
  name: string
  telegram_group_id: number
  notify_new_incident: boolean
  notify_sla_alert: boolean
  notify_blocking: boolean
  notify_daily_summary: boolean
}

export default function TelegramSettings({
  factoryId,
  configured,
}: {
  factoryId: string
  configured: boolean
}) {
  const supabase = createClient()
  const [groups, setGroups] = useState<Group[]>([])
  const [name, setName] = useState('')
  const [groupId, setGroupId] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  async function load() {
    const { data } = await supabase
      .from('telegram_groups')
      .select('*')
      .eq('factory_id', factoryId)
      .order('created_at')
    setGroups(data ?? [])
  }

  useEffect(() => {
    load()
  }, [])

  async function addGroup() {
    if (!name || !groupId) {
      toast.error('Isi nama dan Group ID')
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.from('telegram_groups').insert({
        factory_id: factoryId,
        name,
        telegram_group_id: Number(groupId),
      })
      if (error) throw error
      toast.success('Group ditambahkan')
      setName(''); setGroupId('')
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menambah group')
    } finally {
      setSaving(false)
    }
  }

  async function toggleFlag(g: Group, flag: keyof Group) {
    const next = !g[flag]
    const { error } = await supabase
      .from('telegram_groups')
      .update({ [flag]: next })
      .eq('id', g.id)
    if (error) {
      toast.error('Gagal memperbarui')
      return
    }
    setGroups(groups.map(x => (x.id === g.id ? { ...x, [flag]: next } : x)))
  }

  async function removeGroup(id: string) {
    const { error } = await supabase.from('telegram_groups').delete().eq('id', id)
    if (error) {
      toast.error('Gagal menghapus')
      return
    }
    setGroups(groups.filter(g => g.id !== id))
    toast.success('Group dihapus')
  }

  async function testSend() {
    setTesting(true)
    try {
      const res = await fetch('/api/notifications/test', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal mengirim tes')
      toast.success(`Terkirim: ${json.sent}, gagal: ${json.failed}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengirim tes')
    } finally {
      setTesting(false)
    }
  }

  const FLAGS: { key: keyof Group; label: string }[] = [
    { key: 'notify_new_incident', label: 'Incident Baru' },
    { key: 'notify_sla_alert', label: 'SLA Alert' },
    { key: 'notify_blocking', label: 'Blocking' },
    { key: 'notify_daily_summary', label: 'Ringkasan Harian' },
  ]

  return (
    <div className="space-y-6">
      {/* Status */}
      <div className={`rounded-xl border p-4 ${configured ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
        <div className="flex items-center gap-2">
          <MessageCircle className={`w-5 h-5 ${configured ? 'text-green-600' : 'text-amber-600'}`} />
          <p className={`text-sm font-medium ${configured ? 'text-green-800' : 'text-amber-800'}`}>
            {configured
              ? 'Bot Telegram terkonfigurasi (TELEGRAM_BOT_TOKEN aktif).'
              : 'TELEGRAM_BOT_TOKEN belum diset di server. Set di .env.local untuk mengaktifkan.'}
          </p>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Cara dapat Group ID: tambahkan bot ke group Telegram, lalu kirim <code>/chatid</code>.
          Bot akan membalas dengan ID. Daftarkan ID itu di bawah.
        </p>
      </div>

      {/* Add group */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h3 className="font-semibold text-gray-900">Tambah Group Telegram</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Nama Group</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Maintenance DIN" className="mt-1" />
          </div>
          <div>
            <Label>Telegram Group ID</Label>
            <Input value={groupId} onChange={e => setGroupId(e.target.value)} placeholder="-1001234567890" className="mt-1" />
          </div>
        </div>
        <Button onClick={addGroup} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
          Tambah Group
        </Button>
      </div>

      {/* Group list */}
      {groups.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {groups.map(g => (
            <div key={g.id} className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{g.name}</p>
                  <p className="text-xs text-gray-400 font-mono">{g.telegram_group_id}</p>
                </div>
                <button onClick={() => removeGroup(g.id)} className="text-gray-400 hover:text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {FLAGS.map(f => (
                  <button
                    key={f.key}
                    onClick={() => toggleFlag(g, f.key)}
                    className={`text-xs px-3 py-1 rounded-full border transition ${
                      g[f.key]
                        ? 'bg-blue-50 border-blue-300 text-blue-700'
                        : 'bg-gray-50 border-gray-200 text-gray-400'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Test */}
      <Button variant="outline" onClick={testSend} disabled={testing || !configured}>
        {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
        Kirim Tes Notifikasi
      </Button>
    </div>
  )
}
