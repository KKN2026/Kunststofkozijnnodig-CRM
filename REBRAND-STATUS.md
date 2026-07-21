# Kunststofkozijnnodig.nl CRM — kloon van Rebu CRM

Losse kopie van het Rebu CRM, gerebrand naar Kunststofkozijnnodig.nl.
De originele Rebu CRM (`~/projects/Rebucrm`) blijft ongewijzigd bestaan.

## Al gedaan (code + huisstijl)
- Aparte repo `~/projects/KunststofkozijnnodigCRM` (verse git, zonder Rebu's git-historie, node_modules, `.env.local` of Vercel-koppeling).
- Merkkleur groen → **blauw** overal: `globals.css`-tokens, `COLORS` in PDF-`shared-styles.ts`, en 245 hardgecodeerde kleurwaarden in `src/`.
  - Primair `#1e40af`, hover `#1e3a8a`, donker `#1e3a5f`, licht `#3b82f6`, tint `#eff6ff`. Sidebar navy `#0f172a`.
- Bedrijfsnaam/domein: "Rebu Kozijnen" → **Kunststofkozijnnodig.nl**, `rebukozijnen.nl` → `kunststofkozijnnodig.nl`, afzendernamen, footers, mail-/PDF-teksten, login-koppen, manifest, `<title>`.
- Logo's uit de website-repo overgenomen (`public/images/logo-rebu.png` = donker woordmerk, `-white`, `rk-icon*`, `src/app/icon.png`). Slogan "Maken het verschil." blijft (staat ook in het logo).
- AI-assistent hernoemd van "Vraag aan Rebu" → "AI-assistent". DB-lookups `%Rebu%` → `%Kunststofkozijnnodig%`.
- Datamigratie-scripts: `scripts/export-zakelijke-klanten.mjs` (gedraaid: **1693 zakelijke relaties + 31 contactpersonen** geëxporteerd naar `scripts/data/`, buiten git) en `scripts/import-zakelijke-klanten.mjs` (klaar voor de nieuwe DB).

## Nog nodig van jou (blokkeert livegang)
1. **Juridische gegevens** aparte onderneming — KVK, BTW-nummer, IBAN (staan nu als "nog invullen" in `src/lib/pdf/shared-styles.ts`). Nodig vóór de eerste factuur.
2. **Nieuw Mollie-account** → `MOLLIE_API_KEY` (+ webhook/redirect worden automatisch de nieuwe app-URL).
3. **Nieuwe mailboxen + verzendcredentials** — welke afzenderadressen (info@kunststofkozijnnodig.nl e.d.) en de Resend/SMTP-sleutels (`RESEND_API_KEY`/`RESEND_FROM` of `SMTP_*`).
4. **Nieuw Supabase-project** (eigen database) — of ik zet 'm op, of jij levert URL + keys.
5. **Nieuw Vercel-project + domein** (bv. crm.kunststofkozijnnodig.nl) → `NEXT_PUBLIC_APP_URL`.
6. Overige service-keys als je die functies wilt: SnelStart, KVK API, Google Places, AI Gateway/Anthropic, `CRON_SECRET`.

## Daarna (ik doe)
- Nieuw DB-schema draaien (alle migraties), daarna `import-zakelijke-klanten.mjs` → alleen de zakelijke klanten erin.
- Env vullen, deployen, en factuur-PDF + mails visueel controleren.
- Eventueel PDF-cover/achtergrond (`cover-bg.png`, `back-page.jpg`) vervangen door beeld in de nieuwe huisstijl.
