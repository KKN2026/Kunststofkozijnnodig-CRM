import { Suspense } from 'react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav'
import { ToastContainer } from '@/components/ui/toast'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NavHistoryProvider } from '@/lib/hooks/nav-history-provider'

// Geen 'force-dynamic' meer: Supabase's createClient leest cookies en maakt
// de layout automatisch dynamisch. Een expliciete flag geeft geen extra
// zekerheid maar voorkomt wel mogelijke render-optimalisaties.

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  let rol = 'gebruiker'
  let modules: string[] = []
  if (user) {
    const supabaseAdmin = createAdminClient()
    const { data: profiel } = await supabaseAdmin
      .from('profielen')
      .select('rol, toegestane_modules')
      .eq('id', user.id)
      .single()
    if (profiel?.rol) rol = profiel.rol
    modules = (profiel?.toegestane_modules as string[]) || []
  }

  return (
    <Suspense fallback={null}>
      <NavHistoryProvider>
        <DashboardShell rol={rol} modules={modules}>{children}</DashboardShell>
        <MobileBottomNav rol={rol} />
        <ToastContainer />
      </NavHistoryProvider>
    </Suspense>
  )
}
