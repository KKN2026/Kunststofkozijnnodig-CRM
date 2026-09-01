import { sendEmail } from '@/lib/email'

// Was ooit: direct een mailtje per mislukte cron-run. Dat gaf tientallen
// losse mails op een slechte dag (bv. SnelStart plat → elke halfuur-sync
// faalt). Cron-routes loggen fouten nu naar audit_log ('cron.*'-acties, zie
// logAudit-aanroepen in de route-handlers); deze functie bundelt dat één keer
// per dag tot 1 mail — aangeroepen door /api/cron/dagelijks-overzicht (16:00).
// Faalt zelf nooit hard: een mislukte alert mag de cron niet laten crashen.
export async function stuurCronDagOverzicht(fouten: { actie: string; aantal: number; voorbeelden: string[] }[]) {
  if (fouten.length === 0) return // geen ruis bij een schone dag
  const ontvanger = process.env.CRON_ALERT_EMAIL || process.env.BACKUP_ALERT_EMAIL || 'info@kunststofkozijnnodig.nl'
  const totaalFouten = fouten.reduce((s, f) => s + f.aantal, 0)
  try {
    await sendEmail({
      to: ontvanger,
      subject: `⚠️ Dagoverzicht cron-fouten (${totaalFouten})`,
      html: `
        <p>De volgende geplande taken liepen de afgelopen 24 uur tegen fouten aan:</p>
        <ul>
          ${fouten.map(f => `
            <li>
              <strong>${f.actie}</strong> — ${f.aantal}×
              <ul>${f.voorbeelden.map(v => `<li style="color:#6b7280;font-size:13px;">${v}</li>`).join('')}</ul>
            </li>
          `).join('')}
        </ul>
        <p style="color:#6b7280;font-size:12px;">Automatisch verstuurd, 1x per dag om 16:00 — check de audit-log of Vercel-logs voor meer details.</p>
      `,
    })
  } catch (e) {
    console.error('Dagoverzicht cron-fouten versturen mislukt:', e instanceof Error ? e.message : e)
  }
}
