-- Voeg de orderstatus 'wacht_op_betaling' toe aan de CHECK-constraint.
--
-- De code (createOrderFromOfferte in src/lib/actions.ts) maakt bij interne
-- offerte-acceptatie een order aan met status 'wacht_op_betaling', en
-- sendFactuurEmail activeert een order zodra die status heeft. Migratie 013
-- liet die status echter uit de constraint, waardoor de insert faalde en er
-- bij interne acceptatie stil GEEN order werd aangemaakt. Deze migratie sluit
-- het schema weer aan op wat de applicatie verwacht.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('nieuw', 'wacht_op_betaling', 'in_behandeling', 'geleverd', 'gefactureerd', 'geannuleerd', 'moet_besteld', 'besteld'));
