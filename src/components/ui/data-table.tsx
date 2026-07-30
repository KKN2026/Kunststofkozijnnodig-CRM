'use client'

import { useState, useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type FilterFn,
} from '@tanstack/react-table'
import { ArrowUpDown, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

// Zoeken moet werken ondanks leestekens: klantnamen als "A. Bax", "A.G. Allround"
// of "'t Schippersrijk B.V." vielen buiten de boot omdat de standaardfilter
// letterlijk vergelijkt — "ag" vond "A.G." niet en "abax" vond "A. Bax" niet.
// Door aan beide kanten alles behalve letters en cijfers weg te halen (en
// accenten te normaliseren) maakt het niet meer uit hoe iets geschreven is.
function normaliseerZoek(waarde: string): string {
  return waarde
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const zoekFilter: FilterFn<any> = (row, columnId, filterValue) => {
  const zoek = normaliseerZoek(String(filterValue ?? ''))
  if (!zoek) return true
  const waarde = row.getValue(columnId)
  if (waarde === null || waarde === undefined) return false
  return normaliseerZoek(String(waarde)).includes(zoek)
}

interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[]
  data: T[]
  searchPlaceholder?: string
  onRowClick?: (row: T) => void
  // Optionele bulk-selectie: als getRowId is meegegeven krijgen rijen
  // checkboxes en wordt onSelectionChange aangeroepen met geselecteerde IDs.
  selectable?: boolean
  getRowId?: (row: T) => string
  onSelectionChange?: (selectedIds: string[]) => void
  // Bulk-acties balk die boven de tabel verschijnt zodra ≥1 rij geselecteerd is
  bulkActions?: (selectedIds: string[], clearSelection: () => void) => React.ReactNode
  // Op mobiel kan een card-renderer meegegeven worden ter vervanging van de
  // horizontale tabel. Indien niet meegegeven: tabel blijft, gewoon horizontaal scrollen.
  mobileCard?: (row: T) => {
    title: React.ReactNode
    subtitle?: React.ReactNode
    rightTop?: React.ReactNode
    rightBottom?: React.ReactNode
  }
}

export function DataTable<T>({
  columns,
  data,
  searchPlaceholder = 'Zoeken...',
  onRowClick,
  selectable,
  getRowId,
  onSelectionChange,
  bulkActions,
  mobileCard,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const idOf = (row: T): string => (getRowId ? getRowId(row) : (row as unknown as { id: string }).id)
  function toggleRow(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      onSelectionChange?.([...next])
      return next
    })
  }
  function clearSelection() {
    setSelected(new Set())
    onSelectionChange?.([])
  }
  function toggleAllVisible() {
    setSelected(prev => {
      const visibleIds = table.getRowModel().rows.map(r => idOf(r.original))
      const allSelected = visibleIds.every(id => prev.has(id))
      const next = new Set(prev)
      if (allSelected) {
        for (const id of visibleIds) next.delete(id)
      } else {
        for (const id of visibleIds) next.add(id)
      }
      onSelectionChange?.([...next])
      return next
    })
  }

  // Bij 1600+ klanten levert zoeken op twee letters honderden treffers op,
  // verspreid over pagina's. Wie met de zoekterm begint hoort bovenaan te
  // staan, daarna wie het ergens in de naam heeft. Alleen als de gebruiker
  // niet zelf op een kolom sorteert.
  const eersteKolomSleutel = (columns[0] as { accessorKey?: string })?.accessorKey
  const gerangschikt = useMemo(() => {
    const zoek = normaliseerZoek(globalFilter)
    if (!zoek || sorting.length > 0 || !eersteKolomSleutel) return data
    const rang = (rij: T) => {
      const waarde = (rij as Record<string, unknown>)[eersteKolomSleutel]
      const genormaliseerd = normaliseerZoek(String(waarde ?? ''))
      if (genormaliseerd.startsWith(zoek)) return 0
      if (genormaliseerd.includes(zoek)) return 1
      return 2 // treffer zat in een andere kolom (e-mail, plaats, ...)
    }
    return [...data].sort((a, b) => rang(a) - rang(b))
  }, [data, globalFilter, sorting, eersteKolomSleutel])

  const table = useReactTable({
    data: gerangschikt,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: zoekFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    // Standaard reset react-table naar pagina 1 zodra de data-referentie
    // verandert. Bij inline-acties (taak afvinken, deadline aanpassen) doet
    // het CRM een router.refresh() — dan sprong de gebruiker telkens terug
    // naar pagina 1. Met deze flag blijft de paginering staan.
    autoResetPageIndex: false,
    initialState: {
      pagination: { pageSize: 20 },
    },
  })

  return (
    <div>
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full max-w-sm pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          />
        </div>
      </div>

      {selectable && selected.size > 0 && bulkActions && (
        <div className="mb-3 px-4 py-2 bg-blue-50 border border-blue-200 rounded-md flex items-center justify-between">
          <span className="text-sm text-blue-900">
            <strong>{selected.size}</strong> {selected.size === 1 ? 'item' : 'items'} geselecteerd
          </span>
          <div className="flex items-center gap-2">
            {bulkActions([...selected], clearSelection)}
            <button
              onClick={clearSelection}
              className="text-xs text-blue-700 hover:underline"
            >
              Selectie wissen
            </button>
          </div>
        </div>
      )}

      {/* Mobiel: cards (alleen als mobileCard prop is meegegeven) */}
      {mobileCard && (
        <div className="md:hidden space-y-2">
          {table.getRowModel().rows.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-lg px-4 py-8 text-center text-sm text-gray-500">
              Geen resultaten gevonden
            </div>
          ) : (
            table.getRowModel().rows.map((row) => {
              const card = mobileCard(row.original)
              const rowId = idOf(row.original)
              const isChecked = selectable && selected.has(rowId)
              return (
                <div
                  key={row.id}
                  onClick={() => onRowClick?.(row.original)}
                  className={cn(
                    'bg-white border rounded-lg p-3 flex items-start gap-2 active:bg-gray-50',
                    onRowClick && 'cursor-pointer',
                    isChecked ? 'border-blue-300 bg-blue-50/40' : 'border-gray-200',
                  )}
                >
                  {selectable && (
                    <input
                      type="checkbox"
                      checked={!!isChecked}
                      onChange={(e) => { e.stopPropagation(); toggleRow(rowId) }}
                      onClick={(e) => e.stopPropagation()}
                      className="h-3.5 w-3.5 mt-1 flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-gray-900 text-sm truncate">{card.title}</div>
                        {card.subtitle && <div className="text-xs text-gray-500 truncate mt-0.5">{card.subtitle}</div>}
                      </div>
                      {card.rightTop && <div className="text-xs text-gray-500 flex-shrink-0 text-right">{card.rightTop}</div>}
                    </div>
                    {card.rightBottom && <div className="mt-1.5 text-xs">{card.rightBottom}</div>}
                  </div>
                </div>
              )
            })
          )}
          {/* Mobiel paginatie onderin */}
          {table.getPageCount() > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2 text-sm text-gray-600">
              <button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} className="p-1 rounded hover:bg-gray-100 disabled:opacity-40">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs">Pagina {table.getState().pagination.pageIndex + 1} van {table.getPageCount()}</span>
              <button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} className="p-1 rounded hover:bg-gray-100 disabled:opacity-40">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Desktop: tabel — verberg op mobiel als er een mobileCard is */}
      <div className={cn(
        'bg-white border border-gray-200 rounded-lg overflow-hidden',
        mobileCard && 'hidden md:block',
      )}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-gray-200 bg-gray-50">
                  {selectable && (
                    <th className="px-3 py-3 w-8">
                      <input
                        type="checkbox"
                        checked={
                          table.getRowModel().rows.length > 0 &&
                          table.getRowModel().rows.every(r => selected.has(idOf(r.original)))
                        }
                        onChange={toggleAllVisible}
                        className="h-3.5 w-3.5"
                      />
                    </th>
                  )}
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className={cn(
                        'px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider',
                        header.column.getCanSort() && 'cursor-pointer select-none hover:text-gray-700'
                      )}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <div className="flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() && (
                          <ArrowUpDown className="h-3 w-3" />
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + (selectable ? 1 : 0)}
                    className="px-4 py-8 text-center text-sm text-gray-500"
                  >
                    Geen resultaten gevonden
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => {
                  const rowId = idOf(row.original)
                  const isChecked = selected.has(rowId)
                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        'border-b border-gray-100 hover:bg-gray-50 transition-colors group/row',
                        onRowClick && 'cursor-pointer',
                        isChecked && 'bg-blue-50/40',
                      )}
                      onClick={() => onRowClick?.(row.original)}
                    >
                      {selectable && (
                        <td
                          className="px-3 py-3 w-8"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleRow(rowId)}
                            className="h-3.5 w-3.5"
                          />
                        </td>
                      )}
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-4 py-3 text-sm text-gray-700">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
          <p className="text-sm text-gray-500">
            {table.getFilteredRowModel().rows.length} resultaten
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="p-1 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm text-gray-600">
              Pagina {table.getState().pagination.pageIndex + 1} van{' '}
              {table.getPageCount()}
            </span>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="p-1 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
