import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { COMPANY, COLORS, formatCurrencyPdf, formatDatePdf } from './shared-styles'
import type { StatusTelling } from '@/lib/offerte-dashboard-data'

// PDF-rapportage van het offerte-dashboard: zelfde cijfers als het scherm
// (gedeelde rekenlogica in lib/offerte-dashboard-data.ts), opgemaakt als
// downloadbaar overzicht met akkoord / openstaand / afgewezen.

const STATUS_KLEUREN = {
  akkoord: '#00a66e',
  openstaand: '#F59E0B',
  afgewezen: '#EF4444',
}

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: COLORS.text,
    paddingTop: 36,
    paddingBottom: 56,
    paddingHorizontal: 42,
  },

  // Kopband
  kop: {
    backgroundColor: COLORS.black,
    borderRadius: 6,
    paddingVertical: 14,
    paddingHorizontal: 18,
    marginBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  kopTitel: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: COLORS.white },
  kopSub: { fontSize: 8, color: '#9CA3AF', marginTop: 3 },
  kopBedrijf: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: COLORS.green, textAlign: 'right' },
  kopBedrijfSub: { fontSize: 7, color: '#9CA3AF', textAlign: 'right', marginTop: 2 },

  // KPI-rij
  kpiRij: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  kpiVak: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  kpiLabel: { fontSize: 7, color: COLORS.textLight, textTransform: 'uppercase' },
  kpiWaarde: { fontSize: 16, fontFamily: 'Helvetica-Bold', marginTop: 4 },
  kpiSub: { fontSize: 7, color: COLORS.textLight, marginTop: 3 },

  // Statusverloop
  verloopRij: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  verloopVak: { flex: 1, borderRadius: 6, paddingVertical: 8, alignItems: 'center', borderWidth: 1 },
  verloopAantal: { fontSize: 14, fontFamily: 'Helvetica-Bold' },
  verloopLabel: { fontSize: 7, textTransform: 'uppercase', marginTop: 2 },

  sectieTitel: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  sectieSub: { fontSize: 8, color: COLORS.textLight, marginBottom: 8 },

  // Tabellen
  tabel: { marginBottom: 16 },
  tabelKop: {
    flexDirection: 'row',
    backgroundColor: COLORS.lightGray,
    borderRadius: 4,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  tabelKopCel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: COLORS.textLight, textTransform: 'uppercase' },
  tabelRij: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#E5E7EB',
  },
  cel: { fontSize: 8.5 },

  // Gestapelde balk conversie per verkoper
  balk: { flexDirection: 'row', height: 8, borderRadius: 3, overflow: 'hidden', backgroundColor: COLORS.lightGray, marginTop: 3 },

  legenda: { flexDirection: 'row', gap: 14, marginBottom: 8 },
  legendaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendaBlok: { width: 7, height: 7, borderRadius: 2 },
  legendaTekst: { fontSize: 7.5, color: COLORS.textLight },

  // Status-groepen
  groepKop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 2,
  },
  groepTitel: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: COLORS.white },
  groepTotaal: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: COLORS.white },

  voet: {
    position: 'absolute',
    bottom: 24,
    left: 42,
    right: 42,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: '#E5E7EB',
    paddingTop: 6,
  },
  voetTekst: { fontSize: 7, color: COLORS.textLight },
})

export interface RapportVerkoperRij {
  naam: string
  telling: StatusTelling
  conversie: number | null
}

export interface RapportAfkomstRij {
  label: string
  telling: StatusTelling
  conversie: number | null
}

export interface RapportOfferteRij {
  datum: string | null
  nummer: string
  klant: string
  verkoper: string
  afkomst: string
  omschrijving: string
  bedrag: number
}

export interface RapportGroep {
  sleutel: 'akkoord' | 'openstaand' | 'afgewezen'
  titel: string
  rijen: RapportOfferteRij[]
  totaal: number
}

export interface OfferteDashboardRapportProps {
  periodeLabel: string
  filterOmschrijving: string | null
  gegenereerdOp: string
  telling: StatusTelling
  conversie: number | null
  delta: number | null
  doorlooptijd: number | null
  perVerkoper: RapportVerkoperRij[]
  perAfkomst: RapportAfkomstRij[]
  groepen: RapportGroep[]
}

function Balk({ telling }: { telling: StatusTelling }) {
  if (telling.totaal === 0) return <View style={s.balk} />
  const w = (n: number) => `${(n / telling.totaal) * 100}%`
  return (
    <View style={s.balk}>
      {telling.akkoord > 0 && <View style={{ width: w(telling.akkoord), backgroundColor: STATUS_KLEUREN.akkoord }} />}
      {telling.afgewezen > 0 && <View style={{ width: w(telling.afgewezen), backgroundColor: STATUS_KLEUREN.afgewezen }} />}
      {telling.openstaand > 0 && <View style={{ width: w(telling.openstaand), backgroundColor: STATUS_KLEUREN.openstaand }} />}
    </View>
  )
}

// Kolombreedtes offertelijst
const B = { datum: '11%', nummer: '13%', klant: '24%', omschrijving: '22%', verkoper: '13%', afkomst: '9%', bedrag: '8%' }

export function OfferteDashboardRapport(props: OfferteDashboardRapportProps) {
  const { telling } = props
  return (
    <Document title="Offerte-rapportage" author={COMPANY.naam}>
      <Page size="A4" style={s.page}>
        {/* Kop */}
        <View style={s.kop}>
          <View>
            <Text style={s.kopTitel}>Offerte-rapportage</Text>
            <Text style={s.kopSub}>
              {props.periodeLabel}
              {props.filterOmschrijving ? `  ·  ${props.filterOmschrijving}` : ''}
            </Text>
          </View>
          <View>
            <Text style={s.kopBedrijf}>{COMPANY.naam}</Text>
            <Text style={s.kopBedrijfSub}>Gegenereerd op {props.gegenereerdOp}</Text>
          </View>
        </View>

        {/* KPI's */}
        <View style={s.kpiRij}>
          <View style={s.kpiVak}>
            <Text style={s.kpiLabel}>Offertes verstuurd</Text>
            <Text style={s.kpiWaarde}>{telling.totaal}</Text>
            <Text style={s.kpiSub}>{props.periodeLabel}</Text>
          </View>
          <View style={s.kpiVak}>
            <Text style={s.kpiLabel}>Conversie (akkoord / beslist)</Text>
            <Text style={{ ...s.kpiWaarde, color: STATUS_KLEUREN.akkoord }}>{props.conversie !== null ? `${props.conversie}%` : '—'}</Text>
            <Text style={s.kpiSub}>
              {props.delta !== null ? `${props.delta >= 0 ? '+' : ''}${props.delta} pt t.o.v. vorige periode` : 'Nog geen vergelijking mogelijk'}
            </Text>
          </View>
          <View style={s.kpiVak}>
            <Text style={s.kpiLabel}>Nog openstaand</Text>
            <Text style={{ ...s.kpiWaarde, color: STATUS_KLEUREN.openstaand }}>{telling.openstaand}</Text>
            <Text style={s.kpiSub}>Wacht op reactie klant</Text>
          </View>
          <View style={s.kpiVak}>
            <Text style={s.kpiLabel}>Gem. doorlooptijd</Text>
            <Text style={s.kpiWaarde}>
              {props.doorlooptijd !== null ? `${props.doorlooptijd.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} dgn` : '—'}
            </Text>
            <Text style={s.kpiSub}>Van versturen tot beslissing</Text>
          </View>
        </View>

        {/* Statusverloop */}
        <View style={s.verloopRij}>
          <View style={{ ...s.verloopVak, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB' }}>
            <Text style={s.verloopAantal}>{telling.totaal}</Text>
            <Text style={{ ...s.verloopLabel, color: COLORS.textLight }}>Verstuurd</Text>
          </View>
          <View style={{ ...s.verloopVak, borderColor: '#FDE68A', backgroundColor: '#FFFBEB' }}>
            <Text style={{ ...s.verloopAantal, color: '#B45309' }}>{telling.openstaand}</Text>
            <Text style={{ ...s.verloopLabel, color: '#B45309' }}>Openstaand</Text>
          </View>
          <View style={{ ...s.verloopVak, borderColor: '#A7F3D0', backgroundColor: '#ECFDF5' }}>
            <Text style={{ ...s.verloopAantal, color: '#047857' }}>{telling.akkoord}</Text>
            <Text style={{ ...s.verloopLabel, color: '#047857' }}>Akkoord</Text>
          </View>
          <View style={{ ...s.verloopVak, borderColor: '#FECACA', backgroundColor: '#FEF2F2' }}>
            <Text style={{ ...s.verloopAantal, color: '#B91C1C' }}>{telling.afgewezen}</Text>
            <Text style={{ ...s.verloopLabel, color: '#B91C1C' }}>Afgewezen</Text>
          </View>
        </View>

        {/* Conversie per verkoper */}
        {props.perVerkoper.length > 0 && (
          <View style={s.tabel}>
            <Text style={s.sectieTitel}>Conversie per verkoper</Text>
            <Text style={s.sectieSub}>Akkoord van beslist; openstaande offertes tellen niet mee in het percentage</Text>
            <View style={s.legenda}>
              <View style={s.legendaItem}><View style={{ ...s.legendaBlok, backgroundColor: STATUS_KLEUREN.akkoord }} /><Text style={s.legendaTekst}>Akkoord</Text></View>
              <View style={s.legendaItem}><View style={{ ...s.legendaBlok, backgroundColor: STATUS_KLEUREN.afgewezen }} /><Text style={s.legendaTekst}>Afgewezen</Text></View>
              <View style={s.legendaItem}><View style={{ ...s.legendaBlok, backgroundColor: STATUS_KLEUREN.openstaand }} /><Text style={s.legendaTekst}>Openstaand</Text></View>
            </View>
            <View style={s.tabelKop}>
              <Text style={{ ...s.tabelKopCel, width: '22%' }}>Verkoper</Text>
              <Text style={{ ...s.tabelKopCel, width: '10%' }}>Verstuurd</Text>
              <Text style={{ ...s.tabelKopCel, width: '10%' }}>Akkoord</Text>
              <Text style={{ ...s.tabelKopCel, width: '11%' }}>Afgewezen</Text>
              <Text style={{ ...s.tabelKopCel, width: '11%' }}>Openstaand</Text>
              <Text style={{ ...s.tabelKopCel, width: '12%' }}>Conversie</Text>
              <Text style={{ ...s.tabelKopCel, width: '24%' }}>Verdeling</Text>
            </View>
            {props.perVerkoper.map(v => (
              <View key={v.naam} style={s.tabelRij}>
                <Text style={{ ...s.cel, width: '22%', fontFamily: 'Helvetica-Bold' }}>{v.naam}</Text>
                <Text style={{ ...s.cel, width: '10%' }}>{v.telling.totaal}</Text>
                <Text style={{ ...s.cel, width: '10%' }}>{v.telling.akkoord}</Text>
                <Text style={{ ...s.cel, width: '11%' }}>{v.telling.afgewezen}</Text>
                <Text style={{ ...s.cel, width: '11%' }}>{v.telling.openstaand}</Text>
                <Text style={{ ...s.cel, width: '12%', fontFamily: 'Helvetica-Bold' }}>{v.conversie !== null ? `${v.conversie}%` : '—'}</Text>
                <View style={{ width: '24%', justifyContent: 'center' }}><Balk telling={v.telling} /></View>
              </View>
            ))}
          </View>
        )}

        {/* Conversie per afkomst */}
        {props.perAfkomst.length > 0 && (
          <View style={s.tabel}>
            <Text style={s.sectieTitel}>Conversie per afkomst</Text>
            <Text style={s.sectieSub}>% akkoord van beslist, gesorteerd van hoog naar laag</Text>
            <View style={s.tabelKop}>
              <Text style={{ ...s.tabelKopCel, width: '22%' }}>Afkomst</Text>
              <Text style={{ ...s.tabelKopCel, width: '10%' }}>Verstuurd</Text>
              <Text style={{ ...s.tabelKopCel, width: '10%' }}>Akkoord</Text>
              <Text style={{ ...s.tabelKopCel, width: '11%' }}>Afgewezen</Text>
              <Text style={{ ...s.tabelKopCel, width: '11%' }}>Openstaand</Text>
              <Text style={{ ...s.tabelKopCel, width: '12%' }}>Conversie</Text>
              <Text style={{ ...s.tabelKopCel, width: '24%' }}>Verdeling</Text>
            </View>
            {props.perAfkomst.map(h => (
              <View key={h.label} style={s.tabelRij}>
                <Text style={{ ...s.cel, width: '22%', fontFamily: 'Helvetica-Bold' }}>{h.label}</Text>
                <Text style={{ ...s.cel, width: '10%' }}>{h.telling.totaal}</Text>
                <Text style={{ ...s.cel, width: '10%' }}>{h.telling.akkoord}</Text>
                <Text style={{ ...s.cel, width: '11%' }}>{h.telling.afgewezen}</Text>
                <Text style={{ ...s.cel, width: '11%' }}>{h.telling.openstaand}</Text>
                <Text style={{ ...s.cel, width: '12%', fontFamily: 'Helvetica-Bold' }}>{h.conversie !== null ? `${h.conversie}%` : '—'}</Text>
                <View style={{ width: '24%', justifyContent: 'center' }}><Balk telling={h.telling} /></View>
              </View>
            ))}
          </View>
        )}

        {/* Offertes per status */}
        {props.groepen.map(g => (
          <View key={g.sleutel} style={s.tabel}>
            {/* minPresenceAhead: kop niet onderaan een pagina laten bungelen */}
            <View style={{ ...s.groepKop, backgroundColor: STATUS_KLEUREN[g.sleutel] }} minPresenceAhead={60}>
              <Text style={s.groepTitel}>{g.titel} ({g.rijen.length})</Text>
              <Text style={s.groepTotaal}>{`${formatCurrencyPdf(g.totaal)} excl. BTW`}</Text>
            </View>
            {g.rijen.length === 0 ? (
              <View style={s.tabelRij}><Text style={{ ...s.cel, color: COLORS.textLight }}>Geen offertes</Text></View>
            ) : (
              <>
                <View style={s.tabelKop}>
                  <Text style={{ ...s.tabelKopCel, width: B.datum }}>Verstuurd</Text>
                  <Text style={{ ...s.tabelKopCel, width: B.nummer }}>Offerte</Text>
                  <Text style={{ ...s.tabelKopCel, width: B.klant }}>Klant</Text>
                  <Text style={{ ...s.tabelKopCel, width: B.omschrijving }}>Omschrijving</Text>
                  <Text style={{ ...s.tabelKopCel, width: B.verkoper }}>Verkoper</Text>
                  <Text style={{ ...s.tabelKopCel, width: B.afkomst }}>Afkomst</Text>
                  <Text style={{ ...s.tabelKopCel, width: B.bedrag, textAlign: 'right' }}>Bedrag</Text>
                </View>
                {g.rijen.map((r, i) => (
                  <View key={`${r.nummer}-${i}`} style={s.tabelRij}>
                    <Text style={{ ...s.cel, width: B.datum }}>{r.datum ? formatDatePdf(r.datum) : '-'}</Text>
                    <Text style={{ ...s.cel, width: B.nummer, fontFamily: 'Helvetica-Bold' }}>{r.nummer}</Text>
                    <Text style={{ ...s.cel, width: B.klant }}>{r.klant}</Text>
                    <Text style={{ ...s.cel, width: B.omschrijving, color: COLORS.textLight }}>{r.omschrijving}</Text>
                    <Text style={{ ...s.cel, width: B.verkoper }}>{r.verkoper}</Text>
                    <Text style={{ ...s.cel, width: B.afkomst }}>{r.afkomst}</Text>
                    <Text style={{ ...s.cel, width: B.bedrag, textAlign: 'right' }}>{formatCurrencyPdf(r.bedrag)}</Text>
                  </View>
                ))}
              </>
            )}
          </View>
        ))}

        {/* Voettekst met paginanummer */}
        <View style={s.voet} fixed>
          <Text style={s.voetTekst}>{COMPANY.naam} · {COMPANY.website} · {COMPANY.email}</Text>
          <Text style={s.voetTekst} render={({ pageNumber, totalPages }) => `Pagina ${pageNumber} van ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
