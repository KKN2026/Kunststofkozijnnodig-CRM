import { getArchiefOffertes, getArchiefFacturen, getArchiefVerkoopkansen, autoArchiveerAfgerondeVerkoopkansen, getJaarCijfers } from '@/lib/actions'
import { vereisModuleToegang } from '@/lib/rechten'
import { ArchiefView } from './archief-view'

export const revalidate = 30

export default async function ArchiefPage() {
  await vereisModuleToegang('/archief')
  // Probeer nog niet-gearchiveerde afgeronde verkoopkansen alsnog op te ruimen
  // voor we de lijst tonen.
  try { await autoArchiveerAfgerondeVerkoopkansen() } catch { /* ignore */ }
  const [offertes, facturen, verkoopkansen, jaarCijfers] = await Promise.all([
    getArchiefOffertes(),
    getArchiefFacturen(),
    getArchiefVerkoopkansen(),
    getJaarCijfers(),
  ])
  return <ArchiefView
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    offertes={offertes as any}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    facturen={facturen as any}
    verkoopkansen={verkoopkansen}
    jaarCijfers={jaarCijfers}
  />
}
