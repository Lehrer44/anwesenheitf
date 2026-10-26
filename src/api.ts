import {ownerRead,ownerAction,watchOwnerCourse} from './firebase-repository';
import {createUserWithEmailAndPassword,sendEmailVerification,sendPasswordResetEmail,signInWithEmailAndPassword,signInAnonymously,signOut,onAuthStateChanged} from 'firebase/auth';
import {auth,db,configured} from './firebase';
import {collection,doc,getDoc,getDocs,onSnapshot,query,runTransaction,serverTimestamp,where,writeBatch,type Unsubscribe} from 'firebase/firestore';
import {initial,mutate,type State} from './model';
import {documentsFor,groupState,tokenHash,type Channel,type Lesson} from './firebase-data';
export {configured};
export type Access={course:string,token:string};
export type Data={course:string,role:'admin'|'group',state:State,version:number};
export type {CourseChoice} from './course-management';
import type {CourseChoice,CourseEdit} from './course-management';
import {saveCourseLists} from './firebase-course-management';
export async function manageCourseLists(original:CourseChoice[],rows:CourseEdit[]){return saveCourseLists(services().db,owner(),original,rows);}
let manuallyApprovedUid='';
async function refreshAccountAccess(force=false){
 const user=auth?.currentUser;
 if(!user||user.isAnonymous){manuallyApprovedUid='';return;}
 const {claims}=await user.getIdTokenResult(force);
 if(auth?.currentUser?.uid===user.uid)manuallyApprovedUid=claims.administrator===true&&claims.manualAccessApproved===true?user.uid:'';
}
export const session=()=>auth?.currentUser&&!auth.currentUser.isAnonymous&&(auth.currentUser.emailVerified||manuallyApprovedUid===auth.currentUser.uid)?auth.currentUser:null;
export async function ready(){if(auth){await auth.authStateReady();await refreshAccountAccess();}}
export function watchAuth(fn:()=>void){return auth?onAuthStateChanged(auth,()=>{refreshAccountAccess().then(fn).catch(()=>{manuallyApprovedUid='';fn();});}):()=>{};}
function services(){if(!db||!auth)throw Error('Firebase ist noch nicht eingerichtet.');return {db,auth};}
export async function login(email:string,password:string){
 const {auth}=services();const {user}=await signInWithEmailAndPassword(auth,email,password);
 await refreshAccountAccess(true);
 if(!user.emailVerified&&!session()){
  try{await sendEmailVerification(user);}finally{await signOut(auth);manuallyApprovedUid='';}
  throw Error('Dein Konto benötigt eine E-Mail-Bestätigung oder eine gezielte Administratorfreigabe. Der Versand einer Bestätigungs-E-Mail wurde angefordert.');
 }
}
export async function signup(email:string,password:string){
 const {auth}=services();const {user}=await createUserWithEmailAndPassword(auth,email,password);
 try{await sendEmailVerification(user);}finally{await signOut(auth);}return false;
}
export async function resetPassword(email:string){if(!email.trim())throw Error('Bitte zuerst die E-Mail-Adresse eingeben.');await sendPasswordResetEmail(services().auth,email);}
export async function logout(){if(auth)await signOut(auth);}
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
 const lessons=await getDocs(collection(db,'channels',hash,'lessons'));
 return {course:access.course,role:'group',state:groupState(snap.data() as Channel,lessons.docs.map(d=>d.data() as Lesson)),version:0};
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
 const result=body?await ownerAction(services().db,owner(),body,access.course):await ownerRead(services().db,access.course);
 return {course:access.course,role:'admin',state:result.state,version:result.meta.version};
}

export async function watchCourse(access:Access,onChange:(data:Data)=>void,onError:(error:Error)=>void):Promise<Unsubscribe>{
 const {db}=services(),stops:Unsubscribe[]=[];let stopped=false;
 const fail=(e:Error)=>{if(!stopped)onError(e);};
 if(access.token){
  await groupUser();const hash=await tokenHash(access.token);let channel:Channel|null=null,lessons:Lesson[]|null=null;
  const emit=()=>{if(!stopped&&channel&&lessons)onChange({course:access.course,role:'group',state:groupState(channel,lessons),version:0});};
  stops.push(onSnapshot(doc(db,'channels',hash),snap=>{
   if(!snap.exists()||!snap.data().active||snap.data().courseId!==access.course){channel=null;fail(Error('Dieser Klassenlink ist ungültig oder wurde erneuert.'));return;}
   channel=snap.data() as Channel;emit();
  },fail));
  stops.push(onSnapshot(collection(db,'channels',hash,'lessons'),snap=>{lessons=snap.docs.map(d=>d.data() as Lesson);emit();},fail));
 }else{
  owner();stops.push(watchOwnerCourse(db,access.course,({state,meta})=>{if(!stopped)onChange({course:access.course,role:'admin',state,version:meta.version});},fail));
 }
 return ()=>{stopped=true;stops.forEach(stop=>stop());};
}
