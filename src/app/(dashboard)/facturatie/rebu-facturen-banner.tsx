'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getRebuTeImporterenFacturen } from '@/lib/actions'
import { RebuFacturenTab } from '../instellingen/rebu-facturen-tab'
import { ArrowRightLeft, ChevronDown, ChevronUp } from 'lucide-react'

// Zichtbare banner bovenaan Facturatie — zelfde functie als het tabblad
// "Rebu-concept-facturen" in Instellingen, maar hier direct in beeld i.p.v.
// weggestopt onder een ander menu-item. Toont niets als er niets open staat.
// Tijdelijk tijdens de overstap van Rebu-CRM naar KKN, mag weer weg zodra
// Rebu definitief dicht gaat.
export function RebuFacturenBanner() {
  const [aantal, setAantal] = useState<number | null>(null)
  const [fout, setFout] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let genegeerd = false
    getRebuTeImporterenFacturen()
      .then(res => {
        if (genegeerd) return
        if ('error' in res && res.error) setFout(res.error)
        setAantal(res.facturen?.length ?? 0)
      })
      .catch(err => {
        if (genegeerd) return
        setFout(err instanceof Error ? err.message : 'Onbekende fout bij ophalen Rebu-facturen')
        setAantal(0)
      })
    return () => { genegeerd = true }
  }, [])

  // Stil niets tonen zou een échte fout onzichtbaar maken — wél tonen zodra
  // we weten dat er een probleem is, ook als "aantal" toevallig 0 is.
  if (!aantal && !fout) return null

  return (
    <Card className="mb-4 border-primary/30">
      <CardContent className="py-3 px-4">
        {fout ? (
          <p className="text-sm text-red-600">Rebu-concept-facturen ophalen mislukt: {fout}</p>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setOpen(o => !o)}
              className="w-full flex items-center justify-between gap-2 text-left"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-gray-900">
                <ArrowRightLeft className="h-4 w-4 text-primary" />
                {aantal} concept-{aantal === 1 ? 'factuur staat' : 'facturen staan'} nog in Rebu-CRM — klaar om over te zetten naar KKN
              </span>
              <Button variant="ghost" size="sm" type="button">
                {open ? <>Verbergen <ChevronUp className="h-4 w-4" /></> : <>Bekijken <ChevronDown className="h-4 w-4" /></>}
              </Button>
            </button>
            {open && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <RebuFacturenTab />
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
