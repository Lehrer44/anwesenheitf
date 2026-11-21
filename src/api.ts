import {ownerRead,ownerAction,watchOwnerCourse} from './firebase-repository';
import {signInAnonymously} from 'firebase/auth';
import {createAccountAccess} from './account-auth';
import {auth,db,configured} from './firebase';
import {collection,doc,getDoc,getDocs,onSnapshot,query,runTransaction,serverTimestamp,where,writeBatch,type Unsubscribe} from 'firebase/firestore';
import {initial,mutate,needsTeacherSync,type State} from './model';
import {documentsFor,groupState,tokenHash,type Channel,type Lesson,type Portal,type Staff,type StaffDay} from './firebase-data';
import type {Status} from './model';
export {configured};
// school: token of the shared school link (class selection page); token: one class link.
export type Access={course:string,token:string,school?:string};
// Class links also see the central teacher list and its marks per lesson day.
export type StaffView={hash:string,teachers:Staff['teachers'],lehrer:Staff['lehrer'],days:StaffDay[]};
export type Data={course:string,role:'admin'|'group',state:State,version:number,staff?:StaffView|null};
export type {CourseChoice} from './course-management';
import type {CourseChoice,CourseEdit} from './course-management';
import {saveCourseLists} from './firebase-course-management';
import {watchClassBook,writeClassBookEntry} from './firebase-classbook';
import type {ClassBookEntry,ClassBookInput} from './classbook';
export type {ClassBookEntry} from './classbook';
export async function manageCourseLists(original:CourseChoice[],rows:CourseEdit[]){return saveCourseLists(services().db,owner(),original,rows);}
function services(){if(!db||!auth)throw Error('Firebase ist noch nicht eingerichtet.');return {db,auth};}
const accounts=createAccountAccess(auth,{continueUrl:typeof location==='undefined'?undefined:location.origin+location.pathname});
export const session=accounts.session,ready=accounts.ready,watchAuth=accounts.watch,login=accounts.login,signup=accounts.signup,resetPassword=accounts.resetPassword,logout=accounts.logout;
export const pendingAccount=accounts.pending,verificationCooldown=accounts.cooldown,resendVerification=accounts.resend,checkVerification=accounts.check;
async function groupUser(){const {auth}=services();await ready();if(!auth.currentUser)await signInAnonymously(auth);}
function owner(){const user=session();if(!user)throw Error('Bitte mit einem bestätigten oder ausdrücklich freigeschalteten Konto anmelden.');return user.uid;}
export async function isAdministrator(){
 owner();return (await services().auth.currentUser!.getIdTokenResult(true)).claims.administrator===true;
}
export async function listCourses():Promise<CourseChoice[]>{
 const {db}=services(),uid=owner();
 const result=await getDocs(await isAdministrator()?collection(db,'courses'):query(collection(db,'courses'),where('ownerUid','==',uid)));
 return result.docs.map(d=>({id:d.id,title:d.data().title as string})).sort((a,b)=>a.title.localeCompare(b.title,'de'));
}
export async function createCourse(title:string,groupCount:number){
 const {db}=services(),uid=owner(),id=crypto.randomUUID(),state=initial(groupCount);state.title=title.trim().slice(0,100)||'Mein Wochenkurs';
 const docs=await documentsFor(state,id,uid,0),batch=writeBatch(db);
 for(const [path,data] of docs)batch.set(doc(db,path),data);
 await batch.commit();return id;
}
async function groupRead(access:Access):Promise<Data>{
 await groupUser();const {db}=services(),hash=await tokenHash(access.token),snap=await getDoc(doc(db,'channels',hash));
 if(!snap.exists()||!snap.data().active||snap.data().courseId!==access.course)throw Error('Dieser Klassenlink ist ungültig oder wurde erneuert.');
 const channel=snap.data() as Channel,lessons=await getDocs(collection(db,'channels',hash,'lessons'));
 let staff:StaffView|null=null;
 if(channel.staff){
  const [list,days]=await Promise.all([getDoc(doc(db,'staff',channel.staff)),getDocs(collection(db,'staff',channel.staff,'days'))]);
  if(list.exists())staff={hash:channel.staff,teachers:list.data().teachers,lehrer:list.data().lehrer,days:days.docs.map(d=>d.data() as StaffDay)};
 }
 return {course:access.course,role:'group',state:groupState(channel,lessons.docs.map(d=>d.data() as Lesson)),version:0,staff};
}
export async function courseRequest(body:any,access:Access):Promise<Data>{
 if(access.token){
  if(body){
   if(body.action!=='submit')throw Error('Nur die eigene Klassenmeldung ist erlaubt.');
   await groupUser();const {db}=services(),hash=await tokenHash(access.token);
   await runTransaction(db,async tx=>{
    const parent=await tx.get(doc(db,'channels',hash));
    if(!parent.exists()||!parent.data().active||parent.data().courseId!==access.course)throw Error('Dieser Klassenlink ist ungültig oder wurde erneuert.');
    const ref=doc(db,'channels',hash,'lessons',String(body.date)),snap=await tx.get(ref);
    if(!snap.exists())throw Error('Termin nicht gefunden.');
    const channel=parent.data() as Channel,state=groupState(channel,[snap.data() as Lesson]);mutate(state,body,state.groups[0]);
    tx.update(ref,{marks:state.sessions[0].marks,reportedAt:serverTimestamp()});
   });
  }
  return await groupRead(access);
 }
 owner();if(!access.course)throw Error('Bitte einen Kurs auswählen.');
 let result=body?await ownerAction(services().db,owner(),body,access.course):await ownerRead(services().db,access.course);
 // Publish existing L1/L2 assignments once so established class links can report them.
 if(!body&&needsTeacherSync(result.state))result=await ownerAction(services().db,owner(),{action:'syncTeachers'},access.course);
 return {course:access.course,role:'admin',state:result.state,version:result.meta.version};
}

export async function watchCourse(access:Access,onChange:(data:Data)=>void,onError:(error:Error)=>void):Promise<Unsubscribe>{
 const {db}=services(),stops:Unsubscribe[]=[];let stopped=false;
 const fail=(e:Error)=>{if(!stopped)onError(e);};
 if(access.token){
  await groupUser();const hash=await tokenHash(access.token);let channel:Channel|null=null,lessons:Lesson[]|null=null;
  let staffHash='',list:Staff|null=null,days:StaffDay[]|null=null,staffStops:Unsubscribe[]=[];
  const emit=()=>{
   if(stopped||!channel||!lessons||(channel.staff&&(!list||!days)))return;
   onChange({course:access.course,role:'group',state:groupState(channel,lessons),version:0,staff:channel.staff&&list&&days?{hash:channel.staff,teachers:list.teachers,lehrer:list.lehrer,days}:null});
  };
  // Follow the teacher list the channel currently points to.
  const watchStaff=(next:string)=>{
   if(next===staffHash)return;
   staffStops.forEach(stop=>stop());staffStops=[];staffHash=next;list=null;days=null;
   if(!next)return;
   staffStops=[
    onSnapshot(doc(db,'staff',next),snap=>{if(snap.exists()){list=snap.data() as Staff;emit();}},fail),
    onSnapshot(collection(db,'staff',next,'days'),snap=>{days=snap.docs.map(d=>d.data() as StaffDay);emit();},fail),
   ];
  };
  stops.push(()=>staffStops.forEach(stop=>stop()));
  stops.push(onSnapshot(doc(db,'channels',hash),snap=>{
   if(!snap.exists()||!snap.data().active||snap.data().courseId!==access.course){channel=null;fail(Error('Dieser Klassenlink ist ungültig oder wurde erneuert.'));return;}
   channel=snap.data() as Channel;watchStaff(channel.staff||'');emit();
  },fail));
  stops.push(onSnapshot(collection(db,'channels',hash,'lessons'),snap=>{lessons=snap.docs.map(d=>d.data() as Lesson);emit();},fail));
 }else{
  owner();stops.push(watchOwnerCourse(db,access.course,({state,meta})=>{if(!stopped)onChange({course:access.course,role:'admin',state,version:meta.version});},fail));
 }
 return ()=>{stopped=true;stops.forEach(stop=>stop());};
}

// Class book: the class link writes entries; the course owner reads them per class.
export async function watchClassEntries(access:Access,groupToken:string,onChange:(entries:ClassBookEntry[])=>void,onError:(error:Error)=>void):Promise<Unsubscribe>{
 const {db}=services();
 if(access.token){await groupUser();return watchClassBook(db,await tokenHash(access.token),null,onChange,onError);}
 owner();const hash=await tokenHash(groupToken),channel=await getDoc(doc(db,'channels',hash));
 if(!channel.exists())throw Error('Für diese Klasse ist noch kein Klassenbuch vorhanden.');
 return watchClassBook(db,hash,channel.data().ownerUid,onChange,onError);
}
export async function saveClassEntry(access:Access,entry:ClassBookInput,expected:string|null){
 if(!access.token)throw Error('Einträge werden über den Klassenlink geschrieben.');
 await groupUser();await writeClassBookEntry(services().db,await tokenHash(access.token),entry,expected);
}
export async function deleteClassEntry(access:Access,date:string,expected:string|null){
 if(!access.token)throw Error('Einträge werden über den Klassenlink gelöscht.');
 await groupUser();await writeClassBookEntry(services().db,await tokenHash(access.token),{date,delete:true},expected);
}

// Central teacher attendance: only the entries the person changed are written, so parallel reports merge.
export async function saveTeacherMarks(staffHash:string,date:string,changes:Record<string,Status>){
 await groupUser();const {db}=services(),ref=doc(db,'staff',staffHash,'days',date);
 await runTransaction(db,async tx=>{
  const snap=await tx.get(ref);
  if(!snap.exists())throw Error('Termin nicht gefunden.');
  const day=snap.data() as StaffDay;
  if(day.cancelled)throw Error('Dieser Unterricht fällt aus.');
  if(Object.entries(changes).some(([id,status])=>!day.teacherIds.includes(id)||!['anwesend','abwesend'].includes(status)))throw Error('Die Lehrerliste wurde zwischenzeitlich geändert. Bitte den Dialog schließen und erneut öffnen.');
  tx.update(ref,{marks:{...day.marks,...changes}});
 }).catch(e=>{throw (e as {code?:string}).code==='permission-denied'?Error('Dieser Link ist ungültig oder wurde erneuert.'):e;});
}
// The shared school link lists every class with its class link.
export async function watchPortal(access:Access,onChange:(portal:Portal)=>void,onError:(error:Error)=>void):Promise<Unsubscribe>{
 await groupUser();const {db}=services(),hash=await tokenHash(access.school||'');
 return onSnapshot(doc(db,'portals',hash),snap=>{
  if(!snap.exists()||!snap.data().active||snap.data().courseId!==access.course){onError(Error('Dieser Schul-Link ist ungültig oder wurde erneuert.'));return;}
  onChange(snap.data() as Portal);
 },e=>onError((e as {code?:string}).code==='permission-denied'?Error('Dieser Schul-Link ist ungültig oder wurde erneuert.'):e));
}
