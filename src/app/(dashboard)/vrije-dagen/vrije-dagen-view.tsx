'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { showToast } from '@/components/ui/toast'
import { saveVrijeDag, beoordeelVrijeDag, deleteVrijeDag, getVakantieVooraankondiging, stuurVakantieVooraankondiging } from '@/lib/actions'
import {
  Plus, Palmtree, Check, X, Trash2, Clock, CheckCircle, XCircle, Mail, Loader2,
  Hourglass, CalendarClock, CalendarDays, ChevronLeft, ChevronRight,
} from 'lucide-react'
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addMonths, subMonths,
  eachDayOfInterval, isSameMonth, isSameDay, isToday,
} from 'date-fns'
import { nl } from 'date-fns/locale'

interface VrijeDag {
  id: string
  medewerker_id: string | null
  medewerker_naam: string | null
  start_datum: string
  eind_datum: string
  aantal_uren: number | null
  type: string
  reden: string | null
  status: string
  aangevraagd_op: string
  vooraankondiging_verstuurd_op: string | null
}

interface Medewerker { id: string; naam: string; kleur?: string }

interface VooraankondigingPreview {
  id: string
  aantalKlanten: number
  voorbeeldKlanten: string[]
  alVerstuurdOp: string | null
  medewerkerNaam: string | null
}

const TYPE_LABEL: Record<string, string> = { vakantie: 'Vakantie', verlof: 'Verlof', ziek: 'Ziek', bijzonder: 'Bijzonder verlof' }
const STANDAARD_KLEUR = '#2bbd8a'
const UREN_PER_WERKDAG = 8

function dagenTussen(start: string, eind: string): number {
  const a = new Date(start); const b = new Date(eind || start)
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000) + 1)
}

// Telt alleen ma-vr — weekenden tellen standaard niet mee als verlofuren.
function werkdagenTussen(start: string, eind: string): number {
  if (!start) return 0
  const a = new Date(start)
  const b = new Date(eind || start)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return 0
  let count = 0
  const cur = new Date(a)
  while (cur <= b) {
    const dag = cur.getDay()
    if (dag !== 0 && dag !== 6) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count || 1
}

function initialen(naam: string): string {
  return naam.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?'
}

function StatTile({ icon: Icon, label, value, sub, bg, fg }: { icon: typeof Clock; label: string; value: string; sub?: string; bg: string; fg: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-2 tracking-tight">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
        <div className={`h-11 w-11 rounded-full ${bg} flex items-center justify-center shrink-0`}>
          <Icon className={`h-5 w-5 ${fg}`} />
        </div>
      </div>
    </div>
  )
}

export function VrijeDagenView({ items, rol, eigenMedewerkerId, medewerkers }: { items: VrijeDag[]; rol: string; eigenMedewerkerId?: string | null; medewerkers: Medewerker[] }) {
  const router = useRouter()
  // Strikt rol 'admin': collega's met rol 'gebruiker' zijn GEEN beheerder en
  // kunnen alleen aanvragen — de server actions handhaven dit ook.
  const isAdmin = rol === 'admin'
  const [dialogOpen, setDialogOpen] = useState(false)
  const [bezig, setBezig] = useState(false)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  // Vakantie-vooraankondiging naar vaste klanten
  const [vooraankondiging, setVooraankondiging] = useState<VooraankondigingPreview | null>(null)
  const [vaSending, setVaSending] = useState(false)

  // Formulierstate voor de "hoeveel uur"-live-berekening bij het aanvragen/toevoegen.
  const [formStart, setFormStart] = useState('')
  const [formEind, setFormEind] = useState('')
  const [formUren, setFormUren] = useState('')
  const [urenAangepast, setUrenAangepast] = useState(false)

  // Kalender
  const [kalenderMaand, setKalenderMaand] = useState(new Date())
  const [gekozenDag, setGekozenDag] = useState<Date | null>(null)

  const medewerkerKleur = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of medewerkers) map.set(m.id, m.kleur || STANDAARD_KLEUR)
    return map
  }, [medewerkers])

  function openDialog() {
    setFormStart(''); setFormEind(''); setFormUren(''); setUrenAangepast(false)
    setDialogOpen(true)
  }

  function onDatumChange(veld: 'start' | 'eind', waarde: string) {
    const nieuweStart = veld === 'start' ? waarde : formStart
    const nieuweEind = veld === 'eind' ? waarde : formEind
    if (veld === 'start') setFormStart(waarde); else setFormEind(waarde)
    if (!urenAangepast && nieuweStart) {
      const werkdagen = werkdagenTussen(nieuweStart, nieuweEind || nieuweStart)
      setFormUren(String(werkdagen * UREN_PER_WERKDAG))
    }
  }

  async function openVooraankondiging(id: string) {
    setLoadingId(id)
    const preview = await getVakantieVooraankondiging(id)
    setLoadingId(null)
    if (!preview) { showToast('Kon gegevens niet laden', 'error'); return }
    setVooraankondiging(preview as VooraankondigingPreview)
  }

  async function verstuurVooraankondiging() {
    if (!vooraankondiging || vaSending) return
    setVaSending(true)
    const res = await stuurVakantieVooraankondiging(vooraankondiging.id)
    setVaSending(false)
    if (res?.error) { showToast(res.error, 'error'); return }
    showToast(`${res?.verstuurd ?? 0} vaste klant(en) geïnformeerd`, 'success')
    setVooraankondiging(null)
    router.refresh()
  }

  const aangevraagd = items.filter(i => i.status === 'aangevraagd')
  const goedgekeurd = items.filter(i => i.status === 'goedgekeurd')
  const afgewezen = items.filter(i => i.status === 'afgewezen')

  // --- Dashboard: uren-optelling dit jaar/deze maand + per medewerker ---
  const dashboard = useMemo(() => {
    const nu = new Date()
    const jaar = nu.getFullYear()
    const maand = nu.getMonth()
    let urenJaar = 0, dagenJaar = 0, urenMaand = 0
    const perMedewerker = new Map<string, { naam: string; kleur: string; uren: number }>()
    for (const v of goedgekeurd) {
      const start = new Date(v.start_datum)
      if (start.getFullYear() !== jaar) continue
      const dagen = dagenTussen(v.start_datum, v.eind_datum)
      const uren = v.aantal_uren ?? dagen * UREN_PER_WERKDAG
      urenJaar += uren
      dagenJaar += dagen
      if (start.getMonth() === maand) urenMaand += uren
      const key = v.medewerker_id || v.medewerker_naam || 'onbekend'
      const bestaand = perMedewerker.get(key) || { naam: v.medewerker_naam || 'Onbekend', kleur: (v.medewerker_id && medewerkerKleur.get(v.medewerker_id)) || STANDAARD_KLEUR, uren: 0 }
      bestaand.uren += uren
      perMedewerker.set(key, bestaand)
    }
    const perMedewerkerLijst = Array.from(perMedewerker.values()).sort((a, b) => b.uren - a.uren)
    return { urenJaar, dagenJaar, urenMaand, perMedewerkerLijst }
  }, [goedgekeurd, medewerkerKleur])

  // --- Kalender: items per dag, uitgesplitst over de hele periode ---
  const kalenderPerDag = useMemo(() => {
    const map = new Map<string, Array<{ id: string; naam: string; kleur: string; uren: number | null; status: string; type: string }>>()
    for (const v of items) {
      if (v.status === 'afgewezen') continue
      const start = new Date(v.start_datum)
      const eind = new Date(v.eind_datum || v.start_datum)
      if (Number.isNaN(start.getTime()) || Number.isNaN(eind.getTime()) || eind < start) continue
      for (const dag of eachDayOfInterval({ start, end: eind })) {
        const key = format(dag, 'yyyy-MM-dd')
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push({
          id: v.id,
          naam: v.medewerker_naam || 'Onbekend',
          kleur: (v.medewerker_id && medewerkerKleur.get(v.medewerker_id)) || STANDAARD_KLEUR,
          uren: v.aantal_uren,
          status: v.status,
          type: v.type,
        })
      }
    }
    return map
  }, [items, medewerkerKleur])

  const kalenderDagen = useMemo(() => {
    const monthStart = startOfMonth(kalenderMaand)
    const monthEnd = endOfMonth(kalenderMaand)
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
    return eachDayOfInterval({ start: calStart, end: calEnd })
  }, [kalenderMaand])

  const gekozenDagStr = gekozenDag ? format(gekozenDag, 'yyyy-MM-dd') : null
  const gekozenDagItems = gekozenDagStr ? (kalenderPerDag.get(gekozenDagStr) || []) : []

  async function handleSubmit(formData: FormData) {
    setBezig(true)
    const res = await saveVrijeDag(formData)
    setBezig(false)
    if (res?.error) { showToast(res.error, 'error'); return }
    showToast(isAdmin ? 'Vrije dagen opgeslagen' : 'Aanvraag ingediend', 'success')
    setDialogOpen(false)
    router.refresh()
  }

  async function handleBeoordeel(id: string, status: 'goedgekeurd' | 'afgewezen') {
    setLoadingId(id)
    const res = await beoordeelVrijeDag(id, status)
    setLoadingId(null)
    if (res?.error) { showToast(res.error, 'error'); return }
    showToast(status === 'goedgekeurd' ? 'Goedgekeurd' : 'Afgewezen', 'success')
    router.refresh()
  }

  async function handleDelete(id: string) {
    if (!confirm('Verwijderen?')) return
    setLoadingId(id)
    const res = await deleteVrijeDag(id)
    setLoadingId(null)
    if (res?.error) { showToast(res.error, 'error'); return }
    router.refresh()
  }

  function Rij({ v }: { v: VrijeDag }) {
    const dagen = dagenTussen(v.start_datum, v.eind_datum)
    return (
      <div className="px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors">
        <Palmtree className="h-5 w-5 text-rose-500 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-900">{v.medewerker_naam || 'Onbekend'}</span>
            <Badge status={v.type}>{TYPE_LABEL[v.type] || v.type}</Badge>
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {format(new Date(v.start_datum), 'd MMM yyyy', { locale: nl })}
            {v.eind_datum && v.eind_datum !== v.start_datum ? ` – ${format(new Date(v.eind_datum), 'd MMM yyyy', { locale: nl })}` : ''}
            {' · '}{dagen} {dagen === 1 ? 'dag' : 'dagen'}
            {' · '}
            <span className="font-medium text-gray-700">{v.aantal_uren ?? dagen * UREN_PER_WERKDAG} uur</span>
          </div>
          {v.reden && <div className="text-xs text-gray-400 mt-0.5 truncate">{v.reden}</div>}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {isAdmin && v.status === 'aangevraagd' && (
            <>
              <Button size="sm" variant="ghost" disabled={loadingId === v.id} onClick={() => handleBeoordeel(v.id, 'goedgekeurd')} className="text-green-600 hover:bg-green-50">
                <Check className="h-4 w-4" /> Goedkeuren
              </Button>
              <Button size="sm" variant="ghost" disabled={loadingId === v.id} onClick={() => handleBeoordeel(v.id, 'afgewezen')} className="text-red-600 hover:bg-red-50">
                <X className="h-4 w-4" />
              </Button>
            </>
          )}
          {isAdmin && v.status === 'goedgekeurd' && v.type === 'vakantie' && (
            v.vooraankondiging_verstuurd_op ? (
              <span className="text-[11px] text-emerald-600 flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5" />klanten geïnformeerd</span>
            ) : (
              <Button size="sm" variant="ghost" disabled={loadingId === v.id} onClick={() => openVooraankondiging(v.id)} className="text-blue-600 hover:bg-blue-50" title="Vaste klanten vooraf informeren over tragere reactie">
                <Mail className="h-4 w-4" /> Klanten informeren
              </Button>
            )
          )}
          {(isAdmin || (v.status === 'aangevraagd' && !!eigenMedewerkerId && v.medewerker_id === eigenMedewerkerId)) && (
            <Button size="sm" variant="ghost" disabled={loadingId === v.id} onClick={() => handleDelete(v.id)} className="text-gray-400 hover:text-red-500">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    )
  }

  const maxMedewerkerUren = Math.max(1, ...dashboard.perMedewerkerLijst.map(m => m.uren))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vrije dagen</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isAdmin ? 'Beheer en keur vrije dagen goed — goedgekeurde dagen verschijnen in de agenda' : 'Vraag je vrije dagen aan — de beheerder keurt ze goed'}
          </p>
        </div>
        <Button onClick={openDialog}>
          <Plus className="h-4 w-4" />
          {isAdmin ? 'Vrije dagen toevoegen' : 'Vrije dagen aanvragen'}
        </Button>
      </div>

      {/* Dashboard: KPI-tegels */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile icon={Clock} label="Te beoordelen" value={String(aangevraagd.length)} sub={aangevraagd.length > 0 ? 'wacht op goedkeuring' : 'alles afgehandeld'} bg="bg-amber-50" fg="text-amber-600" />
        <StatTile icon={Hourglass} label="Uren deze maand" value={`${dashboard.urenMaand}u`} sub={format(new Date(), 'MMMM yyyy', { locale: nl })} bg="bg-blue-50" fg="text-blue-600" />
        <StatTile icon={CalendarClock} label="Uren dit jaar" value={`${dashboard.urenJaar}u`} sub="goedgekeurd verlof" bg="bg-emerald-50" fg="text-[#00a66e]" />
        <StatTile icon={CalendarDays} label="Dagen dit jaar" value={String(dashboard.dagenJaar)} sub="goedgekeurd verlof" bg="bg-violet-50" fg="text-violet-600" />
      </div>

      {/* Uren per medewerker (alleen zinvol voor beheerder met meerdere collega's) */}
      {isAdmin && dashboard.perMedewerkerLijst.length > 1 && (
        <Card>
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Uren per medewerker (dit jaar)</h3>
            <div className="space-y-3">
              {dashboard.perMedewerkerLijst.map(m => (
                <div key={m.naam} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 text-sm text-gray-700 truncate flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: m.kleur }} />
                    {m.naam}
                  </span>
                  <span className="flex-1 h-4 rounded-full bg-gray-100 overflow-hidden">
                    <span className="block h-full rounded-full transition-all" style={{ width: `${(m.uren / maxMedewerkerUren) * 100}%`, backgroundColor: m.kleur }} />
                  </span>
                  <span className="w-14 text-right text-sm font-semibold text-gray-900">{m.uren}u</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Kalender/agenda-weergave */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900 capitalize">{format(kalenderMaand, 'MMMM yyyy', { locale: nl })}</h2>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => setKalenderMaand(m => subMonths(m, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setKalenderMaand(new Date()); setGekozenDag(new Date()) }}>
                Vandaag
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setKalenderMaand(m => addMonths(m, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-t-lg overflow-hidden">
            {['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'].map(dag => (
              <div key={dag} className="bg-gray-50 py-2 text-center text-xs font-medium text-gray-500">{dag}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-b-lg overflow-hidden">
            {kalenderDagen.map(dag => {
              const dagStr = format(dag, 'yyyy-MM-dd')
              const dagItems = kalenderPerDag.get(dagStr) || []
              const isCurrentMonth = isSameMonth(dag, kalenderMaand)
              const isSelected = gekozenDag && isSameDay(dag, gekozenDag)
              const vandaag = isToday(dag)
              return (
                <div
                  key={dagStr}
                  onClick={() => setGekozenDag(dag)}
                  className={`min-h-[76px] bg-white p-1.5 cursor-pointer transition-colors hover:bg-gray-50 ${!isCurrentMonth ? 'bg-gray-50' : ''} ${isSelected ? 'ring-2 ring-primary ring-inset' : ''}`}
                >
                  <div className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${vandaag ? 'bg-primary text-white' : ''} ${!isCurrentMonth ? 'text-gray-300' : 'text-gray-700'}`}>
                    {format(dag, 'd')}
                  </div>
                  {isCurrentMonth && dagItems.length > 0 && (
                    <div className="space-y-0.5">
                      {dagItems.slice(0, 3).map((it, i) => (
                        <div
                          key={`${it.id}-${i}`}
                          className={`text-[10px] leading-tight px-1 py-0.5 rounded truncate text-white ${it.status === 'aangevraagd' ? 'opacity-50' : ''}`}
                          style={{ backgroundColor: it.kleur }}
                          title={`${it.naam} — ${TYPE_LABEL[it.type] || it.type}${it.uren ? ` (${it.uren}u)` : ''}`}
                        >
                          {initialen(it.naam)}{it.uren ? ` ${it.uren}u` : ''}
                        </div>
                      ))}
                      {dagItems.length > 3 && <div className="text-[10px] text-gray-400 px-1">+{dagItems.length - 3} meer</div>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Legenda */}
          {medewerkers.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 pt-3 border-t border-gray-100">
              {medewerkers.map(m => (
                <span key={m.id} className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: m.kleur || STANDAARD_KLEUR }} />
                  {m.naam}
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
                <span className="w-2 h-2 rounded-full bg-gray-400 opacity-50" />
                = nog niet goedgekeurd
              </span>
            </div>
          )}

          {/* Detail geselecteerde dag */}
          {gekozenDag && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900 capitalize mb-2">{format(gekozenDag, 'EEEE d MMMM yyyy', { locale: nl })}</h3>
              {gekozenDagItems.length === 0 ? (
                <p className="text-sm text-gray-400">Niemand vrij op deze dag.</p>
              ) : (
                <div className="space-y-1.5">
                  {gekozenDagItems.map((it, i) => (
                    <div key={`${it.id}-${i}`} className="flex items-center gap-3 p-2 rounded-md bg-gray-50">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: it.kleur }} />
                      <span className="text-sm text-gray-900 font-medium">{it.naam}</span>
                      <Badge status={it.type}>{TYPE_LABEL[it.type] || it.type}</Badge>
                      {it.status === 'aangevraagd' && <span className="text-xs text-amber-600">(aangevraagd)</span>}
                      {it.uren != null && <span className="ml-auto text-sm font-semibold text-gray-700">{it.uren} uur</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Te beoordelen (admin) */}
      {isAdmin && aangevraagd.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 bg-amber-50">
              <Clock className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-semibold text-amber-800">Te beoordelen ({aangevraagd.length})</span>
            </div>
            <div className="divide-y divide-gray-100">{aangevraagd.map(v => <Rij key={v.id} v={v} />)}</div>
          </CardContent>
        </Card>
      )}

      {/* Eigen openstaande aanvragen (medewerker) */}
      {!isAdmin && aangevraagd.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-semibold text-gray-700">In afwachting ({aangevraagd.length})</span>
            </div>
            <div className="divide-y divide-gray-100">{aangevraagd.map(v => <Rij key={v.id} v={v} />)}</div>
          </CardContent>
        </Card>
      )}

      {/* Goedgekeurd */}
      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-emerald-500" />
            <span className="text-sm font-semibold text-gray-700">Goedgekeurd ({goedgekeurd.length})</span>
          </div>
          {goedgekeurd.length === 0
            ? <p className="px-4 py-6 text-sm text-gray-400 text-center">Nog geen goedgekeurde vrije dagen</p>
            : <div className="divide-y divide-gray-100">{goedgekeurd.map(v => <Rij key={v.id} v={v} />)}</div>}
        </CardContent>
      </Card>

      {/* Afgewezen */}
      {afgewezen.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
              <XCircle className="h-4 w-4 text-gray-400" />
              <span className="text-sm font-semibold text-gray-500">Afgewezen ({afgewezen.length})</span>
            </div>
            <div className="divide-y divide-gray-100">{afgewezen.map(v => <Rij key={v.id} v={v} />)}</div>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={isAdmin ? 'Vrije dagen toevoegen' : 'Vrije dagen aanvragen'}>
        <form action={handleSubmit} className="space-y-4">
          {isAdmin && (
            <Select name="medewerker_id" label="Medewerker" required options={medewerkers.map(m => ({ value: m.id, label: m.naam }))} placeholder="Kies medewerker..." />
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input name="start_datum" label="Van" type="date" required value={formStart} onChange={e => onDatumChange('start', e.target.value)} />
            <Input name="eind_datum" label="Tot en met" type="date" value={formEind} onChange={e => onDatumChange('eind', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select name="type" label="Type" defaultValue="vakantie" options={[
              { value: 'vakantie', label: 'Vakantie' },
              { value: 'verlof', label: 'Verlof' },
              { value: 'ziek', label: 'Ziek' },
              { value: 'bijzonder', label: 'Bijzonder verlof' },
            ]} />
            <Input
              name="aantal_uren"
              label="Aantal uren"
              type="number"
              step="0.5"
              placeholder="bijv. 8"
              value={formUren}
              onChange={e => { setFormUren(e.target.value); setUrenAangepast(true) }}
            />
          </div>
          <p className="text-xs text-gray-400 -mt-2">
            Automatisch berekend op basis van werkdagen × {UREN_PER_WERKDAG} uur — pas aan bij parttime of een halve dag.
          </p>
          <Input name="reden" label="Toelichting (optioneel)" placeholder="bijv. zomervakantie" />
          {isAdmin && (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" name="direct_goedkeuren" value="true" defaultChecked className="rounded border-gray-300 text-primary" />
              Direct goedkeuren
            </label>
          )}
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
            <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>Annuleren</Button>
            <Button type="submit" disabled={bezig}>{bezig ? 'Bezig…' : isAdmin ? 'Opslaan' : 'Aanvragen'}</Button>
          </div>
        </form>
      </Dialog>

      {/* Bevestiging vakantie-vooraankondiging */}
      <Dialog open={!!vooraankondiging} onClose={() => { if (!vaSending) setVooraankondiging(null) }} title="Vaste klanten informeren">
        {vooraankondiging && (
          <div className="space-y-4">
            {vooraankondiging.aantalKlanten === 0 ? (
              <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                Er zijn nog geen <strong>vaste klanten</strong> met e-mailadres gemarkeerd. Markeer klanten als &apos;vaste klant&apos;
                op hun relatiepagina; alleen die krijgen deze vooraankondiging.
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-700">
                  Er wordt een mail gestuurd naar <strong>{vooraankondiging.aantalKlanten} vaste klant{vooraankondiging.aantalKlanten === 1 ? '' : 'en'}</strong>
                  {vooraankondiging.medewerkerNaam ? <> (vakantie {vooraankondiging.medewerkerNaam})</> : null}: dat jullie wat minder
                  snel bereikbaar zijn en dat mailen naar info@ sneller wordt opgepakt.
                </p>
                {vooraankondiging.voorbeeldKlanten.length > 0 && (
                  <p className="text-xs text-gray-500">
                    Bijv.: {vooraankondiging.voorbeeldKlanten.join(', ')}{vooraankondiging.aantalKlanten > vooraankondiging.voorbeeldKlanten.length ? ', …' : ''}
                  </p>
                )}
              </>
            )}
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
              <Button type="button" variant="ghost" onClick={() => setVooraankondiging(null)} disabled={vaSending}>Annuleren</Button>
              {vooraankondiging.aantalKlanten > 0 && (
                <Button type="button" onClick={verstuurVooraankondiging} disabled={vaSending}>
                  {vaSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  {vaSending ? 'Versturen…' : `Verstuur naar ${vooraankondiging.aantalKlanten}`}
                </Button>
              )}
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
