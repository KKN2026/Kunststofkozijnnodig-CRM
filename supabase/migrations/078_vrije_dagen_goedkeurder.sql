-- Alleen Nick Burgers mag vrije dagen goedkeuren (12-08-2026). Andere admins
-- (Jordy, Jimmy, etc.) kunnen nog wel eigen/andermans aanvragen aanmaken,
-- maar niet meer zelf goedkeuren of bij het aanmaken direct als goedgekeurd
-- wegzetten — dat mag alleen via dit profiel.
alter table profielen add column if not exists mag_vrije_dagen_goedkeuren boolean not null default false;

update profielen set mag_vrije_dagen_goedkeuren = true where email = 'info@kunststofkozijnnodig.nl';
