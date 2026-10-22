#!/usr/bin/env python3
"""Maa- ja Ruumiameti LOD2 CityGML -> data/lod2/NNN.json (NNN = EHR koodi 3 viimast numbrit; kogu Eesti ~480 000 hoonet, ~300 KB kild).

Kasutus:  python3 -I scripts/lod2_tiles.py <hooned_lod2-eesti-citygml.zip | ...gml> [väljundkaust=data/lod2]
          (kogu Eesti: ~5 min, 480 000 hoonet EHR koodiga; vanad kildud kustuta enne, kui teed kõik uuesti)
          python3 -I scripts/lod2_tiles.py --selftest
Uue omavalitsuse fail liidetakse olemasolevate kildudega (sama EHR kirjutatakse üle).

Failis on ühe hoone kohta üks lod2MultiSurface ilma katuse/seina märgisteta, seega:
  sein  = tahk, mille kalle > 85°
  alus  = rõhtne tahk hoone madalaimal kõrgusel
  katus = kõik ülejäänud
Koordinaadid väljundis: meetrid hoone keskpunktist, x = ida, y = põhi, z = maapinnast.
"""
import json, math, os, sys
import xml.etree.ElementTree as ET

GML = '{http://www.opengis.net/gml}'
CORE = '{http://www.opengis.net/citygml/2.0}'
BLDG = '{http://www.opengis.net/citygml/building/2.0}'
GEN = '{http://www.opengis.net/citygml/generics/2.0}'


def ring(pos):
    v = [float(t) for t in pos.split()]
    # EPSG:3301 järjekord failis: põhi, ida, kõrgus
    pts = [(v[i + 1], v[i], v[i + 2]) for i in range(0, len(v) - 2, 3)]
    out = []
    for p in pts:
        if not out or max(abs(p[k] - out[-1][k]) for k in range(3)) > 1e-6:
            out.append(p)
    if len(out) > 1 and max(abs(out[0][k] - out[-1][k]) for k in range(3)) <= 1e-6:
        out.pop()
    return out


def newell(p):
    nx = ny = nz = 0.0
    for i, a in enumerate(p):
        b = p[(i + 1) % len(p)]
        nx += (a[1] - b[1]) * (a[2] + b[2])
        ny += (a[2] - b[2]) * (a[0] + b[0])
        nz += (a[0] - b[0]) * (a[1] + b[1])
    return nx, ny, nz


def measure(polys, height=None):
    """polys: list of rings [(x,y,z),...] absolute. Returns dict or None."""
    polys = [p for p in polys if len(p) >= 3]
    if not polys:
        return None
    z0 = min(q[2] for p in polys for q in p)
    allp = [q for p in polys for q in p]
    cx = sum(q[0] for q in allp) / len(allp)
    cy = sum(q[1] for q in allp) / len(allp)
    loc = lambda p: [v for q in p for v in (round(q[0] - cx, 2), round(q[1] - cy, 2), round(q[2] - z0, 2))]
    fp = per = wall = roof = 0.0
    ground, faces, walls, ridge = [], [], [], 0.0
    for p in polys:
        nx, ny, nz = newell(p)
        area = 0.5 * math.sqrt(nx * nx + ny * ny + nz * nz)
        if area < 0.05:
            continue
        slope = math.degrees(math.acos(min(1.0, abs(nz) / (2 * area))))
        zmin = min(q[2] for q in p)
        zmax = max(q[2] for q in p)
        if slope > 85:
            wall += area
            # seina alumise serva pikkus: kaugeimad punktid seina madalaimal kõrgusel
            lo = [q for q in p if q[2] - zmin < 0.05]
            ln = max((math.hypot(a[0] - b[0], a[1] - b[1]) for a in lo for b in lo), default=0.0)
            walls.append([round(area, 1), round(ln, 2), loc(p)])
        elif slope < 1 and zmax - z0 < 0.05:
            fp += area
            per += sum(math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]) for i in range(len(p)))
            ground.append([v for q in p for v in (round(q[0] - cx, 2), round(q[1] - cy, 2))])
        else:
            roof += area
            # kalde suund: kuhu tahk vaatab (0 = põhi, 90 = ida), väljapoole = üles
            s = 1 if nz >= 0 else -1
            asp = (math.degrees(math.atan2(s * nx, s * ny)) + 360) % 360 if slope >= 1 else None
            faces.append([round(area, 1), round(slope, 1), None if asp is None else round(asp), loc(p)])
            ridge = max(ridge, zmax - z0)
    if fp <= 0:
        return None
    faces.sort(key=lambda f: -f[0])
    walls.sort(key=lambda w: -w[0])
    # räästas = suurima katusetahu alumine serv (madal varikatus ei loe)
    eave = min(faces[0][3][2::3]) if faces else None
    return {'fp': round(fp, 1), 'per': round(per, 1), 'wall': round(wall, 1), 'roof': round(roof, 1),
            'eave': round(eave or 0, 2), 'ridge': round(ridge, 2), 'h': height,
            'c': [round(cx, 2), round(cy, 2)], 'g': ground, 'f': faces, 'w': walls}


def parse(path):
    """yield (ehr, measures, updated). path võib olla .gml või .zip (kogu Eesti fail ~6 GB loetakse voona, mälu ei kasva)."""
    if path.endswith('.zip'):
        import zipfile
        z = zipfile.ZipFile(path)
        path = z.open([n for n in z.namelist() if n.endswith('.gml')][0])
    root = None
    for ev, el in ET.iterparse(path, events=('start', 'end')):
        if ev == 'start':
            if root is None:
                root = el
            continue
        if el.tag != BLDG + 'Building':
            continue
        ehr = None
        for ref in el.iter(CORE + 'externalReference'):
            sysname = ref.findtext(CORE + 'informationSystem') or ''
            if 'ehr.ee' in sysname:
                ehr = (ref.findtext(f'{CORE}externalObject/{CORE}name') or '').strip()
        upd = None
        for a in el.iter(GEN + 'stringAttribute'):
            if a.get('name') == 'lod2_muutmisaeg':
                upd = a.findtext(GEN + 'value')
        h = el.findtext(BLDG + 'measuredHeight')
            # aadressipunkt on gml:pos, mitte posList, nii et see siia ei satu
        polys = [ring(pl.text) for pl in el.iter(GML + 'posList') if pl.text]
        m = measure(polys, float(h) if h else None) if ehr and ehr.isdigit() else None
        el.clear()
        root.clear()  # töödeldud hooned mälust välja
        if m:
            yield ehr, m, upd


KLEN = 3  # kildude võti: EHR koodi viimased numbrid (app: loadLod2)


def write(items, out):
    os.makedirs(out, exist_ok=True)
    shards = {}
    for ehr, m, upd in items:
        m['t'] = upd
        sh = shards.setdefault(ehr[-KLEN:].zfill(KLEN), {})
        if ehr in sh:
            # sama EHR mitmes osas: liidame pinnad, kujud kõrvuti (keskpunkt 1. osa järgi)
            a = sh[ehr]
            dx, dy = m['c'][0] - a['c'][0], m['c'][1] - a['c'][1]
            for g in m['g']:
                a['g'].append([round(v + (dx if i % 2 == 0 else dy), 2) for i, v in enumerate(g)])
            for f in m['f']:
                a['f'].append(f[:3] + [[round(v + (dx, dy, 0)[i % 3], 2) for i, v in enumerate(f[3])]])
            for w in m['w']:
                a.setdefault('w', []).append(w[:2] + [[round(v + (dx, dy, 0)[i % 3], 2) for i, v in enumerate(w[2])]])
            for k in ('fp', 'per', 'wall', 'roof'):
                a[k] = round(a[k] + m[k], 1)
            a['eave'] = min(a['eave'], m['eave'])
            a['ridge'] = max(a['ridge'], m['ridge'])
            a['parts'] = a.get('parts', 1) + 1
        else:
            sh[ehr] = m
    n = 0
    for key, sh in shards.items():
        fn = os.path.join(out, key + '.json')
        old = {}
        if os.path.exists(fn):
            with open(fn) as f:
                old = json.load(f)
        old.update(sh)
        n += len(sh)
        with open(fn, 'w') as f:
            json.dump(old, f, separators=(',', ':'), sort_keys=True)
    return n


def selftest():
    # 10 x 6 m maja, seinad 3 m, viilkatus harjaga 5 m (x-telje suunas)
    G = [(0, 0, 0), (10, 0, 0), (10, 6, 0), (0, 6, 0)]
    W = [[(0, 0, 0), (10, 0, 0), (10, 0, 3), (0, 0, 3)], [(10, 6, 0), (0, 6, 0), (0, 6, 3), (10, 6, 3)],
         [(0, 6, 0), (0, 0, 0), (0, 0, 3), (0, 3, 5), (0, 6, 3)], [(10, 0, 0), (10, 6, 0), (10, 6, 3), (10, 3, 5), (10, 0, 3)]]
    R = [[(0, 0, 3), (10, 0, 3), (10, 3, 5), (0, 3, 5)], [(10, 6, 3), (0, 6, 3), (0, 3, 5), (10, 3, 5)]]
    m = measure([G] + W + R, 5.0)
    assert m['fp'] == 60 and m['per'] == 32, m
    assert abs(m['wall'] - (2 * 30 + 2 * (18 + 6))) < 0.2, m['wall']
    assert abs(m['roof'] - 2 * 10 * math.hypot(3, 2)) < 0.2, m['roof']
    assert m['eave'] == 3 and m['ridge'] == 5
    s = sorted(f[2] for f in m['f'])
    assert s == [0, 180], s  # üks tahk vaatab põhja, teine lõunasse
    # 4 seina: 2 pikka (10 m, 30 m²) ja 2 viilu (6 m, 24 m²), polügoonid kohalikes koordinaatides
    assert sorted((w[1], w[0]) for w in m['w']) == [(6.0, 24.0), (6.0, 24.0), (10.0, 30.0), (10.0, 30.0)], m['w']
    assert len(m['w'][0][2]) % 3 == 0 and min(m['w'][0][2][2::3]) == 0
    assert abs(m['f'][0][1] - math.degrees(math.atan2(2, 3))) < 0.2
    # failis korduvad punktid ja suletud rõngas
    assert ring('1 2 3 1 2 3 4 5 6 7 8 9 1 2 3') == [(2.0, 1.0, 3.0), (5.0, 4.0, 6.0), (8.0, 7.0, 9.0)]
    print('selftest ok')


if __name__ == '__main__':
    if sys.argv[1:] == ['--selftest']:
        selftest()
    elif len(sys.argv) >= 2:
        out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', 'data', 'lod2')
        print('hooneid:', write(parse(sys.argv[1]), out))
    else:
        print(__doc__)
