'use client'

import { useSearchParams } from 'next/navigation'
import {
  Users, ShieldCheck, Wrench, Factory, Tag, Truck, CalendarClock, Send,
  ChevronRight, ChevronLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'
import UserManager from '@/components/settings/UserManager'
import RoleManager from '@/components/settings/RoleManager'
import AssetManager from '@/components/settings/AssetManager'
import FactoryManager from '@/components/settings/FactoryManager'
import IncidentTypeManager from '@/components/settings/IncidentTypeManager'
import VendorManager from '@/components/settings/VendorManager'
import PMScheduleManager from '@/components/pm/PMScheduleManager'
import TelegramSettings from '@/components/settings/TelegramSettings'
import { SettingsSectionHeader } from '@/components/settings/SettingsSectionHeader'

// Master-detail Settings. The page used to render every permitted module
// stacked on one long page — up to eight heavy client components, each
// firing its own data fetches on mount, and the one you wanted was usually
// somewhere down a lot of scrolling. Now: a section list (master) and ONE
// mounted module at a time (detail). Only mounting the active module also
// means only that module's queries run.
//
// The active section lives in the URL (?s=users) via history.pushState —
// Next's useSearchParams tracks native History API updates, so Back returns
// to the list (mobile) / previous section without re-running the server
// page, refresh restores the same section, and a URL can be shared.

export type SectionKey =
  | 'users' | 'roles' | 'assets' | 'factories'
  | 'incidentTypes' | 'vendors' | 'pm' | 'telegram'

interface ShellProps {
  allowed: SectionKey[]
  // Server-computed props for individual sections
  currentUserId: string
  canAssignAdmin: boolean
  telegramFactoryId: string | null
  telegramConfigured: boolean
}

const SECTION_META: Record<SectionKey, {
  icon: React.ComponentType<{ className?: string }>
  titleKey: string
  descKey: string
}> = {
  users: { icon: Users, titleKey: 'settings.userSectionTitle', descKey: 'settings.userSectionDesc' },
  roles: { icon: ShieldCheck, titleKey: 'settings.roleSectionTitle', descKey: 'settings.roleSectionDesc' },
  assets: { icon: Wrench, titleKey: 'settings.assetSectionTitle', descKey: 'settings.assetSectionDesc' },
  factories: { icon: Factory, titleKey: 'settings.factorySectionTitle', descKey: 'settings.factorySectionDesc' },
  incidentTypes: { icon: Tag, titleKey: 'settings.incidentTypeSectionTitle', descKey: 'settings.incidentTypeSectionDesc' },
  vendors: { icon: Truck, titleKey: 'settings.vendorSectionTitle', descKey: 'settings.vendorSectionDesc' },
  pm: { icon: CalendarClock, titleKey: 'settings.pmSectionTitle', descKey: 'settings.pmSectionDesc' },
  telegram: { icon: Send, titleKey: 'settings.telegramSectionTitle', descKey: 'settings.telegramSectionDesc' },
}

export default function SettingsShell({
  allowed, currentUserId, canAssignAdmin, telegramFactoryId, telegramConfigured,
}: ShellProps) {
  const { t } = useI18n()
  const searchParams = useSearchParams()

  // URL is the single source of truth. An out-of-scope/unknown ?s= (typo,
  // stale link, section the viewer isn't permitted) falls back to "nothing
  // selected" rather than an empty detail pane.
  const raw = searchParams.get('s') as SectionKey | null
  const active = raw && allowed.includes(raw) ? raw : null

  function select(key: SectionKey | null) {
    const url = key ? `/settings?s=${key}` : '/settings'
    window.history.pushState(null, '', url)
  }

  function renderSection(key: SectionKey) {
    switch (key) {
      case 'users': return <UserManager currentUserId={currentUserId} canAssignAdmin={canAssignAdmin} />
      case 'roles': return <RoleManager />
      case 'assets': return <AssetManager />
      case 'factories': return <FactoryManager />
      case 'incidentTypes': return <IncidentTypeManager />
      case 'vendors': return <VendorManager />
      case 'pm': return <PMScheduleManager />
      case 'telegram': return <TelegramSettings factoryId={telegramFactoryId} configured={telegramConfigured} />
    }
  }

  const list = (
    <div className="space-y-1.5">
      {allowed.map(key => {
        const { icon: Icon, titleKey, descKey } = SECTION_META[key]
        const isActive = active === key
        return (
          <button
            key={key}
            type="button"
            onClick={() => select(key)}
            className={cn(
              'w-full flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors min-h-[56px]',
              isActive
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 bg-white hover:border-blue-300'
            )}
          >
            <span className={cn(
              'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
              isActive ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'
            )}>
              <Icon className="w-4.5 h-4.5" />
            </span>
            <span className="flex-1 min-w-0">
              <span className={cn('block text-sm font-semibold truncate', isActive ? 'text-blue-700' : 'text-gray-900')}>
                {t(titleKey)}
              </span>
              <span className="block text-xs text-gray-500 truncate">{t(descKey)}</span>
            </span>
            <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 lg:hidden" />
          </button>
        )
      })}
    </div>
  )

  const detail = active && (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3 min-w-0">
      <div className="flex items-start gap-2">
        {/* Mobile-only back — desktop keeps the master rail visible, so
            "getting out" is just clicking another section. */}
        <button
          type="button"
          onClick={() => select(null)}
          aria-label={t('common.back', '返回')}
          className="lg:hidden -ml-1 p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 shrink-0"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <SettingsSectionHeader
          titleKey={SECTION_META[active].titleKey}
          descKey={SECTION_META[active].descKey}
        />
      </div>
      {renderSection(active)}
    </div>
  )

  return (
    <>
      {/* Phone: list OR detail (detail replaces the list, back returns).
          Desktop: persistent master rail + detail pane side by side. */}
      <div className="lg:hidden">
        {active ? detail : list}
      </div>
      <div className="hidden lg:grid lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-5 lg:items-start">
        <div className="lg:sticky lg:top-16">{list}</div>
        {detail ?? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 flex items-center justify-center min-h-[240px]">
            <p className="text-sm text-gray-400">{t('settings.pickSection', '從左側選擇要管理的項目')}</p>
          </div>
        )}
      </div>
    </>
  )
}
