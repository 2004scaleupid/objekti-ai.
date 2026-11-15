"""Self-check: rebuild Viimsi records from their raw footprints (DS.B) and compare with the shipped DS.A."""
import json, sys
from shapely.geometry import Polygon
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from geom import house

DS = json.load(open(sys.argv[1]))
A, B = DS['A'], DS['B']
errs = {k: [] for k in ('eave', 'footprint', 'perimeter', 'roof', 'wall', 'nwings')}
for a in A:
    b = B[a[3]]
    f = b[0]
    p = Polygon([(f[k], f[k + 1]) for k in range(0, len(f), 2)])
    if not p.is_valid or p.area < 1:
        continue
    r = house(p, a[10])
    for k, i in (('eave', 9), ('footprint', 11), ('perimeter', 12), ('roof', 13), ('wall', 14)):
        errs[k].append(abs(r[k] - a[i]) / max(a[i], 1e-6))
    errs['nwings'].append(0 if len(r['wg']) == len(a[8]) else 1)
for k, v in errs.items():
    v = sorted(v)
    print(f"{k:10s} median {v[len(v)//2]:.3f}  p90 {v[int(len(v)*.9)]:.3f}  n={len(v)}")
med = sorted(errs['roof'])[len(errs['roof']) // 2]
assert med < 0.05, f"roof median rel. error {med:.3f} too high"
assert sorted(errs['eave'])[len(errs['eave']) // 2] < 0.05
print("OK")
