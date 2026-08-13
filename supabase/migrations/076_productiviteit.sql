-- Productiviteitsdashboard: per-medewerker dagdoelen + automatisch gelogde
-- activiteiten (geen handmatige invoer — logging gebeurt als bijproduct van
-- bestaande acties: terugbelmoment zetten, leadstatus wijzigen, offerte
-- opslaan). activiteit_type is bewust vrije tekst (geen CHECK-constraint) zodat
-- er later makkelijk nieuwe doeltypes bij kunnen zonder migratie.

create table if not exists medewerker_doelen (
  id uuid primary key default gen_random_uuid(),
  administratie_id uuid not null references administraties(id) on delete cascade,
  medewerker_id uuid not null references medewerkers(id) on delete cascade,
  activiteit_type text not null,
  dag_doel numeric(6,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(administratie_id, medewerker_id, activiteit_type)
);

create table if not exists medewerker_activiteiten (
  id uuid primary key default gen_random_uuid(),
  administratie_id uuid not null references administraties(id) on delete cascade,
  medewerker_id uuid not null references medewerkers(id) on delete cascade,
  activiteit_type text not null,
  referentie_type text,
  referentie_id uuid,
  omschrijving text,
  created_at timestamptz not null default now()
);

create index if not exists idx_medewerker_activiteiten_lookup
  on medewerker_activiteiten (administratie_id, medewerker_id, activiteit_type, created_at);

-- Dubbeltellingen (bv. een offerte die 5x op dezelfde dag wordt bewerkt) worden
-- niet via een DB-constraint voorkomen (timestamptz->date is niet IMMUTABLE,
-- dus ongeschikt voor een index-expressie) maar in de applicatielaag: de
-- helper logMedewerkerActiviteit() checkt eerst of er vandaag al een rij
-- bestaat voor deze medewerker/type/referentie voordat hij inserteert.
create index if not exists idx_medewerker_activiteiten_referentie
  on medewerker_activiteiten (medewerker_id, activiteit_type, referentie_id);

alter table medewerker_doelen enable row level security;
alter table medewerker_activiteiten enable row level security;

create policy "Doelen zichtbaar voor administratie" on medewerker_doelen
  for all using (
    administratie_id in (select administratie_id from profielen where id = auth.uid())
  );

create policy "Activiteiten zichtbaar voor administratie" on medewerker_activiteiten
  for all using (
    administratie_id in (select administratie_id from profielen where id = auth.uid())
  );
