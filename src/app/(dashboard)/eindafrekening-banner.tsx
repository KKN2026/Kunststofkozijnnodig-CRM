'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getEindafrekeningen } from '@/lib/actions'
import { FileWarning } from 'lucide-react'

// Zonder dit in beeld bleef het ontdekken van een vergeten restbetaling
// afhankelijk van iemand die toevallig naar Facturatie → Eindafrekeningen
// navigeert. Nu staat het altijd op het dashboard zodra er een klus met een
// aanbetaling (of termijn) zonder restbetaling openstaat. Toont niets als
// alles in orde is; "oude" klussen van vóór de data-import tellen niet mee
// (zie getEindafrekeningen).
export function EindafrekeningBanner() {
  const [aantal, setAantal] = useState<number | null>(null)

  useEffect(() => {
    let genegeerd = false
    getEindafrekeningen()
      .then(rijen => {
        if (genegeerd) return
        setAantal(rijen.filter(r => !r.oud).length)
      })
      .catch(() => { if (!genegeerd) setAantal(0) })
    return () => { genegeerd = true }
  }, [])

  if (!aantal) return null

  return (
    <Card className="border-amber-300">
      <CardContent className="py-3 px-4">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-medium text-gray-900">
            <FileWarning className="h-4 w-4 text-amber-600" />
            {aantal} {aantal === 1 ? 'klus heeft' : 'klussen hebben'} een aanbetaling zonder restbetaling
          </span>
          <Link href="/facturatie/eindafrekening">
            <Button variant="secondary" size="sm">Bekijken</Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
