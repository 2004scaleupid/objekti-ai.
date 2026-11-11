import json,numpy as np,sys
from PIL import Image,ImageDraw,ImageFont
D='/Users/taavimalm/objekti-ai/demo/aiapidu/brief';S=1.5;W,H=int(1672*S),int(941*S)
# telgi maapinna nurgad igal AI-pildil (2000 px laiuses, märgitud käsitsi: esi-vasak, esi-parem, taga-parem, taga-vasak)
TC={'A':[(690,700),(1640,915),(1835,690),(985,648)],'B':[(605,712),(1695,845),(1760,742),(900,640)],'C':[(560,635),(1775,850),(1830,640),(880,560)]}
K=W/2000
def homog(v):
  L=json.load(open(f'{D}/{v}-layout.json'))['layout'];o=L['origin'];R=L['room']
  src=[(o['x'],o['y']),(o['x']+R['L'],o['y']),(o['x']+R['L'],o['y']+R['W']),(o['x'],o['y']+R['W'])]
  A=[];b=[]
  for (x,y),(u,v2) in zip(src,TC[v]):u*=K;v2*=K;A+=[[x,y,1,0,0,0,-u*x,-u*y],[0,0,0,x,y,1,-v2*x,-v2*y]];b+=[u,v2]
  return np.append(np.linalg.solve(np.array(A,float),np.array(b,float)),1).reshape(3,3)
FB=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf',int(19*S))
RED=(229,57,53)
for v in 'ABC':
  Hm=homog(v);pj=lambda p,Hm=Hm:(lambda q:(q[0]/q[2],q[1]/q[2]))(Hm@np.array([p[0],p[1],1.]))
  im=Image.open(f'/tmp/yard/fin{v}.jpg').convert('RGB').resize((W,H),Image.LANCZOS);im.save(f'{D}/{v}-image.jpg',quality=88)
  d=ImageDraw.Draw(im,'RGBA');segs=json.load(open(f'{D}/dims-{v}.json'));placed=[]
  for s in sorted(segs,key=lambda s:{'area':0,'tent':1,'size':2,'gap':3,'wall':4}[s['kind']]):
    a,c=pj(s['a']),pj(s['b']);w=int(3*S) if s['kind'] in('area','tent') else int(2.4*S)
    col=(255,255,255) if s['kind']=='area' else RED
    d.line([a,c],fill=col,width=w)
    L=max(1e-6,np.hypot(c[0]-a[0],c[1]-a[1]));nx,ny=-(c[1]-a[1])/L*7*S,(c[0]-a[0])/L*7*S
    for p in (a,c):d.line([(p[0]-nx,p[1]-ny),(p[0]+nx,p[1]+ny)],fill=col,width=w)
    t=s['t'];tw=d.textlength(t,font=FB)+16*S;th=28*S;m=[(a[0]+c[0])/2,(a[1]+c[1])/2]
    for _ in range(8):
      if any(abs(m[0]-q[0])<(tw+q[2])/2 and abs(m[1]-q[1])<th for q in placed): m[1]-=th*.9
      else: break
    placed.append((m[0],m[1],tw))
    d.rounded_rectangle([m[0]-tw/2,m[1]-th/2,m[0]+tw/2,m[1]+th/2],radius=6*S,fill=(255,255,255,240),outline=col if s['kind']!='area' else (40,40,40),width=int(1.5*S))
    d.text((m[0]-tw/2+8*S,m[1]-th/2+4*S),t,fill=RED if s['kind']!='area' else (22,19,15),font=FB)
  d.rectangle([0,H-38*S,W,H],fill=(22,19,15,230));d.text((14*S,H-31*S),'Mõõdud layout.json-ist (sama mis 2D plaanil). Pilt on illustratiivne, täpsed mõõdud plaanil.',fill='white',font=FB)
  im.save(f'{D}/{v}-image-mootudega.jpg',quality=88);print(v)
