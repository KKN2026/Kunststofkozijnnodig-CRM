import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { getOfferteDashboard } from '@/lib/actions'
import { herkomstLabels } from '@/components/ui/herkomst-badge'
import {
  type DashboardPeriode, dashboardPeriodeLabels, telStatussen, conversiePct,
  periodeVenster, matchtHerkomst, gemiddeldeDoorlooptijdDagen,
} from '@/lib/offerte-dashboard-data'
import { OfferteDashboardRapport, type RapportGroep, type RapportOfferteRij } from '@/lib/pdf/offerte-dashboard-template'

export const dynamic = 'force-dynamic'

// PDF-rapportage van het offerte-dashboard. Querystring spiegelt de filters
// van het scherm (periode / herkomst / verkoper), zodat je precies downloadt
// wat je op dat moment ziet. Rechten lopen via getOfferteDashboard: een
// niet-admin krijgt automatisch alleen de eigen offertes.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const periodeParam = url.searchParams.get('periode') || '90'
  const periode: DashboardPeriode = periodeParam === '30' || periodeParam === 'jaar' ? periodeParam : '90'
  const herkomst = url.searchParams.get('herkomst') || 'alle'
  const verkoper = url.searchParams.get('verkoper') || 'alle'

  const data = await getOfferteDashboard()
  if (!data.magZien) {
    return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
  }

  const { vanaf, vorigeVanaf } = periodeVenster(periode)
  const basis = data.rijen.filter(r =>
    matchtHerkomst(r, herkomst)
    && (verkoper === 'alle' || r.verstuurdDoorId === verkoper))
  const huidig = basis.filter(r => r.verstuurdOp && new Date(r.verstuurdOp).getTime() >= vanaf)
  const vorige = basis.filter(r => {
    if (!r.verstuurdOp) return false
    const t = new Date(r.verstuurdOp).getTime()
    return t >= vorigeVanaf && t < vanaf
  })

  const telling = telStatussen(huidig)
  const conversie = conversiePct(telling)
  const vorigeConversie = conversiePct(telStatussen(vorige))
  const delta = conversie !== null && vorigeConversie !== null ? conversie - vorigeConversie : null

  const perVerkoper = data.verkopers
    .map(v => ({ naam: v.naam, telling: telStatussen(huidig.filter(r => r.verstuurdDoorId === v.id)) }))
    .filter(v => v.telling.totaal > 0)
    .map(v => ({ ...v, conversie: conversiePct(v.telling) }))
    .sort((a, b) => b.telling.totaal - a.telling.totaal)

  const afkomstSleutels = [...Object.keys(herkomstLabels), 'onbekend']
  const perAfkomst = afkomstSleutels
    .map(key => {
      const t = telStatussen(huidig.filter(r => (key === 'onbekend' ? !r.herkomst : r.herkomst === key)))
      return { label: key === 'onbekend' ? 'Onbekend' : herkomstLabels[key].tekst, telling: t, conversie: conversiePct(t) }
    })
    .filter(h => h.telling.totaal > 0)
    .sort((a, b) => (b.conversie ?? -1) - (a.conversie ?? -1))

  const naarRij = (r: (typeof huidig)[number]): RapportOfferteRij => ({
    datum: r.verstuurdOp,
    nummer: r.offertenummer,
    klant: r.klant || '-',
    verkoper: r.verstuurdDoorNaam || '—',
    afkomst: r.herkomst ? (herkomstLabels[r.herkomst]?.tekst || r.herkomst) : '—',
    omschrijving: r.projectNaam || r.onderwerp || '',
    bedrag: r.subtotaal,
  })
  const groep = (sleutel: RapportGroep['sleutel'], titel: string, status: string): RapportGroep => {
    const rijen = huidig
      .filter(r => r.status === status)
      .sort((a, b) => (b.verstuurdOp || '').localeCompare(a.verstuurdOp || ''))
    return { sleutel, titel, rijen: rijen.map(naarRij), totaal: rijen.reduce((sum, r) => sum + r.subtotaal, 0) }
  }
  const groepen = [
    groep('akkoord', 'Akkoord', 'geaccepteerd'),
    groep('openstaand', 'Openstaand', 'verzonden'),
    groep('afgewezen', 'Afgewezen', 'afgewezen'),
  ]

  // Actieve filters leesbaar in de kop van het rapport
  const filterDelen: string[] = []
  if (verkoper !== 'alle') {
    const naam = data.verkopers.find(v => v.id === verkoper)?.naam
      || data.toewijsbaar.find(t => t.id === verkoper)?.naam
    if (naam) filterDelen.push(`Verkoper: ${naam}`)
  }
  if (herkomst !== 'alle') {
    filterDelen.push(`Afkomst: ${herkomst === 'onbekend' ? 'Onbekend' : (herkomstLabels[herkomst]?.tekst || herkomst)}`)
  }

  const buffer = await renderToBuffer(OfferteDashboardRapport({
    periodeLabel: dashboardPeriodeLabels[periode],
    filterOmschrijving: filterDelen.length > 0 ? filterDelen.join('  ·  ') : null,
    gegenereerdOp: new Date().toLocaleString('nl-NL', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    telling,
    conversie,
    delta,
    doorlooptijd: gemiddeldeDoorlooptijdDagen(huidig),
    perVerkoper,
    perAfkomst,
    groepen,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any)

  const datumStr = new Date().toISOString().slice(0, 10)
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="offerte-rapportage-${datumStr}.pdf"`,
    },
  })
}
