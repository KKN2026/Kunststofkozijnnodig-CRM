'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { saveInstellingen, resetInstellingen } from '@/lib/actions'
import {
  INSTELLINGEN,
  instellingGroepen,
  standaardInstellingen,
  type InstellingDef,
  type InstellingWaarde,
  type InstellingWaarden,
} from '@/lib/instellingen'
import { Save, RotateCcw, Loader2, Lock } from 'lucide-react'

// Lijst-instellingen zijn arrays; die moeten op inhoud vergeleken worden,
// anders blijft "gewijzigd" hangen zodra je één regel typt en weer terugzet.
function zelfdeWaarde(a: InstellingWaarde, b: InstellingWaarde): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    const la = Array.isArray(a) ? a : []
    const lb = Array.isArray(b) ? b : []
    const schoon = (l: string[]) => l.map(r => r.trim().toLowerCase()).filter(Boolean)
    return JSON.stringify(schoon(la)) === JSON.stringify(schoon(lb))
  }
  return a === b
}

export function InstellingenView({
  waarden: initieel,
  magBewerken,
}: {
  waarden: InstellingWaarden
  magBewerken: boolean
}) {
  // De server stuurt altijd een complete map, maar val terug op de defaults
  // zodat een nieuwe instelling ook zonder herlaad meteen werkt.
  const [waarden, setWaarden] = useState<InstellingWaarden>({ ...standaardInstellingen(), ...initieel })
  const [opgeslagen, setOpgeslagen] = useState<InstellingWaarden>({ ...standaardInstellingen(), ...initieel })
  const [busy, setBusy] = useState(false)
  const [melding, setMelding] = useState('')
  const [fout, setFout] = useState('')

  const gewijzigd = INSTELLINGEN
    .filter(d => !zelfdeWaarde(waarden[d.sleutel], opgeslagen[d.sleutel]))
    .map(d => d.sleutel)

  function zet(sleutel: string, waarde: InstellingWaarde) {
    setWaarden(v => ({ ...v, [sleutel]: waarde }))
    setMelding(''); setFout('')
  }

  async function opslaan() {
    if (gewijzigd.length === 0) return
    setBusy(true); setMelding(''); setFout('')
    const patch: InstellingWaarden = {}
    for (const s of gewijzigd) patch[s] = waarden[s]
    const result = await saveInstellingen(patch)
    setBusy(false)
    if ('error' in result && result.error) { setFout(result.error); return }
    setOpgeslagen({ ...waarden })
    setMelding(`${gewijzigd.length} ${gewijzigd.length === 1 ? 'instelling' : 'instellingen'} opgeslagen`)
  }

  async function herstelStandaard() {
    if (!confirm('Alle instellingen terugzetten naar de standaardwaarden?')) return
    setBusy(true); setMelding(''); setFout('')
    const result = await resetInstellingen(INSTELLINGEN.map(d => d.sleutel))
    setBusy(false)
    if ('error' in result && result.error) { setFout(result.error); return }
    const std = standaardInstellingen()
    setWaarden(std)
    setOpgeslagen(std)
    setMelding('Standaardwaarden hersteld')
  }

  return (
    <div className="pb-24">
      <PageHeader
        title="Instellingen"
        description="Zet functies aan of uit en stel standaardwaarden in"
        actions={
          magBewerken ? (
            <Button variant="secondary" onClick={herstelStandaard} disabled={busy}>
              <RotateCcw className="h-4 w-4" />
              Standaard herstellen
            </Button>
          ) : null
        }
      />

      {!magBewerken && (
        <div className="mb-4 flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm p-3 rounded-md">
          <Lock className="h-4 w-4 flex-shrink-0" />
          U kunt de instellingen bekijken maar niet wijzigen. Vraag een beheerder om aanpassingen.
        </div>
      )}
      {melding && <div className="mb-4 bg-green-50 text-green-700 text-sm p-3 rounded-md">{melding}</div>}
      {fout && <div className="mb-4 bg-red-50 text-red-600 text-sm p-3 rounded-md">{fout}</div>}

      <div className="space-y-6">
        {instellingGroepen.map(groep => {
          const items = INSTELLINGEN.filter(d => d.groep === groep.key)
          if (items.length === 0) return null
          return (
            <Card key={groep.key}>
              <CardContent className="pt-6">
                <div className="mb-4">
                  <h2 className="text-base font-semibold text-gray-900">{groep.label}</h2>
                  <p className="text-sm text-gray-500 mt-0.5">{groep.uitleg}</p>
                </div>
                <div className="divide-y divide-gray-100">
                  {items.map(def => {
                    // Afhankelijke instellingen blijven zichtbaar maar worden
                    // grijs zodra de bovenliggende schakelaar uit staat.
                    const geblokkeerd = !!def.afhankelijkVan && waarden[def.afhankelijkVan] !== true
                    return (
                      <InstellingRij
                        key={def.sleutel}
                        def={def}
                        waarde={waarden[def.sleutel]}
                        onChange={v => zet(def.sleutel, v)}
                        disabled={!magBewerken || busy || geblokkeerd}
                        gewijzigd={gewijzigd.includes(def.sleutel)}
                      />
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Vaste opslaan-balk: verschijnt zodra er iets gewijzigd is */}
      {magBewerken && gewijzigd.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-gray-200 bg-white/95 backdrop-blur px-4 py-3 md:pl-64">
          <div className="flex items-center justify-between gap-4 max-w-5xl mx-auto">
            <span className="text-sm text-gray-600">
              <strong>{gewijzigd.length}</strong> {gewijzigd.length === 1 ? 'wijziging' : 'wijzigingen'} nog niet opgeslagen
            </span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setWaarden({ ...opgeslagen })} disabled={busy}>
                Ongedaan maken
              </Button>
              <Button onClick={opslaan} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Opslaan
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InstellingRij({
  def,
  waarde,
  onChange,
  disabled,
  gewijzigd,
}: {
  def: InstellingDef
  waarde: InstellingWaarde
  onChange: (v: InstellingWaarde) => void
  disabled: boolean
  gewijzigd: boolean
}) {
  return (
    <div className={`flex items-start justify-between gap-6 py-4 ${disabled ? 'opacity-50' : ''}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-900">{def.label}</p>
          {gewijzigd && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
              gewijzigd
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-1 leading-relaxed">{def.uitleg}</p>
      </div>

      <div className="flex-shrink-0 pt-0.5">
        {def.type === 'boolean' && (
          <Toggle checked={waarde === true} onChange={onChange} disabled={disabled} label={def.label} />
        )}

        {def.type === 'number' && (
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={String(waarde)}
              min={def.min}
              max={def.max}
              disabled={disabled}
              onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-24 px-2 py-1.5 text-sm text-right border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-50"
            />
            {def.eenheid && <span className="text-xs text-gray-500 w-12">{def.eenheid}</span>}
          </div>
        )}

        {def.type === 'text' && (
          <input
            type="text"
            value={String(waarde)}
            disabled={disabled}
            onChange={e => onChange(e.target.value)}
            className="w-64 px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-50"
          />
        )}

        {def.type === 'lijst' && (
          <div>
            <textarea
              value={Array.isArray(waarde) ? waarde.join('\n') : String(waarde)}
              disabled={disabled}
              rows={Math.min(12, Math.max(3, (Array.isArray(waarde) ? waarde.length : 1) + 1))}
              placeholder={def.voorbeeld}
              // Tijdens typen blijft het een tekstblok; pas bij opslaan wordt het
              // via valideerInstelling een ontdubbelde lijst.
              onChange={e => onChange(e.target.value.split('\n'))}
              className="w-72 px-2 py-1.5 text-sm font-mono border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-50"
            />
            <p className="text-[11px] text-gray-400 mt-1 text-right">
              {(Array.isArray(waarde) ? waarde.filter(r => r.trim()) : []).length} regels — één per regel
            </p>
          </div>
        )}

        {def.type === 'select' && (
          <select
            value={String(waarde)}
            disabled={disabled}
            onChange={e => onChange(e.target.value)}
            className="px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-50"
          >
            {def.opties?.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled: boolean
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed ${
        checked ? 'bg-primary' : 'bg-gray-300'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform mt-0.5 ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}
