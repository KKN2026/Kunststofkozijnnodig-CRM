import { getOfferteDashboard } from '@/lib/actions'
import { PageHeader } from '@/components/ui/page-header'
import { Lock } from 'lucide-react'
import { OfferteDashboardView } from '../dashboard-view'

// Persoonlijke pagina per verkoper: alleen de offertes die deze persoon
// verstuurde. Admins kunnen iedereen bekijken; een verkoper alleen zichzelf.
export const revalidate = 15

export default async function VerkoperDashboardPage({ params }: {
  params: Promise<{ verkoperId: string }>
}) {
  const { verkoperId } = await params
  const data = await getOfferteDashboard()

  const magDezeZien = data.magZien
    && (data.rol === 'admin' || data.eigenProfielId === verkoperId)
  const verkoper = data.verkopers.find(v => v.id === verkoperId)

  if (!magDezeZien || !verkoper) {
    return (
      <div>
        <PageHeader title="Offerte-dashboard" />
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm p-3 rounded-md">
          <Lock className="h-4 w-4" />
          {magDezeZien ? 'Deze verkoper heeft nog geen offertes verstuurd.' : 'Je kunt alleen je eigen offertepagina bekijken.'}
        </div>
      </div>
    )
  }

  return <OfferteDashboardView rijen={data.rijen} verkopers={data.verkopers} toewijsbaar={data.toewijsbaar} vasteVerkoper={verkoper} />
}
