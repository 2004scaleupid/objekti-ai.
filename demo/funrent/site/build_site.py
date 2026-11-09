# Maa-ameti andmed -> site.json (ala, hoone, parkla, tee, puu) + kontrollpilt ortofotol. Lähteandmed: Maa- ja Ruumiamet 2026.
import json
from PIL import Image, ImageDraw, ImageFont
X0,Y0,R,PX=562222,6588478,30,20      # orto keskpunkt (EPSG:3301), raadius m, px/m
E=lambda px:X0-R+px/PX; N=lambda py:Y0+R-py/PX
toPx=lambda e,n:((e-(X0-R))*PX,((Y0+R)-n)*PX)
lod=json.load(open('/tmp/joe/t.json'))['116003453']; cx,cy=lod['c']
fp=[(cx+lod['g'][0][i],cy+lod['g'][0][i+1]) for i in range(0,8,2)]
free=dict(e0=E(402),e1=E(575),n1=N(424),n0=N(655))          # vaba muru (free.py): 8,65 × 11,55 m
area=dict(e0=free['e0'],e1=free['e1'],n1=free['n1'],n0=free['n0'])
# ala kohalikud koordinaadid plaanil: x = lõuna suunas põhjaservast, y = lääne suunas idaservast (põhi vasakul)
lx=lambda e,n:(area['n1']-n, area['e1']-e)
south_wall=max(p[1] for p in fp if p[1]<cy)  # lõunaseina n (umbes)
bw=[lx(e,n) for e,n in fp]
park_e1=E(405); path_n=N(645)
site={'src':'Maa- ja Ruumiamet 2026: LOD2 hoone 116003453, ortofoto, nDSM, kataster','address':'Jõe tn 4, Kostivere alevik, Jõelähtme vald',
 'area_lest':area,'area':{'l':round(area['n1']-area['n0'],2),'w':round(area['e1']-area['e0'],2)},
 'building':{'ehr':'116003453','height':lod['h'],'eave':lod['eave'],'footprint_local':[[round(a,2),round(b,2)] for a,b in bw]},
 'dist':{'hooneni':round(area['n1']-south_wall,2),'parklani':round(area['e0']-park_e1,2),'teeni':round(area['n0']-path_n,2)}}
json.dump(site,open('site-real.json','w'),ensure_ascii=False,indent=1)
print(json.dumps(site,ensure_ascii=False))
# kontrollpilt
im=Image.open('orto.jpg').convert('RGB');d=ImageDraw.Draw(im,'RGBA')
try: F=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf',26); f2=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',22)
except: F=f2=None
d.polygon([toPx(*p) for p in fp],outline=(255,80,60),width=4)
for ft in json.load(open('parcels.json'))['features']:
  if ft['properties'].get('l_aadress')=='Jõe tn 4':
    g=ft['geometry'];rings=[g['coordinates'][0]] if g['type']=='Polygon' else [p[0] for p in g['coordinates']]
    for rg in rings: d.line([toPx(*p) for p in rg]+[toPx(*rg[0])],fill=(255,220,0),width=3)
a0=toPx(area['e0'],area['n1']);a1=toPx(area['e1'],area['n0'])
d.rectangle([a0,a1],outline=(255,255,255),width=5);d.rectangle([a0,a1],fill=(255,255,255,40))
# 6 × 10 m (Funrendi ala) põhja-lõuna suunas samas kohas
b0=toPx(area['e1']-6,area['n1']);b1=toPx(area['e1'],area['n1']-10);d.rectangle([b0,b1],outline=(80,200,255),width=4)
def tag(xy,t,c=(16,44,34,230)):
  w=d.textlength(t,font=F)+20;d.rounded_rectangle([xy[0]-w/2,xy[1]-20,xy[0]+w/2,xy[1]+20],8,fill=c);d.text((xy[0]-w/2+10,xy[1]-14),t,fill='white',font=F)
tag(((a0[0]+a1[0])/2,a1[1]+34),f"Vaba muru {site['area']['w']:.2f} × {site['area']['l']:.2f} m".replace('.',','))
tag(((b0[0]+b1[0])/2,(b0[1]+b1[1])/2),'10 × 6 m',(20,90,140,230))
tag((toPx(cx,cy+18)),'Jõe tn 4 (LOD2, h 10,5 m)',(150,40,30,230))
tag((140,330),'Parkla',(60,60,60,230));tag((230,800),'Jõe tn',(60,60,60,230))
for t,xy in [(f"↑ hooneni {site['dist']['hooneni']:.1f} m".replace('.',','),((a0[0]+a1[0])/2,a0[1]-30)),(f"← parklani {site['dist']['parklani']:.1f} m".replace('.',','),(a0[0]-10,(a0[1]+a1[1])/2+60)),(f"↓ teeni {site['dist']['teeni']:.1f} m".replace('.',','),((a0[0]+a1[0])/2,a1[1]+80))]:
  w=d.textlength(t,font=F)+16;d.rounded_rectangle([xy[0]-w/2,xy[1]-18,xy[0]+w/2,xy[1]+18],8,fill=(255,255,255,235));d.text((xy[0]-w/2+8,xy[1]-14),t,fill=(16,19,15),font=F)
d.text((20,1160),'Ortofoto, kataster, LOD2, nDSM: Maa- ja Ruumiamet 2026 · põhi üleval · 1 ruut = 60 × 60 m',fill='white',font=f2)
im.save('../out/site-check.jpg',quality=88)
