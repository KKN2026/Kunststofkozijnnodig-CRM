'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getRebuTeImporterenOffertes, importeerRebuOfferte } from '@/lib/actions'
import { formatCurrency, formatDateShort } from '@/lib/utils'
import { ArrowRightLeft, Loader2, RefreshCw, Inbox, Search } from 'lucide-react'

interface RebuOfferte {
  id: string
  offertenummer: string
  onderwerp: string | null
  totaal: number
  klantNaam: string | null
  geaccepteerdOp: string
}

// Tijdelijke functie tijdens de overstap van Rebu-CRM naar KKN: offertes die
// in Rebu alsnog geaccepteerd worden, staan hier klaar om met 1 klik over te
// zetten — zodat de order/factuur op naam van KKN (nieuwe bedrijfsnaam) loopt.
// Mag weer verwijderd worden zodra Rebu definitief dicht gaat.
export function RebuAcceptatiesTab() {
  const router = useRouter()
  const [offertes, setOffertes] = useState<RebuOfferte[] | null>(null)
  const [error, setError] = useState('')
  const [laden, setLaden] = useState(false)
  const [bezigId, setBezigId] = useState<string | null>(null)
  const [succesmelding, setSuccesmelding] = useState('')
  const [zoek, setZoek] = useState('')

  async function laadLijst() {
    setLaden(true)
    setError('')
    const res = await getRebuTeImporterenOffertes()
    setLaden(false)
    if ('error' in res && res.error) {
      setError(res.error)
      setOffertes(res.offertes || [])
      return
    }
    setOffertes(res.offertes || [])
  }

  // Data ophalen bij het openen van de tab. Geen synchrone setState() direct
  // in de effect-body (react-hooks/set-state-in-effect) — "aan het laden"
  // voor de allereerste keer blijkt al uit offertes === null, dus de
  // laden-state hoeft hier niet gezet te worden (wel door de
  // "Vernieuwen"-knop, buiten een effect).
  useEffect(() => {
    let genegeerd = false
    getRebuTeImporterenOffertes().then(res => {
      if (genegeerd) return
      if ('error' in res && res.error) setError(res.error)
      setOffertes(res.offertes || [])
    })
    return () => { genegeerd = true }
  }, [])

  async function handleOverzetten(offerte: RebuOfferte) {
    setBezigId(offerte.id)
    setSuccesmelding('')
    const res = await importeerRebuOfferte(offerte.id)
    setBezigId(null)
    if (res.error) {
      setError(res.error)
      return
    }
    setSuccesmelding(`Offerte ${res.offertenummer} staat nu in KKN — order is aangemaakt.`)
    setOffertes(prev => (prev || []).filter(o => o.id !== offerte.id))
    router.refresh()
  }

  const zoekLc = zoek.trim().toLowerCase()
  const gefilterd = (offertes || []).filter(o => !zoekLc || [o.offertenummer, o.klantNaam, o.onderwerp].some(v => v?.toLowerCase().includes(zoekLc)))

  return (
    <div>
      <div className="flex items-start justify-between mb-4 gap-4">
        <p className="text-sm text-gray-500">
          Offertes die in Rebu-CRM alsnog door de klant geaccepteerd worden, verschijnen hier. Zet ze met één
          klik over naar KKN zodat de order en factuur op naam van KKN (de nieuwe bedrijfsnaam) komen te staan.
        </p>
        <Button variant="secondary" size="sm" onClick={laadLijst} disabled={laden}>
          {laden ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Vernieuwen
        </Button>
      </div>

      {succesmelding && <div className="bg-green-50 text-green-700 text-sm p-3 rounded-md mb-4">{succesmelding}</div>}
      {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4">{error}</div>}

      {offertes && offertes.length > 0 && (
        <div className="relative mb-3 max-w-sm">
          <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            placeholder="Zoek op klant, offertenummer of onderwerp…"
            value={zoek}
            onChange={e => setZoek(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {offertes === null ? (
        <Card><CardContent className="py-10 text-center text-sm text-gray-400">Bezig met laden…</CardContent></Card>
      ) : offertes.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Inbox className="h-8 w-8 text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Geen openstaande Rebu-acceptaties — niets om over te zetten.</p>
          </CardContent>
        </Card>
      ) : gefilterd.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-gray-400">Niets gevonden voor &quot;{zoek}&quot;.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-gray-500">
                    <th className="px-4 py-2.5 font-medium">Offertenummer</th>
                    <th className="px-4 py-2.5 font-medium">Klant</th>
                    <th className="px-4 py-2.5 font-medium">Onderwerp</th>
                    <th className="px-4 py-2.5 font-medium text-right">Bedrag</th>
                    <th className="px-4 py-2.5 font-medium">Geaccepteerd op</th>
                    <th className="px-4 py-2.5 font-medium text-right">Actie</th>
                  </tr>
                </thead>
                <tbody>
                  {gefilterd.map(o => (
                    <tr key={o.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-4 py-2.5 font-mono text-xs">{o.offertenummer}</td>
                      <td className="px-4 py-2.5">{o.klantNaam || '-'}</td>
                      <td className="px-4 py-2.5 text-gray-500 truncate max-w-[220px]">{o.onderwerp || '-'}</td>
                      <td className="px-4 py-2.5 text-right">{formatCurrency(o.totaal || 0)}</td>
                      <td className="px-4 py-2.5 text-gray-500">{formatDateShort(o.geaccepteerdOp)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <Button size="sm" onClick={() => handleOverzetten(o)} disabled={bezigId === o.id}>
                          {bezigId === o.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRightLeft className="h-3.5 w-3.5" />}
                          Overzetten naar KKN
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-gray-400 mt-3">
        Na overzetten vind je de offerte terug onder <Link href="/offertes" className="text-primary underline">Offertes &amp; Orders</Link>.
      </p>
    </div>
  )
}
