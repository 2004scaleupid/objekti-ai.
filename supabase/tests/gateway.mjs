// Testvärav: matkib Supabase'i (REST -> PostgREST, auth, storage, functions) ja väliseid teenuseid (Kie, Resend, Anthropic, Stripe, EHR)
import {jwt as _j} from './keys.mjs';
import http from 'node:http';import crypto from 'node:crypto';import fs from 'node:fs';import {execFileSync} from 'node:child_process';
export const SECRET='super-secret-jwt-token-with-at-least-32-characters-long';
const b64u=b=>Buffer.from(b).toString('base64url');
export function jwt(payload){const h=b64u(JSON.stringify({alg:'HS256',typ:'JWT'})),p=b64u(JSON.stringify({iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,...payload}));return h+'.'+p+'.'+crypto.createHmac('sha256',SECRET).update(h+'.'+p).digest('base64url');}
function verify(t){try{const [h,p,s]=t.split('.');if(crypto.createHmac('sha256',SECRET).update(h+'.'+p).digest('base64url')!==s)return null;return JSON.parse(Buffer.from(p,'base64url'));}catch{return null}}
const PORT=54321,FN={ 'ai-image':8101,'ai-chat':8102,'widget':8103,'widget-lead':8104,'widget-place':8105,'ehr':8106,'checkout':8107,'stripe-webhook':8108};
const STORE=new Map(),LOG=[];const BUCKETS={uploads:['image/jpeg','image/png','image/webp'],renders:['image/jpeg','image/png','image/webp'],products:['image/jpeg','image/png','image/webp']};
const IMG=fs.readFileSync('/home/claude/viimsi/render.jpg');let task=0;const TASKS={};
const read=req=>new Promise(r=>{const c=[];req.on('data',d=>c.push(d));req.on('end',()=>r(Buffer.concat(c)));});
const send=(res,code,obj,type='application/json')=>{res.writeHead(code,{'content-type':type,'access-control-allow-origin':'*'});res.end(Buffer.isBuffer(obj)||typeof obj==='string'?obj:JSON.stringify(obj));};
function proxy(req,res,body,port,path){const r=http.request({host:'127.0.0.1',port,path,method:req.method,headers:{...req.headers,host:'127.0.0.1:'+port,'content-length':body.length}},pr=>{res.writeHead(pr.statusCode,pr.headers);pr.pipe(res);});r.on('error',e=>send(res,502,{error:'proxy '+e.message}));r.end(body);}
http.createServer(async(req,res)=>{const u=new URL(req.url,'http://x'),p=u.pathname,body=await read(req);
  try{
  if(p.startsWith('/rest/v1/'))return proxy(req,res,body,3001,req.url.slice(8));
  // GoTrue (Supabase Auth) matkimine: registreerimine, sisselogimine, värskendus
  const PW=globalThis.PW||(globalThis.PW={});
  const sess=(u)=>{const at=jwt({sub:u.id,email:u.email,role:'authenticated',aud:'authenticated'});const user={id:u.id,email:u.email,aud:'authenticated',role:'authenticated',user_metadata:u.meta||{},app_metadata:{provider:'email'},created_at:new Date().toISOString()};return{access_token:at,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'r_'+u.id,user};};
  if(p==='/auth/v1/signup'&&req.method==='POST'){const j=JSON.parse(body);if(PW[j.email])return send(res,422,{code:422,msg:'User already registered',error_code:'user_already_exists'});const id=crypto.randomUUID();
    execFileSync('psql',['-h','/var/tmp/v3dpg','-p','5499','-U','postgres','-d','v3d','-qc',`insert into auth.users(id,email,raw_user_meta_data) values ('${id}','${j.email.replace(/'/g,"''")}','${JSON.stringify(j.data||{}).replace(/'/g,"''")}')`]);
    PW[j.email]={id,email:j.email,pw:j.password,meta:j.data};LOG.push(['signup',j.email]);return send(res,200,sess(PW[j.email]));}
  if(p==='/auth/v1/token'){const j=JSON.parse(body||'{}');if(u.searchParams.get('grant_type')==='password'){const x=PW[j.email];if(!x||x.pw!==j.password)return send(res,400,{error:'invalid_grant',error_description:'Invalid login credentials'});return send(res,200,sess(x));}
    if(u.searchParams.get('grant_type')==='refresh_token'){const x=Object.values(PW).find(v=>'r_'+v.id===j.refresh_token);if(!x)return send(res,400,{error:'invalid_grant'});return send(res,200,sess(x));}}
  if(p==='/auth/v1/logout')return send(res,204,'');
  if(p==='/auth/v1/recover')return send(res,200,{});
  if(p==='/auth/v1/user'&&req.method==='PUT'){const c=verify((req.headers.authorization||'').replace(/^Bearer /,''));const x=Object.values(PW).find(v=>v.id===c?.sub);const j=JSON.parse(body);if(x&&j.password)x.pw=j.password;return send(res,200,{id:c?.sub,email:c?.email});}
  if(p==='/auth/v1/user'){const t=(req.headers.authorization||'').replace(/^Bearer /,''),c=verify(t);if(!c||!c.sub)return send(res,401,{message:'invalid'});return send(res,200,{id:c.sub,email:c.email,aud:'authenticated',role:'authenticated'});}
  let m;
  if((m=p.match(/^\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/))){return send(res,200,{signedURL:`/object/sign/${m[1]}/${m[2]}?token=t`});}
  if((m=p.match(/^\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/))){const k=m[1]+'/'+decodeURIComponent(m[2]);if(!STORE.has(k))return send(res,404,{error:'nf'});return send(res,200,STORE.get(k).b,STORE.get(k).t);}
  if((m=p.match(/^\/storage\/v1\/object\/([^/]+)\/(.+)$/))&&(req.method==='POST'||req.method==='PUT')){let t=(req.headers['content-type']||'').split(';')[0];let bodyB=body;
    if(t==='multipart/form-data'){const bd='--'+req.headers['content-type'].split('boundary=')[1];const parts=body.toString('latin1').split(bd);const fp=parts.find(x=>/content-type:\s*image\//i.test(x)&&/filename=|name=""/i.test(x))||parts.find(x=>/content-type:/i.test(x));if(fp){const hdr=fp.slice(0,fp.indexOf('\r\n\r\n'));t=(hdr.match(/content-type:\s*([^\r\n;]+)/i)||[])[1]||'';bodyB=Buffer.from(fp.slice(fp.indexOf('\r\n\r\n')+4,-2),'latin1');}}
    // RLS kontroll: kasutaja võib kirjutada ainult oma firma kausta (päris Supabase'is teeb seda storage.objects poliitika)
    const c=verify((req.headers.authorization||'').replace(/^Bearer /,''));if(c&&c.role==='authenticated'){const cid=execFileSync('psql',['-h','/var/tmp/v3dpg','-p','5499','-U','postgres','-d','v3d','-tAqc',`select company_id from profiles where user_id='${c.sub}'`],{encoding:'utf8'}).trim();if(m[1]==='renders'||decodeURIComponent(m[2]).split('/')[0]!==cid)return send(res,403,{error:'rls'});}if(!BUCKETS[m[1]]?.includes(t))return send(res,400,{error:'mime '+t});STORE.set(m[1]+'/'+decodeURIComponent(m[2]),{b:bodyB,t});LOG.push(['upload',m[1],m[2],bodyB.length]);return send(res,200,{Key:m[1]+'/'+m[2]});}
  if((m=p.match(/^\/functions\/v1\/([a-z-]+)$/))){if(!FN[m[1]])return send(res,404,{error:'no fn'});return proxy(req,res,body,FN[m[1]],'/'+m[1]+u.search);}
  // väliste teenuste matkimine
  if(p==='/kie/api/v1/jobs/createTask'){const j=JSON.parse(body);LOG.push(['kie',j.model,j.input.prompt.slice(0,60),(j.input.image_input||j.input.image_urls||[]).length]);const id='t'+(++task);TASKS[id]=/FAILME/.test(j.input.prompt)?'fail':'success';return send(res,200,{code:200,data:{taskId:id}});}
  if(p==='/kie/api/v1/jobs/recordInfo'){const id=u.searchParams.get('taskId');return send(res,200,{data:{state:TASKS[id],failMsg:'test fail',resultJson:JSON.stringify({resultUrls:['http://127.0.0.1:'+PORT+'/mockimg.jpg']})}});}
  if(p==='/mockimg.jpg')return send(res,200,IMG,'image/jpeg');
  if(p==='/resend/emails'){LOG.push(['mail',JSON.parse(body)]);return send(res,200,{id:'m1'});}
  if(p==='/anthropic/v1/messages'){const j=JSON.parse(body);LOG.push(['claude',j.model,j.system.length,j.messages.length]);return send(res,200,{content:[{type:'text',text:'Katus ~120 m².'}]});}
  if(p==='/stripe/v1/checkout/sessions'){const f=new URLSearchParams(body.toString());LOG.push(['stripe',Object.fromEntries(f)]);return send(res,200,{id:'cs_x',url:'https://checkout.stripe.com/c/cs_x'});}
  if(p.startsWith('/ehr/api/building'))return send(res,200,{esmaneKasutus:'1999',maxKorrusteArv:'2',kaosIdTxt:'Üksikelamu',x:[{klNimetus:'Välisseina liik',nimetus:'puit'}]});
  if(p==='/_log'){if(req.method==='DELETE')LOG.length=0;return send(res,200,LOG);}
  send(res,404,{error:'gateway: '+p});}catch(e){send(res,500,{error:String(e)});}
}).listen(PORT,()=>console.log('gateway',PORT));
