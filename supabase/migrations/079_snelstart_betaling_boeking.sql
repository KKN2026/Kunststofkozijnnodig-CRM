-- Id van de bankboeking waarmee een Mollie-betaling in SnelStart is afgeletterd.
--
-- Dit is de vangrail tegen dubbelboeken: de sync draait elk half uur, en zonder
-- deze markering zou dezelfde betaling elke ronde opnieuw de boekhouding in
-- gaan. Gevuld = deze factuur is in SnelStart al afgeboekt, handen eraf.
ALTER TABLE facturen ADD COLUMN IF NOT EXISTS snelstart_betaling_id text;

-- Opzoeken van 'nog niet afgeletterd' gaat over alle facturen; een partiële
-- index houdt dat goedkoop.
CREATE INDEX IF NOT EXISTS facturen_zonder_snelstart_betaling
  ON facturen (id) WHERE snelstart_betaling_id IS NULL;
