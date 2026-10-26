// Vidina teenused serveris: teenuste valik, vaba idee (kohe/kinnitusega), 3D-mudel fotodest (kohe + kinnitusega), hinnad ja piirangud
import fs from 'fs';import { execFileSync } from 'child_process';import { ANON } from '/var/tmp/h/keys.mjs';
const G='http://127.0.0.1:54321';const sql=q=>execFileSync('psql',['-h','/var/tmp/v3dpg','-p','5499','-U','postgres','-d','v3d','-tAq','-c',q],{encoding:'utf8'}).trim();
let pass=0,fails=[];const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fails.push(n);console.log('  ✗',n,x!==undefined?JSON.stringify(x).slice(0,500):'');}};
const api=async(path,body,tok,method='POST',ip='6.6.6.6')=>{const r=await fetch(G+path,{method,headers:{'Content-Type':'application/json',apikey:ANON,Authorization:'Bearer '+(tok||ANON),'cf-connecting-ip':ip,Prefer:'return=representation'},body:body?JSON.stringify(body):undefined});return {s:r.status,j:await r.json().catch(()=>null)};};
const log=async()=>(await (await fetch(G+'/_log')).json());
const S=(await api('/auth/v1/signup',{email:'teenus@firma.ee',password:'parool123',data:{name:'Teenuse Mees',company:'Teenused OÜ'}})).j;const T=S.access_token;
const cid=sql(`select company_id from profiles where email='teenus@firma.ee'`);const wid=sql(`select public_id from widgets where company_id='${cid}'`);
sql(`insert into credit_ledger(company_id,delta,kind,label) values ('${cid}',100,'purchase','test')`);
const bal=()=>+sql(`select coalesce(sum(delta),0) from credit_ledger where company_id='${cid}'`);const B0=bal();
const price=k=>+sql(`select price_${k} from settings where id=1`);
const photo='data:image/jpeg;base64,'+fs.readFileSync('maja.jpg').toString('base64');
const lead=async(email,ip)=>(await api('/functions/v1/widget-lead',{id:wid,name:'Kati Klient',email,address:'Kase 1, Viimsi',pending_image:true},null,'POST',ip)).j;

console.log('== Teenuste valik ==');
let r=await api('/rest/v1/widgets?company_id=eq.'+cid,{features:'house,kuu'},T,'PATCH');ok(r.s>=400,'tundmatu teenus keelatud',r.s);
r=await api('/rest/v1/widgets?company_id=eq.'+cid,{features:'house',place_opts:{mode:'instant',lead_first:true,per_customer:3}},T,'PATCH');ok(r.s<300,'ainult maja');
let L=await lead('a@klient.ee');
r=await api('/functions/v1/widget-place',{id:wid,kind:'idea',photo,note:'uus terrass',lead_tok:L.tok});ok(r.s===404,'vaba idee keelatud, kui firma seda ei paku',r);
r=await api('/functions/v1/ai-3d',{widget:wid,lead_tok:L.tok,action:'check',subject:'object',photos:[photo]});ok(r.s===404,'3D keelatud, kui firma seda ei paku',r);
r=await api('/rest/v1/widgets?company_id=eq.'+cid,{features:'house,house3d,idea,model3d'},T,'PATCH');ok(r.s<300,'firma valib maja + fotod, vaba idee, 3D-mudel',r);
const Wc=(await api('/functions/v1/widget?id='+wid,null,null,'GET')).j;ok(Wc.features==='house,house3d,idea,model3d','vidin annab teenused',Wc.features);
ok(bal()===B0,'päring fotodega ei maksa (pending_image)',[B0,bal()]);

console.log('== Vaba idee ==');
r=await api('/functions/v1/widget-place',{id:wid,kind:'idea',photo,note:'x',lead_tok:L.tok});ok(r.s===400,'kirjeldus on kohustuslik',r);
await fetch(G+'/_log',{method:'DELETE'});let b0=bal();
r=await api('/functions/v1/widget-place',{id:wid,kind:'idea',photo,note:'uus terrass maja ette',lead_tok:L.tok});
ok(r.s===200&&/^https:/.test(r.j.url),'vaba idee: pilt kohe',r);
ok(Math.abs(b0-bal()-price('design'))<1e-9,'firmalt võeti Toode pildile hind ('+price('design')+')',b0-bal());
const kie=(await log()).filter(x=>x[0]==='kie');ok(kie.length===1&&kie[0][3]===1,'AI sai ainult kliendi foto',kie);
ok(sql(`select kind||'|'||(items->0->>'name') from widget_requests where company_id='${cid}' order by created_at desc limit 1`)==='idea|Vaba idee','pildisoov on firma nimekirjas (vaba idee)');
ok((await log()).some(x=>x[0]==='mail'&&/ideed/.test(x[1].html)),'firma sai e-kirja');
await api('/rest/v1/widgets?company_id=eq.'+cid,{place_opts:{mode:'review',lead_first:true,per_customer:3}},T,'PATCH');
r=await api('/functions/v1/widget-place',{id:wid,kind:'idea',photo,note:'punane katus',lead_tok:L.tok});ok(r.s===200&&r.j.review===true&&!r.j.url,'kinnitusega: klient pilti kohe ei näe',r);

console.log('== 3D-mudel, kinnitusega (fotod firmale) ==');
let L2=await lead('b@klient.ee','7.7.7.7');b0=bal();
r=await api('/functions/v1/ai-3d',{widget:wid,lead_tok:L2.tok,action:'check',subject:'object',photos:[photo]},null,'POST','7.7.7.7');ok(r.s===400,'kinnitusega režiimis AI mudelit kohe ei tee',r);
r=await api('/functions/v1/ai-3d',{widget:wid,action:'submit',subject:'object',photos:[photo,photo]},null,'POST','7.7.7.7');ok(r.s===400,'ilma päringuta fotosid ei võeta',r);
r=await api('/functions/v1/ai-3d',{widget:wid,lead_tok:L2.tok,action:'submit',subject:'building',photos:[photo,photo]},null,'POST','7.7.7.7');ok(r.s===400&&/4 fotot/.test(r.j.error),'maja vajab 4 fotot',r);
r=await api('/functions/v1/ai-3d',{widget:wid,lead_tok:L2.tok,action:'submit',subject:'object',photos:[photo,photo]},null,'POST','7.7.7.7');ok(r.s===200&&r.j.review,'fotod saadetud firmale',r);
ok(bal()===b0,'krediiti ei võetud (firma teeb mudeli ise)',b0-bal());
const wr=sql(`select kind||'|'||mode||'|'||status||'|'||array_length(photos,1) from widget_requests where company_id='${cid}' order by created_at desc limit 1`);ok(wr==='3d|review|ready|2','3D-soov firma nimekirjas fotodega',wr);

console.log('== 3D-mudel, kohe ==');
await api('/rest/v1/widgets?company_id=eq.'+cid,{place_opts:{mode:'instant',lead_first:true,per_customer:3}},T,'PATCH');
let L3=await lead('c@klient.ee','8.8.8.8');b0=bal();
r=await api('/functions/v1/ai-3d',{widget:wid,lead_tok:L3.tok,action:'check',subject:'object',photos:[photo,photo]},null,'POST','8.8.8.8');ok(r.s===200&&r.j.ok&&r.j.token,'fotokontroll',r);
const tok=r.j.token;
r=await api('/functions/v1/ai-3d',{widget:wid,lead_tok:L3.tok,subject:'object',photos:[photo],check:tok},null,'POST','8.8.8.8');ok(r.s===409,'kontroll seotud täpselt nende fotodega',r);
r=await api('/functions/v1/ai-3d',{widget:wid,lead_tok:L3.tok,subject:'object',photos:[photo,photo],check:tok},null,'POST','8.8.8.8');ok(r.s===200&&r.j.id,'mudel alustatud',r);
const rid=r.j.id;ok(Math.abs(b0-bal()-price('3d'))<1e-9,'firmalt võeti 3D hind ('+price('3d')+')',b0-bal());
ok(sql(`select via_widget from renders where id='${rid}'`)==='t','render on vidinast');
r=await api('/functions/v1/ai-3d',{widget:wid,action:'status',id:rid});ok(r.s===200&&r.j.status==='done'&&/\.glb/.test(r.j.url),'mudel valmis',r);
const wr3=sql(`select status||'|'||(result_url like '%.glb') from widget_requests where render_id='${rid}'`);ok(wr3==='sent|true','pildisoov saadetud koos mudeliga',wr3);
ok((await log()).some(x=>x[0]==='mail'&&/3D-mudel/.test(x[1].html)&&/#m=/.test(x[1].html)),'firma sai e-kirja mudeli lingiga');
r=await api('/functions/v1/ai-3d',{widget:wid,action:'status',id:sql(`select id from renders where company_id<>'${cid}' and kind='3d' limit 1`)||'00000000-0000-0000-0000-000000000000'});ok(r.s===404,'teise firma tööd ei näe');
// limiit: sama klient 2 mudelit nädalas
r=await api('/functions/v1/ai-3d',{widget:wid,lead_tok:L3.tok,action:'check',subject:'object',photos:[photo]},null,'POST','8.8.8.8');const t2=r.j.token;
r=await api('/functions/v1/ai-3d',{widget:wid,lead_tok:L3.tok,subject:'object',photos:[photo],check:t2},null,'POST','8.8.8.8');ok(r.s===200,'teine mudel lubatud',r);
r=await api('/functions/v1/ai-3d',{widget:wid,lead_tok:L3.tok,action:'check',subject:'object',photos:[photo,photo,photo]},null,'POST','8.8.8.8');const t3=r.j.token;
r=await api('/functions/v1/ai-3d',{widget:wid,lead_tok:L3.tok,subject:'object',photos:[photo,photo,photo],check:t3},null,'POST','8.8.8.8');ok(r.s===429,'kolmas mudel samalt kliendilt keelatud',r);

console.log('== Firma saadab 3D-mudeli kliendile ==');
const rq=sql(`select id from widget_requests where company_id='${cid}' and kind='3d' and mode='review' limit 1`);
r=await api('/functions/v1/widget-send',{request_id:rq,url:'https://x.supabase.co/storage/v1/object/public/renders/'+cid+'/x.jpg'},T);ok(r.s===400||r.s===200,'pildi url 3D-soovil',r.s);
const murl=sql(`select output_url from renders where id='${rid}'`);
r=await api('/functions/v1/widget-send',{request_id:rq,url:murl},T);ok(r.s===200&&/#m=/.test(r.j.link),'3D-mudeli link kliendile',r);
r=await api('/functions/v1/widget-send',{request_id:rq,url:murl.replace(cid,'00000000-0000-0000-0000-000000000000')},T);ok(r.s===400,'võõra firma mudelit saata ei saa',r);

console.log(`\nKOKKU: ${pass} läbi, ${fails.length} ebaõnnestus`);fails.forEach(f=>console.log(' -',f));process.exit(fails.length?1:0);
