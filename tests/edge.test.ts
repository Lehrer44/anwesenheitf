import assert from 'node:assert/strict';
let row:any;
(globalThis as any).Deno={env:{get:(key:string)=>key==='SUPABASE_URL'?'https://project.test':'service-secret'},serve:()=>{}};
(globalThis as any).fetch=async(input:string,options:any={})=>{
 const u=new URL(input);if(u.pathname==='/auth/v1/user')return options.headers.Authorization==='Bearer owner-jwt'?Response.json({id:'owner'}):Response.json({}, {status:401});
 assert.equal(options.headers.apikey,'service-secret');
 const q=u.searchParams,match=(!q.has('id')||q.get('id')==='eq.'+row?.id)&&(!q.has('owner_id')||(q.get('owner_id')==='is.null'?row?.owner_id===null:q.get('owner_id')==='eq.'+row?.owner_id))&&(!q.has('claim_hash')||q.get('claim_hash')==='eq.'+row?.claim_hash);
 if(options.method==='POST'){if(!row)row={id:'course',version:0,...JSON.parse(options.body)};return new Response(null,{status:201});}
 if(options.method==='PATCH'){if(match&&(!q.has('version')||q.get('version')==='eq.'+row.version)){row={...row,...JSON.parse(options.body)};return Response.json([structuredClone(row)]);}return Response.json([]);}
 return Response.json(row&&match?[structuredClone(row)]:[]);
};
const {handle}=await import('../supabase/functions/course/index.ts');
const {initial,mutate}=await import('../src/model.ts');
function request(body?:any,token?:string,jwt='owner-jwt'){return new Request('https://project.test/functions/v1/course?course=course',{method:body?'POST':'GET',headers:{...(jwt?{Authorization:'Bearer '+jwt}:{}),...(token?{'x-group-token':token}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});}
assert.equal((await handle(request(undefined,undefined,''))).status,401);assert.equal((await handle(request(undefined,undefined,'forged'))).status,401);
const s=initial();mutate(s,{action:'addStudents',names:'Anna\nBen'});mutate(s,{action:'distribute'});mutate(s,{action:'session',date:'2026-10-12'});row={id:'course',owner_id:'owner',version:0,state:s};
assert.equal((await handle(request(undefined,'invalid',''))).status,403);
assert.equal((await handle(request({action:'title',title:'Forbidden'},s.groups[0].token,''))).status,400);
const g=s.groups[0],g2=s.groups[1];
const view:any=await (await handle(request(undefined,g.token,''))).json();assert.equal(view.state.groups[0].token,undefined);assert.equal(view.state.sessions[0].roster.length,1);
assert.equal((await handle(request({action:'submit',date:'2026-10-12',marks:{}},g.token,''))).status,400);
const a=await Promise.all([handle(request({action:'submit',date:'2026-10-12',marks:{[s.students[0].id]:'anwesend'}},g.token,'')),handle(request({action:'submit',date:'2026-10-12',marks:{[s.students[1].id]:'entschuldigt'}},g2.token,''))]);assert.ok(a.every(r=>r.status===200));assert.equal(Object.keys(row.state.sessions[0].marks).length,2);
await handle(request({action:'rotate',id:g.id}));assert.equal((await handle(request(undefined,g.token,''))).status,403);
const secret='one-time-migration-claim';const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret)))].map(x=>x.toString(16).padStart(2,'0')).join('');
row={id:'course',owner_id:null,claim_hash:hash,state:initial(),version:0};
assert.equal((await handle(request({action:'claimMigration',course:'course',claim:'wrong'}))).status,403);
assert.equal((await handle(request({action:'claimMigration',course:'course',claim:secret}))).status,200);assert.equal(row.owner_id,'owner');assert.equal(row.claim_hash,null);
assert.equal((await handle(request({action:'claimMigration',course:'course',claim:secret}))).status,403);
console.log('Edge checks passed: verified authentication, restricted groups, complete submissions, concurrency, revoked links, single-use migration claim.');

// Enrollment changes must reach existing future sessions through the real handler.
const future=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
const enrolled=initial();mutate(enrolled,{action:'addStudents',names:'First',group:enrolled.groups[0].id});mutate(enrolled,{action:'session',date:future});row={id:'course',owner_id:'owner',version:0,state:enrolled};
assert.equal((await handle(request({action:'addStudents',names:'Late student',group:enrolled.groups[0].id}))).status,200);
const lateView=await(await handle(request(undefined,enrolled.groups[0].token,''))).json();assert.equal(lateView.state.sessions[0].roster.length,2);
assert.equal((await handle(request({action:'reorder',id:row.state.students[1].id,direction:-1},enrolled.groups[0].token,''))).status,400);
assert.equal((await handle(request({action:'reorder',id:row.state.students[1].id,direction:-1}))).status,200);
const sorted=await(await handle(request(undefined,enrolled.groups[0].token,''))).json();assert.equal(sorted.state.sessions[0].roster[0].name,'Late student');
console.log('Edge enrollment checks passed: late students reach future group lessons, central ordering is enforced.');
