'use client'

import { Mail } from 'lucide-react'

export interface EmailContactOptie {
  naam: string
  email: string
  functie?: string | null
  isPrimair?: boolean
}

// Ontvanger-selectie voor e-mail: vink één of meer contactpersonen van de
// relatie aan en/of vul losse adressen in (komma-gescheiden). Gebruikt bij
// offerte- en factuur-versturen.
export function EmailOntvangers({
  contacten,
  geselecteerd,
  onToggle,
  extra,
  onExtraChange,
}: {
  contacten: EmailContactOptie[]
  geselecteerd: string[]
  onToggle: (email: string) => void
  extra: string
  onExtraChange: (value: string) => void
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        <Mail className="h-3.5 w-3.5 inline mr-1" />
        Aan
      </label>
      {contacten.length > 0 && (
        <div className="border border-gray-200 rounded-md divide-y divide-gray-100 mb-2">
          {contacten.map(c => (
            <label key={c.email} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors">
              <input
                type="checkbox"
                checked={geselecteerd.includes(c.email)}
                onChange={() => onToggle(c.email)}
                className="h-4 w-4 rounded border-gray-300 text-[#00a66e] focus:ring-[#00a66e]"
              />
              <span className="flex-1 min-w-0 text-sm">
                <span className="font-medium text-gray-900">{c.naam}</span>
                {c.functie && <span className="text-gray-400"> · {c.functie}</span>}
                {c.isPrimair && <span className="ml-1.5 inline-block text-[10px] font-semibold uppercase tracking-wide text-emerald-700 bg-emerald-50 rounded px-1.5 py-0.5">primair</span>}
                <span className="block text-xs text-gray-500 truncate">{c.email}</span>
              </span>
            </label>
          ))}
        </div>
      )}
      <input
        type="text"
        value={extra}
        onChange={e => onExtraChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        placeholder={contacten.length > 0 ? 'Extra e-mailadres(sen), komma-gescheiden (optioneel)' : 'E-mailadres ontvanger'}
      />
    </div>
  )
}

// Combineert aangevinkte contacten met losse extra adressen tot de definitieve
// ontvangerlijst (hoofdletterongevoelig ontdubbeld).
export function combineerOntvangers(geselecteerd: string[], extra: string): string[] {
  const extraLijst = extra.split(/[,;]/).map(e => e.trim()).filter(e => e.includes('@'))
  const seen = new Set<string>()
  const result: string[] = []
  for (const adres of [...geselecteerd, ...extraLijst]) {
    if (seen.has(adres.toLowerCase())) continue
    seen.add(adres.toLowerCase())
    result.push(adres)
  }
  return result
}
