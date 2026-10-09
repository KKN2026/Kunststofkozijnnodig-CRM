import { getMedewerkers } from '@/lib/actions'
import { vereisModuleToegang } from '@/lib/rechten'
import { MedewerkerList } from './medewerker-list'

export default async function MedewerkersPage() {
  await vereisModuleToegang('/medewerkers')
  const medewerkers = await getMedewerkers()
  return <MedewerkerList medewerkers={medewerkers} />
}
