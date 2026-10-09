-- Fijnmazige toegang per medewerker: naast de rol (admin/medewerker) kan een
-- admin nu per medewerker-account aanvinken welke onderdelen (buiten de
-- standaard eigen-data-onderdelen Dashboard/Agenda/Taken/Uren/Productiviteit)
-- zichtbaar/bereikbaar zijn. Leeg/ontbrekend = alleen de standaardonderdelen.
-- Voor rol 'admin' wordt deze kolom genegeerd (admin ziet altijd alles).
ALTER TABLE profielen ADD COLUMN IF NOT EXISTS toegestane_modules text[] NOT NULL DEFAULT '{}';
