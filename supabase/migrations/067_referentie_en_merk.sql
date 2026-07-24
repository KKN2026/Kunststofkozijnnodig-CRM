-- Feature 1: "Om referentie gevraagd (bekende)" — per relatie onthouden dat we
-- de aannemer al eens om referenties/bekenden in de omgeving hebben gevraagd,
-- zodat we dat niet blijven herhalen.
ALTER TABLE relaties ADD COLUMN IF NOT EXISTS om_referentie_gevraagd boolean DEFAULT false;

-- Feature 2: merk op de offerte — bepaalt de automatische bezorgkosten
-- (Aluplast <1750 = 150; Schüco/Gealan <6000 = 300). Voorheen werd het merk
-- afgeleid uit de gedetecteerde leverancier, wat te vaak fout ging.
ALTER TABLE offertes ADD COLUMN IF NOT EXISTS merk text;
