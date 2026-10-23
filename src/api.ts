import {ownerRead,ownerAction} from './firebase-repository';
import {createUserWithEmailAndPassword,sendEmailVerification,sendPasswordResetEmail,signInWithEmailAndPassword,signInAnonymously,signOut,onAuthStateChanged} from 'firebase/auth';
import {auth,db,configured} from './firebase';
import {collection,doc,getDoc,getDocs,onSnapshot,query,runTransaction,serverTimestamp,where,writeBatch,type Unsubscribe} from 'firebase/firestore';
import {initial,mutate,type State} from './model';
import {documentsFor,groupState,mergeLessons,tokenHash,type Course,type Channel,type Lesson} from './firebase-data';
export {configured};
export type Access={course:string,token:string};
export type Data={course:string,role:'admin'|'group',state:State,version:number};
export type CourseChoice={id:string,title:string};
export const session=()=>auth?.currentUser&&!auth.currentUser.isAnonymous&&auth.currentUser.emailVerified?auth.currentUser:null;
export async function ready(){if(auth)await auth.authStateReady();}
export function watchAuth(fn:()=>void){return auth?onAuthStateChanged(auth,fn):()=>{};}
function services(){if(!db||!auth)throw Error('Firebase ist noch nicht eingerichtet.');return {db,auth};}
export async function login(email:string,password:string){
 const {auth}=services();const {user}=await signInWithEmailAndPassword(auth,email,password);
 if(!user.emailVerified){await sendEmailVerification(user);await signOut(auth);throw Error('Bitte bestätige zuerst deine E-Mail-Adresse. Eine Bestätigungs-E-Mail wurde erneut versendet.');}
}
export async function signup(email:string,password:string){
 const {auth}=services();const {user}=await createUserWithEmailAndPassword(auth,email,password);
 try{await sendEmailVerification(user);}finally{await signOut(auth);}return false;
}
export async function resetPassword(email:string){if(!email.trim())throw Error('Bitte zuerst die E-Mail-Adresse eingeben.');await sendPasswordResetEmail(services().auth,email);}
export async function logout(){if(auth)await signOut(auth);}
async function groupUser(){const {auth}=services();await ready();if(!auth.currentUser)await signInAnonymously(auth);}
function owner(){const user=session();if(!user?.emailVerified)throw Error('Bitte als Kursleitung mit bestätigter E-Mail-Adresse anmelden.');return user.uid;}
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
 if(!snap.exists()||!snap.data().active||snap.data().courseId!==access.course)throw Error('Dieser Gruppenlink ist ungültig oder wurde erneuert.');
 const lessons=await getDocs(collection(db,'channels',hash,'lessons'));
 return {course:access.course,role:'group',state:groupState(snap.data() as Channel,lessons.docs.map(d=>d.data() as Lesson)),version:0};
}
export async function courseRequest(body:any,access:Access):Promise<Data>{
 if(access.token){
  if(body){
   if(body.action!=='submit')throw Error('Nur die eigene Gruppenmeldung ist erlaubt.');
   await groupUser();const {db}=services(),hash=await tokenHash(access.token);
   await runTransaction(db,async tx=>{
    const parent=await tx.get(doc(db,'channels',hash));
    if(!parent.exists()||!parent.data().active||parent.data().courseId!==access.course)throw Error('Dieser Gruppenlink ist ungültig oder wurde erneuert.');
    const ref=doc(db,'channels',hash,'lessons',String(body.date)),snap=await tx.get(ref);
    if(!snap.exists())throw Error('Termin nicht gefunden.');
    const channel=parent.data() as Channel,state=groupState(channel,[snap.data() as Lesson]);mutate(state,body,state.groups[0]);
    tx.update(ref,{marks:state.sessions[0].marks,reportedAt:serverTimestamp()});
   });
  }
  return await groupRead(access);
 }
 owner();if(!access.course)throw Error('Bitte einen Kurs auswählen.');
 if(body)await ownerAction(services().db,owner(),body,access.course);const result=await ownerRead(services().db,access.course);
 return {course:access.course,role:'admin',state:result.state,version:result.meta.version};
}

export async function watchCourse(access:Access,onChange:(data:Data)=>void,onError:(error:Error)=>void):Promise<Unsubscribe>{
 const {db}=services(),stops:Unsubscribe[]=[];let stopped=false;
 const fail=(e:Error)=>{if(!stopped)onError(e);};
 if(access.token){
  await groupUser();const hash=await tokenHash(access.token);let channel:Channel|null=null,lessons:Lesson[]|null=null;
  const emit=()=>{if(!stopped&&channel&&lessons)onChange({course:access.course,role:'group',state:groupState(channel,lessons),version:0});};
  stops.push(onSnapshot(doc(db,'channels',hash),snap=>{
   if(!snap.exists()||!snap.data().active||snap.data().courseId!==access.course){channel=null;fail(Error('Dieser Gruppenlink ist ungültig oder wurde erneuert.'));return;}
   channel=snap.data() as Channel;emit();
  },fail));
  stops.push(onSnapshot(collection(db,'channels',hash,'lessons'),snap=>{lessons=snap.docs.map(d=>d.data() as Lesson);emit();},fail));
 }else{
  owner();let meta:Course|null=null,config:Pick<State,'students'|'groups'|'demo'>|null=null,sessions:State['sessions']|null=null;
  let key='',groupStops:Unsubscribe[]=[],lessons=new Map<string,Lesson[]>();
  const emit=()=>{
   if(stopped||!meta||!config||!sessions||lessons.size!==config.groups.length)return;
   onChange({course:access.course,role:'admin',version:meta.version,state:mergeLessons({...config,title:meta.title,sessions},[...lessons.values()].flat())});
  };
  stops.push(()=>groupStops.forEach(stop=>stop()));
  stops.push(onSnapshot(doc(db,'courses',access.course,'private','config'),async snap=>{
   if(!snap.exists())return;config=snap.data() as typeof config;
   const groups=(snap.data().groups as State['groups']),next=groups.map(g=>g.token).join('|');
   if(next===key){emit();return;}key=next;
   const hashes=await Promise.all(groups.map(g=>tokenHash(g.token!)));if(stopped||key!==next)return;
   groupStops.forEach(stop=>stop());lessons=new Map();
   groupStops=hashes.map(hash=>onSnapshot(collection(db,'channels',hash,'lessons'),s=>{lessons.set(hash,s.docs.map(d=>d.data() as Lesson));emit();},fail));
  },fail));
  stops.push(onSnapshot(doc(db,'courses',access.course),snap=>{if(snap.exists()){meta=snap.data() as Course;emit();}else fail(Error('Kurs nicht gefunden.'));},fail));
  stops.push(onSnapshot(collection(db,'courses',access.course,'sessions'),snap=>{sessions=snap.docs.map(d=>d.data() as State['sessions'][number]).sort((a,b)=>a.date.localeCompare(b.date));emit();},fail));
 }
 return ()=>{stopped=true;stops.forEach(stop=>stop());};
}
