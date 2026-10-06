'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { getRebuOpteRuimenFacturen, verwijderRebuFactuurNaOverzetten } from '@/lib/actions'
import { formatCurrency } from '@/lib/utils'
import { Trash2, Loader2, ChevronDown, ChevronUp, Layers } from 'lucide-react'

interface OpTeRuimenFactuur {
  id: string
  factuurnummer: string
  onderwerp: string | null
  totaal: number
  klantNaam: string | null
}

// Spiegelbeeld van de overzet-tabel hierboven: concept-facturen die al in KKN
// staan, maar in Rebu nog niet zijn opgeruimd. Standaard ingeklapt — dit is
// een opschoon-stap, geen primaire actie. Weigert per factuur te verwijderen
// als het bedrag niet exact overeenkomt met wat in KKN staat (zie
// verwijderRebuFactuurNaOverzetten in actions.ts).
export function RebuFacturenOpruimen() {
  const [facturen, setFacturen] = useState<OpTeRuimenFactuur[] | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [bezigId, setBezigId] = useState<string | null>(null)
  const [bevestigBulk, setBevestigBulk] = useState(false)
  const [bulkBezig, setBulkBezig] = useState(false)
  const [bulkResultaat, setBulkResultaat] = useState<{ ok: number; fout: { nr: string; reden: string }[] } | null>(null)

  useEffect(() => {
    let genegeerd = false
    getRebuOpteRuimenFacturen().then(res => {
      if (genegeerd) return
      if ('error' in res && res.error) setError(res.error)
      setFacturen(res.facturen || [])
    })
    return () => { genegeerd = true }
  }, [])

  async function handleVerwijder(factuur: OpTeRuimenFactuur) {
    setBezigId(factuur.id)
    setError('')
    const res = await verwijderRebuFactuurNaOverzetten(factuur.id)
    setBezigId(null)
    if (res.error) {
      setError(`${factuur.factuurnummer}: ${res.error}`)
      return
    }
    setFacturen(prev => (prev || []).filter(f => f.id !== factuur.id))
  }

  async function handleAllesOpruimen() {
    setBevestigBulk(false)
    setBulkBezig(true)
    setBulkResultaat(null)
    const teDoen = [...(facturen || [])]
    let ok = 0
    const fout: { nr: string; reden: string }[] = []
    for (const f of teDoen) {
      const res = await verwijderRebuFactuurNaOverzetten(f.id)
      if (res.error) {
        fout.push({ nr: f.factuurnummer, reden: res.error })
      } else {
        ok++
        setFacturen(prev => (prev || []).filter(x => x.id !== f.id))
      }
    }
    setBulkBezig(false)
    setBulkResultaat({ ok, fout })
  }

  if (!facturen || facturen.length === 0) return null

  return (
    <Card className="mt-6">
      <CardContent className="py-3 px-4">
        <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-2 text-left">
          <span className="text-sm font-medium text-gray-900">
            {facturen.length} {facturen.length === 1 ? 'factuur staat' : 'facturen staan'} al in KKN — opruimen in Rebu?
          </span>
          <Button variant="ghost" size="sm" type="button">
            {open ? <>Verbergen <ChevronUp className="h-4 w-4" /></> : <>Bekijken <ChevronDown className="h-4 w-4" /></>}
          </Button>
        </button>

        {open && (
          <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
            <p className="text-sm text-gray-500">
              Deze facturen staan al correct in KKN (bedrag gecontroleerd). Verwijderen uit Rebu is alleen voor
              overzicht daar — niet verplicht, en heeft geen effect op KKN.
            </p>

            {facturen.length > 1 && (
              <Button size="sm" variant="secondary" onClick={() => setBevestigBulk(true)} disabled={bulkBezig}>
                {bulkBezig ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
                Alles opruimen in Rebu ({facturen.length})
              </Button>
            )}

            <Dialog open={bevestigBulk} onClose={() => setBevestigBulk(false)} title="Alles opruimen in Rebu?">
              <div className="p-4 text-sm text-gray-700">
                <p>Dit verwijdert {facturen.length} facturen uit Rebu-CRM (onomkeerbaar). Ze staan al in KKN, daar verandert niets.</p>
              </div>
              <div className="flex justify-end gap-2 p-4 border-t border-gray-100">
                <Button variant="secondary" onClick={() => setBevestigBulk(false)}>Annuleren</Button>
                <Button onClick={handleAllesOpruimen}>Ja, verwijderen uit Rebu</Button>
              </div>
            </Dialog>

            {bulkResultaat && (
              <div className="space-y-2">
                <div className="bg-green-50 text-green-700 text-sm p-3 rounded-md">{bulkResultaat.ok} verwijderd uit Rebu.</div>
                {bulkResultaat.fout.length > 0 && (
                  <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md">
                    <p className="font-medium mb-1">Niet gelukt:</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      {bulkResultaat.fout.map(f => <li key={f.nr}>{f.nr}: {f.reden}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md">{error}</div>}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-gray-500">
                    <th className="px-4 py-2.5 font-medium">Factuurnummer</th>
                    <th className="px-4 py-2.5 font-medium">Klant</th>
                    <th className="px-4 py-2.5 font-medium text-right">Bedrag</th>
                    <th className="px-4 py-2.5 font-medium text-right">Actie</th>
                  </tr>
                </thead>
                <tbody>
                  {facturen.map(f => (
                    <tr key={f.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-4 py-2.5 font-mono text-xs">{f.factuurnummer}</td>
                      <td className="px-4 py-2.5">{f.klantNaam || '-'}</td>
                      <td className="px-4 py-2.5 text-right">{formatCurrency(f.totaal || 0)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <Button size="sm" variant="secondary" onClick={() => handleVerwijder(f)} disabled={bezigId === f.id || bulkBezig}>
                          {bezigId === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          Verwijderen uit Rebu
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
