# Kalibreerimine kasutaja hoovifotol (1.webp, 1672×941): tundmatud f, kalle (pitch), kaamera kõrgus h; roll 0, peapunkt keskel.
# Viited (päris mõõdud): auto kõrgus 1,5 m, maja välisuks 2,1 m, terrassi klaasuks 2,1 m, kuuri uks 1,8 m; f-i eeldus iPhone 1x (≈26 mm) nõrga kaaluga.
import numpy as np, json
from scipy.optimize import least_squares
W,H=1672,941;cx,cy=W/2,H/2
REF=[('auto kõrgus',608,452,1.5),('maja uks',480,412,2.1),('klaasuks',489,406,2.1),('kuuri uks',489,434,1.6)]
def alpha(v,f,th): return th+np.arctan((v-cy)/f)
def Hpred(vb,vt,f,th,h): return h*(1-np.tan(alpha(vt,f,th))/np.tan(alpha(vb,f,th)))
def res(p):
  f,th,h=p;r=[Hpred(vb,vt,f,th,h)-Hm for _,vb,vt,Hm in REF];r.append((f-1217)/1217*0.5);return r
s=least_squares(res,[1217,.05,1.6],bounds=([700,-.3,.8],[2000,.5,3]))
f,th,h=s.x
print(f'f={f:.0f}px pitch={np.degrees(th):.2f}° h={h:.2f} m')
errs=[(n,Hpred(vb,vt,f,th,h),Hm) for n,vb,vt,Hm in REF]
for n,p,m in errs: print(f'  {n}: mudel {p:.2f} m, tegelik {m:.2f} m, viga {abs(p-m):.2f} m')
rms=np.sqrt(np.mean([(p-m)**2 for _,p,m in errs]));print('RMS viga',round(rms,3),'m')
# maapinna punkt pikslist (kaamera teljestik: x paremale, z ette)
def ground(u,v):
  xn,yn=(u-cx)/f,(v-cy)/f;fw=np.cos(th)-yn*np.sin(th);dn=np.sin(th)+yn*np.cos(th);t=h/dn;return np.array([xn*t,fw*t])
for n,(u,v) in {'ala keskpunkt (varem märgitud)':(880,660),'auto taga':(70,608),'maja uks':(676,480),'kuur':(910,490),'kask':(1495,635)}.items():
  g=ground(u,v);print(f'  {n}: {g[0]:.1f} m paremal, {g[1]:.1f} m ees')
c=ground(880,660)
json.dump({'f':f,'pitch':th,'h':h,'W':W,'H':H,'rms':rms,'errs':[(n,round(p,3),m) for n,p,m in errs],'center':c.tolist()},open('/tmp/cal/cam.json','w'),ensure_ascii=False)
