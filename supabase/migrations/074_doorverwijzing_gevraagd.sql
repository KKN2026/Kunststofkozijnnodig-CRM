-- "Om referentie gevraagd" hernoemd naar "Om doorverwijzing gevraagd" —
-- zelfde betekenis (onthouden dat we deze aannemer al eens om
-- referenties/bekenden in de omgeving hebben gevraagd), duidelijkere naam.
ALTER TABLE relaties RENAME COLUMN om_referentie_gevraagd TO om_doorverwijzing_gevraagd;
