-- Optioneel geschat bedrag per lead, zodat het productiviteitsdashboard kan
-- tonen wat de potentiële omzet is van klanten die vandaag gesproken zijn
-- (naast offertes, die al een echt bedrag hebben via offertes.totaal).
alter table leads add column if not exists geschatte_waarde numeric(12,2);
