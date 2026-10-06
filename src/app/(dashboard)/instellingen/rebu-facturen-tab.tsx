'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog } from '@/components/ui/dialog'
import { getRebuTeImporterenFacturen, importeerRebuFactuur } from '@/lib/actions'
import { formatCurrency, formatDateShort } from '@/lib/utils'
import { ArrowRightLeft, Loader2, RefreshCw, Inbox, Search, Layers } from 'lucide-react'

interface RebuFactuur {
  id: string
  factuurnummer: string
  onderwerp: string | null
  totaal: number
  klantNaam: string | null
  aangemaaktOp: string
}

// Tijdelijk tijdens de overstap van Rebu-CRM naar KKN — zie rebu-acceptaties-tab.tsx
// voor de toelichting. Dit tabblad doet hetzelfde maar dan voor concept-facturen:
// niets gaat automatisch, alleen via de knop per factuur (of "alles" in 1 keer).
// Bewust ALLEEN concepten — facturen die al verstuurd zijn vanuit Rebu
// ('verzonden'/'vervallen') blijven in Rebu, die worden daar afgehandeld/geïnd.
// mollie_payment_id/betaal_link worden bij het overzetten NOOIT overgenomen
// (die horen bij Rebu's eigen Mollie-account) — importeerRebuFactuur zet
// meteen een verse, aan KKN gekoppelde betaallink klaar.
export function RebuFacturenTab() {
  const router = useRouter()
  const [facturen, setFacturen] = useState<RebuFactuur[] | null>(null)
  const [error, setError] = useState('')
  const [laden, setLaden] = useState(false)
  const [bezigId, setBezigId] = useState<string | null>(null)
  const [succesmelding, setSuccesmelding] = useState('')
  const [zoek, setZoek] = useState('')
  const [bevestigBulk, setBevestigBulk] = useState(false)
  const [bulkBezig, setBulkBezig] = useState(false)
  const [bulkVoortgang, setBulkVoortgang] = useState<{ huidig: number; totaal: number } | null>(null)
  const [bulkResultaat, setBulkResultaat] = useState<{
    ok: string[]
    fout: { nr: string; reden: string }[]
  } | null>(null)

  async function laadLijst() {
    setLaden(true)
    setError('')
    const res = await getRebuTeImporterenFacturen()
    setLaden(false)
    if ('error' in res && res.error) {
      setError(res.error)
      setFacturen(res.facturen || [])
      return
    }
    setFacturen(res.facturen || [])
  }

  // Zie rebu-acceptaties-tab.tsx: geen synchrone setState() direct in de
  // effect-body (react-hooks/set-state-in-effect) — facturen === null is zelf
  // al de "bezig met laden"-indicator voor de eerste keer.
  useEffect(() => {
    let genegeerd = false
    getRebuTeImporterenFacturen().then(res => {
      if (genegeerd) return
      if ('error' in res && res.error) setError(res.error)
      setFacturen(res.facturen || [])
    })
    return () => { genegeerd = true }
  }, [])

  async function handleOverzetten(factuur: RebuFactuur) {
    setBezigId(factuur.id)
    setSuccesmelding('')
    const res = await importeerRebuFactuur(factuur.id)
    setBezigId(null)
    if (res.error) {
      setError(res.error)
      return
    }
    setSuccesmelding(`Factuur ${res.factuurnummer} staat nu in KKN.`)
    setFacturen(prev => (prev || []).filter(f => f.id !== factuur.id))
    router.refresh()
  }

  // Zet alle (gefilterde) facturen één voor één over — serieel, niet
  // parallel, zodat elke overdracht de normale, al-geteste server action
  // doorloopt (incl. de Mollie-betaallink-fix) en 1 mislukte factuur de rest
  // niet blokkeert. Na afloop een overzicht: niets mag stilzwijgend missen.
  async function handleAllesOverzetten() {
    setBevestigBulk(false)
    setBulkBezig(true)
    setBulkResultaat(null)
    setError('')
    const teDoen = [...gefilterd]
    const ok: string[] = []
    const fout: { nr: string; reden: string }[] = []

    for (let i = 0; i < teDoen.length; i++) {
      const f = teDoen[i]
      setBulkVoortgang({ huidig: i + 1, totaal: teDoen.length })
      const res = await importeerRebuFactuur(f.id)
      if (res.error) {
        fout.push({ nr: f.factuurnummer, reden: res.error })
      } else {
        ok.push(res.factuurnummer || f.factuurnummer)
        setFacturen(prev => (prev || []).filter(x => x.id !== f.id))
      }
    }

    setBulkVoortgang(null)
    setBulkBezig(false)
    setBulkResultaat({ ok, fout })
    router.refresh()
  }

  const zoekLc = zoek.trim().toLowerCase()
  const gefilterd = (facturen || []).filter(f => !zoekLc || [f.factuurnummer, f.klantNaam, f.onderwerp].some(v => v?.toLowerCase().includes(zoekLc)))

  return (
    <div>
      <div className="flex items-start justify-between mb-4 gap-4">
        <p className="text-sm text-gray-500">
          Concept-facturen die nog in Rebu-CRM staan, verschijnen hier. Zet ze met één klik over naar KKN
          zodat ze daar op naam van KKN (de nieuwe bedrijfsnaam) verder afgehandeld en verzonden kunnen worden.
        </p>
        <div className="flex gap-2 flex-shrink-0">
          <Button variant="secondary" size="sm" onClick={laadLijst} disabled={laden || bulkBezig}>
            {laden ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Vernieuwen
          </Button>
          {facturen && facturen.length > 0 && (
            <Button size="sm" onClick={() => setBevestigBulk(true)} disabled={bulkBezig || bezigId !== null}>
              {bulkBezig ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
              Alles overzetten ({gefilterd.length})
            </Button>
          )}
        </div>
      </div>

      <Dialog open={bevestigBulk} onClose={() => setBevestigBulk(false)} title="Alle concept-facturen overzetten?">
        <div className="p-4 space-y-3 text-sm text-gray-700">
          <p>
            Dit zet alle {gefilterd.length} {zoek ? 'gefilterde' : ''} concept-facturen hierboven één voor één
            over naar KKN (samen € {gefilterd.reduce((s, f) => s + (f.totaal || 0), 0).toLocaleString('nl-NL', { minimumFractionDigits: 2 })}).
            Elke factuur krijgt een eigen, bij KKN horende betaallink.
          </p>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-gray-100">
          <Button variant="secondary" onClick={() => setBevestigBulk(false)}>Annuleren</Button>
          <Button onClick={handleAllesOverzetten}>Ja, allemaal overzetten</Button>
        </div>
      </Dialog>

      {bulkVoortgang && (
        <div className="bg-blue-50 text-blue-700 text-sm p-3 rounded-md mb-4 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Bezig: factuur {bulkVoortgang.huidig} van {bulkVoortgang.totaal}…
        </div>
      )}

      {bulkResultaat && (
        <div className="mb-4 space-y-2">
          <div className="bg-green-50 text-green-700 text-sm p-3 rounded-md">
            {bulkResultaat.ok.length} van de {bulkResultaat.ok.length + bulkResultaat.fout.length} facturen overgezet.
          </div>
          {bulkResultaat.fout.length > 0 && (
            <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md">
              <p className="font-medium mb-1">Mislukt — deze {bulkResultaat.fout.length} controleren:</p>
              <ul className="list-disc list-inside space-y-0.5">
                {bulkResultaat.fout.map(f => <li key={f.nr}>{f.nr}: {f.reden}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {succesmelding && <div className="bg-green-50 text-green-700 text-sm p-3 rounded-md mb-4">{succesmelding}</div>}
      {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4">{error}</div>}

      {facturen && facturen.length > 0 && (
        <div className="relative mb-3 max-w-sm">
          <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            placeholder="Zoek op klant, factuurnummer of onderwerp…"
            value={zoek}
            onChange={e => setZoek(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {facturen === null ? (
        <Card><CardContent className="py-10 text-center text-sm text-gray-400">Bezig met laden…</CardContent></Card>
      ) : facturen.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Inbox className="h-8 w-8 text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Geen openstaande Rebu-concept-facturen — niets om over te zetten.</p>
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
                    <th className="px-4 py-2.5 font-medium">Factuurnummer</th>
                    <th className="px-4 py-2.5 font-medium">Klant</th>
                    <th className="px-4 py-2.5 font-medium">Onderwerp</th>
                    <th className="px-4 py-2.5 font-medium text-right">Bedrag</th>
                    <th className="px-4 py-2.5 font-medium">Aangemaakt op</th>
                    <th className="px-4 py-2.5 font-medium text-right">Actie</th>
                  </tr>
                </thead>
                <tbody>
                  {gefilterd.map(f => (
                    <tr key={f.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-4 py-2.5 font-mono text-xs">{f.factuurnummer}</td>
                      <td className="px-4 py-2.5">{f.klantNaam || '-'}</td>
                      <td className="px-4 py-2.5 text-gray-500 truncate max-w-[220px]">{f.onderwerp || '-'}</td>
                      <td className="px-4 py-2.5 text-right">{formatCurrency(f.totaal || 0)}</td>
                      <td className="px-4 py-2.5 text-gray-500">{formatDateShort(f.aangemaaktOp)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <Button size="sm" onClick={() => handleOverzetten(f)} disabled={bezigId === f.id || bulkBezig}>
                          {bezigId === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRightLeft className="h-3.5 w-3.5" />}
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
        Na overzetten vind je de factuur terug onder <Link href="/facturatie" className="text-primary underline">Facturatie</Link>.
      </p>
    </div>
  )
}
