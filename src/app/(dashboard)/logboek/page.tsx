import { getLogboekOffertes, getLogboekActiviteiten } from '@/lib/actions'
import { LogboekView } from './logboek-view'

// Kort verversen: het overzicht moet meebewegen met wijzigingen in de
// verkoopkans (status-stoplicht volgt de actuele offertestatus).
export const revalidate = 15

export default async function LogboekPage() {
  const [offertes, activiteiten] = await Promise.all([
    getLogboekOffertes(),
    getLogboekActiviteiten(),
  ])
  return (
    <LogboekView
      rijen={offertes.rijen}
      activiteiten={activiteiten.items}
      magZien={offertes.magZien}
    />
  )
}
