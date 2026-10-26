import {createUserWithEmailAndPassword,sendEmailVerification,sendPasswordResetEmail,signInWithEmailAndPassword,signOut,onAuthStateChanged,reload,type Auth,type User} from 'firebase/auth';

export type AccountResult={ready:boolean,verificationSent:boolean,warning?:string};
export function authErrorMessage(error:unknown){
 const code=(error as {code?:string})?.code;
 const messages:Record<string,string>={
  'auth/invalid-email':'Bitte eine gültige E-Mail-Adresse eingeben.',
  'auth/invalid-credential':'E-Mail-Adresse oder Passwort ist nicht korrekt.',
  'auth/wrong-password':'E-Mail-Adresse oder Passwort ist nicht korrekt.',
  'auth/user-not-found':'E-Mail-Adresse oder Passwort ist nicht korrekt.',
  'auth/email-already-in-use':'Dieses Konto ist bereits angelegt. Bitte über „Anmelden“ mit dem bisherigen Passwort fortfahren oder „Passwort vergessen?“ verwenden.',
  'auth/weak-password':'Bitte ein stärkeres Passwort mit mindestens acht Zeichen wählen.',
  'auth/too-many-requests':'Zu viele Versuche. Bitte einige Minuten warten und erneut versuchen.',
  'auth/network-request-failed':'Die Verbindung zu Firebase ist fehlgeschlagen. Bitte Internetverbindung prüfen und erneut versuchen.',
  'auth/user-disabled':'Dieses Konto ist gesperrt. Bitte die Administration kontaktieren.',
  'auth/operation-not-allowed':'Die Anmeldung mit E-Mail und Passwort ist derzeit nicht freigeschaltet.',
 };
 return code&&messages[code]||'Der Vorgang konnte nicht abgeschlossen werden. Bitte erneut versuchen.';
}

// Unconfirmed users may stay signed in to resend/recheck, but never count as an app session.
export function createAccountAccess(auth:Auth|null,options:{now?:()=>number,sendVerification?:(user:User)=>Promise<void>,continueUrl?:string}={}){
 let manuallyApprovedUid='';const attempts=new Map<string,number>(),now=options.now||Date.now;
 function service(){if(!auth)throw Error('Firebase ist noch nicht eingerichtet.');auth.languageCode='de';return auth;}
 const settings=()=>options.continueUrl?{url:options.continueUrl}:undefined;
 async function refreshAccess(force=false){
  const user=auth?.currentUser;if(!user||user.isAnonymous){manuallyApprovedUid='';return;}
  const {claims}=await user.getIdTokenResult(force);
  if(auth?.currentUser?.uid===user.uid)manuallyApprovedUid=claims.administrator===true&&claims.manualAccessApproved===true?user.uid:'';
 }
 const session=()=>auth?.currentUser&&!auth.currentUser.isAnonymous&&(auth.currentUser.emailVerified||manuallyApprovedUid===auth.currentUser.uid)?auth.currentUser:null;
 const pending=()=>{const user=auth?.currentUser;return user&&!user.isAnonymous&&!session()?{uid:user.uid,email:user.email||''}:null;};
 const cooldown=()=>{const user=auth?.currentUser,attempt=user?attempts.get(user.uid):undefined;return attempt===undefined?0:Math.max(0,Math.ceil((attempt+60000-now())/1000));};
 async function check(){const user=service().currentUser;if(!user||user.isAnonymous)throw Error('Bitte zuerst anmelden.');await reload(user);await refreshAccess(true);return !!session();}
 async function resend():Promise<AccountResult>{
  if(await check())return {ready:true,verificationSent:false};
  const user=service().currentUser!;
  if(cooldown())throw Object.assign(Error('Bitte vor dem nächsten Versand kurz warten.'),{code:'auth/too-many-requests'});
  attempts.set(user.uid,now());
  await (options.sendVerification?options.sendVerification(user):sendEmailVerification(user,settings()));
  return {ready:false,verificationSent:true};
 }
 async function login(email:string,password:string):Promise<AccountResult>{await signInWithEmailAndPassword(service(),email.trim(),password);await refreshAccess(true);return {ready:!!session(),verificationSent:false};}
 async function signup(email:string,password:string):Promise<AccountResult>{
  try{await createUserWithEmailAndPassword(service(),email.trim(),password);}
  catch(e){if((e as {code?:string}).code!=='auth/email-already-in-use')throw e;try{return await login(email,password);}catch{throw Object.assign(Error('Dieses Konto ist bereits angelegt.'),{code:'auth/email-already-in-use'});}}
  try{return await resend();}catch(e){return {ready:false,verificationSent:false,warning:'Dein Konto wurde angelegt, aber die Bestätigungsmail konnte nicht angefordert werden. '+authErrorMessage(e)};}
 }
 return {session,pending,cooldown,login,signup,resend,check,
  ready:async()=>{if(auth){await auth.authStateReady();await refreshAccess();}},
  watch:(fn:()=>void)=>auth?onAuthStateChanged(auth,()=>{refreshAccess().then(fn).catch(()=>{manuallyApprovedUid='';fn();});}):()=>{},
  resetPassword:async(email:string)=>{if(!email.trim())throw Object.assign(Error('Bitte eine E-Mail-Adresse eingeben.'),{code:'auth/invalid-email'});await sendPasswordResetEmail(service(),email.trim(),settings());},
  logout:async()=>{if(auth)await signOut(auth);manuallyApprovedUid='';},
 };
}
