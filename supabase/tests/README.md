# Vaade3D testid

Kõik testid jooksevad ilma päris Supabase'ita: kohalik Postgres 16 + PostgREST + kõik Edge Functionid Denos.
Välised teenused (Kie, Resend, Anthropic, Stripe, EHR) on matkitud failis `gateway.mjs`.

| Fail | Mida kontrollib |
|---|---|
| `start.sh` | paneb püsti andmebaasi (migratsioon + `supabase-stub.sql`), PostgREST-i, värava ja 8 funktsiooni |
| `attack.mjs` | 121 rünnaku- ja rahaloogika kontrolli: otse andmebaasi kirjutamine, võõrad andmed, tagastused, paralleelsed kulutused, vidina tühjendamine, võltsitud IP, botid, maksete võltsimine, tagasimaksed ja vaidlused, müüja tulu |
| `e2e.mjs` | päris äpp brauseris (34 sammu): liitumine, objekt, esituspilt, AI-abiline, toode, logo, vidin, külastaja päring, toode hoovis, makse, müüja |
| `xss.mjs` | pahatahtlikud lingid, päringud ja tooted ei käivita koodi (koos kontrolliga, et test ise töötab) |
| `csp.mjs` | turvapäis (CSP) ei riku äppi demo- ega serverirežiimis |
| `mobile2.mjs` | 390 px ja 768 px: ükski vaade ei lähe ekraanist üle |

Testides on teeradade nimed (`/var/tmp/...`, `/home/claude/...`) arenduskeskkonna omad; JWT võti on ainult testi jaoks.
| `ai3d.test.ts` | Fotod → 3D-mudel ilma päris teenusteta (Supabase, Kie, MuAPI, Anthropic matkitud): check → start → status → done, Tripo/Kie viga → tagastus, kontrollist mööda minek (tõendita, teised fotod, teine subjekt, võltsitud tõend, raske viga + „Jätka ikkagi“) ei õnnestu. Käivita: `deno test -A --no-config --node-modules-dir=none supabase/tests/ai3d.test.ts` |
