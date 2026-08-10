'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAdministratieIdCached, getCurrentUserCached } from '@/lib/admin-context'
import { valideerUploadBestand } from './upload-limieten'

// De bucket 'documenten' is privé zonder storage-policies (zie migratie 072):
// alle storage-toegang moet server-side via de service role lopen. Deze
// actions zijn de enige route voor de documenten-inbox; de admin-client
// omzeilt RLS, dus elke query wordt hier expliciet op administratie_id
// gescoopt.

/**
 * Uploadt een document naar de privé-bucket 'documenten' en registreert het
 * in de documenten-tabel. Verwacht een FormData met veld 'bestand'.
 */
export async function uploadDocument(formData: FormData): Promise<{ success?: true; error?: string }> {
  const adminId = await getAdministratieIdCached()
  const user = await getCurrentUserCached()
  if (!adminId || !user) return { error: 'Niet ingelogd' }

  const file = formData.get('bestand')
  if (!(file instanceof File)) return { error: 'Geen bestand ontvangen.' }

  // Client valideert al voor snelle feedback; dit is de autoritaire check.
  const validatiefout = valideerUploadBestand(file)
  if (validatiefout) return { error: validatiefout }

  // Storage-keys staan geen spaties/accenten/rare tekens toe; saneer de naam
  // (NFKD: ü→u), anders weigert Supabase met "Invalid key". De originele
  // naam blijft bewaard in de DB-rij.
  const veiligeNaam = file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `uploads/${adminId}/${Date.now()}_${veiligeNaam}`

  const supabaseAdmin = createAdminClient()
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: uploadError } = await supabaseAdmin.storage
    .from('documenten')
    .upload(path, buffer, { contentType: file.type || 'application/octet-stream' })
  if (uploadError) return { error: `Upload mislukt: ${uploadError.message}` }

  const { error: insertError } = await supabaseAdmin.from('documenten').insert({
    administratie_id: adminId,
    naam: file.name,
    bestandsnaam: file.name,
    bestandstype: file.type || null,
    bestandsgrootte: file.size,
    storage_path: path,
    geupload_door: user.id,
  })
  if (insertError) {
    // Rij niet aangemaakt → bestand opruimen zodat er geen wees in storage
    // achterblijft.
    await supabaseAdmin.storage.from('documenten').remove([path])
    return { error: `Opslaan mislukt: ${insertError.message}` }
  }

  revalidatePath('/documenten')
  return { success: true }
}

/**
 * Geeft een kortlevende signed URL voor een document van de eigen
 * administratie, met download-header zodat de originele bestandsnaam
 * behouden blijft.
 */
export async function getDocumentDownloadUrl(id: string): Promise<{ url?: string; error?: string }> {
  const adminId = await getAdministratieIdCached()
  if (!adminId) return { error: 'Niet ingelogd' }

  const supabaseAdmin = createAdminClient()
  const { data: doc } = await supabaseAdmin
    .from('documenten')
    .select('storage_path, bestandsnaam')
    .eq('id', id)
    .eq('administratie_id', adminId)
    .single()
  if (!doc) return { error: 'Document niet gevonden.' }

  const { data, error } = await supabaseAdmin.storage
    .from('documenten')
    .createSignedUrl(doc.storage_path, 60, { download: doc.bestandsnaam })
  if (error || !data?.signedUrl) return { error: `Download mislukt: ${error?.message || 'geen URL'}` }
  return { url: data.signedUrl }
}

/**
 * Verwijdert een document (storage-bestand + DB-rij) van de eigen
 * administratie. Storage eerst, zodat een mislukte verwijdering geen
 * onvindbaar weesbestand achterlaat.
 */
export async function verwijderDocument(id: string): Promise<{ success?: true; error?: string }> {
  const adminId = await getAdministratieIdCached()
  if (!adminId) return { error: 'Niet ingelogd' }

  const supabaseAdmin = createAdminClient()
  const { data: doc } = await supabaseAdmin
    .from('documenten')
    .select('storage_path')
    .eq('id', id)
    .eq('administratie_id', adminId)
    .single()
  if (!doc) return { error: 'Document niet gevonden.' }

  const { error: storageError } = await supabaseAdmin.storage
    .from('documenten')
    .remove([doc.storage_path])
  if (storageError) return { error: `Verwijderen uit opslag mislukt: ${storageError.message}` }

  const { error } = await supabaseAdmin
    .from('documenten')
    .delete()
    .eq('id', id)
    .eq('administratie_id', adminId)
  if (error) return { error: error.message }

  revalidatePath('/documenten')
  return { success: true }
}
