'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import {
  saveInstellingen, resetInstellingen,
  saveAdministratie, saveNummering, createGebruiker, deleteGebruiker, updateGebruiker,
} from '@/lib/actions'
import {
  INSTELLINGEN,
  instellingGroepen,
  standaardInstellingen,
  type InstellingDef,
  type InstellingWaarde,
  type InstellingWaarden,
} from '@/lib/instellingen'
import { Save, RotateCcw, Loader2, Lock, Plus, Trash2, UserPlus, Pencil, KeyRound } from 'lucide-react'

interface Administratie {
  id: string
  naam: string
  kvk_nummer: string | null
  btw_nummer: string | null
  adres: string | null
  postcode: string | null
  plaats: string | null
  telefoon: string | null
  email: string | null
  website: string | null
  iban: string | null
}

interface Nummering {
  id: string
  type: string
  prefix: string
  volgend_nummer: number
}

interface Gebruiker {
  id: string
  naam: string
  email: string
  rol: string
}

// Lijst-instellingen zijn arrays; die moeten op inhoud vergeleken worden,
// anders blijft "gewijzigd" hangen zodra je één regel typt en weer terugzet.
function zelfdeWaarde(a: InstellingWaarde, b: InstellingWaarde): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    const la = Array.isArray(a) ? a : []
    const lb = Array.isArray(b) ? b : []
    const schoon = (l: string[]) => l.map(r => r.trim().toLowerCase()).filter(Boolean)
    return JSON.stringify(schoon(la)) === JSON.stringify(schoon(lb))
  }
  return a === b
}

// Beheer (bedrijfsgegevens/gebruikers/nummering) is samengevoegd met de
// instellingen-groepen tot één tabbenblad — was voorheen een losse pagina
// (/beheer) naast /instellingen (12-08-2026).
const BEHEER_TABS = [
  { key: 'bedrijf' as const, label: 'Bedrijfsgegevens' },
  { key: 'gebruikers' as const, label: 'Gebruikers' },
  { key: 'nummering' as const, label: 'Nummering' },
]

export function InstellingenView({
  waarden: initieel,
  magBewerken,
  administratie,
  nummering,
  gebruikers,
}: {
  waarden: InstellingWaarden
  magBewerken: boolean
  administratie: Administratie | null
  nummering: Nummering[]
  gebruikers: Gebruiker[]
}) {
  const tabs = [...BEHEER_TABS, ...instellingGroepen.map(g => ({ key: g.key, label: g.label }))]
  const [tab, setTab] = useState<string>(tabs[0].key)

  // Instellingen-groepen (E-mail, Relaties, Offertes, ...)
  const [waarden, setWaarden] = useState<InstellingWaarden>({ ...standaardInstellingen(), ...initieel })
  const [opgeslagen, setOpgeslagen] = useState<InstellingWaarden>({ ...standaardInstellingen(), ...initieel })
  const [busy, setBusy] = useState(false)
  const [melding, setMelding] = useState('')
  const [fout, setFout] = useState('')

  const gewijzigd = INSTELLINGEN
    .filter(d => !zelfdeWaarde(waarden[d.sleutel], opgeslagen[d.sleutel]))
    .map(d => d.sleutel)

  function zet(sleutel: string, waarde: InstellingWaarde) {
    setWaarden(v => ({ ...v, [sleutel]: waarde }))
    setMelding(''); setFout('')
  }

  async function opslaan() {
    if (gewijzigd.length === 0) return
    setBusy(true); setMelding(''); setFout('')
    const patch: InstellingWaarden = {}
    for (const s of gewijzigd) patch[s] = waarden[s]
    const result = await saveInstellingen(patch)
    setBusy(false)
    if ('error' in result && result.error) { setFout(result.error); return }
    setOpgeslagen({ ...waarden })
    setMelding(`${gewijzigd.length} ${gewijzigd.length === 1 ? 'instelling' : 'instellingen'} opgeslagen`)
  }

  async function herstelStandaard() {
    if (!confirm('Alle instellingen terugzetten naar de standaardwaarden?')) return
    setBusy(true); setMelding(''); setFout('')
    const result = await resetInstellingen(INSTELLINGEN.map(d => d.sleutel))
    setBusy(false)
    if ('error' in result && result.error) { setFout(result.error); return }
    const std = standaardInstellingen()
    setWaarden(std)
    setOpgeslagen(std)
    setMelding('Standaardwaarden hersteld')
  }

  // Beheer: bedrijfsgegevens / gebruikers / nummering
  const [beheerLoading, setBeheerLoading] = useState(false)
  const [beheerSuccess, setBeheerSuccess] = useState('')
  const [beheerError, setBeheerError] = useState('')
  const [showNewUser, setShowNewUser] = useState(false)
  const [bewerkUser, setBewerkUser] = useState<Gebruiker | null>(null)
  const [bewerkNaam, setBewerkNaam] = useState('')
  const [bewerkEmail, setBewerkEmail] = useState('')
  const [bewerkRol, setBewerkRol] = useState('gebruiker')
  const [bewerkWachtwoord, setBewerkWachtwoord] = useState('')

  function openBewerk(g: Gebruiker) {
    setBewerkUser(g)
    setBewerkNaam(g.naam || '')
    setBewerkEmail(g.email || '')
    setBewerkRol(g.rol || 'gebruiker')
    setBewerkWachtwoord('')
    setBeheerError(''); setBeheerSuccess('')
  }

  async function handleUpdateGebruiker() {
    if (!bewerkUser) return
    setBeheerLoading(true); setBeheerError(''); setBeheerSuccess('')
    const result = await updateGebruiker(bewerkUser.id, {
      naam: bewerkNaam,
      rol: bewerkRol,
      email: bewerkEmail,
      // Leeg laten = wachtwoord ongemoeid laten.
      wachtwoord: bewerkWachtwoord || undefined,
    })
    setBeheerLoading(false)
    if (result.error) { setBeheerError(result.error); return }
    setBeheerSuccess(
      bewerkWachtwoord
        ? `Account van ${bewerkNaam} bijgewerkt (ook het wachtwoord)`
        : `Account van ${bewerkNaam} bijgewerkt`,
    )
    setBewerkUser(null)
  }

  async function handleSaveBedrijf(formData: FormData) {
    setBeheerLoading(true); setBeheerError(''); setBeheerSuccess('')
    const result = await saveAdministratie(formData)
    if (result.error) setBeheerError(result.error)
    else setBeheerSuccess('Bedrijfsgegevens opgeslagen')
    setBeheerLoading(false)
  }

  async function handleSaveNummering(formData: FormData) {
    setBeheerLoading(true); setBeheerError(''); setBeheerSuccess('')
    const result = await saveNummering(formData)
    if (result.error) setBeheerError(result.error)
    else setBeheerSuccess('Nummering opgeslagen')
    setBeheerLoading(false)
  }

  async function handleCreateGebruiker(formData: FormData) {
    setBeheerLoading(true); setBeheerError(''); setBeheerSuccess('')
    const result = await createGebruiker(formData)
    if (result.error) setBeheerError(result.error)
    else {
      setBeheerSuccess('Gebruiker aangemaakt')
      setShowNewUser(false)
    }
    setBeheerLoading(false)
  }

  async function handleDeleteGebruiker(id: string) {
    if (!confirm('Weet u zeker dat u deze gebruiker wilt verwijderen?')) return
    setBeheerLoading(true); setBeheerError(''); setBeheerSuccess('')
    const result = await deleteGebruiker(id)
    if (result.error) setBeheerError(result.error)
    else setBeheerSuccess('Gebruiker verwijderd')
    setBeheerLoading(false)
  }

  const typeLabels: Record<string, string> = {
    offerte: 'Offertes',
    order: 'Orders',
    factuur: 'Facturen',
    inkoopfactuur: 'Inkoopfacturen',
    boeking: 'Boekingen',
  }

  const rolLabels: Record<string, string> = {
    admin: 'Admin',
    gebruiker: 'Gebruiker',
    readonly: 'Alleen lezen',
  }

  const actieveGroep = instellingGroepen.find(g => g.key === tab)

  return (
    <div className="pb-24">
      <PageHeader
        title="Instellingen"
        description="Beheer, functies en standaardwaarden op één plek"
        actions={
          actieveGroep && magBewerken ? (
            <Button variant="secondary" onClick={herstelStandaard} disabled={busy}>
              <RotateCcw className="h-4 w-4" />
              Standaard herstellen
            </Button>
          ) : null
        }
      />

      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm rounded-md transition-colors ${tab === t.key ? 'bg-primary text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'bedrijf' && (
        <>
          {beheerSuccess && <div className="bg-green-50 text-green-600 text-sm p-3 rounded-md mb-4">{beheerSuccess}</div>}
          {beheerError && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4">{beheerError}</div>}
          <form action={handleSaveBedrijf}>
            <Card>
              <CardContent className="space-y-4 pt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input id="naam" name="naam" label="Bedrijfsnaam *" defaultValue={administratie?.naam || ''} required />
                  <Input id="kvk_nummer" name="kvk_nummer" label="KVK-nummer" defaultValue={administratie?.kvk_nummer || ''} />
                  <Input id="btw_nummer" name="btw_nummer" label="BTW-nummer" defaultValue={administratie?.btw_nummer || ''} />
                  <Input id="email" name="email" label="E-mail" type="email" defaultValue={administratie?.email || ''} />
                  <Input id="telefoon" name="telefoon" label="Telefoon" defaultValue={administratie?.telefoon || ''} />
                  <Input id="website" name="website" label="Website" defaultValue={administratie?.website || ''} />
                  <Input id="adres" name="adres" label="Adres" defaultValue={administratie?.adres || ''} />
                  <Input id="postcode" name="postcode" label="Postcode" defaultValue={administratie?.postcode || ''} />
                  <Input id="plaats" name="plaats" label="Plaats" defaultValue={administratie?.plaats || ''} />
                  <Input id="iban" name="iban" label="IBAN" defaultValue={administratie?.iban || ''} />
                </div>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button type="submit" disabled={beheerLoading}>
                  <Save className="h-4 w-4" />
                  {beheerLoading ? 'Opslaan...' : 'Opslaan'}
                </Button>
              </CardFooter>
            </Card>
          </form>
        </>
      )}

      {tab === 'gebruikers' && (
        <div>
          {beheerSuccess && <div className="bg-green-50 text-green-600 text-sm p-3 rounded-md mb-4">{beheerSuccess}</div>}
          {beheerError && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4">{beheerError}</div>}
          <div className="flex justify-end mb-4">
            <Button onClick={() => setShowNewUser(true)}>
              <UserPlus className="h-4 w-4" />
              Nieuwe gebruiker
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Naam</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">E-mail</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Rol</th>
                    <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-3">Acties</th>
                  </tr>
                </thead>
                <tbody>
                  {gebruikers.map((g) => (
                    <tr key={g.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-6 py-3 text-sm font-medium text-gray-900">{g.naam}</td>
                      <td className="px-6 py-3 text-sm text-gray-600">{g.email}</td>
                      <td className="px-6 py-3"><Badge status={g.rol}>{rolLabels[g.rol] || g.rol}</Badge></td>
                      <td className="px-6 py-3">
                        <div className="flex items-center justify-end gap-3">
                          <button
                            onClick={() => openBewerk(g)}
                            title="Naam, e-mail, rol of wachtwoord wijzigen"
                            className="text-gray-400 hover:text-primary transition-colors"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteGebruiker(g.id)}
                            title="Account verwijderen"
                            className="text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {gebruikers.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-gray-500 text-sm">
                        Geen gebruikers gevonden
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Dialog
            open={!!bewerkUser}
            onClose={() => { if (!beheerLoading) setBewerkUser(null) }}
            title={`Account bewerken — ${bewerkUser?.naam || ''}`}
          >
            <div className="space-y-4">
              <Input
                id="bewerk-naam"
                name="naam"
                label="Naam"
                value={bewerkNaam}
                onChange={e => setBewerkNaam(e.target.value)}
              />
              <Input
                id="bewerk-email"
                name="email"
                label="E-mailadres"
                type="email"
                value={bewerkEmail}
                onChange={e => setBewerkEmail(e.target.value)}
              />
              <p className="-mt-2 text-xs text-gray-500">
                Hiermee logt deze persoon in. Het adres wordt direct actief; er gaat geen
                bevestigingsmail heen.
              </p>
              <Select
                id="bewerk-rol"
                name="rol"
                label="Rol"
                value={bewerkRol}
                onChange={e => setBewerkRol(e.target.value)}
                options={[
                  { value: 'admin', label: 'Admin' },
                  { value: 'gebruiker', label: 'Gebruiker' },
                  { value: 'readonly', label: 'Alleen lezen' },
                  { value: 'medewerker', label: 'Medewerker' },
                ]}
              />

              <div className="pt-2 border-t">
                <div className="flex items-center gap-2 mb-1">
                  <KeyRound className="h-4 w-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-700">Wachtwoord wijzigen</span>
                </div>
                <Input
                  id="bewerk-wachtwoord"
                  name="wachtwoord"
                  label=""
                  type="password"
                  placeholder="Leeg laten = ongewijzigd"
                  value={bewerkWachtwoord}
                  onChange={e => setBewerkWachtwoord(e.target.value)}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Minimaal 8 tekens. Het nieuwe wachtwoord wordt niet gemaild — geef het zelf door.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button type="button" variant="secondary" onClick={() => setBewerkUser(null)} disabled={beheerLoading}>
                Annuleren
              </Button>
              <Button type="button" onClick={handleUpdateGebruiker} disabled={beheerLoading}>
                <Save className="h-4 w-4" />
                {beheerLoading ? 'Opslaan...' : 'Opslaan'}
              </Button>
            </div>
          </Dialog>

          <Dialog open={showNewUser} onClose={() => setShowNewUser(false)} title="Nieuwe gebruiker">
            <form action={handleCreateGebruiker}>
              <div className="space-y-4">
                <Input id="new-naam" name="naam" label="Naam *" required />
                <Input id="new-email" name="email" label="E-mail *" type="email" required />
                <Input id="new-wachtwoord" name="wachtwoord" label="Wachtwoord *" type="password" required />
                <Select
                  id="new-rol"
                  name="rol"
                  label="Rol"
                  defaultValue="gebruiker"
                  options={[
                    { value: 'admin', label: 'Admin' },
                    { value: 'gebruiker', label: 'Gebruiker' },
                    { value: 'readonly', label: 'Alleen lezen' },
                  ]}
                />
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" name="stuur_email" value="true" defaultChecked className="rounded border-gray-300" />
                  Stuur inloggegevens per e-mail
                </label>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <Button type="button" variant="secondary" onClick={() => setShowNewUser(false)}>
                  Annuleren
                </Button>
                <Button type="submit" disabled={beheerLoading}>
                  <Plus className="h-4 w-4" />
                  {beheerLoading ? 'Aanmaken...' : 'Aanmaken'}
                </Button>
              </div>
            </form>
          </Dialog>
        </div>
      )}

      {tab === 'nummering' && (
        <div className="space-y-4">
          {beheerSuccess && <div className="bg-green-50 text-green-600 text-sm p-3 rounded-md mb-4">{beheerSuccess}</div>}
          {beheerError && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4">{beheerError}</div>}
          {nummering.map((n) => (
            <form key={n.id} action={handleSaveNummering}>
              <input type="hidden" name="id" value={n.id} />
              <Card>
                <CardContent className="pt-6">
                  <h3 className="font-medium text-gray-900 mb-3">{typeLabels[n.type] || n.type}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Input id={`prefix-${n.id}`} name="prefix" label="Prefix" defaultValue={n.prefix} />
                    <Input id={`nummer-${n.id}`} name="volgend_nummer" label="Volgend nummer" type="number" defaultValue={n.volgend_nummer} />
                    <div className="flex items-end">
                      <Button type="submit" size="sm" disabled={beheerLoading}>
                        <Save className="h-3 w-3" />
                        Opslaan
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </form>
          ))}
          {nummering.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-gray-500">
                Geen nummeringinstellingen gevonden. Deze worden automatisch aangemaakt bij registratie.
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {actieveGroep && (() => {
        const items = INSTELLINGEN.filter(d => d.groep === actieveGroep.key)
        return (
          <div>
            {!magBewerken && (
              <div className="mb-4 flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm p-3 rounded-md">
                <Lock className="h-4 w-4 flex-shrink-0" />
                U kunt de instellingen bekijken maar niet wijzigen. Vraag een beheerder om aanpassingen.
              </div>
            )}
            {melding && <div className="mb-4 bg-green-50 text-green-700 text-sm p-3 rounded-md">{melding}</div>}
            {fout && <div className="mb-4 bg-red-50 text-red-600 text-sm p-3 rounded-md">{fout}</div>}

            <Card>
              <CardContent className="pt-6">
                <div className="mb-4">
                  <h2 className="text-base font-semibold text-gray-900">{actieveGroep.label}</h2>
                  <p className="text-sm text-gray-500 mt-0.5">{actieveGroep.uitleg}</p>
                </div>
                <div className="divide-y divide-gray-100">
                  {items.map(def => {
                    // Afhankelijke instellingen blijven zichtbaar maar worden
                    // grijs zodra de bovenliggende schakelaar uit staat.
                    const geblokkeerd = !!def.afhankelijkVan && waarden[def.afhankelijkVan] !== true
                    return (
                      <InstellingRij
                        key={def.sleutel}
                        def={def}
                        waarde={waarden[def.sleutel]}
                        onChange={v => zet(def.sleutel, v)}
                        disabled={!magBewerken || busy || geblokkeerd}
                        gewijzigd={gewijzigd.includes(def.sleutel)}
                      />
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        )
      })()}

      {/* Vaste opslaan-balk: verschijnt zodra er iets in een instellingen-groep
          gewijzigd is, ook als je ondertussen naar een andere tab wisselt. */}
      {magBewerken && gewijzigd.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-gray-200 bg-white/95 backdrop-blur px-4 py-3 md:pl-64">
          <div className="flex items-center justify-between gap-4 max-w-5xl mx-auto">
            <span className="text-sm text-gray-600">
              <strong>{gewijzigd.length}</strong> {gewijzigd.length === 1 ? 'wijziging' : 'wijzigingen'} nog niet opgeslagen
            </span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setWaarden({ ...opgeslagen })} disabled={busy}>
                Ongedaan maken
              </Button>
              <Button onClick={opslaan} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Opslaan
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InstellingRij({
  def,
  waarde,
  onChange,
  disabled,
  gewijzigd,
}: {
  def: InstellingDef
  waarde: InstellingWaarde
  onChange: (v: InstellingWaarde) => void
  disabled: boolean
  gewijzigd: boolean
}) {
  return (
    <div className={`flex items-start justify-between gap-6 py-4 ${disabled ? 'opacity-50' : ''}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-900">{def.label}</p>
          {gewijzigd && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
              gewijzigd
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-1 leading-relaxed">{def.uitleg}</p>
      </div>

      <div className="flex-shrink-0 pt-0.5">
        {def.type === 'boolean' && (
          <Toggle checked={waarde === true} onChange={onChange} disabled={disabled} label={def.label} />
        )}

        {def.type === 'number' && (
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={String(waarde)}
              min={def.min}
              max={def.max}
              disabled={disabled}
              onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-24 px-2 py-1.5 text-sm text-right border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-50"
            />
            {def.eenheid && <span className="text-xs text-gray-500 w-12">{def.eenheid}</span>}
          </div>
        )}

        {def.type === 'text' && (
          <input
            type="text"
            value={String(waarde)}
            disabled={disabled}
            onChange={e => onChange(e.target.value)}
            className="w-64 px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-50"
          />
        )}

        {def.type === 'lijst' && (
          <div>
            <textarea
              value={Array.isArray(waarde) ? waarde.join('\n') : String(waarde)}
              disabled={disabled}
              rows={Math.min(12, Math.max(3, (Array.isArray(waarde) ? waarde.length : 1) + 1))}
              placeholder={def.voorbeeld}
              // Tijdens typen blijft het een tekstblok; pas bij opslaan wordt het
              // via valideerInstelling een ontdubbelde lijst.
              onChange={e => onChange(e.target.value.split('\n'))}
              className="w-72 px-2 py-1.5 text-sm font-mono border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-50"
            />
            <p className="text-[11px] text-gray-400 mt-1 text-right">
              {(Array.isArray(waarde) ? waarde.filter(r => r.trim()) : []).length} regels — één per regel
            </p>
          </div>
        )}

        {def.type === 'select' && (
          <select
            value={String(waarde)}
            disabled={disabled}
            onChange={e => onChange(e.target.value)}
            className="px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-50"
          >
            {def.opties?.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled: boolean
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed ${
        checked ? 'bg-primary' : 'bg-gray-300'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform mt-0.5 ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}
