import { getProductiviteitData } from '@/lib/actions'
import { ProductiviteitView } from './productiviteit-view'

export const revalidate = 20

export default async function ProductiviteitPage() {
  const data = await getProductiviteitData()
  return (
    <ProductiviteitView
      medewerkers={data.medewerkers as never[]}
      doelen={data.doelen as never[]}
      activiteiten={data.activiteiten as never[]}
      uren={data.uren as never[]}
      rol={data.rol}
      eigenMedewerkerId={data.eigenMedewerkerId}
      werkdagenDezeMaand={data.werkdagenDezeMaand}
      labels={data.labels}
    />
  )
}
