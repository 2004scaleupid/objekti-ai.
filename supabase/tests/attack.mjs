// Vaade3D rünnaku- ja integratsioonitestid päris Postgres + PostgREST + Edge Functions vastu
import { execFileSync } from 'node:child_process';import crypto from 'node:crypto';import fs from 'node:fs';
import { jwt, ANON, SERVICE } from './keys.mjs';
const G='http://127.0.0.1:54321';
const sql=q=>execFileSync('psql',['-h','/var/tmp/v3dpg','-p','5499','-U','postgres','-d','v3d','-tAq','-c',q],{encoding:'utf8'}).trim();
let pass=0,failN=0;const FAILS=[];
function ok(cond,name,extra){if(cond){pass++;console.log('  ✓',name);}else{failN++;FAILS.push(name);console.log('  ✗',name,extra!==undefined?JSON.stringify(extra).slice(0,300):'');}}
async function rest(tok,method,path,body,headers={}){const r=await fetch(G+'/rest/v1'+path,{method,headers:{apikey:ANON,Authorization:'Bearer '+tok,'Content-Type':'application/json',Prefer:'return=representation',...headers},body:body?JSON.stringify(body):undefined});let j=null;try{j=await r.json();}catch{}return{s:r.status,j};}
const rpc=(tok,fn,args)=>rest(tok,'POST','/rpc/'+fn,args||{});
async function fn(name,body,tok,{ip='1.1.1.1',method}={}){const h={'Content-Type':'application/json',apikey:ANON,'cf-connecting-ip':ip};if(tok)h.Authorization='Bearer '+tok;const r=await fetch(G+'/functions/v1/'+name+(method==='GET'&&body?body:''),{method:method||'POST',headers:h,body:method==='GET'?undefined:JSON.stringify(body)});let j=null;try{j=await r.json();}catch{}return{s:r.status,j};}
const log=async()=>(await fetch(G+'/_log')).json();const clearLog=()=>fetch(G+'/_log',{method:'DELETE'});
function user(email,meta){const id=crypto.randomUUID();sql(`insert into auth.users(id,email,raw_user_meta_data) values ('${id}','${email}','${JSON.stringify(meta).replace(/'/g,"''")}')`);return{id,email,tok:jwt({sub:id,email,role:'authenticated'})};}
const cidOf=u=>sql(`select company_id from profiles where user_id='${u.id}'`);
const bal=u=>+sql(`select coalesce(sum(delta),0) from credit_ledger where company_id='${cidOf(u)}'`);
const IMG='data:image/jpeg;base64,'+fs.readFileSync('/home/claude/viimsi/render.jpg').toString('base64');

console.log('\n== Liitumine ja müüja ==');
const S=user('max@seller.ee',{name:'Max Mets',company:'Max OÜ'});
let r=await rpc(S.tok,'become_seller',{p_code:'VAADE3D'});ok(r.s===200&&/^MAX\d{4}$/.test(r.j),'müüja kood tehakse serveris (ei saa valida VAADE3D)',r);const CODE=r.j;
r=await rpc(S.tok,'become_seller',{});ok(r.j===CODE,'teine kord sama kood');
r=await rpc(ANON,'become_seller',{});ok(r.s>=400,'anon ei saa müüjaks',r.s);
r=await rpc(ANON,'ref_code_ok',{p_code:CODE.toLowerCase()});ok(r.j===true,'koodi kontroll töötab');
const A=user('mari@katus.ee',{name:'Mari',company:'Katus OÜ',ref:CODE});
const B=user('teine@firma.ee',{name:'Teine',company:'Teine OÜ'});
ok(bal(A)===30&&sql(`select promo_left from companies where id='${cidOf(A)}'`)==='20','uus firma: 30 krediiti ja 20 soodustusega kasutust');
ok(sql(`select count(*) from widgets where company_id='${cidOf(A)}'`)==='1','vidin luuakse liitumisel');
const big=user('x@y.ee',{company:'X'.repeat(5000),name:'Y'.repeat(5000)});ok(sql(`select length(name) from companies where id='${cidOf(big)}'`)==='120','liiga pikk firma nimi lõigatakse');

console.log('\n== Otse andmebaasi ründamine (sisselogitud firma A) ==');
const cA=cidOf(A),cB=cidOf(B);
r=await rest(A.tok,'POST','/credit_ledger',{company_id:cA,delta:1000,kind:'admin'});ok(r.s>=400,'ei saa endale krediite lisada',r.s);
r=await rest(A.tok,'PATCH',`/credit_ledger?company_id=eq.${cA}`,{delta:999});ok(r.s>=400||(Array.isArray(r.j)&&!r.j.length),'ei saa kulusid muuta',r);
r=await rest(A.tok,'DELETE',`/credit_ledger?company_id=eq.${cA}`);ok(r.s>=400||(Array.isArray(r.j)&&!r.j.length),'ei saa kulusid kustutada',r);
ok(bal(A)===30,'saldo ei muutunud');
r=await rest(A.tok,'PATCH',`/companies?id=eq.${cA}`,{promo_left:999});ok(r.s>=400,'ei saa soodustust juurde panna',r.s);
r=await rest(A.tok,'PATCH',`/companies?id=eq.${cA}`,{partner_code:'MUU1'});ok(r.s>=400,'ei saa müüja koodi muuta',r.s);
r=await rest(A.tok,'PATCH',`/companies?id=eq.${cA}`,{phone:'5555'});ok(r.s===200&&r.j[0]?.phone==='5555','oma telefoni saab muuta');
r=await rest(A.tok,'PATCH',`/companies?id=eq.${cA}`,{logo_url:'x" onerror="alert(1)'});ok(r.s>=400,'logo URL peab olema meie failihoidlast',r.s);
r=await rest(A.tok,'PATCH',`/companies?id=eq.${cB}`,{name:'Häkitud'});ok(Array.isArray(r.j)&&!r.j.length,'teise firma andmeid ei saa muuta',r);
r=await rest(A.tok,'GET',`/companies?id=eq.${cB}`);ok(Array.isArray(r.j)&&!r.j.length,'teise firma andmeid ei näe');
r=await rest(A.tok,'GET',`/credit_ledger?company_id=eq.${cB}`);ok(Array.isArray(r.j)&&!r.j.length,'teise firma kulusid ei näe');
r=await rest(A.tok,'PATCH',`/profiles?user_id=eq.${A.id}`,{is_admin:true});ok(r.s>=400,'ei saa endale admini õigust',r.s);
r=await rest(A.tok,'PATCH',`/profiles?user_id=eq.${A.id}`,{company_id:cB});ok(r.s>=400,'ei saa end teise firma alla tõsta',r.s);
r=await rest(A.tok,'PATCH','/settings?id=eq.1',{price_obj:0,welcome_credits:999999});ok(r.s>=400||(Array.isArray(r.j)&&!r.j.length),'hindu ei saa muuta',r);
ok(sql('select price_obj from settings')==='10','hind on endiselt 10');
r=await rpc(A.tok,'spend_credits',{p_company:cB,p_kind:'obj',p_label:'x'});ok(r.s>=400,'ei saa teise firma krediite kulutada',r.s);
r=await rpc(A.tok,'refund_credits',{p_ref:'x'});ok(r.s>=400,'tagastust ei saa ise kutsuda',r.s);
r=await rpc(A.tok,'rate_hit',{p_key:'x',p_max:1,p_window_sec:1});ok(r.s>=400,'piirangu loendurit ei saa ise muuta',r.s);
r=await rpc(A.tok,'spend_my_credits',{p_kind:'obj',p_label:'x'});ok(r.s>=400,'vana kulufunktsioon on suletud',r.s);
r=await rest(A.tok,'POST','/objects',{company_id:cA,ehr:'120656418',address:'Tasuta'});ok(r.s>=400,'objekti ei saa luua ilma maksmata',r.s);
r=await rest(A.tok,'POST','/leads',{company_id:cA,name:'x',email:'x@x.ee',address:'x'});ok(r.s>=400,'päringuid ei saa ise lisada',r.s);
r=await rest(A.tok,'POST','/renders',{company_id:cA,kind:'pic'});ok(r.s>=400,'pilte ei saa ise lisada',r.s);
r=await rest(A.tok,'POST','/widgets',{company_id:cA});ok(r.s>=400,'vidinat ei saa ise juurde teha',r.s);
r=await rest(A.tok,'PATCH',`/widgets?company_id=eq.${cA}`,{public_id:sql(`select public_id from widgets where company_id='${cB}'`)});ok(r.s>=400,'vidina avalikku ID-d ei saa muuta',r.s);
r=await rest(A.tok,'PATCH',`/widgets?company_id=eq.${cA}`,{title:'Tere',daily_lead_cap:10});ok(r.s===200&&r.j[0]?.title==='Tere','vidina seadeid saab muuta');
r=await rest(A.tok,'PATCH',`/widgets?company_id=eq.${cA}`,{webhook_url:'javascript:alert(1)'});ok(r.s>=400,'webhook peab olema https',r.s);
r=await rest(A.tok,'POST','/products',{company_id:cA,name:'Telk',images:['https://evil.com/x.jpg']});ok(r.s>=400,'toote pilt peab olema meie failihoidlast',r.s);
r=await rest(A.tok,'POST','/products',{company_id:cA,name:'Telk',images:[],link:'javascript:alert(1)'});ok(r.s>=400,'toote link ei tohi olla javascript:',r.s);
r=await rest(A.tok,'POST','/products',{company_id:cB,name:'Telk',images:[]});ok(r.s>=400,'teisele firmale toodet ei saa lisada',r.s);
const PIMG=`https://x.supabase.co/storage/v1/object/public/products/${cA}/p1.jpg`;
r=await rest(A.tok,'POST','/products',{company_id:cA,name:'Peotelk 6×12',images:[PIMG],w:6,l:12,h:4,category:'Telgid'});ok(r.s===201,'õige toote saab lisada',r);const PROD=r.j?.[0]?.id;
r=await rest(A.tok,'PATCH',`/partners?code=eq.${CODE}`,{iban:'EE00'});ok(Array.isArray(r.j)&&!r.j.length,'võõrast IBAN-i ei saa muuta');
r=await rest(S.tok,'PATCH',`/partners?code=eq.${CODE}`,{iban:'EE123'});ok(r.s===200&&r.j[0]?.iban==='EE123','müüja saab oma IBAN-i muuta');
r=await rest(S.tok,'PATCH',`/partners?code=eq.${CODE}`,{code:'HACK'});ok(r.s>=400,'müüja koodi ei saa muuta',r.s);
r=await rest(ANON,'GET','/companies');ok(Array.isArray(r.j)&&!r.j.length,'anon ei näe firmasid');
r=await rest(ANON,'GET','/leads');ok(Array.isArray(r.j)&&!r.j.length,'anon ei näe päringuid');
r=await rest(ANON,'GET','/partners');ok(Array.isArray(r.j)&&!r.j.length,'anon ei näe müüjaid');
r=await rest(A.tok,'GET','/partner_earnings');ok(Array.isArray(r.j)&&!r.j.length,'firma ei näe müüjate tulu');

console.log('\n== Failihoidla õigused ==');
const st=(role,uid,q)=>{try{return execFileSync('psql',['-h','/var/tmp/v3dpg','-p','5499','-U','postgres','-d','v3d','-tAq','-c',`set role ${role}; select set_config('request.jwt.claim.sub','${uid}',false); ${q}`],{encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();}catch(e){return 'ERR '+String(e.stderr).split('\n')[0];}};
ok(!/ERR/.test(st('authenticated',A.id,`insert into storage.objects(bucket_id,name) values ('products','${cA}/a.jpg')`)),'oma kausta saab üles laadida');
ok(/ERR/.test(st('authenticated',A.id,`insert into storage.objects(bucket_id,name) values ('products','${cB}/a.jpg')`)),'teise firma kausta ei saa');
ok(/ERR/.test(st('authenticated',A.id,`insert into storage.objects(bucket_id,name) values ('renders','${cA}/a.jpg')`)),'AI-piltide kausta ei saa ise kirjutada');
ok(/ERR/.test(st('anon','',`insert into storage.objects(bucket_id,name) values ('products','${cA}/b.jpg')`)),'anon ei saa üles laadida');
ok(sql(`select allowed_mime_types::text||file_size_limit from storage.buckets where id='products'`)==='{image/jpeg,image/png,image/webp}6291456','toodete kaust: ainult pildid, max 6 MB');

console.log('\n== Objekt (maksab serveris) ==');
r=await rpc(A.tok,'create_object',{p_ehr:'120656418',p_address:'Tammekännu tee 44',p_label:'Objektivaade'});ok(r.s===200&&r.j.charged===true,'objekt loodud',r);
ok(bal(A)===22,'võeti 8 krediiti (−20% soodus)',bal(A));
r=await rpc(A.tok,'create_object',{p_ehr:'120656418',p_address:'Tammekännu tee 44',p_label:'x'});ok(r.j?.charged===false&&bal(A)===22,'sama maja uuesti ei maksa');
r=await rpc(A.tok,'create_object',{p_ehr:'abc',p_address:'x',p_label:'x'});ok(r.s>=400,'vigane EHR kood keelatud');
r=await rest(A.tok,'PATCH',`/objects?ehr=eq.120656418`,{company_id:cB});ok(r.s>=400,'objekti ei saa teisele firmale tõsta',r.s);
r=await rest(A.tok,'PATCH',`/objects?ehr=eq.120656418`,{job:{work:'katus'}});ok(r.s===200,'objekti tööandmeid saab muuta');

const par2=await Promise.all(Array.from({length:5},()=>rpc(A.tok,'create_object',{p_ehr:'116054334',p_address:'Paralleel 1',p_label:'x'})));
ok(par2.filter(x=>x.j?.charged===true).length===1&&sql(`select count(*) from objects where company_id='${cA}' and ehr='116054334'`)==='1','5 samaaegset sama maja loomist: makstakse 1 kord',par2.map(x=>x.j?.charged??x.s));sql(`insert into credit_ledger(company_id,delta,kind,label) values ('${cA}',8,'admin','test tagasi')`);
console.log('\n== AI-pilt: kulu ja tagastus ==');
r=await fn('ai-image',{kind:'pic',prompt:'x',images:[IMG]});ok(r.s===401,'ilma sisselogimiseta ei saa',r.s);
r=await fn('ai-image',{kind:'pic',prompt:'Maja',images:[IMG],ehr:'120656418'},A.tok);ok(r.s===200&&/renders/.test(r.j?.url),'esituspilt tehtud',r);
ok(bal(A)===18.8,'võeti 3,2 krediiti (soodusega)',bal(A));
let promo=+sql(`select promo_left from companies where id='${cA}'`);
r=await fn('ai-image',{kind:'pic',prompt:'FAILME',images:[IMG]},A.tok);ok(r.s===502,'ebaõnnestunud pilt',r.s);
ok(bal(A)===18.8,'tagastati täpselt sama summa (mitte rohkem)',bal(A));
ok(+sql(`select promo_left from companies where id='${cA}'`)===promo,'soodustuse kasutus tuli tagasi');
r=await fn('ai-image',{kind:'pic',prompt:'x',images:['data:x']},A.tok);ok(r.s===400&&bal(A)===18.8,'vigane pilt: krediite ei võeta',[r.s,bal(A)]);
const bS=bal(A);r=await fn('ai-image',{kind:'pic',prompt:'x',images:['data:image/svg+xml;base64,PHN2Zz4=']},A.tok);ok(r.s===400&&bal(A)===bS,'SVG pilt keelatud enne krediitide võtmist',[r.s,bal(A)-bS]);
// katkenud (ajapiirang) pilt: 10 min pärast krediidid tagasi
const stale=crypto.randomUUID();sql(`insert into credit_ledger(company_id,delta,kind,label,ref,created_at) values ('${cA}',-4,'pic','katkes','${stale}',now()-interval '20 minutes'); insert into renders(id,company_id,kind,status,created_at) values ('${stale}','${cA}','pic','pending',now()-interval '20 minutes')`);
const bT=bal(A);await fn('ai-image',{kind:'pic',prompt:'x',images:['https://evil.com/a.jpg']},A.tok);ok(bal(A)===bT+4&&sql(`select status from renders where id='${stale}'`)==='failed','katkenud pildi krediidid tagastati automaatselt',[bal(A)-bT]);
r=await fn('ai-image',{kind:'pic',prompt:'x',images:['https://evil.com/a.jpg']},A.tok);ok(r.s===400,'võõra serveri pilti ei võeta',r.s);
r=await fn('ai-image',{kind:'pic',prompt:'x',images:[IMG],object_id:'not-a-uuid'},A.tok);ok(r.s===200,'vale object_id ei murra (ei teki tasuta Kie kutset)',r.s);
r=await fn('ai-image',{kind:'design',prompt:'x',images:[IMG],n:50},A.tok);ok(r.s===200&&r.j.urls.length===2,'disain: max 2 varianti',r.j?.urls?.length);
r=await fn('ai-image',{kind:'admin',prompt:'x'},A.tok);ok(r.s===400,'tundmatu liik keelatud');
// krediidid otsa
sql(`insert into credit_ledger(company_id,delta,kind,label) values ('${cB}',-30,'admin','test')`);
await clearLog();r=await fn('ai-image',{kind:'pic',prompt:'x',images:[IMG]},B.tok);ok(r.s===402,'krediidid otsas: 402',r.s);
ok(!(await log()).some(x=>x[0]==='kie'),'krediitideta Kie-d ei kutsuta');ok(bal(B)===0,'saldo ei läinud miinusesse');
// paralleelne kulutus (topeltklikk / skript): saldo ei tohi miinusesse minna
sql(`insert into credit_ledger(company_id,delta,kind,label) values ('${cB}',8,'admin','test')`);
const par=await Promise.all(Array.from({length:6},()=>fn('ai-image',{kind:'pic',prompt:'x',images:[IMG]},B.tok)));
ok(par.filter(x=>x.s===200).length===2&&bal(B)===0,'6 paralleelset päringut, 8 krediiti: läbi läks täpselt 2',[par.map(x=>x.s),bal(B)]);

console.log('\n== Avalik vidin: päringud ==');
const W=sql(`select public_id from widgets where company_id='${cA}'`);
sql(`update widgets set features='both', daily_lead_cap=4, daily_img_cap=3, notify_email='mari@katus.ee,ohver@gmail.com,boss@katus.ee' where company_id='${cA}'`);sql(`update companies set web='www.katus.ee' where id='${cA}'`);
let b0=bal(A);await clearLog();
r=await fn('widget-lead',{id:W,name:'<img src=x onerror=alert(1)>',email:'kalle@x.ee',address:'Kibuvitsa tee 9, Viimsi',services:['<script>x</script>'],image_url:'https://x" onerror="alert(1)',measures:{fp:'<b>1</b>',roof:120}},null,{ip:'2.2.2.1'});
ok(r.s===200,'päring vastu võetud',r);ok(Math.abs(bal(A)-(b0-7))<1e-9,'firmalt võeti 7 krediiti (päringule soodustust ei ole)',bal(A));
const L=JSON.parse(sql(`select row_to_json(l) from leads l where company_id='${cA}' order by created_at desc limit 1`));
ok(L.image_url===null,'võõras pildi link visati välja');ok(L.measures===null||typeof L.measures.fp!=='string','mõõdud ainult numbrid',L.measures);
const mails=(await log()).filter(x=>x[0]==='mail');ok(mails.length===1&&!mails[0][1].html.includes('<img src=x')&&mails[0][1].html.includes('&lt;img'),'e-kirjas on kõik escape-itud');
ok(mails[0]&&JSON.stringify(mails[0][1].to)===JSON.stringify(['mari@katus.ee','boss@katus.ee']),'e-kiri ainult firma enda aadressidele (gmail ohver välja)',mails[0]?.[1]?.to);
r=await fn('widget-lead',{id:W,name:'Kalle',email:'KALLE@x.ee',address:'Muu aadress 1'},null,{ip:'2.2.2.2'});ok(r.j?.duplicate&&Math.abs(bal(A)-(b0-7))<1e-9,'sama e-post 24 h jooksul: teist korda ei maksa');
r=await fn('widget-lead',{id:W,name:'Bot',email:'bot@x.ee',address:'x 1',hp:'spam'},null,{ip:'2.2.2.3'});ok(sql(`select count(*) from leads where email='bot@x.ee'`)==='0','botilõks (peidetud väli) töötab');
r=await fn('widget-lead',{id:W,name:'A',email:'a@x.ee',address:'x 1'},null,{ip:'2.2.2.4'});ok(r.s===400,'liiga lühike nimi keelatud');
r=await fn('widget-lead',{id:'ffffffffffff',name:'Kalle',email:'k2@x.ee',address:'x 1'},null,{ip:'2.2.2.5'});ok(r.s===404,'vale vidin: 404');
// sama IP: 5 tunnis
let ipOk=0;for(let k=0;k<7;k++){const q=await fn('widget-lead',{id:W,name:'Test '+k,email:`ip${k}@test.ee`,address:'x 1'},null,{ip:'3.3.3.3'});if(q.s!==429)ipOk++;}ok(ipOk<=5,'ühelt IP-lt max 5 päringut tunnis',ipOk);
// x-forwarded-for võltsimine ei aita
let xff=0;for(let k=0;k<7;k++){const h={'Content-Type':'application/json','cf-connecting-ip':'4.4.4.4','x-forwarded-for':`9.9.9.${k}, 4.4.4.4`};const q=await fetch(G+'/functions/v1/widget-lead',{method:'POST',headers:h,body:JSON.stringify({id:W,name:'Spoof '+k,email:`sp${k}@test.ee`,address:'x 1'})});if(q.status!==429)xff++;}ok(xff<=5,'võltsitud x-forwarded-for ei lase piirangust mööda',xff);
ok(+sql(`select count(*) from leads where company_id='${cA}' and created_at>now()-interval '1 day'`)<=4,'firma päevalimiit (4) kehtib',sql(`select count(*) from leads where company_id='${cA}'`));
// võla piir: B on 0 krediidiga
const WB=sql(`select public_id from widgets where company_id='${cB}'`);sql(`update widgets set daily_lead_cap=50 where company_id='${cB}'`);
let acc=0;for(let k=0;k<6;k++){const q=await fn('widget-lead',{id:WB,name:'Võlg '+k,email:`d${k}@test.ee`,address:'x 1'},null,{ip:'5.5.5.'+k});if(q.s===200)acc++;}
ok(acc===3&&bal(B)===-21,'krediidita firmal max 3 päringut võlgu, siis vorm peatub',[acc,bal(B)]);

console.log('\n== Avalik vidin: toode hoovis ==');
ok(bal(A)===-14,'A: 2 päringut makstud, 2 võlgu (−14)',bal(A));
sql(`insert into credit_ledger(company_id,delta,kind,label) values ('${cA}',50,'admin','test')`);b0=bal(A);
r=await fn('widget-place',{id:W,product_id:PROD,photo:IMG,point:{x:40,y:55}},null,{ip:'6.6.6.1'});ok(r.s===200&&/renders/.test(r.j?.url),'pilt tehtud',r);ok(Math.abs(bal(A)-(b0-1.6))<1e-9,'firmalt võeti disaini hind',bal(A)-b0);
r=await fn('widget-place',{id:W,product_id:PROD,photo:'data:text/html;base64,PHNjcmlwdD4=',point:{}},null,{ip:'6.6.6.2'});ok(r.s===400,'ainult pildid');
r=await fn('widget-place',{id:W,product_id:crypto.randomUUID(),photo:IMG},null,{ip:'6.6.6.3'});ok(r.s===404,'võõrast toodet ei saa');
const PB=(await rest(B.tok,'POST','/products',{company_id:cB,name:'B toode',images:[]})).j?.[0]?.id;
r=await fn('widget-place',{id:W,product_id:PB,photo:IMG},null,{ip:'6.6.6.4'});ok(r.s===404,'teise firma toodet ei saa A vidinas kasutada',r.s);
let plc=0;for(let k=0;k<5;k++){const q=await fn('widget-place',{id:W,product_id:PROD,photo:IMG},null,{ip:'7.7.7.'+k});if(q.s===200)plc++;}
ok(plc<=2,'vidina päevalimiit (3 pilti) kehtib ka eri IP-dega',plc);

console.log('\n== Maksed ==');
await clearLog();
r=await fn('checkout',{pack:'220',return_url:'https://evil.com/steal'},A.tok);ok(r.s===200,'makseleht avati');
let sc=(await log()).find(x=>x[0]==='stripe');ok(sc&&sc[1].success_url.startsWith('https://app.vaade3d.ee/'),'tagasi ainult meie lehele (mitte evil.com)',sc?.[1]?.success_url);
ok(sc&&sc[1]['line_items[0][price_data][unit_amount]']==='10000'&&sc[1]['metadata[company_id]']===cA,'hind ja firma tulevad serverist');
r=await fn('checkout',{pack:'999999'},A.tok);ok(r.s===400,'tundmatu pakett keelatud');
const sign=(raw,secret='whsec_test',t=Math.floor(Date.now()/1000))=>`t=${t},v1=`+crypto.createHmac('sha256',secret).update(`${t}.${raw}`).digest('hex');
const hook=async(ev,sig)=>{const raw=JSON.stringify(ev);const q=await fetch(G+'/functions/v1/stripe-webhook',{method:'POST',headers:{'stripe-signature':sig??sign(raw)},body:raw});return q.status;};
const sess=(id,extra={})=>({type:'checkout.session.completed',data:{object:{id,payment_status:'paid',currency:'eur',amount_total:10000,payment_intent:'pi_'+id,metadata:{company_id:cA,pack:'220'},...extra}}});
b0=bal(A);
ok(await hook(sess('cs_1'),'t=1,v1=bad')===400,'vale allkirjaga teavitus lükatakse tagasi');
ok(await hook(sess('cs_1'),sign(JSON.stringify(sess('cs_1')),'wrong'))===400,'võõra võtmega allkiri lükatakse tagasi');
const old=Math.floor(Date.now()/1000)-3600;ok(await hook(sess('cs_1'),sign(JSON.stringify(sess('cs_1')),'whsec_test',old))===400,'vana (korduv) teavitus lükatakse tagasi');
ok(await hook(sess('cs_1'))===200&&bal(A)===b0+220,'makse: +220 krediiti',bal(A)-b0);
await hook(sess('cs_1'));ok(bal(A)===b0+220,'sama makse teist korda krediite ei anna');
await hook(sess('cs_2',{amount_total:100}));ok(bal(A)===b0+220,'vale summaga makset ei arvestata');
await hook(sess('cs_3',{payment_status:'unpaid'}));ok(bal(A)===b0+220,'maksmata (pangaülekanne ootel) ei anna krediite');
await hook({...sess('cs_3'),type:'checkout.session.async_payment_succeeded'});ok(bal(A)===b0+440,'pangaülekanne laekus: krediidid tulevad');
await hook({type:'charge.refunded',data:{object:{payment_intent:'pi_cs_1',amount_refunded:5000}}});ok(bal(A)===b0+330,'pool raha tagastatud: pool krediitidest võetakse tagasi',bal(A)-b0);
await hook({type:'charge.refunded',data:{object:{payment_intent:'pi_cs_1',amount_refunded:5000}}});ok(bal(A)===b0+330,'sama tagastus kaks korda ei võta topelt');
await hook({type:'charge.dispute.created',data:{object:{id:'dp_1',payment_intent:'pi_cs_3'}}});ok(bal(A)===b0+110,'vaidlustatud makse krediidid võetakse tagasi',bal(A)-b0);
await Promise.all([hook({type:'charge.refunded',data:{object:{payment_intent:'pi_cs_1',amount_refunded:10000}}}),hook({type:'charge.refunded',data:{object:{payment_intent:'pi_cs_1',amount_refunded:10000}}})]);ok(bal(A)===b0,'kogu raha tagastatud (2 samaaegset teadet): kõik krediidid tagasi, mitte rohkem',bal(A)-b0);
await hook({type:'charge.dispute.closed',data:{object:{id:'dp_1',payment_intent:'pi_cs_3',status:'won'}}});ok(bal(A)===b0+220,'vaidlus võidetud: krediidid tagasi',bal(A)-b0);
await hook({type:'charge.dispute.closed',data:{object:{id:'dp_1',payment_intent:'pi_cs_3',status:'won'}}});ok(bal(A)===b0+220,'sama teade uuesti ei anna topelt');

console.log('\n== Müüja tulu ==');
r=await rpc(S.tok,'my_partner_earnings');const e=r.j?.[0];
ok(e&&+e.value_eur===100&&+e.earned_eur===25,'müüja saab 25% tegelikult makstud summast (200 € − 100 € tagastus, vaidlus võideti)',e);
ok(e&&+e.pending_eur===25,'viimase 14 päeva tulu on ootel (tagasimakse aken)',e);
// müüja enda firma
sql(`update companies set partner_code='${CODE}' where id='${cidOf(S)}'`);sql(`insert into credit_ledger(company_id,delta,eur,kind,label,ref) values ('${cidOf(S)}',220,100,'purchase','x','cs_self')`);
r=await rpc(S.tok,'my_partner_earnings');ok(+r.j?.[0]?.value_eur===100,'müüja enda firma ostud komisjoni ei anna',r.j);

console.log('\n== AI-abiline ja muu ==');
let chat=0;for(let k=0;k<22;k++){const q=await fn('ai-chat',{messages:[{role:'user',content:'Katus?'}],context:{x:'y'.repeat(100000)}},A.tok);if(q.s===200)chat++;}
ok(chat===20,'AI-abiline: max 20 küsimust tunnis',chat);
const cl=(await log()).filter(x=>x[0]==='claude');ok(cl.length&&cl[0][2]<17000,'AI-abilisele läheb max ~15k märki konteksti',cl[0]?.[2]);
r=await fn('ai-chat',{messages:[{role:'user',content:'x'}]},null);ok(r.s===401,'AI-abiline nõuab sisselogimist');
r=await fn('ehr','?code=120656418',null,{method:'GET'});ok(r.s===200&&r.j.esmane==='1999','EHR andmed tulevad',r.j);
r=await fn('ehr','?code=1;drop',null,{method:'GET'});ok(r.s===400,'vigane EHR kood keelatud');
r=await fn('widget','?id='+W,null,{method:'GET'});ok(r.s===200&&!JSON.stringify(r.j).includes('mari@katus.ee')&&!('notify_email' in r.j),'vidina seaded avalikud, aga e-posti ja webhooki ei näita',Object.keys(r.j||{}));

console.log(`\nKOKKU: ${pass} läbi, ${failN} ebaõnnestus`);if(FAILS.length)console.log('EBAÕNNESTUS:\n - '+FAILS.join('\n - '));
