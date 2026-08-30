-- Ontbrekende RLS-policies aangevuld (gevonden bij audit 30-08-2026, zelfde
-- patroon als migratie 056 voor taak_notities): geen beveiligingslek, maar een
-- functionele bug — de betreffende actie faalde stil doordat RLS zonder
-- policy standaard alles blokkeert.
-- - documenten: UPDATE ontbrak (select/insert/delete stonden er al)
-- - nummering: DELETE ontbrak (select/insert/update stonden er al)
-- - email_sync_state: DELETE ontbrak (select/insert/update stonden er al)

create policy "documenten_update" on documenten for update using (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);

create policy "nummering_delete" on nummering for delete using (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);

create policy "email_sync_state_delete" on email_sync_state for delete using (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);
