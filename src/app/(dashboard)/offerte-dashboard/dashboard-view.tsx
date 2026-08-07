'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { HerkomstBadge, herkomstLabels } from '@/components/ui/herkomst-badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ArrowRight, ArrowLeft, FileDown, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react'
import { setOfferteVerkoper, type OfferteDashboardRij } from '@/lib/actions'
import {
  type DashboardPeriode as Periode, dashboardPeriodeLabels as periodeLabels,
  telStatussen as tel, conversiePct as conversie, periodeVenster, matchtHerkomst,
  gemiddeldeDoorlooptijdDagen,
} from '@/lib/offerte-dashboard-data'

// Zelfde stoplicht als in het logboek: groen = akkoord, geel = openstaand,
// rood = afgewezen.
const statusStoplicht: Record<string, { label: string; dot: string; chip: string }> = {
  geaccepteerd: { label: 'Akkoord', dot: 'bg-green-500', chip: 'bg-green-50 text-green-700 border-green-200' },
  verzonden: { label: 'Openstaand', dot: 'bg-amber-400', chip: 'bg-amber-50 text-amber-700 border-amber-200' },
  afgewezen: { label: 'Afgewezen', dot: 'bg-red-500', chip: 'bg-red-50 text-red-700 border-red-200' },
}

// Statusfilter voor de offertelijst onderaan. 'beslist' = akkoord + afgewezen
// (de offertes waar de conversie en doorlooptijd over gaan).
type StatusFilter = 'alle' | 'geaccepteerd' | 'verzonden' | 'afgewezen' | 'beslist'

const statusFilterLabels: Record<StatusFilter, string> = {
  alle: 'Alle',
  geaccepteerd: 'Akkoord',
  verzonden: 'Openstaand',
  afgewezen: 'Afgewezen',
  beslist: 'Beslist',
}

export function OfferteDashboardView({ rijen, verkopers, toewijsbaar = [], vasteVerkoper }: {
  rijen: OfferteDashboardRij[]
  verkopers: { id: string; naam: string }[]
  /** Profielen waar een offerte op naam gezet kan worden; leeg = geen rechten. */
  toewijsbaar?: { id: string; naam: string }[]
  /** Gezet op de persoonlijke pagina: alle cijfers gaan alleen over deze verkoper. */
  vasteVerkoper?: { id: string; naam: string }
}) {
  const router = useRouter()
  const [periode, setPeriode] = useState<Periode>('90')
  const [filterHerkomst, setFilterHerkomst] = useState<string>('alle')
  const [filterVerkoper, setFilterVerkoper] = useState<string>('alle')
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('alle')
  const [, startTransition] = useTransition()

  const wijzigVerkoper = (offerteId: string, verkoperId: string | null) => {
    startTransition(async () => {
      await setOfferteVerkoper(offerteId, verkoperId)
      router.refresh()
    })
  }

  // Alles op het dashboard is aanklikbaar en filtert de offertelijst onderaan:
  // KPI-kaarten en statusverloop op status, balksegmenten op verkoper + status,
  // afkomst-balken op herkomst. Na een klik scrollen we naar de lijst zodat
  // het effect direct zichtbaar is.
  const tabelRef = useRef<HTMLDivElement>(null)
  const gaNaarLijst = (status: StatusFilter) => {
    setFilterStatus(status)
    tabelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const klikSegment = (verkoperId: string, status: StatusFilter) => {
    if (!vasteVerkoper) setFilterVerkoper(verkoperId)
    gaNaarLijst(status)
  }

  // Status volgt de verkoopkans live; ververs op de achtergrond mee.
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 30_000)
    return () => clearInterval(t)
  }, [router])

  const heeftOnbekendeHerkomst = useMemo(() => rijen.some(r => !r.herkomst), [rijen])

  // Grens van de gekozen periode plus een even lang venster ervoor, zodat we
  // de conversie kunnen vergelijken met de vorige periode.
  const { vanaf, vorigeVanaf } = useMemo(() => periodeVenster(periode), [periode])

  const matchtFilters = (r: OfferteDashboardRij) =>
    matchtHerkomst(r, filterHerkomst)
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
  const doorlooptijd = useMemo(() => gemiddeldeDoorlooptijdDagen(huidig), [huidig])

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

  // Het statusfilter werkt alleen op de lijst onderaan; de kaarten en
  // grafieken blijven over de hele periode gaan, anders klopt de conversie
  // niet meer zodra je op 'Openstaand' klikt.
  const tabelRijen = useMemo(() => {
    if (filterStatus === 'alle') return huidig
    if (filterStatus === 'beslist') return huidig.filter(r => r.status === 'geaccepteerd' || r.status === 'afgewezen')
    return huidig.filter(r => r.status === filterStatus)
  }, [huidig, filterStatus])

  const columns: ColumnDef<OfferteDashboardRij, unknown>[] = [
    {
      id: 'verstuurd', header: 'Verstuurd',
      accessorFn: r => r.verstuurdOp || '',
      cell: ({ getValue }) => { const v = getValue() as string; return v ? formatDate(v) : '-' },
    },
    // Admins kunnen een offerte hier direct op naam van een (andere) verkoper
    // zetten — bv. verstuurd via het gedeelde account, maar eigenlijk van Nick.
    ...(vasteVerkoper && toewijsbaar.length === 0 ? [] : [{
      id: 'door', header: 'Door',
      accessorFn: (r: OfferteDashboardRij) => r.verstuurdDoorNaam || '—',
      cell: ({ row }: { row: { original: OfferteDashboardRij } }) => {
        if (toewijsbaar.length === 0) return row.original.verstuurdDoorNaam || '—'
        return (
          <select
            value={row.original.verstuurdDoorId || ''}
            onClick={e => e.stopPropagation()}
            onChange={e => wijzigVerkoper(row.original.id, e.target.value || null)}
            title="Zet deze offerte op naam van een andere verkoper"
            className="text-sm text-gray-900 border border-transparent hover:border-gray-300 rounded-md bg-transparent py-0.5 pr-1 cursor-pointer"
          >
            {!row.original.verstuurdDoorId && <option value="">—</option>}
            {toewijsbaar.map(t => <option key={t.id} value={t.id}>{t.naam}</option>)}
          </select>
        )
      },
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
          {row.original.relatieId ? (
            <Link
              href={`/relatiebeheer/${row.original.relatieId}`}
              onClick={e => e.stopPropagation()}
              className="hover:text-primary hover:underline"
              title="Open de klantkaart"
            >
              {row.original.klant || '-'}
            </Link>
          ) : (row.original.klant || '-')}
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

  const segment = (aantal: number, totaal: number, kleur: string, label: string, onClick: () => void) => {
    if (aantal === 0 || totaal === 0) return null
    const pct = (aantal / totaal) * 100
    return (
      <button
        type="button"
        onClick={onClick}
        title={`${label}: ${aantal} — klik om deze offertes te bekijken`}
        className={`${kleur} h-full flex items-center justify-center text-xs font-semibold text-white cursor-pointer hover:opacity-85 transition-opacity`}
        style={{ width: `${pct}%` }}
      >
        {pct >= 8 ? aantal : ''}
      </button>
    )
  }

  const klikbareKaart = 'cursor-pointer hover:border-primary/40 hover:shadow transition-all text-left w-full'

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
            {/* Rapport volgt de actieve filters: je downloadt wat je ziet */}
            <a
              href={`/api/pdf/offerte-dashboard?periode=${periode}&herkomst=${filterHerkomst}&verkoper=${vasteVerkoper ? vasteVerkoper.id : filterVerkoper}`}
              title="Download dit overzicht als PDF (met de actieve filters)"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-primary rounded-md hover:bg-primary/90"
            >
              <FileDown className="h-3.5 w-3.5" />
              Download PDF
            </a>
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

      {/* KPI-kaarten — klikken filtert de offertelijst onderaan */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className={klikbareKaart} role="button" tabIndex={0} title="Bekijk alle offertes in deze periode"
          onClick={() => gaNaarLijst('alle')} onKeyDown={e => { if (e.key === 'Enter') gaNaarLijst('alle') }}>
          <CardContent>
            <p className="text-sm text-gray-500">Offertes verstuurd</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{telling.totaal}</p>
            <p className="text-xs text-gray-400 mt-1">{periodeLabels[periode]}</p>
          </CardContent>
        </Card>
        <Card className={klikbareKaart} role="button" tabIndex={0} title="Bekijk de geaccepteerde offertes"
          onClick={() => gaNaarLijst('geaccepteerd')} onKeyDown={e => { if (e.key === 'Enter') gaNaarLijst('geaccepteerd') }}>
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
        <Card className={klikbareKaart} role="button" tabIndex={0} title="Bekijk de openstaande offertes"
          onClick={() => gaNaarLijst('verzonden')} onKeyDown={e => { if (e.key === 'Enter') gaNaarLijst('verzonden') }}>
          <CardContent>
            <p className="text-sm text-gray-500">Nog openstaand</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{telling.openstaand}</p>
            <p className="text-xs text-gray-400 mt-1">Wacht op reactie klant</p>
          </CardContent>
        </Card>
        <Card className={klikbareKaart} role="button" tabIndex={0} title="Bekijk de besliste offertes (akkoord + afgewezen)"
          onClick={() => gaNaarLijst('beslist')} onKeyDown={e => { if (e.key === 'Enter') gaNaarLijst('beslist') }}>
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
                        <Link href={`/offerte-dashboard/${v.id}`} title={`Open de pagina van ${v.naam}`} className="font-medium text-gray-900 hover:text-primary hover:underline">
                          {v.naam}
                        </Link>
                        <button type="button" onClick={() => klikSegment(v.id, 'alle')} title={`Bekijk alle offertes van ${v.naam}`} className="text-xs text-gray-500 hover:text-primary hover:underline cursor-pointer">
                          {v.telling.totaal} offertes
                        </button>
                      </div>
                      <div className="flex h-7 rounded-md overflow-hidden bg-gray-100">
                        {segment(v.telling.akkoord, v.telling.totaal, 'bg-green-500', `Akkoord bij ${v.naam}`, () => klikSegment(v.id, 'geaccepteerd'))}
                        {segment(v.telling.afgewezen, v.telling.totaal, 'bg-red-500', `Afgewezen bij ${v.naam}`, () => klikSegment(v.id, 'afgewezen'))}
                        {segment(v.telling.openstaand, v.telling.totaal, 'bg-amber-400', `Openstaand bij ${v.naam}`, () => klikSegment(v.id, 'verzonden'))}
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
            <div className="space-y-2">
              {perHerkomst.map(h => {
                const actief = filterHerkomst === h.key
                return (
                  <button
                    key={h.key}
                    type="button"
                    onClick={() => setFilterHerkomst(actief ? 'alle' : h.key)}
                    title={actief ? 'Klik om dit afkomst-filter weer uit te zetten' : `Filter alle cijfers op afkomst ${h.label}`}
                    className={`flex items-center gap-3 w-full rounded-md px-2 py-1.5 -mx-2 cursor-pointer transition-colors ${actief ? 'bg-primary/5 ring-1 ring-primary/30' : 'hover:bg-gray-50'}`}
                  >
                    <span className="w-28 shrink-0 text-left">
                      <span className="block text-sm font-medium text-gray-900">{h.label}</span>
                      <span className="block text-xs text-gray-400">n = {h.telling.totaal}</span>
                    </span>
                    <span className="flex-1 h-4 rounded-full bg-primary/10 overflow-hidden">
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${h.conversie ?? 0}%` }} />
                    </span>
                    <span className="w-12 text-right text-sm font-semibold text-gray-900">
                      {h.conversie !== null ? `${h.conversie}%` : '—'}
                    </span>
                  </button>
                )
              })}
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
            {([
              { label: 'Verstuurd', aantal: telling.totaal, status: 'alle', klasse: 'bg-gray-50 border-gray-200 text-gray-900' },
              { label: 'Openstaand', aantal: telling.openstaand, status: 'verzonden', klasse: 'bg-amber-50 border-amber-200 text-amber-800' },
              { label: 'Akkoord', aantal: telling.akkoord, status: 'geaccepteerd', klasse: 'bg-green-50 border-green-200 text-green-800' },
              { label: 'Afgewezen', aantal: telling.afgewezen, status: 'afgewezen', klasse: 'bg-red-50 border-red-200 text-red-800' },
            ] as { label: string; aantal: number; status: StatusFilter; klasse: string }[]).map((stap, i) => (
              <div key={stap.label} className="flex items-center gap-2 flex-1 min-w-[140px]">
                {i > 0 && <ArrowRight className="h-4 w-4 text-gray-300 shrink-0" />}
                <button
                  type="button"
                  onClick={() => gaNaarLijst(stap.status)}
                  title={`Bekijk deze offertes in de lijst`}
                  className={`flex-1 border rounded-lg py-3 text-center cursor-pointer hover:shadow transition-shadow ${stap.klasse}`}
                >
                  <p className="text-2xl font-bold">{stap.aantal}</p>
                  <p className="text-[11px] uppercase tracking-wide opacity-70">{stap.label}</p>
                </button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Offertes in de gekozen periode */}
      <div ref={tabelRef} className="scroll-mt-6">
        <div className="flex items-end justify-between gap-3 flex-wrap mb-3">
          <div>
            <h2 className="font-semibold text-gray-900 mb-1">{vasteVerkoper ? 'Verstuurde offertes' : 'Offertes in deze periode'}</h2>
            <p className="text-xs text-gray-500">Status-badge synchroniseert automatisch — geen handmatige invoer nodig</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {(Object.keys(statusFilterLabels) as StatusFilter[]).map(st => (
              <button key={st} onClick={() => setFilterStatus(st)} className={pill(filterStatus === st)}>
                {statusFilterLabels[st]}
              </button>
            ))}
          </div>
        </div>
        <DataTable
          columns={columns}
          data={tabelRijen}
          searchPlaceholder="Zoek offerte, klant of project..."
          onRowClick={r => router.push(`/offertes/${r.id}`)}
        />
      </div>
    </div>
  )
}
