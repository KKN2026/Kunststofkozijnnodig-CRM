'use client'

import { useState, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { useRouter } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency, formatDate } from '@/lib/utils'
import { deleteProject } from '@/lib/actions'
import { Plus, FolderKanban, Trash2, FileText } from 'lucide-react'

interface Project {
  id: string
  naam: string
  status: string
  created_at: string
  budget: number | null
  uurtarief: number | null
  relatie_id: string | null
  relatie: { bedrijfsnaam: string } | null
  medewerker: { naam: string } | null
  aantal_offertes: number
  laatste_offerte_id: string | null
  laatste_offerte_nummer: string | null
  laatste_offerte_status: string | null
  laatste_offerte_bedrag: number | null
  betaal_status: 'betaald' | 'deels_betaald' | 'openstaand' | null
}

const statusFilters = [
  { value: 'alle', label: 'Alle' },
  { value: 'actief', label: 'Actief' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'afgerond', label: 'Afgerond' },
  { value: 'geannuleerd', label: 'Geannuleerd' },
]

export function ProjectList({ projecten }: { projecten: Project[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const filter = searchParams.get('filter')
  const zonderOfferte = filter === 'zonder_offerte'
  const [statusFilter, setStatusFilter] = useState('actief')
  // Vooringevuld via ?medewerker=Naam (bv. vanuit het dashboard-widget).
  const [medewerkerFilter, setMedewerkerFilter] = useState(searchParams.get('medewerker') || '')

  let gefilterd = zonderOfferte
    ? projecten.filter(p => p.status === 'actief' && p.aantal_offertes === 0)
    : statusFilter === 'alle'
      ? projecten
      : projecten.filter(p => p.status === statusFilter)
  if (medewerkerFilter) gefilterd = gefilterd.filter(p => (p.medewerker?.naam || 'Niet toegewezen') === medewerkerFilter)

  // Open verkoopkansen (actief + on hold) per medewerker: aantal + offertewaarde.
  // Zelfde idee als 'Taken per collega' — klik filtert de tabel op die medewerker.
  const perMedewerker = useMemo(() => {
    const open = projecten.filter(p => p.status === 'actief' || p.status === 'on_hold')
    const map = new Map<string, { naam: string; aantal: number; waarde: number }>()
    for (const p of open) {
      const naam = p.medewerker?.naam || 'Niet toegewezen'
      if (!map.has(naam)) map.set(naam, { naam, aantal: 0, waarde: 0 })
      const entry = map.get(naam)!
      entry.aantal++
      entry.waarde += p.laatste_offerte_bedrag || 0
    }
    return [...map.values()].sort((a, b) => b.waarde - a.waarde)
  }, [projecten])

  // Trend: nieuwe verkoopkansen per medewerker, laatste 6 maanden (op
  // aanmaakdatum — dus alle statussen, niet alleen open, zodat je ook ziet wie
  // er de afgelopen tijd actief nieuwe kansen heeft binnengehaald).
  const MAAND_KORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
  const laatste6Maanden = useMemo(() => {
    const nu = new Date()
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(nu.getFullYear(), nu.getMonth() - (5 - i), 1)
      return { sleutel: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: MAAND_KORT[d.getMonth()] }
    })
  }, [])
  const perMedewerkerPerMaand = useMemo(() => {
    const namen = [...new Set(projecten.map(p => p.medewerker?.naam || 'Niet toegewezen'))].sort()
    return namen.map(naam => ({
      naam,
      maanden: laatste6Maanden.map(({ sleutel }) => {
        const inMaand = projecten.filter(p => (p.medewerker?.naam || 'Niet toegewezen') === naam && (p.created_at || '').slice(0, 7) === sleutel)
        return { aantal: inMaand.length, waarde: inMaand.reduce((s, p) => s + (p.laatste_offerte_bedrag || 0), 0) }
      }),
    }))
  }, [projecten, laatste6Maanden])
  const totaalPerMaand = useMemo(() => laatste6Maanden.map((_, i) => ({
    aantal: perMedewerkerPerMaand.reduce((s, r) => s + r.maanden[i].aantal, 0),
    waarde: perMedewerkerPerMaand.reduce((s, r) => s + r.maanden[i].waarde, 0),
  })), [perMedewerkerPerMaand, laatste6Maanden])

  async function handleDelete(e: React.MouseEvent, project: Project) {
    e.stopPropagation()
    if (!confirm(`Weet u zeker dat u "${project.naam}" wilt verwijderen?`)) return
    const result = await deleteProject(project.id)
    if (result.error) alert(result.error)
    else router.refresh()
  }

  function handleNewOfferte(e: React.MouseEvent, project: Project) {
    e.stopPropagation()
    router.push(`/offertes/nieuw?project_id=${project.id}&relatie_id=${project.relatie_id || ''}`)
  }

  const columns: ColumnDef<Project, unknown>[] = [
    { accessorKey: 'naam', header: 'Verkoopkans' },
    { id: 'relatie', header: 'Klant', accessorFn: (row) => row.relatie?.bedrijfsnaam || '-' },
    { id: 'medewerker', header: 'Toegewezen aan', accessorFn: (row) => row.medewerker?.naam || '', cell: ({ row }) => row.original.medewerker?.naam ? <span className="text-gray-700">{row.original.medewerker.naam}</span> : <span className="text-gray-400">-</span> },
    { id: 'datum', header: 'Datum', accessorFn: (row) => row.created_at, cell: ({ row }) => <span className="text-gray-500">{formatDate(row.original.created_at)}</span> },
    { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <Badge status={getValue() as string} /> },
    {
      id: 'offerte',
      header: 'Laatste offerte',
      accessorFn: (row) => row.laatste_offerte_nummer,
      cell: ({ row }) => {
        const { laatste_offerte_nummer, laatste_offerte_status, laatste_offerte_bedrag } = row.original
        if (!laatste_offerte_nummer) return <span className="text-gray-400">-</span>
        return (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{laatste_offerte_nummer}</span>
            {laatste_offerte_status && <Badge status={laatste_offerte_status} />}
            {laatste_offerte_bedrag != null && laatste_offerte_bedrag > 0 && (
              <span className="text-sm text-gray-500">{formatCurrency(laatste_offerte_bedrag)}</span>
            )}
          </div>
        )
      },
    },
    {
      id: 'betaling',
      header: 'Betaling',
      accessorFn: (row) => row.betaal_status,
      cell: ({ row }) => {
        const status = row.original.betaal_status
        if (!status) return <span className="text-gray-400">-</span>
        const label = status === 'deels_betaald' ? 'Deels betaald' : status === 'openstaand' ? 'Openstaand' : 'Betaald'
        return <Badge status={status}>{label}</Badge>
      },
    },
    {
      id: 'acties',
      header: '',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          {!row.original.laatste_offerte_nummer && (
            <button
              onClick={(e) => handleNewOfferte(e, row.original)}
              className="opacity-0 group-hover/row:opacity-100 text-gray-400 hover:text-primary transition-all p-1 rounded"
              title="Offerte aanmaken"
            >
              <FileText className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={(e) => handleDelete(e, row.original)}
            className="opacity-0 group-hover/row:opacity-100 text-gray-400 hover:text-red-500 transition-all p-1 rounded"
            title="Verwijderen"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
      size: 80,
    },
  ]

  // Tellingen per status
  const counts = statusFilters.map(f => ({
    ...f,
    count: f.value === 'alle' ? projecten.length : projecten.filter(p => p.status === f.value).length,
  }))

  return (
    <div>
      <PageHeader
        title={zonderOfferte ? 'Verkoopkansen zonder offerte' : 'Verkoopkansen'}
        description={zonderOfferte ? `${gefilterd.length} actieve verkoopkansen zonder offerte` : 'Overzicht van alle verkoopkansen'}
        actions={
          zonderOfferte ? (
            <Button variant="ghost" onClick={() => router.push('/projecten')}>Alle verkoopkansen</Button>
          ) : (
            <div className="flex gap-2 flex-wrap">
              <Button variant="ghost" size="sm" onClick={() => router.push('/projecten/kanban')}>Kanban</Button>
              <Button onClick={() => router.push('/projecten/nieuw')}><Plus className="h-4 w-4" />Nieuwe verkoopkans</Button>
            </div>
          )
        }
      />

      {!zonderOfferte && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card
            role="button"
            tabIndex={0}
            onClick={() => setStatusFilter(statusFilter === 'actief' ? 'alle' : 'actief')}
            className={`cursor-pointer hover:border-primary/40 hover:shadow transition-all text-left w-full ${statusFilter === 'actief' ? 'border-primary/40 ring-1 ring-primary/20' : ''}`}
          >
            <CardContent>
              <p className="text-sm text-gray-500">Actief</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{counts.find(c => c.value === 'actief')?.count ?? 0}</p>
              <p className="text-xs text-gray-400 mt-1">klik om te filteren</p>
            </CardContent>
          </Card>
          <Card
            role="button"
            tabIndex={0}
            onClick={() => setStatusFilter(statusFilter === 'on_hold' ? 'alle' : 'on_hold')}
            className={`cursor-pointer hover:border-primary/40 hover:shadow transition-all text-left w-full ${statusFilter === 'on_hold' ? 'border-primary/40 ring-1 ring-primary/20' : ''}`}
          >
            <CardContent>
              <p className="text-sm text-gray-500">On hold</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{counts.find(c => c.value === 'on_hold')?.count ?? 0}</p>
              <p className="text-xs text-gray-400 mt-1">klik om te filteren</p>
            </CardContent>
          </Card>
          <Card
            role="button"
            tabIndex={0}
            onClick={() => setStatusFilter('actief')}
            className="cursor-pointer hover:border-primary/40 hover:shadow transition-all text-left w-full"
          >
            <CardContent>
              <p className="text-sm text-gray-500">Offertewaarde open kansen</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {formatCurrency(projecten.filter(p => p.status === 'actief' || p.status === 'on_hold').reduce((s, p) => s + (p.laatste_offerte_bedrag || 0), 0))}
              </p>
              <p className="text-xs text-gray-400 mt-1">actief + on hold</p>
            </CardContent>
          </Card>
          <Card
            role="button"
            tabIndex={0}
            onClick={() => router.push('/projecten?filter=zonder_offerte')}
            className="cursor-pointer hover:border-primary/40 hover:shadow transition-all text-left w-full"
          >
            <CardContent>
              <p className="text-sm text-gray-500">Zonder offerte</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{projecten.filter(p => p.status === 'actief' && p.aantal_offertes === 0).length}</p>
              <p className="text-xs text-gray-400 mt-1">actief, nog geen offerte</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Open verkoopkansen per medewerker: wie heeft wat, en welke offertewaarde
          staat daar open. Klik filtert de tabel op die medewerker (nogmaals
          klikken heft het weer op). */}
      {!zonderOfferte && perMedewerker.length > 1 && (
        <div className="mb-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-px bg-gray-100 rounded-xl overflow-hidden border border-gray-100">
          {perMedewerker.map(m => {
            const geselecteerd = medewerkerFilter === m.naam
            return (
              <button
                key={m.naam}
                type="button"
                onClick={() => setMedewerkerFilter(geselecteerd ? '' : m.naam)}
                className={`text-left px-4 py-3 transition-colors ${geselecteerd ? 'bg-[#00a66e] text-white' : 'bg-white hover:bg-gray-50'}`}
              >
                <p className={`text-xs truncate ${geselecteerd ? 'text-white/80' : 'text-gray-500'}`}>{m.naam}</p>
                <p className={`text-xl font-bold mt-0.5 ${geselecteerd ? 'text-white' : 'text-gray-900'}`}>{formatCurrency(m.waarde)}</p>
                <p className={`text-[11px] mt-0.5 ${geselecteerd ? 'text-white/70' : 'text-gray-400'}`}>{m.aantal} open kansen</p>
              </button>
            )
          })}
        </div>
      )}

      {/* Trend: nieuwe verkoopkansen per medewerker per maand (laatste 6
          maanden) — laat zien wie er de laatste tijd actief bijhaalt, niet
          alleen de huidige stand. */}
      {!zonderOfferte && perMedewerkerPerMaand.length > 1 && (
        <Card className="mb-6">
          <CardContent>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Nieuwe verkoopkansen per medewerker per maand</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-2 font-medium">Medewerker</th>
                    {laatste6Maanden.map(m => (
                      <th key={m.sleutel} className="pb-2 font-medium text-right">{m.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {perMedewerkerPerMaand.map(rij => (
                    <tr key={rij.naam} className="border-b border-gray-100">
                      <td className="py-2 font-medium">{rij.naam}</td>
                      {rij.maanden.map((cel, i) => (
                        <td key={i} className="py-2 text-right">
                          {cel.aantal > 0 ? (
                            <span title={formatCurrency(cel.waarde)}>{cel.aantal}</span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="border-t-2 border-gray-300 font-semibold">
                    <td className="py-2">Totaal</td>
                    {totaalPerMaand.map((cel, i) => (
                      <td key={i} className="py-2 text-right">
                        {cel.aantal > 0 ? <span title={formatCurrency(cel.waarde)}>{cel.aantal}</span> : <span className="text-gray-300">-</span>}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400 mt-2">Aantal nieuwe verkoopkansen op aanmaakdatum · hover op een getal voor de offertewaarde</p>
          </CardContent>
        </Card>
      )}

      {!zonderOfferte && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {counts.map(f => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                statusFilter === f.value
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label} ({f.count})
            </button>
          ))}
        </div>
      )}

      {gefilterd.length === 0 && projecten.length > 0 ? (
        <EmptyState icon={FolderKanban} title="Geen verkoopkansen" description={`Geen verkoopkansen met status "${statusFilters.find(f => f.value === statusFilter)?.label}".`} />
      ) : projecten.length === 0 ? (
        <EmptyState icon={FolderKanban} title="Geen verkoopkansen" description="U heeft nog geen verkoopkansen." action={<Button onClick={() => router.push('/projecten/nieuw')}><Plus className="h-4 w-4" />Verkoopkans aanmaken</Button>} />
      ) : (
        <DataTable columns={columns} data={gefilterd} searchPlaceholder="Zoek op naam of klant..." onRowClick={(row) => router.push(`/projecten/${row.id}`)} />
      )}
    </div>
  )
}
