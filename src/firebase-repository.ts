import {collection,doc,getDoc,getDocs,onSnapshot,onSnapshotsInSync,runTransaction,type Firestore,type Unsubscribe} from 'firebase/firestore';
import {mutate,normalizeLeaders,syncFutureSessions,type State} from './model.ts';
import {changesBetween,documentsFor,mergeLessons,tokenHash,type Course,type Lesson,type Documents} from './firebase-data.ts';
export async function ownerRead(db:Firestore,course:string){
 const [meta,config,sessions]=await Promise.all([getDoc(doc(db,'courses',course)),getDoc(doc(db,'courses',course,'private','config')),getDocs(collection(db,'courses',course,'sessions'))]);
 if(!meta.exists()||!config.exists())throw Error('Kurs nicht gefunden.');
 const courseData=meta.data() as Course;
 const docs:Documents=new Map([[meta.ref.path,courseData],[config.ref.path,config.data()]]);
 sessions.forEach(d=>docs.set(d.ref.path,d.data()));
 const state:State={...config.data() as Pick<State,'students'|'groups'|'demo'>,title:courseData.title,sessions:sessions.docs.map(d=>d.data() as State['sessions'][number]).sort((a,b)=>a.date.localeCompare(b.date))};
 const lessons:Lesson[]=[];
 await Promise.all(state.groups.map(async g=>{
  const path='channels/'+await tokenHash(g.token!);
  const [channel,result]=await Promise.all([getDoc(doc(db,path)),getDocs(collection(db,path,'lessons'))]);
  if(channel.exists())docs.set(path,channel.data());
  result.forEach(d=>{docs.set(d.ref.path,d.data());lessons.push(d.data() as Lesson);});
 }));
 return {docs,state:mergeLessons(state,lessons),meta:courseData};
}
export async function ownerAction(db:Firestore,_uid:string,body:any,course:string){
 for(let attempt=0;attempt<4;attempt++){
  const loaded=await ownerRead(db,course);
  try{
   return await runTransaction(db,async tx=>{
    const metadata=await tx.get(doc(db,'courses',course));
    if(metadata.data()?.version!==loaded.meta.version)throw Error('COURSE_CHANGED');
    // These transaction reads protect concurrent group reports from lost updates.
    const paths=[...loaded.docs.keys()].filter(p=>p!=='courses/'+course);
    const snapshots=await Promise.all(paths.map(path=>tx.get(doc(db,path))));
    const before:Documents=new Map([['courses/'+course,metadata.data()]]);
    snapshots.forEach(s=>{if(s.exists())before.set(s.ref.path,s.data());});
    const config=before.get('courses/'+course+'/private/config');
    let state:State={...config,title:metadata.data()!.title,sessions:[...before].filter(([p])=>p.startsWith('courses/'+course+'/sessions/')).map(([,v])=>v).sort((a,b)=>a.date.localeCompare(b.date))};
    state=mergeLessons(state,[...before].filter(([p])=>p.startsWith('channels/')&&p.includes('/lessons/')).map(([,v])=>v));
    normalizeLeaders(state);syncFutureSessions(state);mutate(state,body);syncFutureSessions(state);
    const after=await documentsFor(state,course,loaded.meta.ownerUid,loaded.meta.version+1),changes=changesBetween(before,after);
    const newPaths=changes.sets.map(([p])=>p).filter(p=>!before.has(p));
    await Promise.all(newPaths.map(p=>tx.get(doc(db,p))));
    for(const path of changes.deletes)tx.delete(doc(db,path));
    for(const [path,value] of changes.sets)tx.set(doc(db,path),value);
    // runTransaction resolves with this state only after the write is confirmed.
    return {state,meta:after.get('courses/'+course) as Course};
   });
  }catch(e){
   if((e as Error).message==='COURSE_CHANGED')continue;
   // Rules can reject an outdated version before Firestore reports contention.
   // Retry only if another writer actually advanced this accessible course.
   if((e as {code?:string}).code==='permission-denied'){
    const current=await getDoc(doc(db,'courses',course));
    if(current.exists()&&current.data().version!==loaded.meta.version)continue;
   }
   throw e;
  }
 }
 throw Error('Gleichzeitige Änderung. Bitte erneut versuchen.');
}

export function watchOwnerCourse(db:Firestore,course:string,onChange:(value:{state:State,meta:Course})=>void,onError:(error:Error)=>void):Unsubscribe{
 let stopped=false,meta:Course|null=null,config:Pick<State,'students'|'groups'|'demo'>|null=null,sessions:State['sessions']|null=null;
 let key:string|null=null,revision=0,groupStops:Unsubscribe[]=[],lessons=new Map<string,Lesson[]>();
 const fail=(e:Error)=>{if(!stopped)onError(e);};
 const emit=()=>{
  if(stopped||!meta||!config||!sessions||lessons.size!==config.groups.length)return;
  onChange({meta,state:mergeLessons({...config,title:meta.title,sessions},[...lessons.values()].flat())});
 };
 const stops=[
  onSnapshot(doc(db,'courses',course,'private','config'),snap=>{
   if(!snap.exists()){fail(Error('Kurs nicht gefunden.'));return;}
   config=snap.data() as typeof config;
   const groups=snap.data().groups as State['groups'],next=groups.map(g=>g.token).join('|');
   if(next===key)return;
   key=next;const current=++revision;groupStops.forEach(stop=>stop());groupStops=[];lessons=new Map();
   Promise.all(groups.map(g=>tokenHash(g.token!))).then(hashes=>{
    if(stopped||revision!==current)return;
    groupStops=hashes.map((hash,index)=>onSnapshot(collection(db,'channels',hash,'lessons'),s=>{
     if(stopped||revision!==current)return;
     lessons.set(hash,s.docs.map(d=>d.data() as Lesson));
    },e=>{
     if(stopped||revision!==current)return;
     // A removed/rotated channel may be denied before the config listener catches up.
     // Confirm its removal; a still-active channel or revoked course access is an error.
     getDoc(doc(db,'courses',course,'private','config')).then(snap=>{
      if(stopped||revision!==current)return;
      if(!snap.exists()||(snap.data().groups as State['groups']).some(g=>g.token===groups[index].token))fail(e);
     }).catch(fail);
    }));
    if(!hashes.length)emit();
   }).catch(fail);
  },fail),
  onSnapshot(doc(db,'courses',course),snap=>{if(snap.exists())meta=snap.data() as Course;else fail(Error('Kurs nicht gefunden.'));},fail),
  onSnapshot(collection(db,'courses',course,'sessions'),snap=>{sessions=snap.docs.map(d=>d.data() as State['sessions'][number]).sort((a,b)=>a.date.localeCompare(b.date));},fail),
  // Publish once all listeners affected by one change have caught up.
  onSnapshotsInSync(db,emit),
 ];
 return ()=>{stopped=true;stops.forEach(stop=>stop());groupStops.forEach(stop=>stop());};
}
