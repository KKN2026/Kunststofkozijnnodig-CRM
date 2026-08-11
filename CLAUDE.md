# KunststofkozijnnodigCRM (KKN)

CRM voor Kunststofkozijnnodig: offertes, orders, facturatie, verkoopkansen en
klantportaal. Fork van het Rebu-CRM — features worden vaak "zelfde als Rebu"
overgenomen.

## Stack & commando's

- Next.js 16 (App Router, Server Actions) + React 19 + Tailwind 4 + Supabase
- `npm run dev` / `npm run build` / `npm run lint`
- Typecheck: `npx tsc --noEmit` — er staan al langer bestaande fouten in oude
  bestanden (build negeert ze via `ignoreBuildErrors`). Introduceer geen nieuwe
  fouten in bestanden die je aanraakt.

## Conventies

- **Alles in het Nederlands**: UI-teksten, commentaar, commitberichten,
  variabelen waar logisch (`verkoper`, `herkomst`, `magZien`).
- Server actions staan in `src/lib/actions.ts` (12k+ regels). Voeg nieuwe
  acties toe bij het bijbehorende `// === SECTIE ===`-blok en hou wijzigingen
  klein en gericht.
- Pagina's: server component `page.tsx` haalt data op via een action, rendert
  een client `*-view.tsx`. Zie `src/app/(dashboard)/logboek/` als voorbeeld.
- UI-bouwstenen uit `src/components/ui/`: `PageHeader`, `Card`, `DataTable`,
  badges. Filterknoppen als "pills" (zie logboek-view). Statusstoplicht:
  groen = akkoord, geel/amber = openstaand, rood = afgewezen.
- Rollen: `admin` ziet alles; `medewerker` heeft beperkte nav
  (`medewerkerNavHrefs` in `src/components/layout/sidebar.tsx`) en alleen
  eigen data. Check rollen via `getRolEnEigenMedewerker`.
- Navigatie-items staan in `src/lib/constants.ts` (`navigationItems`).

## Database & migraties

- Migraties in `supabase/migrations/`, oplopend genummerd (`NNN_naam.sql`).
  **Kijk eerst welk nummer vrij is** (`ls supabase/migrations | tail`) — bij
  parallel werk is het laatste nummer mogelijk net geclaimd door een andere
  sessie.
- Migraties worden handmatig uitgevoerd via een script
  (`scripts/run-migration-NNN.mjs` / `apply-NNN.mjs`-patroon), niet
  automatisch bij deploy.

## Meerdere terminals / sessies tegelijk

Nick werkt vaak met meerdere Claude Code-terminals naast elkaar. Afspraken om
botsingen te voorkomen:

1. **Meld bij de start van substantieel werk wat je gaat aanraken** en check
   `git status` op onverwachte wijzigingen van andere sessies. Zie je
   niet-gecommitte wijzigingen die niet van jou zijn: laat ze staan en werk er
   omheen; overschrijf of revert ze nooit.
2. **`src/lib/actions.ts` is de gedeelde hotspot.** Voeg alleen toe (nieuwe
   actie in het juiste sectieblok), herschrijf geen bestaande acties als dat
   niet je opdracht is.
3. **Migratienummers**: claim het eerstvolgende vrije nummer door het bestand
   direct aan te maken, ook als de SQL nog niet af is.
4. **Commit alleen wat bij jouw taak hoort** — geen `git add -A` als er ook
   bestanden van een andere sessie klaarstaan.
5. Voor groot parallel werk: liever git worktrees per terminal, of één sessie
   die subagents met worktree-isolatie gebruikt.
