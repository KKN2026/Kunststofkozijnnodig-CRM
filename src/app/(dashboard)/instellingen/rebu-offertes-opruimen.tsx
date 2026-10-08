'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { getRebuOpteRuimenOffertes, verwijderRebuOfferteNaOverzetten } from '@/lib/actions'
import { formatCurrency } from '@/lib/utils'
import { Trash2, Loader2, ChevronDown, ChevronUp, Layers } from 'lucide-react'

interface OpTeRuimenOfferte {
  id: string
  offertenummer: string
  onderwerp: string | null
  totaal: number
  klantNaam: string | null
}

// Spiegelbeeld van rebu-facturen-opruimen.tsx, maar dan voor geaccepteerde
// offertes. Standaard ingeklapt — opschonen, geen primaire actie. Een
// gekoppelde Rebu-order wordt ook verwijderd (zie verwijderRebuOfferteNaOverzetten
// in actions.ts) — die is overbodig zodra de offerte in KKN staat.
export function RebuOffertesOpruimen() {
  const [offertes, setOffertes] = useState<OpTeRuimenOfferte[] | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [bezigId, setBezigId] = useState<string | null>(null)
  const [bevestigBulk, setBevestigBulk] = useState(false)
  const [bulkBezig, setBulkBezig] = useState(false)
  const [bulkResultaat, setBulkResultaat] = useState<{ ok: number; fout: { nr: string; reden: string }[] } | null>(null)

  useEffect(() => {
    let genegeerd = false
    getRebuOpteRuimenOffertes().then(res => {
      if (genegeerd) return
      if ('error' in res && res.error) setError(res.error)
      setOffertes(res.offertes || [])
    })
    return () => { genegeerd = true }
  }, [])

  async function handleVerwijder(offerte: OpTeRuimenOfferte) {
    setBezigId(offerte.id)
    setError('')
    const res = await verwijderRebuOfferteNaOverzetten(offerte.id)
    setBezigId(null)
    if (res.error) {
      setError(`${offerte.offertenummer}: ${res.error}`)
      return
    }
    setOffertes(prev => (prev || []).filter(o => o.id !== offerte.id))
  }

  async function handleAllesOpruimen() {
    setBevestigBulk(false)
    setBulkBezig(true)
    setBulkResultaat(null)
    const teDoen = [...(offertes || [])]
    let ok = 0
    const fout: { nr: string; reden: string }[] = []
    for (const o of teDoen) {
      const res = await verwijderRebuOfferteNaOverzetten(o.id)
      if (res.error) {
        fout.push({ nr: o.offertenummer, reden: res.error })
      } else {
        ok++
        setOffertes(prev => (prev || []).filter(x => x.id !== o.id))
      }
    }
    setBulkBezig(false)
    setBulkResultaat({ ok, fout })
  }

  if (!offertes || offertes.length === 0) return null

  return (
    <Card className="mt-6">
      <CardContent className="py-3 px-4">
        <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-2 text-left">
          <span className="text-sm font-medium text-gray-900">
            {offertes.length} {offertes.length === 1 ? 'offerte staat' : 'offertes staan'} al in KKN — opruimen in Rebu?
          </span>
          <Button variant="ghost" size="sm" type="button">
            {open ? <>Verbergen <ChevronUp className="h-4 w-4" /></> : <>Bekijken <ChevronDown className="h-4 w-4" /></>}
          </Button>
        </button>

        {open && (
          <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
            <p className="text-sm text-gray-500">
              Deze offertes staan al correct in KKN (bedrag gecontroleerd). Verwijderen uit Rebu is alleen voor
              overzicht daar — heeft geen effect op KKN. Een gekoppelde Rebu-order wordt meeverwijderd.
            </p>

            {offertes.length > 1 && (
              <Button size="sm" variant="secondary" onClick={() => setBevestigBulk(true)} disabled={bulkBezig}>
                {bulkBezig ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
                Alles opruimen in Rebu ({offertes.length})
              </Button>
            )}

            <Dialog open={bevestigBulk} onClose={() => setBevestigBulk(false)} title="Alles opruimen in Rebu?">
              <div className="p-4 text-sm text-gray-700">
                <p>Dit verwijdert {offertes.length} offertes (en hun Rebu-order) uit Rebu-CRM (onomkeerbaar). Ze staan al in KKN, daar verandert niets.</p>
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
                    <th className="px-4 py-2.5 font-medium">Offertenummer</th>
                    <th className="px-4 py-2.5 font-medium">Klant</th>
                    <th className="px-4 py-2.5 font-medium text-right">Bedrag</th>
                    <th className="px-4 py-2.5 font-medium text-right">Actie</th>
                  </tr>
                </thead>
                <tbody>
                  {offertes.map(o => (
                    <tr key={o.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-4 py-2.5 font-mono text-xs">{o.offertenummer}</td>
                      <td className="px-4 py-2.5">{o.klantNaam || '-'}</td>
                      <td className="px-4 py-2.5 text-right">{formatCurrency(o.totaal || 0)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <Button size="sm" variant="secondary" onClick={() => handleVerwijder(o)} disabled={bezigId === o.id || bulkBezig}>
                          {bezigId === o.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
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
