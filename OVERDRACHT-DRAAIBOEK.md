# Draaiboek overdracht

Volgorde om alles over te zetten naar de nieuwe eigenaar. Werk van boven naar
beneden; elke stap kan pas als de vorige klaar is.

Er zijn **drie projecten** en ze horen bij elkaar:

| Project | Vercel | GitHub | Supabase |
|---|---|---|---|
| Rebu CRM | `rebucrm` | `Rebucrm` | eigen project |
| Kunststofkozijnnodig CRM | `kunststofkozijnnodig-crm` | `Kunststofkozijnnodig-CRM` | eigen project |
| Kunststofkozijnnodig website | `kunststofkozijnnodig-nl-ued4` | `kunststofkozijnnodig.nl` | — |

---

## Vooraf — de nieuwe eigenaar maakt aan

- [ ] **GitHub**-account
- [ ] **Vercel**-team op het **Pro**-plan (~$20/mnd). Het gratis Hobby-plan is
      niet toegestaan voor commercieel gebruik.
- [ ] **Supabase**-organisatie op **Pro** (~$25/mnd). Op het gratis plan zijn er
      geen automatische back-ups en wordt een project na een week inactiviteit
      gepauzeerd. Beide projecten moeten hetzelfde plan-niveau hebben als de
      huidige, anders weigert de verhuisknop.
- [ ] **Resend**-account op zijn eigen mailadres met eigen betaalgegevens

Daarna nodigt hij de huidige eigenaar uit als **Owner** in zowel het
Vercel-team als de Supabase-organisatie. Dat is de sleutel: verhuizen kan
alleen als je aan beide kanten toegang hebt.

---

## Stap 1 — GitHub

Per repo: *Settings → General → onderaan **Transfer ownership*** → zijn
gebruikersnaam. Hij bevestigt via e-mail.

- [ ] `Rebucrm`
- [ ] `Kunststofkozijnnodig-CRM`
- [ ] `kunststofkozijnnodig.nl`

Breekt niets: Vercel blijft gewoon deployen.

---

## Stap 2 — Supabase

Per project: *Settings → General → **Transfer project to another
organization***.

- [ ] Rebu-database
- [ ] Kunststofkozijnnodig-database

**De project-ref verandert niet.** URL, anon key en service-role key blijven
exact hetzelfde, dus er hoeft geen enkele omgevingsvariabele aangepast te
worden en er is geen downtime. De data blijft staan — geen export nodig.

---

## Stap 3 — Vercel

Per project: *Settings → Advanced → **Transfer Project*** → zijn team.

- [ ] `rebucrm`
- [ ] `kunststofkozijnnodig-crm`
- [ ] `kunststofkozijnnodig-nl-ued4`

**Alle omgevingsvariabelen gaan mee.** Ze zijn allemaal op *leesbaar* gezet, zodat
`vercel env pull` bij hem straks een compleet `.env.local` oplevert.

Na de verhuizing controleren:
- [ ] GitHub-koppeling staat er nog (anders opnieuw verbinden)
- [ ] Cron-taken staan er nog en draaien
- [ ] Domein `kunststofkozijnnodig.nl` is nog gekoppeld aan het website-project

---

## Stap 4 — Domein

`kunststofkozijnnodig.nl` staat bij een externe registrar met externe
nameservers. De DNS-records zelf blijven ongewijzigd; alleen de koppeling in
het nieuwe Vercel-team moet opnieuw bevestigd worden.

- [ ] Domein toegevoegd aan het website-project in zijn team
- [ ] Website laadt op het echte domein

`rebukozijnen.nl` zit niet in Vercel — daar is niets te doen.

---

## Stap 5 — Resend

Alleen Rebu gebruikt dit; Kunststofkozijnnodig verstuurt via Google Workspace.

- [ ] Hij voegt `rebukozijnen.nl` toe in zijn eigen Resend-account
- [ ] DNS-records klaarzetten, wachten tot *Verified*
- [ ] API-sleutel aanmaken (beperkt tot verzenden)
- [ ] `RESEND_API_KEY` in het `rebucrm`-project vervangen, opnieuw uitrollen
- [ ] Testmail versturen ter controle
- [ ] Pas daarna `rebukozijnen.nl` uit het oude account halen

De oude sleutel blijft werken tot je hem omzet — geen onderbreking.

---

## Stap 6 — Zijn Mac inrichten

Zie `OVERDRACHT.md` in elke repo. Kort:

```bash
brew install node@24
npm install -g @anthropic-ai/claude-code vercel
vercel login

git clone https://github.com/<zijn-account>/Rebucrm.git
cd Rebucrm && npm install && vercel link && vercel env pull && npm run dev
```

Doe dit **na** de overdracht — `vercel link` en `vercel env pull` werken
alleen op projecten die hij zelf bezit.

---

## Stap 7 — Testen

Per CRM afvinken:

- [ ] Inloggen
- [ ] Klant zoeken
- [ ] Offerte versturen mét bijlage → komt aan, PDF klopt
- [ ] Kopie staat in de Verzonden-map
- [ ] Factuur maken en versturen → betaallink werkt
- [ ] **Sync** bij Facturatie → geen foutmelding
- [ ] E-mail komt binnen in het CRM
- [ ] Website laadt op het eigen domein

---

## Stap 8 — Afronden

- [ ] Oude eigenaar verlaat het Vercel-team
- [ ] Oude eigenaar verlaat de Supabase-organisatie
- [ ] Lokale `.env.local`-bestanden bij de oude eigenaar weggooien
- [ ] Sleutels vernieuwen die de oude eigenaar heeft gezien: Supabase
      service-role key, SMTP-wachtwoord, Mollie-sleutel

Die laatste stap is geen wantrouwen maar hygiëne: sleutels die iemand ooit
gezien heeft, horen bij een eigendomsoverdracht ververst te worden.

---

## Wat níét mee hoeft

Deze staan al op naam van de nieuwe eigenaar en blijven ongewijzigd:

- SnelStart developer-portaal (`info@rebukozijnen.nl`)
- Google Workspace mailboxen en app-wachtwoorden
- Mollie

---

## Belangrijkste valkuil

De SnelStart-sleutel verloopt **29 oktober 2026** en daarna elke 90 dagen. Het
CRM waarschuwt drie weken van tevoren op de facturatiepagina. Vernieuwen is
gratis en kost twee minuten — zie §5 van `OVERDRACHT.md`.
