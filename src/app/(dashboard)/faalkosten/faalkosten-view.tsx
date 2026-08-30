'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { Plus, AlertTriangle } from 'lucide-react'
import { faalkostenCategorieLabels } from '@/lib/constants'

interface Faalkost {
  id: string
  omschrijving: string
  categorie: string | null
  bedrag: number
  datum: string
  verantwoordelijke: string | null
  opgelost: boolean
  project: { naam: string } | null
  offerte: { offertenummer: string } | null
}

export function FaalkostenView({ faalkosten }: { faalkosten: Faalkost[] }) {
  const [filter, setFilter] = useState<'alle' | 'open' | 'opgelost' | 'deze_maand'>('alle')
  const totaal = faalkosten.reduce((sum, f) => sum + (f.bedrag || 0), 0)
  const openTotaal = faalkosten.filter(f => !f.opgelost).reduce((sum, f) => sum + (f.bedrag || 0), 0)
  const opgelostTotaal = faalkosten.filter(f => f.opgelost).reduce((sum, f) => sum + (f.bedrag || 0), 0)
  const nu = new Date()
  const dezeMaand = faalkosten.filter(f => { const d = new Date(f.datum); return d.getFullYear() === nu.getFullYear() && d.getMonth() === nu.getMonth() })
  const dezeMaandTotaal = dezeMaand.reduce((sum, f) => sum + (f.bedrag || 0), 0)
  const gefilterd = filter === 'open' ? faalkosten.filter(f => !f.opgelost)
    : filter === 'opgelost' ? faalkosten.filter(f => f.opgelost)
    : filter === 'deze_maand' ? dezeMaand
    : faalkosten

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Faalkosten</h1>
          <p className="text-sm text-gray-500 mt-1">
            Totaal: {formatCurrency(totaal)} &middot; Open: {formatCurrency(openTotaal)}
          </p>
        </div>
        <Link href="/faalkosten/nieuw">
          <Button>
            <Plus className="h-4 w-4" />
            Nieuwe faalkost
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card
          role="button"
          tabIndex={0}
          onClick={() => setFilter('alle')}
          className={`cursor-pointer hover:border-primary/40 hover:shadow transition-all text-left w-full ${filter === 'alle' ? 'border-primary/40 ring-1 ring-primary/20' : ''}`}
        >
          <CardContent>
            <p className="text-sm text-gray-500">Totaal</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{formatCurrency(totaal)}</p>
            <p className="text-xs text-gray-400 mt-1">{faalkosten.length} posten</p>
          </CardContent>
        </Card>
        <Card
          role="button"
          tabIndex={0}
          onClick={() => setFilter(filter === 'open' ? 'alle' : 'open')}
          className={`cursor-pointer hover:border-primary/40 hover:shadow transition-all text-left w-full ${filter === 'open' ? 'border-primary/40 ring-1 ring-primary/20' : ''}`}
        >
          <CardContent>
            <p className="text-sm text-gray-500">Open</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{formatCurrency(openTotaal)}</p>
            <p className="text-xs text-gray-400 mt-1">{faalkosten.filter(f => !f.opgelost).length} posten</p>
          </CardContent>
        </Card>
        <Card
          role="button"
          tabIndex={0}
          onClick={() => setFilter(filter === 'opgelost' ? 'alle' : 'opgelost')}
          className={`cursor-pointer hover:border-primary/40 hover:shadow transition-all text-left w-full ${filter === 'opgelost' ? 'border-primary/40 ring-1 ring-primary/20' : ''}`}
        >
          <CardContent>
            <p className="text-sm text-gray-500">Opgelost</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{formatCurrency(opgelostTotaal)}</p>
            <p className="text-xs text-gray-400 mt-1">{faalkosten.filter(f => f.opgelost).length} posten</p>
          </CardContent>
        </Card>
        <Card
          role="button"
          tabIndex={0}
          onClick={() => setFilter(filter === 'deze_maand' ? 'alle' : 'deze_maand')}
          className={`cursor-pointer hover:border-primary/40 hover:shadow transition-all text-left w-full ${filter === 'deze_maand' ? 'border-primary/40 ring-1 ring-primary/20' : ''}`}
        >
          <CardContent>
            <p className="text-sm text-gray-500">Deze maand</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{formatCurrency(dezeMaandTotaal)}</p>
            <p className="text-xs text-gray-400 mt-1">{dezeMaand.length} posten</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {gefilterd.length === 0 ? (
            <div className="py-12 text-center">
              <AlertTriangle className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500">Geen faalkosten geregistreerd</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase">
                    <th className="px-4 py-3">Datum</th>
                    <th className="px-4 py-3">Omschrijving</th>
                    <th className="px-4 py-3">Categorie</th>
                    <th className="px-4 py-3">Project</th>
                    <th className="px-4 py-3 text-right">Bedrag</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {gefilterd.map(f => (
                    <tr key={f.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {new Date(f.datum).toLocaleDateString('nl-NL')}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/faalkosten/${f.id}`} className="text-sm font-medium text-gray-900 hover:text-primary">
                          {f.omschrijving}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {f.categorie ? faalkostenCategorieLabels[f.categorie] || f.categorie : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {f.project?.naam || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-right text-red-600">
                        {formatCurrency(f.bedrag)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge status={f.opgelost ? 'afgerond' : 'open'}>
                          {f.opgelost ? 'Opgelost' : 'Open'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
