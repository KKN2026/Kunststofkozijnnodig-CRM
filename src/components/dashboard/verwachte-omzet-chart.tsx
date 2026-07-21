'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getVerwachteOmzetPerMaand } from '@/lib/actions'
import { formatCurrency } from '@/lib/utils'
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'

interface MaandData {
  maand: number
  open: number
  gewonnen: number
  totaal: number
  aantalOpen: number
  aantalGewonnen: number
  offertes: { id: string; offertenummer: string; relatieNaam: string | null; bedrag: number; status: string; valdatum: string }[]
}

const MAAND_NAMEN = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec']

// Verwachte omzet per maand o.b.v. de verwachte valdatum op offertes (excl.
// BTW, laatste versie per offerte-groep). Gestapelde staaf: geaccepteerd
// (gewonnen, zeker) + verzonden (open, klant beslist nog).
export function VerwachteOmzetChart() {
  const router = useRouter()
  const [jaar, setJaar] = useState(new Date().getFullYear())
  const [data, setData] = useState<MaandData[]>([])
  // Loading afgeleid van "welk jaar is geladen" — geen synchrone setState in
  // het effect nodig bij jaarwissel.
  const [geladenJaar, setGeladenJaar] = useState<number | null>(null)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const loading = geladenJaar !== jaar

  useEffect(() => {
    let actueel = true
    getVerwachteOmzetPerMaand(jaar)
      .then(r => {
        if (!actueel) return
        setData((r?.maanden as MaandData[]) || [])
        setGeladenJaar(jaar)
      })
      .catch(err => {
        console.error('[VerwachteOmzetChart] fetch error:', err)
        if (actueel) setGeladenJaar(jaar)
      })
    return () => { actueel = false }
  }, [jaar])

  const maxValue = Math.max(...data.map(d => d.totaal), 1)
  const totaalOpen = data.reduce((s, d) => s + d.open, 0)
  const totaalGewonnen = data.reduce((s, d) => s + d.gewonnen, 0)
  const heeftData = data.some(d => d.totaal > 0)

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6">
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <div>
          <h3 className="font-semibold text-gray-900 text-sm">Verwachte omzet per maand</h3>
          <p className="text-xs text-gray-500">
            Op basis van de verwachte valdatum van offertes · excl. BTW · laatste versie per offerte
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-3 text-[11px]">
            <Legend kleur="bg-emerald-500" label="Geaccepteerd" />
            <Legend kleur="bg-blue-400" label="Verzonden (open)" />
          </div>
          <div className="flex items-center gap-1 text-sm">
            <button type="button" onClick={() => setJaar(j => j - 1)} className="p-1 rounded hover:bg-gray-100 text-gray-500" aria-label="Vorig jaar">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-medium text-gray-700 tabular-nums">{jaar}</span>
            <button type="button" onClick={() => setJaar(j => j + 1)} className="p-1 rounded hover:bg-gray-100 text-gray-500" aria-label="Volgend jaar">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="h-56 flex items-center justify-center text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Prognose laden...
        </div>
      ) : !heeftData ? (
        <div className="h-56 flex items-center justify-center text-sm text-gray-400 text-center px-6">
          Nog geen offertes met een verwachte valdatum in {jaar}.<br />
          Vul de valdatum in bij een offerte (stap Controleren) om de prognose te vullen.
        </div>
      ) : (
        <>
          <div className="relative" style={{ height: 220 }}>
            <div className="absolute inset-x-0 top-0 bottom-7 pointer-events-none">
              {[0, 0.25, 0.5, 0.75, 1].map(p => (
                <div key={p} className="absolute inset-x-0 border-t border-gray-100" style={{ bottom: `${p * 100}%` }} />
              ))}
            </div>
            <div className="absolute inset-x-0 top-0 bottom-7 flex gap-1.5">
              {data.map((d, i) => {
                const isHover = hoverIdx === i
                const chartHeight = 193
                const gewonnenH = Math.round((d.gewonnen / maxValue) * chartHeight)
                const openH = Math.round((d.open / maxValue) * chartHeight)
                const maandParam = `${jaar}-${String(d.maand).padStart(2, '0')}`
                const klikbaar = d.totaal > 0
                return (
                  <div
                    key={d.maand}
                    className={`flex-1 relative group ${klikbaar ? 'cursor-pointer' : ''}`}
                    onMouseEnter={() => setHoverIdx(i)}
                    onMouseLeave={() => setHoverIdx(null)}
                    onClick={klikbaar ? () => router.push(`/offertes?valmaand=${maandParam}`) : undefined}
                    role={klikbaar ? 'button' : undefined}
                    tabIndex={klikbaar ? 0 : undefined}
                    onKeyDown={klikbaar ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(`/offertes?valmaand=${maandParam}`) } } : undefined}
                    aria-label={klikbaar ? `Bekijk offertes met verwachte valdatum in ${MAAND_NAMEN[d.maand - 1]} ${jaar}` : undefined}
                  >
                    {isHover && d.totaal > 0 && (
                      <div className={`absolute bottom-full mb-2 z-10 bg-gray-900 text-white text-xs rounded-md px-2.5 py-2 shadow-lg min-w-[190px] ${i < 3 ? 'left-0' : i > 8 ? 'right-0' : 'left-1/2 -translate-x-1/2'}`}>
                        <div className="font-medium mb-1">{MAAND_NAMEN[d.maand - 1]} {jaar} · {formatCurrency(d.totaal)}</div>
                        {d.gewonnen > 0 && <div>Geaccepteerd: {formatCurrency(d.gewonnen)} <span className="text-gray-400">({d.aantalGewonnen} st.)</span></div>}
                        {d.open > 0 && <div>Open: {formatCurrency(d.open)} <span className="text-gray-400">({d.aantalOpen} st.)</span></div>}
                        {d.offertes.slice(0, 5).map(o => (
                          <div key={o.id} className="text-gray-300 truncate max-w-[240px]">
                            {o.offertenummer} · {o.relatieNaam || 'onbekend'} · {formatCurrency(o.bedrag)}
                          </div>
                        ))}
                        {d.offertes.length > 5 && <div className="text-gray-400">+ {d.offertes.length - 5} meer</div>}
                        <div className="mt-1.5 pt-1.5 border-t border-white/15 text-[10px] text-gray-400">Klik om deze offertes te bekijken</div>
                      </div>
                    )}
                    <div className="absolute inset-x-1 bottom-0 flex flex-col-reverse">
                      <div
                        className="bg-emerald-500 rounded-b transition-opacity group-hover:opacity-80"
                        style={{ height: d.gewonnen > 0 ? Math.max(2, gewonnenH) : 0 }}
                      />
                      <div
                        className={`bg-blue-400 transition-opacity group-hover:opacity-80 ${d.gewonnen > 0 ? 'rounded-t' : 'rounded'}`}
                        style={{ height: d.open > 0 ? Math.max(2, openH) : 0 }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="absolute bottom-0 inset-x-0 h-7 flex gap-1.5 items-end">
              {data.map(d => (
                <div key={d.maand} className="flex-1 text-center text-[10px] text-gray-500">{MAAND_NAMEN[d.maand - 1]}</div>
              ))}
            </div>
          </div>

          <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-between flex-wrap gap-2 text-xs">
            <div className="text-gray-600">
              Geaccepteerd: <strong className="text-emerald-700">{formatCurrency(totaalGewonnen)}</strong>
              <span className="mx-2 text-gray-300">·</span>
              Open: <strong className="text-blue-700">{formatCurrency(totaalOpen)}</strong>
              <span className="mx-2 text-gray-300">·</span>
              Totaal verwacht {jaar}: <strong className="text-gray-900">{formatCurrency(totaalGewonnen + totaalOpen)}</strong>
            </div>
            <Link href="/offertes" className="text-[#1e40af] hover:underline">Alle offertes</Link>
          </div>
        </>
      )}
    </div>
  )
}

function Legend({ kleur, label }: { kleur: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className={`inline-block w-2.5 h-2.5 rounded-sm ${kleur}`} />
      <span className="text-gray-600">{label}</span>
    </div>
  )
}
