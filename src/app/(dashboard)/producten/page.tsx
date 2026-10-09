import { getProducten } from '@/lib/actions'
import { vereisModuleToegang } from '@/lib/rechten'
import { ProductList } from './product-list'

export default async function ProductenPage() {
  await vereisModuleToegang('/producten')
  const producten = await getProducten()
  return <ProductList producten={producten} />
}
