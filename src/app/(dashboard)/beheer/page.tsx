import { redirect } from 'next/navigation'

// Beheer is samengevoegd met Instellingen (12-08-2026) — deze route blijft
// bestaan als redirect zodat bestaande bladwijzers/links blijven werken.
export default function BeheerPage() {
  redirect('/instellingen')
}
