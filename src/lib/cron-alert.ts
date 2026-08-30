import { sendEmail } from '@/lib/email'

// Gedeelde helper voor cron-routes: stuur een korte waarschuwingsmail zodra
// een geplande taak met fouten afrondt. Zonder dit soort actieve melding
// verdwijnt een structureel probleem stil in Vercel-logs die niemand leest —
// precies wat er met de database-backup gebeurde (maandenlang onopgemerkt).
// Faalt zelf nooit hard: een mislukte alert mag de cron niet laten crashen.
export async function stuurCronFoutAlert(cronNaam: string, details: string[] | string) {
  const ontvanger = process.env.CRON_ALERT_EMAIL || process.env.BACKUP_ALERT_EMAIL || 'info@kunststofkozijnnodig.nl'
  const lijst = Array.isArray(details) ? details : [details]
  try {
    await sendEmail({
      to: ontvanger,
      subject: `⚠️ Cron-taak met fouten: ${cronNaam}`,
      html: `
        <p>De cron-taak <strong>${cronNaam}</strong> is afgerond, maar met ${lijst.length} fout${lijst.length === 1 ? '' : 'en'}:</p>
        <ul>${lijst.map(d => `<li>${d}</li>`).join('')}</ul>
        <p style="color:#6b7280;font-size:12px;">Automatisch verstuurd — check de Vercel-logs voor meer details.</p>
      `,
    })
  } catch (e) {
    console.error(`Cron-alert versturen mislukt (${cronNaam}):`, e instanceof Error ? e.message : e)
  }
}
