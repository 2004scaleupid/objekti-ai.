# Vaade3D: 3D-mudel fotodest (üldine süsteem)

Repo: 2004scaleupid/objekti-ai. Supabase: twubqebmjuvwypeduqqq (Vaade3D) — enne iga supabase käsku kontrolli ref'i, ära puutu ühtegi teist projekti.
Ära commiti `data/`, `tools/`, `supabase/.temp/`. Lisa `.claude/settings.local.json` repo `.gitignore`-i.

## Eesmärk
Üks süsteem, mis teeb **mis tahes asja fotodest** pööratava 3D-mudeli: maja, saun, kuur, mööbel, toode, grill, telk, auto jne. Mitte ainult maja.
Iga mall (Kinnisvara, Foto → 3D-mudel, Toode kliendi hoovis, tulevased mallid) kasutab sama süsteemi, ainult "subjekt" on erinev.

Töövoog on testitud päris majal ja tulemus oli hea: **fotod → Kie Nano Banana 2.1 puhastus → MuAPI Tripo H3.1 → .glb → 3D-vaatur.**

## Mis on juba olemas (commit 2a1c627, Supabase'is üleval)
- Migratsioon `20261021040000_ai_3d.sql`: töö liik `'3d'`, hinnaveerg `settings.price_3d` (ajutine väärtus), `renders.ext_id`, `renders.stage`, kaust `models` (.glb, 50 MB), 3D tööde tagastus 25 min pärast.
- Edge function `ai-3d`: `start` (täpselt 4 maja fotot) ja `status`. MuAPI võti on secret'ina (`Muapi.ai ` / `MUAPI_API_KEY`).

Need tuleb **üldistada**, mitte uuesti teha.

## 1. Subjektid (üks konfiguratsioon, serveris ja äpis sama)

| subject | Näited | Fotosid | Pildistamise kohad (slotid) |
|---|---|---|---|
| `building` | maja, saun, kuur, aiamaja, garaaž | min 4, max 4 | Esikülg, Vasak külg, Tagakülg, Parem külg |
| `object` | mööbel, toode, grill, telk, lamp, kuju | min 1, soovitus 4 | Eest, Vasakult, Tagant, Paremalt |
| `vehicle` | auto, haagis, paat, mootorratas | min 4, max 4 | Eest, Vasakult, Tagant, Paremalt |

Mitte toetatud: toad / interjöör, maastik, inimesed. Ütle seda kasutajale selgelt (Tripo teeb üksikobjekte, mitte ruume).

Mallide seos — **3D fotodest peab olema KÕIGIS mallides**, üks ühine komponent (`photo3d: {subject, ...}` malli juures):

| Mall | Kuidas 3D fotodest seal töötab | subject |
|---|---|---|
| Kinnisvara kuulutus | aadressi-vaate kõrval nupp „Tee päris majast 3D (4 fotot)“, seotakse objektiga | `building` |
| Katusetööd | sama nupp, seotakse objektiga | `building` |
| Fassaaditööd | sama nupp, seotakse objektiga | `building` |
| Foto → 3D-mudel | põhitöö: kasutaja valib Maja/hoone · Ese/toode · Sõiduk või AI pakub | valik / AI |
| Toode kliendi hoovis | „Tee tootest 3D-mudel“ – firma toode (Seaded → Minu tooted), .glb salvestatakse toote juurde | `object` |
| Vaba idee | pärast fotot / AI-pilti nupp „Tee sellest 3D“; AI fotokontroll tunneb ära, mis fotol on | AI otsustab |
| Sisekujundus | „Tee esemest 3D“ – üks mööbliese või toode toast (mitte terve tuba); kasutaja näitab, mis ese | `object` |

Mitte toetatud: terve tuba/interjöör, maastik, inimesed. Kui AI kontroll leiab `unsupported`, ütleb äpp selgelt, et 3D-ks saab teha maja, eseme või sõiduki, ja krediite ei võeta.
Uus mall saab 3D lihtsalt seadistusega `photo3d: {subject: 'object'}` vms, ilma uue koodita.

## 2. Puhastuse prompt (Kie, mudel `nano-banana-2-1`, 1K, iga foto eraldi, paralleelselt)

Üks põhitekst + subjekti osa. `{SUBJECT}` asendub sõnaga (house / object / vehicle).

**Põhi (kõigile):**
```
Clean this exact photo for 3D reconstruction of the {SUBJECT}. Keep the {SUBJECT} 100% identical and pixel-faithful: same shape, proportions, materials, textures, colours, and every detail in the same position and size. Do NOT add, move or remove any part, detail, opening, logo or attachment of the {SUBJECT}. Remove only what is not the {SUBJECT}: background clutter, people, animals and anything in front of it; fill hidden parts with the matching surface. Even soft daylight with no harsh shadows. Plain pure white background, the whole {SUBJECT} fully in frame, same camera angle, sharp fine detail.
```

**building – lisa:**
```
Keep cladding boards, every window and door, gutters, downpipes, chimney, roof vents and everything attached to the walls (satellite dish, heat pump, lamps, vents, small signs). Remove trees, branches, bushes, rocks, snow piles and plants in front of the walls. Windows and glass doors must look like closed glass with soft daylight reflection and light curtains behind, never showing the room inside. Keep any snow on the roof.
```

**object – lisa:**
```
Keep all handles, legs, seams, screws, buttons, labels and printed text exactly as they are. Remove the table, floor, hands or stand it rests on unless they are part of the object. Transparent or glass parts stay transparent-looking, never show what is behind them.
```

**vehicle – lisa:**
```
Keep wheels, rims, lights, mirrors, badges, number plate area, trims and paint finish exactly as they are. Remove other cars, people and street objects. Windows look like tinted glass with soft reflection, never showing the interior.
```

Testitud: hoone versioon hoidis antenni, soojuspumba ja kõik aknad alles ega mõelnud midagi juurde. Ilma „Do NOT add, move or remove“ lauseta lisas AI ühe akna.

## 3. 3D (MuAPI Tripo H3.1)
- **2–4 fotot** → `POST https://api.muapi.ai/api/v1/tripo3d-h31-multiview-to-3d`
  `{"images_list":[...], "pbr":true, "texture_quality":"detailed", "face_limit":150000}`
  Järjekord: eest, vasakult, tagant, paremalt.
- **1 foto** (ainult `object`) → `POST .../tripo3d-h31-image-to-3d`
  `{"image_url":"...", "pbr":true, "texture_quality":"detailed", "face_limit":150000}`
- Tulemus: `GET .../predictions/{request_id}/result` → `status` processing | completed | failed, `outputs[]` sisaldab .glb. ~4–5 min.
- Header `x-api-key`. Kopeeri .glb alati `models` kausta (MuAPI lingid on ajutised).
- 4K tekstuur (`detailed`) on testis selgelt teravam kui 2K. Kui fail tuleb üle ~20 MB, langeta `face_limit`.
- Meie kulu ~0,35 € ühe mudeli kohta (Kie 4 × ~0,02 € + Tripo 0,30 $). Logi see `ai_usage` tabelisse.

## 4. AI fotokontroll enne 3D-d (KOHUSTUSLIK)
Halbadest fotodest tuleb halb 3D ja klient on pettunud. Seepärast vaatab AI fotod enne üle ja 3D-d ei käivitata ega krediite võeta, kuni fotod on korras.

**Kuidas:** uus action `check` funktsioonis `ai-3d` (või eraldi funktsioon). Üks Claude vision kõne (olemasolev `ANTHROPIC_API_KEY`, mudel `claude-haiku-5-5`, kõik fotod ühes päringus, väikesena ~768 px). Meie kulu ~0,005 € kontrolli kohta, rate limit nagu teistel.

**AI kontrollib iga fotot ja kõiki koos:**
1. **Subjekt:** mis fotol on (`building` / `object` / `vehicle` / `unsupported` – tuba, maastik, inimene). Kas kõigil fotodel on **üks ja sama** asi.
2. **Terviklikkus:** kas asi on **tervikuna kaadris** (katus, nurgad, rattad ei ole ära lõigatud).
3. **Küljed:** kas iga foto on õigest küljest ja küljed on erinevad (hoonel ja sõidukil 4 erinevat külge; kaks fotot samast küljest = viga).
4. **Valgus ja teravus:** vastu päikest, liiga tume, ülesäritatud, udune / liikumisest hägune.
5. **Varjamine:** kui suur osa on varjatud (puud, autod, inimesed ees). Väike varjamine on OK (puhastus eemaldab), aga kui üle ~30% seinast/asjast on peidus → palu uus foto.
6. **Kaugus / nurk:** liiga lähedal (kaadris ainult osa), liiga kaugel (asi väike), liiga kaldu.

**Vastus (JSON, Claude'ilt nõutud):**
```json
{
  "subject": "building",
  "ok": false,
  "photos": [
    {"slot": 0, "side": "front", "ok": true, "issues": []},
    {"slot": 2, "side": "back", "ok": false, "issues": ["backlit"], "tip": "Pildista tagakülge siis, kui päike on sinu selja taga."}
  ],
  "summary": "Tagakülje foto on vastu päikest. Tee see uuesti, teised 3 on head."
}
```
`issues` väärtused: `wrong_subject`, `different_objects`, `cut_off`, `duplicate_side`, `wrong_side`, `backlit`, `too_dark`, `blurry`, `occluded`, `too_close`, `too_far`, `unsupported`.

**Äpis:**
- Kontroll käivitub automaatselt, kui kõik slotid on täis (ja uuesti, kui foto vahetatakse). Saatmisnupp jääb lukku, kuni `ok: true`.
- Halb foto saab slotis punase märgi ja lühikese eestikeelse juhise (`tip`), vestlusesse tuleb `summary`.
- Kasutaja võib „Jätka ikkagi“ ainult siis, kui vead on kerged (`occluded`, `too_far`); `cut_off`, `different_objects`, `unsupported`, `duplicate_side` blokeerivad.
- „Foto → 3D-mudel“: subjekti valik täidetakse AI vastusest (`subject`), kasutaja saab muuta.
- **Server kontrollib ka ise:** `start` keeldub, kui viimane `check` sama fotode komplekti kohta (räsi) ei olnud `ok` (või kasutaja valis lubatud „Jätka ikkagi“). Nii ei saa kontrolli brauserist mööda minna.

## 5. Backend muudatused (`ai-3d`)
- `start` võtab `{subject, photos:[1–4 data-URL], object_id?, label?, tpl?}`; kontrolli min/max subjekti järgi.
- Puhastuse prompt = põhi + subjekti lisa (konstandid ühes kohas).
- 1 foto → image-to-3d, 2–4 → multiview.
- Salvesta `renders.prompt`-i subjekt ja prompt; ai_usage `kind '3d'`, `model` vastavalt.
- Puhastatud pildid `storeImage()` **ilma** companyId-ta (firma logo ei tohi tekstuuri sattuda).
- Muu (krediidid, tagastus, `status`, kaust `models`) jääb samaks.

## 6. Äpp (Stuudio, commit 2c9e082)
- `mudel3d`: eemalda „peagi“. Subjekti valik (3 nuppu) või AI soovitus pärast esimest fotot.
- Dokis slotid subjekti järgi (pealdistega), `stAddFiles` täidab järgmise tühja sloti; saatmine lubatud alles siis, kui min fotosid on täis.
- 3D jaoks suurem foto: ~2048 px, JPEG 0.85 (praegune `shrink()` 1100 px on liiga väike).
- Paneelis juhised subjekti järgi (terve asi kaadris, astu kaugemale, ära pildista vastu päikest, iga külg eraldi foto).
- Pärast saatmist: fotod → „Puhastan fotosid…“ → „Ehitan 3D-mudelit… ~4 min“ → puhastatud fotod + 3D-vaatur. Töö id sessiooni juures, et lehe värskendamisel jätkuks.
- Vaatur: `vendor/three.min.js` (r128) + `vendor/OrbitControls.js`; lisa `vendor/GLTFLoader.js` versioonist three@0.128.0 (ilma CDN-ita). Pööramine, suum, pehme valgus + vari, laadimisriba, „Laadi alla .glb“.
- Demorežiimis (pole sisse logitud): selge teade, et 3D töötab ainult kontoga.
- **Kliendihinda ära määra ega kirjuta teksti sisse.** Jann teeb eraldi hinnasüsteemi (mille eest ja kui palju klient maksab). Kasuta olemasolevat hinna loogikat (`price('3d')` / `settings.price_3d`) nii, et hinda saab hiljem muuta ühest kohast; ära lisa uusi hinnatekste, pakette ega summasid.

## Protsess
1. Uuri koodi (Stuudio, ai-3d, ai-image, krediitide SQL, three versioon), näita plaani ja **oota kinnitust**.
2. Tee backend + äpp, deno check, migratsioon (kui vaja) kohalikul Postgresil, testid `supabase/tests` (MuAPI mock: start → status → done, viga → tagastus), 390 px mobiil.
3. Deploy ainult Vaade3D projekti (`supabase functions deploy ai-3d --project-ref twubqebmjuvwypeduqqq`).
4. Uuenda `supabase/SETUP.md`, commit ja push main'i. Ütle, mis on deploy'tud.
