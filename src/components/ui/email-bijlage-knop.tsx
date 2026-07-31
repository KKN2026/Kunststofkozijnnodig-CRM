'use client'

import { useState } from 'react'
import { Paperclip, Loader2 } from 'lucide-react'
import { getEmailBijlageUrl } from '@/lib/actions'

/**
 * Bijlage bij een verstuurde e-mail, klikbaar.
 *
 * Tot nu toe stond hier alleen de bestandsnaam als tekst: je zag wél dát er een
 * offerte-PDF was meegestuurd, maar kon 'm nergens openen.
 *
 * Twee soorten bijlagen:
 * - Offerte-, tekeningen- en factuur-PDF's worden niet opgeslagen maar op
 *   aanvraag opnieuw gegenereerd via de bestaande PDF-routes.
 * - Zelf toegevoegde bestanden staan in storage en worden via een tijdelijke
 *   signed URL geopend.
 */
export function EmailBijlageKnop({
  emailLogId,
  filename,
  offerteId,
  factuurId,
}: {
  emailLogId: string
  filename: string
  offerteId?: string | null
  factuurId?: string | null
}) {
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState('')

  const directeLink =
    filename.startsWith('Tekeningen-') && offerteId
      ? `/api/pdf/offerte/${offerteId}/tekeningen`
      : filename.startsWith('Offerte-') && offerteId
        ? `/api/pdf/offerte/${offerteId}`
        : filename.startsWith('Factuur-') && factuurId
          ? `/api/pdf/factuur/${factuurId}`
          : null

  const stijl =
    'inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded border transition-colors ' +
    (fout
      ? 'bg-red-50 text-red-700 border-red-200'
      : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100')

  if (directeLink) {
    return (
      <a
        href={directeLink}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        className={stijl}
        title="Openen"
      >
        <Paperclip className="h-3 w-3" />
        {filename}
      </a>
    )
  }

  async function openen(e: React.MouseEvent) {
    // De hele rij is vaak zelf klikbaar; die mag niet meelopen.
    e.stopPropagation()
    if (bezig) return
    setBezig(true)
    setFout('')
    try {
      const result = await getEmailBijlageUrl(emailLogId, filename)
      if ('error' in result && result.error) {
        setFout(result.error)
        return
      }
      if (result.url) window.open(result.url, '_blank', 'noopener,noreferrer')
    } catch {
      setFout('Openen mislukt')
    } finally {
      setBezig(false)
    }
  }

  return (
    <button type="button" onClick={openen} className={stijl} title={fout || 'Openen'}>
      {bezig ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />}
      {filename}
      {fout && <span className="ml-1">— niet beschikbaar</span>}
    </button>
  )
}
