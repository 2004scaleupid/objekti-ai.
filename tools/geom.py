"""Footprint + LOD1 height -> Vaade3D house record (same model as the Viimsi dataset).

Model (reverse-engineered from the shipped Viimsi data, see validate_viimsi.py):
- footprint is rotated by `north` so the main axis runs along local x
- the footprint is covered by 1-2 rectangular wings, each with a 30 deg gable roof
- main wing ridge = LOD1 height; eave = max(ridge - W/2*tan30, 0.7*ridge), small sheds >= 2.4 m
- a secondary wing shares the eave; its ridge follows from its own width
"""
import math
from shapely.geometry import box
from shapely import affinity

T30 = math.tan(math.radians(30))


def r2(v):
    return round(v + 0.0, 2)


def eave_for(h, w):
    e = h - w / 2 * T30
    if e < 2.4:  # roof would swallow the walls: flatten to a 70% eave, sheds keep 2.4 m
        e = max(0.7 * h, min(2.4, h - 0.1))
    return min(e, h)


def orient(poly):
    """Angle (deg) that rotates the polygon so its min-rectangle long side lies along x."""
    mrr = poly.minimum_rotated_rectangle
    c = list(mrr.exterior.coords)[:4]
    best = None
    for i in range(2):
        (x0, y0), (x1, y1) = c[i], c[i + 1]
        L = math.hypot(x1 - x0, y1 - y0)
        if best is None or L > best[0]:
            best = (L, math.degrees(math.atan2(y1 - y0, x1 - x0)))
    return -best[1]  # rotate by -angle => long side along +x


def wings_for(lp):
    """lp: footprint in local (rotated, centred) frame. Returns list of (x0,y0,x1,y1)."""
    A = lp.area
    bx = lp.bounds
    one = box(*bx)
    if A / one.area >= 0.85:
        return [bx]
    xs = sorted({round(x, 2) for x, _ in lp.exterior.coords})
    ys = sorted({round(y, 2) for _, y in lp.exterior.coords})
    best = (one.area - A, [bx])
    for axis, vals in ((0, xs), (1, ys)):
        for v in vals[1:-1]:
            if axis == 0:
                h1, h2 = box(bx[0], bx[1], v, bx[3]), box(v, bx[1], bx[2], bx[3])
            else:
                h1, h2 = box(bx[0], bx[1], bx[2], v), box(bx[0], v, bx[2], bx[3])
            p1, p2 = lp.intersection(h1), lp.intersection(h2)
            if p1.area < 3 or p2.area < 3:
                continue
            b1, b2 = box(*p1.bounds), box(*p2.bounds)
            waste = b1.union(b2).area - A
            if waste < best[0]:
                best = (waste, sorted([p1.bounds, p2.bounds], key=lambda b: -(b[2] - b[0]) * (b[3] - b[1])))
    return best[1]


def house(poly, h):
    """poly: shapely Polygon in local world frame (metres, origin DS.o). h: LOD1 height."""
    poly = poly.simplify(0.15, preserve_topology=True)
    c = poly.centroid
    north = orient(poly)
    lp = affinity.rotate(affinity.translate(poly, -c.x, -c.y), north, origin=(0, 0))
    ws = wings_for(lp)
    w0 = ws[0]
    W0 = min(w0[2] - w0[0], w0[3] - w0[1])
    eave = eave_for(h, W0)
    wg, roof, gables = [], 0.0, 0.0
    for i, w in enumerate(ws):
        W = min(w[2] - w[0], w[3] - w[1])
        ridge = h if i == 0 else min(h, eave + W / 2 * T30)
        roof += (w[2] - w[0]) * (w[3] - w[1]) / math.cos(math.radians(30))  # whole wing rectangle at nominal 30 deg, as in Viimsi
        gables += W * (ridge - eave)
        wg.append([r2(w[0]), r2(w[1]), r2(w[2]), r2(w[3]), r2(ridge), 1 if (w[2] - w[0]) >= (w[3] - w[1]) else 0])
    flat = [r2(v) for x, y in list(lp.exterior.coords)[:-1] for v in (x, y)]
    return dict(cx=round(c.x, 1), cy=round(c.y, 1), north=round(north, 1), flat=flat, wg=wg, eave=r2(eave), height=r2(h),
                footprint=round(poly.area, 1), perimeter=round(poly.length, 1), roof=round(roof, 1),
                wall=round(poly.length * eave + gables, 1))


def gable(poly, h):
    """Neighbour gable marker [cx,cy,angle_rad,L,W,eave] or 0 (decorative roofs in the 3D scene)."""
    A = poly.area
    if A < 40 or h < 4.2 or h > 13:
        return 0
    mrr = poly.minimum_rotated_rectangle
    if A / mrr.area < 0.8:
        return 0
    c = list(mrr.exterior.coords)
    e1 = math.dist(c[0], c[1]); e2 = math.dist(c[1], c[2])
    L, W = max(e1, e2), min(e1, e2)
    if W > 20:
        return 0
    a, b = (c[0], c[1]) if e1 >= e2 else (c[1], c[2])
    ang = math.atan2(b[1] - a[1], b[0] - a[0])
    m = mrr.centroid
    return [round(m.x, 1), round(m.y, 1), round(ang, 3), round(L, 1), round(W, 1), round(eave_for(h, W), 1)]
