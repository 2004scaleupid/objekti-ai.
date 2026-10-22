/* Vaade3D · Aed ja ümbrus = krundi arhitektuurimudel (laetakse alles siis, kui see sisse lülitatakse).
   Hele, täpne mudel Maa-ameti vektorandmetest: krunt (kataster) muruna + piirijoon + ametlik pindala, kõik krundi hooned (LOD2, ka EHR-ita
   kõrvalhooned), teed (ETAK) asfaldina, piirded (etak_piirded), olulised puud (nDSM ≥ 5 m, võra ≥ 2,5 m, max 25), naabrid hallide kehadena.
   Ehitatakse LOD2 meetrites (x = ida, y = üles, z = -põhi) ja paigutatakse mudeli raami sobituse kaudu (sama mis ametlikud mõõdud). three r128. */
'use strict';
(function(){
const GV={cache:new Map()};
const NDSM=[[58,127,0,4],[105,159,0,7.5],[162,195,0,10],[221,233,0,12],[253,231,0,14],[253,185,0,16],[253,144,0,18.5],[253,96,0,24],[253,33,0,30]];
const COL={bg:0xE9E7E1,grass:'#B4CC97',road:'#A8A6A1',edge:0x5f5a52,fence:0xA39B8F,wall:0xF4F2EE,roof:0xD9D5CE,nb:0xDCDAD5,trunk:0x8B7D6E,crown:0xAAC690,conifer:0x88AA8B};
const mob=()=>Math.min(innerWidth,innerHeight)<700||matchMedia('(pointer:coarse)').matches;
const img=u=>new Promise((res,rej)=>{const i=new Image();i.crossOrigin='anonymous';i.onload=()=>res(i);i.onerror=()=>rej(new Error('pilt: '+u));i.src=u;});
const lin=h=>new THREE.Color(h).convertSRGBToLinear();
const hex=h=>'#'+h.toString(16).padStart(6,'0');

// ---------- päike Viimsis (NOAA lähend) ----------
function sun(date){const lat=59.5*Math.PI/180,lon=24.85,d=(date-Date.UTC(2000,0,1,12))/864e5,g=(357.529+.98560028*d)*Math.PI/180,q=280.459+.98564736*d,
  L=(q+1.915*Math.sin(g)+.02*Math.sin(2*g))*Math.PI/180,e=(23.439-.00000036*d)*Math.PI/180,ra=Math.atan2(Math.cos(e)*Math.sin(L),Math.cos(L)),dec=Math.asin(Math.sin(e)*Math.sin(L)),
  gm=(18.697374558+24.06570982441908*d)%24,ha=((gm*15+lon)*Math.PI/180-ra),el=Math.asin(Math.sin(lat)*Math.sin(dec)+Math.cos(lat)*Math.cos(dec)*Math.cos(ha)),
  az=Math.atan2(-Math.sin(ha),Math.tan(dec)*Math.cos(lat)-Math.sin(lat)*Math.cos(ha));return {el,az:(az+2*Math.PI)%(2*Math.PI)};}
function sunAt(k){const n=new Date(),hh={h:9,p:13.5,o:19}[k]||13.5;const loc=new Date(n.toLocaleString('en-US',{timeZone:'Europe/Tallinn'})),off=loc-n;
  const t=new Date(n.getFullYear(),n.getMonth(),n.getDate(),Math.floor(hh),(hh%1)*60)-off;const s=sun(t);if(s.el<.06)s.el=.06;return s;}

// ---------- geomeetria ----------
const pip=(x,y,P)=>{let c=false;for(let i=0,j=P.length-1;i<P.length;j=i++){const a=P[i],b=P[j];if(((a[1]>y)!==(b[1]>y))&&(x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]))c=!c;}return c;};
const ring2=f=>{const P=[];for(let i=0;i+1<f.length;i+=2)P.push([f[i],f[i+1]]);return P;};
const ring3=f=>{const P=[];for(let i=0;i+2<f.length;i+=3)P.push([f[i],f[i+1],f[i+2]]);return P;};
const area2=P=>Math.abs(P.reduce((s,a,i)=>{const b=P[(i+1)%P.length];return s+a[0]*b[1]-b[0]*a[1];},0))/2;
const cen2=P=>{let ax=0,ay=0,A=0;P.forEach((a,i)=>{const b=P[(i+1)%P.length],c=a[0]*b[1]-b[0]*a[1];A+=c;ax+=(a[0]+b[0])*c;ay+=(a[1]+b[1])*c;});return Math.abs(A)>1e-9?[ax/(3*A),ay/(3*A)]:P[0];};
function segPt(p,a,b){const ex=b[0]-a[0],ey=b[1]-a[1],l2=ex*ex+ey*ey||1,t=Math.max(0,Math.min(1,((p[0]-a[0])*ex+(p[1]-a[1])*ey)/l2));return [a[0]+t*ex,a[1]+t*ey];}
// kahe hulknurga (või hulknurga ja lõigu) lähimad punktid
function closest(P,Q,qClosed=true){let best={d:1e9};const E=(R,closed)=>R.map((a,i)=>[a,R[(i+1)%R.length]]).slice(0,closed?R.length:R.length-1);
  for(const [a,b] of E(P,true))for(const q of Q){const p=segPt(q,a,b),d=Math.hypot(p[0]-q[0],p[1]-q[1]);if(d<best.d)best={d,a:p,b:q};}
  for(const [a,b] of E(Q,qClosed))for(const p of P){const q=segPt(p,a,b),d=Math.hypot(p[0]-q[0],p[1]-q[1]);if(d<best.d)best={d,a:p,b:q};}return best;}
function roofH(roofs,x,y,dflt){let best=-1;for(const R of roofs){if(!pip(x,y,R))continue;const a=R[0],b=R[1];let n=null;
    for(let k=2;k<R.length&&!n;k++){const c=R[k],u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],v=[c[0]-a[0],c[1]-a[1],c[2]-a[2]],nn=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];if(Math.abs(nn[2])>1e-6)n=nn;}
    if(!n)continue;const h=a[2]-(n[0]*(x-a[0])+n[1]*(y-a[1]))/n[2];if(h>best)best=h;}return best<0?dflt:best;}
// hoone kehad: seinad kuni katuseni + katusetahud + puhtad servajooned
function building(b,dx,dy,wallM,roofM,edgeM,info){const roofs=b.f.map(f=>ring3(f).map(q=>[q[0]+dx,q[1]+dy,q[2]])),pos=[],g=new THREE.Group();
  for(const r of b.g){const R=ring2(r).map(q=>[q[0]+dx,q[1]+dy]);for(let i=0;i<R.length;i++){const a=R[i],c=R[(i+1)%R.length],n=Math.max(1,Math.ceil(Math.hypot(c[0]-a[0],c[1]-a[1])/.7));
    for(let k=0;k<n;k++){const t0=k/n,t1=(k+1)/n,x0=a[0]+(c[0]-a[0])*t0,y0=a[1]+(c[1]-a[1])*t0,x1=a[0]+(c[0]-a[0])*t1,y1=a[1]+(c[1]-a[1])*t1;
      const nx=-(y1-y0),ny=x1-x0,L=Math.hypot(nx,ny)||1,h0=roofH(roofs,x0-nx/L*.05,y0-ny/L*.05,b.e),h1=roofH(roofs,x1-nx/L*.05,y1-ny/L*.05,b.e);
      pos.push(x0,0,-y0,x1,0,-y1,x1,h1,-y1,x0,0,-y0,x1,h1,-y1,x0,h0,-y0);}}}
  const wg=new THREE.BufferGeometry();wg.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));wg.computeVertexNormals();const w=new THREE.Mesh(wg,wallM);w.castShadow=w.receiveShadow=true;w.userData.bld=info;g.add(w);
  for(const R of roofs){if(R.length<3)continue;const P=R.map(q=>new THREE.Vector3(q[0],q[2]+.02,-q[1]));const geo=new THREE.BufferGeometry().setFromPoints(P);
    geo.setIndex(THREE.ShapeUtils.triangulateShape(R.map(q=>new THREE.Vector2(q[0],q[1])),[]).flat());geo.computeVertexNormals();const m=new THREE.Mesh(geo,roofM);m.castShadow=m.receiveShadow=true;m.userData.bld=info;g.add(m);
    if(edgeM)g.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(P),edgeM));}
  if(edgeM)for(const r of b.g){ring2(r).forEach(q=>{const x=q[0]+dx,y=q[1]+dy,h=roofH(roofs,x,y,b.e);g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x,0,-y),new THREE.Vector3(x,h,-y)]),edgeM));});}
  return g;}

// ---------- olulised puud nDSM-ist ----------
function treesFrom(ndsm,mask,R,keep=()=>true){const W=ndsm.width,px=2*R/W,c=document.createElement('canvas');c.width=c.height=W;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(ndsm,0,0,W,W);
  const D=x.getImageData(0,0,W,W).data,H=new Float32Array(W*W);
  for(let i=0;i<W*W;i++){if(D[i*4+3]<90||mask[i])continue;let bd=1e9,bh=0;for(const [r,g,b,h] of NDSM){const d=(D[i*4]-r)**2+(D[i*4+1]-g)**2+(D[i*4+2]-b)**2;if(d<bd){bd=d;bh=h;}}if(bd<2500)H[i]=bh;}
  let S=H;for(let pass=0;pass<2;pass++){const T=new Float32Array(W*W);for(let j=1;j<W-1;j++)for(let i=1;i<W-1;i++){let s=0;for(let b=-1;b<=1;b++)for(let a=-1;a<=1;a++)s+=S[(j+b)*W+i+a];T[j*W+i]=s/9;}S=T;}
  const cand=[];for(let j=2;j<W-2;j++)for(let i=2;i<W-2;i++){const h=S[j*W+i];if(h<4.5)continue;let mx=true;for(let b=-2;b<=2&&mx;b++)for(let a=-2;a<=2;a++)if(S[(j+b)*W+i+a]>h){mx=false;break;}if(mx&&keep(-R+(i+.5)*px,R-(j+.5)*px))cand.push([i,j,h]);}
  cand.sort((p,q)=>q[2]-p[2]);const sup=5/px,out=[];
  for(const [i,j,h0] of cand){if(out.some(t=>Math.hypot(t.i-i,t.j-j)<sup))continue;const h=Math.max(h0,H[j*W+i]);
    let rs=0;for(let k=0;k<8;k++){const a=k*Math.PI/4;let d=1;for(;d<8/px;d++){const ii=Math.round(i+Math.cos(a)*d),jj=Math.round(j+Math.sin(a)*d);if(ii<0||jj<0||ii>=W||jj>=W||S[jj*W+ii]<h*.45)break;}rs+=d*px;}
    out.push({i,j,x:-R+(i+.5)*px,y:R-(j+.5)*px,h,r:Math.max(.8,Math.min(4.5,rs/8,h*.38+.6))});}
  return out;}

// ---------- piirded rastrist (peenendus + jälgimine + lihtsustus) ----------
function fencesFrom(im,R){const W=768,px=2*R/W,c=document.createElement('canvas');c.width=c.height=W;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(im,0,0,W,W);
  const D=x.getImageData(0,0,W,W).data,B=new Uint8Array(W*W);for(let i=0;i<W*W;i++)B[i]=D[i*4+3]>60?1:0;
  const at=(i,j)=>i<0||j<0||i>=W||j>=W?0:B[j*W+i];let ch=true,it=0;
  while(ch&&it++<20){ch=false;for(const st of [0,1]){const del=[];for(let j=1;j<W-1;j++)for(let i=1;i<W-1;i++){if(!B[j*W+i])continue;
    const p=[at(i,j-1),at(i+1,j-1),at(i+1,j),at(i+1,j+1),at(i,j+1),at(i-1,j+1),at(i-1,j),at(i-1,j-1)],b=p.reduce((s,v)=>s+v,0);if(b<2||b>6)continue;
    let a=0;for(let k=0;k<8;k++)if(!p[k]&&p[(k+1)%8])a++;if(a!==1)continue;
    if(st===0?(p[0]*p[2]*p[4]===0&&p[2]*p[4]*p[6]===0):(p[0]*p[2]*p[6]===0&&p[0]*p[4]*p[6]===0))del.push(j*W+i);}del.forEach(k=>B[k]=0);if(del.length)ch=true;}}
  const seen=new Uint8Array(W*W),nb=(i,j)=>{const o=[];for(let b=-1;b<=1;b++)for(let a=-1;a<=1;a++)if((a||b)&&at(i+a,j+b))o.push([i+a,j+b]);return o;},segs=[];
  const rdp=(P,e)=>{if(P.length<3)return P;let d=0,k=0;const [a,b]=[P[0],P[P.length-1]],L=Math.hypot(b[0]-a[0],b[1]-a[1])||1;
    for(let i=1;i<P.length-1;i++){const dd=Math.abs((b[0]-a[0])*(a[1]-P[i][1])-(a[0]-P[i][0])*(b[1]-a[1]))/L;if(dd>d){d=dd;k=i;}}return d>e?rdp(P.slice(0,k+1),e).slice(0,-1).concat(rdp(P.slice(k),e)):[a,b];};
  const walk=(i,j)=>{const P=[[i,j]];seen[j*W+i]=1;for(;;){const n=nb(i,j).find(([a,b])=>!seen[b*W+a]);if(!n)break;[i,j]=n;seen[j*W+i]=1;P.push([i,j]);}return P;};
  for(const pass of [0,1])for(let j=0;j<W;j++)for(let i=0;i<W;i++){if(!B[j*W+i]||seen[j*W+i])continue;if(pass===0&&nb(i,j).length!==1)continue;
    const P=rdp(walk(i,j),1.6);for(let k=1;k<P.length;k++){const a=P[k-1],b=P[k];if(Math.hypot(b[0]-a[0],b[1]-a[1])*px>=.8)segs.push([-R+a[0]*px,R-a[1]*px,-R+b[0]*px,R-b[1]*px]);}}
  return segs;}

// ---------- maapind: krunt muruna, teed asfaldina, pehme kontaktvari hoonete all, servad sulanduvad taustaks ----------
function groundTex(S,par,roads,feet){const N=2048,px=S/N,c=document.createElement('canvas');c.width=c.height=N;const x=c.getContext('2d'),P=(X,Y)=>[(X+S/2)/px,(S/2-Y)/px];
  const path=(R,close=true)=>{x.beginPath();R.forEach((q,k)=>{const [a,b]=P(q[0],q[1]);k?x.lineTo(a,b):x.moveTo(a,b);});if(close)x.closePath();};
  x.fillStyle=hex(COL.bg);x.fillRect(0,0,N,N);
  if(par){x.fillStyle=COL.grass;path(par);x.fill();}
  x.fillStyle=x.strokeStyle=COL.road;x.lineCap=x.lineJoin='round';
  roads.a.forEach(poly=>{x.beginPath();poly.forEach(r=>ring2(r).forEach((q,k)=>{const [a,b]=P(q[0],q[1]);k?x.lineTo(a,b):x.moveTo(a,b);}));x.fill('evenodd');});roads.l.forEach(l=>{x.lineWidth=l.w/px;path(ring2(l.g),false);x.stroke();});
  // kontaktvari (pehme AO) hoonete jalajälgede ümber: kujund ekraanist väljas, ainult vari jääb
  x.save();x.translate(-N*2,0);x.shadowColor='rgba(60,52,40,.42)';x.shadowBlur=1.1/px;x.shadowOffsetX=N*2;x.fillStyle='#000';feet.forEach(R=>{path(R);x.fill();});x.restore();
  const g=x.createRadialGradient(N/2,N/2,N*.3,N/2,N/2,N*.5);g.addColorStop(0,hex(COL.bg)+'00');g.addColorStop(1,hex(COL.bg));x.fillStyle=g;x.fillRect(0,0,N,N);
  const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;return t;}

// ---------- vaade ----------
async function show(V,m,meta,T){const R=meta.r,t=()=>performance.now();let t0=t();
  const L=M3L2[m.ehr],f=m.fit;if(!L||!f)throw new Error('sobitus puudub');
  const [ndsm,fen,geo]=await Promise.all([img(meta.files.ndsm),img(meta.files.fences),nearby(meta)]);
  T.andmed=Math.round(t()-t0);t0=t();
  const par=(meta.parcels||[]).find(p=>pip(0,0,ring2(p.g[0])))||null,PP=par?ring2(par.g[0]):null;
  const own=[],nb=[];geo.forEach(o=>{if(o.e===meta.ehr)return;(PP&&pip(o.dx,o.dy,PP)?own:nb).push(o);});
  const outer=new THREE.Group(),G=new THREE.Group();outer.add(G);G.position.set(-f.lc[0],0,f.lc[1]);outer.rotation.y=-f.rot*Math.PI/180;outer.scale.setScalar(1/f.s);outer.position.set(f.mc[0],f.y0,-f.mc[1]);
  const grp={aed:new THREE.Group(),puud:new THREE.Group(),naabrid:new THREE.Group(),krunt:new THREE.Group()};Object.values(grp).forEach(g=>G.add(g));
  // maapind
  const S=180,shift=o=>r=>ring2(r).map(q=>[q[0]+o.dx,q[1]+o.dy]),feet=[...(L.g||[]).map(ring2),...own.flatMap(o=>o.b.g.map(shift(o))),...nb.flatMap(o=>o.b.g.map(shift(o)))];
  const gt=groundTex(S,PP,meta.roads||{a:[],l:[]},feet);gt.anisotropy=V.r.capabilities.getMaxAnisotropy();
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(S,S),new THREE.MeshLambertMaterial({map:gt}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;ground.position.y=-.02;
  const far=new THREE.Mesh(new THREE.CircleGeometry(900,48),new THREE.MeshBasicMaterial({color:lin(COL.bg)}));far.rotation.x=-Math.PI/2;far.position.y=-.06;
  grp.aed.add(ground,far);
  // krundi piir (õhuke joon)
  if(PP){const P=PP.map(q=>new THREE.Vector3(q[0],.04,-q[1]));grp.krunt.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(P),new THREE.LineBasicMaterial({color:COL.edge})));}
  // piirded: õhukesed seinad 1,1 m
  const segs=fencesFrom(fen,R);if(segs.length){const pos=[];segs.forEach(([x0,y0,x1,y1])=>pos.push(x0,0,-y0,x1,0,-y1,x1,1.1,-y1,x0,0,-y0,x1,1.1,-y1,x0,1.1,-y0));
    const fg=new THREE.BufferGeometry();fg.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));fg.computeVertexNormals();const fm=new THREE.Mesh(fg,new THREE.MeshStandardMaterial({color:COL.fence,roughness:.9,side:THREE.DoubleSide}));fm.castShadow=true;grp.aed.add(fm);}
  // hooned: krundi omad valged (nagu maja), naabrid hallid
  const edge=new THREE.LineBasicMaterial({color:0x8d877e,transparent:true,opacity:.55}),wallM=new THREE.MeshStandardMaterial({color:COL.wall,roughness:.95,side:THREE.DoubleSide}),roofM=new THREE.MeshStandardMaterial({color:COL.roof,roughness:.9,side:THREE.DoubleSide});
  own.sort((a,b)=>b.b.fp-a.b.fp).forEach((o,k)=>{o.info={nm:'Kõrvalhoone '+(k+1),fp:o.b.fp,h:o.b.r,roof:o.b.ro};grp.aed.add(building(o.b,o.dx,o.dy,wallM,roofM,edge,o.info));});
  const nbM=new THREE.MeshStandardMaterial({color:COL.nb,roughness:.95,side:THREE.DoubleSide});nb.forEach(o=>grp.naabrid.add(building(o.b,o.dx,o.dy,nbM,nbM,null,{nm:'Naaberhoone',fp:o.b.fp,h:o.b.r,roof:o.b.ro})));
  // olulised puud: ≥ 5 m kõrgused, võra ≥ 2,5 m, krundil + 12 m varu, max 25
  const W=ndsm.width,mk=document.createElement('canvas');mk.width=mk.height=W;const mx=mk.getContext('2d',{willReadFrequently:true}),px=2*R/W;mx.fillStyle=mx.strokeStyle='#fff';mx.lineWidth=2/px;
  feet.forEach(Rg=>{mx.beginPath();Rg.forEach((q,k)=>{const a=(q[0]+R)/px,b=(R-q[1])/px;k?mx.lineTo(a,b):mx.moveTo(a,b);});mx.closePath();mx.fill();mx.stroke();});
  const MD=mx.getImageData(0,0,W,W).data,mask=new Uint8Array(W*W);for(let i=0;i<W*W;i++)mask[i]=MD[i*4+3]>10?1:0;
  const box=PP?PP.reduce((b,q)=>[Math.min(b[0],q[0]),Math.min(b[1],q[1]),Math.max(b[2],q[0]),Math.max(b[3],q[1])],[1e9,1e9,-1e9,-1e9]):[-30,-30,30,30];
  const inBox=(x,y)=>x>box[0]-12&&x<box[2]+12&&y>box[1]-12&&y<box[3]+12;
  const trees=treesFrom(ndsm,mask,R,inBox).filter(tr=>tr.h>=5&&tr.r>=2.5).slice(0,25);
  trees.forEach(tr=>{tr.con=tr.r/tr.h<.3;tr.own=!!PP&&pip(tr.x,tr.y,PP);});
  T.puud=Math.round(t()-t0);t0=t();
  const mtx=new THREE.Matrix4(),q=new THREE.Quaternion();
  const kinds=[['trunk',new THREE.CylinderGeometry(.13,.18,1,7).translate(0,.5,0),COL.trunk,()=>true],['crown',new THREE.IcosahedronGeometry(1,1),COL.crown,tr=>!tr.con],['cone',new THREE.ConeGeometry(1,1,9).translate(0,.5,0),COL.conifer,tr=>tr.con]];
  for(const [k,geom,c,ok] of kinds){const L2=trees.filter(ok);if(!L2.length)continue;const im=new THREE.InstancedMesh(geom,new THREE.MeshStandardMaterial({color:c,roughness:.95,flatShading:true}),L2.length);
    im.castShadow=true;im.receiveShadow=true;im.userData.trees=L2;
    L2.forEach((tr,i)=>{q.setFromAxisAngle(new THREE.Vector3(0,1,0),((tr.i*7919+tr.j*104729)%628)/100);let p,s;
      if(k==='trunk'){p=[tr.x,0,-tr.y];s=[1+tr.r*.05,tr.con?tr.h*.3:tr.h-tr.r*1.1,1+tr.r*.05];}
      else if(k==='crown'){const cr=tr.r*.9,ch=Math.min(cr*1.1,tr.h*.5);p=[tr.x,tr.h-ch,-tr.y];s=[cr,ch,cr];}
      else{p=[tr.x,tr.h*.18,-tr.y];s=[tr.r*.82,tr.h*.82,tr.r*.82];}
      mtx.compose(new THREE.Vector3(...p),q,new THREE.Vector3(...s));im.setMatrixAt(i,mtx);});im.instanceMatrix.needsUpdate=true;grp.puud.add(im);}
  V.sc.add(outer);outer.updateMatrixWorld(true);
  // krundi mõõdud sildikihile (maailma koordinaadid): pindala, servad, majast piirini, naabriteni, kõrvalhoonete pinnad
  const w=(x,y,z=0)=>new THREE.Vector3(x,z,-y).applyMatrix4(G.matrixWorld),site=[],main=(L.g||[]).map(ring2)[0]||[];
  // krundi silt vabasse kohta: krundi punkt, mis on majast ja piirist kõige kaugemal (keskpunkt jääb sageli maja alla)
  const freeSpot=()=>{let best=null;for(let x0=box[0];x0<=box[2];x0+=1)for(let y0=box[1];y0<=box[3];y0+=1){if(!pip(x0,y0,PP))continue;
    const dB=closest(PP,[[x0,y0]]).d,dH=main.length?(pip(x0,y0,main)?0:closest(main,[[x0,y0]]).d):99,sc=Math.min(dB*1.4,dH);if(!best||sc>best.s)best={s:sc,p:[x0,y0]};}return best?best.p:cen2(PP);};
  if(PP){const c=freeSpot();site.push({k:'slab',P:[w(c[0],c[1],.2)],txt:`Krunt ${fmt(par.p||area2(PP),0)} m²`,pri:3});
    PP.forEach((a,i)=>{const b=PP[(i+1)%PP.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len>=2)site.push({k:'sedge',P:[w(a[0],a[1]),w(b[0],b[1])],txt:fmtM(len)+' m',pri:1});});
    if(main.length)PP.forEach((a,i)=>{const b=PP[(i+1)%PP.length];if(Math.hypot(b[0]-a[0],b[1]-a[1])<2)return;const r=closest(main,[a,b],false);if(r.d<40)site.push({k:'sdim',P:[w(...r.a,.05),w(...r.b,.05)],txt:fmtM(r.d)+' m',pri:2});});}
  if(main.length)nb.map(o=>({o,r:o.b.g.map(g=>closest(main,ring2(g).map(q=>[q[0]+o.dx,q[1]+o.dy]))).sort((p,q)=>p.d-q.d)[0]})).filter(x=>x.r.d<30).sort((p,q)=>p.r.d-q.r.d).slice(0,3)
    .forEach(({r})=>site.push({k:'sdim',P:[w(...r.a,.05),w(...r.b,.05)],txt:fmtM(r.d)+' m naabrini',pri:2}));
  own.forEach(o=>{const R0=ring2(o.b.g[0]).map(q=>[q[0]+o.dx,q[1]+o.dy]),c=cen2(R0);site.push({k:'slab',P:[w(c[0],c[1],o.b.r+.3)],txt:`${fmt(o.b.fp)} m²`,pri:2});});
  V.m3S=site;V.m3Sv=m.gopt.krunt!==false;
  // valgus: päike + taevavalgus (ruumi keskkonnavalgus lamendaks varjud), hele taust, kauge serv sulandub
  const hemi=V.sc.children.find(o=>o.isHemisphereLight);
  const st={exp:V.r.toneMappingExposure,env:V.sc.environment,hemi:hemi&&[hemi.intensity,hemi.color.getHex(),hemi.groundColor.getHex()],bg:V.sc.background,fog:V.sc.fog,catcher:V.catcher.visible,sunPos:V.sun.position.clone(),sunI:V.sun.intensity,far:V.cam.far,maxD:V.ct.maxDistance,cam:V.sun.shadow.camera.clone(),rad:V.sun.shadow.radius};
  // ACES tasandab heledad värvid hallikaks: aias väiksem säritus
  V.r.toneMappingExposure=.78;V.sc.environment=null;if(hemi){hemi.intensity=1.05;hemi.color.set(0xF4F6F8);hemi.groundColor.set(0xB8B2A6);}
  V.catcher.visible=false;const s=f.s,sc=V.sun.shadow.camera;sc.left=sc.bottom=-70/s;sc.right=sc.top=70/s;sc.near=1/s;sc.far=400/s;sc.updateProjectionMatrix();
  const ms=mob()?1024:2048;if(V.sun.shadow.mapSize.x!==ms){V.sun.shadow.mapSize.set(ms,ms);if(V.sun.shadow.map){V.sun.shadow.map.dispose();V.sun.shadow.map=null;}}
  V.sun.shadow.bias=-.0004;V.sun.shadow.normalBias=.03/s;V.sun.shadow.radius=5;
  V.sc.background=lin(COL.bg);V.sc.fog=new THREE.Fog(lin(COL.bg),130/s,320/s);V.cam.far=Math.max(V.cam.far,3000/s);V.cam.updateProjectionMatrix();V.ct.maxDistance=Math.max(V.ct.maxDistance,160/s);
  const setTime=k=>{const p=sunAt(k),v=new THREE.Vector3(Math.sin(p.az)*Math.cos(p.el),Math.sin(p.el),-Math.cos(p.az)*Math.cos(p.el));
    v.applyAxisAngle(new THREE.Vector3(0,1,0),-f.rot*Math.PI/180);V.sun.position.copy(v).multiplyScalar(160/s).add(V.sun.target.position);V.sun.intensity=k==='p'?2.7:2.2;V.sun.color.set(k==='o'?0xFFD2B0:k==='h'?0xFFEBD6:0xFFFFFF);};
  setTime(m.gopt.time||'p');
  V.gpick=[ground,grp.aed,grp.naabrid];
  const vis=()=>{for(const k in grp)grp[k].visible=m.gopt[k]!==false;V.m3Sv=m.gopt.krunt!==false;V.m3key=null;};vis();
  const sp=new THREE.Sphere();new THREE.Box3().setFromObject(V.model).getBoundingSphere(sp);const dir=V.cam.position.clone().sub(V.ct.target);dir.y=0;dir.normalize();dir.y=.85;dir.normalize();
  V.cam.position.copy(V.ct.target).addScaledVector(dir,Math.max(sp.radius*4.4,46/s)*Math.max(1,1/V.cam.aspect));V.ct.update(); // püstkaadris (telefon) kitsas vaade -> kaugemale
  T.mudel=Math.round(t()-t0);if(typeof m3Redraw==='function')m3Redraw();
  const off=()=>{V.r.toneMappingExposure=st.exp;V.sc.environment=st.env;if(hemi&&st.hemi){hemi.intensity=st.hemi[0];hemi.color.set(st.hemi[1]);hemi.groundColor.set(st.hemi[2]);}V.sc.remove(outer);V.sc.background=st.bg;V.sc.fog=st.fog;V.catcher.visible=st.catcher;
    V.sun.position.copy(st.sunPos);V.sun.intensity=st.sunI;V.sun.color.set(0xffffff);V.sun.shadow.radius=st.rad;Object.assign(sc,{left:st.cam.left,right:st.cam.right,top:st.cam.top,bottom:st.cam.bottom,near:st.cam.near,far:st.cam.far});sc.updateProjectionMatrix();
    V.cam.far=st.far;V.cam.updateProjectionMatrix();V.ct.maxDistance=st.maxD;V.gpick=null;V.m3S=null;outer.traverse(o=>{if(o.geometry)o.geometry.dispose();});gt.dispose();if(typeof m3Redraw==='function')m3Redraw();};
  return {off,vis,setTime,trees,parcel:par,own:own.map(o=>o.info),neighbours:nb.length,fences:segs.length};}
async function nearby(meta){const [cx,cy]=meta.c,K=new Set();for(const dx of [-85,85])for(const dy of [-85,85])K.add(Math.floor((cx+dx)/250)+'_'+Math.floor((cy+dy)/250));
  const tiles=await Promise.all([...K].map(k=>GV.cache.get(k)||(GV.cache.set(k,fetch('data/lod2/geo/'+k+'.json').then(r=>r.ok?r.json():{}).catch(()=>({}))),GV.cache.get(k))));
  const out=[];tiles.forEach(T=>Object.entries(T).forEach(([e,b])=>{const dx=b.c[0]-cx,dy=b.c[1]-cy;if(Math.hypot(dx,dy)<80)out.push({e,b,dx,dy});}));return out;}

window.V3DGarden={show,sunAt,treesFrom,fencesFrom,closest};
})();
