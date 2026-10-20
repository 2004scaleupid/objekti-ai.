# Vaade3D taustasüsteem (Supabase)

Kõik, mis peab olema turvaline, töötab serveris: krediidid, hinnad, AI võtmed, maksed, päringud ja e-kirjad.
Brauser ei näe ühtegi salajast võtit ja ei saa hinda ega saldot muuta.

## Mis siin on

| Osa | Fail | Mida teeb |
|---|---|---|
| Andmebaas | `migrations/20261020000000_init.sql` | firmad, kasutajad, krediidid, objektid, pildid, tooted, vidinad, päringud, müüjad, väljamaksed, õigused (RLS) |
| `ai-image` | `functions/ai-image` | esituspilt / disain pildist / toode hoovis. Võtab krediidid, kutsub Kie.ai, salvestab pildi. Vea korral tagastab krediidid |
| `ai-chat` | `functions/ai-chat` | AI-abiline (Claude), ainult objekti andmete põhjal |
| `widget` | `functions/widget` | avalik: vidina seaded + firma tooted |
| `widget-lead` | `functions/widget-lead` | avalik: päring vidinast → andmebaasi, firmalt 7 krediiti, e-kiri firmale, soovi korral webhook |
| `widget-place` | `functions/widget-place` | avalik: külastaja foto + toode → AI pilt (firmalt 2 krediiti, max 3 pilti päevas ühelt IP-lt) |

Kõik AI-pildid saavad firma logo alla paremale (kui firmal on logo ja seadetes „Logo AI-piltidel“ sees). Originaal ilma logota salvestatakse kõrvale (`…-raw.jpg`).
| `ehr` | `functions/ehr` | ehitisregistri andmed EHR-koodi järgi |
| `checkout` | `functions/checkout` | krediidipaketi ost Stripe'iga (50 € / 100 € / 250 €) |
| `stripe-webhook` | `functions/stripe-webhook` | makse õnnestus → krediidid kontole (sama makse ainult üks kord) |

## Reeglid serveris (tabel `settings`, muudetav adminis)

- 1 krediit = 0,50 €. Objekt 10, esituspilt 4, disain / toode hoovis 2, vidina päring 7.
- Uus firma saab 30 tervituskrediiti.
- Müüja koodiga liitunud firma: esimesed 20 kasutust −20%.
- Müüja saab 25% oma toodud firmade **maksetest** alatiseks (`partner_uses = 0`). Tasuta krediitide kasutus komisjoni ei anna, et võltskontodega ei saaks raha teenida.
- Väljamakse alates 20 €.

## Seadistamine (üks kord)

1. **Supabase:** uus projekt `vaade3d`, regioon Frankfurt (eu-central-1). NB! Mitte Stockpilo projekti.
2. **Andmebaas:** SQL Editor → kleebi `migrations/20261020000000_init.sql` → Run.
   (või `supabase link --project-ref <ref>` ja `supabase db push`)
3. **Auth:** Authentication → URL Configuration → Site URL `https://app.vaade3d.ee`.
   E-kirjad (kinnitus, parooli taastamine) Resendi SMTP kaudu: Authentication → SMTP.
4. **Saladused:** Edge Functions → Secrets:

   | Nimi | Kust saab |
   |---|---|
   | `KIE_API_KEY` | kie.ai → API Key |
   | `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |
   | `RESEND_API_KEY` | resend.com → API Keys (domeen vaade3d.ee kinnitada) |
   | `STRIPE_SECRET_KEY` | Stripe → Developers → API keys (alguses `sk_test_…`) |
   | `STRIPE_WEBHOOK_SECRET` | Stripe → Webhooks → lisa `https://<ref>.supabase.co/functions/v1/stripe-webhook`, sündmused `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`, `charge.dispute.created` |
   | `APP_ORIGINS` (valikuline) | lehed, kuhu makse järel tagasi suunatakse; vaikimisi `https://app.vaade3d.ee,https://2004scaleupid.github.io` |
   | `MAIL_FROM` (valikuline) | vaikimisi `Vaade3D <paringud@vaade3d.ee>` |
   | `KIE_MODEL` (valikuline) | vaikimisi `nano-banana-2-1` |
   | `ANTHROPIC_MODEL` (valikuline) | vaikimisi `claude-haiku-5-5` |

5. **Funktsioonid:** `supabase functions deploy` (loeb `config.toml`, avalikud funktsioonid ilma sisselogimiseta).
6. **Admin:** pärast enda kontoga registreerimist SQL Editoris:
   `update profiles set is_admin = true where email = 'sinu@email.ee';`
7. **Google'iga sisselogimine (valikuline):** Authentication → Providers → Google.
8. **Rakendus:** `index.html` saab projekti URL-i ja avaliku (anon) võtme. Ilma nendeta jääb rakendus demo-režiimi nagu praegu.

## Turvalisus (Auth seaded enne launchi)

- Authentication → Providers → Email: **Confirm email sees** (tervituskrediidid saab kasutada alles pärast kinnitamist).
- Authentication → Attack Protection: **CAPTCHA** (Cloudflare Turnstile) ja **Leaked password protection** sisse.
- Väljamaksed müüjatele teeb admin käsitsi; viimase 14 päeva tulu on „ootel“ (tagasimakse aken).

## Pärast esimest deploy'd üle kontrollida

- **Külastaja IP:** pane funktsioonile saladus `LOG_IP=1`, saada vidinast üks päring kahest eri võrgust (telefon + wifi) ja vaata Edge Functions → Logs, et `cf-connecting-ip` näitab päris IP-d. Siis eemalda `LOG_IP`. (Põhikaitse on niikuinii vidina päevalimiit.)
- Saada endale üks proovipäring ja tee üks 50 € ost Stripe'i testrežiimis.

## Testitud

- SQL migratsioon jookseb puhtalt läbi (Postgres 16).
- Rahaloogika: liitumine müüja koodiga, −20% soodustus, krediitide kulutamine, krediidid otsas, sama makse topelt ei lähe läbi, müüja komisjon 25%.
- Turvalisus: kasutaja ei saa muuta oma saldot, soodustust, admin-õigust ega teise firma andmeid; `spend_credits` on ainult serverile.
- Funktsioonid läbivad Deno tüübikontrolli.
- Rünnakutestid (121 kontrolli) päris Postgres + PostgREST + funktsioonide vastu: otse andmebaasi kirjutamine, võõra firma andmed, tagastuse ärakasutamine, paralleelsed kulutused, vidina krediitide tühjendamine, võltsitud IP, botid, XSS e-kirjas, maksete võltsimine ja kordamine, tagasimaksed, müüja enda ostud. Testid on kaustas `tests/` (vt `tests/README.md`).
