import { redirect } from 'next/navigation'
import { getOfferteDashboard } from '@/lib/actions'
import { PageHeader } from '@/components/ui/page-header'
import { Lock } from 'lucide-react'
import { OfferteDashboardView } from './dashboard-view'

// Kort verversen: de conversiecijfers moeten meebewegen met statuswijzigingen
// in de verkoopkans, net als het logboek.
export const revalidate = 15

export default async function OfferteDashboardPage() {
  const data = await getOfferteDashboard()

  if (!data.magZien) {
    return (
      <div>
        <PageHeader title="Offerte-dashboard" />
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm p-3 rounded-md">
          <Lock className="h-4 w-4" />
          Je hebt geen toegang tot het offerte-dashboard.
        </div>
      </div>
    )
  }

  // Een verkoper zonder admin-rechten heeft alleen een eigen pagina.
  if (data.rol !== 'admin' && data.eigenProfielId) {
    redirect(`/offerte-dashboard/${data.eigenProfielId}`)
  }

  return <OfferteDashboardView rijen={data.rijen} verkopers={data.verkopers} toewijsbaar={data.toewijsbaar} />
}
