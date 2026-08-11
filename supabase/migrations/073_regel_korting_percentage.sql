-- Korting per regelitem (offerte/order/factuur), 11-08-2026.
-- Klant wil korting per productregel kunnen aangeven zonder de prijs zelf aan
-- te passen. De korting werkt niet gelijk door in de live-weergave tijdens het
-- bewerken van de offerte — pas bij opslaan (saveOfferte) wordt hij verrekend
-- in offerte_regels.totaal en offertes.subtotaal/btw_totaal/totaal. Vanaf daar
-- erven order_regels en factuur_regels de al-verrekende waarde.
alter table offerte_regels add column if not exists korting_percentage numeric(5,2) not null default 0
  check (korting_percentage >= 0 and korting_percentage <= 100);

alter table order_regels add column if not exists korting_percentage numeric(5,2) not null default 0
  check (korting_percentage >= 0 and korting_percentage <= 100);

alter table factuur_regels add column if not exists korting_percentage numeric(5,2) not null default 0
  check (korting_percentage >= 0 and korting_percentage <= 100);
