# Kõrguse kontroll pikslites: telgi valge kanga ülaserv pildil vs projitseeritud sein/hari (kalibreeritud kaamera).
import json,numpy as np,sys
from PIL import Image
D='/Users/taavimalm/objekti-ai/demo/aiapidu/brief';C=json.load(open(f'{D}/cam-cal.json'));f,th,h,W,H=C['f'],C['pitch'],C['h'],C['W'],C['H'];cx,cy=W/2,H/2
AX,AN=.3-5,8.5
def pj(px,py,z):
  X=AX+px;Fw=AN+py;Y=h-z;zc=Fw*np.cos(th)+Y*np.sin(th);yc=-Fw*np.sin(th)+Y*np.cos(th);return cx+f*X/zc,cy+f*yc/zc
def z_at(px,py,v):  # millisele kõrgusele vastab pildirida v (sama maapunkti kohal)
  lo,hi=0.,8.
  for _ in range(40):
    m=(lo+hi)/2
    if pj(px,py,m)[1]>v: lo=m
    else: hi=m
  return (lo+hi)/2
def eave(a,u,v_top,v_lo):  # katuseriba alumine serv: valgest allapoole esimene mittevalge rida (avatud sisemus postide vahel)
  white=lambda v:(lambda p:p.min()>175 and p.max()-p.min()<45)(a[v,int(u)-2:int(u)+3].mean(0))
  v=int(v_top)
  while v<v_lo and not white(v): v+=1
  while v<v_lo and white(v): v+=1
  return v
def top_white(a,u,v_lo,v_hi):  # esimene rida ülalt, kus 5 px veerg on valge kangas
  for v in range(int(v_hi),int(v_lo)):
    p=a[v,int(u)-2:int(u)+3].mean(0)
    if p.min()>185 and p.max()-p.min()<40: return v
  return None
out={}
for v in sys.argv[1:]:
  L=json.load(open(f'{D}/{v}-layout.json'))['layout'];o=L['origin'];R=L['room'];t=L['tent']
  img=Image.open(f'/tmp/cal/ai-{v}.jpg').convert('RGB');S=img.width/W;a=np.asarray(img.resize((W,H))).astype(int)
  res={}
  if t['type']=='stretch':
    for name,(px,py),z in [('serv (vasak ots)',(o['x']+.3,o['y']),t['sideH']),('tipp (vasak)',(o['x']+R['L']*.3,o['y']+R['W']/2),t['ridgeH']),('tipp (parem)',(o['x']+R['L']*.7,o['y']+R['W']/2),t['ridgeH'])]:
      u,vz=pj(px,py,z);vt=top_white(a,u,pj(px,py,0)[1],vz-140);res[name]=(z,None if vt is None else round(z_at(px,py,vt),2))
  else:
    n=max(1,round(R['L']/3));mids=[(i+.5)/n for i in range(n)]
    for k,fr in enumerate([mids[0],mids[-1]]):
      px,py=o['x']+R['L']*fr,o['y'];u,vz=pj(px,py,t['sideH']);ve=eave(a,u,vz-150,pj(px,py,0)[1]);res[f'sein (räästas, vahe {k+1})']=(t['sideH'],round(z_at(px,py,ve),2))
    px,py=o['x']+R['L']/2,o['y']+R['W']/2;u,vz=pj(px,py,t['ridgeH']);vt=top_white(a,u,pj(px,py,0)[1],vz-120);res['hari (keskel)']=(t['ridgeH'],None if vt is None else round(z_at(px,py,vt),2))
  out[v]=res
  for n,(z,m) in res.items(): print(v,n,'plaan',z,'pildil',m,'viga',None if m is None else round(abs(m-z),2))
json.dump(out,open('/tmp/cal/meas.json','w'),ensure_ascii=False)
# kontrollpilt: mõõdetud read (sinine) vs projitseeritud kõrgus (punane)
from PIL import ImageDraw
for v in sys.argv[1:]:
  L=json.load(open(f'{D}/{v}-layout.json'))['layout'];o=L['origin'];R=L['room'];t=L['tent']
  im=Image.open(f'/tmp/cal/ai-{v}.jpg').convert('RGB').resize((W,H));d=ImageDraw.Draw(im)
  pts=[(o['x']+R['L']*fr,o['y'],t['sideH']) for fr in ((.5/max(1,round(R['L']/3))),1-(.5/max(1,round(R['L']/3))))]+[(o['x']+R['L']/2,o['y']+R['W']/2,t['ridgeH'])] if t['type']!='stretch' else [(o['x']+.3,o['y'],t['sideH']),(o['x']+R['L']*.3,o['y']+R['W']/2,t['ridgeH']),(o['x']+R['L']*.7,o['y']+R['W']/2,t['ridgeH'])]
  for (px,py,z),(n,(zz,m)) in zip(pts,out[v].items()):
    u,vz=pj(px,py,z);d.line([(u-25,vz),(u+25,vz)],fill=(255,0,0),width=3)
    if m is not None: vm=pj(px,py,m)[1];d.line([(u-25,vm),(u+25,vm)],fill=(0,120,255),width=3)
  im.save(f'/tmp/cal/mk-{v}.jpg',quality=85)
