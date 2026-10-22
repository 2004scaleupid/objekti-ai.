/* Vaade3D · Aed ja ümbrus (laetakse alles siis, kui aed sisse lülitatakse).
   Maja ümbrus Maa-ameti avaandmetest: ortofoto maapinnaks (maja + vari kustutatud ja täidetud), puud maakatte kõrgusmudelist (nDSM),
   piirded, naabrid (LOD2), krundi piir (kataster). Kõik ehitatakse LOD2 meetrites (x = ida, y = üles, z = -põhi) ja paigutatakse
   mudeli raami sobituse kaudu (sama mis ametlikud mõõdud), nii et mõõtmine töötab ka aias. three r128. */
'use strict';
(function(){
const GV={trees:null,addons:null,cache:new Map()};
const NDSM=[[58,127,0,4],[105,159,0,7.5],[162,195,0,10],[221,233,0,12],[253,231,0,14],[253,185,0,16],[253,144,0,18.5],[253,96,0,24],[253,33,0,30]];
const TREES={maple:'tree-maple',tree2:'tree-tree2',birch:'tree-birch',fruit:'tree-fruit',bush:'tree-bush',spruce:'tree-spruce',pine:'tree-pine'};
const mob=()=>Math.min(innerWidth,innerHeight)<700||matchMedia('(pointer:coarse)').matches;
const rm=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const img=u=>new Promise((res,rej)=>{const i=new Image();i.crossOrigin='anonymous';i.onload=()=>res(i);i.onerror=()=>rej(new Error('pilt: '+u));i.src=u;});
const script=u=>new Promise((res,rej)=>{if(document.querySelector(`script[data-g="${u}"]`))return res();const s=document.createElement('script');s.src=u;s.dataset.g=u;s.onload=res;s.onerror=()=>rej(new Error(u));document.head.appendChild(s);});
async function addons(){if(GV.addons)return GV.addons;GV.addons=(async()=>{await script('vendor/three128/Sky.js');})();return GV.addons;}

// ---------- päike Viimsis (NOAA lähend) ----------
function sun(date){const lat=59.5*Math.PI/180,lon=24.85,d=(date-Date.UTC(2000,0,1,12))/864e5,g=(357.529+.98560028*d)*Math.PI/180,q=280.459+.98564736*d,
  L=(q+1.915*Math.sin(g)+.02*Math.sin(2*g))*Math.PI/180,e=(23.439-.00000036*d)*Math.PI/180,ra=Math.atan2(Math.cos(e)*Math.sin(L),Math.cos(L)),dec=Math.asin(Math.sin(e)*Math.sin(L)),
  gm=(18.697374558+24.06570982441908*d)%24,ha=((gm*15+lon)*Math.PI/180-ra),el=Math.asin(Math.sin(lat)*Math.sin(dec)+Math.cos(lat)*Math.cos(dec)*Math.cos(ha)),
  az=Math.atan2(-Math.sin(ha),Math.tan(dec)*Math.cos(lat)-Math.sin(lat)*Math.cos(ha));return {el,az:(az+2*Math.PI)%(2*Math.PI)};}
function sunAt(k){const n=new Date(),hh={h:9,p:13.5,o:19}[k]||13.5;const loc=new Date(n.toLocaleString('en-US',{timeZone:'Europe/Tallinn'})),off=loc-n;
  const t=new Date(n.getFullYear(),n.getMonth(),n.getDate(),Math.floor(hh),(hh%1)*60)-off;const s=sun(t);if(s.el<.06)s.el=.06;return s;}

// ---------- abifunktsioonid ----------
const pip=(x,y,P)=>{let c=false;for(let i=0,j=P.length-1;i<P.length;j=i++){const a=P[i],b=P[j];if(((a[1]>y)!==(b[1]>y))&&(x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]))c=!c;}return c;};
const ring2=f=>{const P=[];for(let i=0;i+1<f.length;i+=2)P.push([f[i],f[i+1]]);return P;};
const ring3=f=>{const P=[];for(let i=0;i+2<f.length;i+=3)P.push([f[i],f[i+1],f[i+2]]);return P;};
function roofH(roofs,x,y,dflt){let best=-1;for(const R of roofs){if(!pip(x,y,R))continue;const a=R[0],b=R[1];let n=null;
    for(let k=2;k<R.length&&!n;k++){const c=R[k],u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],v=[c[0]-a[0],c[1]-a[1],c[2]-a[2]],nn=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];if(Math.abs(nn[2])>1e-6)n=nn;}
    if(!n)continue;const h=a[2]-(n[0]*(x-a[0])+n[1]*(y-a[1]))/n[2];if(h>best)best=h;}return best<0?dflt:best;}
// ühe hoone kehad (naabrid): seinad kuni katuseni + katusetahud
function building(b,dx,dy,wallM,roofM){const roofs=b.f.map(f=>ring3(f).map(q=>[q[0]+dx,q[1]+dy,q[2]])),pos=[],g=new THREE.Group();
  for(const r of b.g){const R=ring2(r).map(q=>[q[0]+dx,q[1]+dy]);for(let i=0;i<R.length;i++){const a=R[i],c=R[(i+1)%R.length],n=Math.max(1,Math.ceil(Math.hypot(c[0]-a[0],c[1]-a[1])/.7));
    for(let k=0;k<n;k++){const t0=k/n,t1=(k+1)/n,x0=a[0]+(c[0]-a[0])*t0,y0=a[1]+(c[1]-a[1])*t0,x1=a[0]+(c[0]-a[0])*t1,y1=a[1]+(c[1]-a[1])*t1;
      const nx=-(y1-y0),ny=x1-x0,L=Math.hypot(nx,ny)||1,h0=roofH(roofs,x0-nx/L*.05,y0-ny/L*.05,b.e),h1=roofH(roofs,x1-nx/L*.05,y1-ny/L*.05,b.e);
      pos.push(x0,0,-y0,x1,0,-y1,x1,h1,-y1,x0,0,-y0,x1,h1,-y1,x0,h0,-y0);}}}
  const wg=new THREE.BufferGeometry();wg.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));wg.computeVertexNormals();const w=new THREE.Mesh(wg,wallM);w.castShadow=w.receiveShadow=true;g.add(w);
  for(const R of roofs){if(R.length<3)continue;const P=R.map(q=>new THREE.Vector3(q[0],q[2]+.02,-q[1]));const geo=new THREE.BufferGeometry().setFromPoints(P);
    geo.setIndex(THREE.ShapeUtils.triangulateShape(R.map(q=>new THREE.Vector2(q[0],q[1])),[]).flat());geo.computeVertexNormals();const m=new THREE.Mesh(geo,roofM);m.castShadow=m.receiveShadow=true;g.add(m);}
  return g;}

// ---------- puud nDSM-ist ----------
function treesFrom(ndsm,ortho,mask,R){const W=ndsm.width,px=2*R/W,c=document.createElement('canvas');c.width=c.height=W;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(ndsm,0,0,W,W);
  const D=x.getImageData(0,0,W,W).data,H=new Float32Array(W*W);
  for(let i=0;i<W*W;i++){if(D[i*4+3]<90||mask[i])continue;let bd=1e9,bh=0;for(const [r,g,b,h] of NDSM){const d=(D[i*4]-r)**2+(D[i*4+1]-g)**2+(D[i*4+2]-b)**2;if(d<bd){bd=d;bh=h;}}if(bd<2500)H[i]=bh;}
  // silumine 2x 3x3
  let S=H;for(let pass=0;pass<2;pass++){const T=new Float32Array(W*W);for(let j=1;j<W-1;j++)for(let i=1;i<W-1;i++){let s=0;for(let b=-1;b<=1;b++)for(let a=-1;a<=1;a++)s+=S[(j+b)*W+i+a];T[j*W+i]=s/9;}S=T;}
  const cand=[];for(let j=2;j<W-2;j++)for(let i=2;i<W-2;i++){const h=S[j*W+i];if(h<2.6)continue;let mx=true;for(let b=-2;b<=2&&mx;b++)for(let a=-2;a<=2;a++)if(S[(j+b)*W+i+a]>h){mx=false;break;}if(mx)cand.push([i,j,h]);}
  cand.sort((p,q)=>q[2]-p[2]);const sup=4/px,out=[],cell=new Map(),ck=(a,b)=>a+','+b;
  const oc=document.createElement('canvas');oc.width=oc.height=ortho.width;const ox=oc.getContext('2d',{willReadFrequently:true});ox.drawImage(ortho,0,0);const OW=ortho.width,OD=ox.getImageData(0,0,OW,OW).data;
  const near=(i,j)=>{const ci=Math.floor(i/sup),cj=Math.floor(j/sup);for(let b=-1;b<=1;b++)for(let a=-1;a<=1;a++){const L=cell.get(ck(ci+a,cj+b));if(L&&L.some(t=>Math.hypot(t.i-i,t.j-j)<sup))return true;}return false;};
  for(const [i,j,h0] of cand){if(near(i,j))continue;const h=Math.max(h0,H[j*W+i]);
    let rs=0;for(let k=0;k<8;k++){const a=k*Math.PI/4;let d=1;for(;d<8/px;d++){const ii=Math.round(i+Math.cos(a)*d),jj=Math.round(j+Math.sin(a)*d);if(ii<0||jj<0||ii>=W||jj>=W||S[jj*W+ii]<h*.45)break;}rs+=d*px;}
    const r=Math.max(.8,Math.min(7,rs/8,h*.42+.8)),oi=Math.round(i/W*OW),oj=Math.round(j/W*OW);let cr=0,cg=0,cb=0,n=0;
    for(let b=-3;b<=3;b++)for(let a=-3;a<=3;a++){const ii=oi+a,jj=oj+b;if(ii<0||jj<0||ii>=OW||jj>=OW)continue;const k=(jj*OW+ii)*4;cr+=OD[k];cg+=OD[k+1];cb+=OD[k+2];n++;}cr/=n;cg/=n;cb/=n;
    const t={i,j,x:-R+(i+.5)*px,y:R-(j+.5)*px,h,r,col:[cr,cg,cb]};out.push(t);const key=ck(Math.floor(i/sup),Math.floor(j/sup));(cell.get(key)||cell.set(key,[]).get(key)).push(t);}
  return out;}
function kindOf(t,k){const [r,g,b]=t.col,lum=.3*r+.59*g+.11*b,ratio=t.r/t.h;
  if(t.h<3.2)return 'bush';const con=(lum<75&&b>r*.8)||(ratio<.24&&t.h>7);if(con)return lum<62||t.h<11?'spruce':'pine';
  if(t.h<7)return 'fruit';if(ratio<.33&&lum>85)return 'birch';return k%2?'maple':'tree2';}
async function treeModels(){if(GV.trees)return GV.trees;GV.trees=(async()=>{const ld=new THREE.GLTFLoader();if(window.MeshoptDecoder)ld.setMeshoptDecoder(MeshoptDecoder);
  const get=u=>new Promise((res,rej)=>ld.load(u,g=>res(g.scene),undefined,rej)),M={};
  await Promise.all(Object.keys(TREES).map(async k=>{const hi=await get(`assets/trees/${k}.glb`);
    // meshopt/quantization: asukohad võivad olla int16 -> enne teisendust float32 (muidu teisendus rikub kuju)
    const toF=g=>{const o=new THREE.BufferGeometry();if(g.index)o.setIndex(Array.from(g.index.array));for(const [n,a] of Object.entries(g.attributes)){const it=a.itemSize,arr=new Float32Array(a.count*it),
      A=a.isInterleavedBufferAttribute?a.data.array:a.array,mx=A instanceof Int8Array?127:A instanceof Uint8Array?255:A instanceof Int16Array?32767:A instanceof Uint16Array?65535:1,get=['getX','getY','getZ','getW'];
      for(let i=0;i<a.count;i++)for(let k=0;k<it;k++){let v=a[get[k]](i);if(a.normalized&&mx>1)v=Math.max(v/mx,-1);arr[i*it+k]=v;}o.setAttribute(n,new THREE.BufferAttribute(arr,it));}
      g.groups.forEach(gr=>o.addGroup(gr.start,gr.count,gr.materialIndex));return o;};
    const parts=o=>{const P=[];o.updateMatrixWorld(true);o.traverse(m=>{if(m.isMesh){const g=toF(m.geometry);g.applyMatrix4(m.matrixWorld);const mats=Array.isArray(m.material)?m.material:[m.material];
      if(g.groups.length>1)g.groups.forEach((gr,gi)=>{const gg=g.clone();gg.setIndex(Array.from(g.index.array.slice(gr.start,gr.start+gr.count)));gg.clearGroups();P.push({g:gg,m:mats[gr.materialIndex||0]});});else P.push({g,m:mats[0]});}});return P;};
    const H=parts(hi),bb=new THREE.Box3();H.forEach(p=>{p.g.computeBoundingBox();bb.union(p.g.boundingBox);});const sz=bb.getSize(new THREE.Vector3());
    M[k]={hi:H,lo:null,h:sz.y,r:Math.max(sz.x,sz.z)/2,y0:bb.min.y};}));return M;})();return GV.trees;}
// kauge puu: kaks risti tasapinda puu pildiga (renderdatakse üks kord), lehtede lihtsustamine ei sobi (kaardid lagunevad ribadeks)
function impostor(R,md){if(md.lo)return md.lo;const S=256,rt=new THREE.WebGLRenderTarget(S,S,{format:THREE.RGBAFormat}),sc=new THREE.Scene(),w=md.r*2,h=md.h,sz=Math.max(w,h);
  // vaade kasutab physicallyCorrectLights: tugevused ~π korda suuremad
  sc.add(new THREE.HemisphereLight(0xffffff,0x9a9a80,3.2));const dl=new THREE.DirectionalLight(0xffffff,3.4);dl.position.set(3,5,4);sc.add(dl);
  md.hi.forEach(p=>{const m=p.m.clone();m.metalness=0;if(m.transparent){m.transparent=false;m.alphaTest=.5;m.side=THREE.DoubleSide;}else m.color=new THREE.Color(0x9a8676);sc.add(new THREE.Mesh(p.g,m));});
  const cam=new THREE.OrthographicCamera(-sz/2,sz/2,md.y0+sz,md.y0,.1,100);cam.position.set(0,0,40);cam.lookAt(0,0,0);cam.position.set(0,0,40);cam.updateProjectionMatrix();
  const cc=R.getClearColor(new THREE.Color()),ca=R.getClearAlpha(),pe=R.outputEncoding;R.setClearColor(0x000000,0);R.outputEncoding=THREE.LinearEncoding;R.setRenderTarget(rt);R.clear();R.render(sc,cam);R.setRenderTarget(null);R.setClearColor(cc,ca);R.outputEncoding=pe;
  const a=new THREE.PlaneGeometry(sz,sz);a.translate(0,md.y0+sz/2,0);const b=a.clone();b.rotateY(Math.PI/2);const pos=[...a.attributes.position.array,...b.attributes.position.array],uv=[...a.attributes.uv.array,...b.attributes.uv.array],nrm=[];
  for(let i=0;i<8;i++)nrm.push(0,1,0);const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('normal',new THREE.Float32BufferAttribute(nrm,3));
  g.setIndex([0,2,1,2,3,1,4,6,5,6,7,5]);const m=new THREE.MeshLambertMaterial({map:rt.texture,alphaTest:.45,side:THREE.DoubleSide});m.userData.leaf=true;m.userData.imp=true;
  md.rt=rt;md.lo=[{g,m}];return md.lo;}
function leafMat(m,birch,U){const mm=m.clone();mm.metalness=0;mm.roughness=.92;const leaf=/leaf|leav|needle|pine|fol/i.test(m.name||'')||m.transparent||m.alphaMode==='BLEND';
  if(leaf){mm.transparent=false;mm.alphaTest=.5;mm.side=THREE.DoubleSide;mm.depthWrite=true;
    if(!rm())mm.onBeforeCompile=sh=>{sh.uniforms.uT=U;sh.vertexShader='uniform float uT;\n'+sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n#ifdef USE_INSTANCING\nfloat ph=instanceMatrix[3].x*.31+instanceMatrix[3].z*.17;\n#else\nfloat ph=0.;\n#endif\nfloat sw=max(position.y,0.)*.012;transformed.x+=sin(uT*1.7+ph+position.y*.6)*sw;transformed.z+=cos(uT*1.3+ph)*sw;');};}
  else if(birch){mm.map=null;mm.color=new THREE.Color(0xE8E3DA);}
  else mm.color=new THREE.Color(0x9a8676);
  mm.userData.leaf=leaf;return mm;}

// ---------- piirded rastrist ----------
function fencesFrom(im,R){const W=768,px=2*R/W,c=document.createElement('canvas');c.width=c.height=W;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(im,0,0,W,W);
  const D=x.getImageData(0,0,W,W).data,B=new Uint8Array(W*W);for(let i=0;i<W*W;i++)B[i]=D[i*4+3]>60?1:0;
  // Zhang-Suen peenendus
  const at=(i,j)=>i<0||j<0||i>=W||j>=W?0:B[j*W+i];let ch=true,it=0;
  while(ch&&it++<20){ch=false;for(const st of [0,1]){const del=[];for(let j=1;j<W-1;j++)for(let i=1;i<W-1;i++){if(!B[j*W+i])continue;
    const p=[at(i,j-1),at(i+1,j-1),at(i+1,j),at(i+1,j+1),at(i,j+1),at(i-1,j+1),at(i-1,j),at(i-1,j-1)],b=p.reduce((s,v)=>s+v,0);if(b<2||b>6)continue;
    let a=0;for(let k=0;k<8;k++)if(!p[k]&&p[(k+1)%8])a++;if(a!==1)continue;
    if(st===0?(p[0]*p[2]*p[4]===0&&p[2]*p[4]*p[6]===0):(p[0]*p[2]*p[6]===0&&p[0]*p[4]*p[6]===0))del.push(j*W+i);}del.forEach(k=>B[k]=0);if(del.length)ch=true;}}
  // ahelad otstest + RDP
  const seen=new Uint8Array(W*W),nb=(i,j)=>{const o=[];for(let b=-1;b<=1;b++)for(let a=-1;a<=1;a++)if((a||b)&&at(i+a,j+b))o.push([i+a,j+b]);return o;},segs=[];
  const rdp=(P,e)=>{if(P.length<3)return P;let d=0,k=0;const [a,b]=[P[0],P[P.length-1]],L=Math.hypot(b[0]-a[0],b[1]-a[1])||1;
    for(let i=1;i<P.length-1;i++){const dd=Math.abs((b[0]-a[0])*(a[1]-P[i][1])-(a[0]-P[i][0])*(b[1]-a[1]))/L;if(dd>d){d=dd;k=i;}}return d>e?rdp(P.slice(0,k+1),e).slice(0,-1).concat(rdp(P.slice(k),e)):[a,b];};
  const walk=(i,j)=>{const P=[[i,j]];seen[j*W+i]=1;for(;;){const n=nb(i,j).find(([a,b])=>!seen[b*W+a]);if(!n)break;[i,j]=n;seen[j*W+i]=1;P.push([i,j]);}return P;};
  for(const pass of [0,1])for(let j=0;j<W;j++)for(let i=0;i<W;i++){if(!B[j*W+i]||seen[j*W+i])continue;if(pass===0&&nb(i,j).length!==1)continue;
    const P=rdp(walk(i,j),1.6);for(let k=1;k<P.length;k++){const a=P[k-1],b=P[k];const L=Math.hypot(b[0]-a[0],b[1]-a[1])*px;if(L>=.8)segs.push([-R+a[0]*px,R-a[1]*px,-R+b[0]*px,R-b[1]*px]);}}
  return segs;}

// ---------- maapind: ortofoto, maja + vari kustutatud ja täidetud ----------
function groundTex(ortho,main,trees,R,ridge){const N=ortho.width,px=2*R/N,c=document.createElement('canvas');c.width=c.height=N;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(ortho,0,0);
  const toPx=(X,Y)=>[(X+R)/px,(R-Y)/px];
  // mask: jalajälg + 1,2 m
  const mc=document.createElement('canvas');mc.width=mc.height=N;const m=mc.getContext('2d',{willReadFrequently:true});m.fillStyle=m.strokeStyle='#fff';m.lineJoin='round';
  main.forEach(r=>{const P=ring2(r);m.beginPath();P.forEach((q,k)=>{const [a,b]=toPx(q[0],q[1]);k?m.lineTo(a,b):m.moveTo(a,b);});m.closePath();m.fill();m.lineWidth=2.4/px;m.stroke();});
  const img=x.getImageData(0,0,N,N),D=img.data,M=m.getImageData(0,0,N,N).data,mask=new Uint8Array(N*N);for(let i=0;i<N*N;i++)mask[i]=M[i*4+3]>10?1:0;
  // vari: tumedad pikslid maja ümber (kuni ~harja kõrgus) heledusest < 62% ümbruse mediaanist
  const lum=i=>.3*D[i*4]+.59*D[i*4+1]+.11*D[i*4+2],near=new Uint8Array(N*N),rr=Math.ceil(Math.max(3,ridge)*1.1/px);
  {const bc=document.createElement('canvas');bc.width=bc.height=N;const b=bc.getContext('2d',{willReadFrequently:true});b.strokeStyle='#fff';b.fillStyle='#fff';b.lineJoin='round';
    main.forEach(r=>{const P=ring2(r);b.beginPath();P.forEach((q,k)=>{const [a,bb]=toPx(q[0],q[1]);k?b.lineTo(a,bb):b.moveTo(a,bb);});b.closePath();b.fill();b.lineWidth=rr*2;b.stroke();});
    const B=b.getImageData(0,0,N,N).data;for(let i=0;i<N*N;i++)near[i]=B[i*4+3]>10?1:0;}
  const ringL=[];for(let i=0;i<N*N;i+=7)if(near[i]&&!mask[i])ringL.push(lum(i));ringL.sort((a,b)=>a-b);const med=ringL[ringL.length>>1]||120;
  for(let i=0;i<N*N;i++)if(near[i]&&!mask[i]&&lum(i)<med*.62)mask[i]=1;
  // puude küpsetatud varjud: tumedad pikslid võra ümber heledamaks
  {const tc=document.createElement('canvas');tc.width=tc.height=N;const tx=tc.getContext('2d',{willReadFrequently:true});tx.fillStyle='#fff';
    for(const t of trees){const [ci,cj]=toPx(t.x,t.y);tx.beginPath();tx.arc(ci,cj,Math.min(14,t.r*1.8)/px,0,7);tx.fill();}
    const TD=tx.getImageData(0,0,N,N).data;for(let k=0;k<N*N;k++){if(!TD[k*4+3]||mask[k])continue;const l=lum(k);if(l<med*.7){const f=Math.min(1.45,med*.8/Math.max(l,1));D[k*4]=Math.min(255,D[k*4]*f);D[k*4+1]=Math.min(255,D[k*4+1]*f);D[k*4+2]=Math.min(255,D[k*4+2]*f);}}}
  // täide: push-pull püramiid ümbritsevatest pikslitest
  const lv=[{w:N,c:new Float32Array(N*N*3),a:new Float32Array(N*N)}];for(let i=0;i<N*N;i++)if(!mask[i]){lv[0].c[i*3]=D[i*4];lv[0].c[i*3+1]=D[i*4+1];lv[0].c[i*3+2]=D[i*4+2];lv[0].a[i]=1;}
  while(lv[lv.length-1].w>2){const p=lv[lv.length-1],w=p.w>>1,c=new Float32Array(w*w*3),a=new Float32Array(w*w);
    for(let j=0;j<w;j++)for(let i=0;i<w;i++){let s=0,r=0,g=0,b=0;for(const [di,dj] of [[0,0],[1,0],[0,1],[1,1]]){const k=(j*2+dj)*p.w+i*2+di,aa=p.a[k];s+=aa;r+=p.c[k*3]*aa;g+=p.c[k*3+1]*aa;b+=p.c[k*3+2]*aa;}
      const k=j*w+i;if(s>0){c[k*3]=r/s;c[k*3+1]=g/s;c[k*3+2]=b/s;a[k]=Math.min(1,s);}}lv.push({w,c,a});}
  for(let L=lv.length-2;L>=0;L--){const p=lv[L],q=lv[L+1];for(let j=0;j<p.w;j++)for(let i=0;i<p.w;i++){const k=j*p.w+i;if(p.a[k]>=1)continue;const kq=Math.min(q.w-1,j>>1)*q.w+Math.min(q.w-1,i>>1),t=p.a[k];
    for(let ch=0;ch<3;ch++)p.c[k*3+ch]=p.c[k*3+ch]*t+q.c[kq*3+ch]*(1-t);p.a[k]=1;}}
  for(let i=0;i<N*N;i++)if(mask[i]){const n=(Math.random()-.5)*14;D[i*4]=lv[0].c[i*3]+n;D[i*4+1]=lv[0].c[i*3+1]+n;D[i*4+2]=lv[0].c[i*3+2]+n*.6;}
  x.putImageData(img,0,0);
  // servad sulanduvad muruks (ruut 160 m, ortofoto keskel 128 m)
  const S=2048,o=document.createElement('canvas');o.width=o.height=S;const g=o.getContext('2d'),inset=S*(1-R*2/160)/2;g.fillStyle='#6E7D4A';g.fillRect(0,0,S,S);g.drawImage(c,inset,inset,S-2*inset,S-2*inset);
  const fade=document.createElement('canvas');fade.width=fade.height=S;const fx=fade.getContext('2d'),rg=fx.createRadialGradient(S/2,S/2,S*.33,S/2,S/2,S*.5);rg.addColorStop(0,'rgba(110,125,74,0)');rg.addColorStop(1,'rgba(110,125,74,1)');fx.fillStyle=rg;fx.fillRect(0,0,S,S);g.drawImage(fade,0,0);
  return o;}
function grassDetail(){const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d'),d=x.createImageData(128,128);
  for(let i=0;i<128*128;i++){const v=128+(Math.random()-.5)*70;d.data[i*4]=d.data[i*4+1]=d.data[i*4+2]=v;d.data[i*4+3]=255;}x.putImageData(d,0,0);const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;}

// ---------- vaade ----------
async function show(V,m,meta,T){const R=meta.r,t=()=>performance.now();let t0=t();
  const L=M3L2[m.ehr],f=m.fit;if(!L||!f)throw new Error('sobitus puudub');
  const [ortho,ndsm,fen,M,neigh]=await Promise.all([img(meta.files.ortho),img(meta.files.ndsm),img(meta.files.fences),treeModels(),neighbours(meta),addons().catch(()=>null)]);
  T.pildid=Math.round(t()-t0);t0=t();
  const outer=new THREE.Group(),G=new THREE.Group();outer.add(G);G.position.set(-f.lc[0],0,f.lc[1]);outer.rotation.y=-f.rot*Math.PI/180;outer.scale.setScalar(1/f.s);outer.position.set(f.mc[0],f.y0,-f.mc[1]);
  // naabrite ja maja jalajälgede mask (puud nendest välja)
  const W=ndsm.width,mk=document.createElement('canvas');mk.width=mk.height=W;const mx=mk.getContext('2d',{willReadFrequently:true}),px=2*R/W;mx.fillStyle=mx.strokeStyle='#fff';mx.lineWidth=2/px;
  const foot=(rings,dx,dy)=>rings.forEach(r=>{const P=ring2(r);mx.beginPath();P.forEach((q,k)=>{const a=(q[0]+dx+R)/px,b=(R-q[1]-dy)/px;k?mx.lineTo(a,b):mx.moveTo(a,b);});mx.closePath();mx.fill();mx.stroke();});
  foot(L.g||[],0,0);neigh.forEach(n=>foot(n.b.g,n.dx,n.dy));const MD=mx.getImageData(0,0,W,W).data,mask=new Uint8Array(W*W);for(let i=0;i<W*W;i++)mask[i]=MD[i*4+3]>10?1:0;
  const trees=treesFrom(ndsm,ortho,mask,R);T.puud=Math.round(t()-t0);t0=t();
  // maapind
  const gc=groundTex(ortho,L.g||[],trees,R,L.ridge||8),gt=new THREE.CanvasTexture(gc);gt.encoding=THREE.sRGBEncoding;gt.anisotropy=V.r.capabilities.getMaxAnisotropy();
  const det=grassDetail(),gm=new THREE.MeshStandardMaterial({map:gt,roughness:1,metalness:0});
  gm.onBeforeCompile=sh=>{sh.uniforms.uDet={value:det};sh.fragmentShader='uniform sampler2D uDet;\n'+sh.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\ndiffuseColor.rgb*=mix(1.,texture2D(uDet,vUv*90.).r*2.,.22);');};
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(160,160),gm);ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;ground.position.y=-.02;
  const far=new THREE.Mesh(new THREE.CircleGeometry(700,48),new THREE.MeshStandardMaterial({color:0x6E7D4A,roughness:1}));far.rotation.x=-Math.PI/2;far.position.y=-.08;far.receiveShadow=true;
  const grp={aed:new THREE.Group(),puud:new THREE.Group(),naabrid:new THREE.Group(),krunt:new THREE.Group()};grp.aed.add(ground,far);Object.values(grp).forEach(g=>G.add(g));
  T.maapind=Math.round(t()-t0);t0=t();
  // piirded
  const segs=fencesFrom(fen,R);if(segs.length){const pos=[];segs.forEach(([x0,y0,x1,y1])=>pos.push(x0,0,-y0,x1,0,-y1,x1,1.15,-y1,x0,0,-y0,x1,1.15,-y1,x0,1.15,-y0));
    const fg=new THREE.BufferGeometry();fg.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));fg.computeVertexNormals();const fm=new THREE.Mesh(fg,new THREE.MeshStandardMaterial({color:0x6b5a48,roughness:.9,side:THREE.DoubleSide}));fm.castShadow=true;grp.aed.add(fm);}
  // naabrid
  const wallM=new THREE.MeshStandardMaterial({color:0xE4E0DA,roughness:.95,side:THREE.DoubleSide}),roofM=new THREE.MeshStandardMaterial({color:0xB8B2AA,roughness:.85,side:THREE.DoubleSide});
  neigh.forEach(n=>grp.naabrid.add(building(n.b,n.dx,n.dy,wallM,roofM)));
  // krundi piir: katastriüksus, kuhu maja keskpunkt jääb
  const par=(meta.parcels||[]).find(p=>pip(0,0,ring2(p.g[0])))||null;
  if(par){const P=ring2(par.g[0]).map(q=>new THREE.Vector3(q[0],.08,-q[1]));const lg=new THREE.BufferGeometry().setFromPoints([...P,P[0]]);const ln=new THREE.Line(lg,new THREE.LineDashedMaterial({color:0xE5482D,dashSize:1.2,gapSize:.7,depthTest:true}));ln.computeLineDistances();grp.krunt.add(ln);}
  // puud: instantsid tüübi ja osa kaupa, kõrge/madal detail kauguse järgi
  const U={value:0},inst=[],byK={};trees.forEach((tr,k)=>{const kd=kindOf(tr,k);(byK[kd]=byK[kd]||[]).push(tr);});
  for(const [kd,list] of Object.entries(byK)){const md=M[kd];impostor(V.r,md);for(const lvl of ['hi','lo'])md[lvl].forEach(p=>{const mat=p.m.userData.imp?p.m:leafMat(p.m,kd==='birch',U);const im=new THREE.InstancedMesh(p.g,mat,list.length);
    // r128: setColorAt teeb puhvri praeguse count'i järgi -> loome täismahus enne count=0 (muidu tühi puhver ja WebGL ei joonista midagi)
    im.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(list.length*3).fill(1),3);
    im.castShadow=true;im.receiveShadow=!mat.userData.leaf;im.userData={kd,lvl,list,leaf:mat.userData.leaf};im.count=0;
    // lehekaartide vari lõikemaski järgi (muidu iga kaart heidab täisristküliku varju ja võra on must)
    if(mat.userData.leaf&&mat.map)im.customDepthMaterial=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,map:mat.map,alphaTest:.5});
    inst.push(im);grp.puud.add(im);});}
  const mtx=new THREE.Matrix4(),q=new THREE.Quaternion(),col=new THREE.Color(),camL=new THREE.Vector3();
  const lod=()=>{camL.copy(V.cam.position);G.worldToLocal(camL);const far=mob()?28:48;
    for(const im of inst){const {kd,lvl,list,leaf}=im.userData,md=M[kd];let n=0;list.forEach((tr,k)=>{const d=Math.hypot(camL.x-tr.x,camL.z+tr.y);if((lvl==='hi')!==(d<far))return;
      const sy=tr.h/md.h,sx=sy*Math.max(.85,Math.min(1.2,(tr.r/md.r)/sy));q.setFromAxisAngle(new THREE.Vector3(0,1,0),((tr.i*7919+tr.j*104729)%628)/100);
      mtx.compose(new THREE.Vector3(tr.x,-md.y0*sy,-tr.y),q,new THREE.Vector3(sx,sy,sx));im.setMatrixAt(n,mtx);
      if(leaf&&kd!=='birch'){const [r,g,b]=tr.col;col.setRGB(.78+r/255*.3,.78+g/255*.3,.78+b/255*.3);}else col.setRGB(1,1,1);im.setColorAt(n,col);n++;});
      im.count=n;im.instanceMatrix.needsUpdate=true;if(im.instanceColor)im.instanceColor.needsUpdate=true;}};
  lod();T.objektid=Math.round(t()-t0);
  V.sc.add(outer);
  // valgus: päike, taevas, udu, varjud; mõõtmine ka aias (maapind + naabrid)
  // aias: valgus päikesest + taevast (ruumi keskkonnavalgus lamendaks varjud ära)
  const hemi=V.sc.children.find(o=>o.isHemisphereLight);
  const st={env:V.sc.environment,hemi:hemi&&[hemi.intensity,hemi.color.getHex(),hemi.groundColor.getHex()],bg:V.sc.background,fog:V.sc.fog,catcher:V.catcher.visible,sunPos:V.sun.position.clone(),sunI:V.sun.intensity,far:V.cam.far,maxD:V.ct.maxDistance,shadow:V.sun.shadow.mapSize.x,cam:V.sun.shadow.camera.clone()};
  V.sc.environment=null;if(hemi){hemi.intensity=1.25;hemi.color.set(0xDDE8F5);hemi.groundColor.set(0x7A7860);}
  V.catcher.visible=false;const s=f.s,shadowR=80/s,sc=V.sun.shadow.camera;sc.left=sc.bottom=-shadowR;sc.right=sc.top=shadowR;sc.near=1/s;sc.far=400/s;sc.updateProjectionMatrix();
  const ms=mob()?1024:2048;if(V.sun.shadow.mapSize.x!==ms){V.sun.shadow.mapSize.set(ms,ms);if(V.sun.shadow.map){V.sun.shadow.map.dispose();V.sun.shadow.map=null;}}
  V.sun.shadow.bias=-.0004;V.sun.shadow.normalBias=.03/s;V.sun.shadow.radius=4;
  let sky=null;if(THREE.Sky){sky=new THREE.Sky();sky.scale.setScalar(4000/s);V.sc.add(sky);const SU=sky.material.uniforms;SU.turbidity.value=4;SU.rayleigh.value=1.4;SU.mieCoefficient.value=.004;SU.mieDirectionalG.value=.85;}
  else V.sc.background=new THREE.Color(0xCDD7DE);
  V.sc.fog=new THREE.Fog(0xC9D3DA,95/s,210/s);V.cam.far=Math.max(V.cam.far,5000/s);V.cam.updateProjectionMatrix();V.ct.maxDistance=Math.max(V.ct.maxDistance,150/s);
  const setTime=k=>{const p=sunAt(k),v=new THREE.Vector3(Math.sin(p.az)*Math.cos(p.el),Math.sin(p.el),-Math.cos(p.az)*Math.cos(p.el));
    // LOD2 raami suund mudeli raami (sobituse pööre)
    v.applyAxisAngle(new THREE.Vector3(0,1,0),-f.rot*Math.PI/180);
    if(sky)sky.material.uniforms.sunPosition.value.copy(v);V.sun.position.copy(v).multiplyScalar(160/s).add(V.sun.target.position);V.sun.intensity=k==='p'?4.6:3.2;V.sun.color.set(k==='o'?0xFFB98A:k==='h'?0xFFE2C0:0xFFF3E2);};
  setTime(m.gopt.time||'p');
  // ümbritsev varjutus (SAO/GTAO) jäetud välja: r128 SAOPass annab väljundi ilma sRGB teisenduseta ja lehekaardid täisristkülikutena (vt SETUP: three uuendus)
  // tuul + LOD (kaamera liikudes)
  let last='';V.tick=()=>{U.value=performance.now()/1000;const k=V.cam.position.toArray().map(v=>v.toFixed(1)).join();if(k!==last){last=k;lod();}};
  V.gpick=[ground,grp.naabrid];
  const vis=()=>{for(const k in grp)grp[k].visible=m.gopt[k]!==false;};vis();
  // kaamera: aed nähtavale
  const sp=new THREE.Sphere(new THREE.Vector3(),0);new THREE.Box3().setFromObject(V.model).getBoundingSphere(sp);const dir=V.cam.position.clone().sub(V.ct.target);dir.y=0;dir.normalize();dir.y=.62;dir.normalize();
  V.cam.position.copy(V.ct.target).addScaledVector(dir,Math.max(sp.radius*4.4,50/s));V.ct.update();
  const off=()=>{V.sc.environment=st.env;if(hemi&&st.hemi){hemi.intensity=st.hemi[0];hemi.color.set(st.hemi[1]);hemi.groundColor.set(st.hemi[2]);}V.sc.remove(outer);if(sky)V.sc.remove(sky);V.sc.background=st.bg;V.sc.fog=st.fog;V.catcher.visible=st.catcher;V.sun.position.copy(st.sunPos);V.sun.intensity=st.sunI;V.sun.color.set(0xffffff);
    Object.assign(sc,{left:st.cam.left,right:st.cam.right,top:st.cam.top,bottom:st.cam.bottom,near:st.cam.near,far:st.cam.far});sc.updateProjectionMatrix();V.cam.far=st.far;V.cam.updateProjectionMatrix();V.ct.maxDistance=st.maxD;
    V.tick=null;V.gpick=null;outer.traverse(o=>{if(o.geometry)o.geometry.dispose();});gt.dispose();det.dispose();};
  return {off,vis,setTime,trees,parcel:par,neighbours:neigh.length,fences:segs.length};}
async function neighbours(meta){const [cx,cy]=meta.c,K=new Set();for(const dx of [-80,80])for(const dy of [-80,80])K.add(Math.floor((cx+dx)/250)+'_'+Math.floor((cy+dy)/250));
  const tiles=await Promise.all([...K].map(k=>GV.cache.get(k)||(GV.cache.set(k,fetch('data/lod2/geo/'+k+'.json').then(r=>r.ok?r.json():{}).catch(()=>({}))),GV.cache.get(k))));
  const out=[];tiles.forEach(T=>Object.entries(T).forEach(([e,b])=>{if(e===meta.ehr)return;const dx=b.c[0]-cx,dy=b.c[1]-cy;if(Math.hypot(dx,dy)<78)out.push({e,b,dx,dy});}));return out;}

window.V3DGarden={show,sunAt,kindOf,treesFrom,fencesFrom,NDSM};
})();
