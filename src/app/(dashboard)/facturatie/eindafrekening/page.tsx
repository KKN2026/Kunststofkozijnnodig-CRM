import { getEindafrekeningen } from '@/lib/actions'
import { EindafrekeningView } from './eindafrekening-view'

export const revalidate = 30

export default async function EindafrekeningPage() {
  const rijen = await getEindafrekeningen()
  return <EindafrekeningView rijen={rijen} />
}
