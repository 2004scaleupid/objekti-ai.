#!/usr/bin/env python3
"""data/lod2 -> Supabase'i avalik kaust lod2/<versioon>/ (gzip, vahemälu 1 aasta). data/lod2 ei käi gitti.

Kasutus:  SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... python3 -I scripts/lod2_upload.py [kaust=data/lod2] [versioon=v1]
Saadab ainult muutunud failid (kohalik nimekiri <kaust>/.uploaded-<versioon>.json). Uute andmete jaoks, mis muudavad olemasolevaid
faile, kasuta uut versiooni (v2) ja muuda äpis LOD2_VER: vana kausta failid on brauserites aasta aega vahemälus.
"""
import gzip, hashlib, json, os, sys, threading, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', 'data', 'lod2')
ver = sys.argv[2] if len(sys.argv) > 2 else 'v1'
URL, KEY = os.environ['SUPABASE_URL'].rstrip('/'), os.environ['SUPABASE_SERVICE_ROLE_KEY']
man_fn = os.path.join(src, f'.uploaded-{ver}.json')
man = json.load(open(man_fn)) if os.path.exists(man_fn) else {}
lock = threading.Lock()

files = [f for f in os.listdir(src) if len(f) == 8 and f.endswith('.json') and f[:3].isdigit()]
files += ['geo/' + f for f in os.listdir(os.path.join(src, 'geo')) if f.endswith('.json')] if os.path.isdir(os.path.join(src, 'geo')) else []


def put(rel):
    body = gzip.compress(open(os.path.join(src, rel), 'rb').read(), 9, mtime=0)
    h = hashlib.md5(body).hexdigest()
    if man.get(rel) == h:
        return 0, 0
    req = urllib.request.Request(f'{URL}/storage/v1/object/lod2/{ver}/{rel}.gz', data=body, method='POST', headers={
        'Authorization': 'Bearer ' + KEY, 'apikey': KEY, 'Content-Type': 'application/gzip', 'x-upsert': 'true', 'cache-control': 'max-age=31536000'})
    for k in range(5):
        try:
            urllib.request.urlopen(req, timeout=60).read()
            break
        except Exception as e:  # 429/5xx: oota ja proovi uuesti
            if k == 4:
                print('VIGA', rel, e)
                return 0, 0
            time.sleep(2 ** k)
    with lock:
        man[rel] = h
    return 1, len(body)


t0, n, b = time.time(), 0, 0
with ThreadPoolExecutor(24) as ex:
    for i, (k, s) in enumerate(ex.map(put, files)):
        n, b = n + k, b + s
        if i % 2000 == 0:
            with lock:
                json.dump(man, open(man_fn, 'w'))
            print(f'{i}/{len(files)} saadetud {n}, {b / 1e6:.1f} MB, {time.time() - t0:.0f} s', flush=True)
json.dump(man, open(man_fn, 'w'))
print(f'valmis: {n} faili, {b / 1e6:.1f} MB, kokku kaustas {len(man)} faili')
