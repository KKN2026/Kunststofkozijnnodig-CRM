-- Herkomst van een klant, om op te filteren: eigen_klant / linkedin / psa.
ALTER TABLE relaties ADD COLUMN IF NOT EXISTS herkomst text;
