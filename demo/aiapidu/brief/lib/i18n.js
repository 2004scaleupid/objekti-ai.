// Demo keeletõlge: ?lang=en (või <html data-lang="en">) tõlgib lehe teksti inglise keelde.
// Eesti keeles ei tee midagi. Tõlgib tekstisõlmed, SVG teksti ja alt/title/aria-label atribuudid,
// ka hiljem lisatud sisu (MutationObserver). Numbrite koma -> punkt.
(function () {
  'use strict';
  const q = new URLSearchParams(location.search);
  const EN = q.get('lang') === 'en' || document.documentElement.dataset.lang === 'en';
  window.V3D_LANG = EN ? 'en' : 'et';
  if (!EN) return;
  document.documentElement.lang = 'en';

  const N = '[\\d,.]+';
  // Terved laused ja mustrid enne sõnu (järjekord on oluline)
  const P = [
    [/Aiapidu 12 külalisele — kolm paigutust teie hoovis/g, 'Garden party for 12 — three layouts in your yard'],
    [/Aiapidu 12 külalisele/g, 'Garden party for 12'],
    [/Iga versioon on arvutatud rendifirma päris toodetest ja mõõtudest\. Vaadake 3D-s ringi, klõpsake esemel mõõtude nägemiseks või laadige alla 2D plaan\./g, 'Each version is calculated from the rental company’s real products and dimensions. Look around in 3D, click an item to see its dimensions, or download the 2D plan.'],
    [/Mõõdud: rendifirma tootelehed, kontrollitud (\S+?)\. Kinnitamata mõõdud on märgitud/g, 'Dimensions: rental company product pages, checked $1. Unconfirmed dimensions are marked'],
    [/Pildid on illustratsioonid; täpsed mõõdud on 3D-s ja 2D plaanil\./g, 'Images are illustrations; exact dimensions are in 3D and on the 2D plan.'],
    [/Eraüritus 12/g, 'Private event for 12'],
    [/Lohista = pööra · rull\/näpistus = suumi · klõps esemel = mõõdud/g, 'Drag = rotate · scroll/pinch = zoom · click an item = dimensions'],
    [/kõik tingimused täidetud/g, 'all requirements met'],
    [/vajab parandust/g, 'needs fixing'],
    [/✓ kõik täidetud/g, '✓ all met'],
    [new RegExp('Külalised: nõutud (\\d+) · istekohti (\\d+) · püsti kuni (\\d+)', 'g'), 'Guests: required $1 · seats $2 · standing up to $3'],
    [new RegExp('Sissepääs vaba: (' + N + ' m) lai, (' + N + ' m) sügav', 'g'), 'Entrance clear: $1 wide, $2 deep'],
    [/Kõik ala sees: telk (.+?) alal (.+?), midagi ei kattu/g, 'All inside the area: tent $1 in area $2, nothing overlaps'],
    [/Kõik mahub telki (.+?), midagi ei kattu/g, 'Everything fits in the $1 tent, nothing overlaps'],
    [/Kõik mahub (.+?), midagi ei kattu/g, 'Everything fits $1, nothing overlaps'],
    [/Telk on kataloogi suurus:/g, 'Tent is a catalogue size:'],
    [/mõõdetud pealtvaate pildilt/g, 'measured from the top-view photo'],
    [new RegExp('Ala (' + N + ') m² · telgi põrand (' + N + ') m² · hõivatud (' + N + ') m² · vaba (' + N + ') m²', 'g'), 'Area $1 m² · tent floor $2 m² · occupied $3 m² · free $4 m²'],
    [new RegExp('(' + N + ') m² külalise kohta \\(vaba (' + N + ') m²\\)', 'g'), '$1 m² per guest ($2 m² free)'],
    [/Mõõt kontrollimata \(STD\):/g, 'Unverified dimension (STD):'],
    [/Mõõt kontrollimata:/g, 'Unverified dimension:'],
    [/Mõõt pole tootelehelt kinnitatud \(STD\)/g, 'Dimension not confirmed on the product page (STD)'],
    [/\(nõue ≥ /g, '(min '],
    [/Vahekäik \(kitsaim\)/g, 'Aisle (narrowest)'],
    [/Lava ees vaba/g, 'Clear in front of stage'],
    [/Tooli taga/g, 'Behind chairs'],
    [/tooli taga/g, 'behind chairs'],
    [/Seinast:/g, 'From wall:'],
    [/Kaugus \(m\)/g, 'Distance (m)'],
    [/Kaugus:/g, 'Distance:'],
    [/Vaba ala \(lava ees, teenindus\)/g, 'Clear area (in front of stage, service)'],
    [/Sissepääs, hoia vaba/g, 'Entrance, keep clear'],
    [new RegExp('Sissepääs vaba (' + N + ' m) sügavuselt', 'g'), 'Entrance clear to a depth of $1'],
    [/Lauad ja toolid/g, 'Tables and chairs'],
    [/Põhi koos vaba ruumiga/g, 'Footprint incl. clearance'],
    [new RegExp('\\(ees (' + N + ' m), külgedel (' + N + ' m)\\)', 'g'), '(front $1, sides $2)'],
    [/Moodul 1 × 2 m\. Jalad 20, 40, 60 või 100 cm \(poodium-1-x-1m leht\)\./g, 'Module 1 × 2 m. Legs 20, 40, 60 or 100 cm (podium-1-x-1m page).'],
    [/Toitlustuseks kasutatakse kandilist lauda 183 × 76\./g, 'A rectangular 183 × 76 table is used for catering.'],
    [/\(toolid \+ /g, '(chairs + '],
    [/(\d+) lauda · (\d+) tooli/g, '$1 tables · $2 chairs'],
    [/\(teenindusala /g, '(service area '],
    [/\(ümber /g, '(around '],
    [/Spetsifikatsioon (\S+): seina kõrgus (\S+ m), harja kõrgus (\S+ m), sammu pikkus (\S+ m)\. Rendis pikkused (\S+) m\./g, 'Specification $1: wall height $2, ridge height $3, bay length $4. Lengths for rent $5 m.'],
    [/(\S+\.pdf): sein (\S+ m), hari (\S+ m), samm (\S+ m)\. Pikkused (\S+) m\./g, '$1: wall $2, ridge $3, bay $4. Lengths $5 m.'],
    [/Suurused lehelt; serva ja tipu kõrgust lehel ei ole\./g, 'Sizes from the page; edge and peak heights are not listed.'],
    [/Näita mõõte/g, 'Show dimensions'],
    [/Vaheta laud…/g, 'Swap table…'],
    [/Leia parandused/g, 'Find fixes'],
    [/Paiguta uuesti samade toodetega/g, 'Re-plan with the same products'],
    [/Selle muudatusega paigutust ei leitud\./g, 'No layout found with this change.'],
    [/Kontrollitud parandusi ei leitud\./g, 'No verified fixes found.'],
    [/kitsaim koht:/g, 'narrowest spot:'],
    [/kataloogis pole mudelit/g, 'no model in the catalogue'],
    [/Kõik tooted/g, 'All products'],
    [/Kõik versioonid/g, 'All versions'],
    [/Sündmuse plaan/g, 'Event plan'],
    [/Pilt paigutusest hoovis/g, 'Image of the layout in the yard'],
    [/Paigutus (\w) hoovis/g, 'Layout $1 in the yard'],
    [/Tootenimekiri/g, 'Product list'],
    [/plaan päris mõõtudes, kaugused meetrites \(kood\)/g, 'plan at real dimensions, distances in metres (code)'],
    [/Kliendi reeglid \(mõõdetud\)/g, 'Client rules (measured)'],
    [/Kõik (\d+) ühe pika laua taga/g, 'All $1 at one long table'],
    [/Telgi kõrgus: seinad/g, 'Tent height: walls'],
    [/; lava kõrgus/g, '; stage height'],
    [/tantsuala (.+?) lava kõrval/g, 'dance area $1 next to the stage'],
    [/Mööbel seintest/g, 'Furniture from walls'],
    [/Igale lauale ja alale pääseb vahekäiku mööda/g, 'Every table and area is reachable via an aisle'],
    [/Istekohti (\d+) \/ (\d+), igal laual toole ≤ laua kohti/g, 'Seats $1 / $2, chairs per table ≤ table capacity'],
    [/Telgi ümber vaba/g, 'Clear around the tent'],
    [/Lava ees ≥ (.+?), külgedel ja taga ≥/g, 'In front of stage ≥ $1, sides and back ≥'],
    [/Seintest ≥/g, 'From walls ≥'],
    [/Vahekäigud ≥/g, 'Aisles ≥'],
    [/Telk (.+?) mahub alale/g, 'Tent $1 fits the area'],
    [/Elegantne ja moodne, roheline \+ valge, rohelised taimed ja lilled \(pildil ja 3D-s; ei võta põrandapinda\)\./g, 'Elegant and modern, green + white, green plants and flowers (in the image and 3D; they take no floor space).'],
    [/(\d+) külalist, üks pikk laud/g, '$1 guests, one long table'],
    [/(\d+) külalist/g, '$1 guests'],
    [/kõik täidetud/g, 'all met'],
    [/midagi ei kattu/g, 'nothing overlaps'],
    [/\(kitsaim/g, '(narrowest'],
    [/Teine laud:/g, 'Other table:'],
    [/Suurem telk:/g, 'Larger tent:'],
    [/Suurem ala/g, 'Larger area'],
    [/Väiksem lava/g, 'Smaller stage'],
    [/Väiksem tantsupõrand/g, 'Smaller dance floor'],
    [/2D plaan/g, '2D plan'],
    [/Vaata 3D-s/g, 'View in 3D'],
    [/Täpne 3D/g, 'Precise 3D'],
    [/Chiavari tool valge/g, 'Chiavari chair, white'],
    [/^Laud:$/g, 'Tables:'],
  ];
  // Sõnad (ainult tervete sõnadena)
  const W = [
    ['Kaarkatusega moodultelk', 'Arched-roof modular tent'], ['Kaarkatusega telk', 'Arched-roof tent'],
    ['Stretch-telk', 'Stretch tent'], ['Stretch telk', 'Stretch tent'], ['stretch-telk', 'stretch tent'],
    ['Poodiumlava', 'Podium stage'], ['Poodiumimoodul', 'Podium module'], ['Lavapoodium', 'Stage podium'],
    ['Toitlustuslaud', 'Catering table'], ['Catering-laud', 'Catering table'], ['Toitlustus', 'Catering'],
    ['Valge tantsupõrand', 'White dance floor'], ['Tantsupõrand', 'Dance floor'], ['tantsupõrand', 'dance floor'],
    ['Tantsuala', 'Dance area'], ['tantsuala', 'dance area'], ['Püstivastuvõtt', 'Standing reception'],
    ['Pikk laud', 'Long table'], ['Kandiline laud', 'Rectangular table'], ['Õllemööbli laud', 'Beer-garden table'],
    ['Lauad', 'Tables'], ['Laud', 'Table'], ['laud', 'table'], ['lauda', 'tables'], ['Toolid', 'Chairs'], ['tooli', 'chairs'], ['tool', 'chair'],
    ['Lava', 'Stage'], ['lava', 'stage'], ['Telk', 'Tent'], ['telk', 'tent'], ['telgi', 'tent'],
    ['seinad', 'walls'], ['sein', 'wall'], ['hari', 'ridge'], ['vahe', 'gap'],
    ['Terrass', 'Terrace'], ['terrass', 'terrace'], ['Maja esisein', 'House front wall'], ['maja esisein', 'house front wall'],
    ['Sissepääs', 'Entrance'], ['Värav', 'Gate'], ['Uks', 'Door'], ['vaba ala', 'clear area'], ['Ala', 'Area'], ['ala', 'area'], ['alal', 'in area'], ['alale', 'area'],
    ['kohta', 'seats'], ['Kõik', 'All'], ['Mõõdud', 'Dimensions'], ['Pilt', 'Image'], ['Väljas', 'Off'],
    ['Tingimused', 'Requirements'], ['Paigutus', 'Layout'], ['kontrollimata', 'unverified'], ['Kontroll', 'Checks'],
    ['Tooted', 'Products'], ['Toode', 'Product'], ['Kogus', 'Qty'], ['tk', 'pc'], ['Allikas', 'Source'], ['tooteleht', 'product page'],
    ['Kujundus', 'Design'], ['Sulge', 'Close'], ['tööala', 'work area'],
    ['lastenurk', 'kids’ corner'], ['mängud', 'games'], ['Lisaala', 'Extra area'], ['Üritus', 'Event'],
  ].map(([a, b]) => [new RegExp('(?<![\\p{L}\\-])' + a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\p{L}])', 'gu'), b]);
  const dec = s => s.replace(/(\d),(\d)/g, '$1.$2');
  const tr = s => {
    if (!s || !/[A-Za-zÕÄÖÜõäöü\d]/.test(s)) return s;
    let o = s;
    for (const [r, t] of P) o = o.replace(r, t);
    for (const [r, t] of W) o = o.replace(r, t);
    return dec(o);
  };
  window.V3D_T = tr;

  const done = new WeakMap(), ATTR = ['alt', 'title', 'aria-label', 'placeholder'];
  const skip = n => { const p = n.parentNode; return !p || p.nodeName === 'SCRIPT' || p.nodeName === 'STYLE' || p.nodeName === 'TEXTAREA'; };
  function txt(n) { if (skip(n)) return; const v = n.nodeValue; if (done.get(n) === v) return; const t = tr(v); done.set(n, t); if (t !== v) n.nodeValue = t; }
  function el(e) {
    if (e.nodeType !== 1 || e.tagName === 'SCRIPT' || e.tagName === 'STYLE') return;
    for (const a of ATTR) { const v = e.getAttribute(a); if (v) { const t = tr(v); if (t !== v) e.setAttribute(a, t); } }
    if (e.tagName === 'IMG') fixImg(e);
    if (e.tagName === 'A') fixLink(e);
  }
  // Pilt mõõtsiltidega on eesti keeles: inglise keeles näita puhast pilti
  function fixImg(e) { const s = e.getAttribute('src') || ''; if (s.includes('-web-mootudega.jpg')) e.setAttribute('src', s.replace('-web-mootudega.jpg', '-web.jpg')); }
  function fixLink(e) {
    const h = e.getAttribute('href'); if (!h || /^(https?:|mailto:|#)/.test(h)) return;
    if (h === '../' && e.classList.contains('back')) { e.setAttribute('href', '../en/'); return; }
    if (/-plan\.pdf$/.test(h)) { e.setAttribute('href', h.replace(/-plan\.pdf$/, '-plan-en.pdf')); return; }
    if (/(\?|&)v=/.test(h) && !/lang=en/.test(h)) e.setAttribute('href', h + '&lang=en');
  }
  function walk(root) {
    if (root.nodeType === 3) return txt(root);
    if (root.nodeType !== 1) return;
    el(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n; while ((n = w.nextNode())) { if (n.nodeType === 3) txt(n); else el(n); }
  }
  function title() { const t = tr(document.title); if (t !== document.title) document.title = t; }
  function start() {
    title(); walk(document.body);
    new MutationObserver(ms => {
      for (const m of ms) {
        if (m.type === 'characterData') txt(m.target);
        else if (m.type === 'attributes') el(m.target);
        else m.addedNodes.forEach(walk);
      }
      title();
    }).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTR.concat(['src', 'href']) });
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
