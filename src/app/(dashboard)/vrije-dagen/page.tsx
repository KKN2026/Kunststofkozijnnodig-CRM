import { redirect } from 'next/navigation'

// Vrije dagen is samengevoegd met Agenda (12-08-2026) — deze route blijft
// bestaan als redirect zodat bestaande bladwijzers/links blijven werken.
export default function VrijeDagenPage() {
  redirect('/agenda?tab=vrije-dagen')
}
