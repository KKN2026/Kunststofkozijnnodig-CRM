import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export { TOEGEEFBARE_MODULES } from '@/lib/module-constants'

export function heeftModuleToegang(rol: string | undefined, modules: string[] | undefined | null, moduleKey: string): boolean {
  if (rol !== 'medewerker') return true // admin/gebruiker/readonly: ongewijzigd gedrag
  return (modules || []).includes(moduleKey)
}

// Haalt rol + toegestane_modules van de ingelogde gebruiker op. Eén plek zodat
// actions.ts en page.tsx-bestanden dezelfde bron van waarheid gebruiken.
export async function getRolEnModules(): Promise<{ rol: string; modules: string[] }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { rol: 'medewerker', modules: [] }
  const { data: profiel } = await supabase
    .from('profielen')
    .select('rol, toegestane_modules')
    .eq('id', user.id)
    .maybeSingle()
  return {
    rol: (profiel?.rol as string) || 'medewerker',
    modules: (profiel?.toegestane_modules as string[]) || [],
  }
}

// Voor gebruik bovenaan een server component (page.tsx): stuurt een
// medewerker zonder toegang direct terug naar het dashboard, zodat een
// verborgen module ook écht ontoegankelijk is (niet alleen verborgen in de
// zijbalk/adresbalk).
export async function vereisModuleToegang(moduleKey: string) {
  const { rol, modules } = await getRolEnModules()
  if (!heeftModuleToegang(rol, modules, moduleKey)) redirect('/')
}
