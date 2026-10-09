import { getFaalkosten } from '@/lib/actions'
import { vereisModuleToegang } from '@/lib/rechten'
import { FaalkostenView } from './faalkosten-view'

export default async function FaalkostenPage() {
  await vereisModuleToegang('/faalkosten')
  const faalkosten = await getFaalkosten()
  return <FaalkostenView faalkosten={faalkosten} />
}
