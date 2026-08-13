// Herkomst van een klant als gekleurd label. Staat achter de bedrijfsnaam in
// de relatielijst én bovenaan op de klantpagina, zodat je in één oogopslag ziet
// waar iemand vandaan komt zonder het filter te hoeven gebruiken.
//
// Eén plek voor de kleuren, zodat lijst en detailpagina niet uit elkaar lopen.

export const herkomstLabels: Record<string, { tekst: string; klasse: string; stip: string }> = {
  eigen_klant: { tekst: 'Eigen klant', klasse: 'bg-emerald-100 text-emerald-700 border-emerald-200', stip: 'bg-emerald-500' },
  linkedin: { tekst: 'LinkedIn', klasse: 'bg-sky-100 text-sky-700 border-sky-200', stip: 'bg-sky-500' },
  psa: { tekst: 'PSA', klasse: 'bg-violet-100 text-violet-700 border-violet-200', stip: 'bg-violet-500' },
  website: { tekst: 'Website', klasse: 'bg-amber-100 text-amber-700 border-amber-200', stip: 'bg-amber-500' },
  instagram: { tekst: 'Instagram', klasse: 'bg-pink-100 text-pink-700 border-pink-200', stip: 'bg-pink-500' },
  facebook: { tekst: 'Facebook', klasse: 'bg-indigo-100 text-indigo-700 border-indigo-200', stip: 'bg-indigo-500' },
}

export function HerkomstBadge({
  herkomst,
  groot = false,
}: {
  herkomst?: string | null
  /** Iets forser, voor naast een paginatitel */
  groot?: boolean
}) {
  const label = herkomst ? herkomstLabels[herkomst] : null
  if (!label) return null

  const maat = groot
    ? 'gap-1.5 px-2.5 py-1 text-xs'
    : 'gap-1 px-2 py-0.5 text-[10px]'
  const stipMaat = groot ? 'h-2 w-2' : 'h-1.5 w-1.5'

  return (
    <span
      title={`Herkomst: ${label.tekst}`}
      className={`inline-flex items-center rounded-full font-semibold border shrink-0 ${maat} ${label.klasse}`}
    >
      <span className={`rounded-full ${stipMaat} ${label.stip}`} />
      {label.tekst}
    </span>
  )
}
