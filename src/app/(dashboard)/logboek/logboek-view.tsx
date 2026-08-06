'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { PageHeader } from '@/components/ui/page-header'
import { HerkomstBadge, herkomstLabels } from '@/components/ui/herkomst-badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Lock, RefreshCw } from 'lucide-react'
import type { LogboekOfferteRij, LogboekActiviteit } from '@/lib/actions'

// Stoplicht zoals afgesproken: groen = akkoord, geel = openstaand,
// rood = afgewezen. Verlopen (vervangen door een nieuwere versie) is grijs.
const statusStoplicht: Record<string, { label: string; dot: string; chip: string }> = {
  geaccepteerd: { label: 'Akkoord', dot: 'bg-green-500', chip: 'bg-green-50 text-green-700 border-green-200' },
  verzonden: { label: 'Openstaand', dot: 'bg-amber-400', chip: 'bg-amber-50 text-amber-700 border-amber-200' },
  afgewezen: { label: 'Afgewezen', dot: 'bg-red-500', chip: 'bg-red-50 text-red-700 border-red-200' },
  verlopen: { label: 'Verlopen', dot: 'bg-gray-300', chip: 'bg-gray-50 text-gray-500 border-gray-200' },
}

// Leesbare omschrijvingen voor het activiteiten-tabblad.
const actieLabels: Record<string, string> = {
  'offerte.delete': 'Offerte verwijderd',
  'offerte.afgewezen': 'Offerte afgewezen',
  'offerte.geaccepteerd': 'Offerte geaccepteerd',
  'offerte.vervallen_door_acceptatie': 'Offerte vervallen (andere versie geaccepteerd)',
  'offerte.aangemaakt_uit_email': 'Offerte aangemaakt uit e-mail',
  'factuur.delete': 'Factuur verwijderd',
  'factuur.email_verzonden': 'Factuur verstuurd',
  'factuur.snelstart_sync': 'SnelStart-synchronisatie',
  'factuur.eindafrekening_aanmaken': 'Eindafrekening aangemaakt',
  'project.status_change': 'Verkoopkans van fase gewisseld',
  'project.auto_archive': 'Verkoopkans automatisch gearchiveerd',
  'project.auto_unarchive': 'Verkoopkans automatisch teruggezet',
  'relatie.merge': 'Dubbele klant samengevoegd',
}

const entiteitPad: Record<string, string> = {
  offerte: '/offertes',
  factuur: '/facturatie',
  relatie: '/relatiebeheer',
  project: '/projecten',
  taak: '/taken',
}

export function LogboekView({ rijen, activiteiten, magZien }: {
  rijen: LogboekOfferteRij[]
  activiteiten: LogboekActiviteit[]
  magZien: boolean
}) {
  const router = useRouter()
  const [tab, setTab] = useState<'offertes' | 'activiteiten'>('offertes')
  const [filterHerkomst, setFilterHerkomst] = useState<string>('alle')
  const [filterStatus, setFilterStatus] = useState<string>('alle')
  const [filterDoor, setFilterDoor] = useState<string>('alle')
  const [filterWie, setFilterWie] = useState<string>('alle')

  // "Live": ververs elke 30s zodat statuswijzigingen in de verkoopkans
  // vanzelf in het stoplicht terechtkomen zonder handmatig herladen.
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 30_000)
    return () => clearInterval(t)
  }, [router])

  const verzenders = useMemo(
    () => [...new Set(rijen.map(r => r.verstuurdDoor).filter((v): v is string => !!v))].sort(),
    [rijen],
  )
  const actoren = useMemo(
    () => [...new Set(activiteiten.map(a => a.wie))].sort(),
    [activiteiten],
  )

  const gefilterd = rijen.filter(r =>
    (filterHerkomst === 'alle' || r.herkomst === filterHerkomst)
    && (filterStatus === 'alle' || r.status === filterStatus)
    && (filterDoor === 'alle' || r.verstuurdDoor === filterDoor))

  const activiteitenGefilterd = activiteiten.filter(a => filterWie === 'alle' || a.wie === filterWie)

  const columns: ColumnDef<LogboekOfferteRij, unknown>[] = [
    {
      id: 'verstuurd', header: 'Verstuurd',
      accessorFn: r => r.verstuurdOp || '',
      cell: ({ getValue }) => { const v = getValue() as string; return v ? formatDate(v) : '-' },
    },
    { id: 'door', header: 'Door', accessorFn: r => r.verstuurdDoor || '—' },
    {
      id: 'offerte', header: 'Offerte',
      accessorFn: r => r.offertenummer,
      cell: ({ row }) => (
        <div>
          <span className="font-medium text-gray-900">{row.original.offertenummer}</span>
          <p className="text-xs text-gray-500 truncate max-w-[220px]">{row.original.projectNaam || row.original.onderwerp || ''}</p>
        </div>
      ),
    },
    {
      id: 'klant', header: 'Klant',
      accessorFn: r => r.klant || '',
      cell: ({ row }) => (
        <span className="flex items-center gap-2">
          {row.original.klant || '-'}
          <HerkomstBadge herkomst={row.original.herkomst} />
        </span>
      ),
    },
    {
      id: 'bedrag', header: 'Bedrag excl.',
      accessorFn: r => r.subtotaal,
      cell: ({ getValue }) => formatCurrency(getValue() as number),
    },
    {
      id: 'status', header: 'Status',
      accessorFn: r => r.status,
      cell: ({ getValue }) => {
        const s = statusStoplicht[getValue() as string]
        if (!s) return getValue() as string
        return (
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full border ${s.chip}`}>
            <span className={`h-2 w-2 rounded-full ${s.dot}`} />
            {s.label}
          </span>
        )
      },
    },
  ]

  if (!magZien) {
    return (
      <div>
        <PageHeader title="Logboek" />
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm p-3 rounded-md">
          <Lock className="h-4 w-4" />
          Alleen beheerders kunnen het logboek bekijken.
        </div>
      </div>
    )
  }

  const pill = (actief: boolean) =>
    `px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${actief ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`

  return (
    <div>
      <PageHeader
        title="Logboek"
        description="Wie verstuurde welke offerte, en wat elke werknemer doet"
        actions={
          <button onClick={() => router.refresh()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200" title="Vernieuwt automatisch elke 30 seconden">
            <RefreshCw className="h-3.5 w-3.5" />
            Vernieuwen
          </button>
        }
      />

      <div className="flex gap-2 mb-5">
        <button onClick={() => setTab('offertes')} className={pill(tab === 'offertes')}>Verstuurde offertes</button>
        <button onClick={() => setTab('activiteiten')} className={pill(tab === 'activiteiten')}>Alle activiteiten</button>
      </div>

      {tab === 'offertes' && (
        <>
          <div className="mb-3 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400">Herkomst:</span>
            <button onClick={() => setFilterHerkomst('alle')} className={pill(filterHerkomst === 'alle')}>Alle</button>
            {Object.entries(herkomstLabels).map(([key, l]) => (
              <button key={key} onClick={() => setFilterHerkomst(key)} className={pill(filterHerkomst === key)}>{l.tekst}</button>
            ))}
            <span className="text-xs text-gray-400 ml-3">Status:</span>
            {(['alle', 'geaccepteerd', 'verzonden', 'afgewezen'] as const).map(st => (
              <button key={st} onClick={() => setFilterStatus(st)} className={pill(filterStatus === st)}>
                {st === 'alle' ? 'Alle' : statusStoplicht[st].label}
              </button>
            ))}
            {verzenders.length > 0 && (
              <select value={filterDoor} onChange={e => setFilterDoor(e.target.value)} className="ml-3 px-2 py-1.5 text-sm border border-gray-300 rounded-md bg-white">
                <option value="alle">Iedereen</option>
                {verzenders.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            )}
          </div>
          <DataTable
            columns={columns}
            data={gefilterd}
            searchPlaceholder="Zoek offerte, klant of project..."
            onRowClick={r => router.push(`/offertes/${r.id}`)}
          />
        </>
      )}

      {tab === 'activiteiten' && (
        <>
          {actoren.length > 1 && (
            <div className="mb-3">
              <select value={filterWie} onChange={e => setFilterWie(e.target.value)} className="px-2 py-1.5 text-sm border border-gray-300 rounded-md bg-white">
                <option value="alle">Iedereen</option>
                {actoren.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          )}
          <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
            {activiteitenGefilterd.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-gray-500">Geen activiteiten gevonden</p>
            )}
            {activiteitenGefilterd.map(a => {
              const pad = a.entiteitType && a.entiteitId ? entiteitPad[a.entiteitType] : null
              const detail = (a.details?.offertenummer || a.details?.factuurnummer || a.details?.bedrijfsnaam || '') as string
              return (
                <div key={a.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                  <span className="text-xs text-gray-400 w-32 shrink-0">
                    {new Date(a.op).toLocaleString('nl-NL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="text-gray-500 w-52 shrink-0 truncate" title={a.wie}>{a.wie}</span>
                  <span className="text-gray-900 flex-1 truncate">
                    {actieLabels[a.actie] || a.actie}
                    {detail && <span className="text-gray-400"> — {detail}</span>}
                  </span>
                  {pad && (
                    <Link href={`${pad}/${a.entiteitId}`} className="text-xs text-primary hover:underline shrink-0">bekijk</Link>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
