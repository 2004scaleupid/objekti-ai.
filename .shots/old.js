window.lod2MeshOld=function(L){const g=new THREE.Group(),EM=new THREE.LineBasicMaterial({color:0x2a2622,transparent:true,opacity:.35}),
  RM=new THREE.MeshStandardMaterial({color:0xA39A8F,roughness:.85,side:THREE.DoubleSide}),WM=new THREE.MeshStandardMaterial({color:0xF4F2EE,roughness:.92,side:THREE.DoubleSide});
  const add=(P,mat)=>{if(P.length<3)return;const n=new THREE.Vector3();P.forEach((a,k)=>{const b=P[(k+1)%P.length];n.x+=(a.y-b.y)*(a.z+b.z);n.y+=(a.z-b.z)*(a.x+b.x);n.z+=(a.x-b.x)*(a.y+b.y);});
    const ax=Math.abs(n.x),ay=Math.abs(n.y),az=Math.abs(n.z),[u,w]=ax>=ay&&ax>=az?['y','z']:ay>=az?['x','z']:['x','y'];
    const geo=new THREE.BufferGeometry().setFromPoints(P);geo.setIndex(THREE.ShapeUtils.triangulateShape(P.map(p=>new THREE.Vector2(p[u],p[w])),[]).flat());geo.computeVertexNormals();
    const m=new THREE.Mesh(geo,mat);m.castShadow=m.receiveShadow=true;g.add(m,new THREE.LineSegments(new THREE.EdgesGeometry(geo,20),EM));};
  const V3=f=>{const P=[];for(let i=0;i+2<f.length;i+=3)P.push(new THREE.Vector3(f[i],f[i+2],-f[i+1]));return P;};
  (L.f||[]).forEach(f=>add(V3(f[3]),RM));(L.w||[]).forEach(w=>add(V3(w[2]),WM));
  (L.g||[]).forEach(r=>{const P=[];for(let i=0;i+1<r.length;i+=2)P.push(new THREE.Vector3(r[i],0,-r[i+1]));add(P,WM);});
  /* seinad: LOD2-s pole seinapindu, ainult põhiplaan + katus. Iga põhiplaani serva sein maast katuse servani (viilud kaasa), et katus ei hõljuks */
  // seina ülaserv = LOD2 katuse kõrgus 5 cm seina sees (iga 25 cm + katuse nurkade kohal). Varem ühendati servale lähimad katuse
  // nurgad (ka kõrgemate osade omad) -> sein läbis katust kuni 3,5 m (Pärnu Rüütli 25). Katuseta kohas räästa kõrgus.
  const RV=[];(L.f||[]).forEach(f=>{const c=f[3];for(let i=0;i+2<c.length;i+=3)RV.push([c[i],c[i+1],c[i+2]]);});
  const EV=+L.eave>0?+L.eave:(RV.length?Math.min(...RV.map(p=>p[2])):3);
  const RF=(L.f||[]).map(f=>{const c=f[3],R=[];for(let i=0;i+2<c.length;i+=3)R.push([c[i],c[i+1],c[i+2]]);let nx=0,ny=0,nz=0;
    R.forEach((p,k)=>{const q=R[(k+1)%R.length];nx+=(p[1]-q[1])*(p[2]+q[2]);ny+=(p[2]-q[2])*(p[0]+q[0]);nz+=(p[0]-q[0])*(p[1]+q[1]);});return {R,xy:R.map(p=>[p[0],p[1]]),nx,ny,nz};}).filter(f=>Math.abs(f.nz)>1e-6);
  const roofZ=(x,y)=>{let z=null;for(const f of RF){if(!pip([x,y],f.xy))continue;const v=f.R[0][2]-(f.nx*(x-f.R[0][0])+f.ny*(y-f.R[0][1]))/f.nz;if(z==null||v>z)z=v;}return z;};
  if(!(L.w&&L.w.length))(L.g||[]).forEach(r=>{const Q=[];for(let i=0;i+1<r.length;i+=2)Q.push([r[i],r[i+1]]);
    let sa=0;Q.forEach((p,k)=>{const q=Q[(k+1)%Q.length];sa+=p[0]*q[1]-q[0]*p[1];});const sg=sa>0?1:-1;
    Q.forEach((a,k)=>{const b=Q[(k+1)%Q.length],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);if(len<.05)return;
      const nx=-dy/len*sg*.05,ny=dx/len*sg*.05,ts=new Set([0,1]);for(let d=.25;d<len;d+=.25)ts.add(d/len);
      RV.forEach(p=>{const t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(len*len);if(t>0&&t<1&&Math.abs((p[0]-a[0])*dy-(p[1]-a[1])*dx)/len<1.5)ts.add(t);});
      const T=[...ts].sort((x,y)=>x-y).map(t=>{const z=roofZ(a[0]+dx*t+nx,a[1]+dy*t+ny);return [t,z==null?EV:z];});
      const P=[new THREE.Vector3(a[0],0,-a[1]),new THREE.Vector3(b[0],0,-b[1])];
      for(let i=T.length-1;i>=0;i--)P.push(new THREE.Vector3(a[0]+dx*T[i][0],Math.max(.3,T[i][1]),-(a[1]+dy*T[i][0])));
      add(P,WM);});});
  return g;}
