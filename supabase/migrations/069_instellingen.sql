-- Vrij instelbare voorkeuren per administratie. Key/value zodat er een
-- instelling bij kan zonder migratie: de defaults en types staan in
-- src/lib/instellingen.ts, hier alleen de afwijkingen van de standaard.
CREATE TABLE IF NOT EXISTS instellingen (
  administratie_id UUID NOT NULL REFERENCES administraties(id) ON DELETE CASCADE,
  sleutel TEXT NOT NULL,
  waarde JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (administratie_id, sleutel)
);

ALTER TABLE instellingen ENABLE ROW LEVEL SECURITY;

-- Iedereen binnen de administratie mag de instellingen lezen (de app leest ze
-- op veel plekken); alleen admins mogen ze wijzigen.
CREATE POLICY "instellingen_select" ON instellingen
  FOR SELECT USING (
    administratie_id IN (SELECT administratie_id FROM profielen WHERE id = auth.uid())
  );

CREATE POLICY "instellingen_write" ON instellingen
  FOR ALL USING (
    administratie_id IN (SELECT administratie_id FROM profielen WHERE id = auth.uid())
    AND (SELECT rol FROM profielen WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    administratie_id IN (SELECT administratie_id FROM profielen WHERE id = auth.uid())
    AND (SELECT rol FROM profielen WHERE id = auth.uid()) = 'admin'
  );

CREATE TRIGGER set_updated_at BEFORE UPDATE ON instellingen FOR EACH ROW EXECUTE FUNCTION update_updated_at();
