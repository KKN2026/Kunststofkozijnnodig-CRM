import { getFacturen, getOrdersMetFactuurStatus } from '@/lib/actions'
import { snelstartSleutelStatus } from '@/lib/snelstart-sleutel'
import { FactuurList } from './factuur-list'

export const revalidate = 15

export default async function FacturatiePage() {
  const [facturen, ordersMetStatus] = await Promise.all([
    getFacturen(),
    getOrdersMetFactuurStatus(),
  ])
  // Waarschuwing over de aflopende SnelStart-sleutel; hier staat ook de sync-knop.
  const sleutel = snelstartSleutelStatus()
  return (
    <FactuurList
      facturen={facturen}
      ordersMetStatus={ordersMetStatus}
      sleutelWaarschuwing={sleutel.waarschuwen ? { bericht: sleutel.bericht!, verlopen: sleutel.verlopen } : null}
    />
  )
}
