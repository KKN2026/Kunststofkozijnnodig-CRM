// Gedeelde upload-limieten en -validatie voor de documenten-inbox.
// Los van actions.ts omdat een 'use server'-module alleen async functies mag
// exporteren; dit bestand wordt zowel client-side (snelle feedback) als
// server-side (autoritaire check) gebruikt.

/** Maximale bestandsgrootte voor uploads in de documenten-inbox. */
export const MAX_BESTAND_BYTES = 25 * 1024 * 1024 // 25 MB

/**
 * Toegestane extensies. Bewust een allowlist (geen blocklist) zodat
 * uitvoerbare bestanden nooit in de inbox belanden.
 */
export const TOEGESTANE_EXTENSIES = [
  'pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'heic',
  'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'eml', 'msg',
]

/** `accept`-waarde voor de file-input, afgeleid van de allowlist. */
export const UPLOAD_ACCEPT = TOEGESTANE_EXTENSIES.map(e => `.${e}`).join(',')

function bestandsExtensie(naam: string): string {
  const punt = naam.lastIndexOf('.')
  return punt === -1 ? '' : naam.slice(punt + 1).toLowerCase()
}

/**
 * Valideert een upload-kandidaat op grootte en extensie.
 * @returns een Nederlandse foutmelding, of null als het bestand geldig is.
 */
export function valideerUploadBestand(file: File): string | null {
  if (file.size === 0) return 'Het bestand is leeg.'
  if (file.size > MAX_BESTAND_BYTES) {
    return `Bestand is te groot (${(file.size / (1024 * 1024)).toFixed(1)} MB, maximum ${MAX_BESTAND_BYTES / (1024 * 1024)} MB).`
  }
  const ext = bestandsExtensie(file.name)
  if (!ext || !TOEGESTANE_EXTENSIES.includes(ext)) {
    return `Bestandstype .${ext || '?'} wordt niet ondersteund. Toegestaan: ${TOEGESTANE_EXTENSIES.join(', ')}.`
  }
  return null
}
