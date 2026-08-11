-- Supabase Security Advisor: _setup_migraties (boekhouding van
-- scripts/setup-new-db.mjs) stond in public zonder RLS en was daarmee via de
-- API leesbaar en beschrijfbaar met de anon key. RLS aan zonder policies =
-- niemand kan erbij via de API; het setup-script verbindt rechtstreeks via
-- Postgres en heeft er geen last van.
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = '_setup_migraties') then
    alter table public._setup_migraties enable row level security;
  end if;
end $$;
