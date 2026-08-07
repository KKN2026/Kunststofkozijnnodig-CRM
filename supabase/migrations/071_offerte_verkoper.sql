-- Op wiens naam staat een offerte in het offerte-dashboard.
--
-- Los van het e-maillog (wie hem technisch verstuurde): een offerte die via
-- het gedeelde info@-account of door een collega is verstuurd, moet op de
-- juiste verkoper gezet kunnen worden. NULL = val terug op de verzender uit
-- het e-maillog, zoals voorheen.
ALTER TABLE offertes ADD COLUMN IF NOT EXISTS verkoper_id uuid REFERENCES profielen(id);
