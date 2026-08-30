'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency, formatDateShort } from '@/lib/utils'
import { offerteStatussen, statusKleuren } from '@/lib/constants'
import { Plus, FileText, Download, X, Trash2, AlertTriangle, Loader2 } from 'lucide-react'
import { deleteOffertes } from '@/lib/actions'
import { Dialog } from '@/components/ui/dialog'
import { showToast } from '@/components/ui/toast'

const statusLabels: Record<string, string> = {
  concept: 'Concept', verzonden: 'Verzonden', geaccepteerd: 'Geaccepteerd',
  afgewezen: 'Afgewezen', verlopen: 'Verlopen',
}

const MAAND_NAMEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']

// Label 'YYYY-MM' → 'augustus 2026' voor de valmaand-filterbanner.
function maandLabel(valmaand: string): string {
  const [jaar, maand] = valmaand.split('-')
  const idx = parseInt(maand, 10) - 1
  return `${MAAND_NAMEN[idx] || maand} ${jaar}`
}

interface Offerte {
  id: string
  offertenummer: string
  datum: string
  status: string
  totaal: number
  subtotaal: number | null
  btw_totaal: number | null
  versie_nummer: number | null
  verwachte_valdatum: string | null
  relatie: { bedrijfsnaam: string } | null
  project: { naam: string } | null
  onderwerp: string | null
}

const columns: ColumnDef<Offerte, unknown>[] = [
  { accessorKey: 'offertenummer', header: 'Nummer' },
  {
    id: 'versie',
    header: 'Versie',
    accessorFn: (row) => row.versie_nummer || 1,
    cell: ({ getValue }) => (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
        v{getValue() as number}
      </span>
    ),
  },
  {
    accessorKey: 'datum',
    header: 'Datum',
    cell: ({ getValue }) => formatDateShort(getValue() as string),
  },
  {
    id: 'relatie',
    header: 'Relatie',
    accessorFn: (row) => row.relatie?.bedrijfsnaam || '-',
  },
  {
    id: 'project',
    header: 'Project',
    accessorFn: (row) => row.project?.naam || '-',
  },
  { accessorKey: 'onderwerp', header: 'Onderwerp' },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }) => <Badge status={getValue() as string} />,
  },
  {
    id: 'bedrag_excl',
    header: 'Bedrag excl. BTW',
    accessorFn: (row) => row.subtotaal ?? ((row.totaal || 0) - (row.btw_totaal || 0)),
    cell: ({ getValue }) => formatCurrency(getValue() as number),
  },
]

export function OfferteList({ offertes, valmaand }: { offertes: Offerte[]; valmaand?: string }) {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [verwijderDialog, setVerwijderDialog] = useState<{ ids: string[]; clear: () => void } | null>(null)
  const [verwijderBusy, setVerwijderBusy] = useState(false)

  // Valmaand-filter komt uit de doorklik op de omzet-prognosegrafiek
  // (/offertes?valmaand=YYYY-MM). Toont de offertes met verwachte valdatum in
  // die maand — precies de offertes achter die staaf.
  const maandOffertes = valmaand
    ? offertes.filter(o => (o.verwachte_valdatum || '').startsWith(valmaand))
    : offertes

  const filteredOffertes = statusFilter
    ? maandOffertes.filter(o => o.status === statusFilter)
    : maandOffertes

  // PROTOTYPE: mini-dashboard bovenaan de sectie — vergelijkbaar idee als het
  // hoofddashboard, maar dan toegespitst op offertes. Alles hieronder is
  // client-side berekend uit de al opgehaalde `offertes`-lijst, geen extra
  // server-call. "Geaccepteerd deze maand" gebruikt offerte-datum als proxy
  // voor beslisdatum (die zit niet in getOffertes()) — bij uitrol naar de
  // rest van de app kan dat vervangen worden door de nauwkeurigere
  // beslisdatum uit getOfferteDashboard().
  const nu = new Date()
  const aantalOpenstaand = offertes.filter(o => o.status === 'verzonden').length
  const geaccepteerdDezeMaand = offertes.filter(o => {
    if (o.status !== 'geaccepteerd') return false
    const d = new Date(o.datum)
    return d.getFullYear() === nu.getFullYear() && d.getMonth() === nu.getMonth()
  }).length
  const nietConcept = offertes.filter(o => o.status !== 'concept')
  const gemiddeldeWaarde = nietConcept.length > 0
    ? nietConcept.reduce((s, o) => s + (o.subtotaal ?? ((o.totaal || 0) - (o.btw_totaal || 0))), 0) / nietConcept.length
    : 0
  const beslistDitJaar = offertes.filter(o => (o.status === 'geaccepteerd' || o.status === 'afgewezen') && new Date(o.datum).getFullYear() === nu.getFullYear())
  const akkoordDitJaar = beslistDitJaar.filter(o => o.status === 'geaccepteerd').length
  const conversieDitJaar = beslistDitJaar.length > 0 ? Math.round((akkoordDitJaar / beslistDitJaar.length) * 100) : null

  async function exportXlsx() {
    if (filteredOffertes.length === 0) return
    const rows = filteredOffertes.map(o => ({
      Offertenummer: o.offertenummer,
      Versie: o.versie_nummer || 1,
      Datum: o.datum,
      Status: o.status,
      Klant: o.relatie?.bedrijfsnaam || '',
      Verkoopkans: o.project?.naam || '',
      Onderwerp: o.onderwerp || '',
      Subtotaal: o.subtotaal ?? 0,
      BTW: o.btw_totaal ?? 0,
      Totaal: o.totaal,
    }))
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Offertes')
    XLSX.writeFile(wb, `offertes-export-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div>
      <PageHeader
        title="Offertes & Orders"
        description="Beheer uw offertes en orders"
        actions={
          <div className="flex gap-2 flex-wrap">
            <Button variant="ghost" size="sm" onClick={exportXlsx} disabled={filteredOffertes.length === 0}>
              <Download className="h-3.5 w-3.5" />
              Excel
            </Button>
            <Link href="/offertes/archief">
              <Button variant="ghost">Archief</Button>
            </Link>
            <Link href="/offertes/orders">
              <Button variant="secondary">Orders bekijken</Button>
            </Link>
            <Button onClick={() => router.push('/offertes/nieuw')}>
              <Plus className="h-4 w-4" />
              Nieuwe offerte
            </Button>
          </div>
        }
      />

      {/* Mini-dashboard bovenaan de sectie. Tegels zijn klikbaar en filteren de
          tabel eronder — zelfde statusFilter-mechanisme als de pill-rij, dus
          nogmaals klikken heft het filter weer op. */}
      {offertes.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card
            role="button"
            tabIndex={0}
            onClick={() => setStatusFilter(statusFilter === 'verzonden' ? null : 'verzonden')}
            className={`cursor-pointer hover:border-primary/40 hover:shadow transition-all text-left w-full ${statusFilter === 'verzonden' ? 'border-primary/40 ring-1 ring-primary/20' : ''}`}
          >
            <CardContent>
              <p className="text-sm text-gray-500">Openstaand (verzonden)</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{aantalOpenstaand}</p>
              <p className="text-xs text-gray-400 mt-1">wacht op reactie klant</p>
            </CardContent>
          </Card>
          <Card
            role="button"
            tabIndex={0}
            onClick={() => setStatusFilter(statusFilter === 'geaccepteerd' ? null : 'geaccepteerd')}
            className={`cursor-pointer hover:border-primary/40 hover:shadow transition-all text-left w-full ${statusFilter === 'geaccepteerd' ? 'border-primary/40 ring-1 ring-primary/20' : ''}`}
          >
            <CardContent>
              <p className="text-sm text-gray-500">Geaccepteerd deze maand</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{geaccepteerdDezeMaand}</p>
              <p className="text-xs text-gray-400 mt-1">{MAAND_NAMEN[nu.getMonth()]} · klik voor alle geaccepteerde</p>
            </CardContent>
          </Card>
          <Card
            role="button"
            tabIndex={0}
            onClick={() => setStatusFilter(null)}
            className="cursor-pointer hover:border-primary/40 hover:shadow transition-all text-left w-full"
          >
            <CardContent>
              <p className="text-sm text-gray-500">Gemiddelde offertewaarde</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{formatCurrency(gemiddeldeWaarde)}</p>
              <p className="text-xs text-gray-400 mt-1">excl. BTW, niet-concept · klik voor alles</p>
            </CardContent>
          </Card>
          <Card
            role="button"
            tabIndex={0}
            onClick={() => setStatusFilter(null)}
            className="cursor-pointer hover:border-primary/40 hover:shadow transition-all text-left w-full"
          >
            <CardContent>
              <p className="text-sm text-gray-500">Conversie dit jaar</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{conversieDitJaar != null ? `${conversieDitJaar}%` : '-'}</p>
              <p className="text-xs text-gray-400 mt-1">akkoord van beslist · klik voor alles</p>
            </CardContent>
          </Card>
        </div>
      )}

      {offertes.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Geen offertes"
          description="U heeft nog geen offertes aangemaakt."
          action={
            <Button onClick={() => router.push('/offertes/nieuw')}>
              <Plus className="h-4 w-4" />
              Offerte aanmaken
            </Button>
          }
        />
      ) : (
        <>
          {valmaand && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800">
              <span>
                Offertes met verwachte valdatum in <strong>{maandLabel(valmaand)}</strong>
                <span className="text-emerald-600"> · {maandOffertes.length} st. · {formatCurrency(maandOffertes.reduce((s, o) => s + (o.subtotaal ?? ((o.totaal || 0) - (o.btw_totaal || 0))), 0))} excl. BTW</span>
              </span>
              <button
                onClick={() => { setStatusFilter(null); router.push('/offertes') }}
                className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
              >
                <X className="h-3.5 w-3.5" />
                Filter wissen
              </button>
            </div>
          )}
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              onClick={() => setStatusFilter(null)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                statusFilter === null
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Alle ({maandOffertes.length})
            </button>
            {offerteStatussen.map(status => {
              const count = maandOffertes.filter(o => o.status === status).length
              if (count === 0) return null
              return (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status === statusFilter ? null : status)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    statusFilter === status
                      ? statusKleuren[status] + ' ring-2 ring-offset-1 ring-primary/40'
                      : statusKleuren[status] + ' hover:opacity-80'
                  }`}
                >
                  {statusLabels[status] || status} ({count})
                </button>
              )
            })}
          </div>
          <DataTable
            columns={columns}
            data={filteredOffertes}
            searchPlaceholder="Zoek offerte..."
            onRowClick={(row) => router.push(`/offertes/${row.id}`)}
            selectable
            getRowId={(row) => row.id}
            bulkActions={(selectedIds, clearSelection) => (
              <button
                type="button"
                onClick={() => setVerwijderDialog({ ids: selectedIds, clear: clearSelection })}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-xs rounded-md hover:bg-red-700"
              >
                <Trash2 className="h-3 w-3" />
                Verwijderen
              </button>
            )}
            mobileCard={(o) => ({
              title: <>
                {o.offertenummer}{o.versie_nummer && o.versie_nummer > 1 ? <span className="text-gray-400 ml-1">v{o.versie_nummer}</span> : null}
                {o.onderwerp ? <span className="text-gray-500 font-normal ml-1.5">— {o.onderwerp}</span> : null}
              </>,
              subtitle: <>
                {o.relatie?.bedrijfsnaam || '—'}
                {o.project?.naam && <span className="text-gray-400"> · {o.project.naam}</span>}
              </>,
              rightTop: <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                o.status === 'geaccepteerd' ? 'bg-green-100 text-green-700'
                : o.status === 'verzonden' ? 'bg-blue-100 text-blue-700'
                : o.status === 'afgewezen' ? 'bg-red-100 text-red-700'
                : 'bg-gray-100 text-gray-600'
              }`}>{o.status}</span>,
              rightBottom: <span className="font-medium text-gray-900">{formatCurrency(o.totaal)}</span>,
            })}
          />
        </>
      )}

      <Dialog
        open={!!verwijderDialog}
        onClose={() => { if (!verwijderBusy) setVerwijderDialog(null) }}
        title={`${verwijderDialog?.ids.length || 0} ${verwijderDialog?.ids.length === 1 ? 'offerte' : 'offertes'} verwijderen`}
      >
        <div className="space-y-4">
          <div className="flex gap-3 p-3 bg-red-50 border border-red-200 rounded-md">
            <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-800">
              <p className="font-medium">Dit kan niet ongedaan gemaakt worden.</p>
              <p className="mt-1">
                Gekoppelde orders zonder factuur worden mee verwijderd. Een offerte
                waarvan de order al gefactureerd is, wordt overgeslagen — die kan
                niet zomaar weg zonder de boekhouding te raken.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2 border-t">
            <Button variant="ghost" onClick={() => setVerwijderDialog(null)} disabled={verwijderBusy}>
              Annuleren
            </Button>
            <button
              type="button"
              disabled={verwijderBusy}
              onClick={async () => {
                if (!verwijderDialog) return
                setVerwijderBusy(true)
                const result = await deleteOffertes(verwijderDialog.ids)
                setVerwijderBusy(false)
                if ('error' in result) {
                  showToast(result.error, 'error')
                  return
                }
                verwijderDialog.clear()
                setVerwijderDialog(null)
                if (result.mislukt > 0) {
                  showToast(
                    `${result.verwijderd} verwijderd, ${result.mislukt} overgeslagen (al gefactureerd: ${result.mislukteNummers.join(', ')})`,
                    'error',
                  )
                } else {
                  showToast(`${result.verwijderd} offerte${result.verwijderd === 1 ? '' : 's'} verwijderd`, 'success')
                }
                router.refresh()
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 disabled:opacity-60"
            >
              {verwijderBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Definitief verwijderen
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
