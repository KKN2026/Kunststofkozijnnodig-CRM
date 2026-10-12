-- Optioneel afwijkend e-mailadres voor de 2FA-inlogcode. Nodig wanneer het
-- inlog-e-mailadres van een medewerker (nog) geen werkende mailbox heeft en
-- de code dus naar een ander, wel gecontroleerd adres moet (bv. de gedeelde
-- verkoop@-postbus).
ALTER TABLE profielen ADD COLUMN IF NOT EXISTS tfa_email text;
