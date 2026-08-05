'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ArrowLeft, CheckCircle2, FileText, Loader2, AlertTriangle } from 'lucide-react'
import { maakEindafrekening, type EindafrekeningRij } from '@/lib/actions'
import { useBackNav } from '@/lib/hooks/use-back-nav'

// Waarschuw vóór de klik als de cijfers verdacht zijn. Bewust mild bij een
// geschat offerte-totaal: dat is een aanname, geen hard gegeven.
function detecteerProblemen(r: EindafrekeningRij): { ernst: 'ok' | 'warn' | 'fout'; reden: string } {
  const offerte = Number(r.offerteSubtotaal || 0)
  const gefactureerd = Number(r.gefactureerdSubtotaal || 0)
  if (r.geschat) {
    return { ernst: 'warn', reden: 'Geen offerte gekoppeld — offerte-totaal is teruggerekend uit het aanbetalingspercentage. Controleer het bedrag op de concept-factuur.' }
  }
  if (offerte === 0) {
    return { ernst: 'warn', reden: 'Offerte heeft geen subtotaal — controleer eerst.' }
  }
  if (gefactureerd > offerte) {
    return { ernst: 'fout', reden: `Er is al meer gefactureerd (${formatCurrency(gefactureerd)}) dan het offerte-totaal (${formatCurrency(offerte)}). Verkeerde koppeling?` }
  }
  if (gefactureerd > 0 && gefactureerd < offerte * 0.05) {
    return { ernst: 'warn', reden: 'Aanbetaling < 5% van offerte — controleer of dit klopt.' }
  }
  return { ernst: 'ok', reden: '' }
}

const statusKleur: Record<string, string> = {
  betaald: 'bg-green-50 text-green-700 border-green-200',
  deels_betaald: 'bg-amber-50 text-amber-700 border-amber-200',
  concept: 'bg-gray-50 text-gray-500 border-gray-200',
}

export function EindafrekeningView({ rijen }: { rijen: EindafrekeningRij[] }) {
  const router = useRouter()
  const { navigateBack } = useBackNav('eindafrekening')
  const [busyKey, setBusyKey] = useState<string | null>(null)

  async function handleMaak(rij: EindafrekeningRij) {
    const p = detecteerProblemen(rij)
    let prompt = `Concept-restbetaling van ${rij.restSubtotaal != null ? formatCurrency(rij.restSubtotaal) + ' excl. BTW' : 'onbekend bedrag'} aanmaken voor ${rij.klant}?\n\nDe factuur wordt NIET verstuurd — u controleert het concept eerst.`
    if (p.ernst !== 'ok') prompt = `⚠ ${p.reden}\n\n${prompt}`
    if (!confirm(prompt)) return
    setBusyKey(rij.klusKey)
    const res = await maakEindafrekening(rij.primaireAanbetalingId)
    setBusyKey(null)
    if (res.error) { alert(res.error); return }
    if (res.factuurId) router.push(`/facturatie/${res.factuurId}`)
  }

  const columns: ColumnDef<EindafrekeningRij, unknown>[] = [
    {
      id: 'check',
      header: '',
      cell: ({ row }) => {
        const p = detecteerProblemen(row.original)
        if (p.ernst === 'ok') return null
        const cls = p.ernst === 'fout' ? 'text-red-600' : 'text-amber-600'
        return (
          <span title={p.reden} className={`inline-flex items-center ${cls}`}>
            <AlertTriangle className="h-4 w-4" />
          </span>
        )
      },
    },
    { id: 'relatie', header: 'Klant', accessorFn: (r) => r.klant },
    { id: 'onderwerp', header: 'Onderwerp', accessorFn: (r) => r.onderwerp },
    {
      id: 'datum',
      header: 'Datum',
      // Datum van de eerste deelfactuur (ISO-string, dus alfabetisch sorteren
      // is meteen chronologisch). Klik op de kolomkop om te sorteren.
      accessorFn: (r) => r.facturen[0]?.datum || '',
      cell: ({ getValue }) => {
        const v = getValue() as string
        return v ? formatDate(v) : <span className="text-gray-400 text-xs">-</span>
      },
    },
    {
      id: 'facturen',
      header: 'Deelfacturen',
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1.5">
          {row.original.facturen.map((f, i) => (
            <button
              key={f.id}
              type="button"
              onClick={(e) => { e.stopPropagation(); router.push(`/facturatie/${f.id}`) }}
              title={`${f.factuurnummer} — ${f.status}${f.datum ? ' — ' + formatDate(f.datum) : ''}`}
              className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded border hover:opacity-80 ${statusKleur[f.status] || 'bg-blue-50 text-blue-700 border-blue-200'}`}
            >
              <span className="font-medium">{i + 1}e</span>
              {formatCurrency(f.subtotaal)}
              <span className="opacity-70">· {f.status.replace('_', ' ')}</span>
            </button>
          ))}
        </div>
      ),
    },
    {
      id: 'offerte_totaal',
      header: 'Offerte totaal excl.',
      accessorFn: (r) => r.offerteSubtotaal,
      cell: ({ row }) => {
        const r = row.original
        if (r.offerteSubtotaal == null) return <span className="text-gray-400 text-xs">onbekend</span>
        return (
          <span className="inline-flex items-center gap-1.5">
            {formatCurrency(r.offerteSubtotaal)}
            {r.geschat && (
              <span title="Geen offerte gekoppeld — teruggerekend uit het aanbetalingspercentage" className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-amber-100 text-amber-700 border border-amber-200">
                geschat
              </span>
            )}
            {r.offertenummer && <span className="text-xs text-gray-400">{r.offertenummer}</span>}
          </span>
        )
      },
    },
    {
      id: 'gefactureerd',
      header: 'Gefactureerd excl.',
      accessorFn: (r) => r.gefactureerdSubtotaal,
      cell: ({ getValue }) => formatCurrency(getValue() as number),
    },
    {
      id: 'rest',
      header: 'Rest excl.',
      accessorFn: (r) => r.restSubtotaal ?? 0,
      cell: ({ row }) => {
        const r = row.original
        if (r.restSubtotaal == null) return <span className="text-gray-400 text-xs">-</span>
        return <span className="font-semibold text-gray-900">{formatCurrency(r.restSubtotaal)}</span>
      },
    },
    {
      id: 'actie',
      header: '',
      cell: ({ row }) => (
        <Button
          size="sm"
          disabled={busyKey !== null}
          onClick={(e) => { e.stopPropagation(); handleMaak(row.original) }}
        >
          {busyKey === row.original.klusKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          Maak eindafrekening
        </Button>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Eindafrekeningen"
        description={`${rijen.length} klus${rijen.length === 1 ? '' : 'sen'} met deelfacturen waarvoor nog geen eindafrekening bestaat`}
        actions={<Button variant="ghost" onClick={() => navigateBack('/facturatie')}><ArrowLeft className="h-4 w-4" />Terug</Button>}
      />
      {rijen.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-green-500" />
          <p>Alle aanbetalingen hebben een eindafrekening.</p>
        </div>
      ) : (
        <DataTable columns={columns} data={rijen} searchPlaceholder="Zoek klant of klus..." />
      )}
    </div>
  )
}
