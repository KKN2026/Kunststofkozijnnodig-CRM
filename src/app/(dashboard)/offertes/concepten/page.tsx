import { getConceptOffertes, ensureConceptOffertesForAanvragen } from '@/lib/actions'
import { vereisModuleToegang } from '@/lib/rechten'
import { ConceptOffertesList } from './concept-offertes-list'

export default async function ConceptOffertesPage() {
  await vereisModuleToegang('/offertes/concepten')
  // Ensure any open aanvragen without concept offerte get one created
  await ensureConceptOffertesForAanvragen()
  const offertes = await getConceptOffertes()
  return <ConceptOffertesList offertes={offertes} />
}
