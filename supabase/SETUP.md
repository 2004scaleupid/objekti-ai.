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
| `garden` | `functions/garden` | „Aed ja ümbrus“ (krundi mudel): katastriüksused, ETAK teed, piirded ja maakatte kõrgusmudel (nDSM) maja ümber (±64 m, teed ±80 m), vahemälus `models/aed/<EHR>/` 30 päeva; `Server-Timing` |
| `photo-scene` | `functions/photo-scene` | Stuudio foto stseen kontekstipõhiste soovituste jaoks (Claude Haiku, struktureeritud väljund, ~0,00013 $ pildi kohta, kasutajale tasuta), vahemälu `photo_scenes` pildi räsi järgi 90 päeva, kulu `ai_usage` (kind `scene`) |
| `checkout` | `functions/checkout` | krediidipaketi ost Stripe'iga (50 € / 100 € / 250 €). Klient kutsub `?forceFunctionRegion=eu-central-1` (andmebaasi kõrval), eelsoojendus `{warm:true}` ostunupul/modaalis; JWT kontroll kohapeal (ES256, JWKS), firma + kiiruspiirang ühe ringiga; vastuses `Server-Timing` (auth, db, stripe, total), brauseri konsoolis `[checkout]` rida |
| `stripe-webhook` | `functions/stripe-webhook` | makse õnnestus → krediidid kontole (sama makse ainult üks kord) |
| `ai-3d` | `functions/ai-3d` | fotod → 3D-mudel (vt allpool). `check` (AI fotokontroll), `start` (puhastus + Tripo, võtab krediidid `price_3d`), `status` (kopeerib .glb kausta `models`) |

## Fotod → 3D-mudel (`ai-3d`)

Töövoog: fotod → Claude fotokontroll → Kie Nano Banana 2.1 puhastus (iga foto eraldi) → MuAPI Tripo H3.1 → .glb kausta `models` → 3D-vaatur äpis (`vendor/GLTFLoader.js`, three r128).

| Subjekt | Fotosid | Slotid |
|---|---|---|
| `building` (maja, saun, kuur, garaaž) | 4 | Esikülg, Vasak külg, Tagakülg, Parem külg |
| `object` (mööbel, toode, grill, telk) | 1–4 | Eest, Vasakult, Tagant, Paremalt |
| `vehicle` (auto, haagis, paat) | 4 | Eest, Vasakult, Tagant, Paremalt |

Tabel ja puhastuse promptid on `functions/ai-3d/index.ts` alguses (`SUBJECTS`); sama tabel on äpis (`P3D` failis `index.html`).

3D on kõigis mallides üks ühine komponent, mida juhib malli seadistus `photo3d:{subject, from, btn}` (`p3Cfg()` failis `index.html`):

| Mall | Kus | `photo3d` |
|---|---|---|
| Kinnisvara, Katusetööd, Fassaaditööd (ja iga aadressivaade) | aadressivaates nupp „Tee päris majast 3D (4 fotot)“, seotakse objektiga | `{subject:'building'}` |
| Foto → 3D-mudel | põhitöö, kasutaja valib või AI pakub | `{}` |
| Toode kliendi hoovis | Stuudio paneel: „Tee tootest 3D-mudel“, toote fotod lähevad slottidesse | `{subject:'object',from:'product'}` |
| Vaba idee | pärast fotot / AI-pilti „Tee sellest 3D“, AI otsustab subjekti | `{from:'image'}` |
| Sisekujundus | „Tee esemest 3D“: ainult märgitud ese (pintsel / ristkülik / vabakuju) lõigatakse välja | `{subject:'object',from:'mark'}` |

Uus mall saab 3D lihtsalt seadistusega (nt `photo3d:{subject:'object',from:'image'}`), ilma uue koodita. Mallil ilma seadistuseta: aadressimall = hoone, fotomall = AI otsustab. Sisseehitatud mallide `photo3d` tuleb alati koodist (ka siis, kui kontol on mallidest salvestatud koopia).

- **Fotokontroll on kohustuslik.** `check` vastab allkirjastatud tõendiga (HMAC, 30 min), mis on seotud firma, subjekti ja täpselt nende fotodega (SHA-256). `start` keeldub (409), kui tõend puudub, on võltsitud, aegunud, teiste fotode või subjekti jaoks või kontroll ei läinud läbi. Blokeerivad ainult `wrong_subject`, `different_objects`, `duplicate_side` ja `unsupported`; kõik muu (`cut_off`, `wrong_side`, `backlit`, `too_dark`, `blurry`, `occluded`, `too_close`, `too_far`) on hoiatus ja „Jätka ikkagi“ (`force`) lubab jätkata. Ok arvutab server ise vigade järgi, AI „ok“ üksi ei loe.
- 1 foto (ainult ese) → Tripo image-to-3d, 2–4 → multiview.
- **Rohkem fotosid (kuni 12):** kui fotosid on rohkem kui külgi, töötab `check` valikurežiimis: üks Claude'i päring kõigi nummerdatud fotodega, AI valib igale küljele parima (terve asi kaadris, teravaim, mitte vastu päikest, vähim varjatud, kõige otsem). Vastuses `mode:"pool"`, `selected` (külg → foto indeks), `missing` (puuduv külg + juhis, nt „Lisa foto tagaküljelt“, blokeerib hoonel ja sõidukil), `unused` (indeks + lühike põhjus). Server kontrollib indekseid (lubatud vahemik, kordumatu). Tõend räsib ainult valitud fotod külgede järjekorras, `start` on muutmata ja saab ainult need. Äpis saab kasutaja foto puudutades külje ise valida; siis tehakse tavaline kontroll valitud fotodega. Kulu logitakse `ai_usage` tabelisse (`3d-check` ja `3d`).
- Krediidid võetakse `start`-is, iga vea korral ja 25 min ajapiirangul tagastatakse. Äpp küsib olekut iga 10 s ka pärast lehe värskendamist (server kopeerib .glb alles olekupäringu ajal).
- Saladused: `MUAPI_API_KEY` (praegu Supabase'is nimega `Muapi.ai `, kood loeb mõlemat), `ANTHROPIC_API_KEY`, `KIE_API_KEY`. Valikulised: `CHECK3D_SECRET` (tõendi võti; vaikimisi tuletatud service_role võtmest), `CHECK3D_MODEL` (vaikimisi `claude-haiku-5-5`), `TRIPO_TEXTURE` (`detailed` = 4K), `TRIPO_FACES` (vaikimisi 150000; langeta, kui .glb tuleb üle ~20 MB).
- **Näidiskaart** (subjekti valikul „Foto → 3D-mudel“ all): andmed `examples/examples.json` (subjekt → fotod, .glb, poster; `null` = ainult pildistamise vihjed). Failid on repo kaustas `examples/` (GitHub Pages, avalik). Maja näide = töö 2740abc1: 4 originaalfotot WebP-na (480 px), mudel tihendatud `npx @gltf-transform/cli optimize --compress meshopt --texture-compress webp --texture-size 2048` (16,4 MB → 1,35 MB), poster vaaturist. Vaatur loeb meshopt'i `vendor/meshopt_decoder.js` abil (three r128). Näide on külgpaneelis nõuannete all (3D klõpsuga, enne poster); telefonis (≤760 px) avab „Vaata näidet“ alumise lehe. Põhiveerus on pärast subjekti valikut kohe pildikohad.
- **3D-mudel Vaba ideas (etapp 1, fotodest tehtud mudelid):** „Lisa 3D-mudel“ (kuubik kirjutuskasti all) või ⋯ → „Ava Vaba ideas“. Tööriistad: pööra, mõõda kaugus, pind, kõrgus maast, silt/märge, mõõtkava, „Kasuta seda vaadet“ (vaade pildiks chati, edasised pildid maksavad nagu tavaliselt). Fotodest tehtud mudelil pole päris mõõtkava: kasutaja mõõdab ühe teadaoleva pikkuse, kuni selleni on väärtused „suhteline“. Mõõdud ja märkmed salvestuvad tabelisse `model_marks` (migratsioon `20261022000000_model_marks.sql`, RLS firma kaupa). Jagatud lingil näidatakse neid ainult siis, kui omanik lülitas ⋯ menüüst „Mõõdud lingil“ sisse (vaikimisi väljas; avalik lugemine `public_model_marks` ainult selle firma enda 3D-töö kohta). Chat saab mõõtude nimekirja kontekstina. Avamine ja mõõtmine on tasuta. Etapp 2: aadressiobjektid.
- **LOD2 andmed elavad failihoidlas, MITTE gitis.** Avalik kaust `lod2` (migratsioon `20261022110000_lod2_bucket.sql`), tee `lod2/v1/NNN.json.gz` (1000 kildu EHR 3 viimase numbri järgi) ja `lod2/v1/geo/GX_GY.json.gz` (250 m ruudud naabrite ja aia jaoks). Failid on gzip-pakitud (äpp ja `garden` pakivad lahti `DecompressionStream`-iga), `cache-control: max-age=31536000`. `data/lod2/` on `.gitignore`-is: **ära pushi seda enam gitti** (vana ajalugu jäi alles, ajalugu ei kirjutatud ümber).
  - Uuendamine: 1) `python3 -I scripts/lod2_tiles.py hooned_lod2-eesti-citygml.zip` (geoportaal.maaruum.ee, kogu Eesti CityGML ~6 GB; kirjutab `data/lod2/`), 2) `python3 -I scripts/lod2_tiles.py --geo-from-shards` või zip-ist EHR-ita hooned `--geo-extra <zip>`, 3) `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… python3 -I scripts/lod2_upload.py data/lod2 v1` (saadab ainult muutunud failid). Kui olemasolevad failid muutuvad, laadi uude versiooni (`v2`) ja muuda `LOD2_VER` failides `index.html` ja `supabase/functions/_shared/garden.ts`: vanad failid on brauserites aasta vahemälus.
  - Tasuta paketi piirid adminile: „Vead“ vaate ülaosas. Failihoidla (täpne, RPC `admin_quota`, migratsioon `20261022120000_admin_quota.sql`) hoiatab üle 800 MB, andmebaas üle 400 MB (iga failihoidla fail on ka rida `storage.objects`-is). Liiklus (egress) on **hinnang**: failipäringud 7 päeva (Management API `usage.api-counts`) × `EGRESS_AVG_KB` (vaikimisi 120), hoiatus üle 4 GB kuus; vajab saladust `SUPABASE_MGMT_TOKEN` (isiklik ligipääsuvõti, annab ligi kõigile selle konto projektidele, seega valikuline). Täpne liiklus ainult Supabase'i armatuurlaual (Usage), link on vaates.
- **Aadressid ja hooned kogu Eestis:** otsing Maa-ameti In-ADS-ist (`inaadress.maaamet.ee/inaadress/gazetteer`, avalik, CORS `*`, proxy't pole; CSP `connect-src` lubab selle). Ainult hooned (`features=EHITISHOONE`, `tunnus` = EHR), korteri number jääb aadressi. 250 ms paus trükkimisel, vana päring katkestatakse, vastused vahemälus. Mitu hoonet ühel aadressil (talu): suurima mahuga (pind × kõrgus) ees. Maja ehitatakse LOD2 kirjest (`houseOf` → `lod2Tuple`: pikk külg x-teljele, 1–2 tiiba nagu vanas Viimsi andmestikus, pinnad ametlikud), naabrid `geo/` ruutudest ±78 m. LOD2 puudumisel (uus hoone) küsitakse mõõdud käsitsi (pikkus, laius, räästas, katus); need on paneelis „Hinnang“. Objekti asukoht ja käsitsi mõõdud salvestuvad `objects.job.loc` (`{x,y,ads,dims}`), jagatud lingis `a,x,y,dm`. Vana Viimsi andmestik (2,8 MB) on index.html-ist eemaldatud; näidismajad on `DEMO_H`. Test: `supabase/tests/house_geom.test.ts`.
- **Ametlikud mõõdud (Maa-amet LOD2):** kildude (1000, kogu Eesti) tegemine ülal; omavalitsuse fail liidetakse olemasolevatega. Aadressiobjektil plokk „Ametlikud mõõdud (Maa-amet)“. Fotodest hoone 3D-mudel seotakse aadressiga Foto → 3D vormis või ⋯ → „Lisa aadress“ (`renders.ehr`); Vaba ideas arvutatakse mõõtkava automaatselt (seinte lõiked vs LOD2 jalajälg, kõrgus kontrolliks). Kui kattuvus < 0,8 või kõrgus erineb > 8%, jääb käsitsi seadistamine. Tulemus `model_marks.fit`; käsitsi mõõtkava kirjutab selle üle. Viide: „Hoonete 3D-mudelid: Maa- ja Ruumiamet 2026“. Kui automaatne mõõtkava on kindel, ilmub tööriist „Ametlik tahk“: klõps katusel/seinal tõstab esile Maa-ameti tahu ja näitab ametlikku pinda (kalle, suund; seinal pikkus), „Lisa märkmena“ salvestab selle.
- Hind: `settings.price_3d` (äpp loeb sealt, eraldi hinnatekste pole).
- **Ühe pildi režiim** („Tee 3D-ks“ mis tahes pildist): `check` ja `start` võtavad `single:true` ja täpselt 1 pildi, mis tahes subjektile → Tripo image-to-3d. Tõendis on režiim (`one`), nii et ühe pildi tõendiga ei saa alustada tavalist tööd ega vastupidi. Äpp ütleb, et 4 fotot igast küljest annab palju parema tulemuse.
- **Kasuta seda 3D-d** (ühine rida: valmis töö, Minu 3D-mudelid, objekti vaade): Jaga linki, Manusta kodulehele, Lae alla .glb, Lisa tootele (`products.model_url`), Lisa objektile/kuulutusele (`objects.model_url`, migratsioon `20261021060000_object_model.sql`), Kasuta pakkumises (tekst + e-kiri päringu saatjale; asendatakse, kui tuleb päris pakkumise funktsioon), Vaata AR-is (ainult telefonis; model-viewer laetakse alles vajutusel).
- Toote 3D-mudel (migratsioon `20261021050000_product_model.sql`): `start` võtab `product_id` (ainult oma firma toode), valmimisel kirjutab server `products.model_url`. Kontroll lubab sinna ainult oma firma .glb-d kaustast `models`.
- Stuudio fotodest tehtud 3D kasutab algset faili (~2048 px), mitte 1100 px eelvaadet. Pärast lehe värskendamist palub äpp sama foto uuesti lisada. AI-pildid lähevad nii nagu on.
- Deploy: `supabase functions deploy ai-3d --project-ref twubqebmjuvwypeduqqq`
- Test: `deno test -A --no-config --node-modules-dir=none supabase/tests/ai3d.test.ts` (kõik välised teenused matkitud).

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
   | `MAIL_FROM` (valikuline) | vaikimisi `Vaade3D <info@vaade3d.ee>` |
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


## Aed ja ümbrus (krundi mudel + aadress)

- Andmed (`GARDEN_V = 3`): `functions/garden` (ja `ai-3d` töö valmimisel taustal) laeb paralleelselt Maa-ameti WMS-ist maakatte kõrgusmudeli (`nDSM`, 768 px PNG) ja piirded (`etak_piirded`, raster – WFS piirete kiht on tühi), katastri WFS-ist katastriüksused (`kataster:ky_kehtiv`) ning ETAK WFS-ist liiklusalad (`e_501_tee_a`, kõik rõngad – kvartalid on aukudena) ja teede teljed laiusega (`e_501_tee_j`). Failid `models/aed/<EHR>/` (ndsm.png, fences.png, meta.json). Ortofotot enam ei laeta.
- Vaade (`js/garden.js`, laetakse ainult aia sisselülitamisel): hele arhitektuurne mudel. Krunt muruna täpselt katastri kujus + õhuke piirjoon + ametlik pindala; väljaspool neutraalne hall-beež, mis hajub. Teed asfalthallid. Piirded õhukesed jooned. Krundi hooned (ka kõrvalhooned, `data/lod2/geo` sisaldab nüüd ka EHR-ita hooneid) valged, klõpsuga põhiplaan/kõrgus/katus; naabrid helehallid. Puud ainult olulised (nDSM ≥ 5 m, võra ≥ 2,5 m, kuni 25), lihtne madalpolü lehtpuu/okaspuu. Mõõdud: krundi servad, maja kaugus piiridest ja naabritest, kõrvalhoonete pind. Mudel jääb heledaks ka tumeda kasutajaliidese korral.
- Piirang: ETAK-is pole eraõuede sissesõite ega teid (õu = kogu hoov), seega sillutis on ainult tänavatel/liiklusaladel.
- Ajad: konsoolis `[aed] kokku … ms {server, meta, andmed, puud, mudel}` ja serveri `Server-Timing`.
- Andmeallikate viide: „Kataster, teed, piirded, maakatte kõrgusmudel, hooned: Maa- ja Ruumiamet 2026“.

## Registreerimise kaitse

- Tervituskrediidid tulevad alles e-posti kinnitamisel (päästik `on_auth_user_welcome`, üks kord firma kohta).
- Auth hook „Before user created“ = `public.hook_before_user_created` (Dashboard → Authentication → Hooks; sisse lülitatud Management API kaudu): ajutised e-posti domeenid (`blocked_email_domains`, 9913 domeeni, ka alamdomeenid) ja max 3 kontot IP kohta ööpäevas (`rate_limits`, võti `signup:ip:<ip>`). Admin API kutsel IP puudub -> ei piira.
- Testid päris baasis (kõik veeretatakse tagasi, õnnestumine = viga `TESTS_OK`): `supabase/tests/sql/*.sql`, käivita SQL Editoris või Management API `database/query` kaudu.

## Turnstile (Cloudflare captcha) — sisselogimine, registreerimine, parooli taastamine ja muutmine

Ilma võtmeta töötab kõik nagu enne (vidinat pole). Järjekord on oluline: kui Supabase'is lülitad captcha sisse enne, kui äpp saadab tokenit, ei saa keegi sisse logida.

1. Cloudflare → Turnstile → Add widget: domeenid `app.vaade3d.ee` (ja vajadusel `localhost`), Widget Mode **Managed**.
2. **Site key** → `index.html`, rida `<script>window.V3D_CONFIG={...}</script>`: lisa `"turnstile": "0x4AAAA…"` (nt `{"url": "…", "key": "…", "turnstile": "0x4AAAA…"}`). Commit + push, oota kuni GitHub Pages on uuendatud (~1 min).
3. **Secret key** → Supabase Dashboard → Authentication → Attack Protection → Enable Captcha protection → Provider **Cloudflare Turnstile** → Captcha secret → Save.
4. Kontroll: logi välja ja uuesti sisse. Kui midagi läheb valesti, lülita punktis 3 captcha välja (äpp töötab edasi ka tokeniga).

Testvõtmed (Cloudflare): site `1x00000000000000000000AA` (alati läbi), `3x00000000000000000000FF` (nõuab klõpsu); secret `1x0000000000000000000000000000000AA`. Päris Supabase'i vastu jooksvad testid (`supabase/tests/*.mjs`) vajavad captcha sisselülitamisel testvõtmeid või captcha väljalülitamist testi ajaks.

## Varukoopia (andmebaas, iga öö)

Tasuta paketil Supabase varukoopiaid ei tee. Öine GitHub Action teeb andmebaasist (rollid, skeem, andmed; **mitte** failihoidla faile) krüpteeritud koopia ja hoiab 14 viimast **privaatse** repo release'ides.

Seadistamine (üks kord):
1. Tee GitHubis privaatne repo, nt `vaade3d-backups` (README-ga, et oleks vähemalt üks commit).
2. Kopeeri `supabase/backup/db-backup.yml` sinna: `.github/workflows/db-backup.yml`.
3. Võti (oma arvutis, `brew install age`): `age-keygen -o vaade3d-backup.key`. Fail `vaade3d-backup.key` on **privaatne võti**: hoia see paroolihalduris või mujal turvaliselt, ilma selleta koopiat avada ei saa. Rida `# public key: age1…` on avalik võti.
4. Privaatse repo saladused (Settings → Secrets and variables → Actions):
   - `SUPABASE_DB_URL` = `postgresql://postgres.twubqebmjuvwypeduqqq:<andmebaasi parool>@aws-1-eu-central-1.pooler.supabase.com:5432/postgres` (Session pooler, port 5432; parool: Supabase → Project Settings → Database, vajadusel „Reset database password“).
   - `AGE_RECIPIENT` = avalik võti `age1…`.
5. Actions → „DB varukoopia“ → Run workflow (esimene proov). Rikke korral saadab GitHub e-kirja.

Taastamine (uude või samasse projekti):
```bash
gh release download <tag> --repo <omanik>/vaade3d-backups
age -d -i vaade3d-backup.key vaade3d-db-<aeg>.tar.gz.age | tar -xzf -
psql --single-transaction --variable ON_ERROR_STOP=1 --file roles.sql --file schema.sql --command 'SET session_replication_role = replica' --file data.sql --dbname "<uue projekti Session pooleri URL>"
```
Seejärel: migratsioonid on juba skeemis; funktsioonid ja saladused uuesti (`supabase functions deploy …`, `supabase secrets set …`), LOD2 kaust uuesti `scripts/lod2_upload.py`-ga, kasutajate failid (uploads, renders, models) varukoopias **ei ole**.
