'use client'

import { useState } from 'react'
import { AgendaView } from './agenda-view'
import { VrijeDagenView } from '../vrije-dagen/vrije-dagen-view'

// Agenda en Vrije dagen waren twee losse menu-items met een eigen pagina —
// samengevoegd tot tabbladen op één pagina (12-08-2026), zodat je vrije dagen
// ook meteen vanuit de agenda kunt aanvragen zonder van pagina te wisselen.
const TABS = [
  { key: 'agenda' as const, label: 'Agenda' },
  { key: 'vrije-dagen' as const, label: 'Vrije dagen' },
]

type AgendaViewProps = Parameters<typeof AgendaView>[0]
type VrijeDagenViewProps = Parameters<typeof VrijeDagenView>[0]

export function AgendaTabsView({
  initialTab,
  agendaProps,
  vrijeDagenProps,
}: {
  initialTab: 'agenda' | 'vrije-dagen'
  agendaProps: AgendaViewProps
  vrijeDagenProps: VrijeDagenViewProps
}) {
  const [tab, setTab] = useState<'agenda' | 'vrije-dagen'>(initialTab)

  return (
    <div>
      <div className="flex gap-2 mb-6">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm rounded-md transition-colors ${tab === t.key ? 'bg-primary text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'agenda' ? <AgendaView {...agendaProps} /> : <VrijeDagenView {...vrijeDagenProps} />}
    </div>
  )
}
