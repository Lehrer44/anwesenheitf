import {initial,mutate,groupView,normalizeLeaders,syncFutureSessions, type State} from './model.ts';
const url=Deno.env.get('SUPABASE_URL')!;
const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// The platform accepts requests without JWT so that group links work.
// EVERY operation below independently verifies a user JWT or a random group token.
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-group-token','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
function json(v:unknown,status=200){return Response.json(v,{status,headers:{...cors,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});}
async function rest(query:string,method='GET',body?:unknown,prefer='return=representation') {
 const r=await fetch(url+'/rest/v1/courses?'+query,{method,headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json',Prefer:prefer},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 if(!r.ok){console.error('Database request failed',r.status);throw Error('Datenbankanfrage fehlgeschlagen.');}
 const text=await r.text();return text?JSON.parse(text):[];
}
async function user(req:Request){const authorization=req.headers.get('authorization');if(!authorization)return null;const r=await fetch(url+'/auth/v1/user',{headers:{apikey:service,Authorization:authorization}});if(!r.ok)return null;return (await r.json()).id as string;}
async function sha(s:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function handle(req:Request):Promise<Response> {
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(!['GET','POST'].includes(req.method))return json({error:'Methode nicht erlaubt.'},405);
 try {
  const token=req.headers.get('x-group-token');
  const uid=token?null:await user(req);
  if(!uid&&!token)return json({error:'Bitte anmelden.'},401);
  const write=req.method==='POST';
  const text=write?await req.text():'';if(text.length>1000000)return json({error:'Anfrage zu groß.'},413);
  const b=write?JSON.parse(text):null;
  if(b?.action==='claimMigration') {
   if(!uid||token||!b.course||typeof b.claim!=='string')return json({error:'Übernahme nicht erlaubt.'},403);
   const hash=await sha(b.claim);
   const pending=await rest('id=eq.'+encodeURIComponent(b.course)+'&claim_hash=eq.'+hash+'&owner_id=is.null');
   if(!pending.length)return json({error:'Der Übernahmelink ist ungültig oder bereits verwendet.'},403);
   const own=await rest('owner_id=eq.'+uid);
   if(own.length){
    const existing=own[0];
    if(existing.version!==0||existing.state.students?.length||existing.state.sessions?.length)return json({error:'Dieses Konto hat bereits einen eingerichteten Kurs. Bitte ein Konto ohne eigenen Kurs verwenden.'},409);
    const removed=await rest('id=eq.'+existing.id+'&owner_id=eq.'+uid+'&version=eq.0','DELETE');
    if(!removed.length)return json({error:'Gleichzeitige Änderung. Bitte erneut versuchen.'},409);
   }
   const rows=await rest('id=eq.'+encodeURIComponent(b.course)+'&claim_hash=eq.'+hash+'&owner_id=is.null','PATCH',{owner_id:uid,claim_hash:null,version:1});
   if(!rows.length)return json({error:'Der Übernahmelink ist ungültig oder bereits verwendet.'},403);
   return json({course:rows[0].id,role:'admin',state:rows[0].state,version:rows[0].version});
  }
  const course=new URL(req.url).searchParams.get('course');
  for(let n=0;n<8;n++) {
   const query=token?'id=eq.'+encodeURIComponent(course||''):'owner_id=eq.'+uid;
   let rows=await rest(query+'&select=id,owner_id,state,version');
   if(!rows.length&&!token) {
    await rest('on_conflict=owner_id','POST',{owner_id:uid,state:initial()},'resolution=ignore-duplicates,return=minimal');
    rows=await rest(query+'&select=id,owner_id,state,version');
   }
   const row=rows[0];if(!row||!row.owner_id)return json({error:'Der Gruppenlink ist ungültig.'},403);
   const state=row.state as State;
   const group=token?state.groups.find(g=>g.token===token):undefined;
   if(token&&!group)return json({error:'Dieser Gruppenlink ist ungültig oder wurde erneuert.'},403);
   const before=JSON.stringify(state);normalizeLeaders(state);syncFutureSessions(state);
   if(write){mutate(state,b,group);syncFutureSessions(state);}
   const changedState=write||JSON.stringify(state)!==before;
   if(changedState) {
    const changed=await rest('id=eq.'+row.id+'&version=eq.'+row.version,'PATCH',{state,version:row.version+1});
    if(!changed.length)continue;
   }
   return json({course:row.id,role:group?'group':'admin',state:group?groupView(state,group):state,version:row.version+(changedState?1:0)});
  }
  return json({error:'Gleichzeitige Änderung. Bitte erneut versuchen.'},409);
 } catch(e) {return json({error:e instanceof Error?e.message:'Speichern fehlgeschlagen.'},400);}
}
Deno.serve(handle);
