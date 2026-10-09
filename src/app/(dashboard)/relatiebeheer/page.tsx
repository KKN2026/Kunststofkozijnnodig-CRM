import { getRelaties } from '@/lib/actions'
import { vereisModuleToegang } from '@/lib/rechten'
import { RelatieList } from './relatie-list'

export const revalidate = 30

export default async function RelatiesBeheerPage() {
  await vereisModuleToegang('/relatiebeheer')
  const relaties = await getRelaties()
  return <RelatieList relaties={relaties} />
}
