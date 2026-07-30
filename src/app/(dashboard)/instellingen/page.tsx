import { getInstellingenVoorUI } from '@/lib/actions'
import { InstellingenView } from './instellingen-view'

export default async function InstellingenPage() {
  const { waarden, magBewerken } = await getInstellingenVoorUI()
  return <InstellingenView waarden={waarden} magBewerken={magBewerken} />
}
