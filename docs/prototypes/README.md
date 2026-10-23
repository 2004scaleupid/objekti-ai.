# Käsitsi tehtud 3D-ruumi prototüübid (viide toa 3D kvaliteedile)

- `magamistuba/` — "Magamistuba 3D": üks foto → parameetriline tuba, AI PBR-tekstuurid igale materjalile, three.js r170, GTAO, VSM pehmed varjud, RectAreaLight.
- `saun/` — "Saun 3D": parameetriline saun (lavad laudadest, kivisein, keris), samad valgus- ja materjalivõtted.

Mõlemad on tehtud käsitsi ühe ruumi jaoks. Toa 3D automaatne versioon peab jõudma sama kvaliteedini:
geomeetria Claude'i kirjeldatud parameetrilise stseenina (seinad, nišid, lavad laudadena),
materjalid korduvate PBR-tekstuuridena (mitte foto kleebituna seinale), ja vaatur sama valgustusega.

Ava kohalikult: `npx serve docs/prototypes` → /magamistuba/ või /saun/.
