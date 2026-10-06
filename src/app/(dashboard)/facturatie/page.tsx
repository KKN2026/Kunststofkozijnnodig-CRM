import { getFacturen, getOrdersMetFactuurStatus } from '@/lib/actions'
import { snelstartSleutelStatus } from '@/lib/snelstart-sleutel'
import { mollieHerstelSignaal } from '@/lib/mollie-herstel-signaal'
import { FactuurList } from './factuur-list'
import { RebuFacturenBanner } from './rebu-facturen-banner'

export const revalidate = 15

export default async function FacturatiePage() {
  const [facturen, ordersMetStatus, herstel] = await Promise.all([
    getFacturen(),
    getOrdersMetFactuurStatus(),
    mollieHerstelSignaal(),
  ])
  // Waarschuwing over de aflopende SnelStart-sleutel; hier staat ook de sync-knop.
  const sleutel = snelstartSleutelStatus()
  return (
    <>
      <RebuFacturenBanner />
      <FactuurList
        facturen={facturen}
        ordersMetStatus={ordersMetStatus}
        sleutelWaarschuwing={sleutel.waarschuwen ? { bericht: sleutel.bericht!, verlopen: sleutel.verlopen } : null}
        betalingSignaal={herstel.waarschuwen ? { bericht: herstel.bericht! } : null}
      />
    </>
  )
}
