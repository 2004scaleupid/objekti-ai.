"""Maa- ja Ruumiamet LOD1 CityGML -> Vaade3D tiles.

usage: build_tiles.py <lod1.gml> <out_dir> <muni label>
writes <out_dir>/idx.json  = [[address, ehr, tile], ...]
       <out_dir>/<tile>.json = {"A": [...Viimsi-format records...], "B": [...neighbours...]}
Tiles are 1 km squares in the Viimsi local frame (L-EST97 minus DS.o); B also carries
buildings up to 80 m outside the tile so makeHouse sees every neighbour within 78 m.
"""
import json, math, os, sys
import xml.etree.ElementTree as ET
from collections import defaultdict
from shapely.geometry import Polygon
from shapely.ops import unary_union
sys.path.insert(0, os.path.dirname(__file__))
from geom import house, gable

OX, OY, TILE, MARGIN = 540000, 6590000, 1000, 80
NS = {'gml': 'http://www.opengis.net/gml', 'core': 'http://www.opengis.net/citygml/2.0',
      'bldg': 'http://www.opengis.net/citygml/building/2.0', 'xAL': 'urn:oasis:names:tc:ciq:xsdschema:xAL:2.0'}
BLDG = '{%s}Building' % NS['bldg']
SHORT = {'tänav': 'tn', 'maantee': 'mnt', 'puiestee': 'pst'}  # official ADS short forms


def footprint(el):
    tris = []
    for pl in el.iterfind('.//bldg:lod1MultiSurface//gml:posList', NS):
        v = [float(t) for t in pl.text.split()]
        pts = [(v[i + 1] - OX, v[i] - OY, v[i + 2]) for i in range(0, len(v), 3)]  # file order: N E z
        tris.append(pts)
    if not tris:
        return None
    zmin = min(p[2] for t in tris for p in t)
    bottom = [Polygon([(x, y) for x, y, _ in t]) for t in tris if all(abs(p[2] - zmin) < 0.01 for p in t)]
    bottom = [p.buffer(0) for p in bottom if p.area > 0]
    u = unary_union(bottom).buffer(0.01).buffer(-0.01)  # weld triangle seams
    if u.geom_type == 'MultiPolygon':
        u = max(u.geoms, key=lambda g: g.area)
    return Polygon(u.exterior) if u.area >= 4 else None


def refs(el):
    out = {}
    for er in el.iterfind('core:externalReference', NS):
        sysn = er.findtext('core:informationSystem', '', NS)
        nm = er.findtext('core:externalObject/core:name', '', NS)
        out['ehr' if 'ehr.ee' in sysn else 'ads' if 'adsavalik' in sysn else 'etak'] = nm
    return out


def address(el):
    t = el.find('.//xAL:Thoroughfare', NS)
    if t is None:
        return None
    name, nr = t.findtext('xAL:ThoroughfareName', '', NS).strip(), t.findtext('xAL:ThoroughfareNumber', '', NS).strip()
    name = SHORT.get(name.rsplit(' ', 1)[-1], None) and name.rsplit(' ', 1)[0] + ' ' + SHORT[name.rsplit(' ', 1)[-1]] or name
    return f"{name} {nr}".strip() if name else None


def main(src, out, muni):
    os.makedirs(out, exist_ok=True)
    blds = []
    for _, el in ET.iterparse(src, events=('end',)):
        if el.tag != BLDG:
            continue
        try:
            p = footprint(el)
            h = float(el.findtext('bldg:measuredHeight', '0', NS))
            if p is not None and h > 0:
                blds.append(dict(p=p, h=h, addr=address(el), **refs(el)))
        except Exception as e:  # one broken building must not stop the city
            print('skip', el.get('{%s}id' % NS['gml']), e, file=sys.stderr)
        el.clear()
    print('buildings', len(blds))

    # one record per address: the largest building carrying it
    best = {}
    for i, b in enumerate(blds):
        if b['addr'] and b.get('ehr'):
            k = b['addr'].lower()
            if k not in best or b['p'].area > blds[best[k]]['p'].area:
                best[k] = i

    tile_of = lambda x, y: f"{math.floor(x / TILE)}_{math.floor(y / TILE)}"
    tiles_B, tiles_A = defaultdict(list), defaultdict(list)
    bidx = defaultdict(dict)
    for i, b in enumerate(blds):
        c = b['p'].centroid
        tx, ty = math.floor(c.x / TILE), math.floor(c.y / TILE)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                x0, y0 = (tx + dx) * TILE, (ty + dy) * TILE
                if x0 - MARGIN <= c.x < x0 + TILE + MARGIN and y0 - MARGIN <= c.y < y0 + TILE + MARGIN:
                    k = f"{tx + dx}_{ty + dy}"
                    bidx[k][i] = len(tiles_B[k])
                    flat = [round(v, 1) for xy in list(b['p'].exterior.coords)[:-1] for v in xy]
                    tiles_B[k].append([flat, round(b['h'], 1), gable(b['p'], b['h'])])
    idx = []
    for i in best.values():
        b = blds[i]
        c = b['p'].centroid
        k = tile_of(c.x, c.y)
        r = house(b['p'], b['h'])
        tiles_A[k].append([b['addr'], b['ehr'], b.get('ads', ''), bidx[k][i], r['cx'], r['cy'], r['north'], r['flat'], r['wg'],
                           r['eave'], r['height'], r['footprint'], r['perimeter'], r['roof'], r['wall']])
        idx.append([b['addr'], b['ehr'], k])
    for k in tiles_A:
        json.dump({'m': muni, 'A': tiles_A[k], 'B': tiles_B[k]}, open(f"{out}/{k}.json", 'w', encoding='utf-8'),
                  ensure_ascii=False, separators=(',', ':'))
    idx.sort()
    json.dump(idx, open(f"{out}/idx.json", 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('addresses', len(idx), 'tiles', len(tiles_A))


if __name__ == '__main__':
    main(*sys.argv[1:4])
