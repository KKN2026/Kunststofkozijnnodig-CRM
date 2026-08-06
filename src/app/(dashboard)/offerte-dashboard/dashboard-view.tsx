'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { HerkomstBadge, herkomstLabels } from '@/components/ui/herkomst-badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ArrowRight, ArrowLeft, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react'
import type { OfferteDashboardRij } from '@/lib/actions'

// Zelfde stoplicht als in het logboek: groen = akkoord, geel = openstaand,
// rood = afgewezen.
const statusStoplicht: Record<string, { label: string; dot: string; chip: string }> = {
  geaccepteerd: { label: 'Akkoord', dot: 'bg-green-500', chip: 'bg-green-50 text-green-700 border-green-200' },
  verzonden: { label: 'Openstaand', dot: 'bg-amber-400', chip: 'bg-amber-50 text-amber-700 border-amber-200' },
  afgewezen: { label: 'Afgewezen', dot: 'bg-red-500', chip: 'bg-red-50 text-red-700 border-red-200' },
}

type Periode = '30' | '90' | 'jaar'

const periodeLabels: Record<Periode, string> = {
  '30': 'Laatste 30 dagen',
  '90': 'Laatste 90 dagen',
  jaar: 'Dit jaar',
}

interface Telling {
  totaal: number
  akkoord: number
  afgewezen: number
  openstaand: number
}

function tel(rijen: OfferteDashboardRij[]): Telling {
  const t: Telling = { totaal: rijen.length, akkoord: 0, afgewezen: 0, openstaand: 0 }
  for (const r of rijen) {
    if (r.status === 'geaccepteerd') t.akkoord++
    else if (r.status === 'afgewezen') t.afgewezen++
    else t.openstaand++
  }
  return t
}

// Conversie = akkoord als aandeel van wat beslist is (akkoord + afgewezen).
// Openstaande offertes tellen niet mee: daar is nog niets over te zeggen.
function conversie(t: Telling): number | null {
  const beslist = t.akkoord + t.afgewezen
  return beslist > 0 ? Math.round((t.akkoord / beslist) * 100) : null
}

export function OfferteDashboardView({ rijen, verkopers, vasteVerkoper }: {
  rijen: OfferteDashboardRij[]
  verkopers: { id: string; naam: string }[]
  /** Gezet op de persoonlijke pagina: alle cijfers gaan alleen over deze verkoper. */
  vasteVerkoper?: { id: string; naam: string }
}) {
  const router = useRouter()
  const [periode, setPeriode] = useState<Periode>('90')
  const [filterHerkomst, setFilterHerkomst] = useState<string>('alle')
  const [filterVerkoper, setFilterVerkoper] = useState<string>('alle')

  // Status volgt de verkoopkans live; ververs op de achtergrond mee.
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 30_000)
    return () => clearInterval(t)
  }, [router])

  const heeftOnbekendeHerkomst = useMemo(() => rijen.some(r => !r.herkomst), [rijen])

  // Grens van de gekozen periode plus een even lang venster ervoor, zodat we
  // de conversie kunnen vergelijken met de vorige periode.
  const { vanaf, vorigeVanaf } = useMemo(() => {
    const nu = Date.now()
    const dag = 24 * 60 * 60 * 1000
    if (periode === 'jaar') {
      const start = new Date(new Date().getFullYear(), 0, 1).getTime()
      return { vanaf: start, vorigeVanaf: start - (nu - start || dag) }
    }
    const dagen = periode === '30' ? 30 : 90
    return { vanaf: nu - dagen * dag, vorigeVanaf: nu - 2 * dagen * dag }
  }, [periode])

  const matchtFilters = (r: OfferteDashboardRij) =>
    (filterHerkomst === 'alle' || (filterHerkomst === 'onbekend' ? !r.herkomst : r.herkomst === filterHerkomst))
    && (vasteVerkoper ? r.verstuurdDoorId === vasteVerkoper.id : (filterVerkoper === 'alle' || r.verstuurdDoorId === filterVerkoper))

  const huidig = useMemo(
    () => rijen.filter(r => matchtFilters(r) && r.verstuurdOp && new Date(r.verstuurdOp).getTime() >= vanaf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rijen, filterHerkomst, filterVerkoper, vanaf, vasteVerkoper],
  )
  const vorige = useMemo(
    () => rijen.filter(r => {
      if (!matchtFilters(r) || !r.verstuurdOp) return false
      const t = new Date(r.verstuurdOp).getTime()
      return t >= vorigeVanaf && t < vanaf
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rijen, filterHerkomst, filterVerkoper, vanaf, vorigeVanaf, vasteVerkoper],
  )

  const telling = useMemo(() => tel(huidig), [huidig])
  const conv = conversie(telling)
  const vorigeConv = conversie(tel(vorige))
  const delta = conv !== null && vorigeConv !== null ? conv - vorigeConv : null

  // Gemiddelde doorlooptijd van versturen tot beslissing, in dagen.
  const doorlooptijd = useMemo(() => {
    const duren = huidig
      .filter(r => r.beslistOp && r.verstuurdOp)
      .map(r => (new Date(r.beslistOp!).getTime() - new Date(r.verstuurdOp!).getTime()) / (24 * 60 * 60 * 1000))
      .filter(d => d >= 0)
    if (duren.length === 0) return null
    return duren.reduce((a, b) => a + b, 0) / duren.length
  }, [huidig])

  const perVerkoper = useMemo(() => {
    if (vasteVerkoper) return []
    return verkopers
      .map(v => ({ ...v, telling: tel(huidig.filter(r => r.verstuurdDoorId === v.id)) }))
      .filter(v => v.telling.totaal > 0)
      .sort((a, b) => b.telling.totaal - a.telling.totaal)
  }, [huidig, verkopers, vasteVerkoper])

  const perHerkomst = useMemo(() => {
    const sleutels = [...Object.keys(herkomstLabels), ...(heeftOnbekendeHerkomst ? ['onbekend'] : [])]
    return sleutels
      .map(key => {
        const t = tel(huidig.filter(r => (key === 'onbekend' ? !r.herkomst : r.herkomst === key)))
        return { key, label: key === 'onbekend' ? 'Onbekend' : herkomstLabels[key].tekst, telling: t, conversie: conversie(t) }
      })
      .filter(h => h.telling.totaal > 0)
      .sort((a, b) => (b.conversie ?? -1) - (a.conversie ?? -1))
  }, [huidig, heeftOnbekendeHerkomst])

  const columns: ColumnDef<OfferteDashboardRij, unknown>[] = [
    {
      id: 'verstuurd', header: 'Verstuurd',
      accessorFn: r => r.verstuurdOp || '',
      cell: ({ getValue }) => { const v = getValue() as string; return v ? formatDate(v) : '-' },
    },
    ...(vasteVerkoper ? [] : [{
      id: 'door', header: 'Door',
      accessorFn: (r: OfferteDashboardRij) => r.verstuurdDoorNaam || '—',
    } satisfies ColumnDef<OfferteDashboardRij, unknown>]),
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

  const pill = (actief: boolean) =>
    `px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${actief ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`

  const segment = (aantal: number, totaal: number, kleur: string) => {
    if (aantal === 0 || totaal === 0) return null
    const pct = (aantal / totaal) * 100
    return (
      <div className={`${kleur} h-full flex items-center justify-center text-xs font-semibold text-white`} style={{ width: `${pct}%` }}>
        {pct >= 8 ? aantal : ''}
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title={vasteVerkoper ? `Offertes van ${vasteVerkoper.naam}` : 'Offerte-dashboard'}
        description={vasteVerkoper
          ? 'Alle offertes die deze verkoper verstuurde, met actuele status'
          : 'Conversie per verkoper en per afkomst — status beweegt live mee met de verkoopkans'}
        actions={
          <div className="flex items-center gap-2">
            {vasteVerkoper && (
              <Link href="/offerte-dashboard" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200">
                <ArrowLeft className="h-3.5 w-3.5" />
                Dashboard
              </Link>
            )}
            <button onClick={() => router.refresh()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200" title="Vernieuwt automatisch elke 30 seconden">
              <RefreshCw className="h-3.5 w-3.5" />
              Vernieuwen
            </button>
          </div>
        }
      />

      {/* Filters: werken direct door in alle onderstaande cijfers */}
      <div className="mb-5 flex items-center gap-2 flex-wrap">
        {!vasteVerkoper && verkopers.length > 0 && (
          <>
            <span className="text-xs text-gray-400 uppercase tracking-wide">Verstuurd door</span>
            <button onClick={() => setFilterVerkoper('alle')} className={pill(filterVerkoper === 'alle')}>Alle</button>
            {verkopers.map(v => (
              <button key={v.id} onClick={() => setFilterVerkoper(v.id)} className={pill(filterVerkoper === v.id)}>{v.naam}</button>
            ))}
          </>
        )}
        <span className="text-xs text-gray-400 uppercase tracking-wide ml-2">Afkomst</span>
        <button onClick={() => setFilterHerkomst('alle')} className={pill(filterHerkomst === 'alle')}>Alle</button>
        {Object.entries(herkomstLabels).map(([key, l]) => (
          <button key={key} onClick={() => setFilterHerkomst(key)} className={pill(filterHerkomst === key)}>{l.tekst}</button>
        ))}
        {heeftOnbekendeHerkomst && (
          <button onClick={() => setFilterHerkomst('onbekend')} className={pill(filterHerkomst === 'onbekend')}>Onbekend</button>
        )}
        <span className="text-xs text-gray-400 uppercase tracking-wide ml-2">Periode</span>
        {(Object.keys(periodeLabels) as Periode[]).map(p => (
          <button key={p} onClick={() => setPeriode(p)} className={pill(periode === p)}>{periodeLabels[p]}</button>
        ))}
      </div>

      {/* KPI-kaarten */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent>
            <p className="text-sm text-gray-500">Offertes verstuurd</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{telling.totaal}</p>
            <p className="text-xs text-gray-400 mt-1">{periodeLabels[periode]}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-gray-500">Conversie (akkoord / beslist)</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{conv !== null ? `${conv}%` : '—'}</p>
            {delta !== null ? (
              <p className={`text-xs font-medium mt-1 inline-flex items-center gap-1 ${delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {delta >= 0 ? '+' : ''}{delta} pt t.o.v. vorige periode
              </p>
            ) : (
              <p className="text-xs text-gray-400 mt-1">Nog niets beslist{vorigeConv === null ? ' in de vorige periode' : ''}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-gray-500">Nog openstaand</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{telling.openstaand}</p>
            <p className="text-xs text-gray-400 mt-1">Wacht op reactie klant</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-gray-500">Gem. doorlooptijd tot beslissing</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">
              {doorlooptijd !== null ? `${doorlooptijd.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} dgn` : '—'}
            </p>
            <p className="text-xs text-gray-400 mt-1">Vanaf verzenddatum</p>
          </CardContent>
        </Card>
      </div>

      {/* Conversie per verkoper + per afkomst */}
      <div className={`grid grid-cols-1 ${vasteVerkoper ? '' : 'xl:grid-cols-2'} gap-4 mb-6`}>
        {!vasteVerkoper && (
          <Card>
            <CardContent>
              <h2 className="font-semibold text-gray-900">Conversie per verkoper</h2>
              <p className="text-xs text-gray-500 mb-3">Status van alle offertes, automatisch bijgewerkt zodra een offerte van status wisselt</p>
              <div className="flex items-center gap-4 text-xs text-gray-600 mb-4">
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-green-500" /> Akkoord</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-red-500" /> Afgewezen</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-amber-400" /> Openstaand</span>
              </div>
              {perVerkoper.length === 0 && (
                <p className="text-sm text-gray-500 py-4">Geen verstuurde offertes in deze periode</p>
              )}
              <div className="space-y-5">
                {perVerkoper.map(v => {
                  const c = conversie(v.telling)
                  const beslist = v.telling.akkoord + v.telling.afgewezen
                  return (
                    <div key={v.id}>
                      <div className="flex items-center justify-between mb-1">
                        <Link href={`/offerte-dashboard/${v.id}`} className="font-medium text-gray-900 hover:text-primary hover:underline">
                          {v.naam}
                        </Link>
                        <span className="text-xs text-gray-500">{v.telling.totaal} offertes</span>
                      </div>
                      <div className="flex h-7 rounded-md overflow-hidden bg-gray-100">
                        {segment(v.telling.akkoord, v.telling.totaal, 'bg-green-500')}
                        {segment(v.telling.afgewezen, v.telling.totaal, 'bg-red-500')}
                        {segment(v.telling.openstaand, v.telling.totaal, 'bg-amber-400')}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {c !== null
                          ? <>Conversie: <span className="font-semibold text-gray-700">{c}% akkoord</span> van beslist ({v.telling.akkoord} van {beslist})</>
                          : 'Nog niets beslist'}
                      </p>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent>
            <h2 className="font-semibold text-gray-900">Conversie per afkomst</h2>
            <p className="text-xs text-gray-500 mb-4">% akkoord van beslist, gesorteerd van hoog naar laag</p>
            {perHerkomst.length === 0 && (
              <p className="text-sm text-gray-500 py-4">Geen verstuurde offertes in deze periode</p>
            )}
            <div className="space-y-4">
              {perHerkomst.map(h => (
                <div key={h.key} className="flex items-center gap-3">
                  <div className="w-28 shrink-0">
                    <p className="text-sm font-medium text-gray-900">{h.label}</p>
                    <p className="text-xs text-gray-400">n = {h.telling.totaal}</p>
                  </div>
                  <div className="flex-1 h-4 rounded-full bg-primary/10 overflow-hidden">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${h.conversie ?? 0}%` }} />
                  </div>
                  <span className="w-12 text-right text-sm font-semibold text-gray-900">
                    {h.conversie !== null ? `${h.conversie}%` : '—'}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Statusverloop */}
      <Card className="mb-6">
        <CardContent>
          <h2 className="font-semibold text-gray-900">Statusverloop (automatisch bijgewerkt)</h2>
          <p className="text-xs text-gray-500 mb-4">Elke offerte beweegt live mee met de status die in het CRM wordt gezet</p>
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { label: 'Verstuurd', aantal: telling.totaal, klasse: 'bg-gray-50 border-gray-200 text-gray-900' },
              { label: 'Openstaand', aantal: telling.openstaand, klasse: 'bg-amber-50 border-amber-200 text-amber-800' },
              { label: 'Akkoord', aantal: telling.akkoord, klasse: 'bg-green-50 border-green-200 text-green-800' },
              { label: 'Afgewezen', aantal: telling.afgewezen, klasse: 'bg-red-50 border-red-200 text-red-800' },
            ].map((stap, i) => (
              <div key={stap.label} className="flex items-center gap-2 flex-1 min-w-[140px]">
                {i > 0 && <ArrowRight className="h-4 w-4 text-gray-300 shrink-0" />}
                <div className={`flex-1 border rounded-lg py-3 text-center ${stap.klasse}`}>
                  <p className="text-2xl font-bold">{stap.aantal}</p>
                  <p className="text-[11px] uppercase tracking-wide opacity-70">{stap.label}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Offertes in de gekozen periode */}
      <h2 className="font-semibold text-gray-900 mb-1">{vasteVerkoper ? 'Verstuurde offertes' : 'Offertes in deze periode'}</h2>
      <p className="text-xs text-gray-500 mb-3">Status-badge synchroniseert automatisch — geen handmatige invoer nodig</p>
      <DataTable
        columns={columns}
        data={huidig}
        searchPlaceholder="Zoek offerte, klant of project..."
        onRowClick={r => router.push(`/offertes/${r.id}`)}
      />
    </div>
  )
}
