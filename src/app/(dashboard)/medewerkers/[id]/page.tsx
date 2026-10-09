import { getMedewerker, getMedewerkerOrders, getMedewerkers } from '@/lib/actions'
import { vereisModuleToegang } from '@/lib/rechten'
import { MedewerkerDetail } from './medewerker-detail'

export default async function MedewerkerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await vereisModuleToegang('/medewerkers')
  const { id } = await params
  const isNew = id === 'nieuw'

  const [medewerker, orders] = await Promise.all([
    isNew ? null : getMedewerker(id),
    isNew ? [] : getMedewerkerOrders(id),
  ])

  return <MedewerkerDetail medewerker={medewerker} orders={orders} />
}
