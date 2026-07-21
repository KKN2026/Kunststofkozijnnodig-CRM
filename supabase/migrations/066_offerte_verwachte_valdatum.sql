-- Verwachte valdatum per offerte: de datum waarop we verwachten dat de klant
-- beslist/de deal valt. Voedt de maand-prognose op het dashboard (verwachte
-- omzet excl. BTW per maand) en stuurt de deadline van de gekoppelde
-- opvolgtaak aan.
ALTER TABLE offertes ADD COLUMN IF NOT EXISTS verwachte_valdatum date;

COMMENT ON COLUMN offertes.verwachte_valdatum IS
  'Verwachte valdatum (beslisdatum) van de offerte. Synct de deadline van de open opvolgtaak en de verwachte_valmaand van de verkoopkans.';

-- Prognose-query filtert op jaar + status; index voorkomt full scans zodra de
-- tabel groeit.
CREATE INDEX IF NOT EXISTS idx_offertes_verwachte_valdatum
  ON offertes (administratie_id, verwachte_valdatum)
  WHERE verwachte_valdatum IS NOT NULL;
