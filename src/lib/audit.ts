import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// Lichtgewicht audit-helper. Roep aan vanuit server-actions / route-handlers
// voor kritieke mutaties. Faalt nooit hard — een audit-log fout mag de
// werkelijke actie niet blokkeren.
export async function logAudit(input: {
  actie: string                 // 'offerte.delete', 'factuur.update', etc.
  entiteitType?: string         // 'offerte', 'factuur', 'relatie', ...
  entiteitId?: string
  details?: Record<string, unknown>
  ipAdres?: string
  // Cron-routes hebben geen ingelogde gebruiker (auth.getUser() geeft niks
  // terug), maar draaien wel voor een bekende administratie — die hier
  // expliciet meegeven zodat de entry toch bij de juiste tenant zichtbaar
  // wordt in de audit-log-tab i.p.v. onvindbaar te blijven met
  // administratie_id = null.
  administratieId?: string
}) {
  try {
    const admin = createAdminClient()
    let administratieId: string | null = input.administratieId || null
    let userEmail: string | null = null
    let userId: string | null = null

    if (!administratieId) {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        userId = user.id
        userEmail = user.email || null
        const { data: profiel } = await admin.from('profielen').select('administratie_id').eq('id', user.id).maybeSingle()
        administratieId = profiel?.administratie_id || null
      }
    }

    await admin.from('audit_log').insert({
      administratie_id: administratieId,
      user_id: userId,
      user_email: userEmail,
      actie: input.actie,
      entiteit_type: input.entiteitType || null,
      entiteit_id: input.entiteitId || null,
      details: input.details || null,
      ip_adres: input.ipAdres || null,
    })
  } catch (err) {
    console.warn('audit-log fout (niet kritiek):', err)
  }
}
