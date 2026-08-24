import { getFactuur, getRelaties, getProducten, getVolgendeNummerPreview } from '@/lib/actions'
import { FactuurForm } from './factuur-form'

// De verzend-actie (sendFactuurEmail) rendert een PDF, praat met Mollie en
// verstuurt de mail via SMTP — allemaal binnen dezelfde request. Zonder deze
// regel draait dat op Vercel's standaard (korte) tijdslimiet en kan de
// request worden afgekapt vóórdat de mail écht verzonden is: de gebruiker
// ziet dan alleen een hangende knop en stuurt de mail nog een keer (zie ook
// offertes/[id]/page.tsx, die deze fix al eerder kreeg).
export const maxDuration = 300

export default async function FactuurDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ relatie_id?: string }>
}) {
  const { id } = await params
  const { relatie_id: relatie } = await searchParams
  const isNew = id === 'nieuw'
  const [factuur, relaties, producten, nummerPreview] = await Promise.all([
    isNew ? null : getFactuur(id),
    getRelaties(),
    getProducten(),
    isNew ? getVolgendeNummerPreview('factuur') : Promise.resolve(''),
  ])
  return <FactuurForm factuur={factuur} relaties={relaties} producten={producten} nummerPreview={nummerPreview} initialRelatieId={isNew ? (relatie || '') : ''} />
}
