-- KRITIEK BEVEILIGINGSLEK gedicht (gevonden 30-08-2026): de UPDATE-policy op
-- 'profielen' (001_initial_schema.sql) had geen WITH CHECK, dus viel terug op
-- de USING-clause (id = auth.uid()) — die zegt alleen "je mag je EIGEN rij
-- bewerken", maar controleert niet WAT je erin zet. Elke ingelogde gebruiker
-- (óók een klantportaal-account met rol 'klant') kon dus via een rechtstreekse
-- PostgREST-call zelf zijn rol naar 'admin' zetten en/of naar een andere
-- administratie_id springen — volledige privilege-escalatie + tenant-hop.
--
-- RLS-policies kunnen dit niet met alleen WITH CHECK oplossen zonder de kolom-
-- waarden van de oude rij te kennen (WITH CHECK ziet alleen de NIEUWE rij), dus
-- de robuuste oplossing is een trigger die administratie_id/rol terugzet naar
-- de bestaande waarde tenzij de aanroeper de service-role is (admin-side
-- acties zoals createMedewerkerAccount/createKlantAccount gebruiken altijd
-- createAdminClient(), dus die blijven gewoon werken).

create or replace function voorkom_profiel_privilege_escalatie()
returns trigger as $$
begin
  if auth.role() is distinct from 'service_role' then
    if new.administratie_id is distinct from old.administratie_id then
      new.administratie_id := old.administratie_id;
    end if;
    if new.rol is distinct from old.rol then
      new.rol := old.rol;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_voorkom_profiel_privilege_escalatie on profielen;
create trigger trg_voorkom_profiel_privilege_escalatie
  before update on profielen
  for each row execute function voorkom_profiel_privilege_escalatie();
