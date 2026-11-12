# Mõõtjooned kalibreeritud kaamerast (cam-cal.json) layout/dims-X.json-ist: põrandamõõdud + püstmõõdud.
import json,numpy as np,sys
from PIL import Image,ImageDraw,ImageFont
D='/Users/taavimalm/objekti-ai/demo/aiapidu/brief';C=json.load(open(f'{D}/cam-cal.json'));f,th,h,W,H=C['f'],C['pitch'],C['h'],C['W'],C['H'];cx,cy=W/2,H/2
AX,AN=C['area']['X0'],C['area']['F0']   # ala nurk: plaan (x, y) -> paremale AX+x, ette AN+y
def pj(px,py,z=0.0):
  X=AX+px;Fw=AN+py;Y=h-z   # Y = kaamerast allapoole
  zc=Fw*np.cos(th)+Y*np.sin(th);yc=-Fw*np.sin(th)+Y*np.cos(th)
  return (cx+f*X/zc, cy+f*yc/zc)
FB=lambda s:ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf',int(s))
RED=(229,57,53)
def draw(v,src,out):
  im=Image.open(src).convert('RGB');S=im.width/W;d=ImageDraw.Draw(im,'RGBA');F=FB(15*S);placed=[]
  P=lambda a,z=0:tuple(c*S for c in pj(a[0],a[1],z))
  segs=json.load(open(f'{D}/dims-{v}.json'))
  def label(m,t,col,small=False):
    tw=d.textlength(t,font=F)+14*S;th_=24*S;m0=list(m);m=list(m)
    hit=lambda m:any(abs(m[0]-q[0])<(tw+q[2])/2+3*S and abs(m[1]-q[1])<th_+2*S for q in placed)
    if hit(m):
      if small: return            # väikesed vahe-/seinamõõdud: kokkupõrkel silt ära (2D plaanil olemas), joon jääb
      for k in range(1,10):       # suurem silt: nihuta üles ja tõmba juhtjoon
        m=[m0[0],m0[1]-k*th_]
        if not hit(m): break
      d.line([tuple(m0),(m[0],m[1]+th_/2)],fill=col if col!=(255,255,255) else (60,60,60),width=int(1.2*S))
    placed.append((m[0],m[1],tw));d.rounded_rectangle([m[0]-tw/2,m[1]-th_/2,m[0]+tw/2,m[1]+th_/2],radius=5*S,fill=(255,255,255,240),outline=col,width=int(1.4*S));d.text((m[0]-tw/2+7*S,m[1]-th_/2+3*S),t,fill=col if col!=(255,255,255) else (22,19,15),font=F)
  for s in sorted(segs,key=lambda s:{'area':0,'tent':1,'vert':2,'size':3,'gap':4,'wall':5}[s['kind']]):  # tähtsamad sildid enne
    if s['kind']=='vert':
      a=P(s['a']);b=P(s['a'],s['h']);d.line([a,b],fill=RED,width=int(2.6*S))
      for q in (a,b):d.line([(q[0]-8*S,q[1]),(q[0]+8*S,q[1])],fill=RED,width=int(2.6*S))
      label(((a[0]+b[0])/2-50*S,(a[1]+b[1])/2),s['t'],RED);continue
    a,b=P(s['a']),P(s['b']);col=(255,255,255) if s['kind']=='area' else RED
    d.line([a,b],fill=col,width=int((3 if s['kind'] in('area','tent') else 2.2)*S))
    L=max(1e-6,np.hypot(b[0]-a[0],b[1]-a[1]));nx,ny=-(b[1]-a[1])/L*6*S,(b[0]-a[0])/L*6*S
    for q in (a,b):d.line([(q[0]-nx,q[1]-ny),(q[0]+nx,q[1]+ny)],fill=col,width=int(2.2*S))
    label(((a[0]+b[0])/2,(a[1]+b[1])/2),s['t'],col,s['kind'] in ('gap','wall'))
  d.rectangle([0,im.height-34*S,im.width,im.height],fill=(22,19,15,230))
  d.text((12*S,im.height-29*S),f"Mõõdud layout.json-ist läbi kalibreeritud kaamera (viga {C['rms']:.2f} m). Täpsed mõõdud 2D plaanil.",fill='white',font=F)
  im.save(out,quality=88)
if __name__=='__main__':
  for v in sys.argv[1:]: draw(v,f'/tmp/cal/fin-{v}.jpg',f'/tmp/cal/ov-{v}.jpg')
