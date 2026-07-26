'use client'

import { Check } from 'lucide-react'

// One selectable person chip. Shared by the incident assign form and the PM
// schedule form, which had byte-identical markup for this apart from the PM
// one missing aria-pressed — screen readers there couldn't tell a selected
// chip from an unselected one.
//
// Only the chip is shared, not the whole picker: the two pickers around it
// legitimately differ (the incident one adds custom-role quick-assign, a name
// search, and a confirm before clearing, because unassigning revokes a
// technician's access to a live case).
export default function AssigneeChip({
  label, selected, onClick, disabled = false,
}: {
  label: string
  selected: boolean
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
        selected
          ? 'bg-blue-600 text-white border-blue-600'
          : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
      }`}
    >
      {selected && <Check className="w-3 h-3" />}
      {label}
    </button>
  )
}
