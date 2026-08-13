import { getInstellingenVoorUI, getAdministratie, getNummering, getGebruikers } from '@/lib/actions'
import { InstellingenView } from './instellingen-view'

export default async function InstellingenPage() {
  const [{ waarden, magBewerken }, administratie, nummering, gebruikers] = await Promise.all([
    getInstellingenVoorUI(),
    getAdministratie(),
    getNummering(),
    getGebruikers(),
  ])
  return (
    <InstellingenView
      waarden={waarden}
      magBewerken={magBewerken}
      administratie={administratie}
      nummering={nummering}
      gebruikers={gebruikers}
    />
  )
}
