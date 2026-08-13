'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { showToast } from '@/components/ui/toast'
import { saveMedewerkerDoel, deleteMedewerkerDoel } from '@/lib/actions'
import { formatCurrency } from '@/lib/utils'
import { Target, Pencil, Loader2, TrendingUp, Info, Trash2 } from 'lucide-react'
import { format } from 'date-fns'

interface Medewerker { id: string; naam: string; kleur?: string | null; uurtarief?: number | null }
interface Doel { id: string; medewerker_id: string; activiteit_type: string; dag_doel: number }
interface Activiteit {
  id: string
  medewerker_id: string
  activiteit_type: string
  created_at: string
  referentie_type?: string | null
  referentie_id?: string | null
  bedrag?: number | null
}
interface UurRegel { medewerker_id: string | null; uren: number; datum: string }

const STANDAARD_KLEUR = '#2bbd8a'

function voortgangKleur(pct: number): string {
  if (pct >= 100) return 'bg-[#00a66e]'
  if (pct >= 50) return 'bg-amber-500'
  return 'bg-red-400'
}

interface Rij {
  doelId: string | null
  type: string
  label: string
  dagDoel: number
  maandDoel: number
  vandaag: number
  maand: number
}

function berekenRijen(medewerkerId: string, doelen: Doel[], activiteiten: Activiteit[], werkdagenDezeMaand: number, labels: Record<string, string>, vandaagStr: string): Rij[] {
  const types = new Set<string>()
  doelen.filter(d => d.medewerker_id === medewerkerId).forEach(d => types.add(d.activiteit_type))
  activiteiten.filter(a => a.medewerker_id === medewerkerId).forEach(a => types.add(a.activiteit_type))
  const rijen: Rij[] = []
  for (const type of types) {
    const doel = doelen.find(d => d.medewerker_id === medewerkerId && d.activiteit_type === type)
    const dagDoel = doel?.dag_doel || 0
    const acts = activiteiten.filter(a => a.medewerker_id === medewerkerId && a.activiteit_type === type)
    const vandaag = acts.filter(a => a.created_at.slice(0, 10) === vandaagStr).length
    rijen.push({ doelId: doel?.id || null, type, label: labels[type] || type, dagDoel, maandDoel: dagDoel * werkdagenDezeMaand, vandaag, maand: acts.length })
  }
  return rijen.sort((a, b) => a.label.localeCompare(b.label))
}

export function ProductiviteitView({
  medewerkers, doelen, activiteiten, uren, rol, eigenMedewerkerId, werkdagenDezeMaand, labels,
}: {
  medewerkers: Medewerker[]
  doelen: Doel[]
  activiteiten: Activiteit[]
  uren: UurRegel[]
  rol: string
  eigenMedewerkerId: string | null
  werkdagenDezeMaand: number
  labels: Record<string, string>
}) {
  const router = useRouter()
  const isAdmin = rol === 'admin'
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editing, setEditing] = useState<{ doelId: string | null; medewerkerId: string; type: string; dagDoel: number } | null>(null)
  const [nieuweSoort, setNieuweSoort] = useState(false)

  const vandaagStr = format(new Date(), 'yyyy-MM-dd')

  const urenPerMedewerker = useMemo(() => {
    const map = new Map<string, number>()
    for (const u of uren) {
      if (!u.medewerker_id) continue
      map.set(u.medewerker_id, (map.get(u.medewerker_id) || 0) + (u.uren || 0))
    }
    return map
  }, [uren])

  // Potentiële omzet per medewerker: som van gekoppelde bedragen (lead
  // geschatte_waarde / offerte totaal), gededupliceerd per referentie zodat
  // eenzelfde lead niet dubbel telt (bv. zowel "gesproken" als "nieuwe klant").
  const { omzetVandaagPerMedewerker, omzetMaandPerMedewerker } = useMemo(() => {
    const dag = new Map<string, number>()
    const maand = new Map<string, number>()
    const gezienDag = new Set<string>()
    const gezienMaand = new Set<string>()
    for (const a of activiteiten) {
      if (a.bedrag == null || !a.referentie_id) continue
      const refKey = `${a.medewerker_id}:${a.referentie_type}:${a.referentie_id}`
      if (!gezienMaand.has(refKey)) {
        gezienMaand.add(refKey)
        maand.set(a.medewerker_id, (maand.get(a.medewerker_id) || 0) + a.bedrag)
      }
      if (a.created_at.slice(0, 10) === vandaagStr && !gezienDag.has(refKey)) {
        gezienDag.add(refKey)
        dag.set(a.medewerker_id, (dag.get(a.medewerker_id) || 0) + a.bedrag)
      }
    }
    return { omzetVandaagPerMedewerker: dag, omzetMaandPerMedewerker: maand }
  }, [activiteiten, vandaagStr])

  function openNieuwDoel() {
    setEditing({ doelId: null, medewerkerId: medewerkers[0]?.id || '', type: Object.keys(labels)[0] || '', dagDoel: 0 })
    setNieuweSoort(false)
    setDialogOpen(true)
  }

  function openBewerkDoel(doelId: string | null, medewerkerId: string, type: string, dagDoel: number) {
    setEditing({ doelId, medewerkerId, type, dagDoel })
    setNieuweSoort(!Object.keys(labels).includes(type))
    setDialogOpen(true)
  }

  async function handleDelete() {
    if (!editing?.doelId) return
    if (!confirm('Dit doel verwijderen?')) return
    setDeleting(true)
    const res = await deleteMedewerkerDoel(editing.doelId)
    setDeleting(false)
    if (res?.error) { showToast(res.error, 'error'); return }
    showToast('Doel verwijderd', 'success')
    setDialogOpen(false)
    router.refresh()
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const medewerkerId = form.get('medewerker_id') as string
    let type = form.get('activiteit_type') as string
    if (type === '__nieuw__') {
      const custom = ((form.get('nieuwe_type_naam') as string) || '').trim()
      if (!custom) { showToast('Vul een naam in voor de nieuwe soort', 'error'); return }
      type = custom
    }
    const dagDoel = parseFloat(form.get('dag_doel') as string) || 0
    if (!medewerkerId || !type) { showToast('Kies een medewerker en een soort', 'error'); return }
    setSaving(true)
    const res = await saveMedewerkerDoel(medewerkerId, type, dagDoel)
    setSaving(false)
    if (res?.error) { showToast(res.error, 'error'); return }
    showToast('Doel opgeslagen', 'success')
    setDialogOpen(false)
    router.refresh()
  }

  const zichtbareMedewerkers = isAdmin ? medewerkers : medewerkers.filter(m => m.id === eigenMedewerkerId)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Productiviteit</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isAdmin
              ? 'Dagdoelen per medewerker en wat er automatisch aan resultaat uit komt — geen handmatige invoer.'
              : 'Jouw doelen en voortgang deze maand.'}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={openNieuwDoel}>
            <Target className="h-4 w-4" />
            Doel instellen
          </Button>
        )}
      </div>

      <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 flex items-start gap-2">
        <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-800">
          Activiteiten worden volledig automatisch geteld als bijproduct van bestaand werk: een lead <strong>vooruit plannen</strong>
          (terugbelmoment) of de status vooruit zetten telt als &ldquo;klant gesproken&rdquo; (en bij een verse lead ook als
          &ldquo;nieuwe klant benaderd&rdquo;); een offerte <strong>aanmaken of bewerken</strong> telt (max 1x per dag) als &ldquo;offerte gemaakt/aangepast&rdquo;.
          Vul bij een lead een <strong>geschatte waarde</strong> in, dan tellen gesprekken ook mee als potentiële omzet — offertes
          gebruiken automatisch hun echte offertebedrag. Doelen zijn alleen door de beheerder in te stellen.
        </p>
      </div>

      {zichtbareMedewerkers.length === 0 && (
        <Card><CardContent className="p-6 text-center text-sm text-gray-400">Geen (actieve) medewerkers gevonden.</CardContent></Card>
      )}

      {zichtbareMedewerkers.map(m => {
        const rijen = berekenRijen(m.id, doelen, activiteiten, werkdagenDezeMaand, labels, vandaagStr)
        const urenDezeMaand = urenPerMedewerker.get(m.id) || 0
        const kosten = m.uurtarief ? urenDezeMaand * m.uurtarief : null
        const totaalActiviteiten = activiteiten.filter(a => a.medewerker_id === m.id).length
        const kostenPerActie = kosten && totaalActiviteiten > 0 ? kosten / totaalActiviteiten : null
        const omzetVandaag = omzetVandaagPerMedewerker.get(m.id) || 0
        const omzetMaand = omzetMaandPerMedewerker.get(m.id) || 0
        const rendement = kosten && kosten > 0 && omzetMaand > 0 ? omzetMaand / kosten : null

        return (
          <Card key={m.id}>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: m.kleur || STANDAARD_KLEUR }} />
                <h2 className="text-base font-semibold text-gray-900">{m.naam}</h2>
              </div>

              {rijen.length === 0 ? (
                <p className="text-sm text-gray-400">Nog geen doelen ingesteld voor {m.naam}.</p>
              ) : (
                <div className="space-y-4">
                  {rijen.map(r => {
                    const pctVandaag = r.dagDoel > 0 ? Math.min(100, (r.vandaag / r.dagDoel) * 100) : 0
                    const pctMaand = r.maandDoel > 0 ? Math.min(100, (r.maand / r.maandDoel) * 100) : 0
                    return (
                      <div key={r.type}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-700">{r.label}</span>
                          {isAdmin && (
                            <button onClick={() => openBewerkDoel(r.doelId, m.id, r.type, r.dagDoel)} className="text-gray-300 hover:text-gray-500">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                              <span>Vandaag</span>
                              <span className="font-semibold text-gray-900">{r.vandaag}{r.dagDoel > 0 ? ` / ${r.dagDoel}` : ''}</span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                              <div className={`h-2 rounded-full transition-all ${voortgangKleur(pctVandaag)}`} style={{ width: `${r.dagDoel > 0 ? pctVandaag : 0}%` }} />
                            </div>
                          </div>
                          <div>
                            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                              <span>Deze maand</span>
                              <span className="font-semibold text-gray-900">{r.maand}{r.maandDoel > 0 ? ` / ${r.maandDoel}` : ''}</span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                              <div className={`h-2 rounded-full transition-all ${voortgangKleur(pctMaand)}`} style={{ width: `${r.maandDoel > 0 ? pctMaand : 0}%` }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Potentiële omzet: bedrag van offertes + geschatte leadwaarde die vandaag/deze maand geraakt zijn */}
              {(omzetVandaag > 0 || omzetMaand > 0) && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="flex items-center gap-1.5 mb-2">
                    <TrendingUp className="h-3.5 w-3.5 text-gray-400" />
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Potentiële omzet</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-lg font-bold text-gray-900">{formatCurrency(omzetVandaag)}</p>
                      <p className="text-xs text-gray-400">vandaag</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-gray-900">{formatCurrency(omzetMaand)}</p>
                      <p className="text-xs text-gray-400">deze maand</p>
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-2">
                    Optelling van offertebedragen (bij &ldquo;offerte gemaakt/aangepast&rdquo;) en de geschatte waarde van
                    leads (bij &ldquo;klant gesproken&rdquo;/&ldquo;nieuwe klant benaderd&rdquo;) — mits die lead een geschatte
                    waarde heeft. Elke klant/offerte telt maar 1x mee, ook bij meerdere contactmomenten.
                  </p>
                </div>
              )}

              {/* Kosten vs. resultaat (ROI) — alleen tonen als er een uurtarief bekend is */}
              {m.uurtarief != null && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="flex items-center gap-1.5 mb-2">
                    <TrendingUp className="h-3.5 w-3.5 text-gray-400" />
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Kosten t.o.v. resultaat (deze maand)</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div>
                      <p className="text-lg font-bold text-gray-900">{urenDezeMaand}u</p>
                      <p className="text-xs text-gray-400">gewerkt (à {formatCurrency(m.uurtarief)}/u)</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-gray-900">{kosten != null ? formatCurrency(kosten) : '-'}</p>
                      <p className="text-xs text-gray-400">kosten</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-gray-900">{totaalActiviteiten}</p>
                      <p className="text-xs text-gray-400">resultaten totaal</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-gray-900">{kostenPerActie != null ? formatCurrency(kostenPerActie) : '-'}</p>
                      <p className="text-xs text-gray-400">kosten per resultaat</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-gray-900">{rendement != null ? `${rendement.toFixed(1)}x` : '-'}</p>
                      <p className="text-xs text-gray-400">potentiële omzet / kosten</p>
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-2">
                    Gebaseerd op uren geregistreerd bij Urenregistratie × uurtarief. &ldquo;Potentiële omzet / kosten&rdquo; is
                    een indicatie, geen gerealiseerde omzet — offertes kunnen nog afgewezen worden en geschatte leadwaarden
                    zijn schattingen.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={editing?.doelId ? 'Doel bewerken' : 'Doel instellen'}>
        {editing && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Select
              name="medewerker_id"
              label="Medewerker"
              required
              defaultValue={editing.medewerkerId}
              options={medewerkers.map(m => ({ value: m.id, label: m.naam }))}
            />
            <Select
              name="activiteit_type"
              label="Soort activiteit"
              required
              defaultValue={nieuweSoort ? '__nieuw__' : editing.type}
              onChange={e => setNieuweSoort(e.target.value === '__nieuw__')}
              options={[
                ...Object.entries(labels).map(([value, label]) => ({ value, label })),
                { value: '__nieuw__', label: '+ Nieuwe soort...' },
              ]}
            />
            {nieuweSoort && (
              <Input name="nieuwe_type_naam" label="Naam nieuwe soort" placeholder="bijv. facturen_verstuurd" defaultValue={!Object.keys(labels).includes(editing.type) ? editing.type : ''} />
            )}
            <Input name="dag_doel" label="Dagdoel" type="number" step="1" min="0" defaultValue={editing.dagDoel || ''} placeholder="bijv. 25" />
            <p className="text-xs text-gray-400 -mt-2">Maanddoel wordt automatisch berekend: dagdoel × {werkdagenDezeMaand} werkdagen deze maand.</p>
            <div className="flex items-center justify-between pt-2 border-t border-gray-200">
              {editing?.doelId ? (
                <Button type="button" variant="ghost" onClick={handleDelete} disabled={deleting || saving} className="text-red-600 hover:text-red-700">
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Verwijderen
                </Button>
              ) : <div />}
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>Annuleren</Button>
                <Button type="submit" disabled={saving || deleting}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Opslaan
                </Button>
              </div>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  )
}
