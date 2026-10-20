# Vaade3D

Sisesta aadress ja maja kerkib 3D-s koos mõõtudega. Objektile ei pea sõitma.

Veebiäpp Eesti katuse-, fassaadi- ja ehitusfirmadele (ja teistele nišidele mallide kaudu):

- **Majavaade 3D**: aadressi järgi 3D-mudel Maa- ja Ruumiameti LOD1 andmetest. Kuvatakse katuse ja seinte pinnad, kõrgused, krunt, hoov ja kaugused naabritest.
- **Mõõtmine**: klõpsa mudelil, et mõõta kaugusi ja pindu.
- **AI-abiline**: arvutab objekti andmete põhjal pindu ja materjalikoguseid.
- **Esituspilt**: fotorealistlik AI-pilt objekti 3D-mudelist.
- **Disain pildist**: oma fotost uus värv, materjal või stiil (maja, tuba, aed, ese, toode, auto, vaba idee).
- **Mallid**: iga niš (päikesepaneelid, moodulmajad, kinnisvara, haljastus …) saab oma küsimused, mõõdud ja AI rolli. Malle saab lisada admin-vaates.
- **Krediidid**: objektivaade 10 kr (5 €), esituspilt 4 kr (2 €), disain pildist 2 kr (1 €). Partneri sooduskoodid ja komisjonid.
- **Admin**: analüütika, kasutajad, partnerid, väljamaksed, kulud ja ROI, mallid, tagasiside, kust tullakse.

## Staatus

See on **töötav kasutajaliidese demo** ühes failis (`index.html`).

- 3D-andmed: Viimsi vald (6763 aadressi, 11362 hoonet).
- Kasutajad, krediidid ja maksed on demo (salvestuvad brauserisse).
- Admin-vaate arvud on näidisandmed.
- AI-pildid: demo kohatäitjad. Mallide näidispildid on päris AI tulemused (Kie.ai Nano Banana 2.1).

## Järgmised sammud

1. Server ja andmebaas (Supabase): sisselogimine, objektid, krediidid.
2. Stripe maksed.
3. Kie.ai pildimudel ja Claude API serveri kaudu (API võtmed ainult serveris).
4. LOD1 andmed kogu Eestile.

## Käivitamine

Ava `index.html` brauseris või vaata GitHub Pagesis. Ehitusprotsessi pole vaja.
