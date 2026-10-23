// One-time local migration. No credentials, exports or group links are written to files/logs.
// Run with Node 24. Dry-run is the default; --commit explicitly enables target writes.
import {applicationDefault,initializeApp,deleteApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore,Timestamp as AdminTimestamp} from 'firebase-admin/firestore';
import {documentsFor} from '../src/firebase-data.ts';
import {normalizeLeaders,syncFutureSessions,type State} from '../src/model.ts';

function required(name:string){const value=process.env[name];if(!value)throw Error('Fehlende Umgebungsvariable: '+name);return value;}
async function main(){
 const source=required('MIGRATION_SOURCE_URL').replace(/\/$/,''),key=required('MIGRATION_SOURCE_PUBLIC_KEY');
 if(!source.startsWith('https://')||!source.endsWith('.supabase.co'))throw Error('Ungültige Supabase-Projektadresse.');
 const credentials={email:required('MIGRATION_SOURCE_EMAIL'),password:required('MIGRATION_SOURCE_PASSWORD')};
 const login=await fetch(source+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify(credentials)});
 if(!login.ok)throw Error('Anmeldung am bisherigen Supabase-Konto fehlgeschlagen.');
 const {access_token}=await login.json() as {access_token:string};
 try{
  const response=await fetch(source+'/functions/v1/course',{headers:{apikey:key,Authorization:'Bearer '+access_token}});
  if(!response.ok)throw Error('Der bisherige Kurs konnte nicht gelesen werden.');
  const data=await response.json() as {course:string,role:string,state:State};
  if(data.role!=='admin'||!data.course||!data.state?.students||!data.state?.groups||!data.state?.sessions)throw Error('Ungültige Kursdaten.');
  const state=structuredClone(data.state);normalizeLeaders(state);syncFutureSessions(state);
  // Old Supabase links are never reused, even if the old project remains reachable.
  state.groups.forEach(g=>{g.token=crypto.randomUUID()+crypto.randomUUID();});
  const projectId=required('MIGRATION_TARGET_PROJECT'),ownerEmail=required('MIGRATION_TARGET_OWNER_EMAIL');
  const app=initializeApp({credential:applicationDefault(),projectId});
  try{
   const user=await getAuth(app).getUserByEmail(ownerEmail);
   const manuallyApproved=user.customClaims?.administrator===true&&user.customClaims?.manualAccessApproved===true;
   if(user.disabled||(!user.emailVerified&&!manuallyApproved))throw Error('Das Firebase-Konto muss bestätigt oder ausdrücklich als Administrator manuell freigeschaltet sein.');
   const db=getFirestore(app),courseId='supabase-'+data.course;
   if((await db.doc('courses/'+courseId).get()).exists || (await db.doc('courses/'+courseId+'/private/config').get()).exists)throw Error('Dieser Zielkurs existiert bereits oder enthält einen unvollständigen Import. Er wird nicht überschrieben.');
   const docs=await documentsFor(state,courseId,user.uid,0);
   for(const [,value] of docs)if(Buffer.byteLength(JSON.stringify(value))>850000)throw Error('Ein Datensatz ist zu groß. Bitte den Import vorab aufteilen.');
   console.log(JSON.stringify({mode:process.argv.includes('--commit')?'Übernahme':'Prüfung ohne Schreiben',targetProject:projectId,students:state.students.length,groups:state.groups.length,dates:state.sessions.length,documents:docs.size}));
   if(!process.argv.includes('--commit'))return;
   const entries=[...docs].filter(([path])=>path!=='courses/'+courseId);
   for(let offset=0;offset<entries.length;offset+=200){
    const batch=db.batch();
    for(const [path,sourceValue] of entries.slice(offset,offset+200)){
     const value={...sourceValue};
     if(path.startsWith('channels/')&&!path.includes('/lessons/'))value.active=false;
     if(value.reportedAt)value.reportedAt=AdminTimestamp.fromMillis(value.reportedAt.toMillis());
     batch.set(db.doc(path),value);
    }
    await batch.commit();
   }
   // Publish the completed course and all its links atomically, as the very last step.
   const publish=db.batch();publish.set(db.doc('courses/'+courseId),docs.get('courses/'+courseId));
   for(const [path] of entries.filter(([p])=>p.startsWith('channels/')&&!p.includes('/lessons/')))publish.update(db.doc(path),{active:true});
   await publish.commit();
   // Compare every field, not just counts. Tokens remain in memory and are never printed.
   for(const [path,expected] of docs){
    const actual=(await db.doc(path).get()).data();
    const stable=(v:unknown):string=>JSON.stringify(v,(_key,x)=>x&&typeof x==='object'&&typeof x.toMillis==='function'?x.toMillis():x);
    // SDK timestamps use different JSON serializers; normalize them before comparison.
    const normalize=(v:any):any=>v&&typeof v.toMillis==='function'?v.toMillis():Array.isArray(v)?v.map(normalize):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,normalize(x)])):v;
    const ordered=(v:any):any=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,ordered(x)])):v;
    if(stable(ordered(normalize(actual)))!==stable(ordered(normalize(expected))))throw Error('Die Nachprüfung des Imports ist fehlgeschlagen. Supabase bleibt die maßgebliche Quelle.');
   }
   console.log('Kurs vollständig übernommen und nachgelesen. Neue Gruppenlinks erst nach Prüfung verteilen. Der bisherige Kurs wurde nicht gelöscht.');
  }finally{await deleteApp(app);}
 }finally{
  // Revoke only the temporary source session created by this script.
  await fetch(source+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+access_token}}).catch(()=>{});
 }
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Datenübernahme fehlgeschlagen.');process.exitCode=1;});
